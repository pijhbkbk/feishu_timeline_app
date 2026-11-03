"""Fixed 41-to-54 production release using the scanned, imported V1 images.

Every partial migration or new-program start remains closed for investigation.
The retained rehearsal copy is evidence only. Production is migrated in place
from a fresh, drained B1 snapshot, preserving its account and object identities.
"""
import json
import os
import re
from pathlib import Path
import secrets
import stat
from urllib.parse import quote
import native_backup_controller as backup
import native_cutover as cutover
import native_database_scope as scope
import native_release_backup as protection
import native_release_r28 as historical
import native_release_r28_patch as previous
import native_r28_schema as schema
import native_runtime_app as app
import native_v1_preservation as preservation
from native_release_target_v1 import TARGET

ROOT = app.ROOT / 'v1-release-20261104'
HEAD = ROOT / 'head.json'
IMPORT = app.ROOT / 'v1-artifacts-0bcab226'
PLAN = Path('/usr/local/lib/timeline-native-ops/native_v1_plan.json')
REHEARSAL = app.ROOT / 'v1-rehearsal-20261104' / 'complete.json'
WORKER = 'timeline-native-v1-production-migration'
LABEL = 'com.timeline.v1.production-migration'
PHASES = ('BASE', 'PREPARED', 'PROTECTED', 'MIGRATION_STARTED', 'DB54_VERIFIED',
          'WRITE_ENABLE_INTENT', 'VERIFIED_CLOSED', 'OPEN_INTENT', 'COMMITTED')
require = backup.require
digest = historical.digest_json


def enabled():
    return os.path.lexists(ROOT)


def identity():
    return {key: TARGET[key] for key in ('commit', 'tree', 'release', 'buildTime', 'images')}


def plan():
    raw = backup.read_file(PLAN, 32768, owner=0)
    require(backup.sha(raw) == TARGET['planSha256'], 'Fixed V1 plan changed')
    value = json.loads(raw)
    require(value['base'] == TARGET['base'] and value['opsImageId'] == TARGET['opsImage'] and
            value['candidate'] == {'sourceCommit': TARGET['commit'], 'sourceTree': TARGET['tree'],
                                   'release': TARGET['release'], 'buildTime': TARGET['buildTime']} and
            len(value['migrations']) == 54, 'V1 plan identity differs')
    return value


def old_anchors():
    cutover.committed_value()
    for path, expected in [(historical.JOURNAL, TARGET['migrationAnchorSha256']),
                           (previous.HEAD, TARGET['patchHeadSha256'])]:
        require(backup.sha(backup.read_file(path, 4096, owner=0)) == expected, 'Historical release anchor changed')


def database_state(count):
    expected = plan()['migrations']
    require(count in (41, 54), 'Unknown database generation')
    if count == 41:
        expected = dict(sorted(expected.items())[:41])
    query = lambda sql: backup.sql(sql, cutover.DATABASE, cutover.ROLE)
    preservation.migration_rows(query, expected)
    actual = schema.digest(schema.inventory(query))
    require(actual == (historical.SCHEMA[41] if count == 41 else TARGET['schema54']),
            'Production schema differs from the fixed generation')


def verified_image(component, supplied_identity=None):
    require(component in ('api', 'web', 'ops'), 'Unknown V1 image component')
    require(supplied_identity is None or supplied_identity == identity(), 'V1 runtime identity differs')
    raw = backup.read_file(IMPORT / 'manifest.json', 65536, owner=0)
    require(backup.sha(raw) == TARGET['imageManifestSha256'], 'Imported CI manifest changed')
    manifest = json.loads(raw)
    require(manifest['identity'] == plan()['candidate'], 'Imported build identity differs')
    name = 'api-ops' if component == 'ops' else component
    entries = [entry for entry in manifest['images'] if entry['name'] == name]
    reference = TARGET['opsImage'] if component == 'ops' else TARGET['images'][component]
    require(len(entries) == 1 and entries[0]['imageId'] == reference and
            entries[0]['scan']['findings'] == [] and entries[0]['scan']['toolErrors'] == 0,
            'Image scan and content identity differ')
    receipt = backup.read_json(IMPORT / 'import-result.json')
    require(receipt['imageImport'] == 'PASS' and receipt['identity'] == manifest['identity'] and
            {'name': name, 'imageId': reference, 'archiveSha256': entries[0]['archiveSha256']} in receipt['images'],
            'Actual image import proof differs')
    items = json.loads(app.docker('image', 'inspect', reference))
    require(len(items) == 1, 'Ambiguous imported image')
    image = items[0]
    labels = image['Config'].get('Labels', {})
    require(image['Id'] == reference and image['Os'] == 'linux' and image['Architecture'] == 'amd64' and
            image['Config']['User'] == 'node' and
            labels.get('org.opencontainers.image.revision') == TARGET['commit'] and
            labels.get('com.feishu-timeline.source-tree') == TARGET['tree'] and
            labels.get('org.opencontainers.image.version') == TARGET['release'] and
            labels.get('org.opencontainers.image.created') == TARGET['buildTime'],
            'Loaded V1 image identity differs')
    return image


def event_path(phase):
    require(phase in PHASES, 'Unknown V1 phase')
    return ROOT / (phase.lower() + '.json')


def record():
    old_anchors()
    fd = backup.directory(ROOT, trusted=True)
    require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700, 'V1 state directory must be private')
    os.close(fd)
    head = backup.read_json(HEAD)
    require(set(head) == {'phase', 'eventSha256'} and head['phase'] in PHASES, 'V1 head is invalid')
    previous_event = None
    previous_digest = None
    last = PHASES.index(head['phase'])
    for index, phase in enumerate(PHASES):
        path = event_path(phase)
        if index > last:
            require(not os.path.lexists(path), 'V1 event is ahead of its durable head')
            continue
        raw = backup.read_file(path, 8192, owner=0)
        value = backup.read_json(path)
        require(set(value) == {'version', 'base', 'target', 'targetSha256', 'phase', 'previousSha256',
                              'backup', 'backupReceiptSha256', 'baselineSha256', 'migrationReceiptSha256'} and
                value['version'] == 1 and value['base'] == TARGET['base'] and value['target'] == TARGET['commit'] and
                value['targetSha256'] == digest(TARGET) and value['phase'] == phase and
                value['previousSha256'] == previous_digest, 'V1 event binding differs')
        if index < PHASES.index('PROTECTED'):
            require(value['backup'] is None and value['backupReceiptSha256'] is None and
                    value['baselineSha256'] is None, 'Unexpected early V1 backup')
        else:
            require(isinstance(value['backup'], str) and backup.BACKUP.fullmatch(value['backup']), 'Invalid V1 backup identity')
            receipt_path = backup.ROOT / value['backup'] / 'snapshot-complete.json'
            require(backup.sha(backup.read_file(receipt_path, 8192, owner=0)) == value['backupReceiptSha256'] and
                    backup.sha(backup.read_file(ROOT / 'before.json', 262144, owner=0)) == value['baselineSha256'],
                    'Fresh B1 evidence changed')
            receipt = backup.read_json(receipt_path)
            require(receipt['runtimeCommit'] == TARGET['base'] and receipt['database'] == cutover.DATABASE and
                    receipt['tableCount'] == 54 and not receipt['databaseRestored'] and not receipt['migrationExecuted'],
                    'Fresh B1 scope differs')
            if index > PHASES.index('PROTECTED'):
                require(all(value[key] == previous_event[key] for key in
                            ('backup', 'backupReceiptSha256', 'baselineSha256')), 'B1 binding changed between phases')
        if index < PHASES.index('DB54_VERIFIED'):
            require(value['migrationReceiptSha256'] is None, 'Unexpected early migration proof')
        else:
            proof_path = ROOT / 'migration-complete.json'
            require(backup.sha(backup.read_file(proof_path, 8192, owner=0)) == value['migrationReceiptSha256'] and
                    backup.read_json(proof_path) == {'oldTables': 54, 'newTables': 18, 'migrations': 54,
                        'oldColumnsUnchanged': True, 'personProfilesExact': True, 'implicitAdmissionGranted': False},
                    'V1 migration preservation proof differs')
            if index > PHASES.index('DB54_VERIFIED'):
                require(value['migrationReceiptSha256'] == previous_event['migrationReceiptSha256'],
                        'Migration proof changed between phases')
        previous_event = value
        previous_digest = backup.sha(raw)
    require(previous_digest == head['eventSha256'], 'V1 head digest differs')
    return previous_event


def advance(phase, receipt=None):
    require(phase in PHASES and not os.path.lexists(event_path(phase)), 'V1 phase already exists or is unknown')
    current = None if phase == 'BASE' else record()
    require(phase == ('BASE' if current is None else PHASES[PHASES.index(current['phase']) + 1]),
            'V1 phases cannot skip or reverse')
    value = {'version': 1, 'base': TARGET['base'], 'target': TARGET['commit'], 'targetSha256': digest(TARGET),
             'phase': phase, 'previousSha256': None if current is None else backup.sha(
                 backup.read_file(event_path(current['phase']), 8192, owner=0)),
             'backup': current['backup'] if current else None,
             'backupReceiptSha256': current['backupReceiptSha256'] if current else None,
             'baselineSha256': current['baselineSha256'] if current else None,
             'migrationReceiptSha256': current['migrationReceiptSha256'] if current else None}
    if phase == 'PROTECTED':
        require(receipt is not None, 'Fresh B1 receipt required')
        value.update(backup=receipt['backup'], backupReceiptSha256=backup.sha(backup.read_file(
            backup.ROOT / receipt['backup'] / 'snapshot-complete.json', 8192, owner=0)),
            baselineSha256=backup.sha(backup.read_file(ROOT / 'before.json', 262144, owner=0)))
    if phase == 'DB54_VERIFIED':
        value['migrationReceiptSha256'] = backup.sha(backup.read_file(ROOT / 'migration-complete.json', 8192, owner=0))
    backup.write_json(event_path(phase), value)
    temporary = ROOT / ('head-' + secrets.token_hex(8) + '.tmp')
    backup.write_json(temporary, {'phase': phase, 'eventSha256': backup.sha(
        backup.read_file(event_path(phase), 8192, owner=0))})
    os.replace(temporary, HEAD)
    backup.fsync_dir(ROOT)
    require(record() == value, 'V1 event durability differs')


def initialize():
    import native_release as release
    require(not os.path.lexists(ROOT) and release.state() == previous.stable(TARGET['base']),
            'V1 initialization requires an unused path and stable source')
    previous.record()
    database_state(41)
    raw = backup.read_file(REHEARSAL, 32768, owner=0)
    require(backup.sha(raw) == TARGET['rehearsalReceiptSha256'], 'Rehearsal proof changed')
    proof = json.loads(raw)
    require(proof['candidate'] == plan()['candidate'] and proof['migrations'] == 54 and
            proof['oldColumnsUnchanged'] and proof['personProfilesExact'] and
            not proof['implicitAdmissionGranted'] and proof['schemaSha256'] == TARGET['schema54'],
            'Rehearsal does not support this candidate')
    for component in ('api', 'web', 'ops'):
        verified_image(component)
    ROOT.mkdir(mode=0o700)
    backup.fsync_dir(ROOT.parent)
    advance('BASE')


def assert_start(commit, ingress=False):
    import native_release as release
    phase = record()['phase']
    state = release.state()
    aborted = ROOT / 'aborted-before-migration.json'
    if os.path.lexists(aborted):
        require(phase in ('BASE', 'PREPARED', 'PROTECTED') and backup.read_json(aborted) == {
            'headSha256': backup.sha(backup.read_file(HEAD, 4096, owner=0)), 'base': TARGET['base']},
            'Invalid pre-migration abort receipt')
        require(commit == TARGET['base'] and state == previous.stable(commit), 'Aborted release can start only its source')
        database_state(41)
        return
    if phase == 'BASE':
        require(commit == TARGET['base'] and state == previous.stable(commit), 'BASE permits only its stable source')
        database_state(41)
        return
    require(commit == TARGET['commit'], 'V1 phase rejects the previous program')
    if phase in ('WRITE_ENABLE_INTENT', 'VERIFIED_CLOSED'):
        require(not ingress and state == {'version': 1, 'active': commit, 'committed': TARGET['base'], 'pending': True},
                'V1 write-enable state differs')
    else:
        require(phase in ('OPEN_INTENT', 'COMMITTED') and state == previous.stable(commit), 'V1 program is not ready')
    database_state(54)


def worker():
    names = app.docker('container', 'ls', '-a', '--filter', 'name=^' + WORKER + '$', '--format', '{{.ID}}').decode().splitlines()
    require(len(names) <= 1, 'Ambiguous V1 migration worker')
    if not names:
        return None
    item = json.loads(app.docker('container', 'inspect', WORKER))[0]
    require(item['Name'] == '/' + WORKER and item['Image'] == TARGET['opsImage'] and
            item['Config']['Image'] == TARGET['opsImage'] and
            item['Config'].get('Labels', {}).get(LABEL) == digest(TARGET), 'Unowned V1 migration worker')
    return item


def stop_worker():
    item = worker()
    if item is not None:
        if item['State']['Running']:
            app.docker('stop', '--time=10', WORKER)
        final = worker()
        require(final['Id'] == item['Id'] and not final['State']['Running'] and final['State']['Pid'] == 0,
                'V1 migration worker exit unproved')


def hold_closed():
    import native_release as release
    errors = []
    for action in (scope.close_role, release.close_program, stop_worker,
                   lambda: cutover.systemctl('stop', protection.REDIS_UNIT)):
        try:
            action()
        except BaseException as error:
            errors.append(type(error).__name__)
    require(not errors, 'V1 maintenance closure incomplete; inspect retained state')
    raise backup.Failure('V1 release is incomplete; maintenance retained without automatic snapshot restore')


def recover_guard():
    import native_release as release
    try:
        phase = record()['phase']
        require(phase in ('BASE', 'COMMITTED') or os.path.lexists(ROOT / 'aborted-before-migration.json'),
                'V1 incomplete phase requires forward investigation')
        assert_start(release.state()['active'], ingress=True)
    except BaseException:
        hold_closed()
        raise


def stage_environment():
    import native_release as release
    for component in ('api', 'web'):
        verified_image(component)
        raw = app.environment_bytes(identity()) if component == 'api' else app.web_environment_bytes(identity())
        path = release.environment_path(component, TARGET['commit'])
        if not os.path.lexists(path):
            backup.write_private(path, raw)
        require(backup.read_file(path, 16384, owner=0) == raw, 'V1 staged environment differs')


def migrate():
    require(record()['phase'] == 'MIGRATION_STARTED' and worker() is None, 'V1 migration is single-use')
    protection.assert_frozen()
    scope.verify()
    verified_image('ops')
    credentials = backup.read_json(app.migration.RESTORE / 'credentials.json')
    require(credentials['database'] == cutover.DATABASE and credentials['role'] == cutover.ROLE and
            re.fullmatch(r'[A-Za-z0-9_-]{40,100}', credentials['password']),
            'Production migration credential scope differs')
    environment = ('DATABASE_URL=postgresql://' + cutover.ROLE + ':' + quote(credentials['password'], safe='') +
                   '@127.0.0.1:5432/' + cutover.DATABASE + '?connection_limit=2&pool_timeout=10\n')
    backup.write_private(ROOT / 'migration.env', environment.encode())
    try:
        backup.role_change('ALTER ROLE "' + cutover.ROLE + '" LOGIN CONNECTION LIMIT 3;')
        output = backup.command(['/usr/bin/docker', 'run', '--name=' + WORKER,
            '--label=' + LABEL + '=' + digest(TARGET), '--user=1000:1000', '--read-only', '--cap-drop=ALL',
            '--security-opt=no-new-privileges', '--network=host', '--memory=512m', '--memory-swap=512m',
            '--cpus=0.75', '--pids-limit=64', '--ulimit=nofile=256:256', '--restart=no',
            '--tmpfs=/tmp:rw,noexec,nosuid,size=64m', '--env-file=' + str(ROOT / 'migration.env'),
            TARGET['opsImage'], 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], timeout=180)
        require(len(output) <= 65536, 'V1 migration output exceeds bound')
        backup.write_private(ROOT / 'migration.log', output)
    finally:
        try:
            scope.close_role()
        finally:
            stop_worker()
    protection.assert_frozen()
    before = backup.read_json(ROOT / 'before.json')
    result = preservation.verify_after(lambda sql: backup.sql(sql, cutover.DATABASE, cutover.ROLE),
                                       before, plan()['migrations'])
    database_state(54)
    backup.write_json(ROOT / 'migration-complete.json', result)


def update():
    import native_release as release
    with backup.locked():
        require(record()['phase'] == 'BASE' and not os.path.lexists(ROOT / 'aborted-before-migration.json') and
                release.state() == previous.stable(TARGET['base']), 'V1 requires its stable, unused base')
        release.verify_checkout(TARGET['base'])
        release.verify_checkout(TARGET['commit'])
        release.verify_running()
        stage_environment()
        database_state(41)
        advance('PREPARED')
        release.replace_state({**previous.stable(TARGET['base']), 'pending': True})
        quiescence = release.close_program(require_drained=True)
        receipt = protection.protect(TARGET['base'], quiescence)
        before = preservation.capture_before(lambda sql: backup.sql(sql, cutover.DATABASE, cutover.ROLE),
                                              dict(sorted(plan()['migrations'].items())[:41]))
        backup.write_json(ROOT / 'before.json', before)
        protection.verify_protection(receipt)
        advance('PROTECTED', receipt)
        bounds = backup.sql('SELECT count(*) FROM public.users WHERE char_length(name)>100 OR '
                            'char_length(email)>160 OR char_length(mobile)>32;', cutover.DATABASE, cutover.ROLE)
        require(bounds == '0', 'Current B1 user text exceeds preserved migration bounds')
        advance('MIGRATION_STARTED')
        migrate()
        advance('DB54_VERIFIED')
        advance('WRITE_ENABLE_INTENT')
        release.replace_state({'version': 1, 'active': TARGET['commit'], 'committed': TARGET['base'], 'pending': True})
        app.validate_files()
        protection.resume_dependencies()
    cutover.systemctl('--no-block', 'start', *cutover.APPS)
    cutover.check_health()
    with backup.locked():
        assert_start(TARGET['commit'])
        release.verify_running()
        protection.verify_backup(receipt)
        advance('VERIFIED_CLOSED')
        release.replace_state(previous.stable(TARGET['commit']))
        advance('OPEN_INTENT')
    cutover.systemctl('--no-block', 'start', *cutover.SOCKETS)
    cutover.check_health(public=True)
    with backup.locked():
        assert_start(TARGET['commit'], ingress=True)
        advance('COMMITTED')
    print(json.dumps({'v1ProductionRelease': 'RUNTIME_READY', 'runtimeCommit': TARGET['commit'],
                      'backup': receipt['backup'], 'migrations': 54, 'rehearsalDatabasePromoted': False,
                      'databaseRestored': False, 'productAccepted': False}), flush=True)


def resume_base():
    import native_release as release
    with backup.locked():
        phase = record()['phase']
        require(phase in ('BASE', 'PREPARED', 'PROTECTED'), 'Old program recovery is forbidden after migration intent')
        database_state(41)
        require(release.state() in [previous.stable(TARGET['base']),
                {**previous.stable(TARGET['base']), 'pending': True}], 'Pre-migration source identity differs')
        value = {'headSha256': backup.sha(backup.read_file(HEAD, 4096, owner=0)), 'base': TARGET['base']}
        path = ROOT / 'aborted-before-migration.json'
        if not os.path.lexists(path):
            backup.write_json(path, value)
        require(backup.read_json(path) == value, 'Pre-migration abort evidence differs')
        release.replace_state(previous.stable(TARGET['base']))
        protection.resume_dependencies()
    cutover.systemctl('--no-block', 'start', *cutover.APPS)
    cutover.check_health()
    cutover.systemctl('--no-block', 'start', *cutover.SOCKETS)
    cutover.check_health(public=True)
