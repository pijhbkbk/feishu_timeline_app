"""Fixed f2da -> 6c70 native-program update; never reinitialize or restore data."""
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
CHECKPOINT = ROOT / 'release-6c70-checkpoint.json'
OLD = 'f2da3629e13b2653aae8879c98992877d5ef4170'
NEW = '6c70a897ec7643f4681616d801481765aaa8f7bc'
REGISTRY = 'us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/'
VERSIONS = {
    OLD: {'commit': OLD, 'tree': '435fd8f66beef2760ce02388b0948cea35cee55e',
          'release': 'native-auth-20260912-f2da3629e13b', 'buildTime': '2026-09-12T14:22:42Z',
          'images': {'api': REGISTRY + 'api@sha256:e1325e8263713bfb8fc13da4aeaa0521d77617a859fc8d86d6d4157468e3e370',
                     'web': REGISTRY + 'web@sha256:4d08266d5e6763da3072c895e124a1d71f2926ae7f161942ea8560b512df2d31'}},
    NEW: {'commit': NEW, 'tree': '042c502720078f6f546931bf34c5396cb910c9fd',
          'release': 'native-auth-20260914-6c70a897ec76', 'buildTime': '2026-09-14T01:01:20Z',
          'images': {'api': REGISTRY + 'api@sha256:196a3631af5fcf76bffbfeb0651c290cfeeb7fd2adedad927e1bdf3c44556a22',
                     'web': REGISTRY + 'web@sha256:502308afb6c5a9fadc2f603fc0e99319a60ecf6108f56633ddc8b80ca050c5bc'}},
}
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
    if not present(STATE):
        return {'version': 1, 'active': OLD, 'committed': OLD, 'pending': False}
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
    return ROOT / (component + ('.env' if commit == OLD else '-6c70.env'))


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
        require(git('diff', '--name-only', OLD, NEW, '--', 'apps/api', 'apps/api-ops', 'packages/shared',
                    'pnpm-lock.yaml', 'package.json', 'apps/web/package.json', 'apps/web/Dockerfile',
                    'pnpm-workspace.yaml') == '', 'Database/API/dependency compatibility changed')


def ingress_ready():
    value = state()
    require(not value['pending'], 'Program release is pending; ingress must stay closed')
    if value['active'] != OLD:
        verify_checkout(value['active'])


def stage_environment(commit=NEW):
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


def close_program():
    import native_cutover as cutover
    import native_runtime_app as app
    cutover.stop_units(cutover.SOCKETS + cutover.PROXIES + cutover.APPS)
    for component in ('api', 'web'):
        app.stop(component, remove=True)


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


def checkpoint():
    invocation = os.environ.get('INVOCATION_ID', '')
    require(re.fullmatch(r'[a-f0-9]{32}', invocation), 'Supervised invocation required')
    require(not present(CHECKPOINT), 'Recovery checkpoint already retained')
    backup.write_json(CHECKPOINT, {'invocationId': invocation, 'pid': os.getpid(),
                                  'releaseStateSha256': backup.sha(backup.read_file(STATE, 4096, owner=0))})
    print(json.dumps({'nativeProgramRecoveryCheckpoint': True, 'invocationId': invocation}), flush=True)
    time.sleep(60)
    raise backup.Failure('Recovery checkpoint expired')


def update(rehearse=False, rollback=False):
    import native_runtime_app as app
    import native_cutover as cutover
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
        close_program()
        replace_state({'version': 1, 'active': target, 'committed': previous, 'pending': True})
        app.validate_files()
        if rehearse:
            checkpoint()
    # App startup may itself require the shared operation lock. Never wait for it under that lock.
    cutover.systemctl('--no-block', 'start', *cutover.APPS)
    cutover.check_health()
    with backup.locked():
        require(state() == {'version': 1, 'active': target, 'committed': previous, 'pending': True}, 'Release intent changed')
        verify_running()
        replace_state({'version': 1, 'active': target, 'committed': target, 'pending': False})
    cutover.systemctl('--no-block', 'start', *cutover.SOCKETS)
    cutover.check_health(public=True)
    print(json.dumps({'nativeProgramUpdated': True, 'runtimeCommit': target,
                      'databaseRestored': False, 'initialMigrationReplayed': False}), flush=True)


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
