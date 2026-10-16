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
PREFIX = 'release-r28-ui-patch-20260928-'
CHECKPOINT = ROOT / (PREFIX + 'checkpoint.json')


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
    require(MODE in ('update', 'proof'), 'Unsupported generated mode')
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
    from native_release_target_r28_patch import TARGET
    import native_release_r28 as r28
    import native_release_r28_patch as program
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
            elif not signal and item.get('r28ProgramPatch') == 'RUNTIME_READY':
                controlled.append(event)
        require(len(controlled) == 1, 'Unique supervised release completion not found')
        if not signal:
            event = controlled[0]; timestamp = int(event['__REALTIME_TIMESTAMP'])
            supervisors = [e for e in events if e.get('_PID') == '1' and e.get('_BOOT_ID') == event.get('_BOOT_ID') and
                           e.get('MESSAGE') == unit + ': Deactivated successfully.' and
                           timestamp <= int(e['__REALTIME_TIMESTAMP']) <= timestamp + 180000000]
            require(len(supervisors) == 1, 'Supervisor successful exit not proved')
        return controlled[0]
    if MODE == 'update':
        previous, target = TARGET['base'], TARGET['commit']
        require(program.record()['phase'] == 'BASE', 'Patch already attempted; no blind retry')
        require(release.state() == stable(previous), 'Fixed prior runtime required')
        unit = 'timeline-native-release.service'
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
            if message.get('r28ProgramPatch') == 'RUNTIME_READY' and message.get('runtimeCommit') == target:
                candidates.append((event, message))
        require(candidates, 'No actual release completion event')
        event, message = candidates[-1]
        invocation = event.get('_SYSTEMD_INVOCATION_ID')
        require(re.fullmatch(r'[a-f0-9]{32}', invocation or '') and invocation != prior, 'No new release invocation')
        require(message['databaseRestored'] is False and message['migrationExecuted'] is False and message['migrations'] == 41, 'Unexpected data operation')
        evidence_event(unit, invocation)
        release.verify_running(); release.ingress_ready(); cutover.check_health(public=True); r28.schema_state(41)
        require(backup.BACKUP.fullmatch(message['backup']), 'Release backup identifier differs')
        receipt = backup.read_json(backup.ROOT / message['backup'] / 'snapshot-complete.json')
        require(receipt['runtimeCommit'] == previous and receipt['database'] == cutover.DATABASE, 'Release backup origin differs')
        protection.verify_backup(receipt)
        require(program.record()['phase'] == 'COMMITTED', 'Program commit receipt missing')
        result = {'release': 'PASS', 'operation': MODE, 'runtimeCommit': target, 'previousCommit': previous,
                  'invocationId': invocation, 'database': cutover.DATABASE, 'protectedBackup': receipt['backup'],
                  'completedAt': datetime.datetime.fromtimestamp(int(event['__REALTIME_TIMESTAMP']) / 1000000, datetime.timezone.utc).isoformat(),
                  'databaseRestored': False, 'migrationCount': 41, 'browserAcceptance': 'PENDING'}
        backup.write_json(ROOT / (PREFIX + MODE + '-proof.json'), result)
        print(json.dumps(result)); return
    proof = backup.read_json(ROOT / (PREFIX + 'update-proof.json'))
    require(proof['release'] == 'PASS' and proof['runtimeCommit'] == TARGET['commit'] and release.state() == stable(TARGET['commit']), 'Committed final release proof required')
    evidence_event('timeline-native-release.service', proof['invocationId'])
    require(program.record()['phase'] == 'COMMITTED', 'Final program journal required')
    release.verify_checkout(TARGET['commit']); app.validate_files(); release.verify_running(); release.ingress_ready(); cutover.check_health(public=True); r28.schema_state(41)
    require(backup.BACKUP.fullmatch(proof['protectedBackup']), 'Proof backup identifier differs')
    receipt = backup.read_json(backup.ROOT / proof['protectedBackup'] / 'snapshot-complete.json'); protection.verify_backup(receipt)
    nginx = Path('/etc/nginx/sites-enabled/feishu-timeline').read_text()
    require('timeline.all-too-well.com' in nginx and 'http://127.0.0.1:3000' in nginx and 'http://127.0.0.1:3001' in nginx, 'Nginx upstream differs')
    result = {'runtimeProof': 'PASS', 'url': 'https://timeline.all-too-well.com', 'hostname': 'timeline.all-too-well.com',
              **release.current(), 'database': cutover.DATABASE, 'deploymentTime': proof['completedAt'],
              'targetCheckoutHead': TARGET['commit'], 'nginxUpstreams': {'api': '127.0.0.1:3001', 'web': '127.0.0.1:3000'},
              'publicUpstreamHealth': 'PASS', 'exactDomainBrowserAcceptance': 'PENDING',
              'productOwnerAcceptance': 'AWAITING_PRODUCT_OWNER_CONFIRMATION', 'databaseRestored': False}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
