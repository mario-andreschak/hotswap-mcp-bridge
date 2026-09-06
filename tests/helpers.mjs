import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport, SSEClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
export const TOKEN = 'SENTINEL_ADMIN_TOKEN_0123456789_abcdefghij';
export const modern = { pin: '2026-07-28' };
export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export const cleanEnv = extra => ({ ...(process.env.PATH ? { PATH: process.env.PATH } : {}), ...extra });
export async function api(base, path, { method = 'GET', body, headers = {}, token = TOKEN } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}),
    ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null, text };
}
export async function connectHttp(url, mode = modern) {
  const client = new Client({ name: 'bridge-test', version: '1.0.0' }, { versionNegotiation: { mode } });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: 'Bearer ' + TOKEN } } });
  try { await client.connect(transport); return client; } catch (error) { await transport.close(); throw error; }
}
export async function connectSse(url) {
  const client = new Client({ name: 'sse-test', version: '1.0.0' }, { versionNegotiation: { mode: 'legacy' } });
  const transport = new SSEClientTransport(new URL(url), { authProvider: { token: async () => TOKEN } });
  try { await client.connect(transport); return client; } catch (error) { await transport.close(); throw error; }
}
export async function connectStdio(command, args, mode = modern, cwd) {
  const client = new Client({ name: 'stdio-test', version: '1.0.0' }, { versionNegotiation: { mode } });
  const transport = new StdioClientTransport({ command, args, cwd, env: cleanEnv({ MCP_BRIDGE_TOKEN: TOKEN }), stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', data => { stderr += data; });
  try {
    await client.connect(transport);
    return { client, stderr: () => stderr };
  } catch (error) { await transport.close(); throw new Error(error.message + ' | child stderr: ' + stderr, { cause: error }); }
}
export async function echo(client, label = '', delayMs = 0, options) {
  const result = await client.callTool({ name: 'echo', arguments: { label, delayMs } }, options);
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return JSON.parse(result.content[0].text);
}
export async function gone(pid) {
  for (let count = 0; count < 200; count++) {
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
    await wait(10);
  }
  throw new Error('Owned fixture child did not exit: ' + pid);
}
export async function raw(base, path, message, modernWire = true) {
  const response = await fetch(base + path, { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN,
    'content-type': 'application/json', accept: 'application/json, text/event-stream',
    ...(modernWire ? { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': message.method,
      ...(message.params?.name ? { 'Mcp-Name': message.params.name } : {}) } : {}) },
    body: JSON.stringify(message) });
  const text = await response.text();
  if (response.headers.get('content-type')?.includes('application/json')) return { status: response.status, data: JSON.parse(text) };
  const data = text.split('\n').find(line => line.startsWith('data:'));
  return { status: response.status, data: data ? JSON.parse(data.slice(5)) : text };
}
export function callMessage(label, delayMs = 0) {
  return { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'echo', arguments: { label, delayMs },
    _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } } };
}
