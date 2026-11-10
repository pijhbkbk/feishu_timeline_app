#!/usr/bin/python3
"""Resume only the verified r03 application switch; never migrate or import again.

The operator must externally pin this file, the host helper, the prior manifest,
and the installed Compose executable. Existing evidence is never overwritten.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import sys


def need(ok, code):
    if not ok:
        raise RuntimeError(code)


def verified_bytes(path, expected, uid, limit):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == uid and before.st_nlink == 1
             and not before.st_mode & 0o022 and 0 < before.st_size <= limit, 'PINNED_FILE_METADATA')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            data = stream.read(limit + 1)
        after = os.fstat(fd)
        need(len(data) == before.st_size and hashlib.sha256(data).hexdigest() == expected
             and (before.st_ino, before.st_dev, before.st_mtime_ns, before.st_ctime_ns)
             == (after.st_ino, after.st_dev, after.st_mtime_ns, after.st_ctime_ns), 'PINNED_FILE_CHANGED')
        return data
    finally:
        os.close(fd)


def emit_success(result):
    try:
        print('TABLE_ACTIVATION_RECEIPT ' + json.dumps(result, sort_keys=True), flush=True)
    except BrokenPipeError:
        pass  # The root-owned result.json remains the authoritative receipt.


def save_owned_failure(h, result):
    if h.get('RESUME_STARTED_HERE') and not h.get('COMMITTED'):
        h['save'](h['OUT'] / 'activation-resume-failure.json', result)


def resume(h, manifest_digest, compose_digest):
    root, runtime, out = h['ROOT'], h['RUNTIME'], h['OUT']
    need(out == root / 'table-first-release-20261110-r03', 'RESUME_ATTEMPT')
    for p in [root, runtime, out]:
        need(p.resolve() == p and p.stat().st_uid == 0 and not p.stat().st_mode & 0o022, 'ROOT_IDENTITY')
    need(not (out / 'activation-resume-started.json').exists() and not (out / 'result.json').exists(), 'RESUME_ALREADY_ATTEMPTED')
    manifest = json.loads(verified_bytes(out / 'manifest.json', manifest_digest, 0, 2 * 1024**2))
    h['PLAN'] = manifest['plan']
    failure = json.loads(h['read'](out / 'failure.json'))
    need(failure['phase'] == 'ACTIVATE_APPLICATIONS' and failure['status'] == 'FAILED_REVIEW_REQUIRED'
         and failure['errorCode'] == 'COMMAND_FAILED_docker_84ed86a7d83e'
         and failure['recoveryGuardRetained'] and failure['timerPaused'], 'RESUME_FAILURE_SCOPE')
    need(json.loads(h['read'](h['GUARD']))['source'] == str(out), 'RESUME_GUARD')
    need(h['run'](['systemctl', 'show', h['TIMER'], '--property=ActiveState', '--value']).stdout.strip() == b'inactive', 'RESUME_TIMER_ACTIVE')
    h['LOCK'] = os.open(root / 'clamav-automatic-update/operation.lock', os.O_RDWR | os.O_NOFOLLOW)
    fcntl.flock(h['LOCK'], fcntl.LOCK_EX | fcntl.LOCK_NB)
    verified_bytes(Path(h['COMPOSE']), compose_digest, 0, 128 * 1024**2)
    h['run']([h['COMPOSE'], 'version', '--short'])
    model = verified_bytes(out / 'inputs/table-release-model.py', manifest['files']['table-release-model.py']['sha256'], 0, 65536)
    h['M'] = {'__name__': 'reviewed_release_model'}
    exec(compile(model, '<pinned-release-model>', 'exec'), h['M'])
    paths = {'compose.json': runtime / 'compose.json', 'service-identities.json': runtime / 'service-identities.json',
             'business-ready.py': runtime / 'business-ready.py', 'clamav-updater.py': h['CLAM']}
    h['ORIGINAL'] = {n: h['read'](out / 'rollback' / n) for n in paths}
    need(all(h['read'](p) == h['ORIGINAL'][n] for n, p in paths.items()), 'RUNTIME_CHANGED_SINCE_FAILURE')
    candidate = h['M']['transform'](h['ORIGINAL'], h['PLAN'])
    need(h['read'](out / 'candidate-compose.json') == candidate['compose.json'], 'CANDIDATE_CHANGED')
    state = json.loads(h['ORIGINAL']['service-identities.json'])
    h['IDS'] = {n: v['id'] for n, v in state['services'].items()}
    need(h['ids']() == h['IDS'], 'LIVE_IDS_CHANGED')
    before = json.loads(h['read'](out / 'before.json'))
    for n, cid in h['IDS'].items():
        live = h['inspect'](cid)
        need(live['Id'] == cid and live['Image'] == state['services'][n]['image'], 'LIVE_IMAGE_CHANGED')
        if n in h['M']['CHANGED']:
            old = json.loads(h['read'](out / 'rollback' / (n + '-inspect.json')))
            need(not live['State']['Running'] and not live['State']['OOMKilled']
                 and all(live[k] == old[k] for k in ['Config', 'HostConfig', 'Mounts'])
                 and set(live['NetworkSettings']['Networks']) == set(old['NetworkSettings']['Networks']), 'STOPPED_APP_CHANGED')
            h['OLD'][n] = old
        else:
            need(h['summary'](live) == before[n], 'UNRELATED_SERVICE_CHANGED')
            h['OLD'][n] = live
    source = json.loads(h['read'](out / 'production-evidence/source.json', uid=1000))
    need(source == failure['productionSource']
         and all(source[k] == v for k, v in h['PLAN']['expectedSource'].items()), 'COMPLETED_IMPORT_CHANGED')
    need(json.loads(h['read'](out / 'production-evidence/preserved.json', uid=1000))['originalRowsPreserved'] > 0, 'PRESERVATION_EVIDENCE')
    h['RESULT'].update({k: failure[k] for k in ['productionBackup', 'rehearsalBackup', 'productionSource', 'rehearsalSource']})
    h['RESULT']['resumedActivationOnly'] = True
    h['save'](out / 'activation-resume-started.json', {'manifestSHA256': manifest_digest, 'composeSHA256': compose_digest})
    h['RESUME_STARTED_HERE'] = True
    h['SWITCHED'], h['PAUSED'] = True, True
    h['activate_applications'](candidate)


if __name__ == '__main__':
    h = None
    try:
        os.umask(0o077)
        need(os.geteuid() == 0 and socket.gethostname() == 'y9000p-server', 'HOST_IDENTITY')
        need(len(sys.argv) == 4 and all(re.fullmatch('[a-f0-9]{64}', x) for x in sys.argv[1:]), 'EXTERNAL_DIGESTS_REQUIRED')
        host = Path('/home/serveradmin/table-first-release-20261110/prepared/table-release-host.py')
        data = verified_bytes(host, sys.argv[1], 1000, 65536)
        h = {'__name__': 'verified_activation_helper', '__file__': str(host)}
        exec(compile(data, str(host), 'exec'), h)
        resume(h, sys.argv[2], sys.argv[3])
        emit_success(h['RESULT'])
    except BaseException as error:
        result = {'status': 'ACTIVATION_RESUME_FAILED', 'errorCode': str(error) if re.fullmatch('[A-Za-z0-9_-]{1,100}', str(error)) else type(error).__name__}
        if h is not None:
            try:
                h['retain_failure_barrier']()
            except BaseException:
                result['cleanupFailed'] = True
            result['recoveryGuardRetained'] = h['GUARD'].exists()
            save_owned_failure(h, result)
        print('TABLE_ACTIVATION_RECEIPT ' + json.dumps(result, sort_keys=True), flush=True)
        raise SystemExit(1)
