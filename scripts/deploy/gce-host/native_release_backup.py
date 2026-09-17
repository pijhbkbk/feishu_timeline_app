"""Same-host, private program-release protection for the promoted native database.

Only the existing native app/Redis and its database role are frozen. No restore,
seed, migrations, role creation, legacy DB dump, or shared-host volume export.
"""
import datetime
import json
import os
from pathlib import Path
import secrets
import shutil
import stat
import native_backup_controller as backup
import native_runtime_app as app
import native_runtime_redis as redis
import native_cutover as cutover
import native_database_scope as scope

require = backup.require
REDIS_UNIT = 'timeline-native-redis.service'


def assert_frozen():
    for unit in cutover.APPS + cutover.SOCKETS + cutover.PROXIES:
        value = cutover.unit_state(unit)
        require(value['ActiveState'] == 'inactive' and value['MainPID'] == '0' and value['ControlPID'] == '0',
                'Native application writer/ingress remains active')
    require(all(app.inspect(component) is None for component in ('api', 'web')), 'Native application container remains')
    require(backup.sql("SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname='" + cutover.DATABASE + "';") == '0',
            'Native database still has clients')
    require(backup.sql("SELECT count(*) FROM pg_catalog.pg_prepared_xacts WHERE database='" + cutover.DATABASE + "';") == '0',
            'Native database has prepared transactions')
    require(backup.sql("SELECT NOT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname='" + cutover.ROLE + "';") == 't',
            'Native application role is not frozen')
    item = redis.inspect()
    require(item is not None and not item['State']['Running'] and item['State']['Pid'] == 0 and
            item['State']['ExitCode'] == 0 and not item['State']['OOMKilled'], 'Native Redis did not stop cleanly')


def protect(commit, quiescence=None):
    from native_release import state
    value = state()
    require(value == {'version': 1, 'active': commit, 'committed': commit, 'pending': True},
            'Durable previous-program intent is required before protection')
    scope.verify()
    redis.validate_files()
    item = redis.inspect()
    require(item is not None and item['State']['Running'], 'Native Redis must be healthy before protection')
    require(type(quiescence) is dict and set(quiescence) == {'apiWasRunning', 'apiDrainSupported', 'apiExitCode', 'apiGracefulDrainVerified', 'legacyApiFreezeOnly'}, 'API shutdown observation missing')
    image = json.loads(redis.run(['/usr/bin/docker', 'image', 'inspect', redis.IMAGE]))[0]
    require(redis.IMAGE in image['RepoDigests'], 'Redis image digest differs')
    redis.validate_container(item, image['Id'])
    require(shutil.disk_usage(backup.ROOT).free >= 2 * 1024 * 1024 * 1024, 'Insufficient private backup headroom')
    # These reversible closures happen only after release pending is durable.
    # Existing cutover recovery reopens this exact role and starts app dependencies.
    scope.close_role()
    cutover.systemctl('stop', REDIS_UNIT)
    redis.stop()
    assert_frozen()
    before = backup.fingerprints(cutover.DATABASE, cutover.ROLE)
    require(len(before['tables']) == 52, 'Native schema table inventory differs')
    name = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + secrets.token_hex(4)
    folder = backup.ROOT / name
    folder.mkdir(mode=0o700)
    backup.fsync_dir(backup.ROOT)
    dump = cutover.dump_native(folder / 'database.dump')
    objects = backup.copy_objects(app.ROOT / 'objects', folder / 'objects')
    redis_files = backup.copy_objects(redis.ROOT / 'redis-data', folder / 'redis-data')
    for item in redis_files:
        item['path'] = 'redis-data/' + item['path'].removeprefix('objects/')
    assert_frozen()
    require(backup.fingerprints(cutover.DATABASE, cutover.ROLE) == before,
            'Frozen native database changed while protected')
    manifest = {'version': 2, 'purpose': 'native-program-release-protection', 'runtimeCommit': commit,
                'sourceDatabase': cutover.DATABASE, 'quiescence': quiescence, 'database': dump, 'objects': objects, 'redisFiles': redis_files,
                'redisRestorePolicy': 'No automatic Redis restore; private same-host protection only. Sessions must not be revived by migration.',
                'secrets': 'Existing root-controlled credentials remain separately at their original locations.'}
    backup.write_json(folder / 'release-manifest.json', manifest)
    backup.write_json(folder / 'table-fingerprints.json', before)
    receipt = {'backup': name, 'runtimeCommit': commit, 'database': cutover.DATABASE,
               'manifestSha256': backup.sha(backup.read_file(folder / 'release-manifest.json', 1024 * 1024, owner=0)),
               'fingerprintsSha256': backup.sha(backup.read_file(folder / 'table-fingerprints.json', 1024 * 1024, owner=0)),
               'tableCount': len(before['tables']), 'objectCount': len(objects), 'redisFileCount': len(redis_files),
               'databaseRestored': False, 'migrationExecuted': False}
    backup.write_json(folder / 'snapshot-complete.json', receipt)
    verify_backup(receipt)
    print(json.dumps({'nativeProgramProtection': 'PASS', **receipt, 'credentialsExported': False}), flush=True)
    return receipt


def verify_backup(receipt):
    require(type(receipt) is dict and backup.BACKUP.fullmatch(receipt['backup']), 'Invalid private backup identifier')
    folder = backup.ROOT / receipt['backup']
    fd = backup.directory(folder, trusted=True)
    try:
        require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700, 'Private backup directory differs')
    finally:
        os.close(fd)
    raw = backup.read_file(folder / 'release-manifest.json', 1024 * 1024, owner=0)
    require(backup.sha(raw) == receipt['manifestSha256'], 'Release backup manifest changed')
    manifest = backup.read_json(folder / 'release-manifest.json')
    require(manifest['purpose'] == 'native-program-release-protection' and manifest['sourceDatabase'] == cutover.DATABASE and
            manifest['runtimeCommit'] == receipt['runtimeCommit'], 'Release backup scope differs')
    require(backup.sha(backup.read_file(folder / 'table-fingerprints.json', 1024 * 1024, owner=0)) == receipt['fingerprintsSha256'],
            'Backup fingerprint proof changed')
    entries = [manifest['database'], *manifest['objects'], *manifest['redisFiles']]
    seen = set()
    for entry in entries:
        relative = Path(entry['path'])
        require(not relative.is_absolute() and '..' not in relative.parts and str(relative) == entry['path'] and
                (entry['path'] == 'database.dump' or relative.parts[0] in ('objects', 'redis-data')) and entry['path'] not in seen,
                'Backup file path outside fixed scope')
        seen.add(entry['path'])
        fd = backup.directory((folder / relative).parent, trusted=True)
        os.close(fd)
        raw = backup.read_file(folder / relative, backup.MAX_DUMP if entry['path'] == 'database.dump' else backup.MAX_OBJECT, owner=0)
        require(len(raw) == entry['size'] and backup.sha(raw) == entry['sha256'], 'Protected backup file digest differs')
    return manifest


def resume_dependencies():
    # Never create roles or touch the old/shared application role.
    backup.role_change('ALTER ROLE "' + cutover.ROLE + '" LOGIN CONNECTION LIMIT 12;')
    cutover.systemctl('--no-block', 'start', REDIS_UNIT)


def verify_protection(receipt):
    manifest = verify_backup(receipt)
    folder = backup.ROOT / receipt['backup']
    baseline = backup.read_json(folder / 'table-fingerprints.json')
    require(backup.fingerprints(cutover.DATABASE, cutover.ROLE) == baseline,
            'Database changed during private release check; retain pending state for investigation')
    # Reuse the bounded no-symlink fd traversal to verify source bytes as well
    # as the retained backup, without invoking archive extraction. A separate
    # private check copy is retained; it never replaces the restore objects.
    check = folder / ('poststart-objects-' + secrets.token_hex(8))
    backup.copy_objects(app.ROOT / 'objects', check, expected=manifest['objects'])
    # Existing app start can consume durable jobs. Such a difference is a stop for
    # investigation, never silently excluded or "repaired" by database restore.
