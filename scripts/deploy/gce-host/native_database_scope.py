"""Restrict the fixed promoted-copy role to its own DB before API credential use."""
import os
from pathlib import Path
import stat
import sys
INSTALLED = Path('/usr/local/lib/timeline-native-ops')
if Path(__file__).parent == INSTALLED:
    for node in [*reversed(INSTALLED.parents), INSTALLED]:
        i = node.lstat()
        if not stat.S_ISDIR(i.st_mode) or i.st_uid != 0 or i.st_mode & 0o022:
            raise RuntimeError('Untrusted controller directory')
    sys.path.insert(0, str(INSTALLED))
import hashlib
import json
import pwd
import re
import socket
import subprocess
import time
import native_backup_controller as backup
import native_migration_probe as migration

ROOT = Path('/var/lib/timeline-native-app')
HBA = Path('/etc/postgresql/14/main/pg_hba.conf')
BASE_SHA = '50778088eaa52ba69f92c89daae532b67658d365f90ae7cfdb564361c13eb4cf'
PREFIX = ("# Native account fixed-role scope; all previous rules retained below.\n"
          "host feishu_timeline_restore_c38c57da timeline_restore_c38c57da 127.0.0.1/32 scram-sha-256\n"
          "host all timeline_restore_c38c57da 0.0.0.0/0 reject\n"
          "host all timeline_restore_c38c57da ::0/0 reject\n"
          "local all timeline_restore_c38c57da reject\n").encode()
JOURNAL = {'version': 1, 'database': migration.DATABASE, 'role': migration.ROLE, 'baseSha256': BASE_SHA}
require = backup.require


def read_hba():
    account = pwd.getpwnam('postgres')
    for node in [*reversed(HBA.parent.parents), HBA.parent]:
        i = node.lstat()
        require(stat.S_ISDIR(i.st_mode) and i.st_uid in (0, account.pw_uid) and i.st_mode & 0o022 == 0, 'HBA path untrusted')
    i = HBA.lstat()
    require(stat.S_ISREG(i.st_mode) and i.st_uid == account.pw_uid and i.st_gid == account.pw_gid and
            i.st_nlink == 1 and stat.S_IMODE(i.st_mode) == 0o640, 'HBA ownership differs')
    return backup.read_file(HBA, 16384)


def scope_bytes_valid(raw):
    return raw.startswith(PREFIX) and hashlib.sha256(raw[len(PREFIX):]).hexdigest() == BASE_SHA


def verify():
    require(not (ROOT / 'pg-scope-pending.json').exists(), 'Database scope recovery pending')
    require(backup.read_json(ROOT / 'pg-scope.json') == JOURNAL, 'Database scope proof absent')
    require(backup.sql('SHOW hba_file;') == str(HBA), 'Server uses another HBA')
    require(scope_bytes_valid(read_hba()), 'Database scope configuration differs')
    require(backup.sql('SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL;') == '0', 'HBA parsing failed')
    for database in ('postgres', 'feishu_timeline'):
        result = probe(database, 'invalid-scope-check-password')
        require(result.returncode != 0 and b'pg_hba.conf rejects connection' in result.stderr, 'Effective database scope is not enforced')


def close_role():
    backup.role_change('ALTER ROLE "' + migration.ROLE + '" NOLOGIN CONNECTION LIMIT 12;')
    backup.sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='" + migration.ROLE + "' AND datname='" + migration.DATABASE + "' AND pid<>pg_backend_pid();")
    for attempt in range(20):
        if backup.sql("SELECT count(*) FROM pg_stat_activity WHERE usename='" + migration.ROLE + "';") == '0':
            break
        require(attempt < 19, 'Candidate clients remain'); time.sleep(.1)
    require(backup.sql("SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='" + migration.ROLE + "';") == 't', 'Candidate role closure unproved')


def recover():
    pending = ROOT / 'pg-scope-pending.json'
    if not pending.exists():
        return
    require(backup.read_json(pending) == JOURNAL, 'Database scope journal rejected')
    close_role()
    # Retain journal after interruption: install can reconcile only this exact HBA prefix.


def probe(database, password):
    account = pwd.getpwnam(backup.RESTORE_OS_USER)
    require(account.pw_uid > 0 and account.pw_gid > 0 and account.pw_dir == '/nonexistent' and account.pw_shell in ('/usr/sbin/nologin', '/bin/false'), 'Probe account differs')
    result = subprocess.run([backup.PG + 'psql', '-X', '-qAt', '-w', '-h', '127.0.0.1', '-p', '5432', '-U', migration.ROLE,
                             '-d', database, '-c', 'SELECT 1;'], cwd='/', env={**backup.ENV, 'PGPASSWORD': password, 'PGSSLMODE': 'disable'},
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15, user=account.pw_uid, group=account.pw_gid, extra_groups=[])
    require(len(result.stdout) < 4096 and len(result.stderr) < 8192, 'Unexpected scope probe output')
    return result


def install():
    fd = backup.directory(ROOT, trusted=True); require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700, 'Scope state must be private'); os.close(fd)
    if (ROOT / 'pg-scope.json').exists():
        verify(); return
    raw = read_hba()
    require(hashlib.sha256(raw).hexdigest() == BASE_SHA or scope_bytes_valid(raw), 'HBA changed outside this operation')
    require(backup.sql('SHOW hba_file;') == str(HBA), 'Server uses another HBA')
    require(backup.sql("SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname='" + migration.ROLE + "';") == 't', 'Candidate role not closed/unprivileged')
    require(backup.sql("SELECT count(*) FROM pg_stat_activity WHERE usename='" + migration.ROLE + "';") == '0', 'Candidate role in use')
    pending = ROOT / 'pg-scope-pending.json'
    if pending.exists(): require(backup.read_json(pending) == JOURNAL, 'Scope journal differs')
    else: backup.write_json(pending, JOURNAL)
    try:
        if not scope_bytes_valid(raw):
            saved = ROOT / 'pg-hba-original.conf'
            if saved.exists(): require(backup.read_file(saved,16384,owner=0) == raw, 'Saved HBA differs')
            else: backup.write_private(saved, raw)
            temp = HBA.parent / '.timeline-native-hba.pending'
            require(not temp.exists(), 'HBA replacement already present')
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
            try:
                with os.fdopen(fd,'wb',closefd=False) as out: out.write(PREFIX + raw); out.flush(); os.fsync(fd)
                account = pwd.getpwnam('postgres'); os.fchown(fd,account.pw_uid,account.pw_gid); os.fchmod(fd,0o640); os.fsync(fd)
            finally: os.close(fd)
            require(read_hba() == raw, 'HBA changed during preparation')
            os.replace(temp,HBA)
            fd=backup.directory(HBA.parent,trusted=False)
            try: os.fsync(fd)
            finally: os.close(fd)
        require(scope_bytes_valid(read_hba()), 'HBA write verification failed')
        require(backup.sql('SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL;') == '0', 'HBA parse rejected')
        require(backup.sql('SELECT pg_reload_conf();') == 't', 'HBA reload rejected')
        secret = backup.read_json(migration.RESTORE / 'credentials.json')
        require(secret['database'] == migration.DATABASE and secret['role'] == migration.ROLE and re.fullmatch(r'[A-Za-z0-9_-]{40,100}',secret['password']), 'Candidate credential identity differs')
        backup.role_change('ALTER ROLE "' + migration.ROLE + '" LOGIN CONNECTION LIMIT 12;')
        # Wait for asynchronous SIGHUP processing. Failure never leaves role open.
        for attempt in range(20):
            denied = probe('postgres',secret['password'])
            if denied.returncode != 0 and b'pg_hba.conf rejects connection' in denied.stderr: break
            require(attempt<19,'Other-database access not rejected'); time.sleep(.2)
        allowed = probe(migration.DATABASE,secret['password'])
        require(allowed.returncode == 0 and allowed.stdout.strip() == b'1', 'Intended database access failed')
        original = probe('feishu_timeline',secret['password'])
        require(original.returncode != 0 and b'pg_hba.conf rejects connection' in original.stderr, 'Original database scope denial failed')
        wrong = probe(migration.DATABASE,'invalid-password-'+('x'*40))
        require(wrong.returncode != 0 and b'password authentication failed' in wrong.stderr, 'Wrong password unexpectedly accepted')
    finally:
        close_role()
    backup.write_json(ROOT / 'pg-scope.json',JOURNAL)
    pending.unlink(); backup.fsync_dir(ROOT)
    verify()
    print(json.dumps({'databaseRoleScope':'PASS','intendedDatabaseAuthenticated':True,'originalAndMaintenanceDatabasesDenied':True,
                      'wrongPasswordDenied':True,'roleClosed':True,'otherRoleRulesUnchanged':True}))


def main():
    require(os.geteuid()==0 and socket.gethostname()=='instance-20260408-091840' and Path(__file__).parent==INSTALLED,'Use installed intended-host scope controller')
    require(sys.argv[1:] in [['install'],['recover'],['verify']],'Unsupported scope operation')
    with backup.locked():
        {'install':install,'recover':recover,'verify':verify}[sys.argv[1]]()


if __name__=='__main__':
    try: main()
    except BaseException as error:
        print(json.dumps({'databaseRoleScope':'FAILED','reason':str(error) if isinstance(error,backup.Failure) else type(error).__name__}),file=sys.stderr);sys.exit(1)
