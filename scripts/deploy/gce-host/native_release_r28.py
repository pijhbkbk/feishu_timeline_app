"""Fixed R28 migration branch. All ambiguous failures stay closed; no automatic restore.

Only independently installed root-owned bytes may invoke this controller.
The application candidate provides no privileged script or arbitrary SQL input.
"""
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
from urllib.parse import quote
import native_backup_controller as backup
import native_database_scope as scope
import native_migration_probe as db
from native_release_target_r28 import TARGET
from native_r28_preservation import verify_migration, verify_reconcile
from native_r28_schema import inventory, digest as schema_digest

require = backup.require
ROOT = Path('/var/lib/timeline-native-app')
JOURNAL = ROOT / 'r28-migration-release.json'
PHASES = ('MIGRATION_STARTED', 'DB41_VERIFIED', 'RECONCILED', 'WRITE_ENABLE_INTENT', 'OPEN_41')
CONTAINER = 'timeline-native-r28-migration'
LABEL = 'com.timeline.r28.release'
ENVFILE = ROOT / 'r28-migration.env'
RESTORE_DATABASE = 'timeline_r28_verify_20260928'
# Exact live PG14 inventories from fixed-image migration replay. A pg_dump /
# pg_restore round trip only flattens one known CHECK's first AND group. Keep
# the distinct restored inventory fixed; never strip parentheses or omit DDL.
SCHEMA = {37: '0705d3a53a3cc81921dbc8d0886917199d4b18fcedcf9687ea8dcb85e3be4a3e',
          41: 'd5061e372df4946201163783cb2f909f34a384e0d44c4e26902f2d9968718297'}
RESTORED_SCHEMA_37 = '1cfb6df3bd1097c205fd2e1932a72dfce8491dcfad3d5256d499971764e31e3e'
SCHEMA_SOURCE_LINE = '    CONSTRAINT trial_production_issues_text_bounds_check CHECK ((((char_length(("issueType")::text) >= 1) AND (char_length(("issueType")::text) <= 500)) AND ((char_length((description)::text) >= 1) AND (char_length((description)::text) <= 4000)) AND ((char_length(("responsibleDept")::text) >= 1) AND (char_length(("responsibleDept")::text) <= 500))))\n'
SCHEMA_RESTORED_LINE = '    CONSTRAINT trial_production_issues_text_bounds_check CHECK (((char_length(("issueType")::text) >= 1) AND (char_length(("issueType")::text) <= 500) AND ((char_length((description)::text) >= 1) AND (char_length((description)::text) <= 4000)) AND ((char_length(("responsibleDept")::text) >= 1) AND (char_length(("responsibleDept")::text) <= 500))))\n'


def present(path):
    return os.path.lexists(path)


def digest_json(value):
    return backup.sha(json.dumps(value, sort_keys=True, separators=(',', ':')).encode())


def journal():
    if not present(JOURNAL): return None
    value = backup.read_json(JOURNAL)
    require(type(value) is dict and set(value) == {'version', 'target', 'database', 'planSha256', 'phase', 'backup', 'backupReceiptSha256'} and
            value['version'] == 1 and value['target'] == TARGET['commit'] and value['database'] == db.DATABASE and
            value['planSha256'] == digest_json(TARGET) and value['phase'] in PHASES and
            backup.BACKUP.fullmatch(value['backup']) and re.fullmatch(r'[a-f0-9]{64}', value['backupReceiptSha256']),
            'Unknown R28 migration state; hold closed')
    receipt = backup.ROOT / value['backup'] / 'snapshot-complete.json'
    require(backup.sha(backup.read_file(receipt, 4096, owner=0)) == value['backupReceiptSha256'], 'R28 backup binding differs')
    return value


def advance(phase, protection=None):
    previous = journal()
    if previous is None:
        require(phase == PHASES[0] and protection is not None, 'Migration must begin with durable backup intent')
        value = {'version': 1, 'target': TARGET['commit'], 'database': db.DATABASE, 'planSha256': digest_json(TARGET),
                 'phase': phase, 'backup': protection['backup'],
                 'backupReceiptSha256': backup.sha(backup.read_file(backup.ROOT / protection['backup'] / 'snapshot-complete.json', 4096, owner=0))}
    else:
        require(PHASES.index(phase) == PHASES.index(previous['phase']) + 1, 'Migration phase cannot be skipped or reversed')
        value = {**previous, 'phase': phase}
    temporary = ROOT / ('r28-journal-' + secrets.token_hex(12) + '.tmp')
    backup.write_json(temporary, value)
    os.replace(temporary, JOURNAL); backup.fsync_dir(ROOT)
    require(journal() == value, 'Migration journal durability unproved')


def migration_state(count):
    rows = db.migration_rows()
    expected = dict(list(TARGET['migrations'].items())[:count])
    require(len(rows) == count and {r['migration_name']: r['checksum'] for r in rows} == expected,
            'Database migration identity differs; hold closed')


def schema_state(count):
    require(schema_digest(inventory(db.query)) == SCHEMA[count], 'Fixed database schema drift detected')


def access_state():
    raw = db.query("SELECT json_build_array(c.relkind,c.relname,pg_get_userbyid(c.relowner),c.relacl)::text "
                   "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname LIMIT 1001;")
    rows = [json.loads(line) for line in raw.splitlines()]
    require(len(rows) <= 1000 and all(r[2] == db.ROLE and r[3] is None for r in rows),
            'Application object ownership or grants differ')
    return {r[1]: r for r in rows}


def assert_start(commit):
    """Every systemd app start passes here, including direct starts after a reboot."""
    value = journal()
    if value is None:
        require(commit != TARGET['commit'], 'R28 requires migration evidence before startup')
        migration_state(37)
        schema_state(37)
        return
    require(commit == TARGET['commit'] and value['phase'] in ('WRITE_ENABLE_INTENT', 'OPEN_41'),
            'Migration started: old application and early candidate startup are forbidden')
    migration_state(41)
    schema_state(41)


def inspect_worker():
    raw = db.docker('container', 'ls', '-a', '--filter', 'name=^' + CONTAINER + '$', '--format', '{{.ID}}')
    require(len(raw.splitlines()) <= 1, 'Ambiguous R28 worker')
    if not raw.strip(): return None
    item = json.loads(db.docker('container', 'inspect', CONTAINER))[0]
    require(item['Name'] == '/' + CONTAINER and item['Config'].get('Labels', {}).get(LABEL) == TARGET['commit'] and
            item['Config']['Image'] in (TARGET['opsImage'], TARGET['images']['api']), 'Unowned migration container retained')
    return item


def stop_worker():
    item = inspect_worker()
    if item:
        if item['State']['Running']: db.docker('stop', '--time=10', CONTAINER, timeout=20)
        item = inspect_worker()
        require(not item['State']['Running'] and item['State']['Pid'] == 0, 'R28 migration worker remains')
        db.docker('rm', CONTAINER)


def hold_closed():
    # Role closure and termination happen even if container inspection fails.
    import native_release as release
    import native_cutover as cutover
    errors = []
    for action in (scope.close_role, release.close_program, stop_worker,
                   lambda: cutover.systemctl('stop', 'timeline-native-redis.service')):
        try: action()
        except BaseException as error: errors.append(type(error).__name__)
    require(not errors, 'R28 maintenance cleanup incomplete; retain journals and investigate owned resources')
    raise backup.Failure('R28 migration has started; maintenance retained for explicit forward reconciliation, never automatic old-version/backup restore')


def recover_guard():
    import native_release as release
    try:
        value = journal()
        if value is None:
            migration_state(37)
            require(TARGET['commit'] not in (release.state()['active'], release.state()['committed']), 'R28 state lost its journal')
            return
        state = release.state()
        if value['phase'] == 'OPEN_41' and state == {'version': 1, 'active': TARGET['commit'], 'committed': TARGET['commit'], 'pending': False}:
            assert_start(TARGET['commit'])
            return
    except BaseException:
        hold_closed()
        raise
    hold_closed()


def snapshot(database=None):
    database = db.DATABASE if database is None else database
    require(database in (db.DATABASE, RESTORE_DATABASE), 'Snapshot database scope differs')
    def query(sql): return backup.sql(sql, database, db.ROLE)
    require(int(query('SELECT pg_database_size(current_database());')) <= backup.MAX_DUMP, 'R28 database exceeds approved bounds')
    tables = query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LIMIT 65;").splitlines()
    require(0 < len(tables) <= 64, 'R28 table inventory exceeds bound')
    result = {}
    for name in tables:
        identifier = db.identifier(name)
        raw = query("SELECT CASE WHEN count(*)<=5000 AND coalesce(max(octet_length(j)),0)<=262144 "
                    "AND coalesce(sum(octet_length(j)),0)<=8388608 THEN coalesce(json_agg(j::json),'[]'::json)::text "
                    "ELSE 'BOUNDS_EXCEEDED' END FROM (SELECT row_to_json(t)::text j FROM "
                    '(SELECT * FROM public.' + identifier + ' LIMIT 5001) t) bounded;')
        require(raw != 'BOUNDS_EXCEEDED' and len(raw.encode()) <= 9 * 1024 * 1024, 'R28 table exceeds snapshot bounds')
        rows = json.loads(raw)
        primary_key = {'local_credentials': 'userId', 'supplier_mutation_buckets': 'actorUserId',
                       'reminder_scan_states': 'name'}.get(name, 'id')
        require(all(isinstance(row.get(primary_key), str) and 0 < len(row[primary_key]) <= 256 for row in rows),
                'R28 snapshot primary key differs')
        keyed = {row[primary_key]: row for row in rows}
        require(len(rows) == len(keyed) and 'None' not in keyed, 'R28 snapshot requires unique existing keys')
        result[name] = keyed
    return result


def image_identity(reference):
    item = json.loads(db.docker('image', 'inspect', reference))[0]
    labels = item['Config']['Labels']
    require(reference in item['RepoDigests'] and item['Architecture'] == 'amd64' and item['Os'] == 'linux' and
            labels['org.opencontainers.image.revision'] == TARGET['commit'] and
            labels['com.feishu-timeline.source-tree'] == TARGET['tree'] and
            labels['org.opencontainers.image.version'] == TARGET['release'] and
            labels['org.opencontainers.image.created'] == TARGET['buildTime'], 'Fixed R28 image identity differs')


def credentials_file():
    credentials = backup.read_json(db.RESTORE / 'credentials.json')
    require(set(credentials) == {'database', 'role', 'password'} and credentials['database'] == db.DATABASE and
            credentials['role'] == db.ROLE and isinstance(credentials['password'], str) and
            re.fullmatch(r'[A-Za-z0-9_-]{40,100}', credentials['password']), 'Scoped R28 credentials differ')
    raw = ('DATABASE_URL=postgresql://' + db.ROLE + ':' + quote(credentials['password'], safe='') +
           '@127.0.0.1:5432/' + db.DATABASE + '?connection_limit=2&pool_timeout=10\n').encode()
    if not present(ENVFILE): backup.write_private(ENVFILE, raw)
    require(backup.read_file(ENVFILE, 4096, owner=0) == raw, 'Migration environment differs')


def run_worker(kind):
    require(kind in ('migrate', 'reconcile') and journal()['phase'] == ('MIGRATION_STARTED' if kind == 'migrate' else 'DB41_VERIFIED'),
            'Migration worker phase differs')
    from native_release_backup import assert_frozen
    assert_frozen(); scope.verify()
    require(inspect_worker() is None, 'Prior R28 worker requires inspection')
    require(backup.sql("SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls "
                       "FROM pg_roles WHERE rolname='" + db.ROLE + "';") == 't' and
            backup.sql("SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='" + db.ROLE + "');") == '0',
            'Scoped migration role privileges differ')
    image = TARGET['opsImage'] if kind == 'migrate' else TARGET['images']['api']
    image_identity(image); credentials_file()
    args = ['run', '--name=' + CONTAINER, '--label=' + LABEL + '=' + TARGET['commit'], '--user=1000:1000',
            '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--network=host', '--memory=512m',
            '--memory-swap=512m', '--cpus=0.75', '--pids-limit=64', '--ulimit=nofile=256:256', '--restart=no',
            '--log-opt=max-size=1m', '--log-opt=max-file=1', '--tmpfs=/tmp:rw,noexec,nosuid,size=64m', '--env-file=' + str(ENVFILE), image]
    args += ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'] if kind == 'migrate' else ['node', 'dist/cli/team-roles.js', 'reconcile']
    try:
        backup.role_change('ALTER ROLE ' + db.identifier(db.ROLE) + ' LOGIN CONNECTION LIMIT 3;')
        raw = db.docker(*args, timeout=150)
        require(len(raw) <= 65536, 'R28 worker output exceeds bound')
        item = inspect_worker()
        require(item and not item['State']['Running'] and item['State']['ExitCode'] == 0 and not item['State']['OOMKilled'], 'R28 worker did not exit cleanly')
    finally:
        scope.close_role()
        stop_worker()
    assert_frozen()


def schema_bytes(database):
    require(database in (db.DATABASE, RESTORE_DATABASE), 'Schema dump database scope differs')
    raw = backup.command([backup.PG + 'pg_dump', '--schema-only', '--no-owner', '--no-privileges',
                          '--role=' + db.ROLE, '--dbname=' + database], user='postgres').decode()
    require(len(raw) <= 4 * 1024 * 1024, 'Schema dump exceeds bound')
    return re.sub(r'(?m)^\\(un)?restrict [A-Za-z0-9]+$', r'\\\1restrict FIXED_GUARD', raw)


def verify_schema_bytes(source, restored, source_fingerprint, restored_fingerprint):
    require(backup.sha(source.encode()) == source_fingerprint and backup.sha(restored.encode()) == restored_fingerprint,
            'Schema dump is not bound to B0 and restore fingerprints')
    require(source.count(SCHEMA_SOURCE_LINE) == 1 and restored.count(SCHEMA_RESTORED_LINE) == 1 and
            source.replace(SCHEMA_SOURCE_LINE, SCHEMA_RESTORED_LINE, 1) == restored,
            'Only the fixed one-direction CHECK line transformation is permitted')


def verify_restore_fingerprints(source, restored, source_schema, restored_schema):
    require(set(source) == set(restored) == {'tables', 'sequences', 'schemaSha256'} and
            source['tables'] == restored['tables'] and source['sequences'] == restored['sequences'],
            'Actual B0 restored table or sequence differs')
    require(source_schema == SCHEMA[37] and restored_schema == RESTORED_SCHEMA_37 and
            all(re.fullmatch(r'[a-f0-9]{64}', item['schemaSha256']) for item in (source, restored)),
            'Actual B0 restoration differs from the fixed reviewed schema pair')


def verify_backup_restore(protection, expected):
    """Restore actual B0 into a new fixed isolated DB; never overwrite a live DB."""
    from native_release_backup import verify_backup
    manifest = verify_backup(protection)
    require(backup.sql("SELECT count(*) FROM pg_database WHERE datname='" + RESTORE_DATABASE + "';") == '0',
            'Prior R28 restore rehearsal retained; inspect before another release')
    backup.sql('CREATE DATABASE ' + db.identifier(RESTORE_DATABASE) + ' OWNER ' + db.identifier(db.ROLE) + ' TEMPLATE template0;')
    backup.sql('REVOKE CONNECT ON DATABASE ' + db.identifier(RESTORE_DATABASE) + ' FROM PUBLIC;')
    raw = backup.read_file(backup.ROOT / protection['backup'] / 'database.dump', backup.MAX_DUMP, owner=0)
    backup.command([backup.PG + 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '--role=' + db.ROLE,
                    '--dbname=' + RESTORE_DATABASE], user='postgres', input=raw, timeout=150)
    require(snapshot(RESTORE_DATABASE) == expected, 'Actual B0 restoration differs')
    source = backup.read_json(backup.ROOT / protection['backup'] / 'table-fingerprints.json')
    restored = backup.fingerprints(RESTORE_DATABASE, db.ROLE)
    source_schema = schema_digest(inventory(db.query))
    restored_schema = schema_digest(inventory(lambda sql: backup.sql(sql, RESTORE_DATABASE, db.ROLE)))
    verify_restore_fingerprints(source, restored, source_schema, restored_schema)
    verify_schema_bytes(schema_bytes(db.DATABASE), schema_bytes(RESTORE_DATABASE),
                        source['schemaSha256'], restored['schemaSha256'])
    # Verify referenced source object bytes against the protected object copy.
    import native_runtime_app as app
    backup.copy_objects(app.ROOT / 'objects', backup.ROOT / protection['backup'] / 'r28-verified-objects', expected=manifest['objects'])
    backup.write_json(backup.ROOT / protection['backup'] / 'r28-restore-proof.json',
                      {'database': RESTORE_DATABASE, 'snapshotSha256': digest_json(expected), 'schemaAndSequences': True,
                       'sourceSchemaInventory': source_schema, 'restoredSchemaInventory': restored_schema,
                       'sourceDumpSchemaSha256': source['schemaSha256'], 'restoredDumpSchemaSha256': restored['schemaSha256'],
                       'objectsVerified': len(manifest['objects']), 'productionRestored': False})


def update(rehearse=False):
    import native_release as release
    import native_runtime_app as app
    import native_cutover as cutover
    import native_release_backup as protection_api
    require(not present(JOURNAL), 'R28 migration journal retained; no blind retry')
    previous, target = TARGET['base'], TARGET['commit']
    with backup.locked():
        cutover.committed_value(); cutover.no_old_journals()
        require(release.state() == {'version': 1, 'active': previous, 'committed': previous, 'pending': False}, 'R28 requires exact stable 22aac baseline')
        migration_state(37)
        schema_state(37); before_access = access_state()
        release.verify_checkout(previous); release.verify_checkout(target)
        app.validate_files(); release.verify_running()
        for ref in (*TARGET['images'].values(), TARGET['opsImage']): image_identity(ref)
        release.stage_environment(target)
        release.replace_state({'version': 1, 'active': previous, 'committed': previous, 'pending': True})
        quiescence = release.close_program(require_drained=True)
        protection = protection_api.protect(previous, quiescence)
        if rehearse:
            # Before any DDL intent, the unchanged old program remains recoverable.
            release.checkpoint(protection, ROOT / 'release-r28-20260928-checkpoint.json')
        before = snapshot()
        verify_backup_restore(protection, before)
        protection_api.verify_protection(protection)
        advance('MIGRATION_STARTED', protection)
        run_worker('migrate')
        migration_state(41)
        schema_state(41)
        after_access = access_state()
        require(all(after_access.get(key) == value for key, value in before_access.items()), 'Existing object privileges changed')
        migrated = snapshot(); verify_migration(before, migrated, TARGET['migrations'])
        advance('DB41_VERIFIED')
        run_worker('reconcile')
        reconciled = snapshot(); verify_reconcile(migrated, reconciled)
        # Repeat before changing phase: this CLI is idempotent and starts no workers.
        run_worker('reconcile')
        require(snapshot() == reconciled, 'R28 reconciliation is not idempotent')
        manifest = protection_api.verify_backup(protection)
        backup.copy_objects(app.ROOT / 'objects', backup.ROOT / protection['backup'] / 'r28-migration-objects', expected=manifest['objects'])
        backup.write_json(backup.ROOT / protection['backup'] / 'r28-preservation-proof.json',
                          {'beforeSha256': digest_json(before), 'migratedSha256': digest_json(migrated),
                           'reconciledSha256': digest_json(reconciled), 'roleGrantsAndCredentialsPreserved': True,
                           'completedHistoryPreserved': True, 'migrations': 41, 'reconcileIdempotent': True})
        advance('RECONCILED')
        release.replace_state({'version': 1, 'active': target, 'committed': previous, 'pending': True})
        app.validate_files()
        # API startup itself starts schedulers: prohibit snapshot rollback BEFORE it.
        advance('WRITE_ENABLE_INTENT')
        protection_api.resume_dependencies()
    cutover.systemctl('--no-block', 'start', *cutover.APPS)
    cutover.check_health()
    with backup.locked():
        require(release.state() == {'version': 1, 'active': target, 'committed': previous, 'pending': True}, 'R28 release intent changed')
        release.verify_running(); migration_state(41)
        advance('OPEN_41')
        release.replace_state({'version': 1, 'active': target, 'committed': target, 'pending': False})
    cutover.systemctl('--no-block', 'start', *cutover.SOCKETS)
    cutover.check_health(public=True)
    print(json.dumps({'r28MigrationRelease': 'RUNTIME_READY', 'runtimeCommit': target, 'migrations': 41,
                      'backup': protection['backup'], 'databaseRestored': False, 'productAccepted': False}), flush=True)
