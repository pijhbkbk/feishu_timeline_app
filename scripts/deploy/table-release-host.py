#!/usr/bin/python3
"""One owner-authorized table-first release. Inputs require an external digest.

This file does not grant root trust to itself. The reviewed bytes and manifest
must be pinned by the operator outside the checkout before privileged execution.
No production rollback, data deletion, firewall or identity-provider change.
"""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import stat
import subprocess
import sys
import time
from urllib.parse import urlsplit, urlunsplit, quote, unquote

ROOT = Path('/var/lib/y9000p-private-glibc-20261106')
RUNTIME = ROOT / 'runtime-recovery'
STAGE = Path('/home/serveradmin/table-first-release-20261110/prepared')
OUT = ROOT / 'table-first-release-20261110-r03'
GUARD = RUNTIME / 'RECOVERY_BLOCKED.json'
CLAM = Path('/usr/local/lib/y9000p-clamav-update/y9000p_clamav_autoupdate.py')
TIMER = 'y9000p-clamav-autoupdate.timer'
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'TZ': 'UTC'}
RESULT = {'status': 'INCOMPLETE', 'phase': 'PRECHECK', 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
M = None
PLAN = None
OLD = {}
IDS = {}
NEW_IDS = {}
ORIGINAL = {}
LOCK = None
SWITCHED = False
PAUSED = False
PG = 'table-first-rehearsal-20261110-r03'
NET = PG + '-net'
CLONE_STARTED = False
COMMITTED = False


def need(value, code):
    if not value:
        raise RuntimeError(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_filename(value):
    need(isinstance(value, str) and 5 < len(value.encode('utf-8')) <= 240 and value.lower().endswith('.xlsx')
         and not any(c in value for c in '/\\') and not any(ord(c) < 32 or ord(c) == 127 for c in value),
         'SOURCE_FILENAME')
    return value


def syncdir(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def read(file, maximum=2 * 1024**2, uid=0):
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == uid and before.st_nlink == 1
             and not before.st_mode & 0o022 and 0 < before.st_size <= maximum, 'FILE_IDENTITY')
        data = b''
        while len(data) <= maximum:
            part = os.read(fd, min(1024**2, maximum + 1 - len(data)))
            if not part:
                break
            data += part
        after = os.fstat(fd)
        need(len(data) == before.st_size and (before.st_ino, before.st_dev, before.st_mtime_ns, before.st_ctime_ns)
             == (after.st_ino, after.st_dev, after.st_mtime_ns, after.st_ctime_ns), 'FILE_CHANGED')
        return data
    finally:
        os.close(fd)


def write(file, data, mode=0o600):
    fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    os.fchmod(fd, mode)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    syncdir(file.parent)


def save(file, value):
    write(file, (json.dumps(value, sort_keys=True, indent=2) + '\n').encode())


def run(args, timeout=45, data=None, checked=True):
    result = subprocess.run(args, input=data, capture_output=True, timeout=timeout, env=ENV, cwd='/')
    need(len(result.stdout) + len(result.stderr) < 8 * 1024**2, 'COMMAND_OUTPUT_BOUND')
    if checked and result.returncode:
        raise RuntimeError('COMMAND_FAILED_' + Path(args[0]).name + '_' + sha(result.stderr)[:12])
    return result


def inspect(cid):
    return json.loads(run(['docker', 'inspect', cid]).stdout)[0]


def ids():
    found = {}
    for name in M['SERVICES']:
        values = run(['docker', 'ps', '-aq', '--no-trunc', '--filter', 'label=com.docker.compose.project=y9000p-private',
                      '--filter', 'label=com.docker.compose.service=' + name]).stdout.decode().split()
        need(len(values) == 1 and re.fullmatch('[a-f0-9]{64}', values[0]), 'EXACT_SERVICE_' + name)
        found[name] = values[0]
    return found


def summary(container):
    return {k: container[k] for k in ['Id', 'Image', 'RestartCount']} | {
        'running': container['State']['Running'], 'startedAt': container['State']['StartedAt']}


def unaffected():
    for name in M['SERVICES'] - M['CHANGED']:
        need(summary(inspect(IDS[name])) == summary(OLD[name]), 'UNRELATED_CHANGED_' + name)


def replace(file, data, expected):
    need(sha(read(file)) == expected, 'REPLACE_BASE_CHANGED')
    temporary = file.with_name(file.name + '.table-first-tmp')
    write(temporary, data)
    os.replace(temporary, file)
    syncdir(file.parent)


def copy_input(name, entry):
    need(re.fullmatch('[A-Za-z0-9_.-]+', name) and set(entry) == {'bytes', 'sha256'}
         and 0 < entry['bytes'] <= 4 * 1024**3 and re.fullmatch('[a-f0-9]{64}', entry['sha256']), 'INPUT_SCOPE')
    source = os.open(STAGE / name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    dest = os.open(OUT / 'inputs' / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o440)
    try:
        before = os.fstat(source)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == 1000 and before.st_nlink == 1
             and not before.st_mode & 0o022 and before.st_size == entry['bytes'], 'STAGE_IDENTITY')
        digest = hashlib.sha256()
        count = 0
        with os.fdopen(dest, 'wb') as target:
            os.fchmod(target.fileno(), 0o440)
            os.fchown(target.fileno(), 0, 1000)
            while True:
                chunk = os.read(source, 1024**2)
                if not chunk:
                    break
                count += len(chunk)
                need(count <= entry['bytes'], 'INPUT_GREW')
                digest.update(chunk)
                target.write(chunk)
            target.flush()
            os.fsync(target.fileno())
        after = os.fstat(source)
        need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
             == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
             and count == entry['bytes'] and digest.hexdigest() == entry['sha256'], 'INPUT_DIGEST')
    finally:
        os.close(source)


def private_dir(name, uid=0):
    p = OUT / name
    p.mkdir(mode=0o700)
    os.chown(p, uid, uid)
    return p


def failure_suffix(stderr):
    allowed = {'MIGRATION_FILE_NAMES', 'MIGRATION_HISTORY', 'OLD_MIGRATION_CHANGED',
               'PENDING_MIGRATION_SCOPE', 'PENDING_MIGRATION_CHANGED', 'PRIVATE_DATA_CHECK_FAILED'}
    codes = [line for line in stderr.decode('utf-8', errors='replace').splitlines() if line in allowed]
    return '_' + codes[0] if len(codes) == 1 else ''


def oneoff(label, image, env_file, network, argv, output_dir, scan=False, objects=None):
    name = OUT.name + '-' + label
    need(not run(['docker', 'ps', '-aq', '--filter', 'name=^/' + name + '$']).stdout.strip(), 'PRIOR_ONEOFF')
    args = ['docker', 'create', '--name', name, '--network', network, '--read-only', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges:true', '--user', '1000:1000', '--pids-limit', '128', '--memory', '768m',
            '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m,mode=1777', '--env-file', str(env_file),
            '--mount', 'type=bind,src=' + str(OUT / 'inputs') + ',dst=/release,readonly',
            '--mount', 'type=bind,src=' + str(output_dir) + ',dst=/evidence', '--workdir', '/app', '--entrypoint', argv[0]]
    if objects:
        args += ['--mount', 'type=bind,src=' + str(objects) + ',dst=/app/var/object-storage']
    args += [image, *argv[1:]]
    cid = run(args).stdout.decode().strip()
    need(re.fullmatch('[a-f0-9]{64}', cid), 'ONEOFF_ID')
    if scan:
        run(['docker', 'network', 'connect', 'y9000p-private_scan', cid])
    c = inspect(cid)
    need(c['Config']['User'] == '1000:1000' and c['HostConfig']['ReadonlyRootfs'] and not c['HostConfig']['Privileged']
         and not any((c['NetworkSettings'].get('Ports') or {}).values())
         and set(c['NetworkSettings']['Networks']) == {network, *(['y9000p-private_scan'] if scan else [])}, 'ONEOFF_BOUNDARY')
    try:
        result = run(['docker', 'start', '-a', cid], timeout=240, checked=False)
    except BaseException:
        if inspect(cid)['State']['Running']:
            run(['docker', 'stop', '--time', '60', cid], timeout=75)
        raise
    write(output_dir / (label + '.log'), result.stdout + b'\n' + result.stderr)
    state = inspect(cid)['State']
    need(result.returncode == 0 and not state['Running'] and not state['OOMKilled'] and state['ExitCode'] == 0,
         'ONEOFF_FAILED_' + label + failure_suffix(result.stderr))
    # Retain stopped diagnostic containers; no volumes or history are removed.
    return cid


def envfile(name, values):
    need(all(re.fullmatch('[A-Z_][A-Z0-9_]*', k) and not any(c in v for c in '\x00\r\n') for k, v in values.items()), 'ENV_ENCODING')
    target = OUT / name
    write(target, ''.join(k + '=' + v + '\n' for k, v in values.items()).encode())
    return target


def dump(file):
    # PostgreSQL tools run as the container's unprivileged database UID.
    args = ['docker', 'exec', '--user', '999:999', '-e', 'PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=3000 -c timezone=UTC',
            IDS['postgres17'], '/usr/lib/postgresql/17/bin/pg_dump', '-h', '/var/run/postgresql', '-U', 'postgres', '-w',
            '--format=custom', '--no-owner', '--no-privileges', '--dbname', PLAN['database']]
    fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as target:
        p = subprocess.run(args, stdout=target, stderr=subprocess.PIPE, timeout=180, env=ENV, cwd='/')
        target.flush()
        os.fsync(target.fileno())
    need(p.returncode == 0 and 0 < file.stat().st_size <= 2 * 1024**3, 'BACKUP_FAILED')
    return {'bytes': file.stat().st_size, 'sha256': sha(read(file, 2 * 1024**3))}


def check_data(prefix, env, network, evidence):
    oneoff(prefix + '-source-readback', PLAN['images']['api'], env, network,
           ['node', '/release/table-release-data.cjs', 'source', '/release/source.json', '/evidence/source.json'], evidence)
    result = json.loads(read(evidence / 'source.json', uid=1000))
    need(all(result[k] == v for k, v in PLAN['expectedSource'].items()), 'SOURCE_COUNTS_OR_IDENTITY')
    return result


def import_data(prefix, env, network, evidence, objects):
    actor = PLAN['actorId']
    oneoff(prefix + '-import', PLAN['images']['api'], env, network,
           ['node', 'dist/cli/color-register-import.js', '/release/' + source_filename(PLAN['sourceFileName']), '/release/source.json', actor, '--preserve-production-only'],
           evidence, scan=True, objects=objects)
    args = ['node', 'dist/cli/workbook-production-adopt.js', PLAN['sourceSha256'], '2026-01', '2026-08', actor]
    oneoff(prefix + '-plan', PLAN['images']['api'], env, network, args + ['/evidence/plan.json'], evidence)
    plan = json.loads(read(evidence / 'plan.json', 48 * 1024**2, uid=1000))
    need(plan['status'] == 'PLAN_ONLY' and plan['plan']['sha256'] == PLAN['sourceSha256']
         and not plan['plan']['conflicts'] and len(plan['plan']['rows']) == 84, 'IMPORT_CONFLICT_OR_SCOPE')
    oneoff(prefix + '-adopt', PLAN['images']['api'], env, network, args + ['/evidence/adoption.json', plan['planHash']], evidence)
    return check_data(prefix, env, network, evidence)


def wait_healthy(cid):
    deadline = time.monotonic() + 150
    while time.monotonic() < deadline:
        state = inspect(cid)['State']
        need(state['Running'] and not state['OOMKilled'], 'NEW_SERVICE_STOPPED')
        if state.get('Health', {}).get('Status') == 'healthy':
            return
        time.sleep(2)
    raise RuntimeError('HEALTH_TIMEOUT')


def validate_new(c, old, cfg, name):
    need(not c['State']['Running'] and c['State']['Status'] == 'created' and c['Image'] == cfg['image'], 'NEW_IDENTITY')
    for key in ['ReadonlyRootfs', 'Privileged', 'CapDrop', 'CapAdd', 'SecurityOpt', 'Memory', 'MemorySwap', 'PidsLimit', 'NetworkMode', 'PortBindings', 'Init', 'Tmpfs', 'RestartPolicy']:
        need(c['HostConfig'].get(key) == old['HostConfig'].get(key), 'NEW_HOST_SCOPE_' + key)
    for key in ['User', 'Cmd', 'Entrypoint', 'WorkingDir', 'Healthcheck']:
        need(c['Config'].get(key) == old['Config'].get(key), 'NEW_CONFIG_SCOPE_' + key)
    before = dict(x.split('=', 1) for x in old['Config']['Env'])
    after = dict(x.split('=', 1) for x in c['Config']['Env'])
    before.update({M['ENV_KEYS'][k]: v for k, v in PLAN['identity'].items()})
    # Container-base metadata may change only to the CI-scanned image defaults.
    image_env = dict(x.split('=', 1) for x in json.loads(run(['docker', 'image', 'inspect', c['Image']]).stdout)[0]['Config']['Env'])
    old_image_env = dict(x.split('=', 1) for x in json.loads(run(['docker', 'image', 'inspect', old['Image']]).stdout)[0]['Config']['Env'])
    for k, v in image_env.items():
        if k not in before or (k in old_image_env and before[k] == old_image_env[k]):
            before[k] = v
    need(before == after, 'NEW_ENV_SCOPE_' + name)
    need(set(c['NetworkSettings']['Networks']) == set(old['NetworkSettings']['Networks'])
         and not any((c['NetworkSettings'].get('Ports') or {}).values()), 'NEW_NETWORK_SCOPE')
    wanted = {(v['source'], v['target'], not v.get('read_only', False)) for v in cfg.get('volumes', [])}
    actual = {(v['Source'], v['Destination'], v['RW']) for v in c['Mounts'] if v['Type'] == 'bind'}
    need(actual == wanted and all(v['Type'] in ['bind', 'tmpfs'] for v in c['Mounts']), 'NEW_STORAGE_SCOPE')


def check_started_ports(container, old):
    need(container['HostConfig'].get('PortBindings') == old['HostConfig'].get('PortBindings')
         and container['NetworkSettings'].get('Ports') == old['NetworkSettings'].get('Ports'), 'STARTED_PORT_SCOPE')


def http_check():
    result = {}
    for path in ['/api/health', '/build-info']:
        p = run(['curl', '--silent', '--show-error', '--fail', '--noproxy', '*', '--connect-timeout', '5', '--max-time', '20',
                 '--max-filesize', '1048576', '--resolve', 'timeline.all-too-well.com:443:192.168.1.5', 'https://timeline.all-too-well.com' + path])
        value = json.loads(p.stdout)
        need(all(value[k] == v for k, v in PLAN['identity'].items()), 'HTTPS_RUNTIME_IDENTITY')
        result[path] = {k: value[k] for k in PLAN['identity']}
    return result


def main():
    global M, PLAN, OLD, IDS, NEW_IDS, ORIGINAL, LOCK, SWITCHED, PAUSED, CLONE_STARTED, COMMITTED
    os.umask(0o077)
    need(len(sys.argv) == 2 and re.fullmatch('[a-f0-9]{64}', sys.argv[1]), 'EXTERNAL_MANIFEST_DIGEST_REQUIRED')
    need(os.geteuid() == 0 and socket.gethostname() == 'y9000p-server' and os.uname().machine == 'x86_64', 'HOST_IDENTITY')
    for p in [ROOT, RUNTIME]:
        need(p.resolve() == p and p.stat().st_uid == 0 and not p.stat().st_mode & 0o022, 'ROOT_IDENTITY')
    need(not OUT.exists() and not OUT.is_symlink() and not GUARD.exists(), 'PRIOR_ATTEMPT_OR_BLOCK')
    data = read(STAGE / 'manifest.json', uid=1000)
    need(sha(data) == sys.argv[1], 'EXTERNAL_MANIFEST_CHANGED')
    manifest = json.loads(data)
    need(set(manifest) == {'files', 'plan'}, 'MANIFEST_SCOPE')
    PLAN = manifest['plan']
    original_name = source_filename(PLAN['sourceFileName'])
    required = {'api.tar', 'web.tar', 'api-ops.tar', 'source.xlsx', 'source.json', 'table-release-data.cjs', 'table-release-model.py'}
    need(set(manifest['files']) == required and manifest['files']['source.xlsx']['sha256'] == PLAN['sourceSha256'], 'FILE_SCOPE')
    need(re.fullmatch('[A-Za-z0-9_-]{1,100}', PLAN['database']) and re.fullmatch('[A-Za-z0-9_-]{1,100}', PLAN['actorId']), 'BUSINESS_IDENTITY')
    need(shutil.disk_usage(ROOT).free > sum(x['bytes'] * 3 for x in manifest['files'].values()) + 10 * 1024**3, 'CAPACITY')
    need(run(['findmnt', '-no', 'FSTYPE', '--target', str(ROOT)]).stdout.strip() == b'ext4', 'STORAGE_TYPE')
    need(run(['systemctl', 'is-active', 'y9000p-private-business.service']).stdout.strip() == b'active', 'BUSINESS_NOT_ACTIVE')
    need(run(['systemctl', 'is-active', TIMER]).stdout.strip() == b'active', 'UPDATER_TIMER_NOT_ACTIVE')
    LOCK = os.open(ROOT / 'clamav-automatic-update/operation.lock', os.O_RDWR | os.O_NOFOLLOW)
    fcntl.flock(LOCK, fcntl.LOCK_EX | fcntl.LOCK_NB)
    OUT.mkdir(mode=0o700)
    inputs = private_dir('inputs')
    os.chown(inputs, 0, 1000)
    inputs.chmod(0o750)
    private_dir('rollback')
    save(OUT / 'manifest.json', manifest)
    for name, entry in manifest['files'].items():
        copy_input(name, entry)
    if original_name != 'source.xlsx':
        # The transported bytes remain pinned as source.xlsx. Give the importer
        # the owner's exact basename too, so source/download metadata is intact.
        write(inputs / original_name, read(inputs / 'source.xlsx', 10 * 1024**2), 0o440)
        os.chown(inputs / original_name, 0, 1000)
    # Inputs are now root-owned and digest checked; user-owned paths are no longer consumed.
    M = {'__name__': 'reviewed_release_model'}
    exec(compile(read(OUT / 'inputs/table-release-model.py'), '<pinned-release-model>', 'exec'), M)
    paths = {'compose.json': RUNTIME / 'compose.json', 'service-identities.json': RUNTIME / 'service-identities.json',
             'business-ready.py': RUNTIME / 'business-ready.py', 'clamav-updater.py': CLAM}
    ORIGINAL = {name: read(p) for name, p in paths.items()}
    candidate = M['transform'](ORIGINAL, PLAN)
    IDS = ids()
    state = json.loads(ORIGINAL['service-identities.json'])
    need(IDS == {n: v['id'] for n, v in state['services'].items()}, 'LIVE_ID_CHANGED')
    OLD = {n: inspect(cid) for n, cid in IDS.items()}
    need(all(c['Image'] == state['services'][n]['image'] and c['State']['Running'] and not c['State']['OOMKilled']
             and c['HostConfig']['ReadonlyRootfs'] and not c['HostConfig']['Privileged']
             and not any((c['NetworkSettings'].get('Ports') or {}).values()) for n, c in OLD.items()), 'BASELINE_SCOPE')
    for name, value in ORIGINAL.items():
        write(OUT / 'rollback' / name, value)
    for name in M['CHANGED']:
        save(OUT / 'rollback' / (name + '-inspect.json'), OLD[name])
    save(OUT / 'before.json', {n: summary(c) for n, c in OLD.items()})
    for name, image in PLAN['images'].items():
        run(['docker', 'load', '--input', str(OUT / 'inputs' / (name + '.tar'))], timeout=240)
        loaded = json.loads(run(['docker', 'image', 'inspect', image]).stdout)[0]
        labels = loaded['Config'].get('Labels', {})
        need(loaded['Id'] == image and loaded['Architecture'] == 'amd64' and loaded['Os'] == 'linux'
             and loaded['Config']['User'] == 'node', 'CANDIDATE_IMAGE')
        for key, label in [('sourceCommit', 'org.opencontainers.image.revision'), ('sourceTree', 'com.feishu-timeline.source-tree'),
                           ('release', 'org.opencontainers.image.version'), ('buildTime', 'org.opencontainers.image.created')]:
            need(labels[label] == PLAN['identity'][key], 'IMAGE_SOURCE_BINDING')
    api_env = dict(x.split('=', 1) for x in OLD['api']['Config']['Env'])
    api_env.update({M['ENV_KEYS'][k]: v for k, v in PLAN['identity'].items()})
    url = urlsplit(api_env['DATABASE_URL'])
    need(unquote(url.path[1:]) == PLAN['database'] and url.hostname in ['postgres17', 'postgres'], 'DATABASE_TARGET')
    production_env = envfile('production.env', api_env)
    RESULT['phase'] = 'REHEARSAL'
    RESULT['rehearsalBackup'] = dump(OUT / 'rehearsal.dump')
    need(not run(['docker', 'ps', '-aq', '--filter', 'name=^/' + PG + '$']).stdout.strip()
         and not run(['docker', 'network', 'ls', '-q', '--filter', 'name=^' + NET + '$']).stdout.strip(), 'REHEARSAL_NAME_EXISTS')
    run(['docker', 'network', 'create', '--internal', NET])
    pgdata = private_dir('rehearsal-pg', 999)
    password = secrets.token_hex(24)
    pguser = unquote(url.username or '')
    need(re.fullmatch('[A-Za-z0-9_]+', pguser), 'DATABASE_ROLE')
    pg_env = envfile('rehearsal-pg.env', {'POSTGRES_USER': pguser, 'POSTGRES_PASSWORD': password, 'POSTGRES_DB': 'rehearsal'})
    run(['docker', 'run', '-d', '--name', PG, '--network', NET, '--user', '999:999', '--read-only', '--cap-drop', 'ALL',
         '--security-opt', 'no-new-privileges:true', '--memory', '1g', '--pids-limit', '256', '--env-file', str(pg_env),
         '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m,mode=1777', '--tmpfs', '/var/run/postgresql:rw,nosuid,nodev,size=16m,mode=1777',
         '--mount', 'type=bind,src=' + str(pgdata) + ',dst=/var/lib/postgresql/data', OLD['postgres17']['Image']], timeout=60)
    CLONE_STARTED = True
    for attempt in range(60):
        if run(['docker', 'exec', '--user', '999:999', PG, 'pg_isready', '-q', '-U', pguser], checked=False).returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('REHEARSAL_POSTGRES_NOT_READY')
    with open(OUT / 'rehearsal.dump', 'rb') as source:
        restored = subprocess.run(['docker', 'exec', '-i', '--user', '999:999', PG, 'pg_restore', '-h', '/var/run/postgresql',
                                  '-U', pguser, '-w', '--exit-on-error', '--no-owner', '--no-privileges', '--dbname', 'rehearsal'],
                                 stdin=source, capture_output=True, timeout=180, env=ENV)
    write(OUT / 'restore.log', restored.stdout + restored.stderr)
    need(restored.returncode == 0, 'REHEARSAL_RESTORE_FAILED')
    clone_env = dict(api_env)
    clone_env['DATABASE_URL'] = urlunsplit(('postgresql', quote(pguser, safe='') + ':' + password + '@' + PG + ':5432', '/rehearsal', url.query, ''))
    clone_file = envfile('rehearsal.env', clone_env)
    rehearsal = private_dir('rehearsal-evidence', 1000)
    objects = private_dir('rehearsal-objects', 1000)
    oneoff('rehearsal-before', PLAN['images']['api'], clone_file, NET,
           ['node', '/release/table-release-data.cjs', 'snapshot', 'unused', '/evidence/before.json'], rehearsal)
    oneoff('rehearsal-migration-scope', PLAN['images']['api-ops'], clone_file, NET,
           ['node', '/release/table-release-data.cjs', 'migrations', '/app/prisma/migrations', '/evidence/migration-scope.json'], rehearsal)
    oneoff('rehearsal-migrate', PLAN['images']['api-ops'], clone_file, NET,
           ['/app/node_modules/.bin/prisma', 'migrate', 'deploy', '--schema', '/app/prisma/schema.prisma'], rehearsal)
    RESULT['rehearsalSource'] = import_data('rehearsal', clone_file, NET, rehearsal, objects)
    oneoff('rehearsal-compare', PLAN['images']['api'], clone_file, NET,
           ['node', '/release/table-release-data.cjs', 'compare', '/evidence/before.json', '/evidence/preserved.json'], rehearsal)
    run(['docker', 'stop', '--time', '60', PG], timeout=75)
    CLONE_STARTED = False
    unaffected()
    RESULT['phase'] = 'PRODUCTION_MAINTENANCE'
    save(GUARD, {'purpose': 'table-first-release-20261110', 'source': str(OUT)})
    SWITCHED = True
    run(['systemctl', 'stop', TIMER])
    PAUSED = True
    for name in ['timeline-proxy', 'web', 'api']:
        run(['docker', 'stop', '--time', '60', IDS[name]], timeout=75)
        stopped = inspect(IDS[name])['State']
        need(not stopped['Running'] and stopped['Pid'] == 0 and not stopped['OOMKilled'] and stopped['ExitCode'] in [0, 143], 'NORMAL_STOP_REQUIRED')
        logs = run(['docker', 'logs', IDS[name]], checked=False)
        write(OUT / 'rollback' / (name + '.log'), logs.stdout + logs.stderr)
    RESULT['productionBackup'] = dump(OUT / 'production-before.dump')
    # Preserve object bytes too; no original tree is moved or removed.
    run(['tar', '--create', '--file', str(OUT / 'production-objects.tar'), '--directory', str(ROOT), 'objects'], timeout=180)
    live = private_dir('production-evidence', 1000)
    oneoff('production-before', PLAN['images']['api'], production_env, 'y9000p-private_data',
           ['node', '/release/table-release-data.cjs', 'snapshot', 'unused', '/evidence/before.json'], live)
    oneoff('production-migration-scope', PLAN['images']['api-ops'], production_env, 'y9000p-private_data',
           ['node', '/release/table-release-data.cjs', 'migrations', '/app/prisma/migrations', '/evidence/migration-scope.json'], live)
    oneoff('production-migrate', PLAN['images']['api-ops'], production_env, 'y9000p-private_data',
           ['/app/node_modules/.bin/prisma', 'migrate', 'deploy', '--schema', '/app/prisma/schema.prisma'], live)
    RESULT['productionSource'] = import_data('production', production_env, 'y9000p-private_data', live, ROOT / 'objects')
    oneoff('production-compare', PLAN['images']['api'], production_env, 'y9000p-private_data',
           ['node', '/release/table-release-data.cjs', 'compare', '/evidence/before.json', '/evidence/preserved.json'], live)
    RESULT['phase'] = 'ACTIVATE_APPLICATIONS'
    write(OUT / 'candidate-compose.json', candidate['compose.json'])
    compose = ['docker', 'compose', '--project-name', 'y9000p-private', '--file', str(OUT / 'candidate-compose.json')]
    run(compose + ['config', '--quiet'])
    # Immutable project labels would make Compose reuse even a renamed old
    # container. Remove only stopped read-only shells, retaining old images,
    # configuration, complete inspect/logs and all bind mounts for recreation.
    for name in M['CHANGED']:
        need(not inspect(IDS[name])['State']['Running'], 'OLD_CONTAINER_RUNNING')
        run(['docker', 'rm', IDS[name]])
    run(compose + ['create', '--no-build', '--pull', 'never', '--no-deps', 'api', 'web', 'timeline-proxy'], timeout=180)
    cfg = json.loads(candidate['compose.json'])
    for name in M['CHANGED']:
        cid = run(compose + ['ps', '--all', '--quiet', name]).stdout.decode().strip()
        need(re.fullmatch('[a-f0-9]{64}', cid) and cid != IDS[name], 'NEW_EXACT_ID')
        validate_new(inspect(cid), OLD[name], cfg['services'][name], name)
        NEW_IDS[name] = cid
    replace(RUNTIME / 'compose.json', candidate['compose.json'], sha(ORIGINAL['compose.json']))
    replace(CLAM, candidate['clamav-updater.py'], sha(ORIGINAL['clamav-updater.py']))
    replace(RUNTIME / 'service-identities.json', M['identities'](ORIGINAL['service-identities.json'], candidate['compose.json'], NEW_IDS), sha(ORIGINAL['service-identities.json']))
    for name in ['api', 'web', 'timeline-proxy']:
        run(['docker', 'start', NEW_IDS[name]])
        wait_healthy(NEW_IDS[name])
        check_started_ports(inspect(NEW_IDS[name]), OLD[name])
    RESULT['http'] = http_check()
    unaffected()
    need(read(RUNTIME / 'business-ready.py') == ORIGINAL['business-ready.py'], 'RECOVERY_LOGIC_CHANGED')
    need(json.loads(read(GUARD))['source'] == str(OUT), 'GUARD_CHANGED')
    ns = {'__name__': 'verify_only', '__file__': str(CLAM)}
    exec(compile(read(CLAM), '<same-updater-new-identity>', 'exec'), ns)
    ns['baseline']()
    GUARD.unlink()
    syncdir(GUARD.parent)
    run(['systemctl', 'start', TIMER])
    PAUSED = False
    RESULT.update(status='PRODUCTION_DEPLOYED_GUI_PENDING', identity=PLAN['identity'], newServiceIDs=NEW_IDS,
                  composeSHA256=sha(candidate['compose.json']), originalDataPreserved=True, ownerAccepted=False)
    save(OUT / 'result.json', RESULT)
    COMMITTED = True
    try:
        print('TABLE_RELEASE_DEPLOYED_GUI_PENDING ' + str(OUT / 'result.json'))
    except BrokenPipeError:
        pass  # A closed operator terminal does not undo a committed release.


def retain_failure_barrier():
    """Restore the barrier before stopping a candidate, including finalization failures."""
    global PAUSED
    if not SWITCHED or COMMITTED:
        return
    if not GUARD.exists():
        save(GUARD, {'purpose': 'table-first-release-20261110', 'source': str(OUT), 'failure': True})
    need(json.loads(read(GUARD))['source'] == str(OUT), 'FAILURE_GUARD_OWNERSHIP')
    run(['systemctl', 'stop', TIMER])
    need(run(['systemctl', 'is-active', TIMER], checked=False).stdout.strip() == b'inactive', 'FAILURE_TIMER_NOT_PAUSED')
    PAUSED = True
    for cid in NEW_IDS.values():
        if inspect(cid)['State']['Running']:
            run(['docker', 'stop', '--time', '60', cid], timeout=75)
            need(not inspect(cid)['State']['Running'], 'FAILURE_CANDIDATE_NOT_STOPPED')


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        # Never replay business writes or restore over live data automatically.
        # The recovery guard blocks automatic app restart until exact review.
        cleanup_errors = []
        try:
            retain_failure_barrier()
        except BaseException as cleanup_error:
            cleanup_errors.append(str(cleanup_error) if re.fullmatch('[A-Z0-9_]{1,100}', str(cleanup_error)) else type(cleanup_error).__name__)
        RESULT.update(status='FAILED_REVIEW_REQUIRED', errorCode=str(error) if re.fullmatch('[A-Z0-9_a-z-]{1,100}', str(error)) else type(error).__name__,
                      recoveryGuardRetained=GUARD.exists(), timerPaused=PAUSED, cleanupErrors=cleanup_errors)
        if CLONE_STARTED:
            run(['docker', 'stop', '--time', '60', PG], timeout=75, checked=False)
        if OUT.exists():
            save(OUT / 'failure.json', RESULT)
        print('TABLE_RELEASE_FAILED_REVIEW_REQUIRED', file=sys.stderr)
        raise SystemExit(1)
