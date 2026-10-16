import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lockedNext, verifiedArchive } from '../prefetch-next.mjs';
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
