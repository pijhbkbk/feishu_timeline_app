"""Fixed PG14 restored-copy migration probe. Never migrates the production DB.

Install independently reviewed bytes beside the existing backup controller. The
only writable DB is the exact previously verified restore. No API/CLI login or
background jobs run during the old-column comparison. No migrate-resolve/seed.
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

import hashlib
import json
import re
import subprocess
import time
from urllib.parse import quote
import native_backup_controller as backup

ROOT = Path('/var/lib/timeline-native-migration-probe')
RESTORE = Path('/var/lib/timeline-native-backups/restored-c38c57da')
DATABASE = 'feishu_timeline_restore_c38c57da'
ROLE = 'timeline_restore_c38c57da'
COMMIT = 'f2da3629e13b2653aae8879c98992877d5ef4170'
TREE = '435fd8f66beef2760ce02388b0948cea35cee55e'
IMAGE = 'us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/api-ops@sha256:9a86c2c82b9b098e4b03cb90b81e33e3be948b106570f458675d28631ed430c2'
CONTAINER = 'timeline-native-migration-probe'
MANIFEST_CONTAINER = 'timeline-native-migration-manifest'
LABEL = 'com.timeline.migration.probe=f2da3629e13b'
NEW_TABLES = {'attachment_storage_reservations', 'supplier_mutation_buckets', 'supplier_command_requests',
              'project_create_command_requests', 'local_credentials', 'auth_initialization'}
require = backup.require


def identifier(value):
    require(isinstance(value, str) and re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}', value), 'Unexpected SQL identifier')
    return '"' + value + '"'


def query(value):
    return backup.sql(value, DATABASE, ROLE)


def docker(*args, timeout=45):
    return backup.command(['/usr/bin/docker', *args], timeout=timeout)


def inspect(name):
    result = subprocess.run(['/usr/bin/docker', 'inspect', name], env=backup.ENV, cwd='/', capture_output=True, timeout=20)
    require(len(result.stdout) < 128 * 1024 and len(result.stderr) < 4096, 'Unexpected Docker output size')
    if result.returncode:
        require(result.returncode == 1 and b'No such' in result.stderr, 'Docker inspection failed')
        return None
    values = json.loads(result.stdout)
    require(len(values) == 1, 'Unexpected Docker state')
    item = values[0]
    require(item['Config'].get('Labels', {}).get('com.timeline.migration.probe') == 'f2da3629e13b' and
            item['Config']['Image'] == IMAGE and item['Image'] == IMAGE.split('@')[1], 'Unowned migration container')
    return item


def stop_owned(name):
    item = inspect(name)
    if item:
        if item['State']['Running']:
            docker('stop', '--time', '10', name, timeout=20)
        final = inspect(name)
        require(final and not final['State']['Running'] and final['State']['Pid'] == 0, 'Migration container exit not proved')
        docker('rm', name)


def common(name):
    return ['run', '--name', name, '--label', LABEL, '--user=1000:1000', '--read-only',
            '--cap-drop=ALL', '--security-opt=no-new-privileges', '--memory=512m', '--memory-swap=512m',
            '--cpus=0.75', '--pids-limit=64', '--ulimit=nofile=256:256', '--restart=no',
            '--log-opt=max-size=1m', '--log-opt=max-file=1', '--tmpfs=/tmp:rw,noexec,nosuid,size=64m']


def candidate_manifest():
    require(inspect(MANIFEST_CONTAINER) is None, 'Existing manifest operation')
    code = """const fs=require('node:fs'),crypto=require('node:crypto');
const names=fs.readdirSync('/app/prisma/migrations').filter(n=>/^\\d{14}_[a-z0-9_]+$/.test(n)).sort();
if(names.length!==37)throw Error('unexpected migration inventory');
const result=names.map(name=>{const file='/app/prisma/migrations/'+name+'/migration.sql';
if(fs.statSync(file).size>262144)throw Error('migration size');
return {name,checksum:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};});
process.stdout.write(JSON.stringify(result));"""
    try:
        raw = docker(*common(MANIFEST_CONTAINER), '--network=none', IMAGE, 'node', '-e', code)
        require(len(raw) <= 16384, 'Candidate migration manifest too large')
        result = json.loads(raw)
        require(len(result) == 37 and len({item['name'] for item in result}) == 37, 'Candidate migrations differ')
        for item in result:
            require(set(item) == {'name', 'checksum'} and re.fullmatch(r'\d{14}_[a-z0-9_]+', item['name']) and
                    re.fullmatch(r'[a-f0-9]{64}', item['checksum']), 'Malformed candidate migration')
        return result
    finally:
        stop_owned(MANIFEST_CONTAINER)


def tables():
    result = query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LIMIT 65;").splitlines()
    require(0 < len(result) <= 64, 'Unexpected restored table inventory')
    for name in result:
        identifier(name)
    return result


def columns(table):
    identifier(table)
    result = query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='" + table +
                   "' ORDER BY ordinal_position LIMIT 201;").splitlines()
    require(0 < len(result) <= 200, 'Unexpected restored column inventory')
    for name in result:
        identifier(name)
    return result


def projection(table, selected, migrations=None):
    clause = ''
    if migrations is not None:
        require(table == '_prisma_migrations' and len(migrations) == 26 and
                all(re.fullmatch(r'\d{14}_[a-z0-9_]+', name) for name in migrations), 'Unexpected historical migration filter')
        clause = ' WHERE migration_name IN (' + ','.join("'" + name + "'" for name in migrations) + ')'
    # One sentinel row rejects an oversized table; never aggregate an unbounded
    # collection before checking its size, and never accept a truncated digest.
    inner = 'SELECT ' + ','.join(identifier(name) for name in selected) + ' FROM public.' + identifier(table) + clause + ' LIMIT 50001'
    raw = query("SELECT count(*)::text||':'||encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') "
                "FROM (SELECT encode(sha256(convert_to(row_to_json(r)::text,'UTF8')),'hex') AS h FROM (" + inner + ') AS r) AS hashes;')
    count, digest = raw.split(':')
    require(count.isdigit() and int(count) <= 50000 and re.fullmatch(r'[a-f0-9]{64}', digest), 'Projection exceeds bounds')
    return {'count': int(count), 'sha256': digest}


def migration_rows():
    raw = query('SELECT coalesce(json_agg(r ORDER BY migration_name),\'[]\')::text FROM '
                '(SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back '
                'FROM public."_prisma_migrations" ORDER BY migration_name LIMIT 65) AS r;')
    require(len(raw) <= 32768, 'Migration state too large')
    rows = json.loads(raw)
    require(0 < len(rows) <= 64 and all(row['finished'] and not row['rolled_back'] for row in rows), 'Incomplete migration present')
    return rows


def recover():
    pending = ROOT / 'pending.json'
    if not pending.exists():
        return
    value = backup.read_json(pending)
    require(value == {'database': DATABASE, 'role': ROLE, 'container': CONTAINER, 'commit': COMMIT}, 'Migration journal rejected')
    # Share the same server lock as LOGIN, including a client killed before commit.
    backup.role_change('ALTER ROLE ' + identifier(ROLE) + ' NOLOGIN CONNECTION LIMIT 1;')
    backup.sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='" + ROLE + "' AND datname='" + DATABASE + "' AND pid<>pg_backend_pid();")
    require(backup.sql("SELECT NOT rolcanlogin AND rolconnlimit=1 FROM pg_roles WHERE rolname='" + ROLE + "';") == 't', 'Probe role closure failed')
    for attempt in range(20):
        remaining = backup.sql("SELECT count(*) FROM pg_stat_activity WHERE usename='" + ROLE + "' AND datname='" + DATABASE + "';")
        if remaining == '0':
            break
        require(attempt < 19, 'Probe database connections remain')
        time.sleep(0.1)
    errors = []
    for name in (CONTAINER, MANIFEST_CONTAINER):
        try:
            stop_owned(name)
        except BaseException as error:
            errors.append(error)
    secret = ROOT / 'probe.env'
    if secret.exists():
        backup.read_file(secret, 4096, owner=0)
        secret.unlink()
    require(not errors, 'Migration resources retained; role closed')
    pending.unlink()
    backup.fsync_dir(ROOT)


def probe():
    require(not (ROOT / 'complete.json').exists() and not (ROOT / 'pending.json').exists(), 'Probe cannot overwrite prior state')
    receipt = backup.read_json(RESTORE / 'restore-complete.json')
    require(receipt['database'] == DATABASE and receipt['role'] == ROLE and receipt['databaseAndObjectsVerified'] is True and
            receipt['manifestSha256'] == '691880a21aceb71992e78762b0082bc37a73d8a656b025a84b5d1adc283989f0', 'Verified restore identity differs')
    credentials = backup.read_json(RESTORE / 'credentials.json')
    require(set(credentials) == {'database', 'role', 'password'} and credentials['database'] == DATABASE and credentials['role'] == ROLE and
            isinstance(credentials['password'], str) and re.fullmatch(r'[A-Za-z0-9_-]{40,100}', credentials['password']), 'Restored credentials rejected')
    require(backup.sql("SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname='" + ROLE + "';") == 't', 'Restore role privileges differ')
    require(backup.sql("SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='" + ROLE + "');") == '0', 'Restore role has inherited privileges')
    require(backup.sql("SELECT count(*) FROM pg_stat_activity WHERE datname='" + DATABASE + "';") == '0', 'Restore has other clients')
    require(int(query('SELECT pg_database_size(current_database());')) <= 64 * 1024 * 1024, 'Restore exceeds approved probe size')
    image = json.loads(docker('image', 'inspect', IMAGE))[0]
    require(image['Config']['Labels']['org.opencontainers.image.revision'] == COMMIT and
            image['Config']['Labels']['com.feishu-timeline.source-tree'] == TREE and IMAGE in image['RepoDigests'], 'Ops artifact differs')
    require(inspect(CONTAINER) is None, 'Prior migration container retained')
    backup.write_json(ROOT / 'pending.json', {'database': DATABASE, 'role': ROLE, 'container': CONTAINER, 'commit': COMMIT})
    try:
        _probe_body(credentials)
    finally:
        recover()


def _probe_body(credentials):
    manifest = candidate_manifest()
    previous = migration_rows()
    expected = {item['name']: item['checksum'] for item in manifest}
    require(len(previous) == 26 and all(expected.get(row['migration_name']) == row['checksum'] for row in previous), 'Previous migration checksums differ')
    old_names = [row['migration_name'] for row in previous]
    old_tables = tables()
    require(len(old_tables) == 46 and not NEW_TABLES.intersection(old_tables), 'Unexpected original schema')
    before = {table: {'columns': columns(table)} for table in old_tables}
    for table, info in before.items():
        info['projection'] = projection(table, info['columns'])
    for table, count in [('users', 12), ('projects', 1), ('audit_logs', 49), ('attachments', 0)]:
        require(before[table]['projection']['count'] == count, 'Restore business inventory differs')
    backup.write_json(ROOT / 'before.json', {'tables': before, 'migrations': previous, 'candidate': manifest})
    try:
        url = 'postgresql://' + ROLE + ':' + quote(credentials['password'], safe='') + '@127.0.0.1:5432/' + DATABASE + '?connection_limit=2&pool_timeout=10'
        backup.write_private(ROOT / 'probe.env', ('DATABASE_URL=' + url + '\nCHECKPOINT_DISABLE=1\nPRISMA_HIDE_UPDATE_MESSAGE=1\n').encode())
        backup.role_change('ALTER ROLE ' + identifier(ROLE) + ' LOGIN CONNECTION LIMIT 3;')
        # Trusted fixed ops image; host network is temporary solely for PG14 loopback.
        # No host mounts, API, background jobs or production credentials are supplied.
        docker(*common(CONTAINER), '--network=host', '--env-file=' + str(ROOT / 'probe.env'), IMAGE,
               './node_modules/.bin/prisma', 'migrate', 'deploy', '--schema=/app/prisma/schema.prisma', timeout=300)
    finally:
        recover()
    require(set(tables()) == set(old_tables) | NEW_TABLES, 'Migrated table inventory differs')
    for table, info in before.items():
        actual = projection(table, info['columns'], old_names if table == '_prisma_migrations' else None)
        require(actual == info['projection'], 'Historical columns changed: ' + table)
    after = migration_rows()
    require(len(after) == 37 and {row['migration_name']: row['checksum'] for row in after} == expected, 'Final migrations differ')
    for table in NEW_TABLES:
        require(query('SELECT count(*) FROM public.' + identifier(table) + ';') == '0', 'New table unexpectedly populated')
    require(query('SELECT count(*) FROM public.users WHERE "authVersion"<>0 OR "requestedJob" IS NOT NULL OR "onboardingCompleted" IS DISTINCT FROM true;') == '0', 'Native defaults changed legacy identities')
    require(query('SELECT count(*) FROM public.admin_saved_views WHERE "configBytes" IS NOT NULL;') == '0', 'Legacy saved-view isolation differs')
    result = {'database': DATABASE, 'runtimeCommit': COMMIT, 'oldTablesCompared': 46, 'totalTables': 52,
              'oldColumnsUnchanged': True, 'migrationsBefore': 26, 'migrationsAfter': 37,
              'users': 12, 'projects': 1, 'auditLogs': 49, 'attachments': 0,
              'nativeCredentials': 0, 'roleClosed': True, 'productionChanged': False}
    backup.write_json(ROOT / 'complete.json', result)
    print(json.dumps(result))


def main():
    require(os.geteuid() == 0 and Path(__file__).parent == INSTALLED, 'Use the reviewed installed controller')
    fd = backup.directory(ROOT, trusted=True)
    require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700, 'Probe root must be private')
    os.close(fd)
    with backup.locked():
        if sys.argv[1:] == ['probe']:
            probe()
        elif sys.argv[1:] == ['recover']:
            recover()
        else:
            raise backup.Failure('Unsupported fixed probe operation')


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print(json.dumps({'probe': 'FAILED', 'errorType': type(error).__name__,
                          'reason': str(error) if isinstance(error, backup.Failure) else 'Probe operation failed'}), file=sys.stderr)
        sys.exit(1)
