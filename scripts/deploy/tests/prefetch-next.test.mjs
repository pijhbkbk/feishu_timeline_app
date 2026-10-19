import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lockedNext, verifiedArchive, verifiedCachedArchive, buildArchive } from '../prefetch-next.mjs';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, truncateSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const bytes = Buffer.from('synthetic package bytes');
const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
const entry = `  next@15.5.25:\n    resolution: {integrity: ${integrity}}\n`;
test('selects one locked version; rejects missing and ambiguous input', () => {
  assert.deepEqual(lockedNext(entry), { version: '15.5.25', integrity });
  assert.throws(() => lockedNext(''));
  assert.throws(() => lockedNext(entry + entry));
});
test('only verified bytes can seed the dependency store', async () => {
  assert.deepEqual(await verifiedArchive(new Response(bytes), integrity), bytes);
  await assert.rejects(verifiedArchive(new Response(Buffer.from('tampered')), integrity));
  await assert.rejects(verifiedArchive(new Response('not found', { status: 404 }), integrity));
});
test('bounds archive size even without a content-length header', async () => {
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(Buffer.alloc(48 * 1024 * 1024 + 1)); controller.close();
  } });
  await assert.rejects(verifiedArchive(new Response(body), integrity), /limit/);
});
test('aborts a response body that stalls after headers', async () => {
  const { createServer } = await import('node:http');
  const server = createServer((_request, response) => { response.writeHead(200); response.write('incomplete'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}`, { signal: AbortSignal.timeout(150) });
    await assert.rejects(verifiedArchive(response, integrity), (error) => ['AbortError', 'TimeoutError'].includes(error.name));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('verified optional cache avoids network; only a missing file downloads', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'next-cache-'));
  const file = join(directory, 'next.tgz');
  let downloads = 0;
  const download = async () => { downloads++; return bytes; };
  try {
    assert.deepEqual(await buildArchive(integrity, download, file), bytes);
    assert.equal(downloads, 1);
    writeFileSync(file, bytes);
    assert.deepEqual(verifiedCachedArchive(file, integrity), bytes);
    assert.deepEqual(await buildArchive(integrity, download, file), bytes);
    assert.equal(downloads, 1);
    writeFileSync(file, 'tampered');
    await assert.rejects(buildArchive(integrity, download, file), /integrity/);
    assert.equal(downloads, 1);
  } finally { rmSync(directory, {recursive: true}); }
});
test('cache rejects symlinks, special files, empty and oversized bytes without fallback', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'next-cache-negative-'));
  const download = async () => { throw new Error('Network must not be called'); };
  try {
    const original = join(directory, 'original');
    writeFileSync(original, bytes);
    const link = join(directory, 'link');
    symlinkSync(original, link);
    await assert.rejects(buildArchive(integrity, download, link), error => error.code === 'ELOOP');
    const empty = join(directory, 'empty'); writeFileSync(empty, '');
    await assert.rejects(buildArchive(integrity, download, empty), /nonempty regular file/);
    const big = join(directory, 'big'); writeFileSync(big, ''); truncateSync(big, 48 * 1024 * 1024 + 1);
    await assert.rejects(buildArchive(integrity, download, big), /limit/);
    const folder = join(directory, 'folder'); mkdirSync(folder);
    await assert.rejects(buildArchive(integrity, download, folder), /regular file/);
    const fifo = join(directory, 'fifo'); execFileSync('mkfifo', [fifo]);
    await assert.rejects(buildArchive(integrity, download, fifo), /regular file/);
  } finally { rmSync(directory, {recursive: true}); }
});
