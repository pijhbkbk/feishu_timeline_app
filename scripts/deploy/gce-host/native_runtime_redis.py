"""Fixed root-owned supervisor for the private native-auth Redis instance."""
import hashlib
import fcntl
from contextlib import contextmanager
import json
import os
from pathlib import Path
import secrets
import socket
import stat
import sys

INSTALLED = Path('/usr/local/lib/timeline-native-ops')
if Path(__file__).parent == INSTALLED:
    for node in [*reversed(INSTALLED.parents), INSTALLED]:
        i = node.lstat()
        if not stat.S_ISDIR(i.st_mode) or i.st_uid != 0 or i.st_mode & 0o022:
            raise RuntimeError('Untrusted installed directory')
    sys.path.insert(0, str(INSTALLED))
import native_backup_controller as backup
import native_runtime_network as network

ROOT = Path('/var/lib/timeline-native-runtime')
CONFIG = Path('/etc/timeline-native-runtime/native-redis.conf')
CONFIG_SHA = '7945c3401f2f086eaf8c89a23ee70862f0d2e95116f92ffbe3d994709d5555e1'
IMAGE = 'redis@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf'
NAME = 'timeline-native-redis'
LABEL = 'com.timeline.native.service=redis-v1'
require = backup.require
run = network.run


def acl(password):
    digest = hashlib.sha256(password.encode()).hexdigest()
    return ('user default off\nuser nativeapp on #' + digest +
            ' ~auth:* ~notifications:jobs ~notifications:queued:* -@all'
            ' +ping +info +quit +client|setinfo +get +set +del +eval +incr +expire'
            ' +multi +exec +llen +lpush +rpush +rpop +exists\n').encode()


def state_directory():
    fd = backup.directory(ROOT, trusted=True)
    require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700, 'Runtime state must be private')
    os.close(fd)


def initialize():
    state_directory()
    require(not (ROOT / 'redis-credentials.json').exists() and not (ROOT / 'redis.acl').exists() and
            not (ROOT / 'redis-data').exists(), 'Redis initialization cannot overwrite prior state')
    password = secrets.token_urlsafe(36)
    fd = os.open(ROOT / 'redis-operation.lock', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    os.fchmod(fd, 0o600); os.fsync(fd); os.close(fd)
    backup.write_json(ROOT / 'redis-credentials.json', {'version': 1, 'password': password})
    fd = os.open(ROOT / 'redis.acl', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    try:
        os.fchown(fd, 1000, 1000)
        os.fchmod(fd, 0o400)
        with os.fdopen(fd, 'wb', closefd=False) as out:
            out.write(acl(password)); out.flush(); os.fsync(fd)
    finally:
        os.close(fd)
    data = ROOT / 'redis-data'
    data.mkdir(mode=0o700); data.chmod(0o700); os.chown(data, 1000, 1000)
    backup.fsync_dir(ROOT)
    print(json.dumps({'nativeRedisInitialized': True, 'credentialsExported': False}))


@contextmanager
def locked():
    state_directory()
    fd = os.open(ROOT / 'redis-operation.lock', os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        backup.regular(fd, 0, owner=0)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)


def validate_files():
    state_directory()
    value = backup.read_json(ROOT / 'redis-credentials.json')
    require(set(value) == {'version', 'password'} and value['version'] == 1 and
            isinstance(value['password'], str) and len(value['password']) == 48 and
            all(c.isalnum() or c in '-_' for c in value['password']), 'Redis credential state rejected')
    for p, uid, mode in [(ROOT / 'redis.acl', 1000, 0o400), (CONFIG, 0, 0o644)]:
        i = p.lstat()
        require(stat.S_ISREG(i.st_mode) and i.st_uid == uid and i.st_nlink == 1 and
                stat.S_IMODE(i.st_mode) == mode and i.st_size <= 4096, 'Redis file ownership rejected')
    fd = backup.directory(CONFIG.parent, trusted=True); os.close(fd)
    require(hashlib.sha256(CONFIG.read_bytes()).hexdigest() == CONFIG_SHA and
            (ROOT / 'redis.acl').read_bytes() == acl(value['password']), 'Redis configuration differs')
    i = (ROOT / 'redis-data').lstat()
    require(stat.S_ISDIR(i.st_mode) and i.st_uid == 1000 and i.st_gid == 1000 and stat.S_IMODE(i.st_mode) == 0o700,
            'Redis data directory rejected')


def inspect():
    ids = run(['/usr/bin/docker', 'container', 'ls', '-a', '--filter', 'name=^' + NAME + '$', '--format', '{{.ID}}']).decode().splitlines()
    require(len(ids) <= 1, 'Ambiguous Redis container')
    if not ids:
        return None
    value = json.loads(run(['/usr/bin/docker', 'container', 'inspect', NAME]))
    require(len(value) == 1, 'Redis container absent')
    item = value[0]
    require(item['Name'] == '/' + NAME and item['Config']['Image'] == IMAGE and
            item['Config'].get('Labels', {}).get('com.timeline.native.service') == 'redis-v1', 'Unowned Redis container')
    return item


def validate_container(item, image_id):
    host, config = item['HostConfig'], item['Config']
    require(item['Image'] == image_id and config['User'] == '1000:1000' and
            config['Entrypoint'] == ['redis-server'] and config['Cmd'] == ['/run/native-redis.conf'], 'Redis runtime identity differs')
    require(host['NetworkMode'] == 'timeline-native-api' and host['ReadonlyRootfs'] is True and
            host['Privileged'] is False and host['Memory'] == 268435456 and host['MemorySwap'] == 268435456 and
            host['NanoCpus'] == 500000000 and host['PidsLimit'] == 64 and host['RestartPolicy']['Name'] == 'no' and
            host['CapDrop'] == ['ALL'] and not host['CapAdd'] and not host.get('PortBindings') and host['PublishAllPorts'] is False and
            set(host['SecurityOpt']) <= {'no-new-privileges', 'no-new-privileges:true'} and bool(host['SecurityOpt']) and
            not host.get('Devices') and not host.get('DeviceRequests') and host['PidMode'] == '', 'Redis isolation differs')
    mounts = {(m['Source'], m['Destination'], m['RW'], m['Type']) for m in item['Mounts']}
    require(len(item['Mounts']) == 3 and mounts == {
        (str(ROOT / 'redis-data'), '/data', True, 'bind'), (str(ROOT / 'redis.acl'), '/run/native-redis.acl', False, 'bind'),
        (str(CONFIG), '/run/native-redis.conf', False, 'bind')}, 'Redis mounts differ')
    networks = item['NetworkSettings']['Networks']
    require(set(networks) == {'timeline-native-api'} and
            networks['timeline-native-api']['IPAMConfig']['IPv4Address'] == '172.30.44.3', 'Redis network attachment differs')


def prepare_start():
    validate_files()
    image = json.loads(run(['/usr/bin/docker', 'image', 'inspect', IMAGE]))[0]
    require(IMAGE in image['RepoDigests'] and image['Os'] == 'linux' and image['Architecture'] == 'amd64', 'Redis image differs')
    item = inspect()
    if item is None:
        run(['/usr/bin/docker', 'create', '--name', NAME, '--label', LABEL, '--network=timeline-native-api', '--ip=172.30.44.3',
             '--user=1000:1000', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--memory=256m',
             '--memory-swap=256m', '--cpus=0.5', '--pids-limit=64', '--ulimit=nofile=128:128', '--restart=no',
             '--log-opt=max-size=1m', '--log-opt=max-file=3', '--mount=type=bind,src=' + str(ROOT / 'redis-data') + ',dst=/data',
             '--mount=type=bind,src=' + str(ROOT / 'redis.acl') + ',dst=/run/native-redis.acl,readonly',
             '--mount=type=bind,src=' + str(CONFIG) + ',dst=/run/native-redis.conf,readonly',
             '--entrypoint=redis-server', IMAGE, '/run/native-redis.conf'])
        item = inspect()
    require(item is not None, 'Redis creation not proved')
    validate_container(item, image['Id'])
    require(not item['State']['Running'], 'Redis already running outside this service start')


def stop():
    # Recovery checks exact ownership even if configuration files are damaged.
    item = inspect()
    if item and item['State']['Running']:
        run(['/usr/bin/docker', 'stop', '--time=15', NAME])
    final = inspect()
    require(final is None or (not final['State']['Running'] and final['State']['Pid'] == 0), 'Redis stop not proved')


def main():
    require(os.geteuid() == 0 and socket.gethostname() == 'instance-20260408-091840' and
            Path(__file__).parent == INSTALLED and sys.argv[1:] in [['initialize'], ['start'], ['stop']], 'Wrong host or operation')
    action = sys.argv[1]
    if action == 'initialize':
        with backup.locked():
            initialize()
    else:
        with locked():
            if action == 'start':
                prepare_start()
            else:
                stop()
    if action == 'start':
        os.execve('/usr/bin/docker', ['/usr/bin/docker', 'start', '--attach', NAME], backup.ENV)


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print(json.dumps({'nativeRedis': 'FAILED', 'reason': str(error) if isinstance(error, backup.Failure) else type(error).__name__}), file=sys.stderr)
        sys.exit(1)
