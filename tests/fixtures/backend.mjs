import { Server, InMemoryTransport } from '@modelcontextprotocol/server';
import { StdioServerTransport, serveStdio } from '@modelcontextprotocol/server/stdio';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function createFixture(env = {}, state = { aborted: 0 }) {
  const capabilities = env.NO_TOOLS === '1' ? {} : { tools: {}, resources: {}, prompts: {} };
  const server = new Server({ name: 'bridge-fixture', version: '1.0.0' }, { capabilities });
  if (capabilities.tools) {
    server.setRequestHandler('tools/list', () => ({ tools: [{ name: 'echo', description: 'Local test fixture',
      inputSchema: { type: 'object', properties: { label: { type: 'string' }, delayMs: { type: 'number' } }, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false } }] }));
    server.setRequestHandler('tools/call', async (request, context) => {
      const { label = '', delayMs = 0 } = request.params.arguments ?? {};
      if (delayMs) state.started = (state.started ?? 0) + 1;
      if (delayMs) await new Promise((resolve, reject) => {
        const finish = () => { context.mcpReq.signal.removeEventListener('abort', cancel); resolve(); };
        const timer = setTimeout(finish, Math.min(Number(delayMs), 10_000));
        const cancel = () => { clearTimeout(timer); state.aborted++; reject(new Error('cancelled fixture')); };
        context.mcpReq.signal.addEventListener('abort', cancel, { once: true });
        if (context.mcpReq.signal.aborted) cancel();
      });
      return { content: [{ type: 'text', text: JSON.stringify({
        label, value: env.VALUE ?? 'initial', pid: process.pid, aborted: state.aborted, started: state.started ?? 0, inheritedAdminToken: !!env.MCP_BRIDGE_TOKEN,
      }) }] };
    });
    server.setRequestHandler('resources/list', () => ({ resources: [{ name: 'value', uri: 'fixture://value' }] }));
    server.setRequestHandler('resources/templates/list', () => ({ resourceTemplates: [] }));
    server.setRequestHandler('resources/read', request => ({ contents: [{ uri: request.params.uri, text: env.VALUE ?? 'initial' }] }));
    server.setRequestHandler('prompts/list', () => ({ prompts: [{ name: 'greet', arguments: [{ name: 'name', required: true }] }] }));
    server.setRequestHandler('prompts/get', request => ({ messages: [{ role: 'user',
      content: { type: 'text', text: 'Hello ' + (request.params.arguments?.name ?? '') } }] }));
  }
  return server;
}
export async function memoryFactory(env) {
  const [client, downstream] = InMemoryTransport.createLinkedPair();
  const server = createFixture(env);
  await server.connect(downstream);
  return client;
}
let main = false;
try { main = realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch {}
if (main) {
  if (process.env.FAIL_START === '1') {
    process.stderr.write('SENTINEL_SECRET_FAILED_CHILD\n');
    process.exit(7);
  }
  if (process.env.STARTUP_HANG === '1') setInterval(() => {}, 1000);
  else {
    if (process.env.NOISY === '1') process.stderr.write('SENTINEL_SECRET_CHILD_STDERR\n');
    let close;
    if (process.env.LEGACY_ONLY === '1') {
      const server = createFixture(process.env);
      await server.connect(new StdioServerTransport());
      close = () => server.close();
    } else {
      const state = { aborted: 0 };
      const handle = serveStdio(() => createFixture(process.env, state));
      close = () => handle.close();
    }
    process.stdin.once('end', () => { void close(); });
    process.once('SIGTERM', () => { void close(); });
    process.once('SIGINT', () => { void close(); });
  }
}
