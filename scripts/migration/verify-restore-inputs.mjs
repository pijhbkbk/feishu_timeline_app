// Non-privileged preparation for small, controlled restore rehearsals.
// This validates bytes, not SQL safety or approval. Never run as a privileged controller.
// Input/output parents must be owned by the trusted operator, without concurrent writers.
import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync,
  opendirSync, readSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MiB = 1024 * 1024;
const MAX_MANIFEST = MiB;
const MAX_DUMP = 64 * MiB;
const MAX_OBJECT = 20 * MiB;
const MAX_TOTAL = 256 * MiB;
const MAX_OBJECTS = 500;
const MANIFEST = 'restore-manifest.json';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(message); };

function digest(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value) || /^0+$/.test(value)) fail('Invalid expected SHA-256');
  return value;
}
function fields(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...names].sort().join(',')) fail('Invalid restore manifest fields');
}
function directory(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path !== resolve(path)) fail('Directory must be an absolute normalized path');
  if (realpathSync(path) !== path || !lstatSync(path).isDirectory()) fail('Directory must not traverse symlinks');
  return path;
}
function objectPath(path) {
  if (typeof path !== 'string' || path.length > 512 || !path.startsWith('objects/')) fail('Invalid object path');
  const parts = path.split('/');
  if (parts.length > 16 || parts.some((part) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(part) || part === '.' || part === '..')) fail('Invalid object path');
  return path;
}
function entry(value, maximum, isDump = false) {
  fields(value, ['path', 'size', 'sha256']);
  if (isDump ? value.path !== 'database.dump' : !objectPath(value.path)) fail('Invalid dump path');
  if (!Number.isSafeInteger(value.size) || value.size < (isDump ? 5 : 0) || value.size > maximum) fail('Restore input exceeds byte limit');
  digest(value.sha256);
  return value;
}
function readRegular(root, path, limit) {
  let cursor = root;
  const parts = path.split('/');
  for (const part of parts.slice(0, -1)) {
    cursor = join(cursor, part);
    const stat = lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Restore input traverses a non-directory or symlink');
  }
  const absolute = join(root, path);
  const before = lstatSync(absolute);
  if (!before.isFile() || before.nlink !== 1 || before.size > limit) fail('Restore input must be a bounded regular single-link file');
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.dev !== before.dev || stat.ino !== before.ino || stat.size > limit) fail('Restore input changed during validation');
    // Read at most the approved size plus a sentinel, even if the source grows.
    const bytes = Buffer.alloc(stat.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const next = readSync(fd, bytes, count, bytes.length - count, null);
      if (next === 0) break;
      count += next;
    }
    const after = fstatSync(fd);
    if (count !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) fail('Restore input changed during reading');
    return bytes.subarray(0, count);
  } finally { closeSync(fd); }
}

function inventory(root) {
  const files = [];
  let entries = 0;
  function walk(path) {
    const directory = opendirSync(join(root, path), { bufferSize: 1 });
    try {
      let item;
      while ((item = directory.readSync()) !== null) {
      if (++entries > 1024) fail('Restore bundle has too many entries');
      const name = path ? `${path}/${item.name}` : item.name;
      if (item.isSymbolicLink()) fail('Restore bundle contains a symlink');
      if (item.isDirectory()) {
        if (name !== 'objects') objectPath(name);
        walk(name);
      } else if (item.isFile()) files.push(name);
      else fail('Restore bundle contains a special file');
      }
    } finally { directory.closeSync(); }
  }
  walk('');
  return files.sort();
}

export function prepareRestoreSnapshot(bundleRoot, expectedManifestSha256, snapshotParent) {
  digest(expectedManifestSha256);
  const root = directory(bundleRoot);
  const parent = directory(snapshotParent);
  const relation = relative(root, parent);
  if (!relation || (relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation))) fail('Snapshot directory must be outside the input bundle');
  const manifestBytes = readRegular(root, MANIFEST, MAX_MANIFEST);
  if (sha(manifestBytes) !== expectedManifestSha256) fail('Restore manifest digest mismatch');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  fields(manifest, ['version', 'database', 'objects']);
  if (manifest.version !== 1 || !Array.isArray(manifest.objects) || manifest.objects.length > MAX_OBJECTS) fail('Unsupported or oversized restore manifest');
  const dump = entry(manifest.database, MAX_DUMP, true);
  const objects = manifest.objects.map((object) => entry(object, MAX_OBJECT));
  const inputs = [dump, ...objects];
  const paths = inputs.map((input) => input.path);
  if (new Set(paths).size !== paths.length) fail('Duplicate restore object path');
  if (inputs.reduce((sum, input) => sum + input.size, 0) > MAX_TOTAL) fail('Restore bundle exceeds total byte limit');
  const expectedFiles = [MANIFEST, ...paths].sort();
  if (JSON.stringify(inventory(root)) !== JSON.stringify(expectedFiles)) fail('Restore bundle has missing or unlisted files');
  let snapshotRoot;
  try {
    snapshotRoot = mkdtempSync(join(parent, 'restore-verified-'));
    for (const input of inputs) {
      const bytes = readRegular(root, input.path, input.size);
      if (bytes.length !== input.size || sha(bytes) !== input.sha256) fail('Restore file size or digest mismatch');
      if (input === dump && bytes.subarray(0, 5).toString('ascii') !== 'PGDMP') fail('Expected a PostgreSQL custom-format dump');
      const target = join(snapshotRoot, input.path);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, bytes, { flag: 'wx', mode: 0o400 });
    }
    writeFileSync(join(snapshotRoot, MANIFEST), manifestBytes, { flag: 'wx', mode: 0o400 });
    return { snapshotRoot, manifestSha256: expectedManifestSha256, objectCount: objects.length, bytes: inputs.reduce((sum, input) => sum + input.size, 0) };
  } catch (error) {
    if (snapshotRoot) rmSync(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 5) fail('Usage: verify-restore-inputs.mjs <absolute-bundle> <externally-fixed-manifest-sha256> <absolute-snapshot-parent>');
    console.log(JSON.stringify(prepareRestoreSnapshot(...process.argv.slice(2))));
  } catch {
    console.error('Restore inputs rejected; no verified snapshot was produced.');
    process.exitCode = 1;
  }
}
