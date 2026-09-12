"""Fixed Linux host adapter for reviewed cold-activation policy.

Installed, hash-pinned root-owned bytes only. No arbitrary image/path/command input.
The legacy scanner supervisor must be separately retired before initialization.
"""
import dataclasses
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import shutil
import socket
import stat
import struct
import subprocess
import sys
import time
import uuid

# -I excludes user Python paths. Only the reviewed installation directory is added.
INSTALLED = Path('/usr/local/lib/timeline-native-scanner')
if Path(__file__).parent == INSTALLED:
    for path in [*reversed(INSTALLED.parents), INSTALLED]:
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError('Untrusted installed module directory')
    sys.path.insert(0, str(INSTALLED))

from scanner_state import State, StateStore
from scanner_update_policy import DatabaseFile, DownloadFailure, RunningSet, UpdateFailure, VerifiedSet, update

BASE = Path('/var/lib/timeline-native-scanner')
CONFIG = Path('/etc/timeline-native-scanner')
SOCKET_ROOT = Path('/run/timeline-native-scanner')
LIVE_SOCKET = SOCKET_ROOT / 'engine' / 'clamd.sock'
IMAGE = 'sha256:17130f6532928a5b4b1272fc5129e5f2639850c0d8086879c516649d32fc8ae6'
SECCOMP_SHA = 'dc25b0ab943c0d7b99378b4600fe31002ba209c4445b3e141a2e20c8860bf973'
ENGINE = 'timeline-native-clamd'
DOWNLOADER = 'timeline-native-freshclam'
VERIFY = 'timeline-native-sigtool'
PROXY_SOCKET = 'timeline-native-scan.socket'
PROXY_SERVICE = 'timeline-native-scan.service'
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'TZ': 'UTC'}
LABEL = 'com.timeline.scanner.controller=v1'
# Pinned 1.4.6 main returns fc_error_t, not the obsolete 50-series man-page codes.
# https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/libfreshclam/libfreshclam.h
# https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/freshclam/freshclam.c
DOWNLOAD_FAILURE_CODES = {5, 11, 12, 17, 18}
# Covers the 60s check cadence, timer accuracy, bounded check and proxy shutdown.
ADMISSION_MARGIN_SECONDS = 300


def require(value, reason):
    if not value:
        raise UpdateFailure(reason)


def secure_dir(path, private=False):
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        for part in path.parts[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
            os.close(fd)
            fd = child
            info = os.fstat(fd)
            require(info.st_uid == 0 and info.st_mode & 0o022 == 0, 'Untrusted scanner directory')
        if private:
            require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700, 'Scanner state must be private')
        return fd
    except BaseException:
        os.close(fd)
        raise


def file_hash(path, maximum=512 * 1024 * 1024, owner=0):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_uid == owner and
                before.st_size <= maximum and before.st_mode & 0o022 == 0, 'Scanner file ownership/type rejected')
        digest, count = hashlib.sha256(), 0
        while True:
            block = os.read(fd, 65536)
            if not block:
                break
            count += len(block)
            require(count <= maximum, 'Scanner file grew beyond bound')
            digest.update(block)
        after = os.fstat(fd)
        require(count == before.st_size and
                (before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                (after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'Scanner file changed during read')
        return digest.hexdigest(), count
    finally:
        os.close(fd)


def run(args, timeout=45, allowed=(0,)):
    process = subprocess.Popen(args, env=ENV, cwd='/', stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, start_new_session=True)
    buffers = [bytearray(), bytearray()]
    deadline = time.monotonic() + timeout
    try:
        with selectors.DefaultSelector() as ready:
            for index, stream in enumerate((process.stdout, process.stderr)):
                ready.register(stream, selectors.EVENT_READ, index)
            while ready.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise subprocess.TimeoutExpired(args[0], timeout)
                for key, _ in ready.select(remaining):
                    block = os.read(key.fileobj.fileno(), 65536)
                    if not block:
                        ready.unregister(key.fileobj)
                        continue
                    require(sum(map(len, buffers)) + len(block) <= 1024 * 1024,
                            'Host command output exceeds bound')
                    buffers[key.data].extend(block)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired(args[0], timeout)
            result = subprocess.CompletedProcess(args, process.wait(timeout=remaining),
                                                 bytes(buffers[0]), bytes(buffers[1]))
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
        process.stdout.close()
        process.stderr.close()
    require(result.returncode in allowed, 'Host command failed: ' + Path(args[0]).name)
    return result


def docker(*args, timeout=45):
    return run(['/usr/bin/docker', *args], timeout).stdout


def inspect(name):
    value = run(['/usr/bin/docker', 'container', 'inspect', name], allowed=(0, 1))
    if value.returncode:
        require(b'No such' in value.stderr, 'Docker state unavailable')
        return None
    items = json.loads(value.stdout)
    require(len(items) == 1, 'Unexpected Docker result')
    return items[0]


def owned_container(name):
    item = inspect(name)
    if item:
        require(item['Config'].get('Labels', {}).get('com.timeline.scanner.controller') == 'v1' and
                item['Image'] == IMAGE, 'Unowned scanner container')
    return item


def stop_container(name):
    item = owned_container(name)
    if not item:
        return
    if item['State']['Running']:
        docker('stop', '--time', '20', name, timeout=30)
    final = owned_container(name)
    require(final and not final['State']['Running'] and final['State']['Pid'] == 0, 'Container exit unverified')
    docker('rm', name)


def common_args(name, network='none'):
    return ['run', '--name', name, '--label', LABEL, '--user', '100:101', '--env=TZ=UTC', '--read-only',
            '--cap-drop=ALL', '--security-opt=no-new-privileges',
            '--security-opt=seccomp=' + str(CONFIG / 'seccomp-amd64.json'),
            '--memory=3g', '--memory-swap=3g', '--cpus=1.5', '--pids-limit=128',
            '--ulimit=nofile=256:256', '--tmpfs=/tmp:rw,noexec,nosuid,size=128m',
            '--network=' + network, '--restart=no', '--log-opt=max-size=5m', '--log-opt=max-file=2']


def bounded_entries(path, maximum):
    entries = []
    with os.scandir(path) as stream:
        for entry in stream:
            require(len(entries) < maximum, 'Directory inventory exceeds bound')
            entries.append(path / entry.name)
    return entries


def engine_command(payload):
    with socket.socket(socket.AF_UNIX) as stream:
        stream.settimeout(10)
        stream.connect(str(LIVE_SOCKET))
        stream.sendall(payload)
        reply = bytearray()
        while len(reply) <= 4096:
            block = stream.recv(512)
            if not block:
                break
            reply.extend(block)
            if b'\0' in block:
                break
        require(0 < len(reply) <= 4096 and reply.endswith(b'\0'), 'Incomplete scanner response')
        return bytes(reply[:-1])


def process_identity(item):
    pid = item['State']['Pid']
    require(type(pid) is int and pid > 1, 'Scanner PID unavailable')
    raw = Path('/proc/' + str(pid) + '/stat').read_text()
    tail = raw[raw.rfind(')') + 2:].split()
    require(len(tail) >= 20, 'Scanner process identity incomplete')
    boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    return boot + ':' + item['Id'] + ':' + str(pid) + ':' + tail[19]


def database_directory(item):
    mounts = [value for value in item['Mounts'] if value['Destination'] == '/var/lib/clamav']
    require(len(mounts) == 1 and mounts[0]['Type'] == 'bind' and not mounts[0]['RW'], 'Scanner database mount rejected')
    path = Path(mounts[0]['Source'])
    require(path.parent == BASE / 'sets' and re.fullmatch(r'[a-f0-9]{32}', path.name), 'Scanner database path rejected')
    fd = secure_dir(path)
    os.close(fd)
    return path


@dataclasses.dataclass
class Candidate:
    name: str
    download: Path
    frozen: Path | None = None
    promoted: bool = False


class LinuxHost:
    def __init__(self, store):
        self.store = store
        for directory in [CONFIG, BASE / 'sets', BASE / 'work', SOCKET_ROOT]:
            fd = secure_dir(directory)
            os.close(fd)
        require(file_hash(CONFIG / 'seccomp-amd64.json', 1024 * 1024)[0] == SECCOMP_SHA, 'Seccomp identity differs')
        self.config_hash = file_hash(CONFIG / 'clamd.conf', 16384)[0]
        self.freshclam_hash = file_hash(CONFIG / 'freshclam.conf', 16384)[0]
        require(json.loads(docker('image', 'inspect', IMAGE))[0]['Id'] == IMAGE, 'Pinned scanner image unavailable')

    def now(self):
        return int(time.time())

    def approved_active(self):
        return self.store.read().approved

    def version_floor(self):
        return self.store.read().floor

    def verify_active(self, expected):
        item = owned_container(ENGINE)
        require(item and item['State']['Running'] and not item['State']['OOMKilled'], 'Scanner not running')
        host = item['HostConfig']
        require(host['ReadonlyRootfs'] and host['NetworkMode'] == 'none' and not host.get('PortBindings') and
                host['RestartPolicy']['Name'] == 'no' and host['CapDrop'] == ['ALL'] and
                item['Config']['User'] == '100:101', 'Scanner isolation differs')
        require(not host['Privileged'] and not host['CapAdd'] and not host['PidMode'] and
                host['Memory'] == 3 * 1024 ** 3 and host['MemorySwap'] == 3 * 1024 ** 3 and
                host['NanoCpus'] == 1500000000 and host['PidsLimit'] == 128 and
                set(host['SecurityOpt']) == {'no-new-privileges', 'seccomp=' + str(CONFIG / 'seccomp-amd64.json')},
                'Scanner resource/security configuration differs')
        require(item['Config']['Entrypoint'] == ['/usr/sbin/clamd'] and
                item['Config']['Cmd'] == ['--config-file=/etc/clamav/clamd.conf'], 'Scanner command differs')
        require(all(value['Type'] == 'bind' or
                    (value['Type'] == 'tmpfs' and value['Destination'] == '/tmp')
                    for value in item['Mounts']), 'Unexpected scanner mount type')
        require(host.get('Tmpfs') == {'/tmp': 'rw,noexec,nosuid,size=128m'}, 'Scanner temporary mount differs')
        mounts = {value['Destination']: value for value in item['Mounts'] if value['Type'] == 'bind'}
        require(set(mounts) == {'/etc/clamav/clamd.conf', '/var/lib/clamav', '/run/clamav'} and
                mounts['/etc/clamav/clamd.conf']['Source'] == str(CONFIG / 'clamd.conf') and
                not mounts['/etc/clamav/clamd.conf']['RW'] and
                mounts['/run/clamav']['Source'] == str(SOCKET_ROOT / 'engine'), 'Unexpected scanner bind mounts')
        directory = database_directory(item)
        names = sorted(path.name for path in bounded_entries(directory, 3))
        require(names == sorted(file.name for file in expected.databases.files), 'Loaded database inventory differs')
        for file in expected.databases.files:
            require(file_hash(directory / file.name) == (file.sha256, file.size), 'Loaded database bytes differ')
        require(file_hash(CONFIG / 'clamd.conf', 16384)[0] == expected.config_identity == self.config_hash,
                'Scanner configuration differs')
        actual = RunningSet(expected.databases, process_identity(item), item['Image'], self.config_hash)
        require(actual == expected, 'Scanner process/artifact identity differs')
        version = engine_command(b'zVERSION\0').decode('ascii')
        require(version.startswith('ClamAV 1.4.6/' + str(expected.databases.daily_version) + '/'), 'Loaded scanner version differs')
        require('TZ=UTC' in item['Config']['Env'], 'Scanner timezone differs')
        try:
            loaded_time = datetime.datetime.strptime(version.split('/', 2)[2], '%a %b %d %H:%M:%S %Y').replace(tzinfo=datetime.timezone.utc)
        except ValueError as error:
            raise UpdateFailure('Loaded scanner timestamp malformed') from error
        require(int(loaded_time.timestamp()) == expected.databases.daily_stime, 'Loaded signature timestamp differs')
        expected.databases.validate(self.now())
        require(expected.databases.daily_stime + 48 * 3600 - self.now() >= ADMISSION_MARGIN_SECONDS,
                'Signatures too close to expiry for safe admission')
        return actual

    def prepare_candidate(self, active):
        require(shutil.disk_usage(BASE).free >= 3 * 1024 ** 3, 'Insufficient scanner update headroom')
        name = uuid.uuid4().hex
        directory = BASE / 'work' / name
        directory.mkdir(mode=0o700)
        download = directory / 'download'
        download.mkdir(mode=0o750)
        if active:
            source = database_directory(owned_container(ENGINE))
            for file in active.databases.files:
                shutil.copyfile(source / file.name, download / file.name, follow_symlinks=False)
                os.chown(download / file.name, 100, 101)
                os.chmod(download / file.name, 0o600)
        os.chown(download, 100, 101)
        return Candidate(name, download)

    def download(self, candidate):
        require(owned_container(DOWNLOADER) is None, 'Prior downloader resources retained')
        active = self.approved_active()
        timeout = 450 if active is None else min(450, active.databases.daily_stime + 48 * 3600 - self.now() - 60)
        require(timeout >= 15, 'Active signatures too close to expiry for update')
        args = common_args(DOWNLOADER, 'timeline-scanner') + [
            '--mount=type=bind,source=' + str(candidate.download) + ',target=/var/lib/clamav',
            '--mount=type=bind,source=' + str(CONFIG / 'freshclam.conf') + ',target=/etc/clamav/freshclam.conf,readonly',
            '--entrypoint=/usr/bin/freshclam', IMAGE, '--config-file=/etc/clamav/freshclam.conf']
        require(file_hash(CONFIG / 'freshclam.conf', 16384)[0] == self.freshclam_hash, 'FreshClam config changed')
        status = 0
        try:
            result = run(['/usr/bin/docker', *args], timeout=timeout, allowed=tuple(range(20)))
            status = result.returncode
        except subprocess.TimeoutExpired as error:
            # Phase is unknown; it could be TestDatabases, not a network failure.
            raise UpdateFailure('FreshClam exceeded its verified operation bound') from error
        finally:
            stop_container(DOWNLOADER)
        if status in DOWNLOAD_FAILURE_CODES:
            raise DownloadFailure('Official database download/check failed')
        require(status == 0, 'Official database verification or FreshClam setup failed')

    def verify_candidate(self, candidate):
        source = candidate.download
        entries = bounded_entries(source, 4)
        selected = [path for path in entries if path.name != 'freshclam.dat']
        require(len(selected) == 3 and all(re.fullmatch(r'(main|daily|bytecode)\.(cvd|cld)', path.name) for path in selected),
                'Incomplete or extra candidate databases')
        require(len({path.stem for path in selected}) == 3, 'Ambiguous candidate databases')
        frozen = BASE / 'sets' / candidate.name
        frozen.mkdir(mode=0o755)
        os.chmod(frozen, 0o755)  # Non-root verifier must traverse it under unit UMask=0077.
        candidate.frozen = frozen
        files, daily_stime = [], None
        for path in sorted(selected):
            digest, size = file_hash(path, owner=100)
            require(size >= 512, 'Truncated signature file')
            destination = frozen / path.name
            # Downloader exit was proved; copy into a different root-owned inode.
            with path.open('rb') as src, destination.open('xb') as dst:
                shutil.copyfileobj(src, dst, 65536)
                dst.flush()
                os.fsync(dst.fileno())
            os.chmod(destination, 0o444)
            require(file_hash(destination) == (digest, size), 'Frozen signature bytes differ')
            require(owned_container(VERIFY) is None, 'Prior verifier resources retained')
            try:
                output = docker(*common_args(VERIFY),
                    '--mount=type=bind,source=' + str(frozen) + ',target=/verified,readonly',
                    '--entrypoint=/usr/bin/sigtool', IMAGE, '--info', '/verified/' + path.name, timeout=180)
                require(b'Verification OK' in output, 'Official signature verification not confirmed')
            finally:
                stop_container(VERIFY)
            with destination.open('rb') as stream:
                header = stream.read(512).decode('ascii').strip().split(':')
            require(header[0] == 'ClamAV-VDB' and len(header) == 9 and header[2].isdigit() and header[8].isdigit(),
                    'Signed database header rejected')
            files.append(DatabaseFile(path.name, digest, size, int(header[2])))
            if path.stem == 'daily':
                daily_stime = int(header[8])
        fd = secure_dir(frozen)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
        daily = next(file for file in files if file.name.startswith('daily.'))
        verified = VerifiedSet(tuple(files), daily.version, daily_stime)
        verified.validate(self.now())
        return verified

    def close_admission(self):
        run(['/usr/bin/systemctl', 'stop', PROXY_SOCKET, PROXY_SERVICE], timeout=30)
        for unit in [PROXY_SOCKET, PROXY_SERVICE]:
            state = run(['/usr/bin/systemctl', 'show', unit, '-p', 'ActiveState', '-p', 'MainPID']).stdout
            require(b'ActiveState=inactive\n' in state or b'ActiveState=failed\n' in state, 'Proxy unit still active')
            require(b'MainPID=' not in state or b'MainPID=0\n' in state, 'Proxy process remains')
        connections = run(['/usr/bin/ss', '-H', '-tan', '( sport = :3310 )']).stdout.decode().splitlines()
        # Closing kernel TCP states have no forwarding process; peer ACK timing is
        # not application admission. LISTEN/ESTAB/CLOSE-WAIT/SYN states must be gone.
        require(all(line.split()[0] in {'TIME-WAIT', 'FIN-WAIT-1', 'FIN-WAIT-2', 'CLOSING', 'LAST-ACK'}
                    for line in connections), 'Scanner admission connections remain')

    def stop_and_prove_exit(self):
        stop_container(ENGINE)

    def start_candidate(self, candidate, verified):
        require(candidate.frozen is not None, 'Candidate not frozen')
        require(owned_container(ENGINE) is None, 'Prior engine resources retained')
        directory = SOCKET_ROOT / 'engine'
        directory.mkdir(mode=0o755, exist_ok=True)
        os.chown(directory, 100, 101)
        if LIVE_SOCKET.exists():
            require(stat.S_ISSOCK(LIVE_SOCKET.lstat().st_mode), 'Unexpected engine socket file')
            LIVE_SOCKET.unlink()
        candidate.promoted = True
        docker(*common_args(ENGINE), '-d',
               '--mount=type=bind,source=' + str(candidate.frozen) + ',target=/var/lib/clamav,readonly',
               '--mount=type=bind,source=' + str(CONFIG / 'clamd.conf') + ',target=/etc/clamav/clamd.conf,readonly',
               '--mount=type=bind,source=' + str(directory) + ',target=/run/clamav',
               '--entrypoint=/usr/sbin/clamd', IMAGE, '--config-file=/etc/clamav/clamd.conf')
        item = owned_container(ENGINE)
        return RunningSet(verified, process_identity(item), item['Image'], self.config_hash)

    def verify_loaded(self, expected):
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            try:
                self.verify_active(expected)
                payload = b'timeline scanner readiness probe\n'
                response = engine_command(b'zINSTREAM\0' + struct.pack('!I', len(payload)) + payload + struct.pack('!I', 0))
                require(response == b'stream: OK', 'Scanner clean probe failed')
                return self.verify_active(expected)
            except (OSError, UpdateFailure):
                item = owned_container(ENGINE)
                require(item and item['State']['Running'] and process_identity(item) == expected.process_start_identity,
                        'Candidate engine exited or changed')
                time.sleep(1)
        raise UpdateFailure('Candidate scanner readiness timed out')

    def approve_active(self, running):
        self.store.approve(running, now=self.now())

    def open_admission(self, expected):
        require(self.store.read().approved == expected, 'Scanner approval changed')
        self.verify_active(expected)
        run(['/usr/bin/systemctl', 'start', PROXY_SOCKET])
        # Opening the socket cannot start clamd; the proxy gate checks approval again.
        with socket.create_connection(('127.0.0.1', 3310), timeout=10) as stream:
            stream.settimeout(10)
            stream.sendall(b'zPING\0')
            require(stream.recv(128) == b'PONG\0', 'Scanner admission probe failed')
        self.verify_active(expected)

    def admission_open(self):
        result = run(['/usr/bin/systemctl', 'is-active', PROXY_SOCKET], allowed=(0, 3))
        return result.returncode == 0 and result.stdout.strip() == b'active'

    def record_result(self, result):
        require(re.fullmatch(r'[A-Z_]{1,100}', result), 'Unexpected scanner result')
        print(json.dumps({'scannerUpdate': result, 'time': self.now()}), flush=True)

    def invalidate_approval(self):
        self.store.revoke()

    def cleanup_candidate(self, candidate):
        for name in [DOWNLOADER, VERIFY]:
            require(owned_container(name) is None, 'Candidate process cleanup not proved')
        running = owned_container(ENGINE)
        referenced = database_directory(running) if running and running['State']['Running'] else None
        if candidate.frozen and not candidate.promoted and candidate.frozen != referenced:
            shutil.rmtree(candidate.frozen)
        # A promoted set is retained even after a failed activation; no history deletion.
        shutil.rmtree(candidate.download.parent)


def gate():
    """Read-only socket-activation guard; never activates engine or modifies state.

    Atomic state read without the update lock avoids deadlock when its owner opens
    admission. The owner stops both socket/service before touching the engine.
    """
    fd = secure_dir(BASE / 'state', private=True)
    try:
        for name in ['operation.lock', 'state.json']:
            raw_fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
            try:
                info = os.fstat(raw_fd)
                require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and
                        stat.S_IMODE(info.st_mode) == 0o600 and info.st_size <= 16384, 'Scanner gate state rejected')
                if name == 'state.json':
                    state = State.decode(os.read(raw_fd, 16385))
            finally:
                os.close(raw_fd)
    finally:
        os.close(fd)
    require(state.approved is not None, 'Scanner is not approved')
    LinuxHost(None).verify_active(state.approved)


def main():
    require(os.geteuid() == 0 and Path(__file__).parent == INSTALLED, 'Requires approved root-owned installation')
    require(len(sys.argv) == 2 and sys.argv[1] in ('refresh', 'check-active', 'recover-check', 'gate', 'status'), 'Unsupported scanner action')
    if sys.argv[1] == 'recover-check' and os.environ.get('SERVICE_RESULT') == 'success':
        return
    if sys.argv[1] == 'gate':
        gate()
        return
    fd = secure_dir(BASE / 'state', private=True)
    store = StateStore(fd)
    os.close(fd)
    try:
        with store.locked():
            try:
                if sys.argv[1] == 'recover-check':
                    # ExecStopPost after killed/hung checks: no Docker inspection or
                    # state decoding can delay closure, and never close another owner.
                    LinuxHost.close_admission(None)
                    return
                host = LinuxHost(store)
                if sys.argv[1] == 'refresh':
                    # The file lock proves no updater owns these containers now.
                    # Recover bounded, labeled orphan workers after a killed client.
                    stop_container(DOWNLOADER)
                    stop_container(VERIFY)
                active = store.read().approved
                if active:
                    try:
                        host.verify_active(active)
                    except (OSError, UpdateFailure):
                        host.close_admission()
                        host.stop_and_prove_exit()
                        store.revoke()
                        active = None
                if active and sys.argv[1] == 'refresh' and active.databases.daily_stime + 48 * 3600 - host.now() < 1100:
                    host.close_admission()
                    host.stop_and_prove_exit()
                    store.revoke()
                    active = None
                if sys.argv[1] == 'refresh':
                    update(host)
                    # Recover death after durable approval but before socket opening.
                    if not host.admission_open():
                        expected = host.approved_active()
                        require(expected is not None, 'Refresh left no approved scanner')
                        host.open_admission(expected)
                elif active is None:
                    host.close_admission()
                    raise UpdateFailure('Scanner is not approved')
                else:
                    print(json.dumps({'scannerState': 'APPROVED_FRESH', 'dailyVersion': active.databases.daily_version,
                                      'dailySignedAt': active.databases.daily_stime}))
            except BaseException:
                # Includes constructor/state failures, still inside the same lock.
                LinuxHost.close_admission(None)
                raise
    except BlockingIOError:
        print(json.dumps({'scannerState': 'BUSY'}))
    finally:
        store.close()


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print(json.dumps({'scannerState': 'FAILED_CLOSED_OR_CLOSURE_UNVERIFIED',
                          'errorType': type(error).__name__,
                          'reason': str(error) if isinstance(error, UpdateFailure) else 'Host operation failed'}), file=sys.stderr)
        sys.exit(1)
