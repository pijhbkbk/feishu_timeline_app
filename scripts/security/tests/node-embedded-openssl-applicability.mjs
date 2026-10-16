// External, network-free regression for the exact image runtime; no application data.
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, createHash, getCiphers, randomBytes, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSecureContext } from 'node:tls';

const empty = Buffer.alloc(0);
const cases = [];
const algorithms = [
  { name: 'chacha20-poly1305', web: 'ChaCha20-Poly1305', keyBytes: 32 },
  { name: 'aes-128-ocb', web: 'AES-OCB', keyBytes: 16 },
  { name: 'aes-192-ocb', web: 'AES-OCB', keyBytes: 24 },
  { name: 'aes-256-ocb', web: 'AES-OCB', keyBytes: 32 },
];
const otherPatchAlgorithms = [];
const errorInfo = (error) => ({ name: error.name, code: error.code ?? null, message: error.message });
function altered(tag, mode) {
  const result = Buffer.from(tag);
  if (mode === 'altered') result[0] ^= 1;
  else for (let i = 0; i < result.length; i++) result[i] ^= 255;
  return result;
}
function decryptDirect(algorithm, key, iv, aad, sequence, tag) {
  let phase = 'initialization';
  try {
    const decipher = createDecipheriv(algorithm, key, iv, { authTagLength: 16 });
    if (aad) decipher.setAAD(aad);
    if (tag) decipher.setAuthTag(tag);
    const chunks = [];
    if (sequence === 'update-empty-final') {
      phase = 'update';
      chunks.push(decipher.update(empty));
    }
    phase = 'final-authentication';
    chunks.push(decipher.final());
    return { ok: true, outputBytes: Buffer.concat(chunks).length, phase };
  } catch (error) {
    return { ok: false, phase, error: errorInfo(error) };
  }
}
async function decryptStream(algorithm, key, iv, aad, sequence, tag) {
  // Creation/configuration errors are intentionally outside the authentication promise.
  const decipher = createDecipheriv(algorithm, key, iv, { authTagLength: 16 });
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timeout = setTimeout(() => { decipher.destroy(); reject(new Error('stream timeout')); }, 5000);
    decipher.on('data', (chunk) => chunks.push(chunk));
    decipher.once('error', (error) => { clearTimeout(timeout); resolve({ ok: false, phase: 'stream-authentication', error: errorInfo(error) }); });
    decipher.once('end', () => { clearTimeout(timeout); resolve({ ok: true, outputBytes: Buffer.concat(chunks).length }); });
    if (sequence === 'update-empty-final') decipher.write(empty);
    decipher.end();
  });
}
async function run() {
  for (const bits of [128, 192, 256]) {
    const name = `aes-${bits}-gcm-siv`;
    try {
      createCipheriv(name, randomBytes(bits / 8), randomBytes(12), { authTagLength: 16 });
      otherPatchAlgorithms.push({ name, status: 'AVAILABLE_REQUIRES_SEPARATE_REVIEW' });
    } catch (error) {
      otherPatchAlgorithms.push({ name, status: error.code === 'ERR_CRYPTO_UNKNOWN_CIPHER' ? 'UNSUPPORTED_INITIALIZATION_NOT_AUTH_PASS' : 'INITIALIZATION_ERROR', error: errorInfo(error) });
      assert.equal(error.code, 'ERR_CRYPTO_UNKNOWN_CIPHER', 'Unexpected initialization error requires investigation');
    }
  }
  assert.ok(otherPatchAlgorithms.every((entry) => entry.status === 'UNSUPPORTED_INITIALIZATION_NOT_AUTH_PASS'), 'Available GCM-SIV requires separate applicability tests');
  for (const algorithm of algorithms) {
    if (!getCiphers().includes(algorithm.name)) {
      cases.push({ algorithm: algorithm.name, status: 'UNSUPPORTED', reason: 'not listed by getCiphers' });
      continue;
    }
    for (const withAAD of [false, true]) {
      for (const sequence of ['direct-final', 'update-empty-final']) {
        // Fresh synthetic keys/nonces; never emitted or reused for application traffic.
        const key = randomBytes(algorithm.keyBytes);
        const iv = randomBytes(12);
        const aad = withAAD ? Buffer.from('synthetic applicability AAD') : null;
        const cipher = createCipheriv(algorithm.name, key, iv, { authTagLength: 16 });
        if (aad) cipher.setAAD(aad);
        const ciphertext = Buffer.concat(sequence === 'direct-final' ? [cipher.final()] : [cipher.update(empty), cipher.final()]);
        assert.equal(ciphertext.length, 0);
        const tag = cipher.getAuthTag();
        assert.equal(tag.length, 16);
        const valid = decryptDirect(algorithm.name, key, iv, aad, sequence, tag);
        assert.equal(valid.ok, true, JSON.stringify(valid));
        assert.equal(valid.outputBytes, 0);
        const negatives = [];
        for (const mode of ['altered', 'invalid', 'missing']) {
          const result = decryptDirect(algorithm.name, key, iv, aad, sequence, mode === 'missing' ? null : altered(tag, mode));
          assert.equal(result.ok, false, `${algorithm.name} accepted ${mode} tag`);
          assert.equal(result.phase, 'final-authentication', JSON.stringify(result));
          assert.match(result.error.message, /authenticat/i);
          negatives.push({ mode, ...result });
        }
        const streamValid = await decryptStream(algorithm.name, key, iv, aad, sequence, tag);
        assert.equal(streamValid.ok, true, JSON.stringify(streamValid));
        assert.equal(streamValid.outputBytes, 0);
        const streamInvalid = await decryptStream(algorithm.name, key, iv, aad, sequence, altered(tag, 'altered'));
        assert.equal(streamInvalid.ok, false);
        assert.match(streamInvalid.error.message, /authenticat/i);
        cases.push({ api: 'Cipheriv/Decipheriv and Transform', algorithm: algorithm.name, withAAD, sequence, status: 'PASS', valid, negatives, streamValid, streamInvalid });
      }
      const key = await webcrypto.subtle.importKey('raw-secret', randomBytes(algorithm.keyBytes), { name: algorithm.web }, false, ['encrypt', 'decrypt']);
      const parameters = { name: algorithm.web, iv: randomBytes(12), tagLength: 128 };
      if (withAAD) parameters.additionalData = Buffer.from('synthetic WebCrypto AAD');
      const encrypted = Buffer.from(await webcrypto.subtle.encrypt(parameters, key, empty));
      assert.equal(encrypted.length, 16);
      const valid = await webcrypto.subtle.decrypt(parameters, key, encrypted);
      assert.equal(valid.byteLength, 0);
      const negatives = [];
      for (const mode of ['altered', 'invalid']) {
        let observed;
        try { await webcrypto.subtle.decrypt(parameters, key, altered(encrypted, mode)); }
        catch (error) { observed = errorInfo(error); }
        assert.ok(observed, `${algorithm.web} accepted ${mode} tag`);
        assert.equal(observed.name, 'OperationError');
        negatives.push({ mode, phase: 'decrypt-authentication', error: observed });
      }
      cases.push({ api: 'WebCrypto', algorithm: algorithm.name, withAAD, sequence: 'one-shot API using native Update/Final', status: 'PASS', validOutputBytes: valid.byteLength, negatives });
    }
  }
  assert.equal(cases.filter((entry) => entry.status === 'UNSUPPORTED').length, 0, 'Unavailable algorithms are not regression PASS');
  assert.equal(cases.length, 24);
  createSecureContext();
  const protocolChecks = [];
  for (const secureProtocol of ['DTLS_method', 'DTLSv1_method', 'DTLSv1_2_method', 'OSSL_QUIC_server_method']) {
    let observed;
    try { createSecureContext({ secureProtocol }); } catch (error) { observed = errorInfo(error); }
    assert.ok(observed, `unexpectedly allowed ${secureProtocol}`);
    assert.equal(observed.code, 'ERR_TLS_INVALID_PROTOCOL_METHOD');
    protocolChecks.push({ secureProtocol, rejected: true, error: observed });
  }
  assert.equal(process.config.variables.node_use_quic, false);
  return protocolChecks;
}
let status = 'PASS';
let error = null;
let protocolChecks = [];
try { protocolChecks = await run(); } catch (failure) { status = 'FAIL'; error = errorInfo(failure); process.exitCode = 1; }
console.log(JSON.stringify({ schemaVersion: 1, scope: 'CVE-2026-75803 actual Node APIs; bounded TLS method selection', status, error,
  runtime: { node: process.version, openssl: process.versions.openssl, platform: process.platform, arch: process.arch, uid: process.getuid(), nodeSha256: createHash('sha256').update(readFileSync(process.execPath)).digest('hex'), nodeSharedOpenSSL: process.config.variables.node_shared_openssl, nodeUseQuic: process.config.variables.node_use_quic, otherPatchAlgorithms },
  cases, protocolChecks }, null, 2));
