// Bound the large Next archive download before pnpm installs the frozen lock.
// pnpm's stalled response body has exceeded fetch-timeout in this build environment.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

export function lockedNext(lock) {
  const entries = [...lock.matchAll(/^  next@(\d+\.\d+\.\d+):\r?\n    resolution: \{integrity: (sha512-[A-Za-z0-9+/=]+)\}/gm)];
  if (entries.length !== 1) throw new Error('Expected exactly one integrity-pinned Next version.');
  return { version: entries[0][1], integrity: entries[0][2] };
}

const MAX_ARCHIVE_BYTES = 48 * 1024 * 1024;
function verifyBytes(bytes, integrity) {
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error('Next archive exceeds build download limit.');
  if ('sha512-' + createHash('sha512').update(bytes).digest('base64') !== integrity) {
    throw new Error('Next archive does not match the frozen lock integrity.');
  }
  return bytes;
}

// The optional read-only build context is a public dependency cache, never trusted input.
// A bad cache fails closed; only an absent mount falls back to the bounded download.
export function verifiedCachedArchive(file, integrity) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_ARCHIVE_BYTES) {
      throw new Error('Cached Next archive must be a nonempty regular file within the build download limit.');
    }
    const bytes = Buffer.allocUnsafe(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, null);
      if (!count) throw new Error('Cached Next archive changed while reading.');
      offset += count;
    }
    if (readSync(fd, Buffer.alloc(1), 0, 1, null)) throw new Error('Cached Next archive changed while reading.');
    return verifyBytes(bytes, integrity);
  } finally { closeSync(fd); }
}

export async function buildArchive(integrity, download, cacheFile = '/run/next-archive/next.tgz') {
  try { return verifiedCachedArchive(cacheFile, integrity); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return download();
}

export async function verifiedArchive(response, integrity) {
  if (!response.ok || !response.body) throw new Error('Next archive download failed.');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_ARCHIVE_BYTES) throw new Error('Next archive exceeds build download limit.');
    chunks.push(chunk);
  }
  return verifyBytes(Buffer.concat(chunks), integrity);
}

async function main() {
  const { version, integrity } = lockedNext(readFileSync('pnpm-lock.yaml', 'utf8'));
  const bytes = await buildArchive(integrity, async () => {
    const response = await fetch(`https://registry.npmjs.org/next/-/next-${version}.tgz`, {
      signal: AbortSignal.timeout(90000), redirect: 'error',
    });
    return verifiedArchive(response, integrity);
  });
  const directory = mkdtempSync(join(tmpdir(), 'timeline-next-'));
  try {
    const archive = join(directory, 'next.tgz');
    writeFileSync(archive, bytes, { mode: 0o600, flag: 'wx' });
    execFileSync('pnpm', ['store', 'add', archive], { stdio: 'inherit', timeout: 120000 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
