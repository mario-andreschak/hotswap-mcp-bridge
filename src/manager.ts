import { randomUUID } from 'node:crypto';
import { Client, SSEClientTransport, StreamableHTTPClientTransport, type RequestOptions, type Transport, type ServerCapabilities } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { Server } from '@modelcontextprotocol/server';
import { ConnectionSchema, EnvironmentSchema, ServerSchema, parse, limits as readLimits, type Limits, type ConnectionInput, type ConnectionConfig, type ServerInput, type ServerConfig } from './config.js';
import { BridgeError, bounded } from './errors.js';
import { createProxy } from './proxy.js';

export type MemoryFactory = (env: Readonly<Record<string, string>>) => Transport | Promise<Transport>;
interface Backend {
  client: Client; transport: Transport; capabilities: ServerCapabilities;
  requests: Set<AbortController>; waiters: Set<() => void>; closed: boolean;
}
interface Entry {
  id: string; config: ServerConfig; status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  current?: Backend; factory?: MemoryFactory; serial: Promise<unknown>; queuedMutations: number;
}
interface Connection {
  id: string; config: ConnectionConfig; status: 'connecting' | 'connected' | 'disconnected';
  controller: AbortController; fronts: Set<Server>;
}
function capabilities(client: Client): ServerCapabilities {
  const source = client.getServerCapabilities() ?? {};
  // No logging, sampling, elicitation, roots, subscriptions, task or list-change claims.
  return { ...(source.tools ? { tools: {} } : {}), ...(source.resources ? { resources: {} } : {}), ...(source.prompts ? { prompts: {} } : {}) };
}
export class BridgeManager {
  private readonly entries = new Map<string, Entry>();
  private readonly connections = new Map<string, Connection>();
  private closed = false;
  readonly limits: Limits;
  constructor(options: Partial<Limits> = {}) { this.limits = readLimits(options); }
  private assertOpen() { if (this.closed) throw new BridgeError('Bridge is stopped.', 409); }
  private entry(id: string) {
    const entry = this.entries.get(id);
    if (!entry) throw new BridgeError('Server not found.', 404);
    return entry;
  }
  private connection(id: string) {
    const connection = this.connections.get(id);
    if (!connection) throw new BridgeError('Connection not found.', 404);
    return connection;
  }
  registerServer(input: ServerInput, factory?: MemoryFactory) {
    this.assertOpen();
    const config = parse(ServerSchema, input, 'server configuration');
    if (config.transport === 'memory' && !factory) throw new BridgeError('Memory servers require a programmatic transport factory.');
    if (this.entries.size >= this.limits.servers) throw new BridgeError('Server limit reached.', 503);
    const id = config.id ?? randomUUID();
    if (this.entries.has(id)) throw new BridgeError('Server already exists.', 409);
    this.entries.set(id, { id, config: { ...config, id }, factory, status: 'stopped', serial: Promise.resolve(), queuedMutations: 0 });
    return this.getServer(id);
  }
  getServer(id: string) {
    const entry = this.entry(id);
    return { id, name: entry.config.name, version: entry.config.version, transport: entry.config.transport, status: entry.status,
      environmentKeys: 'env' in entry.config ? Object.keys(entry.config.env).sort() : [],
      headerNames: 'headers' in entry.config ? Object.keys(entry.config.headers).sort() : [] };
  }
  listServers() { return [...this.entries.keys()].map(id => this.getServer(id)); }
  private async mutate<T>(entry: Entry, action: () => Promise<T>, force = false): Promise<T> {
    if (!force && entry.queuedMutations >= 8) throw new BridgeError('Server mutation queue is full.', 503);
    entry.queuedMutations++;
    const operation = entry.serial.then(() => {
      if (this.entries.get(entry.id) !== entry) throw new BridgeError('Server not found.', 404);
      return action();
    });
    entry.serial = operation.catch(() => {});
    try { return await operation; } finally { entry.queuedMutations--; }
  }
  private async open(config: ServerConfig, entry: Entry): Promise<Backend> {
    let transport: Transport;
    if (config.transport === 'stdio') {
      const stdio = new StdioClientTransport({ command: config.command, args: config.args, cwd: config.cwd, env: config.env, stderr: 'pipe' });
      // Drain child stderr without exposing its payload or blocking its output pipe.
      stdio.stderr?.on('data', () => {});
      transport = stdio;
    } else if (config.transport === 'memory') {
      const created = Promise.resolve().then(() => entry.factory!({ ...config.env }));
      try { transport = await bounded(created, this.limits.startupMs, 'Memory transport startup timed out.'); }
      catch {
        void created.then(value => bounded(value.close(), 7000, 'Cleanup timed out.')).catch(() => {});
        throw new BridgeError('Memory transport could not start.', 502);
      }
    } else if (config.transport === 'http') {
      transport = new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.headers, redirect: 'error' },
        reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 } });
    } else {
      transport = new SSEClientTransport(new URL(config.url), { requestInit: { headers: config.headers, redirect: 'error' },
        fetch: (input, init) => fetch(input, { ...init, redirect: 'error' }) });
    }
    const client = new Client({ name: 'mcp-transport-bridge', version: '0.2.0' }, {
      capabilities: {}, versionNegotiation: { mode: config.transport === 'sse' ? 'legacy' : 'auto', probe: { timeoutMs: this.limits.startupMs, maxRetries: 0 } },
    });
    const backend: Backend = { client, transport, capabilities: {}, requests: new Set(), waiters: new Set(), closed: false };
    client.onerror = () => {};
    client.onclose = () => {
      backend.closed = true;
      if (entry.current === backend) { entry.current = undefined; entry.status = 'error'; }
    };
    try {
      await bounded(client.connect(transport), this.limits.startupMs, 'Downstream server startup timed out.');
      // Readiness uses a real request on the live transport (negotiation can use a probe sibling).
      // It also consumes id 0, whose cancellation SDK 2.0.0 servers ignore.
      if (client.getProtocolEra() === 'modern') await client.discover({ timeout: this.limits.startupMs });
      else await client.ping({ timeout: this.limits.startupMs });
      if (backend.closed) throw new BridgeError('Downstream closed during startup.', 502);
      backend.capabilities = capabilities(client);
      return backend;
    } catch {
      await this.dispose(backend);
      throw new BridgeError('Downstream server could not start or negotiate MCP.', 502);
    }
  }
  private async dispose(backend: Backend) {
    for (const controller of backend.requests) controller.abort();
    await bounded(backend.client.close().catch(() => {}), 7000, 'Downstream cleanup timed out.').catch(() => {});
    await bounded(backend.transport.close().catch(() => {}), 7000, 'Transport cleanup timed out.').catch(() => {});
  }
  private async retire(backend: Backend) {
    if (backend.requests.size) {
      let waiter: (() => void) | undefined;
      const idle = new Promise<void>(resolve => { waiter = resolve; backend.waiters.add(resolve); });
      await bounded(idle, this.limits.drainMs, 'Drain timed out.').catch(() => {});
      if (waiter) backend.waiters.delete(waiter);
    }
    await this.dispose(backend);
  }
  async startServer(id: string) {
    this.assertOpen();
    const entry = this.entry(id);
    await this.mutate(entry, async () => {
      this.assertOpen();
      if (entry.current) return;
      entry.status = 'starting';
      try {
        const candidate = await this.open(entry.config, entry);
        if (this.closed) { await this.dispose(candidate); throw new BridgeError('Bridge is stopped.', 409); }
        entry.current = candidate;
        entry.status = 'running';
      } catch (error) { entry.status = this.closed ? 'stopped' : 'error'; throw error; }
    });
    return this.getServer(id);
  }
  async stopServer(id: string, force = false) {
    const entry = this.entry(id);
    await this.mutate(entry, async () => {
      const previous = entry.current;
      entry.current = undefined;
      entry.status = 'stopping';
      if (previous) await this.dispose(previous);
      entry.status = 'stopped';
    }, force);
    return this.getServer(id);
  }
  async updateServer(id: string, patch: unknown) {
    this.assertOpen();
    const entry = this.entry(id);
    await this.mutate(entry, async () => {
      this.assertOpen();
      if (entry.current || entry.status === 'starting') throw new BridgeError('Stop the server before changing its configuration; use the environment endpoint for a live swap.', 409);
      if (!patch || typeof patch !== 'object' || Array.isArray(patch) || 'id' in patch || 'transport' in patch) throw new BridgeError('Invalid server update.');
      entry.config = parse(ServerSchema, { ...entry.config, ...patch }, 'server configuration');
    });
    return this.getServer(id);
  }
  async updateEnvironment(id: string, input: unknown) {
    this.assertOpen();
    const patch = parse(EnvironmentSchema, input, 'environment');
    const entry = this.entry(id);
    await this.mutate(entry, async () => {
      this.assertOpen();
      if (!('env' in entry.config)) throw new BridgeError('Environment updates apply only to stdio and memory servers.');
      const config = parse(ServerSchema, { ...entry.config, env: { ...entry.config.env, ...patch } }, 'server configuration');
      const previous = entry.current;
      if (!previous) { entry.config = config; return; }
      const candidate = await this.open(config, entry);
      if (this.closed || entry.current !== previous || JSON.stringify(candidate.capabilities) !== JSON.stringify(previous.capabilities)) {
        await this.dispose(candidate);
        throw new BridgeError('Replacement could not preserve the active server capabilities. Existing configuration was retained.', 409);
      }
      // Commit only after successful negotiation. Existing requests keep their old backend lease.
      entry.current = candidate;
      entry.config = config;
      entry.status = 'running';
      await this.retire(previous);
    });
    return this.getServer(id);
  }
  async deleteServer(id: string) {
    this.assertOpen();
    const entry = this.entry(id);
    await this.mutate(entry, async () => {
      this.assertOpen();
      const previous = entry.current;
      entry.current = undefined;
      entry.status = 'stopping';
      if (previous) await this.dispose(previous);
      for (const connection of [...this.connections.values()]) if (connection.config.serverId === id) await this.deleteConnection(connection.id);
      this.entries.delete(id);
    });
  }
  async createConnection(input: ConnectionInput) {
    this.assertOpen();
    const config = parse(ConnectionSchema, input, 'connection configuration');
    this.entry(config.serverId);
    if (this.connections.size >= this.limits.connections) throw new BridgeError('Connection limit reached.', 503);
    const id = randomUUID();
    this.connections.set(id, { id, config, status: 'connecting', controller: new AbortController(), fronts: new Set() });
    try {
      await this.startServer(config.serverId);
      this.assertOpen();
      this.connection(id).status = 'connected';
      return this.getConnection(id);
    } catch (error) { this.connections.delete(id); throw error; }
  }
  getConnection(id: string) {
    const connection = this.connection(id);
    return { id, ...connection.config, status: connection.status,
      ...(connection.config.transport === 'sse' ? { ssePath: '/sse/' + id } :
        connection.config.transport !== 'memory' ? { mcpPath: '/mcp/' + id } : {}) };
  }
  listConnections() { return [...this.connections.keys()].map(id => this.getConnection(id)); }
  async disconnectConnection(id: string) {
    const connection = this.connection(id);
    connection.status = 'disconnected';
    connection.controller.abort();
    await Promise.all([...connection.fronts].map(server => bounded(server.close(), 7000, 'Front-end cleanup timed out.').catch(() => {})));
    return this.getConnection(id);
  }
  async reconnectConnection(id: string) {
    this.assertOpen();
    const connection = this.connection(id);
    await this.disconnectConnection(id);
    await this.startServer(connection.config.serverId);
    this.assertOpen();
    if (this.connections.get(id) !== connection) throw new BridgeError('Connection not found.', 404);
    connection.controller = new AbortController();
    connection.status = 'connected';
    return this.getConnection(id);
  }
  async deleteConnection(id: string) { await this.disconnectConnection(id); this.connections.delete(id); }
  connectionCapabilities(id: string) {
    this.assertOpen();
    const connection = this.connection(id);
    if (connection.status !== 'connected') throw new BridgeError('Connection is disconnected.', 409);
    const backend = this.entry(connection.config.serverId).current;
    if (!backend) throw new BridgeError('Server is not running.', 409);
    return backend.capabilities;
  }
  trackFront(id: string, server: Server) {
    const connection = this.connection(id);
    connection.fronts.add(server);
    server.onclose = () => { connection.fronts.delete(server); };
  }
  createMcpServer(id: string): Server { return createProxy(this, id); }
  async request<T>(id: string, signal: AbortSignal, call: (client: Client, options: RequestOptions) => Promise<T>): Promise<T> {
    this.connectionCapabilities(id);
    const connection = this.connection(id);
    const backend = this.entry(connection.config.serverId).current!;
    if (backend.requests.size >= this.limits.requestsPerServer) throw new BridgeError('Downstream request limit reached.', 503);
    const controller = new AbortController();
    backend.requests.add(controller);
    try {
      const combined = AbortSignal.any([signal, connection.controller.signal, controller.signal, AbortSignal.timeout(this.limits.requestMs)]);
      combined.throwIfAborted();
      return await call(backend.client, { signal: combined, timeout: this.limits.requestMs, maxTotalTimeout: this.limits.requestMs, resetTimeoutOnProgress: false });
    } catch { throw new BridgeError('Downstream request failed, was cancelled, or timed out.', 502); }
    finally {
      backend.requests.delete(controller);
      if (!backend.requests.size) { for (const waiter of backend.waiters) waiter(); backend.waiters.clear(); }
    }
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    await Promise.allSettled([...this.connections.keys()].map(id => this.disconnectConnection(id)));
    await Promise.allSettled([...this.entries.keys()].map(id => this.stopServer(id, true)));
    this.connections.clear();
    this.entries.clear();
  }
}
