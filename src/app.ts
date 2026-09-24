import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createMcpHandler, type McpHttpHandler, type Server } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { SSEServerTransport } from '@modelcontextprotocol/server-legacy/sse';
import { BridgeManager, type MemoryFactory } from './manager.js';
import { BridgeError, bounded, safeError } from './errors.js';
import { type Limits, type ServerInput, type ConnectionInput } from './config.js';

export interface AppOptions {
  port?: number; host?: string; token?: string; allowedHosts?: string[]; allowedOrigins?: string[]; limits?: Partial<Limits>;
}
interface Session { connectionId: string; transport: SSEServerTransport; server: Server; lastUsed: number; }
function equal(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
async function readBody(request: IncomingMessage): Promise<unknown> {
  if ((request.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() !== 'application/json')
    throw new BridgeError('Expected application/json.', 415);
  if (Number(request.headers['content-length']) > 1024 * 1024) { request.resume(); throw new BridgeError('Request body exceeds 1 MiB.', 413); }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1024 * 1024) throw new BridgeError('Request body exceeds 1 MiB.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new BridgeError('Invalid JSON.'); }
}
export class App {
  private readonly manager: BridgeManager;
  private readonly options: AppOptions;
  private httpServer?: http.Server;
  private readonly handlers = new Map<string, { handler: McpHttpHandler; node: ReturnType<typeof toNodeHandler> }>();
  private readonly sessions = new Map<string, Session>();
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;
  private starting?: Promise<void>;
  private stopping?: Promise<void>;
  private activeRequests = 0;
  private boundPort = 0;
  constructor(options: AppOptions = {}) {
    const port = options.port ?? 3000;
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new BridgeError('Invalid port.');
    const host = options.host ?? '127.0.0.1';
    if (!/^[A-Za-z0-9.:-]+$/.test(host)) throw new BridgeError('Invalid bind host.');
    for (const value of options.allowedHosts ?? []) {
      try { if (!/^(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+)(:[0-9]{1,5})?$/.test(value) || new URL('http://' + value).host !== value) throw new Error(); }
      catch { throw new BridgeError('Invalid allowed Host.'); }
    }
    for (const value of options.allowedOrigins ?? []) {
      try { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) throw new Error(); }
      catch { throw new BridgeError('Invalid allowed Origin.'); }
    }
    this.options = { ...options, port, host };
    this.manager = new BridgeManager(options.limits);
  }
  get port() { return this.boundPort; }
  registerServer(input: ServerInput) { return this.manager.registerServer(input); }
  registerMemoryServer(input: Extract<ServerInput, { transport: 'memory' }>, factory: MemoryFactory) { return this.manager.registerServer(input, factory); }
  getServer(id: string) { return this.manager.getServer(id); }
  listServers() { return this.manager.listServers(); }
  startServer(id: string) { return this.manager.startServer(id); }
  stopServer(id: string) { return this.manager.stopServer(id); }
  updateServer(id: string, patch: unknown) { return this.manager.updateServer(id, patch); }
  updateServerEnvironment(id: string, env: unknown) { return this.manager.updateEnvironment(id, env); }
  async deleteServer(id: string) {
    const connections = this.manager.listConnections().filter(connection => connection.serverId === id);
    await this.manager.deleteServer(id);
    await Promise.all(connections.map(connection => this.releaseHandler(connection.id)));
  }
  createConnection(input: ConnectionInput) { return this.manager.createConnection(input); }
  getConnection(id: string) { return this.manager.getConnection(id); }
  listConnections() { return this.manager.listConnections(); }
  createMcpServer(id: string) { return this.manager.createMcpServer(id); }
  async disconnectConnection(id: string) {
    const result = await this.manager.disconnectConnection(id);
    await this.releaseHandler(id);
    return result;
  }
  async reconnectConnection(id: string) {
    await this.releaseHandler(id);
    return this.manager.reconnectConnection(id);
  }
  async deleteConnection(id: string) {
    await this.manager.deleteConnection(id);
    await this.releaseHandler(id);
  }
  private async releaseHandler(id: string) {
    const handler = this.handlers.get(id);
    this.handlers.delete(id);
    if (handler) await bounded(handler.handler.close(), 7000, 'HTTP handler cleanup timed out.').catch(() => {});
    for (const [sessionId, session] of this.sessions) if (session.connectionId === id) {
      this.sessions.delete(sessionId);
      await bounded(session.server.close(), 7000, 'SSE cleanup timed out.').catch(() => {});
    }
  }
  async start(): Promise<void> {
    if (this.stopped) throw new BridgeError('Create a new App after stopping it.', 409);
    if (this.httpServer?.listening) return;
    if (this.starting) return this.starting;
    this.starting = this.listen();
    try { await this.starting; } finally { this.starting = undefined; }
  }
  private async listen() {
    const token = this.options.token ?? '';
    if (token.length < 32 || token.length > 4096 || /[\r\n]/.test(token))
      throw new BridgeError('HTTP requires a bearer token of 32 to 4096 characters.');
    const server = http.createServer((request, response) => { void this.handle(request, response); });
    this.httpServer = server;
    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;
    server.maxRequestsPerSocket = 1000;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(this.options.port, this.options.host, resolve);
      });
    } catch { this.httpServer = undefined; throw new BridgeError('Could not bind the HTTP listener.', 503); }
    const address = server.address();
    if (!address || typeof address === 'string') throw new BridgeError('Listener address unavailable.', 503);
    this.boundPort = address.port;
    if (this.stopped) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); return; }
    this.timer = setInterval(() => {
      for (const [id, session] of this.sessions) if (Date.now() - session.lastUsed > 600_000) {
        this.sessions.delete(id);
        void bounded(session.server.close(), 7000, 'SSE expiry cleanup timed out.').catch(() => {});
      }
    }, 30_000);
    this.timer.unref();
  }
  private security(request: IncomingMessage) {
    const bindHost = this.options.host!.includes(':') ? '[' + this.options.host + ']' : this.options.host!;
    const localHosts = ['127.0.0.1', 'localhost', '[::1]', bindHost];
    const hosts = new Set([...(this.options.allowedHosts ?? []), ...localHosts.map(host => host + ':' + this.boundPort)]);
    if (this.boundPort === 80) for (const host of localHosts) hosts.add(host);
    for (const name of ['host', 'authorization', 'origin']) {
      let count = 0;
      for (let index = 0; index < request.rawHeaders.length; index += 2) if (request.rawHeaders[index]?.toLowerCase() === name) count++;
      if (count > 1) throw new BridgeError('Duplicate security header.');
    }
    if (!hosts.has(request.headers.host ?? '')) throw new BridgeError('Invalid Host.', 421);
    const origins = new Set([...(this.options.allowedOrigins ?? []), ...[...hosts].map(host => new URL('http://' + host).origin)]);
    if (request.headers.origin && !origins.has(request.headers.origin)) throw new BridgeError('Invalid Origin.', 403);
    if (!equal(request.headers.authorization ?? '', 'Bearer ' + this.options.token))
      throw new BridgeError('Bearer authentication required.', 401);
  }
  private async handle(request: IncomingMessage, response: ServerResponse) {
    const send = (status: number, value?: unknown) => {
      if (response.headersSent) return;
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      response.end(value === undefined ? undefined : JSON.stringify(value));
    };
    let counted = false;
    try {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      this.security(request);
      if (this.stopped) throw new BridgeError('Bridge is stopping.', 503);
      if (this.activeRequests >= 128) throw new BridgeError('Request limit reached.', 503);
      this.activeRequests++; counted = true;
      if (!request.url?.startsWith('/')) throw new BridgeError('Invalid request target.');
      const url = new URL(request.url, 'http://localhost');
      const method = request.method;
      if (method === 'OPTIONS') throw new BridgeError('Cross-origin browser access is not enabled.', 405);
      if (method === 'GET' && url.pathname === '/health') return send(200, { status: 'ok' });
      const mcpMatch = /^\/mcp\/([0-9a-f-]{36})$/.exec(url.pathname);
      if (mcpMatch) {
        const id = mcpMatch[1]!;
        const connection = this.manager.getConnection(id);
        if (!['http', 'stdio'].includes(connection.transport)) throw new BridgeError('Use the configured connection transport.', 409);
        this.manager.connectionCapabilities(id);
        let entry = this.handlers.get(id);
        if (!entry) {
          const handler = createMcpHandler(() => this.manager.createMcpServer(id), { legacy: 'stateless' });
          entry = { handler, node: toNodeHandler(handler) };
          this.handlers.set(id, entry);
        }
        const body = method === 'POST' ? await readBody(request) : undefined;
        return await entry.node(request, response, body);
      }
      const sseMatch = /^\/sse\/([0-9a-f-]{36})$/.exec(url.pathname);
      if (sseMatch && method === 'GET') {
        const id = sseMatch[1]!;
        if (this.manager.getConnection(id).transport !== 'sse') throw new BridgeError('Connection is not configured for legacy SSE.', 409);
        this.manager.connectionCapabilities(id);
        if (this.sessions.size >= 32) throw new BridgeError('SSE session limit reached.', 503);
        const transport = new SSEServerTransport('/messages', response);
        const server = this.manager.createMcpServer(id);
        this.sessions.set(transport.sessionId, { connectionId: id, transport, server, lastUsed: Date.now() });
        response.once('close', () => {
          this.sessions.delete(transport.sessionId);
          void bounded(server.close(), 7000, 'SSE cleanup timed out.').catch(() => {});
        });
        return await server.connect(transport);
      }
      if (url.pathname === '/messages' && method === 'POST') {
        const session = this.sessions.get(url.searchParams.get('sessionId') ?? '');
        if (!session) throw new BridgeError('SSE session not found.', 404);
        this.manager.connectionCapabilities(session.connectionId);
        session.lastUsed = Date.now();
        return await session.transport.handlePostMessage(request, response, await readBody(request));
      }
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'api' || !['servers', 'connections'].includes(parts[1] ?? '') || parts.length > 4)
        throw new BridgeError('Route not found.', 404);
      const group = parts[1], id = parts[2], action = parts[3];
      if (id && !/^[0-9a-f-]{36}$/.test(id)) throw new BridgeError('Route not found.', 404);
      if (!id && group === 'servers') {
        if (method === 'GET') return send(200, { servers: this.listServers() });
        if (method === 'POST') {
          const body = await readBody(request);
          if ((body as { transport?: string } | null)?.transport === 'memory') throw new BridgeError('Register memory servers through the programmatic API.');
          return send(201, this.registerServer(body as ServerInput));
        }
      }
      if (!id && group === 'connections') {
        if (method === 'GET') return send(200, { connections: this.listConnections() });
        if (method === 'POST') {
          const body = await readBody(request);
          if ((body as { transport?: string } | null)?.transport === 'memory') throw new BridgeError('Create memory connections through the programmatic API.');
          return send(201, await this.createConnection(body as ConnectionInput));
        }
      }
      if (id && group === 'servers') {
        if (!action && method === 'GET') return send(200, this.getServer(id));
        if (!action && method === 'PUT') return send(200, await this.updateServer(id, await readBody(request)));
        if (!action && method === 'DELETE') { await this.deleteServer(id); return send(204); }
        if (action === 'start' && method === 'POST') return send(200, await this.startServer(id));
        if (action === 'stop' && method === 'POST') return send(200, await this.stopServer(id));
        if (action === 'environment' && method === 'POST') {
          return send(200, await this.updateServerEnvironment(id, await readBody(request)));
        }
      }
      if (id && group === 'connections') {
        if (!action && method === 'GET') return send(200, this.getConnection(id));
        if (!action && method === 'DELETE') { await this.deleteConnection(id); return send(204); }
        if (action === 'disconnect' && method === 'POST') return send(200, await this.disconnectConnection(id));
        if (action === 'reconnect' && method === 'POST') return send(200, await this.reconnectConnection(id));
      }
      throw new BridgeError('Route or method not found.', 404);
    } catch (error) {
      const safe = safeError(error);
      if (!response.headersSent && safe.status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
      if (!response.headersSent) send(safe.status, { error: { message: safe.message } });
      else response.end();
    } finally { if (counted) this.activeRequests--; }
  }
  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopped = true;
    this.stopping = this.shutdown();
    return this.stopping;
  }
  private async shutdown() {
    await this.starting?.catch(() => {});
    if (this.timer) clearInterval(this.timer);
    await this.manager.close();
    await Promise.all([...this.handlers.keys()].map(id => this.releaseHandler(id)));
    for (const session of this.sessions.values()) await bounded(session.server.close(), 7000, 'SSE cleanup timed out.').catch(() => {});
    this.sessions.clear();
    if (this.httpServer) {
      this.httpServer.closeAllConnections();
      await new Promise<void>(resolve => this.httpServer!.close(() => resolve()));
      this.httpServer = undefined;
    }
  }
}
export function createApp(options: AppOptions = {}): App { return new App(options); }
