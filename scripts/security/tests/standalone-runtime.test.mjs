// Run after generating immutable build identity and a real production build: node --test scripts/security/tests/standalone-runtime.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('production standalone works without build-tree dependency fallback', { timeout: 60000 }, async () => {
  const runtime = await mkdtemp(path.join(os.tmpdir(), 'rc2-standalone-test-'));
  let child;
  let exited;
  try {
    const web = path.join(root, 'apps/web');
    await cp(path.join(web, '.next/standalone'), runtime, { recursive: true, verbatimSymlinks: true });
    await cp(path.join(web, '.next/static'), path.join(runtime, 'apps/web/.next/static'), { recursive: true });
    await cp(path.join(web, 'public'), path.join(runtime, 'apps/web/public'), { recursive: true });
    const reservation = net.createServer();
    await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    child = spawn(process.execPath, ['apps/web/server.js'], {
      cwd: runtime,
      env: { PATH: process.env.PATH, HOSTNAME: '127.0.0.1', PORT: String(port), NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8000); });
    exited = new Promise((resolve) => child.once('exit', resolve));
    const origin = new URL(`http://127.0.0.1:${port}/`);
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      assert.equal(child.exitCode, null, stderr);
      try {
        await new Promise((resolve, reject) => {
          const socket = net.createConnection({ host: '127.0.0.1', port });
          socket.once('connect', () => { socket.destroy(); resolve(); });
          socket.once('error', reject);
        });
        ready = true;
        break;
      } catch { /* Wait only for this owned local server to bind its socket. */ }
      await delay(100);
    }
    assert.ok(ready, `Standalone did not serve /build-info: ${stderr}`);
    const metadata = await fetch(new URL('/build-info', origin), { redirect: 'manual' });
    assert.equal(metadata.status, 200, stderr);
    const info = await metadata.json();
    assert.match(info.runtimeCommit, /^[0-9a-f]{40}$/);
    const login = await fetch(new URL('/login', origin), { redirect: 'manual' });
    assert.equal(login.status, 200);
    const html = await login.text();
    const assets = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(assets.length > 0, 'Login must load actual generated script assets');
    for (const asset of assets) {
      const url = new URL(asset, origin);
      assert.equal(url.origin, origin.origin);
      const response = await fetch(url, { redirect: 'manual' });
      assert.equal(response.status, 200, asset);
      assert.ok((await response.arrayBuffer()).byteLength > 0);
    }
    const projects = await fetch(new URL('/projects', origin), { redirect: 'manual' });
    assert.equal(projects.status, 200);
    await projects.body?.cancel();
    assert.doesNotMatch(stderr, /MODULE_NOT_FOUND|Cannot find module/);
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      await exited;
      clearTimeout(timer);
    }
    await rm(runtime, { recursive: true, force: true });
  }
});
