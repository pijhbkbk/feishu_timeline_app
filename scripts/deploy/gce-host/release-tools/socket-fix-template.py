"""Exact installed d16 socket helper repair, with durable resumable originals."""
import fcntl
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
EXPECTED_UNITS = None
OLD_INSTALL_JOURNAL = None
NEW_INSTALL_JOURNAL = None
OLD_HELPER_SHA = None
NEW_HELPER = None
PATCH_IDENTITY = None
OPS = Path('/usr/local/lib/timeline-native-ops')
ROOT = Path('/var/lib/timeline-native-app')
UNITS = Path('/etc/systemd/system')
SAVED = ROOT / 'controllers-before-socket-fix-20260917'
JOURNAL = ROOT / 'controller-socket-fix-20260917.json'
COMPLETE = ROOT / 'controller-socket-fix-20260917-complete.json'
INSTALL_JOURNAL = ROOT / 'controller-install-20260917.json'
HELPER = 'native_release_backup.py'
BASE = '6c70a897ec7643f4681616d801481765aaa8f7bc'
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
    temporary = path.parent / ('.install-20260917-' + secrets.token_hex(12))
    write(temporary, raw, mode)
    require(not exists(path), 'New authoritative file unexpectedly appeared')
    os.replace(temporary, path)
    sync(path.parent)


def exists(path):
    return os.path.lexists(path)


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def unit_idle(unit):
    fields = ('ActiveState', 'MainPID', 'ControlPID', 'FragmentPath', 'DropInPaths', 'NeedDaemonReload')
    raw = subprocess.check_output(['/usr/bin/systemctl', 'show', unit, *['--property=' + f for f in fields]],
                                  env=ENV, timeout=20).decode()
    value = dict(line.split('=', 1) for line in raw.splitlines())
    require(value.get('ActiveState') in ('inactive', 'failed') and value.get('MainPID') == '0' and
            value.get('ControlPID') == '0' and value.get('FragmentPath') == str(UNITS / unit) and
            value.get('DropInPaths') == '' and value.get('NeedDaemonReload') == 'no',
            'A release unit is active or differs from the reviewed contract')


def verify_installed():
    for name, expected in EXPECTED.items():
        allowed = {expected, NEW_HELPER['sha256']} if name == HELPER else {expected}
        require(digest(read(OPS / name)) in allowed, 'Installed d16 controller differs: ' + name)
    for name, expected in EXPECTED_UNITS.items():
        require(digest(read(UNITS / name)) == expected, 'Installed d16 unit differs: ' + name)


def replace_known(path, before, after, mode):
    current = read(path, mode)
    require(current in (before, after), 'Authoritative bytes differ during repair')
    if current == after:
        return
    temporary = path.parent / ('.socket-fix-20260917-' + secrets.token_hex(12))
    write(temporary, after, mode)
    require(read(path, mode) == before, 'Authoritative bytes changed during repair')
    os.replace(temporary, path); sync(path.parent)


def main():
    require(os.geteuid() == 0 and socket.gethostname() == 'instance-20260408-091840', 'Wrong host or identity')
    for path in (OPS, ROOT, UNITS):
        directory(path)
    require(stat.S_IMODE(ROOT.stat().st_mode) == 0o700, 'Private application root differs')
    require(OLD_HELPER_SHA == EXPECTED[HELPER] and set(NEW_HELPER) == {'text', 'sha256'} and
            digest(NEW_HELPER['text'].encode()) == NEW_HELPER['sha256'], 'Fixed helper identity differs')
    compile(NEW_HELPER['text'], HELPER, 'exec')
    old_journal, new_journal = encoded(OLD_INSTALL_JOURNAL), encoded(NEW_INSTALL_JOURNAL)
    require(OLD_INSTALL_JOURNAL['base'] == NEW_INSTALL_JOURNAL['base'] == BASE and
            OLD_INSTALL_JOURNAL['target'] == NEW_INSTALL_JOURNAL['target'] == PATCH_IDENTITY['runtimeCommit'],
            'Repair must retain the fixed runtime/base identity')
    expected_journal = json.loads(old_journal)
    expected_journal['payload'][HELPER] = NEW_HELPER['sha256']
    require(expected_journal == NEW_INSTALL_JOURNAL, 'Repair changes more than the one helper journal entry')
    verify_installed()
    sys.path.insert(0, str(OPS))
    import native_backup_controller as backup
    fd = os.open(ROOT / 'release-operation.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        backup.regular(fd, 0, owner=0)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with backup.locked():
            stable = {'version': 1, 'active': BASE, 'committed': BASE, 'pending': False}
            require(backup.read_json(ROOT / 'release-6c70-state.json') == stable, 'Repair requires stable committed 6c70')
            require(not exists(ROOT / 'release-20260917-checkpoint.json'), 'Existing checkpoint must remain for investigation')
            for unit in ('timeline-native-release.service', 'timeline-native-release-check.service', 'timeline-native-release-rollback.service'):
                unit_idle(unit)
            verify_installed()
            subprocess.run(['/usr/bin/python3', '-I', str(OPS / 'native_cutover.py'), 'check-committed'], env=ENV, check=True, timeout=40)
            current_helper = read(OPS / HELPER)
            current_journal = read(INSTALL_JOURNAL, 0o600)
            require(current_journal in (old_journal, new_journal), 'Installed journal does not match the exact d16 or repaired bytes')
            intent = {**PATCH_IDENTITY, 'oldHelperSha256': OLD_HELPER_SHA, 'newHelperSha256': NEW_HELPER['sha256'],
                      'oldInstallJournalSha256': digest(old_journal), 'newInstallJournalSha256': digest(new_journal)}
            if exists(JOURNAL):
                require(read(JOURNAL, 0o600) == encoded(intent), 'Different repair journal exists')
            else:
                require(digest(current_helper) == OLD_HELPER_SHA and current_journal == old_journal and
                        not exists(SAVED) and not exists(COMPLETE), 'Repair must begin from exact installed d16')
                activate_new(JOURNAL, encoded(intent), 0o600)
            if not exists(SAVED):
                require(digest(current_helper) == OLD_HELPER_SHA and current_journal == old_journal,
                        'Original bytes missing after partial repair')
                SAVED.mkdir(mode=0o700); sync(ROOT)
            directory(SAVED)
            require(stat.S_IMODE(SAVED.stat().st_mode) == 0o700, 'Saved repair originals directory differs')
            for name, current, expected in ((HELPER, current_helper, OLD_HELPER_SHA),
                                            (INSTALL_JOURNAL.name, current_journal, digest(old_journal))):
                saved = SAVED / name
                if exists(saved):
                    require(digest(read(saved, 0o600)) == expected, 'Retained repair original differs')
                else:
                    require(digest(current) == expected, 'Original repair bytes unavailable')
                    activate_new(saved, current, 0o600)
            original_helper = read(SAVED / HELPER, 0o600)
            replace_known(OPS / HELPER, original_helper, NEW_HELPER['text'].encode(), 0o644)
            replace_known(INSTALL_JOURNAL, old_journal, new_journal, 0o600)
            require(read(OPS / HELPER) == NEW_HELPER['text'].encode() and read(INSTALL_JOURNAL, 0o600) == new_journal,
                    'Repaired authoritative files differ')
            subprocess.run(['/usr/bin/python3', '-I', str(OPS / 'native_cutover.py'), 'check-committed'], env=ENV, check=True, timeout=40)
            require(backup.read_json(ROOT / 'release-6c70-state.json') == stable, 'Repair changed release state')
            receipt = {**intent, 'runtimeChanged': False, 'releaseExecuted': False, 'originalsRetained': True}
            if exists(COMPLETE):
                require(read(COMPLETE, 0o600) == encoded(receipt), 'Different repair completion exists')
            else:
                activate_new(COMPLETE, encoded(receipt), 0o600)
    finally:
        os.close(fd)
    print(json.dumps({'nativeSocketHelperRepaired': True, **receipt}))


if __name__ == '__main__':
    main()
