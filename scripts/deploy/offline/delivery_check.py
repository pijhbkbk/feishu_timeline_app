#!/usr/bin/env python3
"""Verify a materialized software delivery without relying on a source checkout.

The expected manifest digest is supplied outside this program. This is a
read-only integrity/preflight tool, never an installation or service controller.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys

MAX_FILES = 512
MAX_TOTAL = 2 * 1024**3
JOINT_IDENTITY = {
    'sourceCommit': '3a11b23edd291869d29331d2abc089d2ae6fbc67',
    'sourceTree': '8cc6afd7566142a967fd265b4a4f6b14f0c1f000',
    'release': 'truck-joint-3a11b23edd29-r01', 'buildTime': '2026-10-30T07:14:36Z',
}
JOINT_BASE_DELIVERY = 'bcfcb0f5c2411e5ee2f968e2651b8b1538ac4339fd7cc5508e7067d9d588275f'
JOINT_INPUTS = {
    'operations/application_delta.py': '055cb5d98d275b3b3f788fbd661c09edda6a9cc07539277397853cc5a4e1f86c',
    'delta/manifest.json': '97b61b6b5957e5639b806a4ffdb2283eeb7c44a941f6902dfd546a68583ebedd',
    'delta/application-delta.tar.gz': '536bb92f14fa365863f0365dd23d7a609dd9c6e41234c543fe489c7c1c24fff3',
    'inputs/base-application-manifest.json': 'c6b3f29ca19eca0111e1127d1c4e07e1f4d8d2b142893ef8f0a1ca15056db8a2',
    'inputs/composite-application-manifest.json': '55a0e2f5dd7e1cf9e7734761a9c770bf0df2dc137d9d4846ab3c9845736224e2',
}
LAYOUT_IDENTITY = {
    'sourceCommit': '5b07fe3404cb83d485b924b9fdc65f1a1a18ddf0',
    'sourceTree': '3122780c1149a496d7bd58c19cb7e88d1c1c6816',
    'release': 'truck-layout-5b07fe3404cb-r01', 'buildTime': '2026-10-31T03:14:40Z',
}
LAYOUT_INPUTS = {
    **JOINT_INPUTS,
    'delta/manifest.json': 'bb5c7d58cbe8f4433abb3509f707e7aae2a41b4c860005d82dfc7bab9d8dcb43',
    'delta/application-delta.tar.gz': '3d7637ec39a1c2cf4ee5c55dc96e9ceec7093b80a72442764b2a7a504aacf7a2',
    'inputs/composite-application-manifest.json': '8a7ac3f26c7b512999d00e29e3671634d0c0565218ca160f3642158c15d38ea2',
}
WORKBOOK_IDENTITY = {
    'sourceCommit': '9c412ddf892db584633d3e083781e8bfc393fba5',
    'sourceTree': 'dde64d42b3f35b23bde0d53a21872f4ab1a37e55',
    'release': 'truck-workbook-return-9c412ddf892d-r01', 'buildTime': '2026-10-31T05:03:04Z',
}
WORKBOOK_INPUTS = {
    **JOINT_INPUTS,
    'delta/manifest.json': '77f6b2593ab32bbd180bf2c81a6cf310880c100a1ef051b0f3843e4ec17e1862',
    'delta/application-delta.tar.gz': 'c73952d25eac483ce64184151a89377cacb34926dad3de32acfd177e76fc674d',
    'inputs/composite-application-manifest.json': 'bd0769add13d5e80983eeaa6b633098c497f5b08bfdfcd8ca7c973657eb31be3',
}


SAVE_IDENTITY = {'sourceCommit': '2e0c191f8ed1eb1bdd0f817354a0a785d0c3b126', 'sourceTree': '150440646f845b04774991ff65b2f84a37b3b968', 'release': 'truck-workbook-save-2e0c191f8ed1-r01', 'buildTime': '2026-10-31T08:03:16Z'}
SAVE_INPUTS = {
    **JOINT_INPUTS,
    'delta/manifest.json': '1eec75c5a436e2d49f4bdeff30bbeec1a856d878d243faa662a0e9e1260b7292',
    'delta/application-delta.tar.gz': '347131f4f0c9e50db30dfd1e463485a6fe9e6cbf604e584655be4ce21bacbc4a',
    'inputs/composite-application-manifest.json': 'ba756d75e325e9c40c324b395670e87c60f082e9807f7deef1fb7adefdb8313e',
}

MENU_IDENTITY = {
    'sourceCommit':'d9d00d26729e321d2904ecc1c5b5f22f1d79958c',
    'sourceTree':'8ac5b1de6101f6e96bf1608b89d58ccf23fe3d38',
    'release':'truck-toolbar-menu-d9d00d26729e-r02','buildTime':'2026-11-02T01:07:31Z',
}
MENU_INPUTS = {
    **JOINT_INPUTS,
    'delta/manifest.json':'ba0d4c52979ecabd3d9eee0546e930df04daddabc62a76fea56d7321ef4fe65a',
    'delta/application-delta.tar.gz':'9b438e13bb85739d132d94265b1f8bb40e73c8e5b806b5f1267d8c8a0ad645ad',
    'inputs/composite-application-manifest.json':'84c5472ea24bc0cbdb5893a26d9269ac0b75587f28a92817ee05523dc5c7ab88',
}

MENU_SAVE_IDENTITY = {
    'sourceCommit':'e299057a21e18f0b702e5d1bfe3d74ec47687505',
    'sourceTree':'a3d2ec84dc647d69d49e0bb995bd6e0f218351c4',
    'release':'truck-menu-save-e299057a21e1-r01','buildTime':'2026-11-02T09:16:06Z',
}
MENU_SAVE_INPUTS = {
    **JOINT_INPUTS,
    'delta/manifest.json':'3f89102e84cf5482ca6dc490d5b941664a5053ab3c337787e8a74dd309caf4de',
    'delta/application-delta.tar.gz':'706fe993c8a786b7bf5f6d4bbeb4c543d61d9b5860fe7ebe66fdbb068b0f66b1',
    'inputs/composite-application-manifest.json':'464834cd30384443a28641111ea9e672f727a9b7a2deee7a36d12a625916ad88',
}


NUMERIC_IDENTITY = {
    'sourceCommit': 'b7b8d13190758654697c47d9c582a37e8ceba7e4',
    'sourceTree': '9d405dfa5dbaa87e707889cce5bfed658266fffe',
    'release': 'truck-numeric-json-b7b8d1319075-r01',
    'buildTime': '2026-11-03T02:03:27Z',
}
NUMERIC_INPUTS = {
    **JOINT_INPUTS,
    'delta/manifest.json': '0afc682f8976d4e8be8455cc287b20e282390109d1d0e5dab4043c8ff366a25b',
    'delta/application-delta.tar.gz': '8dfa2b799e68da9251a4ba392d985d3bcaba89d6149378048dc9eec05ada6cae',
    'inputs/composite-application-manifest.json': 'a7a39435f19047fa9fdf34df248609d771bf6e0b6d4a19b26e9719c623a78fff',
}

DATE_IDENTITY = {
    'sourceCommit': 'b2e94dffdf924be0eb564148723940664028a30e',
    'sourceTree': '3cc22086db440b689122fc991d9cebd6b139820c',
    'release': 'truck-utc-json-b2e94dffdf92-r01',
    'buildTime': '2026-11-03T04:51:08Z',
}
DATE_INPUTS = {
    **JOINT_INPUTS,
    'delta/manifest.json': '945fdd6faa75979dd88f3f5d7aa77565ad5a22cb89ec79fd8be091dc4f0e4bbc',
    'delta/application-delta.tar.gz': '587ebdef19cb11abe1cd34b80a8725d05717492ef764214c315dcd4c8775e3b1',
    'inputs/composite-application-manifest.json': 'e307aee89ad1b5424445f4dac4ae0fbc4d62de51cfab8be933975a7a86d5298e',
}

SAVE_IDLE_IDENTITY = {
    'sourceCommit': '460ded4b9e093b7424aad1616966cc1686294a8c',
    'sourceTree': 'df12d1aed3e8b29778d212d4fc8cee74bd51b6fb',
    'release': 'truck-save-idle-460ded4b9e09-r01',
    'buildTime': '2026-11-03T12:29:40Z',
}
SAVE_IDLE_INPUTS = {
    **JOINT_INPUTS,
    'delta/manifest.json': '08a4fab308c3367c0caa84edbe77aecadc0127bfa1dc32b9e2923959f448d9d6',
    'delta/application-delta.tar.gz': '20d17ec5b0e90d18a1c8240d81b41dc890abf7efa786a47af2eb563b85c85a89',
    'inputs/composite-application-manifest.json': 'a148214511da4107345f2f93ba25b1e8158b6fb522e5c6d3c847b70636abfdd3',
}


CALENDAR_IDENTITY = {
    'sourceCommit': '1bf3c131bd647bff700b631af514237453c57f90',
    'sourceTree': 'ae61f4e06a9d914c0d6eefc40862e99cdbcf6d67',
    'release': 'truck-calendar-1bf3c131bd64-r01',
    'buildTime': '2026-11-03T14:34:13Z',
}
CALENDAR_INPUTS = {
    **JOINT_INPUTS,
    'operations/application_delta.py': 'fdad3c9a1e28171a29e518af9d86af687cdd14e6245565d62a1746f095607da9',
    'delta/manifest.json': 'be0d00b1cc6320af0a1b8fce5d83a16d6d01df3a3d20edc83b828282d5bcd006',
    'delta/application-delta.tar.gz': '85210cfbc83617e8218cc70e7e6ff0c47c9f38942181556b434ef9acabe933f6',
    'inputs/composite-application-manifest.json': '25982811fdc4c668ae0c2c8f55ce0d98ebbff48dc0a2a94beefde24b3206a371',
}


def need(ok, code):
    if not ok:
        raise RuntimeError('CHECK_' + code)


def relative(value):
    need(isinstance(value, str) and 0 < len(value) <= 1024 and '\\' not in value and
         not value.startswith('/') and all(x not in ('', '.', '..') for x in value.split('/')),
         'RELATIVE_PATH')
    return value


def read_file(root, name, limit, expected_size=None, expected_hash=None, retain=False):
    path = root / relative(name)
    need(path.resolve(strict=True) == path and path.is_relative_to(root), 'CANONICAL_FILE')
    before = path.lstat()
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and not before.st_mode & 0o022 and
         0 <= before.st_size <= limit, 'FILE_METADATA')
    if expected_size is not None:
        need(type(expected_size) is int and before.st_size == expected_size, 'FILE_SIZE')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    digest, size, pieces = hashlib.sha256(), 0, []
    sig = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns, s.st_mode)
    try:
        opened = os.fstat(fd)
        while size <= limit:
            part = os.read(fd, min(1024**2, limit + 1 - size))
            if not part:
                break
            digest.update(part);size += len(part)
            if retain:
                pieces.append(part)
        need(size == before.st_size and sig(before) == sig(opened) == sig(os.fstat(fd)) == sig(path.lstat()),
             'FILE_CHANGED')
    finally:
        os.close(fd)
    actual = digest.hexdigest()
    if expected_hash is not None:
        need(re.fullmatch('[a-f0-9]{64}', expected_hash) and actual == expected_hash, 'FILE_SHA256')
    return (b''.join(pieces) if retain else None), actual, size


def unique(pairs):
    result = {}
    for key, value in pairs:
        need(key not in result, 'DUPLICATE_JSON_KEY')
        result[key] = value
    return result


def check(root, manifest_sha):
    need(root.is_absolute() and root.resolve(strict=True) == root and root.is_dir(), 'DELIVERY_ROOT')
    raw, _, _ = read_file(root, 'manifest.json', 1024**2, expected_hash=manifest_sha, retain=True)
    manifest = json.loads(raw, object_pairs_hook=unique)
    joint = manifest.get('kind') == 'R30_MATERIALIZED_APPLICATION_DELTA_DELIVERY_V1'
    if joint:
        identity = manifest.get('applicationIdentity')
        inputs = (JOINT_INPUTS if identity == JOINT_IDENTITY else LAYOUT_INPUTS if identity == LAYOUT_IDENTITY
                  else WORKBOOK_INPUTS if identity == WORKBOOK_IDENTITY
                  else SAVE_INPUTS if identity == SAVE_IDENTITY
                  else MENU_INPUTS if identity == MENU_IDENTITY
                  else MENU_SAVE_INPUTS if identity == MENU_SAVE_IDENTITY
                  else NUMERIC_INPUTS if identity == NUMERIC_IDENTITY
                  else DATE_INPUTS if identity == DATE_IDENTITY
                  else SAVE_IDLE_INPUTS if identity == SAVE_IDLE_IDENTITY
                  else CALENDAR_INPUTS if identity == CALENDAR_IDENTITY else None)
        need(inputs is not None and
             manifest.get('requiredBaseDeliveryManifestSha256') == JOINT_BASE_DELIVERY and
             manifest.get('standalone') is False, 'JOINT_MANIFEST_CONTRACT')
    else:
        need(manifest.get('kind') == 'R30_MATERIALIZED_SOFTWARE_DELIVERY_V1' and
             manifest.get('applicationIdentity', {}).get('sourceCommit') == '3941beccddd0dfce94c8f0f7fd7d62819fb05270',
             'MANIFEST_CONTRACT')
    rows = manifest['files']
    need(isinstance(rows, list) and 1 <= len(rows) <= MAX_FILES, 'FILE_COUNT')
    names = [relative(r['path']) for r in rows]
    need(len(names) == len(set(names)) and 'manifest.json' not in names, 'UNIQUE_FILES')
    if joint:
        by_name = {r['path']: r for r in rows}
        need(all(by_name.get(name, {}).get('sha256') == digest
                 for name, digest in inputs.items()) and
             {'INSTALL.md', 'operations/delivery_check.py'} <= set(names), 'JOINT_INPUT_CLOSURE')
    need(all(type(r['bytes']) is int and 0 <= r['bytes'] <= 1024**3 for r in rows) and
         sum(r['bytes'] for r in rows) <= MAX_TOTAL, 'TOTAL_BOUND')
    for row in rows:
        read_file(root, row['path'], 1024**3, row['bytes'], row['sha256'])
    # All normal entrypoints must be actual named delivered files, not URLs or
    # references back to the source repository. Bindings remain explicit inputs.
    entrypoints = manifest['entrypoints']
    need(isinstance(entrypoints, dict) and 1 <= len(entrypoints) <= 16, 'ENTRYPOINT_COUNT')
    required = set()
    for entry in entrypoints.values():
        need(set(entry) == {'program', 'support', 'inputs', 'scope'}, 'ENTRYPOINT_SHAPE')
        for name in [entry['program'], *entry['support'], *entry['inputs']]:
            required.add(relative(name))
    need(required <= set(names), 'MISSING_ENTRYPOINT_FILE')
    if joint:
        need(entrypoints.get('application-delta') == {
            'program': 'operations/application_delta.py', 'support': [],
            'inputs': ['delta/manifest.json', 'delta/application-delta.tar.gz',
                       'inputs/base-application-manifest.json'],
            'scope': 'check/assemble/verify exact base plus delta; no service or database actions',
        }, 'JOINT_ENTRYPOINT_CONTRACT')
    # This bounded walk stays inside this new delivery root. Reject accidental
    # private/unknown additions and symlinks rather than following them.
    expected = set(names) | {'manifest.json', 'SHA256SUMS'}
    actual = set(); count = 0
    def walk_error(_error):
        need(False, 'TREE_READ_ERROR')
    for directory, dirs, files in os.walk(root, followlinks=False, onerror=walk_error):
        for name in dirs + files:
            count += 1;need(count <= 4096, 'TREE_BOUND')
            p = Path(directory)/name
            need(not p.is_symlink(), 'EXTRA_SYMLINK')
            if name in files:
                actual.add(p.relative_to(root).as_posix())
    need(actual == expected, 'UNLISTED_OR_MISSING_FILE')
    checksums, _, _ = read_file(root, 'SHA256SUMS', 256*1024, retain=True)
    pairs = {}
    for line in checksums.decode().splitlines():
        match = re.fullmatch(r'([a-f0-9]{64})  (.+)', line)
        need(match is not None and match[2] not in pairs, 'CHECKSUM_LINE')
        pairs[relative(match[2])] = match[1]
    need(pairs == {**{r['path']: r['sha256'] for r in rows}, 'manifest.json': manifest_sha}, 'CHECKSUM_SET')
    return {'kind': 'MATERIALIZED_DELIVERY_READONLY_PREFLIGHT_V1',
            'status': 'DELIVERED_FILES_AND_DECLARED_ENTRYPOINTS_VERIFIED_NOT_INSTALLED',
            'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'deliveryRoot': str(root),
            'manifestSha256': manifest_sha, 'files': len(rows), 'bytes': sum(r['bytes'] for r in rows),
            'entrypoints': sorted(entrypoints), 'sourceCheckoutRead': False,
            'requiredBaseDeliveryManifestSha256': JOINT_BASE_DELIVERY if joint else None,
            'baseDeliveryContentsVerifiedByThisCheck': False,
            'networkAccessed': False, 'guestAccessed': False, 'filesWritten': False,
            'installOrProductAcceptance': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--delivery-root', type=Path, required=True)
    parser.add_argument('--manifest-sha256', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(check(args.delivery_root, args.manifest_sha256)))
    except Exception as error:
        code = str(error) if isinstance(error, RuntimeError) and re.fullmatch('CHECK_[A-Z0-9_]+', str(error)) else type(error).__name__
        print(json.dumps({'status': 'DELIVERY_PREFLIGHT_REFUSED', 'errorCode': code}))
        raise SystemExit(1)
