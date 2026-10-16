"""Pull only finalized private-registry digests; remove temporary registry auth."""
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import stat
import subprocess
import tempfile
import urllib.request

IDENTITY = None
REGISTRY = 'us-west1-docker.pkg.dev'
BASE = Path('/run/timeline-native-pulls')


def main():
    if os.geteuid() != 0 or socket.gethostname() != 'instance-20260408-091840':
        raise RuntimeError('Wrong host or identity')
    for node in reversed(BASE.parents):
        info = node.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError('Untrusted temporary authentication directory')
    BASE.mkdir(mode=0o700, exist_ok=True)
    info = BASE.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
        raise RuntimeError('Unsafe registry authentication root')
    def interrupt(signum, frame):
        raise RuntimeError('Fixed image pull interrupted')
    for signum in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        signal.signal(signum, interrupt)
    config = Path(tempfile.mkdtemp(prefix='docker-auth-20260917-', dir=BASE))
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'DOCKER_CONFIG': str(config)}
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        request = urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', headers={'Metadata-Flavor': 'Google'})
        with opener.open(request, timeout=10) as response:
            raw = response.read(16385)
        if len(raw) > 16384:
            raise RuntimeError('Oversized metadata response')
        value = json.loads(raw); token = value['access_token']
        if not isinstance(token, str) or not 20 < len(token) < 16000:
            raise RuntimeError('Invalid registry access response')
        authenticated = subprocess.run(['/usr/bin/docker', '--config', str(config), 'login', '--username', 'oauth2accesstoken', '--password-stdin', REGISTRY], input=token.encode(), env=env, capture_output=True, timeout=30)
        del token, value, raw
        if authenticated.returncode:
            raise RuntimeError('Private registry authentication failed')
        for component in ('api', 'web'):
            reference = IDENTITY['images'][component]
            with (config / (component + '-pull.log')).open('xb') as output:
                result = subprocess.run(['/usr/bin/docker', '--config', str(config), 'pull', reference], stdout=output, stderr=output, env=env, timeout=600)
            if result.returncode:
                raise RuntimeError('Fixed image pull failed: ' + component)
            item = json.loads(subprocess.check_output(['/usr/bin/docker', 'image', 'inspect', reference], env=env, timeout=20))[0]
            labels = item['Config']['Labels']
            expected = {'org.opencontainers.image.revision': IDENTITY['commit'], 'com.feishu-timeline.source-tree': IDENTITY['tree'],
                        'org.opencontainers.image.version': IDENTITY['release'], 'org.opencontainers.image.created': IDENTITY['buildTime']}
            if reference not in item['RepoDigests'] or item['Architecture'] != 'amd64' or item['Os'] != 'linux' or any(labels.get(k) != v for k, v in expected.items()):
                raise RuntimeError('Pulled image identity differs')
            print(json.dumps({'component': component, 'repositoryDigest': reference, 'imageId': item['Id'], 'runtimeCommit': IDENTITY['commit']}))
    finally:
        for signum in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
            signal.signal(signum, signal.SIG_IGN)
        shutil.rmtree(config)
        print(json.dumps({'temporaryRegistryAuthenticationRemoved': not config.exists()}))


if __name__ == '__main__':
    main()
