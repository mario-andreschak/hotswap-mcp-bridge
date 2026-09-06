import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createApp } from '../dist/index.js';
import { memoryFactory } from './fixtures/backend.mjs';
import { TOKEN, modern, api, connectHttp, connectSse, connectStdio, echo, wait, gone, raw, callMessage } from './helpers.mjs';
const fixture = resolve('tests/fixtures/backend.mjs');

async function setup(env = {}, options = {}) {
  const app = createApp({ port: 0, token: TOKEN, ...options });
  await app.start();
  const base = 'http://127.0.0.1:' + app.port;
  try {
  const registered = await api(base, '/api/servers', { method: 'POST', body: {
    name: 'fixture', transport: 'stdio', command: process.execPath, args: [fixture], env,
  } });
  assert.equal(registered.status, 201);
  const serverId = registered.body.id;
  const connected = await api(base, '/api/connections', { method: 'POST', body: { serverId, transport: 'http' } });
  assert.equal(connected.status, 201, connected.text);
  return { app, base, serverId, connectionId: connected.body.id, path: connected.body.mcpPath };
  } catch(error) { await app.stop(); throw error; }
}

test('HTTP cannot start without an admin token, and bind failures reject', async () => {
  const missing = createApp({ port: 0 });
  await assert.rejects(missing.start(), /bearer token/);
  await missing.stop();
  const app = createApp({ port: 0, token: TOKEN });
  await app.start();
  const occupied = createApp({ port: app.port, token: TOKEN });
  try { await assert.rejects(occupied.start(), /bind/); }
  finally { await occupied.stop(); await app.stop(); }
});

test('all routes enforce bearer, exact Host/Origin, bounds, and redacted metadata', async () => {
  const state = await setup({ VALUE: 'SENTINEL_SECRET_ENV', NOISY: '1' });
  try {
    for (const [path, method, body] of [
      ['/health', 'GET'], ['/api/servers', 'GET'], ['/api/servers', 'POST', {}],
      ['/api/servers/' + state.serverId + '/environment', 'POST', { VALUE: 'changed' }],
      ['/api/connections', 'GET'], [state.path, 'POST', callMessage('unauthorized')],
      ['/sse/' + state.connectionId, 'GET'], ['/messages?sessionId=missing', 'POST', {}],
    ]) assert.equal((await api(state.base, path, { method, body, token: '' })).status, 401, path);
    assert.equal((await api(state.base, '/api/servers', { headers: { origin: 'https://attacker.example' } })).status, 403);
    const rejectedHost = await new Promise((resolve, reject) => {
      const request = httpRequest(state.base + '/api/servers', { headers: { host: 'attacker.example', authorization: 'Bearer ' + TOKEN } }, response => {
        response.resume(); response.once('end', () => resolve(response.statusCode));
      });
      request.on('error', reject); request.end();
    });
    assert.equal(rejectedHost, 421);
    const listing = await api(state.base, '/api/servers');
    const detail = await api(state.base, '/api/servers/' + state.serverId);
    for (const result of [listing, detail]) {
      assert.equal(result.status, 200);
      assert.doesNotMatch(result.text, /SENTINEL_SECRET_ENV|SENTINEL_SECRET_CHILD_STDERR|SENTINEL_ADMIN_TOKEN/);
      assert.doesNotMatch(result.text, /backend.mjs/);
      assert.equal(result.headers.get('access-control-allow-origin'), null);
      assert.equal(result.headers.get('cache-control'), 'no-store');
    }
    assert.deepEqual(detail.body.environmentKeys, ['NOISY', 'VALUE']);
    const bad = await api(state.base, '/api/servers', { method: 'POST', body: { name: 'bad', transport: 'stdio', command: 42, env: { SECRET: TOKEN } } });
    assert.equal(bad.status, 400);
    assert.doesNotMatch(bad.text, /SENTINEL|42/);
    const client = await connectHttp(state.base + state.path);
    try { assert.equal((await echo(client)).inheritedAdminToken, false); } finally { await client.close(); }
  } finally { await state.app.stop(); }
});

for (const mode of [modern, 'legacy']) {
  test('actual stdio child tools/resources/prompts over HTTP: ' + JSON.stringify(mode), async () => {
    const state = await setup({ VALUE: 'wire-value', ...(mode === 'legacy' ? { LEGACY_ONLY: '1' } : {}) });
    const client = await connectHttp(state.base + state.path, mode);
    try {
      assert.equal(client.getProtocolEra(), mode === 'legacy' ? 'legacy' : 'modern');
      if (mode !== 'legacy') {
        await client.discover();
        assert.equal(client.getNegotiatedProtocolVersion(), '2026-07-28');
      }
      assert.deepEqual(Object.keys(client.getServerCapabilities()).sort(), ['prompts', 'resources', 'tools']);
      assert.equal((await client.listTools()).tools[0].name, 'echo');
      assert.equal((await echo(client, 'hello')).label, 'hello');
      assert.equal((await client.listResources()).resources[0].uri, 'fixture://value');
      assert.equal((await client.readResource({ uri: 'fixture://value' })).contents[0].text, 'wire-value');
      assert.equal((await client.listPrompts()).prompts[0].name, 'greet');
      assert.equal((await client.getPrompt({ name: 'greet', arguments: { name: 'Ada' } })).messages[0].content.text, 'Hello Ada');
    } finally { await client.close(); await state.app.stop(); }
  });
}

test('raw modern/legacy requests and concurrent identical ids remain isolated', async () => {
  const state = await setup();
  try {
    const initialize = await raw(state.base, state.path, { jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw-legacy', version: '1' } } }, false);
    assert.equal(initialize.status, 200);
    assert.equal(initialize.data.id, 1);
    const [slow, fast] = await Promise.all([
      raw(state.base, state.path, callMessage('slow', 150)),
      raw(state.base, state.path, callMessage('fast')),
    ]);
    for (const [response, label] of [[slow, 'slow'], [fast, 'fast']]) {
      assert.equal(response.status, 200, JSON.stringify(response));
      assert.equal(response.data.id, 7);
      assert.equal(JSON.parse(response.data.result.content[0].text).label, label);
    }
  } finally { await state.app.stop(); }
});

test('environment swap is atomic, drains old requests, and failure retains the old child/configuration', { timeout: 20_000 }, async () => {
  const state = await setup({ VALUE: 'SENTINEL_VALUE_V1' });
  const client = await connectHttp(state.base + state.path);
  try {
    const original = await echo(client);
    let oldFinished = false;
    const old = echo(client, 'old request', 3000).then(value => { oldFinished = true; return value; });
    await wait(100);
    const swapping = api(state.base, '/api/servers/' + state.serverId + '/environment', { method: 'POST', body: { VALUE: 'SENTINEL_VALUE_V2' } });
    let current;
    for (let count = 0; count < 150; count++) {
      current = await echo(client, 'new request');
      if (current.value === 'SENTINEL_VALUE_V2') break;
      await wait(10);
    }
    assert.equal(current.value, 'SENTINEL_VALUE_V2');
    assert.equal(oldFinished, false, 'new requests use the replacement while the previous child drains');
    assert.notEqual(current.pid, original.pid);
    assert.equal((await old).value, 'SENTINEL_VALUE_V1');
    const swapped = await swapping;
    assert.equal(swapped.status, 200);
    assert.doesNotMatch(swapped.text, /SENTINEL_VALUE/);
    await gone(original.pid);
    assert.equal((await api(state.base, '/api/connections/' + state.connectionId)).body.mcpPath, state.path);

    const failed = await api(state.base, '/api/servers/' + state.serverId + '/environment', { method: 'POST', body: { FAIL_START: '1', VALUE: 'MUST_NOT_COMMIT' } });
    assert.equal(failed.status, 502);
    assert.doesNotMatch(failed.text, /SENTINEL|MUST_NOT_COMMIT/);
    assert.equal((await echo(client)).pid, current.pid);
    assert.equal((await echo(client)).value, 'SENTINEL_VALUE_V2');
    assert.ok(!(await api(state.base, '/api/servers/' + state.serverId)).body.environmentKeys.includes('FAIL_START'));
    const next = await api(state.base, '/api/servers/' + state.serverId + '/environment', { method: 'POST', body: { VALUE: 'V3' } });
    assert.equal(next.status, 200, next.text);
    assert.equal((await echo(client)).value, 'V3');
  } finally { await client.close(); await state.app.stop(); }
});

test('stop does not restart children and reconnect preserves the connection id', async () => {
  const state = await setup();
  const client = await connectHttp(state.base + state.path);
  try {
    const { pid } = await echo(client);
    assert.equal((await api(state.base, '/api/servers/' + state.serverId + '/stop', { method: 'POST' })).body.status, 'stopped');
    await gone(pid);
    await assert.rejects(echo(client));
    await wait(100);
    assert.equal((await api(state.base, '/api/servers/' + state.serverId)).body.status, 'stopped');
    const reconnect = await api(state.base, '/api/connections/' + state.connectionId + '/reconnect', { method: 'POST' });
    assert.equal(reconnect.body.id, state.connectionId);
    assert.notEqual((await echo(client)).pid, pid);
    assert.equal((await api(state.base, '/api/servers/' + state.serverId, { method: 'DELETE' })).status, 204);
    assert.equal((await api(state.base, '/api/connections/' + state.connectionId)).status, 404);
  } finally { await client.close(); await state.app.stop(); }
});

test('deadlines cancel real child requests and request limits remain usable', async () => {
  const state = await setup({}, { limits: { requestMs: 100, requestsPerServer: 1 } });
  const client = await connectHttp(state.base + state.path);
  try {
    const result = await client.callTool({ name: 'echo', arguments: { label: 'slow', delayMs: 1000 } });
    assert.equal(result.isError, true);
    await wait(30);
    const after = await echo(client);
    assert.ok(after.aborted >= 1);
    const slow = client.callTool({ name: 'echo', arguments: { delayMs: 1000 } });
    await wait(15);
    const limited = await client.callTool({ name: 'echo', arguments: {} });
    assert.equal(limited.isError, true);
    await slow;
  } finally { await client.close(); await state.app.stop(); }
});

test('explicit legacy SSE and the HTTP/SSE-to-stdio CLI work with the same child', async () => {
  const state = await setup({ NOISY: '1' });
  const sseConnection = await api(state.base, '/api/connections', { method: 'POST', body: { serverId: state.serverId, transport: 'sse' } });
  try {
    const sse = await connectSse(state.base + sseConnection.body.ssePath);
    try { assert.equal((await echo(sse, 'legacy SSE')).label, 'legacy SSE'); } finally { await sse.close(); }
    for (const [path, transport] of [[state.path, 'http'], [sseConnection.body.ssePath, 'sse']]) {
      for (const mode of [modern, 'legacy']) {
        const proxy = await connectStdio(process.execPath, [resolve('dist/cli.js'), '--url', state.base + path, '--transport', transport], mode);
        try {
          assert.equal(proxy.client.getProtocolEra(), mode === 'legacy' ? 'legacy' : 'modern');
          assert.equal((await echo(proxy.client, 'stdio launcher')).label, 'stdio launcher');
          assert.doesNotMatch(proxy.stderr(), /SENTINEL/);
          assert.equal(proxy.stderr(), '');
        } finally { await proxy.client.close(); }
      }
    }
  } finally { await state.app.stop(); }
});

test('programmatic memory transports support modern serving and environment swaps', async () => {
  const app = createApp();
  const backend = app.registerMemoryServer({ name: 'memory', transport: 'memory', env: { VALUE: 'before' } }, memoryFactory);
  const connection = await app.createConnection({ serverId: backend.id, transport: 'memory' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => app.createMcpServer(connection.id), { transport: serverTransport });
  const client = new Client({ name: 'memory-client', version: '1' }, { versionNegotiation: { mode: modern } });
  try {
    await client.connect(clientTransport);
    assert.equal((await echo(client)).value, 'before');
    await app.updateServerEnvironment(backend.id, { VALUE: 'after' });
    assert.equal((await echo(client)).value, 'after');
    await assert.rejects(app.updateServerEnvironment(backend.id, { NO_TOOLS: '1' }), /capabilities/);
    assert.equal((await echo(client)).value, 'after');
  } finally { await client.close(); await handle.close(); await app.stop(); }
});

test('startup shutdown races and late memory factories are cleaned up', async () => {
  const app = createApp({ limits: { startupMs: 100 } });
  const server = app.registerServer({ name: 'hang', transport: 'stdio', command: process.execPath, args: [fixture], env: { STARTUP_HANG: '1' } });
  const starting = app.startServer(server.id).catch(error => error);
  await wait(10);
  await app.stop();
  assert.ok(await starting instanceof Error);
  await assert.rejects(app.startServer(server.id), /stopped/);
  let closed = false;
  const memory = createApp({ limits: { startupMs: 5 } });
  const late = memory.registerMemoryServer({ name: 'late', transport: 'memory' }, async () => {
    await wait(30);
    return { start: async () => {}, send: async () => {}, close: async () => { closed = true; } };
  });
  try {
    await assert.rejects(memory.startServer(late.id), /could not start/);
    await wait(60);
    assert.equal(closed, true);
  } finally { await memory.stop(); }
});

test('request body bounds and explicit proxy Host/Origin policy', async () => {
  const app = createApp({ port: 0, token: TOKEN, allowedHosts: ['bridge.example.com', '[::1]:4321'],
    allowedOrigins: ['https://console.example.com'] });
  await app.start();
  const base = 'http://127.0.0.1:' + app.port;
  try {
    const oversized = await api(base, '/api/servers', { method: 'POST', body: { value: 'x'.repeat(1024 * 1024) } });
    assert.equal(oversized.status, 413);
    const invalid = await fetch(base + '/api/servers', { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: '{' });
    assert.equal(invalid.status, 400);
    await invalid.text();
    const wrongType = await fetch(base + '/api/servers', { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(wrongType.status, 415); await wrongType.text();
    assert.equal((await api(base, '/health', { method: 'OPTIONS' })).status, 405);
    const approved = await new Promise((resolve, reject) => {
      const request = httpRequest(base + '/health', { headers: { host: 'bridge.example.com',
        origin: 'https://console.example.com', authorization: 'Bearer ' + TOKEN } }, response => {
        response.resume(); response.once('end', () => resolve(response.statusCode));
      });
      request.on('error', reject); request.end();
    });
    assert.equal(approved, 200);
    const duplicate = await new Promise((resolve, reject) => {
      const request = httpRequest(base + '/health', { headers: { authorization: ['Bearer ' + TOKEN, 'Bearer ' + TOKEN] } }, response => {
        response.resume(); response.once('end', () => resolve(response.statusCode));
      });
      request.on('error', reject); request.end();
    });
    assert.equal(duplicate, 400);
  } finally { await app.stop(); }
});

test('upstream cancellation reaches a real child and frees its request slot', async () => {
  const state = await setup({}, { limits: { requestsPerServer: 1 } });
  const client = await connectHttp(state.base + state.path);
  const controller = new AbortController();
  try {
    const slow = client.callTool({ name: 'echo', arguments: { delayMs: 5000 } }, { signal: controller.signal });
    const rejected = assert.rejects(slow);
    await wait(100);
    controller.abort();
    await rejected;
    await wait(100);
    const after = await echo(client);
    assert.ok(after.aborted >= 1);
  } finally { await client.close(); await state.app.stop(); }
});

test('stdio cancellation includes the first forwarded request with JSON-RPC id zero', async () => {
  const state = await setup();
  const observer = await connectHttp(state.base + state.path);
  const proxy = await connectStdio(process.execPath, [resolve('dist/cli.js'), '--url', state.base + state.path], modern);
  const controller = new AbortController();
  try {
    // Negotiation uses a disposable sibling; this is request id 0 on the live CLI transport.
    const slow = proxy.client.callTool({ name: 'echo', arguments: { delayMs: 5000 } }, { signal: controller.signal });
    const rejected = assert.rejects(slow);
    let started = false;
    for (let count = 0; count < 100; count++) {
      if ((await echo(observer)).started >= 1) { started = true; break; }
      await wait(25);
    }
    assert.ok(started, 'The first CLI request reached the child before cancellation');
    controller.abort();
    await rejected;
    let aborted = false;
    for (let count = 0; count < 100; count++) {
      if ((await echo(observer)).aborted >= 1) { aborted = true; break; }
      await wait(25);
    }
    assert.ok(aborted);
  } finally { await proxy.client.close(); await observer.close(); await state.app.stop(); }
});
