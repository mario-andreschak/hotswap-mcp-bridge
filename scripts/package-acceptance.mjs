import assert from 'node:assert/strict';
import { mkdtemp, copyFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { exec, launch, stop, checkServer } from './acceptance.mjs';
const root = await mkdtemp(join(tmpdir(), 'mcp-bridge-package-'));
let running;
try {
  const { stdout } = await exec('npm', ['pack', '--json', '--silent'], { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
  const packed = JSON.parse(stdout)[0];
  assert.ok(packed.files.some(file => file.path === 'dist/cli.js'));
  assert.ok(packed.files.every(file => !/^(src|tests|examples|node_modules)\//.test(file.path) && !file.path.includes('.env')));
  const tarball = resolve(packed.filename);
  await exec('npm', ['install', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund', tarball], { cwd: root, maxBuffer: 1024 * 1024 });
  const manifest = JSON.parse(await readFile(join(root, 'node_modules/mcp-transport-bridge/package.json'), 'utf8'));
  assert.equal(manifest.bin['mcp-transport-bridge'], './dist/cli.js');
  await copyFile('tests/fixtures/backend.mjs', join(root, 'fixture.mjs'));
  const bin = join(root, 'node_modules/.bin/mcp-transport-bridge');
  running = await launch(bin, ['--port', '0'], root);
  await checkServer(running.base, process.execPath, join(root, 'fixture.mjs'), bin, root);
  assert.equal(running.stdout(), '');
  assert.doesNotMatch(running.stderr(), /SENTINEL/);
  await rm(tarball);
  console.log('Packed install: HTTP, explicit SSE, modern/legacy stdio launchers, env swap and clean stdout passed.');
} finally {
  if (running) await stop(running.child);
  await rm(root, { recursive: true, force: true });
}
