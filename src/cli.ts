#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createApp } from './app.js';
import { BridgeManager } from './manager.js';
import { BridgeError, safeError } from './errors.js';

export async function runCli(args = process.argv.slice(2), env: Record<string, string | undefined> = process.env) {
  const { values } = parseArgs({ args, options: {
    url: { type: 'string' }, transport: { type: 'string' }, host: { type: 'string' }, port: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    process.stderr.write('mcp-transport-bridge [--host 127.0.0.1] [--port 3000]\n' +
      'mcp-transport-bridge --url HTTP_MCP_URL [--transport http|sse]\n' +
      'Set MCP_BRIDGE_TOKEN in the environment. HTTP serving requires at least 32 characters.\n');
    return;
  }
  let shutdown: () => Promise<void>;
  if (values.url) {
    const transport = values.transport ?? 'http';
    if (transport !== 'http' && transport !== 'sse') throw new BridgeError('Remote transport must be http or explicit legacy sse.');
    const manager = new BridgeManager();
    try {
      const server = manager.registerServer({ name: 'Remote MCP', transport, url: values.url,
        headers: env.MCP_BRIDGE_TOKEN ? { Authorization: 'Bearer ' + env.MCP_BRIDGE_TOKEN } : {} });
      const connection = await manager.createConnection({ serverId: server.id, transport: 'stdio' });
      const handle = serveStdio(() => manager.createMcpServer(connection.id), {
        onerror: () => { process.stderr.write('MCP transport error.\n'); },
      });
      shutdown = async () => { await handle.close(); await manager.close(); };
      process.stdin.once('end', () => { void close(); });
    } catch (error) { await manager.close(); throw error; }
  } else {
    if (values.transport) throw new BridgeError('--transport requires --url.');
    const app = createApp({ host: values.host ?? env.HOST ?? '127.0.0.1', port: Number(values.port ?? env.PORT ?? '3000'),
      token: env.MCP_BRIDGE_TOKEN, allowedHosts: env.MCP_BRIDGE_ALLOWED_HOSTS?.split(',').filter(Boolean),
      allowedOrigins: env.MCP_BRIDGE_ALLOWED_ORIGINS?.split(',').filter(Boolean) });
    await app.start();
    shutdown = () => app.stop();
    process.stderr.write('MCP bridge listening on port ' + app.port + '.\n');
  }
  let closing: Promise<void> | undefined;
  const close = () => closing ??= shutdown();
  process.once('SIGINT', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
}
let isMain = false;
try { isMain = !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch {}
if (isMain) {
  runCli().catch(error => {
    process.stderr.write(safeError(error).message + '\n');
    process.exitCode = 1;
  });
}
