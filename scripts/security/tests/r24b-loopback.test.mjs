import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../r24b-zap-orchestrator.mjs', import.meta.url), 'utf8');
for (const [name, route, status] of [
  ['assertUnauthenticatedBoundary', '/api/projects', 401],
  ['createGetOnlyOpenApi', '/api/docs-json', 200],
]) {
  test(`${name} uses credential-free fixed loopback and rejects redirects`, async () => {
    // Execute only the probe function, never the session loader or ZAP workflow.
    const start = source.indexOf(`async function ${name}() {`);
    assert.ok(start >= 0);
    const end = source.indexOf('\n}\n', start) + 2;
    assert.ok(end > start);
    let calls = 0;
    const context = vm.createContext({
      AbortSignal,
      fetch: async (url, options) => {
        calls++;
        assert.equal(url, `http://127.0.0.1:8080${route}`);
        assert.equal(options.redirect, 'manual');
        assert.equal(options.headers, undefined);
        assert.equal(options.body, undefined);
        assert.ok(options.signal);
        return { status: 302, ok: false, body: { cancel: async () => {} } };
      },
    });
    const probe = vm.runInContext(`${source.slice(start, end)}; ${name}`, context);
    await assert.rejects(probe(), /302/);
    assert.equal(calls, 1);
    if (status === 401) {
      context.fetch = async () => ({ status, body: { cancel: async () => {} } });
      await probe();
    }
  });
}
