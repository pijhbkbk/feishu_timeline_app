"""Fixed-host PG14 snapshot/restore controller; no installer or deployment entry.

Install reviewed bytes outside the checkout into a root-owned, non-writable path.
This deliberately cannot select arbitrary commands, databases, services or paths.
Backups remain private on the host. Restored SQL runs as a new, unprivileged role.
Legacy exit-78 scripts stay disabled. A verified restore does not authorize cutover.
"""
from contextlib import contextmanager
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import resource
import secrets
import shutil
import stat
import subprocess
import sys
import time

ROOT = Path('/var/lib/timeline-native-backups')
SOURCE = Path('/opt/feishu_timeline_app/var/object-storage')
DATABASE = 'feishu_timeline'
ROLE = 'feishu_timeline_app'
SERVICE = 'feishu-timeline-api.service'
RESTORE_OS_USER = 'timeline-native-restore'
PG = '/usr/lib/postgresql/14/bin/'
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8',
       'PGCONNECT_TIMEOUT': '10', 'PGOPTIONS': '-c statement_timeout=60000 -c lock_timeout=5000 -c timezone=UTC -c datestyle=ISO,YMD -c extra_float_digits=3'}
MAX_DUMP = 64 * 1024 * 1024
MAX_OBJECT = 20 * 1024 * 1024
MAX_TOTAL = 256 * 1024 * 1024
MAX_ENTRIES = 1024
NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]{0,127}')
BACKUP = re.compile(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}')
ROLE_CHANGE_LOCK = '704133205109031'


class Failure(RuntimeError):
    pass


def require(value, reason):
    if not value:
        raise Failure(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def regular(fd, maximum, *, owner=None):
    info = os.fstat(fd)
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= maximum,
            'File type, links or size rejected')
    if owner is not None:
        require(info.st_uid == owner and stat.S_IMODE(info.st_mode) == 0o600,
                'Private file ownership rejected')
    return info


def read_file(path, maximum, *, owner=None):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    try:
        before = regular(fd, maximum, owner=owner)
        raw = bytearray()
        while len(raw) <= maximum:
            block = os.read(fd, min(65536, maximum + 1 - len(raw)))
            if not block:
                break
            raw.extend(block)
        after = os.fstat(fd)
        require(len(raw) == before.st_size and
                (before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                (after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'File changed while reading')
        return bytes(raw)
    finally:
        os.close(fd)


def directory(path, *, trusted):
    """Pin every component, never follow a link, including source ancestors."""
    require(path.is_absolute() and '..' not in path.parts, 'Noncanonical directory')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        for part in path.parts[1:]:
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
            os.close(fd)
            fd = nxt
            info = os.fstat(fd)
            if trusted:
                require(info.st_uid == 0 and info.st_mode & 0o022 == 0, 'Untrusted directory ancestor')
        return fd
    except BaseException:
        os.close(fd)
        raise


def fsync_dir(path):
    fd = directory(path, trusted=True)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_private(path, raw):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    fsync_dir(path.parent)


def write_json(path, value):
    write_private(path, (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode())


def read_json(path):
    def unique(pairs):
        value = {}
        for key, item in pairs:
            require(key not in value, 'Duplicate JSON key')
            value[key] = item
        return value
    return json.loads(read_file(path, 1024 * 1024, owner=0), object_pairs_hook=unique)


@contextmanager
def locked():
    fd = directory(ROOT, trusted=True)
    try:
        require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700, 'Backup directory must be private')
        lock = os.open('operation.lock', os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=fd)
        try:
            regular(lock, 0, owner=0)
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            yield
        finally:
            os.close(lock)
    finally:
        os.close(fd)


def command(args, *, input=None, user=None, extra_env=None, timeout=90, stdout=subprocess.PIPE):
    account = pwd.getpwnam(user) if user else None
    result = subprocess.run(args, input=input, stdout=stdout, stderr=subprocess.PIPE,
                            env={**ENV, **(extra_env or {})}, cwd='/', timeout=timeout,
                            user=account.pw_uid if account else None,
                            group=account.pw_gid if account else None,
                            extra_groups=[] if account else None)
    require(result.returncode == 0, 'Subprocess failed: ' + Path(args[0]).name)
    return result.stdout


def sql(query, database='postgres', role=None):
    if role:
        require(role == ROLE or re.fullmatch(r'timeline_restore_[a-f0-9]{8}', role), 'Role rejected')
        query = 'SET ROLE "' + role + '"; SET search_path = pg_catalog; ' + query
    return command([PG + 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', database],
                   input=query.encode(), user='postgres').decode().strip()


def role_change(query):
    # A killed psql can leave a server transaction finishing. Share a server lock
    # with recovery, so its final LOGIN/NOLOGIN always happens after that transaction.
    return sql('BEGIN; SELECT pg_advisory_xact_lock(' + ROLE_CHANGE_LOCK + '); ' + query + ' COMMIT;')


def service_active():
    result = subprocess.run(['/usr/bin/systemctl', 'is-active', SERVICE],
                            env=ENV, capture_output=True, timeout=15)
    require(result.returncode == 0 and result.stdout.strip() == b'active', 'Source API must initially be active')


def stop_source():
    properties = command(['/usr/bin/systemctl', 'show', SERVICE, '-p', 'KillMode', '-p', 'ControlGroup']).decode()
    require('KillMode=control-group\n' in properties and
            'ControlGroup=/system.slice/' + SERVICE + '\n' in properties, 'API cgroup precondition failed')
    command(['/usr/bin/systemctl', 'stop', SERVICE], timeout=60)
    state = command(['/usr/bin/systemctl', 'show', SERVICE, '-p', 'ActiveState', '-p', 'MainPID']).decode()
    require('ActiveState=inactive\n' in state and 'MainPID=0\n' in state, 'API exit not proven')
    cgroup = Path('/sys/fs/cgroup/system.slice') / SERVICE
    if cgroup.exists():
        fd = os.open(cgroup / 'cgroup.events', os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            events = os.read(fd, 4097)
            require(len(events) <= 4096 and b'populated 0\n' in events, 'API cgroup still has processes')
        finally:
            os.close(fd)
    role_change('ALTER ROLE "' + ROLE + '" NOLOGIN;')
    sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='" + DATABASE +
        "' AND usename='" + ROLE + "' AND pid<>pg_backend_pid();")
    require(sql("SELECT count(*) FROM pg_stat_activity WHERE datname='" + DATABASE +
                "' AND backend_type='client backend';") == '0', 'Other database clients remain')
    require(sql("SELECT count(*) FROM pg_prepared_xacts WHERE database='" + DATABASE + "';") == '0',
            'Prepared transactions remain')
    require(sql('SELECT count(*) FROM pg_subscription;', DATABASE) == '0', 'Logical replication subscription present')


def recover_source():
    journal = ROOT / 'source-quiesced.json'
    if not journal.exists():
        return
    value = read_json(journal)
    require(set(value) == {'database', 'role', 'service', 'backup'} and
            (value['database'], value['role'], value['service']) == (DATABASE, ROLE, SERVICE) and
            type(value['backup']) is str and BACKUP.fullmatch(value['backup']), 'Source journal rejected')
    role_change('ALTER ROLE "' + ROLE + '" LOGIN;')
    command(['/usr/bin/systemctl', 'start', SERVICE], timeout=60)
    service_active()
    journal.unlink()
    fsync_dir(ROOT)


def recover_restore():
    journal = ROOT / 'restore-pending.json'
    if not journal.exists():
        return
    value = read_json(journal)
    require(set(value) == {'token', 'role', 'database'} and type(value['token']) is str and
            re.fullmatch(r'[a-f0-9]{8}', value['token']) and
            value['role'] == 'timeline_restore_' + value['token'] and
            value['database'] == 'feishu_timeline_restore_' + value['token'], 'Restore journal rejected')
    role, database = value['role'], value['database']
    # Existence check and closure share the creation transaction's server lock.
    sql('DO $timeline_recover$ BEGIN PERFORM pg_advisory_xact_lock(' + ROLE_CHANGE_LOCK +
        "); IF EXISTS (SELECT FROM pg_roles WHERE rolname='" + role + "') THEN ALTER ROLE \"" + role +
        '" NOLOGIN; END IF; END $timeline_recover$;')
    exists = sql("SELECT count(*) FROM pg_roles WHERE rolname='" + role + "';")
    require(exists in ('0', '1'), 'Restore role lookup failed')
    if exists == '1':
        sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='" + role +
            "' AND datname='" + database + "' AND pid<>pg_backend_pid();")
        require(sql("SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='" + role + "';") == 't',
                'Restore role closure unverified')
        query = "SELECT count(*) FROM pg_stat_activity WHERE usename='" + role + "' AND datname='" + database + "';"
        for attempt in range(10):
            if sql(query) == '0':
                break
            require(attempt < 9, 'Restore connections remain')
            time.sleep(0.1)
    journal.unlink()
    fsync_dir(ROOT)


def fingerprints(database, role):
    require(int(sql('SELECT pg_database_size(current_database());', database, role)) <= MAX_DUMP,
            'Database exceeds approved size bound')
    tables = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;", database, role).splitlines()
    require(0 < len(tables) <= 128, 'Table inventory outside bound')
    result = {}
    for table in tables:
        require(re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}', table), 'Table identifier rejected')
        count = int(sql('SELECT count(*) FROM public."' + table + '";', database, role))
        require(count <= 100000, 'Table exceeds row bound')
        query = ('SELECT encode(sha256(convert_to(coalesce(string_agg(h,\'\' ORDER BY h),\'\'),\'UTF8\')),\'hex\') '
                 'FROM (SELECT encode(sha256(convert_to(row_to_json(t)::text,\'UTF8\')),\'hex\') h '
                 'FROM public."' + table + '" t) s;')
        digest = sql(query, database, role)
        require(re.fullmatch(r'[a-f0-9]{64}', digest), 'Table digest unavailable')
        result[table] = {'rows': count, 'sha256': digest}
    sequences = sql("SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename;", database, role).splitlines()
    require(len(sequences) <= 128, 'Sequence inventory exceeds bound')
    sequence_state = {}
    for sequence in sequences:
        require(re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}', sequence), 'Sequence identifier rejected')
        sequence_state[sequence] = sql('SELECT last_value, is_called FROM public."' + sequence + '";', database, role)
    # Full schema bytes from the same installed pg_dump version; ACL/owners differ
    # intentionally. Only the dump's random psql guard is normalized, no DDL is removed.
    schema = command([PG + 'pg_dump', '--schema-only', '--no-owner', '--no-privileges',
                      '--role=' + role, '--dbname=' + database], user='postgres').decode()
    require(len(schema) <= 4 * 1024 * 1024, 'Schema exceeds bound')
    schema = re.sub(r'(?m)^\\(un)?restrict [A-Za-z0-9]+$', r'\\\1restrict FIXED_GUARD', schema)
    return {'tables': result, 'sequences': sequence_state, 'schemaSha256': sha(schema.encode())}


def check_scope_and_space():
    schemas = sql("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema' ORDER BY nspname;", DATABASE)
    require(schemas == 'public', 'Unsupported business schema')
    data = Path(sql('SHOW data_directory;'))
    fd = directory(data, trusted=False)
    try:
        filesystem = os.fstatvfs(fd)
        require(filesystem.f_bavail * filesystem.f_frsize >= 2 * 1024 * 1024 * 1024,
                'Insufficient database headroom')
    finally:
        os.close(fd)
    require(shutil.disk_usage(ROOT).free >= 2 * 1024 * 1024 * 1024, 'Insufficient backup headroom')


def copy_objects(source, target, *, expected=None):
    """Data-only fd traversal: no archive extraction, links, special files or escapes."""
    fd = directory(source, trusted=False)
    target.mkdir(mode=0o700)
    entries, total, result = 0, 0, []

    def walk(current, relative):
        nonlocal entries, total
        initial = os.fstat(current)
        # Bound materialization, not only files eventually copied.
        with os.scandir(current) as listing:
            for entry in listing:
                entries += 1
                require(entries <= MAX_ENTRIES and NAME.fullmatch(entry.name) and entry.name not in ('.', '..'),
                        'Object entry rejected')
                parts = (*relative, entry.name)
                require(len(parts) <= 15 and len('/'.join(parts)) <= 504, 'Object path exceeds bound')
                info = entry.stat(follow_symlinks=False)
                if stat.S_ISDIR(info.st_mode):
                    child = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=current)
                    try:
                        actual = os.fstat(child)
                        require((info.st_ino, info.st_dev) == (actual.st_ino, actual.st_dev), 'Object directory changed')
                        target.joinpath(*parts).mkdir(mode=0o700)
                        walk(child, parts)
                    finally:
                        os.close(child)
                else:
                    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= MAX_OBJECT,
                            'Object file rejected')
                    child = os.open(entry.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=current)
                    try:
                        before = regular(child, MAX_OBJECT)
                        require((info.st_ino, info.st_dev) == (before.st_ino, before.st_dev), 'Object changed')
                        raw = bytearray()
                        while len(raw) <= MAX_OBJECT:
                            block = os.read(child, min(65536, MAX_OBJECT + 1 - len(raw)))
                            if not block:
                                break
                            raw.extend(block)
                        after = os.fstat(child)
                        require(len(raw) == before.st_size and
                                (before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                                (after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'Object changed during snapshot')
                    finally:
                        os.close(child)
                    total += len(raw)
                    require(len(result) < 500 and total <= MAX_TOTAL, 'Object collection exceeds bound')
                    record = {'path': 'objects/' + '/'.join(parts), 'size': len(raw), 'sha256': sha(raw)}
                    write_private(target.joinpath(*parts), raw)
                    result.append(record)
        final = os.fstat(current)
        require((initial.st_mtime_ns, initial.st_ctime_ns) == (final.st_mtime_ns, final.st_ctime_ns),
                'Object directory changed during snapshot')
        fsync_dir(target.joinpath(*relative))
    try:
        walk(fd, ())
    finally:
        os.close(fd)
    result.sort(key=lambda item: item['path'])
    if expected is not None:
        require(result == expected, 'Restored object inventory differs')
    return result


def dump_database(path):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    account = pwd.getpwnam('postgres')
    def limits():
        resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_DUMP, MAX_DUMP))
    try:
        result = subprocess.run([PG + 'pg_dump', '--format=custom', '--no-owner', '--no-privileges',
                                 '--role=' + ROLE, '--dbname=' + DATABASE], cwd='/', env=ENV,
                                stdout=fd, stderr=subprocess.PIPE, timeout=120,
                                user=account.pw_uid, group=account.pw_gid, extra_groups=[], preexec_fn=limits)
        require(result.returncode == 0, 'Database dump failed')
        os.fsync(fd)
    finally:
        os.close(fd)
    raw = read_file(path, MAX_DUMP, owner=0)
    require(raw.startswith(b'PGDMP'), 'Dump is not PostgreSQL custom format')
    fsync_dir(path.parent)
    return {'path': 'database.dump', 'size': len(raw), 'sha256': sha(raw)}


def snapshot():
    require(not (ROOT / 'source-quiesced.json').exists(), 'Recover interrupted source operation first')
    service_active()
    check_scope_and_space()
    require(sql("SELECT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname='" + ROLE + "';") == 't',
            'Source role privilege precondition failed')
    require(sql("SELECT count(*) FROM pg_stat_activity WHERE usename='" + ROLE + "' AND datname<>'" + DATABASE + "';") == '0',
            'Source role has other database clients')
    require(sql("SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='" + ROLE + "');") == '0',
            'Source role has inherited privileges')
    name = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + secrets.token_hex(4)
    path = ROOT / name
    path.mkdir(mode=0o700)
    write_json(ROOT / 'source-quiesced.json', {'database': DATABASE, 'role': ROLE, 'service': SERVICE, 'backup': name})
    try:
        stop_source()
        before = fingerprints(DATABASE, ROLE)
        dump = dump_database(path / 'database.dump')
        objects = copy_objects(SOURCE, path / 'objects')
        require(fingerprints(DATABASE, ROLE) == before, 'Database changed while quiesced')
        manifest = {'version': 1, 'database': dump, 'objects': objects}
        write_json(path / 'restore-manifest.json', manifest)
        write_json(path / 'table-fingerprints.json', before)
        receipt = {'backup': name, 'manifestSha256': sha(read_file(path / 'restore-manifest.json', 1024 * 1024)),
                   'fingerprintsSha256': sha(read_file(path / 'table-fingerprints.json', 1024 * 1024)),
                   'tableCount': len(before['tables']), 'objectCount': len(objects), 'source': DATABASE}
        write_json(path / 'snapshot-complete.json', receipt)
    finally:
        recover_source()
    return receipt


def restore(name, expected_sha):
    require(not (ROOT / 'restore-pending.json').exists(), 'Recover interrupted restore first')
    require(BACKUP.fullmatch(name) and re.fullmatch(r'[a-f0-9]{64}', expected_sha), 'Restore identity rejected')
    path = ROOT / name
    fd = directory(path, trusted=True)
    os.close(fd)
    receipt = read_json(path / 'snapshot-complete.json')
    require(receipt['backup'] == name and receipt['manifestSha256'] == expected_sha, 'Snapshot identity mismatch')
    manifest_raw = read_file(path / 'restore-manifest.json', 1024 * 1024, owner=0)
    require(sha(manifest_raw) == expected_sha, 'Manifest digest mismatch')
    manifest = json.loads(manifest_raw)
    require(set(manifest) == {'version', 'database', 'objects'} and manifest['version'] == 1,
            'Manifest shape rejected')
    require(set(manifest['database']) == {'path', 'size', 'sha256'} and manifest['database']['path'] == 'database.dump',
            'Dump entry rejected')
    require(type(manifest['objects']) is list and len(manifest['objects']) <= 500, 'Object inventory rejected')
    raw = read_file(path / 'database.dump', MAX_DUMP, owner=0)
    require(raw.startswith(b'PGDMP') and len(raw) == manifest['database']['size'] and
            sha(raw) == manifest['database']['sha256'], 'Dump bytes differ')
    fingerprint_raw = read_file(path / 'table-fingerprints.json', 1024 * 1024, owner=0)
    require(sha(fingerprint_raw) == receipt['fingerprintsSha256'], 'Table evidence differs')
    check_scope_and_space()
    account = pwd.getpwnam(RESTORE_OS_USER)
    require(account.pw_uid > 0 and account.pw_gid > 0 and
            account.pw_shell in ('/usr/sbin/nologin', '/bin/false') and account.pw_dir == '/nonexistent',
            'Dedicated restore OS account precondition failed')
    token = secrets.token_hex(4)
    role = 'timeline_restore_' + token
    database = 'feishu_timeline_restore_' + token
    password = secrets.token_urlsafe(36)
    destination = ROOT / ('restored-' + token)
    destination.mkdir(mode=0o700)
    # Persist recovery identity before any database creation; never log the secret.
    write_json(destination / 'credentials.json', {'database': database, 'role': role, 'password': password})
    copy_objects(path / 'objects', destination / 'objects', expected=manifest['objects'])
    require(sql("SELECT count(*) FROM pg_roles WHERE rolname='" + role + "';") == '0', 'Target role exists')
    require(sql("SELECT count(*) FROM pg_database WHERE datname='" + database + "';") == '0', 'Target database exists')
    write_json(ROOT / 'restore-pending.json', {'token': token, 'role': role, 'database': database})
    try:
        role_change('CREATE ROLE "' + role + '" LOGIN CONNECTION LIMIT 1 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD \'' + password + "';")
        sql('CREATE DATABASE "' + database + '" OWNER "' + role + '" TEMPLATE template0;')
        sql('REVOKE ALL ON DATABASE "' + database + '" FROM PUBLIC;')
        sql('REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT ALL ON SCHEMA public TO "' + role + '";', database)
        # A trust HBA would bypass the temporary credential. Probe that exact route
        # with a wrong password; the subsequent restore proves the valid route works.
        probe = subprocess.run([PG + 'psql', '-X', '-qAt', '-w', '-h', '127.0.0.1', '-p', '5432', '-U', role,
                                '-d', database, '-c', 'SELECT 1;'], cwd='/',
                               env={**ENV, 'PGPASSWORD': 'invalid-' + secrets.token_urlsafe(36)},
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15,
                               user=account.pw_uid, group=account.pw_gid, extra_groups=[])
        require(probe.returncode != 0, 'Restore route accepts an incorrect password')
        command([PG + 'pg_restore', '--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction',
                 '--host=127.0.0.1', '--port=5432', '--username=' + role, '--dbname=' + database],
                input=raw, user=RESTORE_OS_USER, extra_env={'PGPASSWORD': password}, timeout=180)
        require(fingerprints(database, role) == json.loads(fingerprint_raw), 'Restored database differs')
    finally:
        recover_restore()
    result = {'backup': name, 'manifestSha256': expected_sha, 'database': database, 'role': role,
              'restoreDirectory': str(destination), 'tableCount': receipt['tableCount'],
              'objectCount': receipt['objectCount'], 'databaseAndObjectsVerified': True,
              'productionChanged': False}
    write_json(destination / 'restore-complete.json', result)
    return result


def main():
    require(os.geteuid() == 0, 'Requires separately installed root controller')
    script = Path(__file__).absolute()
    require(script.parent == Path('/usr/local/lib/timeline-native-ops'), 'Do not execute checkout code as root')
    fd = directory(script.parent, trusted=True)
    os.close(fd)
    info = script.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and info.st_mode & 0o022 == 0,
            'Installed controller ownership rejected')
    with locked():
        if sys.argv[1:] == ['snapshot']:
            result = snapshot()
        elif sys.argv[1:] == ['recover-interrupted']:
            try:
                recover_source()
            finally:
                recover_restore()
            result = {'interruptedOperationsRecoveryChecked': True}
        elif len(sys.argv) == 4 and sys.argv[1] == 'restore':
            result = restore(sys.argv[2], sys.argv[3])
        else:
            raise Failure('Unsupported fixed operation')
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        # Driver errors, SQL errors and paths can include secrets. Log only category.
        print(json.dumps({'ok': False, 'errorType': type(error).__name__,
                          'reason': str(error) if isinstance(error, Failure) else 'Host operation failed'}), file=sys.stderr)
        sys.exit(1)
