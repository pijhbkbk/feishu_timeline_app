#!/usr/bin/env python3
"""Generate one new R30 instance, without copying old preview configuration.

Default is PLAN. The caller must independently pin this file, its two support
modules and the public binding before execution. Private values and their hashes
are never included in public receipts. No database or service command is run.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import secrets
import shutil
import socket
import stat
import subprocess
import sys
import types
import urllib.parse

UID = 1100
HOME = Path('/home/recovery')
HERE = Path(__file__).resolve().parent
IDENTITY = {'sourceCommit': '3941beccddd0dfce94c8f0f7fd7d62819fb05270',
            'sourceTree': 'db699c2e128e9c40d677de2ccca0788d8ffccdb9',
            'release': 'truck-recovery-r30-3941beccddd0', 'buildTime': '2026-10-26T12:28:07Z'}
APP_SHA = 'c6b3f29ca19eca0111e1127d1c4e07e1f4d8d2b142893ef8f0a1ca15056db8a2'
ASSEMBLY_SHA = 'cc59aa924afefbd7101ca60eda0481de5c236400ab5029b7a2b9ccbf9b8a107c'
RUNTIME_SHA = '5ee49d4eacf651ef3584fb377bab083bd24ac1ac537d05f2f4103104c70685d1'
RUNTIME_MANIFEST = '3da9be29b8d38878d4fb660d90d3fdc2f2490ef17813b723b35dc500b7ed81fd'
PLAN_SHA = '93cf60fd87d47128fdef83f5b384a58a2bfc06dab434669d6c73904e250d0962'
DEPS_SHA = '70584b72ac028d0335d3e37fdfd87ce8baccd157e25d7f1e20c9e86b25292d90'
NATIVE_SHA = '59f7dbb8308d655d3c97a6899bb76b5939ea7857abdcea008f153611f235a237'
LOADER = Path('/usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1')
LOADER_SHA = '390027e5f45f236bd1838bc54bf464c5ff01d260ab9f8b415ea8276641bce505'
OPENSSL_SHA = 'a2044013d30169104887d7823bf7a0a1d443eafc34d7501876e22da532f24f0e'
PORTS = (6381, 3594, 3595, 45474)
DB_NAME = 'truck_color_a1509_init_r29_20261026'
DB_ROLE = 'truck_color_init_r29'
RESERVE = 64 * 1024**2


def need(ok, code):
    if not ok:
        raise RuntimeError('CHECK_' + code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(p):
    need(p.is_absolute() and p.resolve(strict=True) == p, 'CANONICAL_PATH')


def read(p, limit=4*1024**2, private=False, owner=UID):
    canonical(p)
    before = p.lstat()
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
         before.st_uid == owner and not before.st_mode & 0o022 and
         0 <= before.st_size <= limit, 'INPUT_METADATA')
    if private:
        need(before.st_gid == UID and stat.S_IMODE(before.st_mode) == 0o600, 'PRIVATE_METADATA')
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        chunks, size = [], 0
        while size <= limit:
            chunk = os.read(fd, min(1024**2, limit+1-size))
            if not chunk:
                break
            chunks.append(chunk)
            size += len(chunk)
        sig = lambda x: (x.st_dev, x.st_ino, x.st_size, x.st_mtime_ns, x.st_ctime_ns)
        need(sig(before) == sig(opened) == sig(os.fstat(fd)) == sig(p.lstat()) and
             size == before.st_size, 'INPUT_CHANGED')
        return b''.join(chunks)
    finally:
        os.close(fd)


def pinned(ref, limit=4*1024**2):
    need(set(ref) == {'path', 'bytes', 'sha256'} and
         re.fullmatch('[a-f0-9]{64}', ref['sha256']), 'PIN_SHAPE')
    raw = read(Path(ref['path']), limit)
    need(len(raw) == ref['bytes'] and sha(raw) == ref['sha256'], 'INPUT_PIN')
    return json.loads(raw)


def write_new(p, value):
    raw = value if isinstance(value, bytes) else (json.dumps(value, sort_keys=True, indent=2)+'\n').encode()
    need(len(raw) <= 2*1024**2, 'OUTPUT_BOUND')
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(raw)
        f.flush()
        os.fsync(f.fileno())
    directory = os.open(p.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def support(name, expected):
    raw = read(HERE / name, 65536)
    need(sha(raw) == expected, 'SUPPORT_PIN')
    module = types.ModuleType(name[:-3])
    exec(compile(raw, str(HERE / name), 'exec'), module.__dict__)
    return module


def database_url(value):
    need(isinstance(value, str) and len(value) <= 4096 and '\n' not in value and '\r' not in value, 'DB_INPUT')
    u = urllib.parse.urlsplit(value)
    need(u.scheme == 'postgresql' and u.hostname == '127.0.0.1' and u.port == 5432 and
         u.username == DB_ROLE and u.path == '/' + DB_NAME and u.query == 'schema=public' and
         not u.fragment and u.password and len(urllib.parse.unquote(u.password)) >= 32,
         'EXACT_LOW_PRIVILEGE_DATABASE')
    return value


def binding(ref):
    b = pinned(ref)
    need(b.get('kind') == 'R30_FRESH_INSTANCE_CONFIGURATION_V1' and b.get('executionAllowed') is True and
         b.get('identity') == IDENTITY and b.get('ports') == list(PORTS), 'BINDING_CONTRACT')
    need(sys.flags.isolated and os.getuid() == os.geteuid() == os.getgid() == UID and os.uname().sysname == 'Linux' and
         os.uname().machine == 'aarch64' and os.uname().nodename == b['hostname'] and
         Path('/proc/sys/kernel/random/boot_id').read_text().strip() == b['bootId'], 'EXACT_TARGET')
    for key, prefix in [('instance', 'offline-instance-'), ('software', 'offline-software-'), ('dependencies', 'runtime-debs-')]:
        p = Path(b[key])
        need(p.parent == HOME and re.fullmatch(prefix + '[a-z0-9-]{1,48}', p.name), 'TARGET_PATH')
    need(len({b[k] for k in ('instance', 'software', 'dependencies')}) == 3, 'DISTINCT_TARGETS')
    need(b['privateDatabaseSource'] == '/home/recovery/a1509-init-r29-input-r01/connections.json', 'APPROVED_PRIVATE_INPUT')
    need(re.fullmatch('[a-z0-9][a-z0-9-]{2,62}', b['objectBucket']), 'BUCKET')
    return b


def memory(initial=False):
    text = Path('/proc/meminfo').read_text()
    found = re.search(r'^MemAvailable:\s+(\d+) kB$', text, re.M)
    need(found is not None, 'MEMORY_OBSERVATION')
    available = int(found[1]) * 1024
    need(available >= (1536 if initial else 512) * 1024**2, 'MEMORY_FLOOR')
    return available


def database_state(ref):
    state = pinned(ref, 65536)
    return validate_database_state(state)


def validate_database_state(state):
    age = (dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(state['at'])).total_seconds()
    need(state.get('kind') == 'A2_DATABASE_READONLY_STATE_VERIFIED' and 0 <= age <= 120 and
         state.get('database') == DB_NAME and state.get('role') == state.get('owner') == DB_ROLE and
         state.get('readOnlyTransaction') == 'on' and state.get('databaseWrites') is False and
         all(state.get(k) is False for k in ('superuser', 'createdb', 'createrole', 'replication', 'bypassrls', 'inherit')) and
         state.get('connectionLimit') == 3 and state.get('memberships') == 0 and
         all(state.get(k) == 0 for k in ('attachments', 'sheetImages', 'colorImportBatches', 'reservations', 'incompleteMigrations')) and
         all(state.get(k) == 1 for k in ('users', 'admins', 'credentials', 'usableCredentials', 'initializations', 'adminRoleLinks')) and
         state.get('completedMigrations') == 54 and state.get('migrationNamesEqualApprovedInitialization') is True and
         state.get('initializationReceiptSha256') == 'd911ef383340521b3d23caa7945e13c6e660cbc8602da6c9b54cab90ea3fa8ee',
         'CURRENT_INITIALIZED_DATABASE_WITHOUT_OBJECT_DEPENDENCIES')
    return state


def base_library_alias(path, owner=0):
    alias = Path(path.removesuffix('.1.0'))
    s = alias.lstat()
    need(alias.parent.resolve() == alias.parent and stat.S_ISLNK(s.st_mode) and
         s.st_uid == s.st_gid == owner and os.readlink(alias) == Path(path).name and
         alias.resolve(strict=True) == Path(path), 'BASE_UPDATE_LIBRARY_ALIAS')


def base_update(refs, combined):
    """Opt in to one externally reviewed base-package update; retain old proofs.

    These pins identify actual public source/loader evidence, not an approval.
    The caller must review and bind them outside this executable before use.
    No other package, library, or later version is admitted by this exception.
    """
    if refs is None:
        return {}, None
    pins = {'result': '8c88a81d3416506140f4f61f5afc3ff2942981bd16f95d873ad5bdbbaceeb723',
            'metadata': '5a18c71bd16dffba909339fda86dda427e359d8ef3f44a651d37106a5370313e',
            'analysis': 'dcf5c000d4934d7751969be45cd37eb5c5ed8835ddfde6877ce4a54631b0aa48'}
    need(isinstance(refs, dict) and set(refs) == set(pins) and
         all(refs[k].get('sha256') == v for k, v in pins.items()), 'EXACT_BASE_UPDATE_PINS')
    proof, metadata, analysis = (pinned(refs[k]) for k in ('result', 'metadata', 'analysis'))
    need(proof.get('kind') == 'R30_BROTLI_EXACT_UPDATE_AND_TARGETED_LOADER_V1' and
         proof.get('status') == 'OFFICIAL_PAYLOAD_READBACK_AND_AFFECTED_LIBCURL_LOADER_PASS' and
         proof.get('historicalDependencyReceiptSha256') == DEPS_SHA and
         proof.get('metadataReceiptSha256') == pins['metadata'] and
         proof.get('debAnalysisSha256') == pins['analysis'] and
         proof.get('debSha256') == analysis.get('debSha256') == metadata.get('package', {}).get('SHA256') ==
         '911411fb6fdfb4ab91dd4242f5a0a5e1f47b38e003a25c8dc7730238cb323e18' and
         proof.get('loader', {}).get('exitCode') == 0 and
         proof['loader'].get('normalizedNamedOutputEqualHistorical') is True and
         analysis.get('dependenciesUnchangedFromRetainedClosure') is True and
         metadata.get('baseCount') == 122 and
         proof.get('baseDelta') == metadata.get('baseDelta') == [
             {'package': 'libbrotli1:arm64', 'before': ['1.1.0-2build2', 'arm64', 'ii '],
              'after': ['1.1.0-2ubuntu0.1', 'arm64', 'ii ']}], 'ACTUAL_BASE_UPDATE_PROOF')
    rows = proof.get('changedNativeLibraries', [])
    expected = {
        '/usr/lib/aarch64-linux-gnu/libbrotlidec.so.1.1.0': (
            'b7895f0fd4ad47408cb01fcb959ae6792804c15512526166f9bf48358714d0b5',
            '18ab766ad16cd9806ff65a9397e6c09c6bea15d7e8ef1b7614bb4b6134a25e58', 67688),
        '/usr/lib/aarch64-linux-gnu/libbrotlicommon.so.1.1.0': (
            '016600f673a5d1a565cf98f608d8425033593ab78827eccc3384596f70386c8c',
            '71fdb0eb9f2c43c777ed0e7ab30f0741f76861739798a618ab030c12c792919c', 198784)}
    need(len(rows) == 2 and {r['path'] for r in rows} == set(expected), 'ONLY_TWO_BASE_LIBRARY_UPDATES')
    updates = {}
    for row in rows:
        old, new, size = expected[row['path']]
        need(row == {'path': row['path'], 'historicalSha256': old, 'currentSha256': new,
                     'package': 'libbrotli1:arm64', 'version': '1.1.0-2ubuntu0.1',
                     'bytes': size, 'mode': 0o644, 'uid': 0} and
             combined.get(row['path'], {}).get('sha256') == old and
             combined[row['path']].get('delivery') == 'exact-122-base', 'BASE_UPDATE_MATCHES_HISTORY')
        # The .so aliases are package payload too; reject redirection despite an unchanged real file.
        base_library_alias(row['path'])
        updates[row['path']] = row
    # Read only the selected public package identity. Never install, downgrade, or repair it here.
    command = ['/usr/bin/dpkg-query', '-W', '-f=${Version}\t${Architecture}\t${db:Status-Abbrev}\n', 'libbrotli1:arm64']
    q = subprocess.run(command, capture_output=True, timeout=10,
                       env={'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'})
    need(q.returncode == 0 and q.stdout == b'1.1.0-2ubuntu0.1\tarm64\tii \n' and not q.stderr,
         'CURRENT_BASE_PACKAGE_VERSION')
    return updates, {'receiptSha256': pins['result'], 'metadataSha256': pins['metadata'],
                     'debAnalysisSha256': pins['analysis'], 'updatedLibraries': 2,
                     'package': 'libbrotli1:arm64', 'version': '1.1.0-2ubuntu0.1',
                     'currentPackageQueryExitCode': q.returncode, 'targetedLoaderReexecutedNow': False}


def native_admission(b, c, base_update_refs=None):
    dep = pinned(b['dependencyReceipt'])
    need(b['dependencyReceipt']['sha256'] == DEPS_SHA and
         dep.get('status') == 'NEW_PREFIX_RUNTIME_PAYLOAD_AND_ELF_VERIFIED' and
         dep.get('target') == b['dependencies'] and dep.get('bootId', dep.get('platform', {}).get('bootId')) == b['bootId'] and
         dep.get('basePackageCount') == 122 and dep.get('tree') == {'regularFiles': 2263, 'symlinks': 135, 'treeVerified': True} and
         dep.get('loader', {}).get('elfCount') == 134 and dep['loader'].get('versionCommands') == 9 and
         dep.get('selectionSha256') == '35784a08501e366fd440449a085935f751ecb0428e88ca9c34412dc35b720851' and
         dep.get('baseUpdate', {}).get('overlaySha256') == '7ce7c823871d70d0e84a5a5fe1ff162c6cbaaccb5d11525f6db826c2b489e6c1', 'FULL_NATIVE_DEPENDENCIES')
    n = pinned(b['nativeReceipt'])
    need(b['nativeReceipt']['sha256'] == NATIVE_SHA and n.get('status') == 'TEN_FINAL_TARGET_ELF_PROBES_VERIFIED_NOT_STARTED' and
         n.get('bootId') == b['bootId'] and n.get('applicationAssemblyReceiptSha256') == ASSEMBLY_SHA and
         n.get('jointRuntimeAssemblyReceiptSha256') == RUNTIME_SHA and n.get('runtimeManifestSha256') == RUNTIME_MANIFEST and
         n.get('runtimeReceiptSha256') == DEPS_SHA and n.get('exactBasePackageCount') == 122 and
         n.get('finalTargetFilesVerified') is True and n.get('sourceProbeOnly') is False and
         n.get('finalJointApplicationTarget') == b['software'] + '/application' and len(n.get('roots', [])) == 10,
         'ACTUAL_JOINT_NATIVE_SUCCESS')
    rows = n.get('libraries', [])
    need(1 <= len(rows) <= 512 and len({r['path'] for r in rows}) == len(rows), 'NATIVE_SET')
    dependency_libraries = dep['loader'].get('libraries', [])
    need(1 <= len(dependency_libraries) <= 512 and
         len({r['path'] for r in dependency_libraries}) == len(dependency_libraries), 'DEPENDENCY_LIBRARY_SET')
    combined = {}
    for row in rows + dependency_libraries:
        need(row['path'] not in combined or combined[row['path']]['sha256'] == row['sha256'], 'LIBRARY_PROOF_CONFLICT')
        combined[row['path']] = row
    updates, update_evidence = base_update(base_update_refs, combined)
    for row in combined.values():
        memory()
        p = Path(row['path'])
        # Actual executable/library bytes are rechecked; no loader or version command is rerun.
        need(row.get('delivery') in {'exact-122-base', 'new-prefix-20deb', '3941-application-native',
                                    'joint-declared-runtime-root', 'joint-private-clam'}, 'NATIVE_DELIVERY')
        owner = 0 if row['delivery'] == 'exact-122-base' else UID
        raw = read(p, 256*1024**2, owner=owner)
        update = updates.get(row['path'])
        need(sha(raw) == (update['currentSha256'] if update else row['sha256']), 'NATIVE_FILE_CHANGED')
        if update:
            s = p.lstat()
            need(len(raw) == update['bytes'] and s.st_uid == s.st_gid == 0 and
                 stat.S_IMODE(s.st_mode) == 0o644, 'CURRENT_BASE_LIBRARY_METADATA')
    need(any(r['path'] == str(c.NODE) and r['sha256'] == c.NODE_SHA for r in rows), 'NATIVE_NODE')
    need(combined.get(str(LOADER), {}).get('sha256') == LOADER_SHA and
         combined.get(b['dependencies']+'/usr/bin/openssl', {}).get('sha256') == OPENSSL_SHA, 'TLS_TOOLCHAIN')
    return {'receiptSha256': NATIVE_SHA, 'dependencyReceiptSha256': DEPS_SHA,
            'librariesReadBack': len(combined), 'loaderReexecuted': False,
            'currentBaseUpdate': update_evidence}


def budget(b, budget_ref):
    policy = pinned(b['budgetPolicy'])
    receipt = pinned(budget_ref)
    roots = policy.get('expectedRootPaths', [])
    rows = receipt.get('rows', [])
    age = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(receipt['at'])).total_seconds()
    need(policy.get('kind') == 'OFFLINE_HOST_BUDGET_SCOPE_V1' and policy.get('limit') == 24*1024**3 and
         4 <= len(roots) <= 4096 and len(roots) == len(set(roots)) and 0 <= age <= 120 and
         receipt.get('scopeNarrowed') is False and receipt.get('reader') == policy.get('reader') and
         receipt.get('limit') == policy['limit'] and len(rows) == len(roots) and
         {x['path'] for x in rows} == set(roots) and
         all(type(x['allocatedBytes']) is int and x['allocatedBytes'] >= 0 for x in rows) and
         sum(x['allocatedBytes'] for x in rows) == receipt['totalAllocatedBytes'] and
         receipt['totalAllocatedBytes'] + RESERVE <= policy['limit'] and
         shutil.disk_usage(HOME).free >= 1024**3 + RESERVE, 'FRESH_COMPLETE_BUDGET')
    return {'hostAllocatedBytes': receipt['totalAllocatedBytes'], 'reservedBytes': RESERVE,
            'guestFreeBytes': shutil.disk_usage(HOME).free, 'ageSeconds': age}


def ports_free():
    sockets = []
    try:
        for port in PORTS:
            sock = socket.socket()
            sockets.append(sock)
            sock.bind(('127.0.0.1', port))
    finally:
        for sock in sockets:
            sock.close()


def child_limits():
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1024**2, 1024**2))


def tls_generate(r, dependencies):
    openssl = Path(dependencies)/'usr/bin/openssl'
    need(sha(read(openssl, 8*1024**2)) == OPENSSL_SHA and
         sha(read(LOADER, 8*1024**2, owner=0)) == LOADER_SHA, 'OPENSSL_PIN')
    library_path = dependencies+'/usr/lib/aarch64-linux-gnu:'+dependencies+'/lib/aarch64-linux-gnu'
    tls = r / 'tls'
    write_new(tls / 'leaf.ext', b'subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n')
    commands = [
        ['req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-keyout', str(tls/'ca.key'), '-out', str(tls/'ca.crt'), '-days', '30', '-sha256', '-subj', '/CN=Timeline isolated offline CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign'],
        ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(tls/'localhost.key'), '-out', str(tls/'localhost.csr'), '-subj', '/CN=localhost'],
        ['x509', '-req', '-in', str(tls/'localhost.csr'), '-CA', str(tls/'ca.crt'), '-CAkey', str(tls/'ca.key'), '-CAcreateserial', '-out', str(tls/'localhost.crt'), '-days', '30', '-sha256', '-extfile', str(tls/'leaf.ext')],
        ['verify', '-CAfile', str(tls/'ca.crt'), '-verify_hostname', 'localhost', str(tls/'localhost.crt')]]
    for i, argv in enumerate(commands):
        p = r/'private'/('tls-'+str(i)+'.log')
        with p.open('xb') as out:
            result = subprocess.run([str(LOADER), '--inhibit-cache', '--library-path', library_path, str(openssl), *argv],
                                    stdin=subprocess.DEVNULL, stdout=out, stderr=subprocess.STDOUT,
                                    env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'TZ': 'UTC', 'OPENSSL_CONF': '/dev/null'},
                                    timeout=30, preexec_fn=child_limits)
        need(result.returncode == 0, 'TLS_COMMAND_' + str(i))


def proxy_text(r, software):
    return ("import fs from 'node:fs';\nimport {createProxyServer} from " + json.dumps(str(software/'application/scripts/portable/proxy.mjs')) + ";\n" +
            "createProxyServer({origin:'https://localhost:45474',cert:fs.readFileSync(" + json.dumps(str(r/'tls/localhost.crt')) +
            "),key:fs.readFileSync(" + json.dumps(str(r/'tls/localhost.key')) + "),upstreamAddress:api=>({hostname:'127.0.0.1',port:api?3594:3595})}).listen(45474,'127.0.0.1');\n")


def redis_text(r, password):
    need(re.fullmatch('[a-f0-9]{64}', password), 'GENERATED_REDIS_PASSWORD')
    return (f'bind 127.0.0.1\nprotected-mode yes\nport 6381\nrequirepass {password}\ndaemonize no\n'
            f'pidfile {r}/redis/redis.pid\nlogfile ""\ndir {r}/redis\nappendonly yes\nappendfsync always\n'
            'aof-load-truncated no\naof-use-rdb-preamble no\nauto-aof-rewrite-percentage 0\nsave ""\n'
            'maxclients 16\nmaxmemory 33554432\nmaxmemory-policy noeviction\n')


def prepare(ref, budget_ref):
    os.umask(0o077)
    b = binding(ref)
    initial_memory = memory(initial=True)
    r, software = Path(b['instance']), Path(b['software'])
    need(not r.exists() and not r.is_symlink(), 'EXCLUSIVE_NEW_INSTANCE')
    canonical(r.parent)
    c = support('instance_software.py', b['support']['instance_software.py'])
    policy = support('instance_policy.py', b['support']['instance_policy.py'])
    c.TARGET, c.ART, c.NODE = software, software/'application', software/'runtime/node24/bin/node'
    plan = pinned(b['selectionPlan'], 65536)
    need(b['selectionPlan']['sha256'] == PLAN_SHA and plan['identity'] == IDENTITY, 'SELECTION_PLAN')
    c.installed(plan, APP_SHA, ASSEMBLY_SHA, full=True)
    native = native_admission(b, c)
    budget_result = budget(b, budget_ref)
    database_state(b['databaseState'])
    ports_free()
    source = Path(b['privateDatabaseSource'])
    db_source = json.loads(read(source, 16384, private=True))
    need(isinstance(db_source, dict) and set(db_source) == {'DATABASE_URL', 'REDIS_URL'}, 'SOURCE_CONNECTION_SHAPE')
    db = {'DATABASE_URL': database_url(db_source['DATABASE_URL'])}
    # The old Redis value is neither exported nor used.
    del db_source
    r.mkdir(mode=0o700)
    for directory in ('private', 'objects', 'tls', 'redis', 'runtime-runs'):
        (r/directory).mkdir(mode=0o700)
    write_new(r/'private/database-input.json', db)
    tls_generate(r, b['dependencies'])
    password = secrets.token_hex(32)
    env = policy.environment(db, password, r, b['objectBucket'], IDENTITY)
    write_new(r/'private/redis.conf', redis_text(r, password).encode())
    write_new(r/'private/runtime-env.json', env)
    proxy = proxy_text(r, software).encode()
    write_new(r/'proxy.mjs', proxy)
    # Run the exact compiled product validator; do not initialize Nest or connect to services.
    source_js = "try{const c=require('./apps/api/dist/common/app-config.js');const i=require('./apps/api/dist/common/build-identity.generated.js').IMMUTABLE_BUILD_IDENTITY;const v=c.resolveAppConfig(process.env,i);if(v.nodeEnv!=='production'||v.deploymentEnvironment!=='staging'||v.authMockEnabled||v.notificationQueueEnabled||v.notificationInAppReminderScanEnabled||v.malwareScannerProvider!=='clamav')process.exit(2);process.stdout.write('CONFIG_VALIDATED\\n')}catch{process.exit(1)}"
    child_env = {'PATH': '/usr/bin:/bin', 'HOME': str(HOME), 'LANG': 'C.UTF-8', 'TZ': 'UTC',
                 'LD_LIBRARY_PATH': b['dependencies']+'/usr/lib/aarch64-linux-gnu:'+b['dependencies']+'/lib/aarch64-linux-gnu', **env}
    result = subprocess.run([str(c.NODE), '--max-old-space-size=128', '-e', source_js], cwd=c.ART,
                            env=child_env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            timeout=20, preexec_fn=child_limits)
    need(result.returncode == 0 and result.stdout == b'CONFIG_VALIDATED\n', 'COMPILED_CONFIG_VALIDATION')
    # Private consistency is checked in memory; no private digest is published.
    need(json.loads(read(r/'private/runtime-env.json', 16384, private=True)) == env and
         json.loads(read(r/'private/database-input.json', 16384, private=True)) == db and
         read(r/'private/redis.conf', 8192, private=True) == redis_text(r, password).encode(), 'PRIVATE_READBACK')
    need(not any((r/'objects').iterdir()) and not any((r/'redis').iterdir()), 'NEW_EMPTY_STORAGE')
    report = {'kind': 'R30_FRESH_INSTANCE_CONFIGURATION_RESULT_V1', 'at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'status': 'NEW_CONFIG_GENERATED_AND_COMPILED_CONFIG_VALIDATED_NOT_STARTED',
              'identity': IDENTITY, 'bootId': b['bootId'], 'instance': str(r), 'software': str(software),
              'targetBinding': ref, 'budgetAdmission': budget_result, 'nativeApplicability': native,
              'initialMemAvailableBytes': initial_memory, 'databaseStateReceipt': b['databaseState'],
              'publicConfig': {k: v for k, v in env.items() if k not in ('DATABASE_URL', 'REDIS_URL')},
              'database': {'name': DB_NAME, 'role': DB_ROLE, 'host': '127.0.0.1', 'port': 5432},
              'databaseCommands': False, 'servicesStarted': False, 'historicalSessionsRestored': False,
              'privateFilesExported': False, 'newObjectsEmpty': True, 'newRedisDataEmpty': True,
              'proxySha256': sha(proxy), 'caSha256': sha(read(r/'tls/ca.crt', 32768)),
              'leafSha256': sha(read(r/'tls/localhost.crt', 32768)), 'strictCaHostnameVerified': True,
              'browserTrustChanged': False, 'fullInstallAccepted': False}
    need(shutil.disk_usage(HOME).free >= 1024**3, 'FINAL_GUEST_FLOOR')
    write_new(r/'configuration-receipt.json', report)
    return {'status': report['status'], 'receipt': str(r/'configuration-receipt.json')}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--binding', required=True)
    parser.add_argument('--binding-sha256', required=True)
    parser.add_argument('--budget', required=True)
    parser.add_argument('--budget-sha256', required=True)
    args = parser.parse_args()
    if not args.execute:
        print(json.dumps({'status': 'PLAN_ONLY_NO_TARGET_READ_OR_WRITE'}))
    else:
        try:
            refs = []
            for path, digest in [(args.binding, args.binding_sha256), (args.budget, args.budget_sha256)]:
                p = Path(path)
                refs.append({'path': str(p), 'bytes': p.lstat().st_size, 'sha256': digest})
            print(json.dumps(prepare(*refs)))
        except Exception as error:
            code = str(error) if isinstance(error, RuntimeError) and re.fullmatch('CHECK_[A-Z0-9_]+', str(error)) else type(error).__name__
            print(json.dumps({'status': 'CONFIGURATION_FAILED_PRESERVED', 'errorCode': code}))
            raise SystemExit(1)
