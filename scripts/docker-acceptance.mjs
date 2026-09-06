import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { exec, checkServer, TOKEN } from './acceptance.mjs';
import { api, wait } from '../tests/helpers.mjs';
const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const name = 'mcp-bridge-acceptance-' + randomUUID();
const image = name + ':test';
let started = false;
try {
  await exec('docker', ['build', '-t', image, '.'], { maxBuffer: 8 * 1024 * 1024 });
  await exec('docker', ['run', '--detach', '--name', name, '--publish', '127.0.0.1:' + port + ':3000',
    '--env', 'MCP_BRIDGE_TOKEN=' + TOKEN, '--env', 'MCP_BRIDGE_ALLOWED_HOSTS=127.0.0.1:' + port,
    '--mount', 'type=bind,src=' + resolve('tests/fixtures/backend.mjs') + ',dst=/app/fixture.mjs,readonly',
    image]);
  started = true;
  const base = 'http://127.0.0.1:' + port;
  let ready = false;
  for (let count = 0; count < 120; count++) {
    try { if ((await api(base, '/health')).status === 200) { ready = true; break; } } catch {}
    await wait(250);
  }
  if (!ready) throw new Error('Docker bridge did not become ready');
  await checkServer(base, 'node', '/app/fixture.mjs');
  const { stdout: user } = await exec('docker', ['exec', name, 'id', '-u']);
  if (user.trim() === '0') throw new Error('Docker package runs as root');
  console.log('Built nonroot Docker package: actual child tools, modern/legacy HTTP, SSE and atomic env swap passed.');
} finally {
  if (started) await exec('docker', ['rm', '-f', name]).catch(() => {});
  await exec('docker', ['image', 'rm', image]).catch(() => {});
}
