// Runs as the application UID inside the explicitly selected portable stack.
// This is a data-only codec: no archive extraction, SQL or shell supplied by backups.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire('/app/package.json');
const ROOT = '/app/var/object-storage';
const MAX_OBJECT = 20 * 1024 ** 2;
const MAX_TOTAL = 256 * 1024 ** 2;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function assert(ok) { if (!ok) throw new Error('Portable data input rejected'); }
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function entries() {
  const result = []; let total = 0; let seen = 0;
  function walk(dir, prefix = '') {
    for (const name of fs.readdirSync(dir)) {
      assert(++seen <= 1024 && NAME.test(name) && name !== '.' && name !== '..');
      const rel = prefix + name; const full = path.join(dir, name); const st = fs.lstatSync(full);
      assert(rel.length <= 504 && rel.split('/').length <= 15 && !st.isSymbolicLink());
      if (st.isDirectory()) { walk(full, rel + '/'); continue; }
      assert(st.isFile() && st.nlink === 1 && st.size <= MAX_OBJECT);
      assert(result.length < 500 && (total += st.size) <= MAX_TOTAL);
      const fd = fs.openSync(full, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try {
        const actual = fs.fstatSync(fd); assert(actual.ino === st.ino && actual.size === st.size);
        const bytes = fs.readFileSync(fd); const after = fs.fstatSync(fd);
        assert(bytes.length === st.size && after.mtimeMs === st.mtimeMs && after.ctimeMs === st.ctimeMs);
        result.push({ path: rel, size: bytes.length, sha256: sha(bytes), bytes: bytes.toString('base64') });
      } finally { fs.closeSync(fd); }
    }
  }
  walk(ROOT); return result.sort((a,b) => a.path.localeCompare(b.path, 'en'));
}
async function input() {
  const chunks = []; let size = 0;
  for await (const block of process.stdin) { assert((size += block.length) <= 400 * 1024 ** 2); chunks.push(block); }
  return JSON.parse(Buffer.concat(chunks).toString());
}
const operation = process.argv[2];
if (operation === 'objects-read') process.stdout.write(JSON.stringify(entries()));
else if (operation === 'objects-write') {
  assert(fs.readdirSync(ROOT).length === 0);
  const values = await input(); assert(Array.isArray(values) && values.length <= 500);
  let total = 0; const names = new Set();
  for (const item of values) {
    assert(typeof item.path === 'string' && item.path.length <= 504 && item.path.split('/').length <= 15);
    assert(item.path.split('/').every(p => NAME.test(p) && p !== '.' && p !== '..') && !names.has(item.path));
    names.add(item.path);
    assert(Number.isSafeInteger(item.size) && item.size >= 0 && item.size <= MAX_OBJECT);
    assert(typeof item.bytes === 'string' && item.bytes.length <= Math.ceil(MAX_OBJECT / 3) * 4);
    const bytes = Buffer.from(item.bytes, 'base64');
    assert(bytes.length === item.size && sha(bytes) === item.sha256 && (total += bytes.length) <= MAX_TOTAL);
  }
  for (const item of values) {
    const dest = path.join(ROOT, item.path); fs.mkdirSync(path.dirname(dest), {recursive:true, mode:0o700});
    fs.writeFileSync(dest, Buffer.from(item.bytes, 'base64'), {flag:'wx', mode:0o600});
  }
  assert(JSON.stringify(entries()) === JSON.stringify(values));
  process.stdout.write(JSON.stringify({objectCount:values.length}));
} else if (operation === 'queue-read' || operation === 'queue-write') {
  const Redis = require('ioredis'); const redis = new Redis(process.env.REDIS_URL, {lazyConnect:true, maxRetriesPerRequest:1, enableOfflineQueue:false});
  await redis.connect();
  try {
    if (operation === 'queue-read') {
      let cursor = '0'; const rows = []; let total = 0;
      do {
        const page = await redis.scan(cursor, 'MATCH', 'notifications:*', 'COUNT', 100); cursor = page[0];
        for (const key of page[1]) {
          assert(key === 'notifications:jobs' || /^notifications:queued:[a-f0-9]{64}$/.test(key));
          assert(rows.length < 5001);
          const bytes = await redis.dumpBuffer(key); const ttl = await redis.pttl(key);
          if (!bytes || ttl === -2) continue;
          assert((total += bytes.length) <= 128 * 1024 ** 2);
          rows.push({key, bytes:bytes.toString('base64'), expiresAt:ttl === -1 ? null : Date.now()+ttl});
        }
      } while (cursor !== '0');
      process.stdout.write(JSON.stringify(rows.sort((a,b)=>a.key.localeCompare(b.key, 'en'))));
    } else {
      assert(await redis.dbsize() === 0);
      const rows = await input(); assert(Array.isArray(rows) && rows.length <= 5001);
      let total = 0; const keys = new Set();
      for (const row of rows) {
        assert((row.key === 'notifications:jobs' || /^notifications:queued:[a-f0-9]{64}$/.test(row.key)) && !keys.has(row.key)); keys.add(row.key);
        assert(typeof row.bytes === 'string' && (total += row.bytes.length) <= 180 * 1024 ** 2);
        assert(row.expiresAt === null || Number.isSafeInteger(row.expiresAt));
      }
      for (const row of rows) {
        const ttl = row.expiresAt === null ? 0 : Math.max(0, row.expiresAt - Date.now());
        if (row.expiresAt !== null && ttl <= 0) continue;
        await redis.restore(row.key, ttl, Buffer.from(row.bytes, 'base64'));
      }
      process.stdout.write(JSON.stringify({restoredPersistentKeys:await redis.dbsize(), sessionsRestored:false}));
    }
  } finally { await redis.quit(); }
} else throw new Error('Unknown portable data operation');
