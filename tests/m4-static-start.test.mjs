import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseStaticServerOptions } from '../scripts/static-server-options.mjs';

const startScript = fileURLToPath(new URL('../scripts/start-static.mjs', import.meta.url));

test('static startup keeps its default and accepts explicit port boundaries', () => {
  assert.deepEqual(parseStaticServerOptions([]), { port: 3500, help: false });
  for (const port of [1, 3501, 65535]) {
    assert.deepEqual(parseStaticServerOptions(['--port', String(port)]), { port, help: false });
    assert.deepEqual(parseStaticServerOptions([`--port=${port}`]), { port, help: false });
  }
});

test('invalid, duplicate and unsupported startup arguments fail before binding or building', () => {
  for (const args of [['--port'], ['--port', '0'], ['--port', '65536'], ['--port', '-1'], ['--port', '3500.5'], ['--port', '3500x'], ['--port='], ['--port', '3501', '--port', '3502'], ['--host', '0.0.0.0']]) {
    assert.throws(() => parseStaticServerOptions(args));
    const result = spawnSync(process.execPath, [startScript, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /启动参数错误/);
    assert.doesNotMatch(result.stdout, /next build|静态服务/);
  }
});

test('startup help exits without building or starting a service', () => {
  const result = spawnSync(process.execPath, [startScript, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /npm start.*-- --port/);
  assert.match(result.stdout, /npm run build/);
  assert.match(result.stdout, /127\.0\.0\.1/);
  assert.doesNotMatch(result.stdout, /next build|http:\/\//);
});

test('missing static output exits with an explicit build instruction', (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wechat-static-start-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const scripts = path.join(directory, 'scripts');
  mkdirSync(scripts);
  copyFileSync(startScript, path.join(scripts, 'start-static.mjs'));
  copyFileSync(new URL('../scripts/static-server-options.mjs', import.meta.url), path.join(scripts, 'static-server-options.mjs'));
  const result = spawnSync(process.execPath, [path.join(scripts, 'start-static.mjs')], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /缺少 out\/index\.html/);
  assert.match(result.stderr, /npm run build/);
  assert.match(result.stderr, /npm start/);
  assert.equal(result.stdout, '');
});
