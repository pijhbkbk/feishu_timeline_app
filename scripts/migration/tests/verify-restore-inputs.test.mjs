import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { prepareRestoreSnapshot } from '../verify-restore-inputs.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const dir = mkdtempSync(join(realpathSync(resolve(tmpdir())), 'restore-input-test-'));
  const root = join(dir, 'bundle');
  const output = join(dir, 'snapshots');
  mkdirSync(root); mkdirSync(output); mkdirSync(join(root, 'objects'));
  // Format marker only; real pg_restore validation belongs to the integration test.
  const dump = Buffer.from('PGDMP synthetic unit fixture');
  const object = Buffer.from('immutable material version 1');
  writeFileSync(join(root, 'database.dump'), dump);
  writeFileSync(join(root, 'objects', 'version-1.txt'), object);
  const manifest = { version: 1, database: { path: 'database.dump', size: dump.length, sha256: sha(dump) }, objects: [{ path: 'objects/version-1.txt', size: object.length, sha256: sha(object) }] };
  const save = () => {
    const bytes = Buffer.from(JSON.stringify(manifest));
    writeFileSync(join(root, 'restore-manifest.json'), bytes);
    return sha(bytes);
  };
  const expected = save();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { root, output, manifest, save, expected, dump, object };
}

test('copies approved bytes into a new private snapshot, independent of later input changes', (t) => {
  const f = fixture(t);
  const result = prepareRestoreSnapshot(f.root, f.expected, f.output);
  assert.deepEqual(readFileSync(join(result.snapshotRoot, 'database.dump')), f.dump);
  assert.deepEqual(readFileSync(join(result.snapshotRoot, 'objects/version-1.txt')), f.object);
  writeFileSync(join(f.root, 'database.dump'), 'tampered after snapshot');
  assert.deepEqual(readFileSync(join(result.snapshotRoot, 'database.dump')), f.dump);
  assert.equal(result.manifestSha256, f.expected);
  assert.equal(result.objectCount, 1);
});

for (const [name, mutate] of [
  ['dump tampering', (f) => writeFileSync(join(f.root, 'database.dump'), 'PGDMP tampered')],
  ['object tampering', (f) => writeFileSync(join(f.root, 'objects/version-1.txt'), 'tampered')],
  ['manifest tampering', (f) => writeFileSync(join(f.root, 'restore-manifest.json'), '{}')],
  ['missing object', (f) => rmSync(join(f.root, 'objects/version-1.txt'))],
  ['unexpected object', (f) => writeFileSync(join(f.root, 'objects/unlisted.txt'), 'unlisted')],
  ['object symlink', (f) => { rmSync(join(f.root, 'objects/version-1.txt')); symlinkSync('../database.dump', join(f.root, 'objects/version-1.txt')); }],
]) {
  test(`rejects ${name} without producing a consumable snapshot`, (t) => {
    const f = fixture(t); mutate(f);
    assert.throws(() => prepareRestoreSnapshot(f.root, f.expected, f.output));
    assert.deepEqual(readdirSync(f.output), []);
  });
}

for (const [name, mutate] of [
  ['path traversal', (f) => { f.manifest.objects[0].path = '../secret'; }],
  ['absolute path', (f) => { f.manifest.objects[0].path = '/etc/passwd'; }],
  ['duplicate object', (f) => { f.manifest.objects.push(f.manifest.objects[0]); }],
  ['invalid byte size', (f) => { f.manifest.objects[0].size = -1; }],
  ['oversized declared dump', (f) => { f.manifest.database.size = 65 * 1024 * 1024; }],
  ['extra manifest field', (f) => { f.manifest.command = 'do not execute'; }],
  ['noncustom dump', (f) => { const bytes = Buffer.from('SELECT dangerous_sql();'); writeFileSync(join(f.root, 'database.dump'), bytes); Object.assign(f.manifest.database, {size: bytes.length, sha256: sha(bytes)}); }],
]) {
  test(`rejects approved but invalid ${name}`, (t) => {
    const f = fixture(t); mutate(f);
    assert.throws(() => prepareRestoreSnapshot(f.root, f.save(), f.output));
    assert.deepEqual(readdirSync(f.output), []);
  });
}

test('does not execute an arbitrary command embedded in object content', (t) => {
  const f = fixture(t);
  const bytes = Buffer.from('$(touch marker); `touch marker`; <script>alert(1)</script>');
  writeFileSync(join(f.root, 'objects/version-1.txt'), bytes);
  Object.assign(f.manifest.objects[0], { size: bytes.length, sha256: sha(bytes) });
  const result = prepareRestoreSnapshot(f.root, f.save(), f.output);
  assert.deepEqual(readFileSync(join(result.snapshotRoot, 'objects/version-1.txt')), bytes);
  assert.equal(readdirSync(f.root).includes('marker'), false);
});

test('requires a separately supplied nonzero digest', (t) => {
  const f = fixture(t);
  for (const value of [undefined, '', '0'.repeat(64), f.expected.toUpperCase()]) {
    assert.throws(() => prepareRestoreSnapshot(f.root, value, f.output));
  }
  assert.deepEqual(readdirSync(f.output), []);
});

test('rejects oversized directory inventory without producing a snapshot', (t) => {
  const f = fixture(t);
  for (let i = 0; i < 1025; i++) writeFileSync(join(f.root, 'objects', `unlisted-${i}`), '');
  assert.throws(() => prepareRestoreSnapshot(f.root, f.expected, f.output), /too many entries/);
  assert.deepEqual(readdirSync(f.output), []);
});
