"""Fixed committed 541 owner-account upgrade; never initialize, migrate or restore data."""
import os
from pathlib import Path
import stat
import sys

INSTALLED = Path('/usr/local/lib/timeline-native-ops')
if Path(__file__).parent == INSTALLED:
    for node in [*reversed(INSTALLED.parents), INSTALLED]:
        info = node.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError('Untrusted controller directory')
    sys.path.insert(0, str(INSTALLED))

import json
import fcntl
from contextlib import contextmanager
import pwd
import re
import secrets
import socket
import time
import native_backup_controller as backup

ROOT = Path('/var/lib/timeline-native-app')
STATE = ROOT / 'release-6c70-state.json'
CHECKPOINT = ROOT / 'release-owner-20260918-checkpoint.json'
OLD = '541b3dfff682aa29b49a96b251f0a084903c981a'
REGISTRY = 'us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/'
# A new immutable module is installed before this controller is atomically replaced.
# The previous controller continues reading its retained login-20260918 target throughout.
from native_release_target_owner_20260918 import TARGET
NEW = TARGET['commit'] if TARGET else None
VERSIONS = {
    OLD: {'commit': OLD, 'tree': 'bc65d7145a498066556f2abc8d8619a6643dc325',
          'release': 'native-login-20260918-541b3dfff682', 'buildTime': '2026-09-18T03:23:33Z',
          'images': {'api': REGISTRY + 'api@sha256:558a873483641df75dde47b5b39dcc21087c397ae19f364ef03c820b2a52430f',
                     'web': REGISTRY + 'web@sha256:7cc7ad6328a3e318e5a34af21e56d4840279ba698365ee51661cd3d23050f26f'}},
}
if TARGET:
    VERSIONS[NEW] = {key: TARGET[key] for key in ('commit', 'tree', 'release', 'buildTime', 'images')}
require = backup.require


class OperationActive(backup.Failure):
    pass


@contextmanager
def operation():
    fd = os.open(ROOT / 'release-operation.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        backup.regular(fd, 0, owner=0)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise OperationActive('Another supervised release is active') from None
        yield
    finally:
        os.close(fd)


def present(path):
    try:
        path.lstat()
        return True
    except FileNotFoundError:
        return False


def state():
    require(present(STATE), 'Committed 541 release state is required; initialization fallback is forbidden')
    value = backup.read_json(STATE)
    require(type(value) is dict and set(value) == {'version', 'active', 'committed', 'pending'} and
            type(value['version']) is int and value['version'] == 1 and type(value['pending']) is bool and
            type(value['active']) is str and type(value['committed']) is str and
            value['active'] in VERSIONS and value['committed'] in VERSIONS and
            (value['pending'] or value['active'] == value['committed']), 'Unknown native release state')
    return value


def current():
    return VERSIONS[state()['active']]


def known_images(component):
    require(component in ('api', 'web'), 'Unsupported release component')
    return {item['images'][component] for item in VERSIONS.values() if item['images'][component]}


def environment_path(component, commit=None):
    require(component in ('api', 'web'), 'Unsupported environment component')
    commit = state()['active'] if commit is None else commit
    require(commit in VERSIONS, 'Unknown environment version')
    return ROOT / (component + ('-login-20260918.env' if commit == OLD else '-owner-20260918.env'))


def replace_state(value):
    # Same-directory durable replacement; stale temporary files never become state.
    temporary = ROOT / ('release-state-' + secrets.token_hex(12) + '.tmp')
    backup.write_json(temporary, value)
    os.replace(temporary, STATE)
    backup.fsync_dir(ROOT)
    require(state() == value, 'Release state write unproved')


def verify_checkout(commit):
    require(commit in VERSIONS, 'Unknown checkout')
    account = pwd.getpwnam('lixiaochen')
    root = Path('/home/lixiaochen/timeline-native-delivery/releases') / commit
    fd = backup.directory(root, trusted=False)
    try:
        info = os.fstat(fd)
        require(info.st_uid == account.pw_uid and stat.S_IMODE(info.st_mode) == 0o700,
                'Release checkout ownership differs')
    finally:
        os.close(fd)
    def git(*args):
        return backup.command(['/usr/bin/git', '-C', str(root), '-c', 'core.hooksPath=/dev/null', *args],
                              user='lixiaochen').decode().strip()
    require(git('rev-parse', 'HEAD') == commit and git('rev-parse', 'HEAD^{tree}') == VERSIONS[commit]['tree'] and
            git('status', '--porcelain') == '', 'Release checkout is not the fixed clean source')
    if commit == NEW:
        require_target()
        # The immutable tree binds every byte. This additional explicit scope gate
        # rejects unreviewed runtime/dependency/schema drift without pretending the API is unchanged.
        guarded = ('apps/api', 'apps/api-ops', 'apps/web', 'packages/shared',
                   'pnpm-lock.yaml', 'package.json', 'pnpm-workspace.yaml')
        changed = git('diff', '--name-only', OLD, NEW, '--', *guarded).splitlines()
        require(changed == sorted(TARGET['approvedRuntimeChanges']), 'Unreviewed runtime source change')
        for relative, digest in TARGET['approvedRuntimeChanges'].items():
            require(relative.startswith(('apps/api/src/', 'apps/web/src/')) and '..' not in Path(relative).parts,
                    'Schema/dependency change is not allowed for this program-only release')
            raw = backup.command(['/usr/bin/git', '-C', str(root), '-c', 'core.hooksPath=/dev/null',
                                  'show', NEW + ':' + relative], user='lixiaochen')
            require(backup.sha(raw) == digest, 'Approved runtime source digest differs')


def require_target():
    require(type(TARGET) is dict and set(TARGET) == {'commit', 'tree', 'release', 'buildTime', 'images', 'approvedRuntimeChanges'},
            'Final reviewed release identity is not fixed')
    require(re.fullmatch(r'[a-f0-9]{40}', TARGET['commit']) and TARGET['commit'] != OLD and
            re.fullmatch(r'[a-f0-9]{40}', TARGET['tree']) and
            re.fullmatch(r'[A-Za-z0-9._-]{1,100}', TARGET['release']) and
            re.fullmatch(r'2026-09-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z', TARGET['buildTime']),
            'Final source/build metadata is invalid')
    require(set(TARGET['images']) == {'api', 'web'}, 'Final image pair is incomplete')
    for component, reference in TARGET['images'].items():
        require(re.fullmatch(re.escape(REGISTRY + component + '@sha256:') + r'[a-f0-9]{64}', reference),
                'Final repository digest is not fixed')
    require(type(TARGET['approvedRuntimeChanges']) is dict and TARGET['approvedRuntimeChanges'],
            'Explicit reviewed API/Web change set is required')
    require(all(re.fullmatch(r'[a-f0-9]{64}', value) for value in TARGET['approvedRuntimeChanges'].values()),
            'Approved source digest missing')


def ingress_ready():
    value = state()
    require(not value['pending'], 'Program release is pending; ingress must stay closed')
    verify_checkout(value['active'])


def stage_environment(commit=None):
    commit = NEW if commit is None else commit
    require_target()
    import native_runtime_app as app
    identity = VERSIONS[commit]
    for component in ('api', 'web'):
        require(re.fullmatch(re.escape(REGISTRY + component + '@sha256:') + r'[a-f0-9]{64}',
                             identity['images'][component]), 'New image digest not fixed')
        app.image_identity(component, identity)
        raw = app.environment_bytes(identity) if component == 'api' else app.web_environment_bytes(identity)
        path = environment_path(component, commit)
        if not present(path):
            backup.write_private(path, raw)
        require(backup.read_file(path, 16384, owner=0) == raw, 'Staged release environment differs')


def close_program(require_drained=False):
    import native_cutover as cutover
    import native_runtime_app as app
    before = app.inspect('api') if require_drained else None
    cutover.stop_units(cutover.SOCKETS + cutover.PROXIES + cutover.APPS)
    final = app.inspect('api') if require_drained else None
    # Both the fixed 541 baseline and this candidate contain the reviewed drain.
    # Never downgrade 541 to the historical legacy-exit exemption when NEW changes.
    supports_drain = bool(before and before['Config']['Image'] in known_images('api'))
    was_running = bool(before and before['State']['Running'])
    if require_drained and was_running:
        require(supports_drain, 'Unreviewed native API drain capability; no release backup claimed')
        require(final and final['Id'] == before['Id'] and not final['State']['Running'] and
                final['State']['Pid'] == 0 and final['State']['ExitCode'] == 0 and not final['State']['OOMKilled'],
                'Native API drain failed or was force-killed; no consistent-release backup claimed')
    observation = {'apiWasRunning': was_running, 'apiDrainSupported': supports_drain,
                   'apiExitCode': final['State']['ExitCode'] if final else None,
                   'apiGracefulDrainVerified': bool(was_running and supports_drain and final and final['State']['ExitCode'] == 0),
                   'legacyApiFreezeOnly': False}
    for component in ('api', 'web'):
        app.stop(component, remove=True)
    return observation


def recover_pending_unlocked():
    """Called under the existing operation lock, before boot starts app units."""
    value = state()
    if not value['pending']:
        return False
    close_program()
    previous = value['committed']
    replace_state({'version': 1, 'active': previous, 'committed': previous, 'pending': False})
    print(json.dumps({'nativeProgramRecovery': 'PREVIOUS_NATIVE_PROGRAM_SELECTED', 'runtimeCommit': previous,
                      'databaseRestored': False, 'initialMigrationReplayed': False}), flush=True)
    return True


def recover_pending():
    if not present(STATE):
        return False
    # A failed second unit's ExecStopPost must not recover a still-live updater.
    # Nonblocking acquisition also avoids inversion with the shared backup lock.
    with operation():
        return recover_pending_unlocked()


def verify_running():
    import native_runtime_app as app
    for component in ('api', 'web'):
        item = app.inspect(component)
        require(item and item['State']['Running'] and item['State']['Pid'] > 0, 'Native program not running')
        app.validate_container(component, item, app.image_identity(component))


def checkpoint(protection):
    invocation = os.environ.get('INVOCATION_ID', '')
    require(re.fullmatch(r'[a-f0-9]{32}', invocation), 'Supervised invocation required')
    require(not present(CHECKPOINT), 'Recovery checkpoint already retained')
    backup.write_json(CHECKPOINT, {'invocationId': invocation, 'pid': os.getpid(),
                                  'releaseStateSha256': backup.sha(backup.read_file(STATE, 4096, owner=0)),
                                  'protectedBackup': protection['backup'],
                                  'protectionReceiptSha256': backup.sha(backup.read_file(backup.ROOT / protection['backup'] / 'snapshot-complete.json', 4096, owner=0))})
    print(json.dumps({'nativeProgramRecoveryCheckpoint': True, 'invocationId': invocation}), flush=True)
    time.sleep(60)
    raise backup.Failure('Recovery checkpoint expired')


def update(rehearse=False, rollback=False):
    import native_runtime_app as app
    import native_cutover as cutover
    require_target()
    previous, target = (NEW, OLD) if rollback else (OLD, NEW)
    with backup.locked():
        cutover.committed_value()
        require(state() == {'version': 1, 'active': previous, 'committed': previous, 'pending': False},
                'Update requires the fixed previous stable native program')
        cutover.no_old_journals()
        verify_checkout(OLD)
        if not rollback:
            verify_checkout(NEW)
            app.validate_files()
            verify_running()
        else:
            # The version being replaced may be stopped, absent, or unhealthy.
            # Only fixed owned containers may be stopped; validate OLD before mutation.
            for component in ('api', 'web'):
                app.inspect(component)
        stage_environment(target)
        replace_state({'version': 1, 'active': previous, 'committed': previous, 'pending': True})
        quiescence = close_program(require_drained=True)
        from native_release_backup import protect, resume_dependencies
        protection = protect(previous, quiescence)
        replace_state({'version': 1, 'active': target, 'committed': previous, 'pending': True})
        app.validate_files()
        if rehearse:
            checkpoint(protection)
        resume_dependencies()
    # App startup may itself require the shared operation lock. Never wait for it under that lock.
    cutover.systemctl('--no-block', 'start', *cutover.APPS)
    cutover.check_health()
    with backup.locked():
        require(state() == {'version': 1, 'active': target, 'committed': previous, 'pending': True}, 'Release intent changed')
        verify_running()
        from native_release_backup import verify_protection
        verify_protection(protection)
        replace_state({'version': 1, 'active': target, 'committed': target, 'pending': False})
    cutover.systemctl('--no-block', 'start', *cutover.SOCKETS)
    cutover.check_health(public=True)
    print(json.dumps({'nativeProgramUpdated': True, 'runtimeCommit': target,
                      'databaseRestored': False, 'initialMigrationReplayed': False,
                      'protectedBackup': protection['backup']}), flush=True)


def recover():
    import native_cutover as cutover
    try:
        with backup.locked():
            result = cutover.recover()
    except OperationActive:
        print(json.dumps({'nativeProgramRecovery': 'ACTIVE_RELEASE_LEFT_UNTOUCHED'}), flush=True)
        return
    cutover.dispatch_new(result)


def main():
    require(os.geteuid() == 0 and socket.gethostname() == 'instance-20260408-091840' and
            Path(__file__).parent == INSTALLED, 'Use reviewed intended-host release controller')
    require(sys.argv[1:] in [['update'], ['rollback'], ['recover'], ['check-recovery']], 'Unsupported release operation')
    import native_runtime_app as app
    app.state_directory()
    if sys.argv[1] == 'recover':
        recover()
    else:
        with operation():
            update(rehearse=sys.argv[1] == 'check-recovery', rollback=sys.argv[1] == 'rollback')


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print(json.dumps({'nativeProgramRelease': 'FAILED',
                          'reason': str(error) if isinstance(error, backup.Failure) else type(error).__name__}), file=sys.stderr)
        sys.exit(1)
