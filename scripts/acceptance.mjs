import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { TOKEN, api, modern, connectHttp, connectSse, connectStdio, echo, wait } from '../tests/helpers.mjs';
export const exec = promisify(execFile);
export { TOKEN };
export async function stop(child) {
  if (child.exitCode !== null || child.signalCode) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(timer); }
}
export async function launch(command, args, cwd) {
  const child = spawn(command, args, { cwd, env: { PATH: process.env.PATH, MCP_BRIDGE_TOKEN: TOKEN }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', stderr = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { stderr += data; });
  try {
    for (let count = 0; count < 200; count++) {
      const match = /MCP bridge listening on port (\d+)\./.exec(stderr);
      if (match) return { child, base: 'http://127.0.0.1:' + match[1], stdout: () => output, stderr: () => stderr };
      if (child.exitCode !== null) throw new Error('Packaged HTTP CLI exited: ' + stderr);
      await wait(25);
    }
    throw new Error('Packaged HTTP CLI did not start');
  } catch (error) { await stop(child); throw error; }
}
export async function checkServer(base, command, fixture, cli, cwd) {
  assert.equal((await api(base, '/health', { token: '' })).status, 401);
  const registered = await api(base, '/api/servers', { method: 'POST', body: {
    name: 'acceptance', transport: 'stdio', command, args: [fixture], env: { VALUE: 'package-before', NOISY: '1' },
  } });
  assert.equal(registered.status, 201, registered.text);
  const serverId = registered.body.id;
  const connection = await api(base, '/api/connections', { method: 'POST', body: { serverId, transport: 'http' } });
  assert.equal(connection.status, 201, connection.text);
  for (const mode of [modern, 'legacy']) {
    const client = await connectHttp(base + connection.body.mcpPath, mode);
    try {
      assert.equal((await client.listTools()).tools[0].name, 'echo');
      assert.equal((await echo(client, 'package')).value, 'package-before');
    } finally { await client.close(); }
  }
  const sse = await api(base, '/api/connections', { method: 'POST', body: { serverId, transport: 'sse' } });
  assert.equal(sse.status, 201, sse.text);
  const sseClient = await connectSse(base + sse.body.ssePath);
  try { assert.equal((await echo(sseClient)).value, 'package-before'); } finally { await sseClient.close(); }
  if (cli) for (const [path, transport] of [[connection.body.mcpPath, 'http'], [sse.body.ssePath, 'sse']]) {
    for (const mode of [modern, 'legacy']) {
      const proxy = await connectStdio(cli, ['--url', base + path, '--transport', transport], mode, cwd);
      try {
        assert.equal((await echo(proxy.client)).value, 'package-before');
        assert.equal(proxy.stderr(), '');
      } finally { await proxy.client.close(); }
    }
  }
  const changed = await api(base, '/api/servers/' + serverId + '/environment', { method: 'POST', body: { VALUE: 'package-after' } });
  assert.equal(changed.status, 200, changed.text);
  const after = await connectHttp(base + connection.body.mcpPath);
  try { assert.equal((await echo(after)).value, 'package-after'); } finally { await after.close(); }
  const listing = await api(base, '/api/servers');
  assert.doesNotMatch(listing.text, /package-after|package-before|SENTINEL/);
  assert.equal((await api(base, '/api/servers/' + serverId, { method: 'DELETE' })).status, 204);
}
