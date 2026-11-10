"""Candidate for one same-owner maintenance event. No standalone execution entry.

The reviewed outer controller must load exact pinned scanner/resource modules,
configure the immutable original scanner, and supply a fresh pinned binding.
A loaded result is deliberately separate from final real-client acceptance.
"""
import datetime as dt
import fcntl
from contextlib import contextmanager
import hashlib
import os
from pathlib import Path
import re
import socket
import stat
import time

NAMES = ('main.cvd', 'daily.cvd', 'bytecode.cvd')
WINDOW = 320 * 1024**2
DEADLINE = 120
CLIENT_IDENTITY = {'buildTime': '2026-11-03T04:51:08Z', 'release': 'truck-utc-json-b2e94dffdf92-r01', 'sourceCommit': 'b2e94dffdf924be0eb564148723940664028a30e', 'sourceTree': '3cc22086db440b689122fc991d9cebd6b139820c'}


def need(value, code):
    if not value:
        raise RuntimeError('CHECK_MAINTENANCE_' + code)


def projection(rows):
    need(isinstance(rows, list) and len(rows) == 3 and {r['name'] for r in rows} == set(NAMES), 'THREE_FILES')
    return {r['name']: {k: r[k] for k in ('bytes', 'sha256', 'version', 'buildEpoch')} for r in rows}


def completed_reload(suffix):
    """Official ClamAV1.4.6 server-th.c lines230..264 and359..365."""
    matches = list(re.finditer(rb'Database correctly reloaded \(([0-9]+) signatures\)', suffix))
    finished = suffix.find(b'Database reload completed.')
    need(len(matches) == 1 and int(matches[0][1]) > 0 and finished > matches[0].end(), 'NEW_RELOAD_COMPLETION')
    need(not re.search(rb'reload_th:|Database load failed|Database initialization error|Failed to spawn reload thread', suffix), 'RELOAD_ERROR')
    return int(matches[0][1])


def validate_refresh(m, reference):
    value, meta = m.read_json(Path(reference['path']), reference['sha256'], 1024**2)
    root = Path(value.get('output', ''))
    need(root.parent == m.HOME and re.fullmatch(r'offline-signatures-[a-z0-9-]{1,48}', root.name) and
         reference['path'] == str(root / 'result.json'), 'REFRESH_PATH')
    need(value.get('kind') == 'OFFICIAL_CVD_REFRESH_ONCE_V1' and
         value.get('status') == 'OFFICIAL_SIGNATURE_REFRESH_VERIFIED_SCANNER_NOT_STARTED' and
         value.get('bootId') == m.BOOT and value.get('identity') == m.IDENTITY and
         value.get('maximumAttempts') == 1 and value.get('signatureMaxAgeHours') == 48 and
         value.get('officialMirror') == 'database.clamav.net' and value.get('tlsVerificationDisabled') is False and
         value.get('servicesStarted') is False and value.get('oldSignatureFilesChanged') is False, 'REFRESH_SUCCESS')
    commands = value.get('commands', [])
    need(len(commands) == 4 and {r.get('name') for r in commands} ==
         {'freshclam-once', 'verify-main', 'verify-daily', 'verify-bytecode'} and
         all(r.get('exitCode') == 0 and r.get('cleanup', {}).get('exited') is True and
             r['cleanup'].get('remainingOwners') == [] and r.get('forceKill') is False for r in commands), 'FOUR_VERIFIED_COMMANDS')
    rows = value['signatures']; projection(rows)
    selected = []
    for row in rows:
        source = root / 'db' / row['name']
        need(row['path'] == str(source), 'REFRESH_FILE_PATH')
        actual = m.file_info(source, 128*1024**2, 0o600)
        header = m.cvd_header(source)
        need(all(actual[k] == row[k] for k in ('bytes', 'sha256')) and
             all(header[k] == row[k] for k in ('version', 'buildEpoch')) and
             0 < header['requiredFunctionalityLevel'] <= 216, 'REFRESH_BYTES_HEADER')
        log = next(r['log'] for r in commands if r['name'] == 'verify-' + row['name'][:-4])
        need(log['path'] == str(root / 'logs' / ('verify-' + row['name'][:-4] + '.log')), 'REFRESH_VERIFY_PATH')
        checked = m.file_info(Path(log['path']), 1024**2, 0o600)
        need(all(checked[k] == log[k] for k in ('bytes', 'sha256')), 'REFRESH_VERIFY_LOG')
        selected.append({**actual, **header, 'name': row['name']})
    daily = next(r for r in selected if r['name'] == 'daily.cvd')
    need(0 <= time.time() - daily['buildEpoch'] <= 172800, 'DAILY_AGE')
    need(sum(r['bytes'] for r in selected) <= 192*1024**2, 'NEW_SET_BYTES')
    return selected, meta


def old_set(m, start, import_ref):
    imported, meta = m.read_json(m.DB / 'IMPORT-RECEIPT.json', import_ref['sha256'], 1024**2)
    need(import_ref['path'] == str(m.DB / 'IMPORT-RECEIPT.json') and
         start['importReceiptSha256'] == import_ref['sha256'] and
         imported.get('status') == 'OFFLINE_SIGNATURE_IMPORT_VERIFIED_SCANNER_NOT_STARTED' and
         imported.get('identity') == m.IDENTITY and imported.get('currentBootId') == m.BOOT and
         imported.get('target') == str(m.DB) and imported.get('targetBindingSha256') == m.PIN_SHA and
         imported.get('preparationSha256') == m.PREP_SHA and imported.get('configSha256') == m.CONFIG_SHA and
         imported.get('manifestSha256') == m.BASE_MANIFEST_SHA and imported.get('networkUsed') is False and
         imported.get('freshclamExecuted') is False and imported.get('clamdStarted') is False and
         imported.get('sourceKind') == 'OFFICIAL_CVD_LOCAL_SOURCES_V1' and
         imported.get('signatureMaterialManifest') == start['packageBinding'].get('signatureMaterialManifest'), 'ORIGINAL_IMPORT')
    need(projection(imported['signatures']) == projection(start['runtime']['signatures']), 'ORIGINAL_START_SET')
    expected = {'IMPORT-RECEIPT.json'} | set(NAMES) | {n[:-4] + '-verify.log' for n in NAMES}
    need({p.name for p in m.DB.iterdir()} == expected, 'OLD_DIRECTORY_SET')
    files = []
    for row in imported['signatures']:
        actual = m.file_info(m.DB / row['name'], 128*1024**2, 0o600)
        need(all(actual[k] == row[k] for k in ('bytes', 'sha256')) and row.get('sigtoolExitCode') == 0, 'OLD_CVD')
        header = m.cvd_header(m.DB / row['name'])
        need(all(header[k] == row[k] for k in header), 'OLD_HEADER')
        log = m.file_info(m.DB / (row['name'][:-4] + '-verify.log'), 1024**2, 0o600)
        need(log['sha256'] == row['verificationLogSha256'], 'OLD_VERIFY_LOG')
        files.extend((actual, log))
    files.append(meta)
    # Expiry remains recorded in the historical receipt. This proves backup
    # identity only and never establishes readiness for the old database.
    return files


def live(m, start, protected_reference=None):
    owner = start['process']
    need(m.owner_matches(owner), 'OWNER')
    m.fixed_owners()
    if protected_reference is not None:
        protected_owners(m, protected_reference)
    need(m.config_check() == start['runtime']['config'], 'CONFIG_UNCHANGED')
    lines = m.CONFIG.read_text().splitlines()
    need('SelfCheck 0' in lines and 'ConcurrentDatabaseReload no' in lines and
         'OfficialDatabaseOnly yes' in lines and 'BytecodeSecurity TrustSigned' in lines, 'RELOAD_CONFIG')
    listeners = m.listeners()
    need(len(listeners) == 1 and listeners[0] == start['runtime']['listener'] and
         listeners[0]['addressHex'] == '0100007F', 'LISTENER')
    links = []
    for fd in (Path('/proc') / str(owner['pid']) / 'fd').iterdir():
        try:
            links.append(os.readlink(fd))
        except FileNotFoundError:
            pass
        need(len(links) <= 4096, 'FD_BOUND')
    need('socket:[' + listeners[0]['inode'] + ']' in links and m.owner_matches(owner), 'SOCKET_OWNER')


def syncdir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def copy_exact(m, source, destination, pin, guard):
    before = m.file_info(source, 128*1024**2, 0o600)
    need(all(before[k] == pin[k] for k in ('bytes', 'sha256')), 'COPY_SOURCE')
    stamp = source.stat()
    signature = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        need(signature(os.fstat(fd)) == signature(stamp), 'COPY_OPEN')
        with destination.open('xb') as output:
            total = 0
            while True:
                raw = os.read(fd, 1024**2)
                if not raw:
                    break
                total += len(raw); need(total <= pin['bytes'], 'COPY_BOUND')
                output.write(raw); guard()
            output.flush(); os.fsync(output.fileno())
        need(signature(os.fstat(fd)) == signature(source.stat()) == signature(stamp), 'COPY_SOURCE_CHANGED')
    finally:
        os.close(fd)
    syncdir(destination.parent)
    need(total == pin['bytes'] and all(m.file_info(destination, 128*1024**2, 0o600)[k] == pin[k]
         for k in ('bytes', 'sha256')), 'COPY_READBACK')


def event_resources(m, root):
    m.resources()
    total = 0; pending = [root]; count = 0
    while pending:
        path = pending.pop(); s = path.lstat(); count += 1
        need(count <= 128 and s.st_uid == 1100 and not s.st_mode & 0o022 and
             (stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode)) and
             (stat.S_ISDIR(s.st_mode) or s.st_nlink == 1), 'EVENT_FILE_BOUND')
        total += s.st_blocks*512
        if stat.S_ISDIR(s.st_mode):
            pending.extend(path.iterdir())
    need(total <= WINDOW and m.shutil.disk_usage(m.HOME).free >= 1024**3, 'EVENT_RESOURCE_BOUND')
    return total


def reload_once(m, root, start, protected_reference):
    live(m, start, protected_reference)
    m.write_new(root / 'reload-attempt.json', {'kind': 'SINGLE_RELOAD_ATTEMPT', 'at': m.now(),
                'owner': start['process'], 'retryAllowed': False})
    syncdir(root)
    with socket.create_connection(('127.0.0.1', 3310), timeout=2) as sock:
        sock.settimeout(3); sock.sendall(b'zRELOAD\0')
        reply = b''
        while b'\0' not in reply:
            chunk = sock.recv(128)
            if not chunk:
                break
            reply += chunk; need(len(reply) <= 128, 'RELOAD_ACK_BOUND')
    need(reply.rstrip(b'\0\r\n') == b'RELOADING', 'RELOAD_ACK')
    return {'ack': 'RELOADING', 'ackIsCompletion': False, 'attempts': 1}


def reload_log(m, before, inode):
    current = m.log_snapshot(m.DAEMON_LOG)
    st = m.DAEMON_LOG.stat()
    need((st.st_dev, st.st_ino) == inode and current['prefixBytes'] >= before['prefixBytes'], 'LOG_ROTATED_OR_TRUNCATED')
    with m.DAEMON_LOG.open('rb') as stream:
        prefix = stream.read(before['prefixBytes'])
        suffix = stream.read(current['prefixBytes'] - before['prefixBytes'])
    need(hashlib.sha256(prefix).hexdigest() == before['prefixSha256'] and
         hashlib.sha256(prefix + suffix).hexdigest() == current['prefixSha256'], 'LOG_PREFIX_CHANGED')
    return suffix, current


def execute_locked(m, resource_module, binding, index):
    """Configured m must use fresh official rows for package() signature entries.

    Binding references and this module are externally pinned by the controller.
    The current patch does not add a CLI or assume deployment has occurred.
    """
    os.umask(0o077)
    need(os.getuid() == os.getgid() == 1100 and
         Path('/proc/sys/kernel/random/boot_id').read_text().strip() == m.BOOT, 'EXECUTION_OWNER_BOOT')
    root = Path(binding['output'])
    need(root.parent == m.HOME and re.fullmatch(r'scanner-maintenance-[a-z0-9-]{1,48}', root.name) and
         not root.exists() and not root.is_symlink(), 'EXCLUSIVE_EVENT')
    start, start_meta = m.started(m.SCANNER_RUN, binding['start']['sha256'])
    need(start_meta['path'] == binding['start']['path'], 'START_REFERENCE')
    old = old_set(m, start, binding['import'])
    rows, refresh_meta = validate_refresh(m, binding['refresh'])
    need(all(all(index.get('scanner/signatures/' + row['name'], {}).get(k) == row[k]
                 for k in ('bytes', 'sha256', 'version', 'buildEpoch')) for row in rows), 'CURRENT_PACKAGE_INDEX')
    live(m, start, binding['protectedRuntime'])
    resource_module.budget({'budgetPolicy': binding['budgetPolicy']}, binding['budget'],
                           approved_limit=binding['approvedHostLimitBytes'], additional_bytes=WINDOW)
    need(m.shutil.disk_usage(m.HOME).free >= 1024**3 + WINDOW, 'GUEST_WINDOW')
    root.mkdir(mode=0o700)
    report = {'kind': 'SAME_PROCESS_OFFICIAL_SIGNATURE_MAINTENANCE_V1', 'status': 'FAILED_PRESERVED',
              'identity': m.IDENTITY, 'currentBootId': m.BOOT, 'process': start['process'],
              'originalStart': {k: start_meta[k] for k in ('path', 'sha256')}, 'originalImport': binding['import'], 'officialRefresh': refresh_meta,
              'target': str(m.DB), 'config': start['runtime']['config'], 'startedAt': m.now(),
              'protectedRuntime': binding['protectedRuntime'],
              'oldFilesPreserved': True, 'automaticRollback': False, 'serviceStopOrStart': False,
              'clientAcceptance': 'PENDING', 'steps': []}
    try:
        for name in ('old', 'staged'):
            (root / name).mkdir(mode=0o700)
        guard = lambda: (live(m, start, binding['protectedRuntime']), event_resources(m, root))
        for row in old + [start_meta]:
            copy_exact(m, Path(row['path']), root / 'old' / Path(row['path']).name, row, guard)
        report['backupFiles'] = [m.file_info(p, 128*1024**2, 0o600) for p in sorted((root / 'old').iterdir())]
        report['steps'].append('COMPLETE_OLD_SET_AND_START_BACKED_UP')
        for row in rows:
            copy_exact(m, Path(row['path']), root / 'staged' / row['name'], row, guard)
        report['steps'].append('THREE_NEW_FILES_STAGED_AND_READ_BACK')
        m.write_new(root / 'prepared.json', report); syncdir(root)
        need(old_set(m, start, binding['import']) == old, 'OLD_SET_CHANGED_BEFORE_PUBLICATION')
        publish_staged(m, root, rows, old, guard, report)
        before = m.log_snapshot(m.DAEMON_LOG); st = m.DAEMON_LOG.stat()
        report['logBefore'] = before
        report['reload'] = reload_once(m, root, start, binding['protectedRuntime'])
        deadline = time.monotonic() + DEADLINE
        while True:
            guard(); suffix, after = reload_log(m, before, (st.st_dev, st.st_ino))
            if b'Database reload completed.' in suffix:
                count = completed_reload(suffix)
                break
            need(time.monotonic() < deadline, 'RELOAD_COMPLETION_TIMEOUT')
            time.sleep(.1)
        active_rows = [{**r, 'path': str(m.DB / r['name'])} for r in rows]
        report['runtime'] = m.runtime_readback(start['process'], active_rows, index)
        report['reload'].update(loadedSignatures=count, daemonLogAfter=after,
                                oldPrefixBytes=before['prefixBytes'], suffixSha256=hashlib.sha256(suffix).hexdigest())
        report['signatures'] = active_rows
        report['status'] = 'SAME_PROCESS_RELOAD_READBACK_VERIFIED_CLIENT_PENDING'
        live(m, start, binding['protectedRuntime']); event_resources(m, root)
    except BaseException as error:
        report['errorCode'] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        raise
    finally:
        report['finishedAt'] = m.now()
        m.write_new(root / 'reload-result.json', report); syncdir(root)
    return report


def client_acceptance(loaded, client, start_reference, now_epoch):
    """Pure final-contract check, shared by final publication and V4 reader."""
    need(loaded.get('kind') == 'SAME_PROCESS_OFFICIAL_SIGNATURE_MAINTENANCE_V1' and
         loaded.get('status') == 'SAME_PROCESS_RELOAD_READBACK_VERIFIED_CLIENT_PENDING' and
         loaded.get('originalStart') == start_reference and loaded.get('oldFilesPreserved') is True and
         loaded.get('automaticRollback') is False and loaded.get('serviceStopOrStart') is False,
         'ACTUAL_RELOAD_RESULT')
    need(loaded['reload'].get('attempts') == 1 and loaded['reload'].get('ack') == 'RELOADING' and
         loaded['reload'].get('ackIsCompletion') is False and
         type(loaded['reload'].get('loadedSignatures')) is int and loaded['reload']['loadedSignatures'] > 0 and
         re.fullmatch('[a-f0-9]{64}', loaded['reload'].get('suffixSha256', '')) is not None,
         'RELOAD_EVIDENCE')
    need(projection(loaded['runtime']['signatures']) == projection(loaded['signatures']) and
         loaded['runtime'].get('ping') == 'PONG', 'LOADED_SET')
    daily = next(r for r in loaded['signatures'] if r['name'] == 'daily.cvd')
    need(0 <= now_epoch - daily['buildEpoch'] <= 172800, 'CURRENT_DAILY_AGE')
    need(client.get('status') == 'TWOCASE_REAL_CLIENT_PASS' and
         client.get('identity') == client.get('compiledIdentity') == CLIENT_IDENTITY and
         client.get('currentBootId') == loaded['currentBootId'] and
         client.get('scannerStartReceipt') == start_reference and
         client.get('scannerProcess') == loaded['process'], 'ACTUAL_CLIENT_OWNER')
    need(client.get('endpoint') == {'host':'127.0.0.1','port':3310} and
         client.get('databaseOrHttpAccess') is False and client.get('serviceControl') is False and
         client.get('signatureMaxAgeHours') == 48 and client.get('perScanTimeoutMs') == 15000 and
         client.get('overallDeadlineMs') == 60000, 'CLIENT_SCOPE')
    cases = client.get('cases', [])
    need(len(cases) == 2 and {r.get('label') for r in cases} == {'clean', 'EICAR'}, 'CLIENT_CASE_SET')
    expected = {'clean': ('CLEAN', 'CLEAN'), 'EICAR': ('REJECTED', 'MALWARE_FOUND:Eicar-Test-Signature')}
    for row in cases:
        actual = row.get('actual', {})
        need(row.get('status') == 'PASS' and (actual.get('verdict'), actual.get('resultSummary')) == expected[row['label']] and
             actual.get('engine') == 'clamav' and actual.get('engineVersion') == '1.4.6' and
             actual.get('signatureVersion') == str(daily['version']), 'CLIENT_VERDICT')
    need(client.get('loadedScanner', {}).get('signatureVersion') == str(daily['version']) and
         client['loadedScanner'].get('signatureTimestampMs') == daily['buildEpoch']*1000 and
         dt.datetime.fromisoformat(client['startedAt']) >= dt.datetime.fromisoformat(loaded['finishedAt']),
         'CLIENT_AFTER_RELOAD')
    return {'currentDailyVersion': daily['version'], 'currentDailyEpoch': daily['buildEpoch'],
            'currentProcess': loaded['process'], 'clientCases': ['clean', 'EICAR']}


def loaded_inputs(m, reference, start_reference, *, protect_runtime=True):
    loaded, meta = m.read_json(Path(reference['path']), reference['sha256'], 1024**2)
    root = Path(reference['path']).parent
    need(root.parent == m.HOME and re.fullmatch(r'scanner-maintenance-[a-z0-9-]{1,48}', root.name) and
         reference['path'] == str(root / 'reload-result.json') and loaded.get('target') == str(m.DB) and
         loaded.get('currentBootId') == m.BOOT and loaded.get('identity') == m.IDENTITY and
         loaded.get('originalStart') == start_reference, 'LOADED_REFERENCE')
    start, start_meta = m.started(m.SCANNER_RUN, start_reference['sha256'])
    need({k: start_meta[k] for k in ('path', 'sha256')} == start_reference and loaded.get('process') == start['process'] and
         loaded.get('config') == start['runtime']['config'], 'ORIGINAL_OWNER_LINEAGE')
    imported, import_meta = m.read_json(m.DB / 'IMPORT-RECEIPT.json', loaded['originalImport']['sha256'], 1024**2)
    need(all(import_meta[k] == loaded['originalImport'][k] for k in ('path', 'sha256')) and start['importReceiptSha256'] == import_meta['sha256'] and
         projection(imported['signatures']) == projection(start['runtime']['signatures']), 'RETAINED_IMPORT_LINEAGE')
    expected = set(NAMES) | {'IMPORT-RECEIPT.json', 'receipt.json'} | {n[:-4] + '-verify.log' for n in NAMES}
    backups = loaded.get('backupFiles', [])
    need(len(backups) == 8 and {Path(r['path']).name for r in backups} == expected and
         {p.name for p in (root / 'old').iterdir()} == expected, 'RETAINED_COMPLETE_BACKUP')
    for row in backups:
        path = root / 'old' / Path(row['path']).name
        need(row['path'] == str(path) and m.file_info(path, 128*1024**2, 0o600) == row, 'BACKUP_CURRENT_BYTES')
    for row in imported['signatures']:
        backup = next(r for r in backups if Path(r['path']).name == row['name'])
        need(all(backup[k] == row[k] for k in ('bytes', 'sha256')), 'BACKUP_IMPORT_IDENTITY')
    for filename, expected_meta in [('receipt.json', start_meta), ('IMPORT-RECEIPT.json', import_meta)]:
        backup = next(r for r in backups if Path(r['path']).name == filename)
        need(all(backup[k] == expected_meta[k] for k in ('bytes', 'sha256')), 'BACKUP_SOURCE_RECEIPT')
    rows, fresh_meta = validate_refresh(m, loaded['officialRefresh'])
    need(fresh_meta == loaded['officialRefresh'] and projection(rows) == projection(loaded['signatures']), 'NEW_SET_REFRESH_LINEAGE')
    active = []
    for row in rows:
        path = m.DB / row['name']
        current = m.file_info(path, 128*1024**2, 0o600)
        need(all(current[k] == row[k] for k in ('bytes', 'sha256')), 'ACTIVE_CURRENT_BYTES')
        active.append({**row, **current})
    live(m, start, loaded['protectedRuntime'] if protect_runtime else None)
    return loaded, meta, start, active


def finalize_locked(m, loaded_reference, client_reference, start_reference, index):
    loaded, loaded_meta, start, rows = loaded_inputs(m, loaded_reference, start_reference)
    root = Path(loaded_reference['path']).parent
    need(client_reference['path'] == str(root / 'client-two' / 'result.json'), 'EXACT_NEW_CLIENT_PATH')
    client, client_meta = m.read_json(Path(client_reference['path']), client_reference['sha256'], 2*1024**2)
    admission = client_acceptance(loaded, client, start_reference, time.time())
    runtime = m.runtime_readback(start['process'], rows, index)
    event_resources(m, root)
    report = {'kind': 'SAME_PROCESS_SIGNATURE_MAINTENANCE_ACCEPTANCE_V1',
              'status': 'SAME_PROCESS_MAINTENANCE_CLIENT_VERIFIED', 'identity': m.IDENTITY,
              'currentBootId': m.BOOT, 'process': start['process'], 'originalStart': start_reference,
              'originalImport': loaded['originalImport'], 'reloadResult': loaded_meta,
              'client': client_meta, 'runtime': runtime, 'admission': admission, 'finishedAt': m.now()}
    digest = m.write_new(root / 'acceptance.json', report); syncdir(root)
    return {'path': str(root / 'acceptance.json'), 'sha256': digest}


def verify_accepted(m, reference, start_reference, index):
    """Read-only consumer for current verify and handoff. It never sends RELOAD."""
    value, meta = m.read_json(Path(reference['path']), reference['sha256'], 2*1024**2)
    root = Path(reference['path']).parent
    need(reference['path'] == str(root / 'acceptance.json') and
         value.get('kind') == 'SAME_PROCESS_SIGNATURE_MAINTENANCE_ACCEPTANCE_V1' and
         value.get('status') == 'SAME_PROCESS_MAINTENANCE_CLIENT_VERIFIED' and
         value.get('identity') == m.IDENTITY and value.get('currentBootId') == m.BOOT and
         value.get('originalStart') == start_reference and
         value.get('reloadResult', {}).get('path') == str(root / 'reload-result.json') and
         value.get('client', {}).get('path') == str(root / 'client-two/result.json'), 'ACCEPTED_REFERENCE')
    # Application PIDs may change through the normal lifecycle after acceptance.
    # The scanner, signed files and shared data owners are still checked live.
    loaded, _, start, rows = loaded_inputs(m, value['reloadResult'], start_reference, protect_runtime=False)
    client, _ = m.read_json(Path(value['client']['path']), value['client']['sha256'], 2*1024**2)
    client_acceptance(loaded, client, start_reference, time.time())
    need(value.get('process') == start['process'] and value.get('originalImport') == loaded['originalImport'] and
         projection(value['runtime']['signatures']) == projection(rows), 'ACCEPTED_CURRENT_LINEAGE')
    runtime = m.runtime_readback(start['process'], rows, index)
    return {'start': start, 'runtime': runtime, 'maintenance': meta,
            'currentLocalImport': loaded['originalImport'], 'currentMaintenance': meta,
            'currentTwoCases': value['client']}


@contextmanager
def maintenance_lock(m, create=False):
    path = m.SCANNER / 'maintenance.lock'
    flags = os.O_RDWR | os.O_NOFOLLOW
    if create:flags |= os.O_CREAT
    fd = os.open(path, flags, 0o600)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
             before.st_uid == m.UID and stat.S_IMODE(before.st_mode) == 0o600 and
             before.st_size == 0, 'LOCK_METADATA')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        current = path.lstat()
        need((current.st_dev, current.st_ino) == (before.st_dev, before.st_ino), 'LOCK_REPLACED')
        yield
        current = path.lstat()
        need((current.st_dev, current.st_ino) == (before.st_dev, before.st_ino), 'LOCK_REPLACED')
    finally:
        os.close(fd)


def execute(m, resource_module, binding, index):
    with maintenance_lock(m, create=True):
        return execute_locked(m, resource_module, binding, index)


def finalize(m, loaded_reference, client_reference, start_reference, index):
    root = Path(loaded_reference['path']).parent
    need(root.parent == m.HOME and re.fullmatch(r'scanner-maintenance-[a-z0-9-]{1,48}', root.name) and
         loaded_reference['path'] == str(root / 'reload-result.json'), 'FINALIZATION_ROOT')
    with maintenance_lock(m):
        attempt = {'status': 'FAILED_PRESERVED', 'loadedResult': loaded_reference,
                   'client': client_reference, 'startedAt': m.now()}
        m.write_new(root / 'finalization-claim.json', attempt); syncdir(root)
        try:
            result = finalize_locked(m, loaded_reference, client_reference, start_reference, index)
            attempt.update(status='FINAL_ACCEPTANCE_PUBLISHED', acceptance=result)
            return result
        except BaseException as error:
            attempt['errorType'] = type(error).__name__
            raise
        finally:
            attempt['finishedAt'] = m.now()
            m.write_new(root / 'finalization-result.json', attempt); syncdir(root)


def publish_staged(m, root, rows, old, guard, report):
    for row in rows:
        guard()
        active = m.DB / row['name']
        prior = next(r for r in old if Path(r['path']).name == row['name'])
        need(m.file_info(active, 128*1024**2, 0o600) == prior, 'ACTIVE_CAS')
        staged = m.file_info(root / 'staged' / row['name'], 128*1024**2, 0o600)
        need(all(staged[k] == row[k] for k in ('bytes', 'sha256')), 'STAGED_CAS')
        os.replace(root / 'staged' / row['name'], active); syncdir(m.DB)
        need(all(m.file_info(active, 128*1024**2, 0o600)[k] == row[k] for k in ('bytes', 'sha256')), 'PUBLISHED_BYTES')
        report['steps'].append('PUBLISHED_' + row['name'])


def observe_accepted(m, reference, start_reference, index):
    """Install verifier receipt wiring, for a configured read-only observer."""
    with maintenance_lock(m):
        proof = verify_accepted(m, reference, start_reference, index)
        m.REPORT.update(runtime=proof['runtime'], startReceipt=start_reference,
                        signatureMaintenanceReceipt=proof['maintenance'],
                        signatureImportReceipt=proof['currentLocalImport'],
                        status='NEW_PREFIX_SCANNER_READBACK_VERIFIED',
                        businessScanCases='SEPARATELY_PINNED_CURRENT_TWOCASE',
                        sharedScannerStopAllowed=False)
        return proof


def protected_owners(m, reference):
    expected={'path':'/home/recovery/joint-lifecycle-3a11-r01/events/date-start-r02/result.json',
              'sha256':'d6b618b7a1d052c57182bd53974c15343f9f02cda1edd6ef04495489e8053080'}
    need(reference==expected, 'PROTECTED_LIFECYCLE_REFERENCE')
    value,_=m.read_json(Path(reference['path']),reference['sha256'],256*1024)
    need(value.get('kind')=='JOINT_APPLICATION_LIFECYCLE_RESULT_V1' and
         value.get('status')=='JOINT_LIFECYCLE_RUNNING' and value.get('bootId')==m.BOOT and
         value.get('identity')==CLIENT_IDENTITY and set(value.get('owners',{}))=={'api','web'},
         'PROTECTED_RUNTIME_SOURCE')
    for owner in [*value['owners'].values(),value['proxyOwner']]:
        need(type(owner.get('pid')) is int and owner['pid']>1 and owner.get('uid')==1100, 'PROTECTED_OWNER_FIELDS')
        actual=m.process(owner['pid'])
        need(actual is not None and actual['state']!='Z' and actual['uid']==owner['uid'] and
             str(actual['startTicks'])==str(owner['startTicks']), 'PROTECTED_OWNER_CHANGED')
        proc=Path('/proc')/str(owner['pid'])
        need(os.readlink(proc/'exe')==owner['executable'] and os.readlink(proc/'cwd')==owner['cwd'],
             'PROTECTED_PATH_CHANGED')
