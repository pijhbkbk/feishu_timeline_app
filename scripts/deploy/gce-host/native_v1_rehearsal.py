"""One fixed same-host restore and migration rehearsal, separate from production.

The production snapshot stays private. Only the new rehearsal database and role
are writable. No seed, production migration, restore or account admission runs.
"""
import datetime
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
import socket
import stat
import subprocess
import sys
import time
from urllib.parse import quote

INSTALLED = Path('/usr/local/lib/timeline-native-ops')
if Path(__file__).parent == INSTALLED:
    for node in [*reversed(INSTALLED.parents), INSTALLED]:
        info = node.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError('Untrusted installed directory')
    sys.path.insert(0, str(INSTALLED))

import native_backup_controller as backup
import native_release as release
import native_release_backup as protection
import native_release_r28 as historical
import native_r28_schema as schema
import native_database_scope as scope
import native_v1_prepare as prepare
import native_v1_preservation as preservation

ROOT = Path('/var/lib/timeline-native-app/v1-rehearsal-20261104')
DATABASE = 'feishu_timeline_restore_a51d1104'
ROLE = 'timeline_restore_a51d1104'
CONTAINER = 'timeline-v1-rehearsal-20261104'
LABEL = 'com.timeline.v1.rehearsal'
require = backup.require


def plan():
    value = backup.read_json(prepare.PLAN)
    require(value['base'] == prepare.BASE and len(value['migrations']) == 54 and
            re.fullmatch(r'sha256:[a-f0-9]{64}', value['opsImageId']), 'Rehearsal plan differs')
    require(DATABASE != prepare.DATABASE and ROLE != prepare.ROLE, 'Rehearsal must be isolated')
    return value


def image_identity(value):
    raw = backup.command(['/usr/bin/docker', 'image', 'inspect', value['opsImageId']])
    require(len(raw) <= 128 * 1024, 'Image inspection exceeds bound')
    images = json.loads(raw)
    require(len(images) == 1, 'Ambiguous migration image')
    image = images[0]
    identity = value['candidate']
    labels = image['Config'].get('Labels', {})
    require(image['Id'] == value['opsImageId'] and image['Os'] == 'linux' and image['Architecture'] == 'amd64' and
            image['Config']['User'] == 'node' and
            labels.get('org.opencontainers.image.revision') == identity['sourceCommit'] and
            labels.get('com.feishu-timeline.source-tree') == identity['sourceTree'] and
            labels.get('org.opencontainers.image.version') == identity['release'] and
            labels.get('org.opencontainers.image.created') == identity['buildTime'], 'Migration image identity differs')


def recover():
    require(DATABASE != prepare.DATABASE and ROLE != prepare.ROLE, 'Production recovery forbidden')
    if not os.path.lexists(ROOT / 'pending.json'):
        return
    pending = backup.read_json(ROOT / 'pending.json')
    require(pending == {'database': DATABASE, 'role': ROLE, 'planSha256': backup.sha(
        backup.read_file(prepare.PLAN, 32768, owner=0))}, 'Rehearsal recovery binding differs')
    # Close only this new role before handling a possibly live migration worker.
    # Match the existing restore controller's create/recover transaction lock.
    # A concurrent CREATE ROLE may be invisible until its transaction commits.
    backup.sql('DO $timeline_recover$ BEGIN PERFORM pg_advisory_xact_lock(' + backup.ROLE_CHANGE_LOCK +
        "); IF EXISTS (SELECT FROM pg_roles WHERE rolname='" + ROLE + "') THEN ALTER ROLE \"" + ROLE +
        '" NOLOGIN; END IF; END $timeline_recover$;')
    exists = backup.sql("SELECT count(*) FROM pg_roles WHERE rolname='" + ROLE + "';")
    if exists == '1':
        require(backup.sql("SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='" + ROLE + "';") == 't',
                'Rehearsal role closure unverified')
        backup.sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='" + ROLE + "' AND pid<>pg_backend_pid();")
    else:
        require(exists == '0', 'Ambiguous rehearsal role')
    names = backup.command(['/usr/bin/docker', 'ps', '-aq', '--filter', 'name=^' + CONTAINER + '$']).decode().splitlines()
    require(len(names) <= 1, 'Ambiguous rehearsal worker')
    if names:
        item = json.loads(backup.command(['/usr/bin/docker', 'inspect', CONTAINER]))[0]
        value = plan()
        require(item['Image'] == value['opsImageId'] and item['Name'] == '/' + CONTAINER and
                item['Config'].get('Labels', {}).get(LABEL) == pending['planSha256'], 'Unowned rehearsal worker')
        if item['State']['Running']:
            backup.command(['/usr/bin/docker', 'stop', '--time=10', CONTAINER], timeout=20)
        final = json.loads(backup.command(['/usr/bin/docker', 'inspect', CONTAINER]))[0]
        require(final['Id'] == item['Id'] and not final['State']['Running'] and final['State']['Pid'] == 0,
                'Rehearsal worker exit unverified')
    require(backup.sql("SELECT count(*) FROM pg_stat_activity WHERE usename='" + ROLE + "';") == '0',
            'Rehearsal sessions remain')


def schema_bytes(database, role):
    require((database, role) in [(prepare.DATABASE, prepare.ROLE), (DATABASE, ROLE)], 'Schema read scope differs')
    raw = backup.command([backup.PG + 'pg_dump', '--schema-only', '--no-owner', '--no-privileges',
                          '--role=' + role, '--dbname=' + database], user='postgres').decode()
    require(len(raw) <= 4 * 1024 * 1024, 'Schema dump exceeds bound')
    return re.sub(r'(?m)^\\(un)?restrict [A-Za-z0-9]+$', r'\\\1restrict FIXED_GUARD', raw)


def probe(database, password):
    require(database in (DATABASE, 'postgres', 'feishu_timeline', prepare.DATABASE), 'Rehearsal probe scope differs')
    account = pwd.getpwnam(backup.RESTORE_OS_USER)
    return subprocess.run([backup.PG + 'psql', '-X', '-qAt', '-w', '-h', '127.0.0.1', '-p', '5432',
                           '-U', ROLE, '-d', database, '-c', 'SELECT 1;'], cwd='/',
                          env={**backup.ENV, 'PGPASSWORD': password}, capture_output=True, timeout=15,
                          user=account.pw_uid, group=account.pw_gid, extra_groups=[])


def install_scope():
    require(backup.sql('SHOW hba_file;') == str(scope.HBA), 'Unexpected effective HBA')
    original = scope.read_hba()
    require(scope.scope_bytes_valid(original), 'HBA preimage differs')
    prefix = scope.PREFIX + scope.V1_REHEARSAL_PREFIX
    if not original.startswith(prefix):
        replacement = prefix + original[len(scope.PREFIX):]
        require(scope.scope_bytes_valid(replacement), 'Rehearsal HBA scope differs')
        backup.write_private(ROOT / 'hba-before.conf', original)
        temporary = scope.HBA.parent / '.timeline-v1-rehearsal-hba.pending'
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
        try:
            with os.fdopen(fd, 'wb', closefd=False) as stream:
                stream.write(replacement)
                stream.flush()
            account = pwd.getpwnam('postgres')
            os.fchown(fd, account.pw_uid, account.pw_gid)
            os.fchmod(fd, 0o640)
            os.fsync(fd)
        finally:
            os.close(fd)
        require(scope.read_hba() == original, 'HBA changed while preparing scoped replacement')
        os.replace(temporary, scope.HBA)
        fd = backup.directory(scope.HBA.parent, trusted=False)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    require(scope.read_hba().startswith(prefix) and scope.scope_bytes_valid(scope.read_hba()), 'Scoped HBA readback differs')
    require(backup.sql('SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL;') == '0', 'HBA parse failed')
    require(backup.sql('SELECT pg_reload_conf();') == 't', 'HBA reload failed')
    # The rule must actually be loaded before the new role is created or opened.
    for attempt in range(20):
        rejected = probe('postgres', 'invalid-rehearsal-scope-probe')
        if rejected.returncode != 0 and b'pg_hba.conf rejects connection' in rejected.stderr:
            break
        require(attempt < 19, 'Rehearsal HBA rule is not effective')
        time.sleep(.2)
    scope.verify()


def verify_scope(password):
    for database in ('postgres', 'feishu_timeline', prepare.DATABASE):
        denied = probe(database, password)
        require(denied.returncode != 0 and b'pg_hba.conf rejects connection' in denied.stderr,
                'Rehearsal role can reach a different database')
    wrong = probe(DATABASE, 'invalid-' + secrets.token_urlsafe(36))
    require(wrong.returncode != 0 and b'password authentication failed' in wrong.stderr,
            'Rehearsal route accepts an incorrect password')
    allowed = probe(DATABASE, password)
    require(allowed.returncode == 0 and allowed.stdout.strip() == b'1', 'Rehearsal target authentication failed')


def run():
    prepare.baseline()
    prepare.saved('RESUMED')
    value = plan()
    image_identity(value)
    require(shutil.disk_usage(backup.ROOT).free >= 2 * 1024**3, 'Insufficient rehearsal headroom')
    require(not os.path.lexists(ROOT), 'Prior rehearsal retained; no automatic replay')
    require(backup.sql("SELECT count(*) FROM pg_roles WHERE rolname='" + ROLE + "';") == '0' and
            backup.sql("SELECT count(*) FROM pg_database WHERE datname='" + DATABASE + "';") == '0',
            'Rehearsal identity already exists')
    receipt = prepare.saved('PROTECTED')['backup']
    manifest = protection.verify_backup(receipt)
    before = backup.read_json(prepare.ROOT / 'before.json')
    old_manifest = before['migrations']
    require(all(value['migrations'].get(name) == digest for name, digest in old_manifest.items()),
            'Backup and candidate migration prefixes differ')
    dump = backup.read_file(backup.ROOT / receipt['backup'] / 'database.dump', backup.MAX_DUMP, owner=0)
    require(backup.sha(dump) == manifest['database']['sha256'], 'Backup dump changed')
    account = pwd.getpwnam(backup.RESTORE_OS_USER)
    require(account.pw_uid > 0 and account.pw_gid > 0 and account.pw_dir == '/nonexistent' and
            account.pw_shell in ('/usr/sbin/nologin', '/bin/false'), 'Dedicated restore OS account differs')
    ROOT.mkdir(mode=0o700)
    backup.fsync_dir(ROOT.parent)
    password = secrets.token_urlsafe(36)
    backup.write_json(ROOT / 'credentials.json', {'database': DATABASE, 'role': ROLE, 'password': password})
    backup.write_json(ROOT / 'pending.json', {'database': DATABASE, 'role': ROLE,
        'planSha256': backup.sha(backup.read_file(prepare.PLAN, 32768, owner=0))})
    query = lambda sql: backup.sql(sql, DATABASE, ROLE)
    try:
        install_scope()
        expiry = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=15)).isoformat()
        backup.role_change('CREATE ROLE "' + ROLE + '" LOGIN CONNECTION LIMIT 4 NOSUPERUSER NOCREATEDB '
                           'NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD \'' + password + "' VALID UNTIL '" + expiry + "';")
        backup.sql('ALTER ROLE "' + ROLE + '" SET statement_timeout=60000; ALTER ROLE "' + ROLE +
                   '" SET lock_timeout=5000; ALTER ROLE "' + ROLE + '" SET idle_session_timeout=180000;')
        backup.sql('CREATE DATABASE "' + DATABASE + '" OWNER "' + ROLE + '" TEMPLATE template0;')
        backup.sql('REVOKE ALL ON DATABASE "' + DATABASE + '" FROM PUBLIC;')
        backup.sql('REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT ALL ON SCHEMA public TO "' + ROLE + '";', DATABASE)
        verify_scope(password)
        backup.command([backup.PG + 'pg_restore', '--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction',
                        '--host=127.0.0.1', '--port=5432', '--username=' + ROLE, '--dbname=' + DATABASE],
                       input=dump, user=backup.RESTORE_OS_USER, extra_env={'PGPASSWORD': password}, timeout=180)
        require(preservation.capture_before(query, old_manifest) == before, 'Restored original rows differ')
        original = backup.read_json(backup.ROOT / receipt['backup'] / 'table-fingerprints.json')
        restored = backup.fingerprints(DATABASE, ROLE)
        require(original['tables'] == restored['tables'] and original['sequences'] == restored['sequences'],
                'Restored fingerprints or sequences differ')
        historical.verify_schema_bytes(schema_bytes(prepare.DATABASE, prepare.ROLE), schema_bytes(DATABASE, ROLE),
                                       original['schemaSha256'], restored['schemaSha256'])
        backup.write_json(ROOT / 'restored.json', {'backup': receipt, 'fingerprints': restored})
        environment = ('DATABASE_URL=postgresql://' + ROLE + ':' + quote(password, safe='') +
                       '@127.0.0.1:5432/' + DATABASE + '?connection_limit=2&pool_timeout=10\n')
        backup.write_private(ROOT / 'migration.env', environment.encode())
        output = backup.command(['/usr/bin/docker', 'run', '--name=' + CONTAINER,
            '--label=' + LABEL + '=' + backup.sha(backup.read_file(prepare.PLAN, 32768, owner=0)),
            '--user=1000:1000', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
            '--network=host', '--memory=512m', '--memory-swap=512m', '--cpus=0.75', '--pids-limit=64',
            '--ulimit=nofile=256:256', '--restart=no', '--tmpfs=/tmp:rw,noexec,nosuid,size=64m',
            '--env-file=' + str(ROOT / 'migration.env'), value['opsImageId'],
            'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], timeout=180)
        require(len(output) <= 65536, 'Migration output exceeds bound')
        backup.write_private(ROOT / 'migration.log', output)
        result = preservation.verify_after(query, before, value['migrations'])
        result.update(database=DATABASE, role=ROLE, backup=receipt['backup'],
                      candidate=value['candidate'], schemaSha256=schema.digest(schema.inventory(query)),
                      productionMigrated=False, productionRestored=False)
    finally:
        recover()
    backup.write_json(ROOT / 'complete.json', result)
    return result


def main():
    require(os.getuid() == 0 and socket.gethostname() == 'instance-20260408-091840' and
            Path(__file__).parent == INSTALLED, 'Use separately installed intended-host controller')
    require(sys.argv[1:] in [['run'], ['recover']], 'Unsupported rehearsal action')
    with release.operation(), backup.locked():
        result = run() if sys.argv[1] == 'run' else recover()
    print(json.dumps(result or {'rehearsalRecovery': 'CLOSED'}))


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print(json.dumps({'rehearsal': 'FAILED', 'errorType': type(error).__name__,
                          'reason': str(error) if isinstance(error, backup.Failure) else 'Rehearsal failed'}), file=sys.stderr)
        sys.exit(1)
