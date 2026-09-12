"""One-time, separately installed migration of this exact scanner host.

Retire only the independently identified legacy scanner instances. Preserve their
configuration and database bytes. Establish a verified historical version floor,
never approval, before the regular controller may download/cold activate anything.
"""
import os
from pathlib import Path
import stat
import sys

INSTALLED = Path('/usr/local/lib/timeline-native-scanner')
if Path(__file__).parent == INSTALLED:
    for node in [*reversed(INSTALLED.parents), INSTALLED]:
        info = node.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError('Untrusted installation')
    sys.path.insert(0, str(INSTALLED))

import fcntl
import hashlib
import json
import shutil
import socket
import uuid
from scanner_host import (BASE, CONFIG, IMAGE, SOCKET_ROOT, VERIFY, DatabaseFile,
                          State, VerifiedSet, bounded_entries, common_args, docker,
                          file_hash, inspect, require, run, secure_dir, stop_container)

LEGACY_UNIT = Path('/etc/systemd/system/timeline-clamd.service')
LEGACY_UNIT_SHA = '7afef88dda246ec5c13eb92f15c6bdea0326fc836c7652adb6c06260e95cfc73'
LEGACY_SOURCE = Path('/var/lib/timeline-scanner/signatures')
LEGACY = {
    'timeline-clamd': ('0970e7942da96041dd5ce40de500f56fc555a4d277dbeb4e64b7716541f0376b',
                       'sha256:aeac907bb9445b12c1dd76f9283415272d8dcd596d402245ed13729d7181bb8a'),
    'timeline-clamd-candidate-r3': ('4a22d3ec6a6f4a37d6215c8d648c40e089c7ddb64e5ef5f5b6d8294a7abfc02a', IMAGE),
}


def exclusive_file(path, raw, mode):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, mode)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'wb', closefd=False) as output:
            output.write(raw)
            output.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    parent = secure_dir(path.parent)
    try:
        os.fsync(parent)
    finally:
        os.close(parent)


def preflight():
    require(socket.gethostname() == 'timeline-scanner-r27', 'Wrong scanner host')
    for directory in [CONFIG, BASE, BASE / 'state', BASE / 'sets', BASE / 'work', SOCKET_ROOT]:
        fd = secure_dir(directory)
        os.close(fd)
    require(not (BASE / 'state' / 'state.json').exists() and
            not (BASE / 'state' / 'operation.lock').exists(), 'Initialization is never a state reset')
    require(not (CONFIG / 'legacy-timeline-clamd.service.saved').exists(), 'Legacy retirement already started')
    require(file_hash(LEGACY_UNIT, 16384)[0] == LEGACY_UNIT_SHA, 'Legacy supervisor identity changed')
    require(file_hash(Path('/etc/timeline-scanner/clamd.conf'), 16384)[0] ==
            '0f0f5dfe1bc9317b1e86723d525d8aed247eeb796a1bf6763b78b78e98d9b60c', 'Legacy scanner configuration changed')
    ids = docker('ps', '-aq').decode().split()
    require(0 < len(ids) <= 32, 'Unexpected container inventory')
    all_items = json.loads(docker('inspect', *ids))
    for item in all_items:
        name = item['Name'].lstrip('/')
        if name in LEGACY:
            require((item['Id'], item['Image']) == LEGACY[name] and
                    item['HostConfig']['RestartPolicy']['Name'] == 'no', 'Legacy container identity changed')
        else:
            require(not item['State']['Running'], 'Unexpected active scanner-host workload')
    require({item['Name'].lstrip('/') for item in all_items} >= set(LEGACY), 'Legacy containers missing')
    require(shutil.disk_usage(BASE).free > 3 * 1024 ** 3, 'Insufficient scanner disk headroom')


def retire_legacy():
    # Stop both exact engines first. Even a partial saved-file write must leave
    # the legacy endpoints stopped and their automatic supervisor disabled.
    masked = LEGACY_UNIT.is_symlink() and os.readlink(LEGACY_UNIT) == '/dev/null'
    require(masked or file_hash(LEGACY_UNIT, 16384)[0] == LEGACY_UNIT_SHA, 'Legacy supervisor identity changed')
    run(['/usr/bin/systemctl', 'stop', 'timeline-clamd.service'], timeout=60)
    if not masked:
        run(['/usr/bin/systemctl', 'disable', 'timeline-clamd.service'])
    state = run(['/usr/bin/systemctl', 'show', 'timeline-clamd.service', '-p', 'MainPID', '-p', 'ActiveState']).stdout
    require(b'MainPID=0\n' in state and (b'ActiveState=inactive\n' in state or b'ActiveState=failed\n' in state),
            'Legacy supervisor has not exited')
    for name, expected in LEGACY.items():
        item = inspect(name)
        if item:
            require((item['Id'], item['Image']) == expected, 'Legacy instance changed during retirement')
            if item['State']['Running']:
                docker('stop', '--time', '20', name, timeout=30)
            final = inspect(name)
            require(final is None or (not final['State']['Running'] and final['State']['Pid'] == 0), 'Legacy engine exit unproved')
    # Containers are retained if Docker's original --rm did not already remove them.
    saved = CONFIG / 'legacy-timeline-clamd.service.saved'
    if not saved.exists():
        require(file_hash(LEGACY_UNIT, 16384)[0] == LEGACY_UNIT_SHA, 'Legacy supervisor changed')
        raw = LEGACY_UNIT.read_bytes()
        require(hashlib.sha256(raw).hexdigest() == LEGACY_UNIT_SHA, 'Legacy supervisor changed')
        temporary_saved = CONFIG / ('.legacy-unit-' + uuid.uuid4().hex)
        exclusive_file(temporary_saved, raw, 0o644)
        # The initialization lock serializes all writers. Publish only complete,
        # durable bytes; interrupted temporary files remain for inspection.
        require(not saved.exists(), 'Legacy saved unit appeared during retirement')
        os.rename(temporary_saved, saved)
        parent = secure_dir(CONFIG)
        os.fsync(parent)
        os.close(parent)
    require(file_hash(saved, 16384)[0] == LEGACY_UNIT_SHA, 'Saved legacy supervisor changed')
    if not masked:
        require(file_hash(LEGACY_UNIT, 16384)[0] == LEGACY_UNIT_SHA, 'Legacy unit changed during retirement')
        # Atomic replacement removes the unlink/mask crash gap.
        temporary = LEGACY_UNIT.with_name('.timeline-native-legacy-mask')
        if temporary.is_symlink():
            require(os.readlink(temporary) == '/dev/null', 'Unexpected mask preparation')
        else:
            os.symlink('/dev/null', temporary)
        os.replace(temporary, LEGACY_UNIT)
    fd = secure_dir(LEGACY_UNIT.parent)
    os.fsync(fd)
    os.close(fd)
    run(['/usr/bin/systemctl', 'daemon-reload'])
    require(run(['/usr/bin/systemctl', 'is-enabled', 'timeline-clamd.service'], allowed=(1,)).stdout.strip() == b'masked',
            'Legacy supervisor not masked')
    connections = run(['/usr/bin/ss', '-H', '-tan', '( sport = :3310 or sport = :3311 )']).stdout.decode().splitlines()
    require(all(line.split()[0] in {'TIME-WAIT', 'FIN-WAIT-1', 'FIN-WAIT-2', 'CLOSING', 'LAST-ACK'} for line in connections),
            'Legacy listener or forwarding connection remains')


def historical_floor():
    parent_fd = secure_dir(LEGACY_SOURCE.parent)
    os.close(parent_fd)
    source_fd = os.open(LEGACY_SOURCE, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        require(os.fstat(source_fd).st_uid == 100 and os.fstat(source_fd).st_mode & 0o022 == 0,
                'Legacy signature directory changed')
    finally:
        os.close(source_fd)
    entries = bounded_entries(LEGACY_SOURCE, 4)
    require({p.name for p in entries} == {'main.cvd', 'daily.cvd', 'bytecode.cvd', 'freshclam.dat'}, 'Unexpected legacy databases')
    frozen = BASE / 'legacy-floor'
    frozen.mkdir(mode=0o755)
    os.chmod(frozen, 0o755)
    files, signed = [], None
    for name in ('main.cvd', 'daily.cvd', 'bytecode.cvd'):
        source, destination = LEGACY_SOURCE / name, frozen / name
        digest, size = file_hash(source, owner=100)
        require(size >= 512, 'Truncated legacy signature')
        with source.open('rb') as src, destination.open('xb') as dst:
            copied = 0
            while True:
                block = src.read(min(65536, size + 1 - copied))
                if not block:
                    break
                copied += len(block)
                require(copied <= size, 'Legacy signature grew during snapshot')
                dst.write(block)
            dst.flush()
            os.fsync(dst.fileno())
        os.chmod(destination, 0o444)
        require(file_hash(destination) == (digest, size) == file_hash(source, owner=100), 'Legacy snapshot changed')
        require(inspect(VERIFY) is None, 'Verifier already exists')
        try:
            result = docker(*common_args(VERIFY),
                            '--mount=type=bind,source=' + str(frozen) + ',target=/verified,readonly',
                            '--entrypoint=/usr/bin/sigtool', IMAGE, '--info', '/verified/' + name, timeout=180)
            require(b'Verification OK' in result, 'Historical official signature verification failed')
        finally:
            stop_container(VERIFY)
        with destination.open('rb') as stream:
            header = stream.read(512).decode('ascii').strip().split(':')
        require(len(header) == 9 and header[0] == 'ClamAV-VDB' and header[2].isdigit() and header[8].isdigit(), 'Historical signature header malformed')
        files.append(DatabaseFile(name, digest, size, int(header[2])))
        if name == 'daily.cvd':
            signed = int(header[8])
    floor = VerifiedSet(tuple(files), next(f.version for f in files if f.name == 'daily.cvd'), signed)
    floor.validate(floor.daily_stime)  # History only; it is explicitly never approved.
    fd = secure_dir(frozen)
    os.fsync(fd)
    os.close(fd)
    parent = secure_dir(BASE)
    os.fsync(parent)
    os.close(parent)
    return floor


def main():
    require(os.geteuid() == 0 and Path(__file__).parent == INSTALLED and sys.argv[1:] in ([], ['recover-legacy']),
            'Requires fixed root-owned one-time installation')
    parent = secure_dir(BASE, private=True)
    os.close(parent)
    if sys.argv[1:] == ['recover-legacy']:
        for directory in [CONFIG, LEGACY_UNIT.parent]:
            parent = secure_dir(directory)
            os.close(parent)
        fd = os.open(BASE / 'initialize.lock', os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            info = os.fstat(fd)
            require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and
                    stat.S_IMODE(info.st_mode) == 0o600, 'Initialization lock changed')
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                print(json.dumps({'legacyRetirementRecovery': 'BUSY'}))
                return
            retire_legacy()  # Idempotent closure only; never writes scanner state.
            print(json.dumps({'legacyRetirementRecovery': 'CLOSED'}))
        finally:
            os.close(fd)
        return
    # Separate one-time installation lock; never replaces the runtime operation lock.
    fd = os.open(BASE / 'initialize.lock', os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(fd, 0o600)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        parent = secure_dir(BASE)
        os.fsync(parent)
        os.close(parent)
        preflight()
        retire_legacy()
        floor = historical_floor()
        exclusive_file(BASE / 'state' / 'operation.lock', b'', 0o600)
        exclusive_file(BASE / 'state' / 'state.json', State(1, floor, None).encode(), 0o600)
        print(json.dumps({'scannerInitialized': True, 'legacySupervisorMasked': True,
                          'historicalDailyVersionFloor': floor.daily_version, 'approved': False}))
    finally:
        os.close(fd)


if __name__ == '__main__':
    main()
