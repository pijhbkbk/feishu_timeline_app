#!/usr/bin/env python3
"""Verify/assemble an externally pinned application delta over the exact R30 base.

No service control, database access, configuration generation or base mutation.
The two declared dependency directory aliases keep the base a required input.
Failed new targets are retained; this program never overwrites or removes them.
"""
import argparse
import datetime as dt
import gzip
import hashlib
import json
import os
from pathlib import Path
import posixpath
import re
import shutil
import stat
import sys
import tarfile
import time

BASE_SHA = 'c6b3f29ca19eca0111e1127d1c4e07e1f4d8d2b142893ef8f0a1ca15056db8a2'
PREFIXES = ['apps/api/dist/', 'runtime/apps/web/']
ALIASES = ('node_modules', 'runtime/node_modules')
DANGLING = 'runtime/node_modules/.pnpm/node_modules/typescript'
# Observed alongside the running old Web, absent from its artifact manifest.
# Its contents/provenance are unknown. Never read/copy it or accept it in target.
BASE_UNCONSUMED_STATE = 'runtime/apps/web/.next/server/route-cache'
MAX_ARCHIVE = 64 * 1024**2
MAX_MANIFEST = 8 * 1024**2
MAX_FILE = 256 * 1024**2
FLOOR = 1024**3


def need(ok, code):
    if not ok:
        raise RuntimeError('CHECK_' + code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def packed(value):
    return (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()


def relative(name):
    need(isinstance(name, str) and 0 < len(name) <= 1024 and '\\' not in name
         and not name.startswith('/') and all(p not in ('', '.', '..') for p in name.split('/')),
         'RELATIVE_PATH')
    return name


def unique(pairs):
    result = {}
    for key, value in pairs:
        need(key not in result, 'DUPLICATE_KEY')
        result[key] = value
    return result


def meta(path, directory=False):
    s = path.lstat()
    need(s.st_uid == os.getuid() and s.st_gid == os.getgid(), 'OWNER')
    need(not s.st_mode & 0o022, 'WRITABLE_BY_OTHERS')
    need(path.resolve(strict=True) == path, 'CANONICAL_PATH')
    need(stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode) and s.st_nlink == 1,
         'FILE_TYPE_OR_HARDLINK')
    return s


def read(path, limit, expected=None, keep=True, guard=lambda: None):
    before = meta(path)
    need(0 <= before.st_size <= limit, 'FILE_BOUND')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    sig = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns, s.st_mode)
    h, pieces, size = hashlib.sha256(), [], 0
    try:
        opened = os.fstat(fd)
        while True:
            guard()
            b = os.read(fd, 1024**2)
            if not b:
                break
            size += len(b)
            need(size <= limit, 'READ_BOUND')
            h.update(b)
            if keep:
                pieces.append(b)
        need(size == before.st_size and sig(before) == sig(opened) == sig(os.fstat(fd))
             == sig(path.lstat()), 'FILE_CHANGED')
    finally:
        os.close(fd)
    digest = h.hexdigest()
    need(expected is None or digest == expected, 'FILE_SHA256')
    return b''.join(pieces) if keep else digest


def json_file(path, digest):
    need(re.fullmatch('[0-9a-f]{64}', digest), 'DIGEST')
    return json.loads(read(path, MAX_MANIFEST, digest), object_pairs_hook=unique)


def directories(rows):
    result = {''}
    for name in rows:
        relative(name)
        p = Path(name).parent
        while str(p) != '.':
            result.add(p.as_posix())
            p = p.parent
    need(not set(rows) & result, 'LEAF_PARENT_OVERLAP')
    return result


def validate_rows(rows):
    need(isinstance(rows, dict) and 0 < len(rows) <= 20000, 'ENTRY_COUNT')
    dirs = directories(rows)
    for name, row in rows.items():
        if 'symlink' in row:
            link = row['symlink']
            need(isinstance(link, str) and 0 < len(link) <= 1024 and not link.startswith('/')
                 and '\\' not in link, 'LINK_TEXT')
            target = posixpath.normpath(posixpath.join(posixpath.dirname(name), link))
            need(not target.startswith(('../', '/')), 'LINK_ESCAPE')
            if row.get('dangling'):
                need(name == DANGLING and link == '../typescript@5.9.3/node_modules/typescript',
                     'UNAPPROVED_DANGLING')
            else:
                need(target in rows or target in dirs, 'LINK_CLOSURE')
        else:
            need(type(row.get('bytes')) is int and 0 <= row['bytes'] <= MAX_FILE
                 and re.fullmatch('[0-9a-f]{64}', row.get('sha256', ''))
                 and type(row.get('mode')) is int and 0 <= row['mode'] <= 0o777
                 and not row['mode'] & 0o022, 'FILE_ROW')
    need(sum(r.get('bytes', 0) for r in rows.values()) <= 1024**3, 'TOTAL_BOUND')
    return dirs


def physical_tree(root, leaves, old_base=False):
    dirs = directories(leaves)
    excluded = []
    seen, seen_dirs, todo = set(), set(), [root]
    while todo:
        p = todo.pop()
        rel = p.relative_to(root).as_posix()
        rel = '' if rel == '.' else rel
        s = p.lstat()
        need(s.st_uid == os.getuid() and s.st_gid == os.getgid(), 'TREE_OWNER')
        if old_base and rel == BASE_UNCONSUMED_STATE:
            need(rel not in leaves and rel not in dirs
                 and not any(n.startswith(rel + '/') for n in leaves)
                 and alias_for(rel) is None
                 and rel.startswith('runtime/apps/web/'), 'STATE_NOT_AN_INPUT')
            meta(p, directory=True)
            need(stat.S_IMODE(s.st_mode) == 0o700, 'STATE_DIRECTORY_MODE')
            excluded.append(rel)
            continue
        if stat.S_ISDIR(s.st_mode):
            need(rel in dirs and stat.S_IMODE(s.st_mode) == 0o700, 'EXTRA_OR_WRITABLE_DIRECTORY')
            seen_dirs.add(rel)
            todo.extend(p.iterdir())
        else:
            need(rel in leaves and (stat.S_ISREG(s.st_mode) or stat.S_ISLNK(s.st_mode)), 'EXTRA_LEAF')
            seen.add(rel)
        need(len(todo) + len(seen) + len(seen_dirs) <= len(leaves) + len(dirs) + int(old_base), 'TREE_BOUND')
    need(seen == set(leaves) and seen_dirs == dirs, 'EXACT_TREE')
    return excluded


def alias_for(name):
    return next((a for a in ALIASES if name.startswith(a + '/')), None)


def verify_tree(root, rows, guard, base=None, old_base=False):
    physical = {k for k in rows if base is None or alias_for(k) is None}
    if base is not None:
        physical.update(ALIASES)
    excluded = physical_tree(root, physical, old_base=old_base)
    if base is not None:
        for a in ALIASES:
            p = root / a
            need(p.is_symlink() and os.readlink(p) == str(base / a), 'EXACT_DIRECTORY_ALIAS')
            meta(base / a, directory=True)
    dirs = directories(rows)
    allowed_names = set(rows) | dirs
    for name, row in rows.items():
        guard()
        source = base if base is not None and alias_for(name) else root
        p = source / name
        s = p.lstat()
        need(s.st_uid == os.getuid() and s.st_gid == os.getgid(), 'ENTRY_OWNER')
        if 'symlink' in row:
            need(stat.S_ISLNK(s.st_mode) and os.readlink(p) == row['symlink'], 'EXACT_LINK')
            resolved = p.resolve(strict=not row.get('dangling', False))
            allowed = [root] + ([base] if base is not None else [])
            need(any(resolved.is_relative_to(a) for a in allowed), 'RESOLVED_LINK_ESCAPE')
            if not row.get('dangling'):
                need(any(resolved.relative_to(a).as_posix() in allowed_names
                         for a in allowed if resolved.is_relative_to(a)), 'RESOLVED_LINK_CLOSURE')
        else:
            need(stat.S_IMODE(s.st_mode) == row['mode'] and s.st_size == row['bytes'], 'EXACT_MODE_SIZE')
            read(p, MAX_FILE, row['sha256'], keep=False, guard=guard)
    for rel in excluded:
        need(stat.S_IMODE(meta(root / rel, directory=True).st_mode) == 0o700, 'STATE_DIRECTORY_CHANGED')
    return excluded


def inspect_archive(path, rows, digest, guard):
    read(path, MAX_ARCHIVE, digest, keep=False, guard=guard)
    seen = set()
    with tarfile.open(path, 'r:gz') as archive:
        for item in archive:
            guard()
            need(item.name in rows and item.name not in seen, 'ARCHIVE_MEMBER')
            # Python's PAX writer uses these for long paths. The effective names
            # must still be exactly the externally pinned manifest names/links.
            need(set(item.pax_headers) <= {'path', 'linkpath'}
                 and item.pax_headers.get('path', item.name) == item.name
                 and item.pax_headers.get('linkpath', item.linkname) == item.linkname,
                 'ARCHIVE_PAX')
            seen.add(item.name)
            row = rows[item.name]
            if 'symlink' in row:
                need(item.issym() and item.linkname == row['symlink'] and item.size == 0, 'ARCHIVE_LINK')
            else:
                need(item.isfile() and item.size == row['bytes'] and item.mode == row['mode'], 'ARCHIVE_FILE')
                data = archive.extractfile(item).read(MAX_FILE + 1)
                need(len(data) == row['bytes'] and sha(data) == row['sha256'], 'ARCHIVE_CONTENT')
    need(seen == set(rows), 'ARCHIVE_MISSING')
    count = 0
    with gzip.open(path, 'rb') as stream:
        while True:
            guard()
            b = stream.read(1024**2)
            if not b:
                break
            count += len(b)
            need(count <= MAX_ARCHIVE, 'EXPANDED_ARCHIVE_BOUND')


def contract(package, digest, base_manifest):
    manifest = json_file(package / 'manifest.json', digest)
    need(manifest.get('kind') == 'APPLICATION_BASE_PLUS_DELTA_V1'
         and manifest.get('baseManifestSha256') == BASE_SHA
         and manifest.get('replacementPrefixes') == PREFIXES, 'DELTA_CONTRACT')
    base = json_file(base_manifest, BASE_SHA)
    old, new = base['entries'], manifest['entries']
    validate_rows(old)
    need(all(any(k.startswith(p) for p in PREFIXES) for k in new), 'DELTA_SCOPE')
    removed = {k for k in old if any(k.startswith(p) for p in PREFIXES)}
    need(manifest['removedBaseEntries'] == sorted(removed - set(new)), 'TOMBSTONES')
    composite = {k: v for k, v in old.items() if k not in removed}
    need(not composite.keys() & new.keys(), 'PRESERVED_OVERLAP')
    need(manifest['preservedBaseEntryCount'] == len(composite), 'PRESERVED_COUNT')
    composite.update(new)
    validate_rows(composite)
    need(manifest['compositeEntryCount'] == len(composite), 'COMPOSITE_COUNT')
    ident = manifest['identity']
    need(set(ident) == {'sourceCommit', 'sourceTree', 'release', 'buildTime'}
         and all(isinstance(x, str) and 0 < len(x) <= 128 for x in ident.values())
         and re.fullmatch('[0-9a-f]{40}', ident['sourceCommit'])
         and re.fullmatch('[0-9a-f]{40}', ident['sourceTree']), 'IDENTITY')
    archive = manifest['archive']
    need(archive['name'] == 'application-delta.tar.gz' and type(archive['bytes']) is int
         and 0 < archive['bytes'] <= MAX_ARCHIVE, 'ARCHIVE_CONTRACT')
    need((package / archive['name']).stat().st_size == archive['bytes'], 'ARCHIVE_SIZE')
    return manifest, old, composite


def write_new(path, data, mode=0o600):
    meta(path.parent, directory=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(path, mode)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def assemble(package, manifest, base, target, rows, guard):
    need(not os.path.lexists(target), 'TARGET_EXISTS')
    meta(target.parent, directory=True)
    target.mkdir(mode=0o700)
    owned = {k: v for k, v in rows.items() if alias_for(k) is None}
    for directory in sorted(directories(set(owned) | set(ALIASES)), key=lambda p: (p.count('/'), p)):
        if directory:
            (target / directory).mkdir(mode=0o700)
    # Never extractall: only the verified files are written, before any links.
    with tarfile.open(package / manifest['archive']['name'], 'r:gz') as archive:
        for item in archive:
            guard()
            if item.isfile():
                row = rows[item.name]
                data = archive.extractfile(item).read(MAX_FILE + 1)
                need(len(data) == row['bytes'] and sha(data) == row['sha256'], 'COPY_DELTA_CHANGED')
                write_new(target / item.name, data, row['mode'])
    for name, row in owned.items():
        guard()
        if name not in manifest['entries'] and 'symlink' not in row:
            data = read(base / name, MAX_FILE, row['sha256'], guard=guard)
            write_new(target / name, data, row['mode'])
    for name, row in owned.items():
        if 'symlink' in row:
            os.symlink(row['symlink'], target / name)
    for name in ALIASES:
        os.symlink(str(base / name), target / name)
    verify_tree(target, rows, guard, base)


def run(args):
    need(os.getuid() != 0, 'NON_ROOT_REQUIRED')
    started = time.monotonic()
    for p in (args.package, args.base, args.target.parent, args.receipt.parent):
        meta(p, directory=True)
    need(not os.path.lexists(args.receipt), 'RECEIPT_EXISTS')
    need(not args.target.is_relative_to(args.base) and not args.base.is_relative_to(args.target),
         'DISJOINT_BASE_TARGET')
    need(not args.target.is_relative_to(args.package) and not args.package.is_relative_to(args.target),
         'DISJOINT_PACKAGE_TARGET')
    need(not any(args.receipt.is_relative_to(p) for p in (args.base, args.package, args.target)),
         'RECEIPT_OUTSIDE_INPUTS_AND_TARGET')
    def guard():
        need(time.monotonic() - started <= 110, 'DEADLINE')
        need(shutil.disk_usage(args.target.parent).free >= FLOOR, 'GUEST_FREE_FLOOR')
    guard()
    manifest, old, rows = contract(args.package, args.manifest_sha256, args.base_manifest)
    excluded = verify_tree(args.base, old, guard, old_base=True)
    inspect_archive(args.package / manifest['archive']['name'], manifest['entries'],
                    manifest['archive']['sha256'], guard)
    if args.mode == 'assemble':
        need(shutil.disk_usage(args.target.parent).free >= FLOOR + 64 * 1024**2, 'ASSEMBLY_RESERVE')
        assemble(args.package, manifest, args.base, args.target, rows, guard)
    elif args.mode == 'verify':
        verify_tree(args.target, rows, guard, args.base)
    guard()
    result = {'kind': 'APPLICATION_DELTA_CONSUMPTION_V1', 'mode': args.mode,
              'status': 'INPUTS_VERIFIED_NOT_ASSEMBLED' if args.mode == 'check' else 'APPLICATION_VERIFIED_NOT_STARTED',
              'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'identity': manifest['identity'],
              'manifestSha256': args.manifest_sha256, 'baseManifestSha256': BASE_SHA,
              'target': str(args.target), 'base': str(args.base), 'entries': len(rows),
              'compositeEntriesSha256': sha(packed(rows)),
              'compositeManifestSha256': sha(packed({'kind': 'JOINT_BASE_PLUS_DELTA_APPLICATION_MANIFEST_V1',
                                                    'identity': manifest['identity'], 'entries': rows})),
              'directoryAliases': list(ALIASES),
              'declaredBaseEntriesVerified': len(old),
              'unconsumedBaseDirectories': [{'path': p, 'mode': '0700', 'uid': os.getuid(),
                                             'gid': os.getgid(), 'contentsInspected': False,
                                             'copied': False} for p in excluded],
              'unconsumedContentsReadCopiedOrExecuted': False,
              'baseRequired': True, 'serviceOrDatabaseActions': False,
              'elapsedSeconds': time.monotonic() - started}
    write_new(args.receipt, packed(result))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('check', 'assemble', 'verify'))
    for name in ('package', 'base', 'base-manifest', 'target', 'receipt'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--manifest-sha256', required=True)
    args = parser.parse_args()
    try:
        result = run(args)
    except Exception as exc:
        code = str(exc)
        print(json.dumps({'status': 'REJECTED', 'code': code if re.fullmatch('CHECK_[A-Z0-9_]+', code)
                          else 'CHECK_IO_OR_INPUT', 'targetMayBePartial': True}), file=sys.stderr)
        return 1
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
