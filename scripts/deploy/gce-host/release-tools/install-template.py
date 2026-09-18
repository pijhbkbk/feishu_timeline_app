"""Fixed 541 continuation: install a separate target, atomically switch one controller."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import stat
import subprocess
import sys

EXPECTED = None
PAYLOAD = None
EXPECTED_UNITS = None
TARGET_ID = None
OPS = Path('/usr/local/lib/timeline-native-ops')
ROOT = Path('/var/lib/timeline-native-app')
UNITS = Path('/etc/systemd/system')
SAVED = ROOT / 'controllers-before-owner-20260918'
JOURNAL = ROOT / 'controller-install-owner-20260918.json'
BASE = '541b3dfff682aa29b49a96b251f0a084903c981a'
TARGET_MODULE = 'native_release_target_owner_20260918.py'
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'}


def require(value, reason):
    if not value:
        raise RuntimeError(reason)


def directory(path):
    for node in [*reversed(path.parents), path]:
        info = node.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and info.st_mode & 0o022 == 0,
                'Untrusted root controller path')


def read(path, mode=0o644):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_uid == 0 and
                stat.S_IMODE(before.st_mode) == mode and before.st_size <= 200000, 'Unexpected controller file')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(200001)
        after = os.fstat(fd)
        require(len(raw) == before.st_size and (before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                (after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'Controller changed while checked')
        return raw
    finally:
        os.close(fd)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def sync(path):
    directory(path)
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write(path, raw, mode):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(raw); stream.flush(); os.fsync(fd)
    finally:
        os.close(fd)
    sync(path.parent)


def activate_new(path, raw, mode):
    # A crash during write/fsync leaves only an unreferenced temporary file.
    # The authoritative path is installed only after complete durable bytes.
    temporary = path.parent / ('.install-owner-20260918-' + secrets.token_hex(12))
    write(temporary, raw, mode)
    require(not exists(path), 'New authoritative file unexpectedly appeared')
    os.replace(temporary, path)
    sync(path.parent)


def exists(path):
    return os.path.lexists(path)


def idle_release_units():
    # Preserve failed historical invocations; never reset-failed or start units.
    for unit in ('timeline-native-release.service', 'timeline-native-release-check.service',
                 'timeline-native-release-rollback.service'):
        raw = subprocess.run(['/usr/bin/systemctl', 'show', unit, '--property=FragmentPath',
                              '--property=DropInPaths', '--property=NeedDaemonReload',
                              '--property=MainPID', '--property=ControlPID', '--property=ActiveState'],
                             env=ENV, check=True, stdout=subprocess.PIPE, timeout=20).stdout
        require(len(raw) <= 8192, 'Unit state exceeds bound')
        value = dict(line.split('=', 1) for line in raw.decode().splitlines() if '=' in line)
        require(value.get('FragmentPath') == str(UNITS / unit) and value.get('DropInPaths') == '' and
                value.get('NeedDaemonReload') == 'no' and value.get('MainPID') == '0' and
                value.get('ControlPID') == '0' and value.get('ActiveState') in ('inactive', 'failed'),
                'Release unit is not safely idle')


def main():
    require(os.geteuid() == 0 and socket.gethostname() == 'instance-20260408-091840', 'Wrong host or identity')
    for path in (OPS, ROOT, UNITS):
        directory(path)
    require(stat.S_IMODE(ROOT.stat().st_mode) == 0o700, 'App state directory must remain private')
    names = (TARGET_MODULE, 'native_release.py')
    replaced = ('native_release.py',)
    require(type(PAYLOAD) is dict and set(PAYLOAD) == set(names), 'Incomplete fixed installer')
    require(isinstance(TARGET_ID, str) and len(TARGET_ID) == 40 and TARGET_ID != BASE, 'Target not finalized')
    for name, value in PAYLOAD.items():
        require(set(value) == {'sha256', 'text'} and digest(value['text'].encode()) == value['sha256'], 'Payload checksum failed')
        if name.endswith('.py'):
            compile(value['text'], name, 'exec')
    # Trusted dependencies are never loaded from the transferred checkout.
    for name, expected in EXPECTED.items():
        allowed = {expected}
        if name in replaced:
            allowed.add(PAYLOAD[name]['sha256'])
        require(digest(read(OPS / name)) in allowed, 'Existing controller differs: ' + name)
    if exists(OPS / TARGET_MODULE):
        require(digest(read(OPS / TARGET_MODULE)) == PAYLOAD[TARGET_MODULE]['sha256'], 'Existing new target differs')
    for name, expected in EXPECTED_UNITS.items():
        require(digest(read(UNITS / name)) == expected, 'Installed unit differs')
    sys.path.insert(0, str(OPS))
    import native_backup_controller as backup
    # Same lock as all existing backup/cutover operations; installer cannot run beside a release.
    import fcntl
    fd = os.open(ROOT / 'release-operation.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        backup.regular(fd, 0, owner=0)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with backup.locked():
            stable = {'version': 1, 'active': BASE, 'committed': BASE, 'pending': False}
            require(backup.read_json(ROOT / 'release-6c70-state.json') == stable, 'Installer requires committed 541')
            require(not any(exists(ROOT / ('release-owner-20260918-' + suffix)) for suffix in
                            ('checkpoint.json', 'recovery-proof.json', 'update-proof.json', 'rollback-proof.json')),
                    'Login release already attempted; retained proof requires inspection')
            idle_release_units()
            subprocess.run(['/usr/bin/python3', '-I', str(OPS / 'native_cutover.py'), 'check-committed'], env=ENV, check=True, timeout=40)
            journal = {'version': 1, 'target': TARGET_ID, 'base': BASE,
                       'expectedControllers': EXPECTED, 'expectedUnits': EXPECTED_UNITS,
                       'payload': {name: value['sha256'] for name, value in PAYLOAD.items()}}
            if exists(JOURNAL):
                require(backup.read_json(JOURNAL) == journal, 'Different interrupted installer exists')
                if not exists(SAVED):
                    require(all(digest(read(OPS / name)) == EXPECTED[name] for name in replaced), 'Missing originals after controller replacement')
                    require(all(digest(read(UNITS / name)) == expected for name, expected in EXPECTED_UNITS.items()), 'Missing originals after unit replacement')
                    SAVED.mkdir(mode=0o700); sync(ROOT)
                directory(SAVED)
                require(stat.S_IMODE(SAVED.stat().st_mode) == 0o700, 'Saved controllers directory differs')
            else:
                require(not exists(SAVED), 'Unjournaled prior controller directory exists')
                # No file can be partly upgraded before a durable journal.
                require(all(digest(read(OPS / name)) == EXPECTED[name] for name in replaced), 'New controller without installer journal')
                for name, expected in EXPECTED_UNITS.items():
                    require(digest(read(UNITS / name)) == expected, 'Original unit differs')
                require(not exists(OPS / TARGET_MODULE), 'Unjournaled new target')
                # Journal first; an interruption before mkdir can be resumed deliberately.
                activate_new(JOURNAL, (json.dumps(journal, sort_keys=True, separators=(',', ':')) + '\n').encode(), 0o600)
                SAVED.mkdir(mode=0o700); sync(ROOT)
            for name in names:
                destination = OPS / name
                prior = EXPECTED.get(name)
                raw = PAYLOAD[name]['text'].encode()
                if prior is not None:
                    current = read(destination)
                    require(digest(current) in {prior, PAYLOAD[name]['sha256']}, 'Target changed during installer')
                    saved = SAVED / name
                    if exists(saved):
                        require(digest(read(saved, 0o600)) == prior, 'Retained original controller differs')
                    else:
                        require(digest(current) == prior, 'Original bytes unavailable for interrupted install')
                        activate_new(saved, current, 0o600)
                    if current == raw:
                        continue
                    temporary = destination.parent / ('.install-owner-20260918-' + secrets.token_hex(12))
                    write(temporary, raw, 0o644)
                    require(read(destination) == current, 'Controller changed during replacement')
                    os.replace(temporary, destination); sync(destination.parent)
                elif exists(destination):
                    require(read(destination) == raw, 'Interrupted helper differs')
                else:
                    activate_new(destination, raw, 0o644)
                require(read(destination) == raw, 'Installed payload differs')
            # No unit/dependency is rewritten and no daemon reload is necessary.
            for name, expected in EXPECTED.items():
                if name not in replaced:
                    require(digest(read(OPS / name)) == expected, 'Unchanged dependency changed')
            for name, expected in EXPECTED_UNITS.items():
                require(digest(read(UNITS / name)) == expected, 'Unchanged unit changed')
            idle_release_units()
            subprocess.run(['/usr/bin/python3', '-I', str(OPS / 'native_cutover.py'), 'check-committed'], env=ENV, check=True, timeout=40)
            require(backup.read_json(ROOT / 'release-6c70-state.json') == stable, 'Installer changed runtime state')
    finally:
        os.close(fd)
    print(json.dumps({'nativeReleaseControllerInstalled': True, 'runtimeChanged': False, 'targetCommit': TARGET_ID,
                      'priorControllersRetained': True, 'releaseExecuted': False}))


if __name__ == '__main__':
    main()
