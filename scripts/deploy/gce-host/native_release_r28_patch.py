"""One fixed 41-to-41 program release; every incomplete attempt stays closed.

The original R28 migration journal and its backup are immutable anchors. This
controller never migrates, seeds, reconciles or restores database/object/Redis data.
"""
import json
import os
from pathlib import Path
import secrets
import native_backup_controller as backup
import native_release_r28 as migration
from native_release_target_r28_patch import TARGET

require = backup.require
ROOT = Path('/var/lib/timeline-native-app')
HEAD = ROOT / 'r28-program-patch-head.json'
PHASES = ('BASE', 'PREPARED', 'PROTECTED', 'WRITE_ENABLE_INTENT',
          'VERIFIED_CLOSED', 'OPEN_INTENT', 'COMMITTED')


def stable(commit):
    return {'version': 1, 'active': commit, 'committed': commit, 'pending': False}


def event_path(phase):
    require(phase in PHASES, 'Unknown fixed program phase')
    return ROOT / ('r28-program-patch-' + phase.lower() + '.json')


def anchor():
    import native_cutover as cutover
    cutover.committed_value()
    value = migration.journal()
    require(value is not None and value['phase'] == 'OPEN_41' and
            value['target'] == TARGET['base'] and
            backup.sha(backup.read_file(migration.JOURNAL, 4096, owner=0)) == TARGET['migrationAnchorSha256'],
            'Original 41-migration release anchor differs; hold closed')
    migration.migration_state(41)
    migration.schema_state(41)


def record():
    """Missing, corrupt, truncated or rolled-back heads are never a BASE fallback."""
    anchor()
    head = backup.read_json(HEAD)
    require(type(head) is dict and set(head) == {'phase', 'eventSha256'} and head['phase'] in PHASES,
            'Program head is missing or unknown; hold closed')
    last = PHASES.index(head['phase'])
    previous = None
    digest = None
    for index, phase in enumerate(PHASES):
        path = event_path(phase)
        if index > last:
            require(not os.path.lexists(path), 'Ahead-of-head program event; hold closed')
            continue
        raw = backup.read_file(path, 4096, owner=0)
        value = backup.read_json(path)
        require(type(value) is dict and set(value) == {'version', 'base', 'target', 'planSha256',
                'migrationAnchorSha256', 'phase', 'previousSha256', 'backup', 'backupReceiptSha256'} and
                type(value['version']) is int and value['version'] == 1 and
                value['base'] == TARGET['base'] and value['target'] == TARGET['commit'] and
                value['planSha256'] == migration.digest_json(TARGET) and
                value['migrationAnchorSha256'] == TARGET['migrationAnchorSha256'] and
                value['phase'] == phase and value['previousSha256'] == digest,
                'Program event binding differs; hold closed')
        if index < PHASES.index('PROTECTED'):
            require(value['backup'] is None and value['backupReceiptSha256'] is None, 'Unexpected early protection')
        else:
            require(type(value['backup']) is str and backup.BACKUP.fullmatch(value['backup']), 'Invalid patch backup')
            receipt = backup.ROOT / value['backup'] / 'snapshot-complete.json'
            require(backup.sha(backup.read_file(receipt, 4096, owner=0)) == value['backupReceiptSha256'],
                    'Patch backup binding differs')
            proof = backup.read_json(receipt)
            require(proof['runtimeCommit'] == TARGET['base'] and proof['database'] == migration.db.DATABASE and
                    proof['tableCount'] == 54 and proof['databaseRestored'] is False and proof['migrationExecuted'] is False,
                    'Patch protection scope differs')
            if index > PHASES.index('PROTECTED'):
                require((value['backup'], value['backupReceiptSha256']) ==
                        (previous['backup'], previous['backupReceiptSha256']), 'Patch protection changed')
        previous = value
        digest = backup.sha(raw)
    require(digest == head['eventSha256'], 'Program head digest differs')
    return previous


def append(phase, previous=None, protection=None):
    require(phase == ('BASE' if previous is None else PHASES[PHASES.index(previous['phase']) + 1]),
            'Program phases cannot skip or reverse')
    value = {'version': 1, 'base': TARGET['base'], 'target': TARGET['commit'],
             'planSha256': migration.digest_json(TARGET), 'migrationAnchorSha256': TARGET['migrationAnchorSha256'],
             'phase': phase, 'previousSha256': None if previous is None else
                 backup.sha(backup.read_file(event_path(previous['phase']), 4096, owner=0)),
             'backup': previous['backup'] if previous else None,
             'backupReceiptSha256': previous['backupReceiptSha256'] if previous else None}
    if phase == 'PROTECTED':
        require(protection is not None, 'Fresh 41-schema protection required')
        value['backup'] = protection['backup']
        value['backupReceiptSha256'] = backup.sha(backup.read_file(
            backup.ROOT / protection['backup'] / 'snapshot-complete.json', 4096, owner=0))
    backup.write_json(event_path(phase), value)
    temporary = ROOT / ('r28-program-head-' + secrets.token_hex(12) + '.tmp')
    backup.write_json(temporary, {'phase': phase, 'eventSha256': backup.sha(
        backup.read_file(event_path(phase), 4096, owner=0))})
    os.replace(temporary, HEAD)
    backup.fsync_dir(ROOT)
    require(record() == value, 'Program journal durability unproved')


def initialize():
    """Installer only, under both locks, before any replacement gate is activated."""
    import native_release as release
    anchor()
    require(release.state() == stable(TARGET['base']), 'Only stable 41-schema source can initialize patch journal')
    if os.path.lexists(HEAD):
        require(record()['phase'] == 'BASE', 'Patch already attempted; installer cannot reset it')
        return
    require(not any(os.path.lexists(event_path(p)) for p in PHASES), 'Unheaded program event; inspect without reset')
    append('BASE')


def advance(phase, protection=None):
    append(phase, record(), protection)


def assert_start(commit, ingress=False):
    import native_release as release
    phase = record()['phase']
    state = release.state()
    if phase == 'BASE':
        require(commit == TARGET['base'] and state == stable(commit), 'BASE authorizes only its stable program')
        return
    require(commit == TARGET['commit'], 'Patch phase forbids the previous program')
    if phase in ('WRITE_ENABLE_INTENT', 'VERIFIED_CLOSED'):
        require(not ingress and state == {'version': 1, 'active': commit, 'committed': TARGET['base'], 'pending': True},
                'Candidate startup/ingress phase differs')
    else:
        require(phase in ('OPEN_INTENT', 'COMMITTED') and state == stable(commit),
                'Program phase does not authorize startup')


def recover_guard():
    import native_release as release
    try:
        value = record()
        require(value['phase'] in ('BASE', 'COMMITTED'), 'Incomplete program release requires forward investigation')
        assert_start(release.state()['active'], ingress=True)
    except BaseException:
        migration.hold_closed()
        raise


def update():
    import native_release as release
    import native_runtime_app as app
    import native_cutover as cutover
    import native_release_backup as protection
    with backup.locked():
        require(record()['phase'] == 'BASE' and release.state() == stable(TARGET['base']),
                'Patch is single-use and requires stable base')
        cutover.committed_value()
        release.verify_checkout(TARGET['base'])
        release.verify_checkout(TARGET['commit'])
        app.validate_files()
        release.verify_running()
        release.stage_environment(TARGET['commit'])
        # Durable intent precedes closure and every later chance to start a writer.
        advance('PREPARED')
        release.replace_state({**stable(TARGET['base']), 'pending': True})
        quiescence = release.close_program(require_drained=True)
        receipt = protection.protect(TARGET['base'], quiescence)
        advance('PROTECTED', receipt)
        protection.assert_frozen()
        protection.verify_protection(receipt)
        anchor()
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
        # API startup can write reminder/lease state: never compare live data to
        # the pre-start snapshot here and never restore it on failure.
        advance('VERIFIED_CLOSED')
        release.replace_state(stable(TARGET['commit']))
        advance('OPEN_INTENT')
    cutover.systemctl('--no-block', 'start', *cutover.SOCKETS)
    cutover.check_health(public=True)
    with backup.locked():
        assert_start(TARGET['commit'], ingress=True)
        advance('COMMITTED')
    print(json.dumps({'r28ProgramPatch': 'RUNTIME_READY', 'runtimeCommit': TARGET['commit'],
                      'backup': receipt['backup'], 'migrations': 41, 'migrationExecuted': False,
                      'databaseRestored': False, 'productAccepted': False}), flush=True)
