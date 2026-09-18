"""Private immutable checkout; executed as the existing non-root delivery user."""
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess

IDENTITY = None
OPERATIONS_COMMIT = None
RUNTIME_REF = 'refs/heads/codex/native-login-release-20260918'
OPERATIONS_REF = 'refs/heads/codex/native-login-ops-20260918'
BASE = Path('/home/lixiaochen/timeline-native-delivery')


def main():
    account = pwd.getpwnam('lixiaochen')
    if os.getuid() != account.pw_uid:
        raise RuntimeError('Run checkout as the existing delivery user')
    os.umask(0o077)
    for path in (BASE, BASE / 'source.git', BASE / 'releases'):
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o022:
            raise RuntimeError('Untrusted private source directory')
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': '/home/lixiaochen', 'GIT_CONFIG_NOSYSTEM': '1'}
    def git(path, *args):
        return subprocess.check_output(['/usr/bin/git', '-C', str(path), '-c', 'core.hooksPath=/dev/null', *args], env=env, timeout=90).decode().strip()
    repository = BASE / 'source.git'; target = BASE / 'releases' / IDENTITY['commit']
    if git(repository, 'rev-parse', RUNTIME_REF) != IDENTITY['commit'] or git(repository, 'rev-parse', OPERATIONS_REF) != OPERATIONS_COMMIT:
        raise RuntimeError('Pushed runtime/operations refs differ')
    if not os.path.lexists(target):
        subprocess.run(['/usr/bin/git', '-c', 'core.hooksPath=/dev/null', 'clone', '--no-hardlinks', '--no-checkout', str(repository), str(target)], env=env, check=True, timeout=120)
        git(target, 'checkout', '--detach', IDENTITY['commit'])
    info = target.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise RuntimeError('Checkout path ownership differs')
    if git(target, 'rev-parse', 'HEAD') != IDENTITY['commit'] or git(target, 'rev-parse', 'HEAD^{tree}') != IDENTITY['tree'] or git(target, 'status', '--porcelain'):
        raise RuntimeError('Checkout is not the exact clean immutable release')
    print(json.dumps({'remoteRuntimeRef': RUNTIME_REF, 'remoteRuntimeCommit': IDENTITY['commit'],
                      'remoteOperationsRef': OPERATIONS_REF, 'remoteOperationsCommit': OPERATIONS_COMMIT,
                      'serverCheckoutHead': IDENTITY['commit'], 'sourceTree': IDENTITY['tree'], 'clean': True}))


if __name__ == '__main__':
    main()
