"""Generated fixed-host driver. MODE is a literal, never a command-line escape."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import sys
import time

EXPECTED = None
EXPECTED_UNITS = None
MODE = None
OPS = Path('/usr/local/lib/timeline-native-ops')
ROOT = Path('/var/lib/timeline-native-app')
UNITS = Path('/etc/systemd/system')
PREFIX = 'release-login-20260918-'


def require(value, reason):
    if not value:
        raise RuntimeError(reason)


def trusted_file(path, digest):
    for node in [*reversed(path.parent.parents), path.parent]:
        info = node.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022, 'Untrusted operations path')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == 0 and before.st_nlink == 1 and
                stat.S_IMODE(before.st_mode) == 0o644 and before.st_size <= 200000, 'Untrusted operations file')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(200001)
        after = os.fstat(fd)
        require(len(raw) == before.st_size and hashlib.sha256(raw).hexdigest() == digest and
                (before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                (after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'Operations checksum differs')
    finally:
        os.close(fd)


def main():
    require(os.geteuid() == 0 and socket.gethostname() == 'instance-20260408-091840', 'Wrong host or identity')
    require(MODE in ('rehearse', 'update', 'proof', 'rollback'), 'Unsupported generated mode')
    for name, digest in EXPECTED.items():
        trusted_file(OPS / name, digest)
    for name, digest in EXPECTED_UNITS.items():
        trusted_file(UNITS / name, digest)
    sys.path.insert(0, str(OPS))
    import native_backup_controller as backup
    import native_cutover as cutover
    import native_release as release
    import native_runtime_app as app
    import native_release_backup as protection
    release.require_target()
    stable = lambda c: {'version': 1, 'active': c, 'committed': c, 'pending': False}
    def show(unit, field):
        return cutover.systemctl('show', unit, '--property=' + field, '--value').decode().strip()
    def fixed_unit(unit):
        require(show(unit, 'FragmentPath') == str(UNITS / unit) and show(unit, 'DropInPaths') == '' and
                show(unit, 'NeedDaemonReload') == 'no' and show(unit, 'MainPID') == '0' and show(unit, 'ControlPID') == '0' and
                show(unit, 'ActiveState') in ('inactive', 'failed'), 'Unexpected supervised unit state')
        return show(unit, 'InvocationID')
    def evidence_event(unit, invocation, signal=False):
        raw = backup.command(['/usr/bin/journalctl', '-u', unit, '-n', '160', '--no-pager', '-o', 'json'], timeout=30)
        require(len(raw) < 512 * 1024, 'Release journal exceeds evidence bound')
        events = [json.loads(line) for line in raw.splitlines()]
        controlled = []
        for event in events:
            if event.get('_SYSTEMD_INVOCATION_ID') != invocation:
                continue
            try:
                item = json.loads(event['MESSAGE'])
            except (ValueError, KeyError):
                continue
            if signal and item.get('nativeProgramRecovery') == 'PREVIOUS_NATIVE_PROGRAM_SELECTED':
                controlled.append(event)
            elif not signal and item.get('nativeProgramUpdated') is True:
                controlled.append(event)
        require(len(controlled) == 1, 'Unique supervised release completion not found')
        if not signal:
            event = controlled[0]; timestamp = int(event['__REALTIME_TIMESTAMP'])
            supervisors = [e for e in events if e.get('_PID') == '1' and e.get('_BOOT_ID') == event.get('_BOOT_ID') and
                           e.get('MESSAGE') == unit + ': Deactivated successfully.' and
                           timestamp <= int(e['__REALTIME_TIMESTAMP']) <= timestamp + 180000000]
            require(len(supervisors) == 1, 'Supervisor successful exit not proved')
        return controlled[0]
    if MODE == 'rehearse':
        unit = 'timeline-native-release-check.service'
        prior = fixed_unit(unit)
        require(release.state() == stable(release.OLD), 'Rehearsal requires stable c5')
        require(not release.present(release.CHECKPOINT), 'Previous checkpoint retained; no repeated rehearsal')
        cutover.systemctl('--no-block', 'start', unit)
        until = time.monotonic() + 540
        while time.monotonic() < until:
            if release.present(release.CHECKPOINT):
                break
            require(show(unit, 'ActiveState') != 'failed', 'Rehearsal failed before checkpoint')
            time.sleep(1)
        else:
            raise RuntimeError('Bounded release checkpoint wait expired')
        checkpoint = backup.read_json(release.CHECKPOINT)
        invocation = show(unit, 'InvocationID'); pid = show(unit, 'MainPID')
        require(invocation == checkpoint['invocationId'] and invocation != prior and
                int(pid) == checkpoint['pid'] and int(pid) > 1, 'Checkpoint does not belong to supervised unit')
        require(Path('/proc/' + pid + '/cmdline').read_bytes() ==
                b'/usr/bin/python3\x00-I\x00/usr/local/lib/timeline-native-ops/native_release.py\x00check-recovery\x00',
                'Unexpected checkpoint executable')
        require(release.state() == {'version': 1, 'active': release.NEW, 'committed': release.OLD, 'pending': True} and
                checkpoint['releaseStateSha256'] == backup.sha(backup.read_file(release.STATE, 4096, owner=0)), 'Checkpoint state differs')
        protection.assert_frozen()
        require(backup.BACKUP.fullmatch(checkpoint['protectedBackup']), 'Checkpoint backup identifier differs')
        receipt_path = backup.ROOT / checkpoint['protectedBackup'] / 'snapshot-complete.json'
        require(backup.sha(backup.read_file(receipt_path, 4096, owner=0)) == checkpoint['protectionReceiptSha256'], 'Checkpoint protection receipt differs')
        receipt = backup.read_json(receipt_path); protection.verify_backup(receipt)
        cutover.systemctl('kill', '--kill-who=main', '--signal=SIGKILL', unit)
        until = time.monotonic() + 240
        while time.monotonic() < until:
            if show(unit, 'ActiveState') == 'failed' and release.state() == stable(release.OLD) and all(cutover.unit_state(u)['ActiveState'] == 'active' for u in cutover.APPS + cutover.SOCKETS):
                break
            time.sleep(1)
        else:
            raise RuntimeError('Supervised interruption recovery not proved')
        require(show(unit, 'ExecMainCode') == '2' and show(unit, 'ExecMainStatus') == '9', 'Controlled SIGKILL not proved')
        post = show(unit, 'ExecStopPost')
        require(re.search(r'code=exited\s*;\s*status=0(?:\s|[;}])', post), 'ExecStopPost recovery failed')
        evidence_event(unit, invocation, signal=True)
        release.verify_running(); cutover.check_health(public=True); protection.verify_protection(receipt)
        result = {'recovery': 'PASS', 'base': release.OLD, 'target': release.NEW, 'invocationId': invocation,
                  'checkpointStateSha256': checkpoint['releaseStateSha256'], 'protectedBackup': receipt['backup'],
                  'allDatabaseFingerprintsUnchanged': True, 'databaseRestored': False,
                  'initialMigrationReplayed': False, 'fullHostRebootTested': False}
        backup.write_json(ROOT / (PREFIX + 'recovery-proof.json'), result)
        print(json.dumps(result)); return
    if MODE in ('update', 'rollback'):
        previous, target = (release.OLD, release.NEW) if MODE == 'update' else (release.NEW, release.OLD)
        if MODE == 'update':
            proof = backup.read_json(ROOT / (PREFIX + 'recovery-proof.json'))
            require(proof['recovery'] == 'PASS' and proof['base'] == release.OLD and proof['target'] == release.NEW, 'Actual interruption proof required')
            checkpoint = backup.read_json(release.CHECKPOINT)
            require(proof['invocationId'] == checkpoint['invocationId'] and
                    proof['checkpointStateSha256'] == checkpoint['releaseStateSha256'], 'Recovery proof binding differs')
        require(release.state() == stable(previous), 'Fixed prior runtime required')
        unit = 'timeline-native-release.service' if MODE == 'update' else 'timeline-native-release-rollback.service'
        prior = fixed_unit(unit)
        cutover.systemctl('--no-block', 'start', unit)
        until = time.monotonic() + 720
        while time.monotonic() < until:
            active = show(unit, 'ActiveState')
            require(active != 'failed', 'Release failed; retained pending/backup state must be inspected')
            if active == 'inactive' and release.state() == stable(target):
                break
            time.sleep(1)
        else:
            raise RuntimeError('Bounded release completion wait expired')
        # Completion receipt is emitted by the protected controller. Journal lookup
        # survives systemd garbage collection of inactive unit properties.
        raw = backup.command(['/usr/bin/journalctl', '-u', unit, '-n', '160', '--no-pager', '-o', 'json'], timeout=30)
        require(len(raw) < 512 * 1024, 'Release journal too large')
        candidates = []
        for line in raw.splitlines():
            event = json.loads(line)
            try:
                message = json.loads(event.get('MESSAGE', ''))
            except ValueError:
                continue
            if message.get('nativeProgramUpdated') is True and message.get('runtimeCommit') == target:
                candidates.append((event, message))
        require(candidates, 'No actual release completion event')
        event, message = candidates[-1]
        invocation = event.get('_SYSTEMD_INVOCATION_ID')
        require(re.fullmatch(r'[a-f0-9]{32}', invocation or '') and invocation != prior, 'No new release invocation')
        require(message['databaseRestored'] is False and message['initialMigrationReplayed'] is False, 'Unexpected data operation')
        evidence_event(unit, invocation)
        release.verify_running(); release.ingress_ready(); cutover.check_health(public=True)
        require(backup.BACKUP.fullmatch(message['protectedBackup']), 'Release backup identifier differs')
        receipt = backup.read_json(backup.ROOT / message['protectedBackup'] / 'snapshot-complete.json')
        require(receipt['runtimeCommit'] == previous and receipt['database'] == cutover.DATABASE, 'Release backup origin differs')
        protection.verify_backup(receipt)
        result = {'release': 'PASS', 'operation': MODE, 'runtimeCommit': target, 'previousCommit': previous,
                  'invocationId': invocation, 'database': cutover.DATABASE, 'protectedBackup': receipt['backup'],
                  'completedAt': datetime.datetime.fromtimestamp(int(event['__REALTIME_TIMESTAMP']) / 1000000, datetime.timezone.utc).isoformat(),
                  'databaseRestored': False, 'initialMigrationReplayed': False, 'browserAcceptance': 'PENDING'}
        backup.write_json(ROOT / (PREFIX + MODE + '-proof.json'), result)
        print(json.dumps(result)); return
    proof = backup.read_json(ROOT / (PREFIX + 'update-proof.json'))
    require(proof['release'] == 'PASS' and proof['runtimeCommit'] == release.NEW and release.state() == stable(release.NEW), 'Committed final release proof required')
    evidence_event('timeline-native-release.service', proof['invocationId'])
    release.verify_checkout(release.NEW); app.validate_files(); release.verify_running(); release.ingress_ready(); cutover.check_health(public=True)
    require(backup.BACKUP.fullmatch(proof['protectedBackup']), 'Proof backup identifier differs')
    receipt = backup.read_json(backup.ROOT / proof['protectedBackup'] / 'snapshot-complete.json'); protection.verify_backup(receipt)
    nginx = Path('/etc/nginx/sites-enabled/feishu-timeline').read_text()
    require('timeline.all-too-well.com' in nginx and 'http://127.0.0.1:3000' in nginx and 'http://127.0.0.1:3001' in nginx, 'Nginx upstream differs')
    result = {'runtimeProof': 'PASS', 'url': 'https://timeline.all-too-well.com', 'hostname': 'timeline.all-too-well.com',
              **release.current(), 'database': cutover.DATABASE, 'deploymentTime': proof['completedAt'],
              'targetCheckoutHead': release.NEW, 'nginxUpstreams': {'api': '127.0.0.1:3001', 'web': '127.0.0.1:3000'},
              'publicUpstreamHealth': 'PASS', 'exactDomainBrowserAcceptance': 'PENDING',
              'productOwnerAcceptance': 'AWAITING_PRODUCT_OWNER_CONFIRMATION', 'databaseRestored': False}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
