// Small, isolated regressions for the production dependency graph. No database,
// external network, production service, or process-wide error handler is used.
// Lifecycle triggers follow the upstream fixes:
// https://github.com/expressjs/body-parser/commit/f7075eae3a84c3473ab4bf0a777da28db208e916
// https://github.com/expressjs/multer/commit/80a2d9df1dfd63b5fab631b8b9966164ed647adf
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { deflateSync, gzipSync } from 'node:zlib';

const apiRequire = createRequire(new URL('../../../package.json', import.meta.url));
const nestRequire = createRequire(apiRequire.resolve('@nestjs/platform-express'));
const expressRequire = createRequire(nestRequire.resolve('express'));
const deadline = setTimeout(() => { throw new Error('Parser lifecycle probe did not complete'); }, 2500);

async function compressedTail() {
  const parser = expressRequire('body-parser').json();
  const value = { color: 'synthetic', quantity: 14 };
  const first = Buffer.concat([deflateSync(JSON.stringify(value)), Buffer.from([0])]);
  const tail = Buffer.alloc(1024);
  const expectedRawHash = createHash('sha256').update(first).update(tail).digest('hex');
  let client;
  const server = createServer((req, res) => {
    const raw = createHash('sha256');
    req.on('data', chunk => raw.update(chunk));
    parser(req, res, error => {
      if (error) { res.writeHead(error.status || 500).end(); return; }
      const finish = () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ body: req.body, rawHash: raw.digest('hex') }));
      };
      if (req.readableEnded) finish(); else req.once('end', finish);
      // The tail arrives only after the real decoder has finished its frame.
      if (req.headers['content-encoding'] === 'deflate') client.end(tail);
    });
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    const decoded = await new Promise((resolve, reject) => {
      client = request(endpoint, {
        method: 'POST', agent: false,
        headers: { 'content-type': 'application/json', 'content-encoding': 'deflate', 'content-length': first.length + tail.length },
      }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
      });
      client.on('error', reject);
      client.setTimeout(1500, () => client.destroy(new Error('HTTP body did not finish')));
      client.write(first);
    });
    assert.deepEqual(decoded, { status: 200, body: { body: value, rawHash: expectedRawHash } });
    const normal = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
    assert.equal(normal.status, 200);
    assert.deepEqual((await normal.json()).body, value);
    return { package: 'body-parser', version: expressRequire('body-parser/package.json').version, rawBytes: first.length + tail.length, completed: true, normalRequest: true };
  } finally {
    client?.destroy();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

async function gzipTail() {
  const parser = expressRequire('body-parser').json();
  const value = { color: 'synthetic' };
  const payload = Buffer.concat([gzipSync(JSON.stringify(value)), Buffer.from([0]), Buffer.alloc(100 * 1024, 0x58)]);
  const server = createServer((req, res) => parser(req, res, error => {
    res.writeHead(error ? error.status || 500 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(error ? { error: true } : req.body));
  }));
  let client;
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    const result = await new Promise((resolve, reject) => {
      client = request(endpoint, {
        method: 'POST', agent: false,
        headers: { 'content-type': 'application/json', 'content-encoding': 'gzip', 'content-length': payload.length },
      }, response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk; });
        response.on('error', reject);
        response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
      });
      client.on('error', reject);
      client.setTimeout(1500, () => client.destroy(new Error('gzip request did not finish')));
      client.end(payload);
    });
    // An early HTTP 200 is insufficient: late decoder errors must remain visible.
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.deepEqual(result, { status: 200, body: value });
    const normal = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
    assert.equal(normal.status, 200);
    assert.deepEqual(await normal.json(), value);
    return { gzipTailBytes: payload.length, gzipCompleted: true };
  } finally {
    client?.destroy();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

function multipartBody(names, complete) {
  return names.map(name => `--LifecycleBoundary\r\nContent-Disposition: form-data; name="${name}"; filename="synthetic.txt"\r\nContent-Type: text/plain\r\n\r\nx\r\n`).join('') + (complete ? '--LifecycleBoundary--\r\n' : '');
}
function incoming(body) {
  const req = new PassThrough();
  req.headers = { 'content-type': 'multipart/form-data; boundary=LifecycleBoundary', 'content-length': Buffer.byteLength(body) };
  return req;
}
async function lateFilter() {
  const multer = nestRequire('multer');
  const truncated = multipartBody(['pending', 'rejected'], false);
  const req = incoming(truncated);
  const rejection = new Error('synthetic filter refusal');
  let parser, resume, calls = 0;
  await new Promise((resolve, reject) => {
    const upload = multer({
      fileHwm: 1,
      streamHandler: (stream, busboy) => { parser = busboy; stream.pipe(busboy); },
      fileFilter: (stream, file, callback) => {
        if (file.fieldname === 'pending') resume = callback;
        else stream.once('end', () => setImmediate(() => callback(rejection)));
      },
    }).any();
    upload(req, null, error => {
      calls++;
      if (error !== rejection || typeof resume !== 'function') { reject(new Error('Expected pending filter and rejection')); return; }
      setImmediate(() => {
        // Observe real teardown; do not add an error listener to mask a crash.
        parser.once('close', () => {
          try { assert.equal(calls, 1); assert.deepEqual(req.files, []); resolve(); } catch (failure) { reject(failure); }
        });
        resume(null, true);
      });
    });
    req.end(truncated);
  });
  const valid = multipartBody(['file'], true);
  const next = incoming(valid);
  await new Promise((resolve, reject) => {
    multer().single('file')(next, null, error => error ? reject(error) : resolve());
    next.end(valid);
  });
  assert.equal(next.file.buffer.toString(), 'x');
  return { package: 'multer', version: nestRequire('multer/package.json').version, rawBytes: Buffer.byteLength(truncated), completed: true, callbackCount: calls, normalUpload: true };
}

const mode = process.argv[2];
assert(['body-parser', 'multer'].includes(mode));
const result = mode === 'body-parser' ? { ...await compressedTail(), ...await gzipTail() } : await lateFilter();
clearTimeout(deadline);
process.stdout.write(JSON.stringify(result) + '\n');
