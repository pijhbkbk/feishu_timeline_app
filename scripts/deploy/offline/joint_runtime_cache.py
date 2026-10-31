"""Recognize only Next's promoted, unchanged favicon/icon build seeds.

The assembly consumer remains strict. A running Web may materialize these two
public response bodies plus the same metadata with routeCacheLastModified.
No unknown cache path is traversed or admitted; no content is deleted or moved.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import stat

PREFIX = 'runtime/apps/web/.next/server/route-cache'
SEED = 'runtime/apps/web/.next/server/app'
ROUTES = {
    'favicon.ico': 'adb2ea089a587cf57dd95fa5b11714bc555600b8777692e029801fce568a54ac',
    'icon.svg': '46324d98b8e71cdc62410a339bc8cac206ca0a652c8fd0a60955b78d02081b73',
}


def need(ok, code):
    if not ok:
        raise RuntimeError('CHECK_CACHE_' + code)


def promoted_rows(root, declared, consumer, guard=lambda: None):
    cache = root / PREFIX
    if not os.path.lexists(cache):
        return {}, {'status': 'NO_PROMOTED_ICON_CACHE', 'paths': []}
    allowed = {}
    for name, owner in ROUTES.items():
        for suffix in ('.body', '.meta'):
            allowed[f'{PREFIX}/APP_ROUTE/{owner}/$/{name}{suffix}'] = f'{SEED}/{name}{suffix}'
    directories = consumer.directories(allowed)
    todo = [cache]; seen = {}; checked = []
    while todo:
        guard(); path = todo.pop(); rel = path.relative_to(root).as_posix(); s = path.lstat()
        need(s.st_uid == os.getuid() and s.st_gid == os.getgid() and
             path.resolve(strict=True) == path, 'OWNER_OR_CANONICAL_PATH')
        if stat.S_ISDIR(s.st_mode):
            need(rel in directories and stat.S_IMODE(s.st_mode) == 0o700, 'DIRECTORY')
            with os.scandir(path) as children:
                for child in children:
                    guard();need(len(todo)+len(checked)<32,'TREE_BOUND')
                    todo.append(Path(child.path))
        else:
            need(rel in allowed and stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and
                 stat.S_IMODE(s.st_mode) == 0o600 and s.st_size <= 8192, 'FILE')
            seed_name = allowed[rel]; seed_row = declared[seed_name]
            seed = consumer.read(root/seed_name, 8192, seed_row['sha256'])
            raw = consumer.read(path, 8192)
            if rel.endswith('.body'):
                need(raw == seed, 'BODY_DIFFERS_FROM_BUILD_SEED')
            else:
                original = json.loads(seed, object_pairs_hook=consumer.unique)
                actual = json.loads(raw, object_pairs_hook=consumer.unique)
                stamp = actual.pop('routeCacheLastModified', None)
                canonical=lambda v:json.dumps(v,sort_keys=True,separators=(',',':'),allow_nan=False)
                need(type(stamp) in (int, float) and math.isfinite(stamp) and
                     0 <= stamp < 10**15 and canonical(actual)==canonical(original), 'METADATA_DIFFERS_FROM_BUILD_SEED')
            seen[rel] = {'bytes': len(raw), 'mode': 0o600,
                         'sha256': hashlib.sha256(raw).hexdigest(), 'sourceKind': 'runtime-public-icon-cache'}
            checked.append(rel)
        need(len(todo) + len(checked) <= 32, 'TREE_BOUND')
    # Metadata is written before its body; require complete pairs before startup.
    for name, owner in ROUTES.items():
        prefix = f'{PREFIX}/APP_ROUTE/{owner}/$/{name}'
        need((prefix+'.body' in seen) == (prefix+'.meta' in seen), 'INCOMPLETE_PROMOTION')
    return seen, {'status': 'EXACT_PUBLIC_ICON_PROMOTIONS_VERIFIED', 'paths': sorted(checked),
                  'compiledManifestChanged': False, 'cacheDeletedMovedOrRewritten': False,
                  'metadataDifferenceAllowed': 'routeCacheLastModified only'}
