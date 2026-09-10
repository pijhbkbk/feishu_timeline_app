// Feed to Node stdin inside the exact final image, followed by api or web.
// Mount a freshly generated localhost certificate/key at /tmp/rc2-tls (read-only).
// API additionally requires an isolated, synthetic DATABASE_URL. Never use real credentials.
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer, connect } from 'node:tls';

const role = process.argv[2];
assert.ok(['api', 'web'].includes(role));
assert.equal(process.platform, 'linux');
assert.equal(process.arch, 'x64');
assert.notEqual(process.getuid(), 0);
assert.match(readFileSync('/etc/alpine-release', 'utf8'), /^3\.24\./);
const packages = readFileSync('/lib/apk/db/installed', 'utf8').split('\n\n');
for (const name of ['libcrypto3', 'libssl3']) {
  const record = packages.find((item) => item.split('\n').includes(`P:${name}`));
  assert.ok(record, `${name} package metadata missing`);
  assert.ok(record.split('\n').includes('V:3.5.8-r0'), `${name} needs Alpine security revision 3.5.8-r0`);
}
// A passing functional smoke does not establish that embedded OpenSSL CVEs are fixed.
const key = randomBytes(32);
const iv = randomBytes(12);
const plaintext = Buffer.from('isolated runtime crypto regression');
const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const tag = cipher.getAuthTag();
function decrypt(authTag) {
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
assert.deepEqual(decrypt(tag), plaintext);
const badTag = Buffer.from(tag); badTag[0] ^= 1;
assert.throws(() => decrypt(badTag));
assert.throws(() => decrypt(tag.subarray(0, 8)));
const cert = readFileSync('/tmp/rc2-tls/cert.pem');
const server = createServer({ key: readFileSync('/tmp/rc2-tls/key.pem'), cert }, (socket) => socket.end('verified'));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
function handshake(options) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port: server.address().port, rejectUnauthorized: true, ...options });
    socket.setTimeout(3000, () => socket.destroy(new Error('TLS timeout')));
    socket.once('error', reject);
    socket.once('secureConnect', () => { const authorized = socket.authorized; socket.destroy(); resolve(authorized); });
  });
}
try {
  assert.equal(await handshake({ ca: cert, servername: 'localhost' }), true);
  await assert.rejects(handshake({ ca: cert, servername: 'wrong.invalid' }), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  await assert.rejects(handshake({ servername: 'localhost' }), (error) => ['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(error.code));
} finally { await new Promise((resolve) => server.close(resolve)); }
const require = createRequire(role === 'api' ? '/app/package.json' : '/app/apps/web/package.json');
let native;
if (role === 'api') {
  assert.ok(process.env.DATABASE_URL, 'isolated database URL required');
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  try {
    const result = await db.$queryRaw`SELECT 1::integer AS value`;
    assert.equal(result[0].value, 1);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`CREATE TEMPORARY TABLE rc2_crypto_probe (id integer PRIMARY KEY, value text) ON COMMIT DROP`;
      await tx.$executeRaw`INSERT INTO rc2_crypto_probe VALUES (1, 'synthetic')`;
      const rows = await tx.$queryRaw`SELECT value FROM rc2_crypto_probe WHERE id = 1`;
      assert.equal(rows[0].value, 'synthetic');
    });
    native = 'Prisma musl engine query and transaction';
  } finally { await db.$disconnect(); }
} else {
  const sharp = createRequire(require.resolve('next/package.json'))('sharp');
  const output = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).resize(1, 1).png().toBuffer();
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 1); assert.equal(metadata.height, 1);
  assert.equal(sharp.versions.sharp, '0.35.4');
  const heif = sharp.versions.heif?.split('.').map(Number);
  assert.ok(heif && (heif[0] > 1 || (heif[0] === 1 && (heif[1] > 23 || (heif[1] === 23 && heif[2] >= 2)))), 'libheif must include the AVIF decoder security fix');
  const avif = await sharp(output).avif().toBuffer();
  const decoded = await sharp(avif).resize(2, 2).png().toBuffer();
  const avifMetadata = await sharp(decoded).metadata();
  assert.equal(avifMetadata.width, 2); assert.equal(avifMetadata.height, 2);
  await assert.rejects(sharp(avif.subarray(0, 24)).png().toBuffer());
  native = { sharp: sharp.versions.sharp, vips: sharp.versions.vips, heif: sharp.versions.heif, avif: 'encode, decode, resize and truncated input rejection' };
}
console.log(JSON.stringify({ status: 'PASS', role, node: process.version, embeddedOpenSSL: process.versions.openssl, sharedOpenSSL: process.config.variables.node_shared_openssl, systemOpenSSL: '3.5.8-r0', platform: `${process.platform}/${process.arch}`, uid: process.getuid(), crypto: 'GCM roundtrip and tamper rejection', tls: 'trusted localhost accepted; wrong hostname and untrusted CA rejected', native }));
