#!/usr/bin/env python3
"""Create only the named, synthetic-only A2 HTTP acceptance stack.

No production credentials, seed/demo data, image pulls, or existing volumes.
"""
import json
from pathlib import Path
import secrets
import subprocess
import sys
import time

ROOT = Path('/private/tmp/timeline-native-a2-state-20260917')
PURPOSE = 'timeline-native-auth-isolated-test'
NETWORK = 'timeline-native-a2-20260917'
ACCESS_NETWORK = 'timeline-native-a2-access-20260917'
PG = 'timeline-native-a2-pg-20260917'
REDIS = 'timeline-native-a2-redis-20260917'
API = 'timeline-native-a2-api-20260917'
DB = 'native_auth_test_http'
API_IMAGE = 'timeline-native-api:6c70a89'
OPS_IMAGE = 'timeline-native-ops:f2da362'

def run(args, **kwargs):
    return subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, **kwargs).stdout.strip()

def docker(*args, **kwargs):
    return run(['docker', *args], **kwargs)

def create():
    if ROOT.exists():
        raise RuntimeError('Task state already exists; inspect and resume deliberately.')
    for name in (NETWORK, ACCESS_NETWORK, PG, REDIS, API):
        result = subprocess.run(['docker', 'inspect', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode == 0:
            raise RuntimeError('Named resource already exists; refusing reuse.')
    ROOT.mkdir(mode=0o700)
    (ROOT / 'admin.password').write_text(secrets.token_urlsafe(36))
    (ROOT / 'admin.password').chmod(0o600)
    pg_image = docker('image', 'inspect', '3b36dd7df133', '--format', '{{.Id}}')
    env = {
        'NODE_ENV': 'production', 'DEPLOYMENT_ENV': 'staging', 'PORT': '3001',
        'FRONTEND_URL': 'http://127.0.0.1:3350',
        'DATABASE_URL': f'postgresql://native_auth_test:native-auth-isolated-test-only@{PG}:5432/{DB}',
        'REDIS_URL': f'redis://:native-redis-isolated-test-only@{REDIS}:6379',
        'AUTH_MOCK_ENABLED': 'false', 'OBJECT_STORAGE_PROVIDER': 'local',
        'OBJECT_STORAGE_LOCAL_ROOT': '/app/var/object-storage',
        'MALWARE_SCANNER_PROVIDER': 'clamav', 'CLAMAV_HOST': 'timeline-native-a2-clamav-20260917',
        'CLAMAV_MAX_SIGNATURE_AGE_HOURS': '48',
        'NOTIFICATION_QUEUE_POLL_MS': '100', 'NOTIFICATION_OVERDUE_SCAN_MS': '60000',
        'SESSION_TTL_SECONDS': '3600',
    }
    env.update(expected_identity())
    example = Path(__file__).resolve().parents[2] / 'apps/api/.env.example'
    for line in example.read_text().splitlines():
        if line.startswith('ATTACHMENT_STORAGE_'):
            key, value = line.split('=', 1)
            env[key] = value
    (ROOT / 'api.env').write_text(''.join(f'{k}={v}\n' for k, v in env.items()))
    (ROOT / 'api.env').chmod(0o600)
    docker('network', 'create', '--internal', '--label', f'purpose={PURPOSE}', NETWORK)
    # Docker Desktop published loopback ports need an ordinary bridge. This is not an offline test.
    docker('network', 'create', '--label', f'purpose={PURPOSE}', ACCESS_NETWORK)
    docker('run', '-d', '--pull=never', '--name', PG, '--label', f'purpose={PURPOSE}', '--network', NETWORK,
           '--memory', '512m', '--cpus', '1', '-p', '127.0.0.1:55439:5432',
           '-e', 'POSTGRES_USER=native_auth_test', '-e', 'POSTGRES_PASSWORD=native-auth-isolated-test-only',
           '-e', f'POSTGRES_DB={DB}', pg_image)
    for _ in range(40):
        try:
            docker('exec', PG, 'pg_isready', '-U', 'native_auth_test', '-d', DB)
            break
        except subprocess.CalledProcessError:
            time.sleep(.5)
    else:
        raise RuntimeError('Synthetic PostgreSQL did not start.')
    docker('run', '-d', '--pull=never', '--name', REDIS, '--label', f'purpose={PURPOSE}', '--network', NETWORK,
           '--memory', '128m', '--cpus', '.5', '-p', '127.0.0.1:56389:6379', 'redis:7-alpine',
           'redis-server', '--requirepass', 'native-redis-isolated-test-only', '--appendonly', 'yes',
           '--maxmemory', '64mb', '--maxmemory-policy', 'noeviction')
    docker('run', '--rm', '--pull=never', '--network', NETWORK, '--env-file', str(ROOT / 'api.env'),
           '--memory', '512m', OPS_IMAGE, './node_modules/.bin/prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma')
    docker('run', '-d', '--pull=never', '--name', API, '--label', f'purpose={PURPOSE}', '--network', NETWORK,
           '--memory', '768m', '--cpus', '1', '-p', '127.0.0.1:3351:3001',
           '--env-file', str(ROOT / 'api.env'), API_IMAGE)
    for name in (PG, REDIS, API):
        docker('network', 'connect', ACCESS_NETWORK, name)
    write_manifest(None, pg_image)
    print(json.dumps({'created': True, 'syntheticOnly': True, 'catalogThenAdministratorRequired': True,
                      'manifest': str(ROOT / 'manifest.json')}))

def initialize():
    assert_own(API)
    # Run only after the formal fresh catalog. No seed, fixture account bypass, or password output.
    docker('cp', str(ROOT / 'admin.password'), f'{API}:/tmp/native-a2-admin.password')
    docker('exec', '--user', 'root', API, 'chown', '1000:1000', '/tmp/native-a2-admin.password')
    initialized = json.loads(docker('exec', API, 'node', 'dist/cli/native-account.js', 'initialize',
                                   '--username', 'synthetic-a2-admin', '--name', '合成验收管理员',
                                   '--password-file', '/tmp/native-a2-admin.password'))
    docker('exec', API, 'rm', '/tmp/native-a2-admin.password')
    write_manifest(initialized['userId'], docker('image', 'inspect', '3b36dd7df133', '--format', '{{.Id}}'))
    print(json.dumps({'administratorInitialized': True, 'syntheticOnly': True}))

def write_manifest(admin_id, pg_image):
    (ROOT / 'manifest.json').write_text(json.dumps({
        'syntheticOnly': True, 'purpose': PURPOSE, 'network': NETWORK,
        'database': DB, 'api': 'http://127.0.0.1:3351', 'origin': 'http://127.0.0.1:3350',
        'adminUserId': admin_id, 'apiImage': API_IMAGE,
        'apiImageId': docker('image', 'inspect', API_IMAGE, '--format', '{{.Id}}'),
        'pgImageId': pg_image,
    }, indent=2))
    (ROOT / 'manifest.json').chmod(0o600)

def assert_own(name):
    if docker('inspect', '--format', '{{index .Config.Labels "purpose"}}', name) != PURPOSE:
        raise RuntimeError('Unexpected container ownership.')

def expected_identity():
    labels = json.loads(docker('image', 'inspect', API_IMAGE, '--format', '{{json .Config.Labels}}'))
    return {'EXPECTED_SOURCE_COMMIT': labels['org.opencontainers.image.revision'],
            'EXPECTED_SOURCE_TREE': labels['com.feishu-timeline.source-tree'],
            'EXPECTED_BUILD_TIME': labels['org.opencontainers.image.created'],
            'EXPECTED_RELEASE': labels['org.opencontainers.image.version']}

def resume_api_configuration():
    # Explicit recovery for the observed local/production config mismatch before any user creation.
    for name in (PG, REDIS, API):
        assert_own(name)
    if docker('inspect', '--format', '{{.State.Status}}', API) != 'exited':
        raise RuntimeError('Only the failed, stopped synthetic API may be recreated.')
    env_path = ROOT / 'api.env'
    env = dict(line.split('=', 1) for line in env_path.read_text().splitlines())
    if env['DEPLOYMENT_ENV'] not in ('local', 'staging') or 'EXPECTED_SOURCE_COMMIT' in env:
        raise RuntimeError('This one-time recovery only matches the recorded failure.')
    env['DEPLOYMENT_ENV'] = 'staging'
    env.update(expected_identity())
    for line in (Path(__file__).resolve().parents[2] / 'apps/api/.env.example').read_text().splitlines():
        if line.startswith('ATTACHMENT_STORAGE_'):
            key, value = line.split('=', 1)
            env[key] = value
    env_path.write_text(''.join(f'{k}={v}\n' for k, v in env.items()))
    docker('run', '--rm', '--pull=never', '--network', NETWORK, '--env-file', str(env_path),
           '--entrypoint', 'node', API_IMAGE, '-e',
           'require("./dist/common/app-config").resolveAppConfig(); console.log("CONFIG_VALIDATED")')
    docker('rm', API)
    docker('run', '-d', '--pull=never', '--name', API, '--label', f'purpose={PURPOSE}', '--network', NETWORK,
           '--memory', '768m', '--cpus', '1', '-p', '127.0.0.1:3351:3001', '--env-file', str(env_path), API_IMAGE)
    write_manifest(None, docker('image', 'inspect', '3b36dd7df133', '--format', '{{.Id}}'))
    print(json.dumps({'apiConfigurationCorrected': True, 'catalogThenAdministratorRequired': True}))

if __name__ == '__main__':
    commands = {'create': create, 'initialize': initialize, 'resume-api-configuration': resume_api_configuration}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        raise SystemExit('Usage: native-business-setup.py create|initialize|resume-api-configuration')
    try:
        commands[sys.argv[1]]()
    except Exception as error:
        # Never expose a child environment or credential-bearing subprocess output.
        print(json.dumps({'created': False, 'errorType': type(error).__name__}), file=sys.stderr)
        raise SystemExit(1)
