"""Fixed native application containers; original production services are untouched.

Root-owned installation and separately reviewed installer are prerequisites.
Prepare binds one exact existing administrator on the verified migrated copy.
Native API/Web have no host-published ports. Final ingress is a separate cutover.
"""
import os
from pathlib import Path
import stat
import sys

INSTALLED = Path('/usr/local/lib/timeline-native-ops')
if Path(__file__).parent == INSTALLED:
    for node in [*reversed(INSTALLED.parents), INSTALLED]:
        info = node.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError('Untrusted installed controller')
    sys.path.insert(0, str(INSTALLED))
import fcntl
import json
import re
import secrets
import socket
from contextlib import contextmanager
from urllib.parse import quote
import native_backup_controller as backup
import native_runtime_network as network
import native_runtime_redis as redis
import native_migration_probe as migration
import native_database_scope as database_scope

ROOT = Path('/var/lib/timeline-native-app')
COMMIT = migration.COMMIT
TREE = migration.TREE
REGISTRY = 'us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/'
IMAGES = {
    'api': REGISTRY + 'api@sha256:e1325e8263713bfb8fc13da4aeaa0521d77617a859fc8d86d6d4157468e3e370',
    'web': REGISTRY + 'web@sha256:4d08266d5e6763da3072c895e124a1d71f2926ae7f161942ea8560b512df2d31',
}
RELEASE = 'native-auth-20260912-f2da3629e13b'
BUILD_TIME = '2026-09-12T14:22:42Z'
require = backup.require
run = network.run


def state_directory():
    fd = backup.directory(ROOT, trusted=True)
    require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700, 'Application state must be private')
    os.close(fd)


@contextmanager
def locked(component):
    require(component in ('api', 'web', 'init'), 'Unsupported app operation')
    state_directory()
    fd = os.open(ROOT / (component + '.lock'), os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        backup.regular(fd, 0, owner=0)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)


def docker(*args):
    return run(['/usr/bin/docker', *args])


def image_identity(component):
    image = json.loads(docker('image', 'inspect', IMAGES[component]))[0]
    labels = image['Config']['Labels']
    require(IMAGES[component] in image['RepoDigests'] and image['Architecture'] == 'amd64' and image['Os'] == 'linux' and
            labels['org.opencontainers.image.revision'] == COMMIT and labels['com.feishu-timeline.source-tree'] == TREE and
            labels['org.opencontainers.image.version'] == RELEASE and labels['org.opencontainers.image.created'] == BUILD_TIME,
            'Application artifact identity differs')
    return image


def name(component):
    require(component in ('api', 'web', 'init'), 'Unsupported container')
    return 'timeline-native-' + component


def inspect(component):
    names = docker('container', 'ls', '-a', '--filter', 'name=^' + name(component) + '$', '--format', '{{.ID}}').decode().splitlines()
    require(len(names) <= 1, 'Ambiguous application container')
    if not names:
        return None
    item = json.loads(docker('container', 'inspect', name(component)))[0]
    require(item['Name'] == '/' + name(component) and item['Config']['Image'] == IMAGES['api' if component == 'init' else component] and
            item['Config'].get('Labels', {}).get('com.timeline.native.service') == component + '-v1', 'Unowned application container')
    return item


def stop(component, remove=False):
    item = inspect(component)
    if item is None:
        return
    cid = item['Id']
    if item['State']['Running']:
        docker('stop', '--time=20', cid)
    final = inspect(component)
    require(final and final['Id'] == cid and not final['State']['Running'] and final['State']['Pid'] == 0, 'Application exit unproved')
    if remove:
        docker('rm', cid)
        require(inspect(component) is None, 'Application removal unproved')


def fixed_environment(credentials, redis_password):
    return {
        'NODE_ENV': 'production', 'DEPLOYMENT_ENV': 'production', 'PORT': '3001',
        'FRONTEND_URL': 'https://timeline.all-too-well.com', 'AUTH_MOCK_ENABLED': 'false',
        'NATIVE_AUTH_TRUSTED_PROXY_IP': '172.30.44.1',
        'DATABASE_URL': 'postgresql://' + migration.ROLE + ':' + quote(credentials['password'], safe='') +
                        '@172.30.44.1:16432/' + migration.DATABASE + '?connection_limit=8&pool_timeout=10',
        'REDIS_URL': 'redis://nativeapp:' + quote(redis_password, safe='') + '@172.30.44.3:6379',
        'OBJECT_STORAGE_PROVIDER': 'local', 'OBJECT_STORAGE_LOCAL_ROOT': '/app/var/object-storage',
        'MALWARE_SCANNER_PROVIDER': 'clamav', 'CLAMAV_HOST': '172.30.44.1', 'CLAMAV_PORT': '13310',
        'CLAMAV_TIMEOUT_MS': '15000', 'CLAMAV_MAX_SIGNATURE_AGE_HOURS': '48',
        'ATTACHMENT_STORAGE_GLOBAL_MAX_BYTES': '2147483648', 'ATTACHMENT_STORAGE_PROJECT_MAX_BYTES': '536870912',
        'ATTACHMENT_STORAGE_ACTOR_MAX_BYTES': '268435456', 'ATTACHMENT_STORAGE_GLOBAL_MAX_OBJECTS': '5000',
        'ATTACHMENT_STORAGE_PROJECT_MAX_OBJECTS': '1000', 'ATTACHMENT_STORAGE_ACTOR_MAX_OBJECTS': '500',
        'ATTACHMENT_STORAGE_MIN_FREE_BYTES': '1073741824', 'ATTACHMENT_STORAGE_RESERVATION_TTL_MS': '7200000',
        'ATTACHMENT_STORAGE_ACTOR_WINDOW_MS': '2592000000', 'ATTACHMENT_STORAGE_RECONCILE_INTERVAL_MS': '300000',
        'ATTACHMENT_STORAGE_RECONCILE_BATCH_SIZE': '100', 'ATTACHMENT_STORAGE_RECONCILIATION_LEASE_MS': '300000',
        'ATTACHMENT_STORAGE_RECONCILIATION_RETRY_MS': '300000', 'ATTACHMENT_STORAGE_PURGED_METADATA_RETENTION_MS': '7776000000',
        'UPLOAD_ADMISSION_GLOBAL_LIMIT': '4', 'UPLOAD_ADMISSION_PER_ACTOR_LIMIT': '2', 'UPLOAD_ADMISSION_PER_TARGET_LIMIT': '3',
        'DOWNLOAD_ADMISSION_GLOBAL_LIMIT': '8', 'DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT': '2', 'DOWNLOAD_ADMISSION_PER_TARGET_LIMIT': '2',
        'NOTIFICATION_REDIS_QUEUE_MAX_JOBS': '256', 'NOTIFICATION_MEMORY_QUEUE_MAX_JOBS': '256',
    }


def environment_bytes():
    credentials = backup.read_json(migration.RESTORE / 'credentials.json')
    require(set(credentials) == {'database', 'role', 'password'} and credentials['database'] == migration.DATABASE and
            credentials['role'] == migration.ROLE and isinstance(credentials['password'], str) and
            re.fullmatch(r'[A-Za-z0-9_-]{40,100}', credentials['password']), 'Candidate credential identity differs')
    redis.validate_files()
    password = backup.read_json(redis.ROOT / 'redis-credentials.json')['password']
    return ''.join(key + '=' + value + '\n' for key, value in fixed_environment(credentials, password).items()).encode()


def validate_files():
    state_directory()
    database_scope.verify()
    require(backup.read_file(ROOT / 'api.env', 16384, owner=0) == environment_bytes(), 'Application environment differs')
    obj = (ROOT / 'objects').lstat()
    require(stat.S_ISDIR(obj.st_mode) and obj.st_uid == 1000 and obj.st_gid == 1000 and stat.S_IMODE(obj.st_mode) == 0o700,
            'Object storage directory differs')


def arguments(component):
    api = component != 'web'
    args = ['create', '--name=' + name(component), '--label=com.timeline.native.service=' + component + '-v1',
            '--network=timeline-native-' + ('api' if api else 'web'), '--ip=' + ('172.30.44.2' if api else '172.30.45.2'),
            '--user=1000:1000', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
            '--memory=' + ('1024m' if component == 'api' else '512m'), '--memory-swap=' + ('1024m' if component == 'api' else '512m'),
            '--cpus=' + ('1.0' if api else '0.75'), '--pids-limit=128', '--ulimit=nofile=1024:1024', '--restart=no',
            '--log-opt=max-size=2m', '--log-opt=max-file=3', '--tmpfs=/tmp:rw,noexec,nosuid,size=64m']
    if api:
        args += ['--env-file=' + str(ROOT / 'api.env')]
    if component == 'api':
        args += ['--mount=type=bind,src=' + str(ROOT / 'objects') + ',dst=/app/var/object-storage']
    if component == 'init':
        args += ['--mount=type=bind,src=' + str(ROOT / 'admin.password') + ',dst=/run/admin.password,readonly']
    return args


def validate_container(component, item, image):
    host, cfg = item['HostConfig'], item['Config']
    api = component != 'web'
    expected_network = 'timeline-native-' + ('api' if api else 'web')
    require(item['Image'] == image['Id'] and cfg['User'] == '1000:1000' and cfg['Entrypoint'] == image['Config']['Entrypoint'],
            'Application executable identity differs')
    expected_cmd = ['node', 'dist/main.js'] if component == 'api' else ['node', 'server.js']
    require(cfg['Cmd'] == expected_cmd, 'Application command differs')
    require(host['NetworkMode'] == expected_network and host['ReadonlyRootfs'] is True and host['Privileged'] is False and
            host['Memory'] == (1073741824 if component == 'api' else 536870912) and host['MemorySwap'] == host['Memory'] and
            host['NanoCpus'] == (1000000000 if api else 750000000) and host['PidsLimit'] == 128 and
            host['RestartPolicy']['Name'] == 'no' and host['CapDrop'] == ['ALL'] and not host['CapAdd'] and
            not host.get('PortBindings') and host['PublishAllPorts'] is False and
            set(host['SecurityOpt']) <= {'no-new-privileges', 'no-new-privileges:true'} and bool(host['SecurityOpt']) and
            not host.get('Devices') and not host.get('DeviceRequests') and host['PidMode'] == '', 'Application isolation differs')
    mounts = {(m['Source'], m['Destination'], m['RW'], m['Type']) for m in item['Mounts']}
    expected_mounts = {(str(ROOT / 'objects'), '/app/var/object-storage', True, 'bind')} if component == 'api' else set()
    # Docker inspect reports tmpfs separately in HostConfig, not Mounts.
    require(mounts == expected_mounts and len(item['Mounts']) == len(expected_mounts) and
            host['Tmpfs'] == {'/tmp': 'rw,noexec,nosuid,size=64m'}, 'Application mounts differ')
    actual_env = dict(entry.split('=', 1) for entry in cfg['Env'])
    expected_env = dict(entry.split('=', 1) for entry in image['Config']['Env'])
    if api:
        expected_env.update(dict(line.split('=', 1) for line in environment_bytes().decode().splitlines()))
    require(actual_env == expected_env, 'Application environment identity differs')
    networks = item['NetworkSettings']['Networks']
    require(set(networks) == {expected_network} and
            networks[expected_network]['IPAMConfig']['IPv4Address'] == ('172.30.44.2' if api else '172.30.45.2'),
            'Application network attachment differs')


def prepare_start(component):
    validate_files()
    ready = backup.read_json(ROOT / 'prepared.json')
    require(ready.get('runtimeCommit') == COMMIT and ready.get('database') == migration.DATABASE and
            ready.get('administratorBound') is True, 'Candidate preparation missing')
    image = image_identity(component)
    item = inspect(component)
    if item is None:
        docker(*arguments(component), IMAGES[component])
        item = inspect(component)
    require(item is not None, 'Application creation unproved')
    validate_container(component, item, image)
    require(not item['State']['Running'], 'Application already running outside service start')


def verify_migrated_copy():
    complete = backup.read_json(migration.ROOT / 'complete.json')
    require(complete['runtimeCommit'] == COMMIT and complete['oldColumnsUnchanged'] and complete['nativeCredentials'] == 0,
            'Migration preservation proof missing')
    previous = backup.read_json(migration.ROOT / 'before.json')
    old_names = [row['migration_name'] for row in previous['migrations']]
    for table, info in previous['tables'].items():
        require(migration.projection(table, info['columns'], old_names if table == '_prisma_migrations' else None) == info['projection'],
                'Migrated copy changed before preparation')
    require(set(migration.tables()) == set(previous['tables']) | migration.NEW_TABLES, 'Candidate table inventory differs')
    expected = {m['name']: m['checksum'] for m in previous['candidate']}
    require({m['migration_name']: m['checksum'] for m in migration.migration_rows()} == expected, 'Candidate migrations differ')
    for table in migration.NEW_TABLES:
        require(migration.query('SELECT count(*) FROM public.' + migration.identifier(table) + ';') == '0', 'Candidate already used')
    return previous


def scoped_projection(table, columns, clause):
    require(table in ('users', 'audit_logs'), 'Unsupported scoped projection')
    query = 'SELECT ' + ','.join(migration.identifier(c) for c in columns) + ' FROM public.' + migration.identifier(table) + clause + ' LIMIT 50001'
    raw = migration.query("SELECT count(*)::text||':'||encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') FROM (SELECT encode(sha256(convert_to(row_to_json(r)::text,'UTF8')),'hex') h FROM (" + query + ') r) rows;')
    count, digest = raw.split(':')
    require(count.isdigit() and int(count) <= 50000 and re.fullmatch(r'[a-f0-9]{64}', digest), 'Scoped projection exceeds bound')
    return {'count': int(count), 'sha256': digest}


def prepare():
    state_directory()
    database_scope.verify()
    require(not (ROOT / 'preparation-pending.json').exists() and not (ROOT / 'prepared.json').exists(), 'Do not overwrite preparation state')
    require(all(inspect(c) is None for c in ('api', 'web', 'init')), 'Prior application containers retained')
    image_identity('api'); image_identity('web')
    previous = verify_migrated_copy()
    require(backup.sql("SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname='" + migration.ROLE + "';") == 't', 'Candidate role privileges differ')
    require(backup.sql("SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='" + migration.ROLE + "');") == '0', 'Candidate role has inherited privileges')
    require(backup.sql("SELECT count(*) FROM pg_stat_activity WHERE datname='" + migration.DATABASE + "';") == '0', 'Candidate database already in use')
    restore = backup.read_json(migration.RESTORE / 'restore-complete.json')
    require(restore['objectCount'] == 0 and restore['databaseAndObjectsVerified'] is True and
            list((migration.RESTORE / 'objects').iterdir()) == [], 'Fixed empty object baseline differs')
    # Resolve the owner's established administrator once, then bind ONLY its exact internal ID.
    ids = migration.query("SELECT id FROM public.users WHERE name='李晓晨' AND status='ACTIVE' AND \"isSystemAdmin\" IS TRUE AND (\"feishuUserId\" IS NOT NULL OR \"feishuOpenId\" IS NOT NULL) LIMIT 2;").splitlines()
    require(len(ids) == 1 and re.fullmatch(r'[A-Za-z0-9_-]{8,64}', ids[0]), 'Owner administrator identity ambiguous')
    user_id = ids[0]
    require(migration.query("SELECT count(*) FROM public.users WHERE lower(username)='lixiaochen';") == '0', 'Native username already present')
    require(migration.query("SELECT count(*) FROM public.user_roles ur JOIN public.roles r ON r.id=ur.\"roleId\" WHERE ur.\"userId\"='" + user_id + "' AND r.code='admin' AND r.status='ACTIVE';") == '1', 'Existing owner admin role differs')
    user_columns = previous['tables']['users']['columns']
    stable_users = migration.projection('users', [c for c in user_columns if c not in ('username', 'updatedAt')])
    other_users = scoped_projection('users', user_columns, " WHERE id<>'" + user_id + "'")
    require(migration.query("SELECT count(*) FROM public.audit_logs WHERE action='NATIVE_ADMIN_INITIALIZED';") == '0', 'Prior native initialization audit present')
    backup.write_json(ROOT / 'preparation-pending.json', {'runtimeCommit': COMMIT, 'database': migration.DATABASE, 'administratorId': user_id})
    try:
        backup.write_private(ROOT / 'api.env', environment_bytes())
        backup.write_private(ROOT / 'admin.password', (secrets.token_urlsafe(24) + '\n').encode())
        os.chown(ROOT / 'admin.password', 1000, 1000)
        objects = ROOT / 'objects'; objects.mkdir(mode=0o700); os.chown(objects, 1000, 1000); objects.chmod(0o700)
        backup.fsync_dir(ROOT)
        validate_files()
        backup.role_change('ALTER ROLE ' + migration.identifier(migration.ROLE) + ' LOGIN CONNECTION LIMIT 12;')
        docker(*arguments('init'), IMAGES['api'], 'node', 'dist/cli/native-account.js', 'initialize', '--username', 'lixiaochen',
               '--user-id', user_id, '--password-file', '/run/admin.password')
        raw = docker('start', '--attach', name('init'))
        require(len(raw) <= 4096, 'Unexpected initialization output')
        result = json.loads(raw)
        require(result == {'success': True, 'userId': user_id, 'username': 'lixiaochen'}, 'Administrator binding result differs')
        item = inspect('init'); require(item and not item['State']['Running'] and item['State']['ExitCode'] == 0, 'Initialization exit differs')
        require(migration.query('SELECT count(*) FROM public.users;') == '12' and
                migration.query('SELECT count(*) FROM public.local_credentials;') == '1' and
                migration.query('SELECT count(*) FROM public.auth_initialization;') == '1' and
                migration.query('SELECT count(*) FROM public.audit_logs;') == '50', 'Initialization inventory differs')
        require(migration.projection('users', [c for c in user_columns if c not in ('username', 'updatedAt')]) == stable_users and
                scoped_projection('users', user_columns, " WHERE id<>'" + user_id + "'") == other_users, 'User history changed during initialization')
        old_names = [row['migration_name'] for row in previous['migrations']]
        for table, info in previous['tables'].items():
            if table == 'users':
                continue
            actual = (scoped_projection(table, info['columns'], " WHERE action<>'NATIVE_ADMIN_INITIALIZED'") if table == 'audit_logs'
                      else migration.projection(table, info['columns'], old_names if table == '_prisma_migrations' else None))
            require(actual == info['projection'], 'Business history changed during initialization')
        require(migration.query("SELECT count(*) FROM public.users WHERE id='" + user_id + "' AND username='lixiaochen' AND \"authVersion\"=1 AND \"isSystemAdmin\" IS TRUE;") == '1', 'Administrator state differs')
        require(migration.query("SELECT count(*) FROM public.audit_logs WHERE action='NATIVE_ADMIN_INITIALIZED' AND \"actorUserId\"='" + user_id + "' AND \"targetId\"='" + user_id + "';") == '1', 'Administrator audit differs')
        stop('init', remove=True)
        backup.write_json(ROOT / 'prepared-fingerprints.json', backup.fingerprints(migration.DATABASE, migration.ROLE))
        backup.write_json(ROOT / 'prepared.json', {'runtimeCommit': COMMIT, 'database': migration.DATABASE,
                          'administratorBound': True, 'existingInternalIdPreserved': True, 'administratorId': user_id,
                          'objectsCopied': 0, 'productionChanged': False})
        (ROOT / 'preparation-pending.json').unlink(); backup.fsync_dir(ROOT)
        print(json.dumps({'candidatePrepared': True, 'existingAdministratorBound': True, 'credentialsExported': False, 'productionChanged': False}))
    except BaseException:
        recover_preparation()
        raise


def recover_preparation():
    database_scope.recover()
    if not (ROOT / 'preparation-pending.json').exists():
        return
    pending = backup.read_json(ROOT / 'preparation-pending.json')
    require(pending.get('runtimeCommit') == COMMIT and pending.get('database') == migration.DATABASE, 'Preparation journal differs')
    backup.role_change('ALTER ROLE ' + migration.identifier(migration.ROLE) + ' NOLOGIN CONNECTION LIMIT 12;')
    backup.sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='" + migration.DATABASE + "' AND usename='" + migration.ROLE + "' AND pid<>pg_backend_pid();")
    stop('init', remove=True)
    require(backup.sql("SELECT count(*) FROM pg_stat_activity WHERE datname='" + migration.DATABASE + "';") == '0', 'Candidate sessions remain')
    # Retain private journal/material for deliberate reconciliation; never retry bootstrap blindly.


def main():
    require(os.geteuid() == 0 and socket.gethostname() == 'instance-20260408-091840' and Path(__file__).parent == INSTALLED,
            'Use reviewed installed controller on intended host')
    action = sys.argv[1:]
    if action in [['prepare'], ['recover-preparation']]:
        with backup.locked():
            (prepare if action == ['prepare'] else recover_preparation)()
        return
    require(len(action) == 2 and action[0] in ('start', 'stop') and action[1] in ('api', 'web'), 'Unsupported runtime action')
    component = action[1]
    with locked(component):
        if action[0] == 'stop':
            stop(component); return
        prepare_start(component)
    os.execve('/usr/bin/docker', ['/usr/bin/docker', 'start', '--attach', name(component)], backup.ENV)


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print(json.dumps({'nativeApplication': 'FAILED', 'reason': str(error) if isinstance(error, backup.Failure) else type(error).__name__}), file=sys.stderr)
        sys.exit(1)
