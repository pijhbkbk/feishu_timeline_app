"""Same-host release backup of the committed September program before V1 rehearsal.

This entry never migrates or restores any database. The prior program resumes
only after the existing 41-migration anchor and exact release state are verified.
Production backup bytes and credentials remain private on their original host.
"""
import json
import os
from pathlib import Path
import socket
import stat
import sys

INSTALLED = Path('/usr/local/lib/timeline-native-ops')
if Path(__file__).parent == INSTALLED:
    for node in [*reversed(INSTALLED.parents), INSTALLED]:
        info = node.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError('Untrusted installed directory')
    sys.path.insert(0, str(INSTALLED))

import native_backup_controller as backup
import native_cutover as cutover
import native_release as release
import native_release_backup as protection
import native_release_r28_patch as previous
import native_v1_preservation as preservation

BASE = 'e917da56b9fca54a40635364e168fdb26a080fb1'
DATABASE = 'feishu_timeline_restore_c38c57da'
ROLE = 'timeline_restore_c38c57da'
ROOT = Path('/var/lib/timeline-native-app/v1-prepare-20261104')
PLAN = INSTALLED / 'native_v1_plan.json'
require = backup.require


def baseline():
    require(previous.TARGET['commit'] == BASE and cutover.DATABASE == DATABASE and cutover.ROLE == ROLE,
            'Actual production identity differs')
    require(previous.record()['phase'] == 'COMMITTED', 'Original committed release anchor differs')
    value = release.state()
    require(value in [previous.stable(BASE), {**previous.stable(BASE), 'pending': True}],
            'Backup preparation cannot act on another program')
    release.verify_checkout(BASE)


def event(phase, receipt=None):
    require(phase in ('INTENT', 'PROTECTED', 'RESUME_INTENT', 'RESUMED'), 'Unknown preparation phase')
    value = {'phase': phase, 'base': BASE, 'database': DATABASE, 'backup': receipt,
             'planSha256': backup.sha(backup.read_file(PLAN, 32768, owner=0))}
    backup.write_json(ROOT / (phase.lower() + '.json'), value)
    return value


def saved(phase):
    fd = backup.directory(ROOT, trusted=True)
    try:
        require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700, 'Preparation directory must be private')
    finally:
        os.close(fd)
    value = backup.read_json(ROOT / (phase.lower() + '.json'))
    require(value['phase'] == phase and value['base'] == BASE and value['database'] == DATABASE and
            value['planSha256'] == backup.sha(backup.read_file(PLAN, 32768, owner=0)),
            'Preparation receipt binding differs')
    return value


def resume():
    with backup.locked():
        saved('INTENT')
        baseline()
        require(not (ROOT / 'resumed.json').exists(), 'Preparation already resumed')
        if (ROOT / 'protected.json').exists():
            protection.verify_backup(saved('PROTECTED')['backup'])
        if not (ROOT / 'resume_intent.json').exists():
            event('RESUME_INTENT')
        else:
            saved('RESUME_INTENT')
        # No DDL or data restore exists in this controller. Reopen the same role
        # and program while retaining every successful write and failure receipt.
        release.replace_state(previous.stable(BASE))
        protection.resume_dependencies()
    cutover.systemctl('--no-block', 'start', *cutover.APPS)
    cutover.check_health()
    with backup.locked():
        baseline()
        release.verify_running()
    cutover.systemctl('--no-block', 'start', *cutover.SOCKETS)
    cutover.check_health(public=True)
    with backup.locked():
        baseline()
        event('RESUMED')


def snapshot():
    with backup.locked():
        baseline()
        require(release.state() == previous.stable(BASE), 'Source must start stable')
        require(not os.path.lexists(ROOT), 'Prior preparation retained; inspect its explicit phase')
        plan = backup.read_json(PLAN)
        require(plan['base'] == BASE and len(plan['migrations']) == 54, 'V1 plan scope differs')
        old_manifest = dict(sorted(plan['migrations'].items())[:41])
        query = lambda sql: backup.sql(sql, DATABASE, ROLE)
        preservation.migration_rows(query, old_manifest)
        release.verify_running()
        ROOT.mkdir(mode=0o700)
        backup.fsync_dir(ROOT.parent)
        event('INTENT')
        release.replace_state({**previous.stable(BASE), 'pending': True})
        quiescence = release.close_program(require_drained=True)
        receipt = protection.protect(BASE, quiescence)
        protection.assert_frozen()
        before = preservation.capture_before(query, old_manifest)
        backup.write_json(ROOT / 'before.json', before)
        protection.verify_protection(receipt)
        event('PROTECTED', receipt)
    resume()
    result = {'preparation': 'BACKUP_VERIFIED_SOURCE_RESUMED', 'runtimeCommit': BASE,
              'backup': receipt, 'beforeSha256': backup.sha(backup.read_file(ROOT / 'before.json', 131072, owner=0)),
              'productionMigrated': False, 'productionRestored': False}
    backup.write_json(ROOT / 'result.json', result)
    return result


def main():
    require(os.getuid() == 0 and socket.gethostname() == 'instance-20260408-091840' and
            Path(__file__).parent == INSTALLED, 'Use separately installed intended-host controller')
    require(sys.argv[1:] in [['snapshot'], ['resume']], 'Unsupported preparation action')
    with release.operation():
        result = snapshot() if sys.argv[1] == 'snapshot' else resume()
    print(json.dumps(result or {'preparation': 'SOURCE_RESUMED', 'runtimeCommit': BASE}))


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print(json.dumps({'preparation': 'FAILED', 'errorType': type(error).__name__,
                          'reason': str(error) if isinstance(error, backup.Failure) else 'Preparation failed'}), file=sys.stderr)
        sys.exit(1)
