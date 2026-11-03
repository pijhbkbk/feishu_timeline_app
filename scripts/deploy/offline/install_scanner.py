#!/usr/bin/env python3
"""Healthy first-start scanner entry for the fixed R30 Ubuntu ARM64 software.
External target/content bindings remain mandatory. This tool never grants authorization.
A new target uses its own successful phase receipts; historical failures are not inputs.
No VM, database, application, system-package or online signature-update control.
"""
from pathlib import Path, PurePosixPath
import datetime as dt
import hashlib
import json
import os
import platform
import re
import resource
import shutil
import signal
import socket
import stat
import struct
import subprocess
import sys
import time
import types

HOME = Path('/home/recovery')
HERE = Path(__file__).resolve().parent
DATA_PATHS = {'/usr/lib/locale/C.utf8/LC_CTYPE': 'r--p',
              '/usr/lib/aarch64-linux-gnu/gconv/gconv-modules.cache': 'r--s'}
BASE_ARCHIVE_SHA = '594c92b6131ee17290a538b02bbcfd2067521586645a40e7b9f9b370707eb7e3'
BASE_MANIFEST_SHA = 'bd455649df2020d19e9ee31a197a5b8a1fdb9867b6c85b25d2f4d4fda04c5b31'
UID = 1100
IDENTITY = {'sourceCommit': '3941beccddd0dfce94c8f0f7fd7d62819fb05270',
            'sourceTree': 'db699c2e128e9c40d677de2ccca0788d8ffccdb9',
            'release': 'truck-recovery-r30-3941beccddd0', 'buildTime': '2026-10-26T12:28:07Z'}
BUILD_SHA = 'f86dcfe9ba96fa9c9f48cfc70a1f802245bd2b5b8dfbd318f0844220f6ae1762'
MAX_LOG = 16 * 1024**2
DAEMON_MAX_FILE = 128 * 1024**2
MAX_AGE = 48 * 3600
LOADER = Path('/usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1')
LOADER_SHA = '390027e5f45f236bd1838bc54bf464c5ff01d260ab9f8b415ea8276641bce505'
APP_MANIFEST_SHA = 'c6b3f29ca19eca0111e1127d1c4e07e1f4d8d2b142893ef8f0a1ca15056db8a2'
FLOOR = 1024**3
HOST_CAP = 24*1024**3
WINDOW_BYTES = 320*1024**2
TMP_WINDOW_BYTES = 192*1024**2
CVD_PINS = {
    'main.cvd': {'bytes': 89072577, 'sha256': '0b2182d229f46981ec8f535382222f7c9dfdd656b250ad47988b910a8d302365'},
    'daily.cvd': {'bytes': 23443876, 'sha256': 'bbbe24cfe66a9e00bdba3f78d47b36700ac29114f38f2ff5aebec504f5c733e6'},
    'bytecode.cvd': {'bytes': 281702, 'sha256': '6d4aa01f219e988060fc419f495d07f27e0cdf1a2cccc065971da922c76f7ffb'},
}

SOFTWARE = SOURCE_SOFTWARE = DEBS = OFFLINE = PRIVATE = SCANNER = LOGS = EVENTS = DB = None
CONFIG = DAEMON_LOG = PIDFILE = EXE = LIB = NATIVE_RESULT = None
PIN = HERE / 'target-binding.json'
JOINT = HERE / 'scanner-manifest.json'
JOINT_SHA = PIN_SHA = PREP_SHA = BUDGET_SHA = DATA_BASELINE_SHA = None
APP_RECEIPT_SHA = RUNTIME_RECEIPT_SHA = RUNTIME_MANIFEST_SHA = DEBS_RECEIPT_SHA = NATIVE_SHA = None
BOOT = SCANNER_RUN = CONFIG_SHA = CONFIG_TEXT = LIBRARY_PATH = None
TARGET_BINDING = {}
DATA_ROWS = {}; NATIVE_LIBRARIES = {}; CURRENT_INDEX = {}; DATA_OWNERS = {}; PREVIOUS_OWNERS = {}
BASE_LIBRARY_UPDATES = {}
BASE_UPDATE_VERIFIER_SHA = '6efd9402e40d859fc0fa3be2aa6e6f3e3e2e549ef9c0be855f207e6a069edb6e'
OUT = None; REPORT = {}
RUNTIME_ENTRIES_SHA = '69d9a25cd9fac988f50fcc5f65c554e65829409ba903e9b705eb7d8d4d5782a1'
# Frozen 3941 application manifest pins Next 15.5.28; Next rewrites its process title.
WEB_PROCESS_TITLE = 'next-server (v15.5.28)'
CONFIG_TEMPLATE = 'Foreground yes\nUser recovery\nDatabaseDirectory {database}\nTemporaryDirectory {temporary}\nLogFile {log}\nLogTime yes\nLogFileMaxSize 4M\nLogClean no\nPidFile {pid}\nTCPSocket 3310\nTCPAddr 127.0.0.1\nMaxThreads 1\nMaxConnectionQueueLength 4\nMaxQueue 8\nReadTimeout 10\nCommandReadTimeout 10\nSendBufTimeout 5000\nIdleTimeout 30\nStreamMaxLength 21M\nMaxFileSize 20M\nMaxScanSize 100M\nMaxRecursion 10\nMaxFiles 1000\nAlertExceedsMax yes\nBytecodeSecurity TrustSigned\nSelfCheck 0\nConcurrentDatabaseReload no\nMaxScanTime 10000\nOfficialDatabaseOnly yes\n'


def need(value, code):
    if not value:
        raise RuntimeError('CHECK_' + code)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(path):
    path = Path(path)
    need(path.is_absolute(), 'ABSOLUTE_PATH')
    for item in [path, *path.parents]:
        need(not item.is_symlink(), 'SYMLINK_COMPONENT')
    need(path.resolve(strict=True) == path, 'CANONICAL_PATH')
    return path


def directory(path, private=True):
    canonical(path)
    s = path.stat()
    need(stat.S_ISDIR(s.st_mode) and s.st_uid == UID and not s.st_mode & 0o022,
         'OWNED_DIRECTORY')
    if private:
        need(stat.S_IMODE(s.st_mode) == 0o700, 'PRIVATE_DIRECTORY')


def file_info(path, limit=256*1024**2, mode=None, owner=UID, single_link=True):
    canonical(path)
    before = path.stat()
    need(stat.S_ISREG(before.st_mode) and (before.st_nlink == 1 or not single_link) and
         before.st_uid == owner and not before.st_mode & 0o022 and before.st_size <= limit,
         'BOUNDED_OWNED_FILE')
    if mode is not None:
        need(stat.S_IMODE(before.st_mode) == mode, 'FILE_MODE')
    h = hashlib.sha256()
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as f:
        opened = os.fstat(f.fileno())
        need((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino), 'OPEN_CHANGED')
        total = 0
        for chunk in iter(lambda: f.read(1024*1024), b''):
            total += len(chunk)
            need(total <= limit, 'FILE_GREW')
            h.update(chunk)
        after = os.fstat(f.fileno())
    need(total == before.st_size and (after.st_size, after.st_mtime_ns, after.st_ctime_ns) ==
         (before.st_size, before.st_mtime_ns, before.st_ctime_ns), 'READ_CHANGED')
    return {'path': str(path), 'bytes': total, 'sha256': h.hexdigest()}


def read_json(path, expected=None, limit=2*1024**2, mode=None):
    info = file_info(path, limit, mode)
    need(expected is None or info['sha256'] == expected, 'RECEIPT_HASH')
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        raw = stream.read(limit+1)
    need(len(raw) <= limit and sha(raw) == info['sha256'], 'READ_CHANGED')
    return json.loads(raw), info


def log_snapshot(path):
    # A live daemon may append; hash a bounded prefix without claiming quiescence.
    canonical(path)
    before = path.stat()
    need(stat.S_ISREG(before.st_mode) and before.st_uid == UID and before.st_nlink == 1 and
         stat.S_IMODE(before.st_mode) == 0o600 and before.st_size <= MAX_LOG, 'PRIVATE_LOG_BOUND')
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        opened = os.fstat(stream.fileno())
        need((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino), 'LOG_OPEN_CHANGED')
        raw = stream.read(before.st_size)
        after = os.fstat(stream.fileno())
    need(len(raw) == before.st_size and before.st_size <= after.st_size <= MAX_LOG, 'LOG_SIZE_BOUND')
    return {'path': str(path), 'prefixBytes': len(raw), 'prefixSha256': sha(raw),
            'observedBytesAfterRead': after.st_size, 'rawLogRetainedPrivate': True}


def write_new(path, value):
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    need(len(raw) <= 2*1024**2, 'RECEIPT_BOUND')
    with path.open('xb') as f:
        f.write(raw)
        f.flush()
        os.fsync(f.fileno())
    return sha(raw)


def token(value):
    need(isinstance(value, str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{0,47}', value), 'EVENT_NAME')
    return value


def digest(value):
    need(isinstance(value, str) and re.fullmatch(r'[a-f0-9]{64}', value), 'EXTERNAL_SHA256')
    return value


def target_path(value, direct=False):
    need(isinstance(value, str) and len(value) <= 1024, 'TARGET_PATH_TEXT')
    path = Path(value)
    need(str(path) == value and path.is_relative_to(HOME) and path != HOME and
         '..' not in path.parts and all(re.fullmatch(r'[A-Za-z0-9_.-]+', x) for x in path.parts[3:]),
         'TARGET_PATH_SCOPE')
    if direct: need(path.parent == HOME and len(path.name) <= 96, 'DIRECT_TARGET_REQUIRED')
    return path


def receipt_pin(value):
    need(isinstance(value, dict) and set(value) == {'path', 'sha256'}, 'RECEIPT_PIN_FIELDS')
    target_path(value['path']); digest(value['sha256'])
    return value


def validate_target(value):
    required = {'kind', 'identity', 'currentBootId', 'paths', 'run', 'applicationAssemblySha256',
                'runtimeAssemblySha256', 'runtimeManifestSha256', 'nativeReceipt', 'dependencyReceipt',
                'dataServices', 'predecessor', 'dataBaselineSha256', 'dataSourceMetadataSha256',
                'dataSourceOriginSha256', 'budgetPolicySha256'}
    if isinstance(value, dict) and value.get('kind') in ('OFFLINE_SCANNER_TARGET_V2','OFFLINE_SCANNER_TARGET_V3'):
        source_key = 'signatureMaterialManifest' if value['kind']=='OFFLINE_SCANNER_TARGET_V3' else 'signatureRefreshReceipt'
        required |= {'historicalEvidenceBootId', source_key}
        need(re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', value.get('historicalEvidenceBootId','')) is not None, 'HISTORICAL_BOOT_FORMAT')
        receipt_pin(value.get(source_key))
    if isinstance(value, dict) and value.get('kind') == 'OFFLINE_SCANNER_TARGET_V3' and (
            'baseUpdate' in value or 'baseUpdateVerifier' in value):
        required |= {'baseUpdate', 'baseUpdateVerifier'}
        verifier = receipt_pin(value.get('baseUpdateVerifier'))
        need(verifier == {'path': str(HERE/'prepare_instance.py'), 'sha256': BASE_UPDATE_VERIFIER_SHA},
             'EXACT_BASE_UPDATE_VERIFIER')
        refs = value.get('baseUpdate')
        need(isinstance(refs, dict) and set(refs) == {'result', 'metadata', 'analysis'}, 'BASE_UPDATE_REFS')
        for ref in refs.values():
            need(isinstance(ref, dict) and set(ref) == {'path', 'sha256', 'bytes'} and
                 type(ref['bytes']) is int and 0 < ref['bytes'] <= 128*1024, 'BASE_UPDATE_REF_FIELDS')
            receipt_pin({k: ref[k] for k in ('path', 'sha256')})
    need(isinstance(value, dict) and set(value) == required and value['kind'] in ('OFFLINE_SCANNER_TARGET_V1','OFFLINE_SCANNER_TARGET_V2','OFFLINE_SCANNER_TARGET_V3')
         and value['identity'] == IDENTITY, 'TARGET_BINDING_SCHEMA')
    need(isinstance(value['currentBootId'], str) and
         re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', value['currentBootId']), 'BOOT_FORMAT')
    paths = value['paths']; need(isinstance(paths, dict) and set(paths) ==
         {'input', 'software', 'sourceSoftware', 'dependencies', 'scanner'}, 'TARGET_PATH_KEYS')
    parsed = {key: target_path(path, True) for key, path in paths.items()}
    need(len(set(parsed.values())) == len(parsed) and parsed['input'] == HERE, 'TARGET_PATH_COLLISION')
    token(value['run'])
    for key in ('applicationAssemblySha256', 'runtimeAssemblySha256', 'runtimeManifestSha256',
                'dataBaselineSha256', 'dataSourceMetadataSha256', 'dataSourceOriginSha256', 'budgetPolicySha256'):
        digest(value[key])
    receipt_pin(value['nativeReceipt']); receipt_pin(value['dependencyReceipt'])
    need(isinstance(value['dataServices'], dict) and set(value['dataServices']) == {'pg', 'redis'}, 'DATA_SERVICE_SET')
    for row in value['dataServices'].values():
        need(isinstance(row, dict) and set(row) == {'receipt', 'owner'}, 'DATA_SERVICE_FIELDS')
        receipt_pin(row['receipt']); validate_owner(row['owner'])
    prior = value['predecessor']; need(isinstance(prior, dict), 'PREDECESSOR')
    if prior.get('mode') == 'absent': need(set(prior) == {'mode'}, 'ABSENT_PREDECESSOR_FIELDS')
    else:
        need(set(prior) == {'mode', 'owners', 'applicationStop', 'scannerStop', 'beforeStopObservation'} and
             prior['mode'] == 'own-normal-stop' and set(prior['owners']) == {'api', 'web', 'proxy', 'scanner'},
             'NORMAL_STOP_PREDECESSOR_FIELDS')
        receipt_pin(prior['applicationStop']); receipt_pin(prior['scannerStop'])
        receipt_pin(prior['beforeStopObservation'])
        for row in prior['owners'].values(): validate_owner(row)
    return parsed


def historical_boot():
    return TARGET_BINDING.get('historicalEvidenceBootId', BOOT)


def signature_reference_key():
    return 'signatureMaterialManifest' if TARGET_BINDING['kind']=='OFFLINE_SCANNER_TARGET_V3' else 'signatureRefreshReceipt'


def cvd_header(path):
    canonical(path);before=path.stat()
    need(stat.S_ISREG(before.st_mode) and before.st_uid==UID and before.st_nlink==1 and
         not before.st_mode & 0o022 and 512<before.st_size<=128*1024**2,'CVD_HEADER_FILE')
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW),'rb') as stream:
        opened=os.fstat(stream.fileno())
        need((opened.st_dev,opened.st_ino)==(before.st_dev,before.st_ino),'CVD_HEADER_OPEN_CHANGED')
        fields=stream.read(512).decode('ascii').rstrip(' \x00\r\n').split(':')
        after=os.fstat(stream.fileno())
    need((after.st_size,after.st_mtime_ns,after.st_ctime_ns)==
         (before.st_size,before.st_mtime_ns,before.st_ctime_ns),'CVD_HEADER_READ_CHANGED')
    need(len(fields)==9 and fields[0]=='ClamAV-VDB','CVD_HEADER')
    values={key:int(fields[index]) for key,index in
            (('version',2),('signatures',3),('requiredFunctionalityLevel',4),('buildEpoch',8))}
    need(all(value>0 for value in values.values()),'CVD_HEADER_VALUES')
    return values


def local_signature_sources():
    """Declare existing official files; only import_signatures can verify the new set.

    This branch never runs FreshClam or rewrites its failed receipt. The ordinary
    import still verifies all three original files, copies them, and reads back
    the exact set before the scanner may load it.
    """
    pin=TARGET_BINDING['signatureMaterialManifest']
    value,meta=read_json(Path(pin['path']),pin['sha256'],65536)
    need(set(value)=={'kind','status','identity','bootId','historicalRefresh','failedDownload',
                      'files','bytecodeRemoteVersion'} and
         value['kind']=='OFFICIAL_CVD_LOCAL_SOURCES_V1' and
         value['status']=='SOURCES_DECLARED_NOT_VERIFIED' and value['identity']==IDENTITY and
         value['bootId']==BOOT and value['bytecodeRemoteVersion'] is None,'LOCAL_CVD_SOURCE_MANIFEST')
    for key in ('historicalRefresh','failedDownload'):receipt_pin(value[key])
    old,_=read_json(Path(value['historicalRefresh']['path']),value['historicalRefresh']['sha256'],65536)
    failed,_=read_json(Path(value['failedDownload']['path']),value['failedDownload']['sha256'],65536)
    roots={}
    for key,record in (('historicalRefresh',old),('failedDownload',failed)):
        root=target_path(record.get('output'),True);roots[key]=root
        need(root.name.startswith('offline-signatures-') and
             value[key]['path']==str(root/'result.json') and
             record.get('kind')=='OFFICIAL_CVD_REFRESH_ONCE_V1' and record.get('identity')==IDENTITY and
             record.get('officialMirror')=='database.clamav.net' and record.get('maximumAttempts')==1 and
             record.get('tlsVerificationDisabled') is False and record.get('servicesStarted') is False and
             record.get('oldSignatureFilesChanged') is False and record.get('signatureMaxAgeHours')==48,
             'LOCAL_CVD_OFFICIAL_ORIGIN')
    commands=old.get('commands',[])
    need(old.get('status')=='OFFICIAL_SIGNATURE_REFRESH_VERIFIED_SCANNER_NOT_STARTED' and
         len(commands)==4 and {r.get('name') for r in commands}==
         {'freshclam-once','verify-main','verify-daily','verify-bytecode'} and
         all(r.get('exitCode')==0 and r.get('cleanup',{}).get('exited') is True and
             r.get('forceKill') is False for r in commands),'LOCAL_CVD_PRIOR_COMPLETE_SUCCESS')
    previous=old.get('signatures',[])
    need(len(previous)==3 and {r.get('name') for r in previous}==set(CVD_PINS),'LOCAL_CVD_PRIOR_SET')
    commands=failed.get('commands',[])
    need(failed.get('status')=='FAILED_PRESERVED' and failed.get('bootId')==BOOT and
         failed.get('errorCode')=='CHECK_UPDATE_COMMAND_FAILED' and len(commands)==1 and
         commands[0].get('name')=='freshclam-once' and commands[0].get('exitCode')==5 and
         commands[0].get('cleanup',{}).get('exited') is True and
         commands[0]['cleanup'].get('remainingOwners')==[] and commands[0].get('forceKill') is False,
         'LOCAL_CVD_FAILED_DOWNLOAD_PRESERVED')
    log=commands[0]['log'];log_path=roots['failedDownload']/'logs/freshclam-once.log'
    need(log.get('path')==str(log_path) and 0<log.get('bytes',0)<=1024**2,'LOCAL_CVD_DOWNLOAD_LOG')
    info=file_info(log_path,1024**2,0o600)
    need(all(info[k]==log[k] for k in ('bytes','sha256')),'LOCAL_CVD_DOWNLOAD_LOG_PIN')
    raw=log_path.read_bytes()  # Private verbose text is never returned or printed.
    need(len(raw)==info['bytes'] and sha(raw)==info['sha256'],'LOCAL_CVD_LOG_READ_CHANGED')
    main_versions=re.findall(rb'^query_remote_database_version: main\.cvd version from DNS: ([0-9]+)$',raw,re.M)
    daily_versions=re.findall(rb'^daily\.cvd updated \(version: ([0-9]+), sigs: ([0-9]+),',raw,re.M)
    need(len(main_versions)==len(daily_versions)==1 and b'Database test passed.' in raw and
         b'Transferred a partial file' in raw,'LOCAL_CVD_OBSERVED_COMPONENT_VERSIONS')
    rows=value['files'];need(isinstance(rows,list) and len(rows)==3 and
         {r.get('name') for r in rows}==set(CVD_PINS),'LOCAL_CVD_EXACT_SOURCES')
    selected={};sources={}
    for row in rows:
        name=row['name']
        need(set(row)=={'name','path','bytes','sha256','version','signatures','requiredFunctionalityLevel','buildEpoch'},
             'LOCAL_CVD_FILE_FIELDS')
        expected_root=roots['failedDownload'] if name=='daily.cvd' else roots['historicalRefresh']
        source=expected_root/'db'/name
        need(row['path']==str(source) and type(row['bytes']) is int and 512<row['bytes']<=128*1024**2,
             'LOCAL_CVD_FILE_ORIGIN')
        digest(row['sha256']);actual=file_info(source,128*1024**2,0o600);header=cvd_header(source)
        need(all(actual[k]==row[k] for k in ('bytes','sha256')) and
             all(type(row[k]) is int and header[k]==row[k] for k in header),'LOCAL_CVD_CURRENT_BYTES_HEADER')
        # Pinned ClamAV 1.4.6: libclamav/others.h CL_FLEVEL, returned by
        # cl_retflevel(). The native/compiled engine identity gates stay intact.
        need(header['requiredFunctionalityLevel']<=216,'LOCAL_CVD_ENGINE_FUNCTIONALITY_LEVEL')
        need(file_info(source,128*1024**2,0o600)==actual,'LOCAL_CVD_SOURCE_CHANGED')
        if name=='daily.cvd':
            need(header['version']==int(daily_versions[0][0]) and header['signatures']==int(daily_versions[0][1]) and
                 0<=time.time()-header['buildEpoch']<=MAX_AGE,'LOCAL_CVD_DAILY_APPLICABILITY')
        else:
            prior=next(r for r in previous if r['name']==name)
            need(prior.get('path')==str(source) and all(prior.get(k)==row[k] for k in
                 ('bytes','sha256','version','signatures','buildEpoch')),'LOCAL_CVD_RETAINED_OFFICIAL_BYTES')
            if name=='main.cvd':need(header['version']==int(main_versions[0]),'LOCAL_CVD_MAIN_VERSION_GAP')
        sources[name]=source;selected[name]={k:row[k] for k in row if k not in ('name','path')}
    need(sum(r['bytes'] for r in selected.values())<=192*1024**2,'LOCAL_CVD_TOTAL')
    REPORT['localSignatureSources']={'manifest':meta,'historicalRefresh':value['historicalRefresh'],
        'failedDownload':value['failedDownload'],'mainObservedRemoteVersion':int(main_versions[0]),
        'bytecodeRemoteVersion':None,'sourceFilesReadBack':True,'newSetVerified':False}
    return sources,selected,pin


def signature_sources():
    if TARGET_BINDING['kind'] == 'OFFLINE_SCANNER_TARGET_V1':
        return SOURCE_SOFTWARE/'scanner/signatures', CVD_PINS, None
    if TARGET_BINDING['kind'] == 'OFFLINE_SCANNER_TARGET_V3':
        return local_signature_sources()
    pin=TARGET_BINDING['signatureRefreshReceipt']
    value,meta=read_json(Path(pin['path']),pin['sha256'],1024**2)
    root=target_path(value.get('output'),True)
    need(root.name.startswith('offline-signatures-') and Path(pin['path'])==root/'result.json' and
         value.get('kind')=='OFFICIAL_CVD_REFRESH_ONCE_V1' and
         value.get('status')=='OFFICIAL_SIGNATURE_REFRESH_VERIFIED_SCANNER_NOT_STARTED' and
         value.get('identity')==IDENTITY and value.get('signatureMaxAgeHours')==48 and
         value.get('officialMirror')=='database.clamav.net' and value.get('maximumAttempts')==1 and
         value.get('tlsVerificationDisabled') is False and value.get('servicesStarted') is False and
         value.get('oldSignatureFilesChanged') is False, 'VERIFIED_SIGNATURE_REFRESH')
    commands=value.get('commands',[])
    need(len(commands)==4 and {r.get('name') for r in commands}=={'freshclam-once','verify-main','verify-daily','verify-bytecode'} and
         all(r.get('exitCode')==0 and r.get('cleanup',{}).get('exited') is True and r.get('forceKill') is False for r in commands), 'SIGNATURE_REFRESH_COMMANDS')
    rows=value.get('signatures',[])
    need(len(rows)==3 and {r.get('name') for r in rows}==set(CVD_PINS), 'REFRESH_EXACT_SIGNATURE_SET')
    selected={}
    for row in rows:
        name=row['name']; need(row.get('path')==str(root/'db'/name) and type(row.get('bytes')) is int and
             0<row['bytes']<=128*1024**2 and type(row.get('version')) is int and row['version']>0 and
             type(row.get('buildEpoch')) is int, 'REFRESH_SIGNATURE_FIELDS')
        digest(row.get('sha256'))
        if name=='daily.cvd':need(0<=time.time()-row['buildEpoch']<=MAX_AGE,'DAILY_EXPIRED_OR_FUTURE')
        selected[name]={k:row[k] for k in ('bytes','sha256','version','buildEpoch')}
    need(sum(r['bytes'] for r in selected.values())<=192*1024**2,'REFRESH_SIGNATURE_TOTAL')
    REPORT['signatureRefreshReceipt']=meta
    return root/'db',selected,{'path':pin['path'],'sha256':pin['sha256']}


def validate_owner(row):
    need(isinstance(row, dict) and set(row) == {'pid', 'startTicks', 'uid'} and
         type(row['pid']) is int and row['pid'] > 1 and type(row['startTicks']) is int and
         row['startTicks'] > 0 and type(row['uid']) is int and 0 < row['uid'] < 65536, 'EXACT_OWNER_FIELDS')


def configure_target(pin_sha):
    global PIN_SHA, TARGET_BINDING, SOFTWARE, SOURCE_SOFTWARE, DEBS, OFFLINE, PRIVATE, SCANNER, LOGS
    global EVENTS, DB, CONFIG, DAEMON_LOG, PIDFILE, EXE, LIB, LIBRARY_PATH, NATIVE_RESULT, NATIVE_SHA
    global APP_RECEIPT_SHA, RUNTIME_RECEIPT_SHA, RUNTIME_MANIFEST_SHA, DEBS_RECEIPT_SHA, BOOT, SCANNER_RUN
    global CONFIG_TEXT, CONFIG_SHA, DATA_BASELINE_SHA, DATA_OWNERS, PREVIOUS_OWNERS, BASE_LIBRARY_UPDATES
    BASE_LIBRARY_UPDATES = {}
    PIN_SHA = digest(pin_sha)
    value, _ = read_json(PIN, PIN_SHA, 32768, 0o600); paths = validate_target(value)
    TARGET_BINDING = value
    SOFTWARE, SOURCE_SOFTWARE, DEBS, OFFLINE = (paths[k] for k in ('software', 'sourceSoftware', 'dependencies', 'scanner'))
    PRIVATE = OFFLINE/'private'; SCANNER = OFFLINE/'scanner'; LOGS = PRIVATE/'scanner'
    EVENTS = SCANNER/'events'; DB = OFFLINE/'scanner-db'; CONFIG = SCANNER/'clamd.conf'
    DAEMON_LOG = LOGS/'clamd.log'; PIDFILE = SCANNER/'clamd.pid'
    EXE = SOFTWARE/'runtime/clamav/sbin/clamd'; LIB = SOFTWARE/'runtime/clamav/lib'
    LIBRARY_PATH = ':'.join(map(str, [LIB, DEBS/'usr/lib/aarch64-linux-gnu', DEBS/'usr/lib/postgresql/14/lib']))
    NATIVE_RESULT = Path(value['nativeReceipt']['path']); NATIVE_SHA = value['nativeReceipt']['sha256']
    APP_RECEIPT_SHA = value['applicationAssemblySha256']; RUNTIME_RECEIPT_SHA = value['runtimeAssemblySha256']
    RUNTIME_MANIFEST_SHA = value['runtimeManifestSha256']; DEBS_RECEIPT_SHA = value['dependencyReceipt']['sha256']
    BOOT = value['currentBootId']; SCANNER_RUN = value['run']; DATA_BASELINE_SHA = value['dataBaselineSha256']
    DATA_OWNERS = {key: row['owner'] for key, row in value['dataServices'].items()}
    PREVIOUS_OWNERS = value['predecessor'].get('owners', {})
    CONFIG_TEXT = CONFIG_TEMPLATE.format(database=DB, temporary=SCANNER/'tmp', log=DAEMON_LOG, pid=PIDFILE)
    CONFIG_SHA = sha(CONFIG_TEXT.encode())


def observe_predecessor(source_sha, event):
    """Read four live owners before a planned replacement; never stop a service."""
    need(sys.flags.isolated and sys.platform == 'linux' and os.getuid() == UID, 'OBSERVER_PLATFORM')
    directory(HERE)
    source, source_meta = read_json(HERE/'predecessor-source.json', digest(source_sha), 32768, 0o600)
    need(set(source) == {'kind', 'bootId', 'applicationStart', 'scannerStart'} and
         source['kind'] == 'SCANNER_REPLACEMENT_LIVE_OWNER_SOURCES', 'OBSERVER_SOURCE_SCHEMA')
    for key in ('applicationStart', 'scannerStart'): receipt_pin(source[key])
    before = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    need(before == source['bootId'], 'OBSERVER_CURRENT_BOOT')
    app, app_meta = read_json(Path(source['applicationStart']['path']), source['applicationStart']['sha256'])
    scanner, scanner_meta = read_json(Path(source['scannerStart']['path']), source['scannerStart']['sha256'])
    need(app.get('status') == 'STARTED_IDENTITY_AND_LISTENERS_VERIFIED_ONLY' and app.get('identity') == IDENTITY and
         scanner.get('status') == 'NEW_PREFIX_SCANNER_RUNNING_READBACK_VERIFIED' and scanner.get('identity') == IDENTITY and
         scanner.get('currentBootId') == before, 'OBSERVER_ACTUAL_STARTS')
    declared = dict(app.get('owners', {})); declared['scanner'] = scanner.get('process')
    need(set(declared) == {'api', 'web', 'proxy', 'scanner'}, 'OBSERVER_FOUR_ROLES')
    output = HERE/('predecessor-observed-'+token(event)+'.json')
    need(not output.exists() and not output.is_symlink(), 'OBSERVER_OUTPUT_EXISTS')
    owners = {}; details = {}
    for role, expected in declared.items():
        owner = {'pid': expected.get('pid'), 'startTicks': int(expected.get('startTicks')), 'uid': expected.get('uid')}
        validate_owner(owner); need(owner['uid'] == UID, 'OBSERVER_OWNED_UID')
        row = process(owner['pid'])
        need(row and row['state'] != 'Z' and all(row[k] == v for k, v in owner.items()), 'OBSERVER_LIVE_OWNER')
        proc = Path('/proc')/str(owner['pid'])
        executable, cwd = os.readlink(proc/'exe'), os.readlink(proc/'cwd')
        need(executable == expected.get('executable') and cwd == expected.get('cwd'), 'OBSERVER_EXE_CWD')
        with (proc/'cmdline').open('rb') as stream: raw = stream.read(32769)
        need(len(raw) <= 32768 and raw.endswith(b'\0'), 'OBSERVER_ARGV_BOUND')
        argv = [x.decode() for x in raw[:-1].split(b'\0')]
        argv_mode = observed_argv_mode(role, argv, expected, app)
        current = process(owner['pid'])
        need(current and current['state'] != 'Z' and all(current[k] == v for k, v in owner.items()), 'OBSERVER_OWNER_CHANGED')
        owners[role] = owner; details[role] = {'executable': executable, 'cwd': cwd,
                                            'argvVerified': True, 'argvMode': argv_mode}
    for role, owner in owners.items():
        row = process(owner['pid']); proc = Path('/proc')/str(owner['pid'])
        need(row and row['state'] != 'Z' and all(row[k] == v for k, v in owner.items()) and
             os.readlink(proc/'exe') == details[role]['executable'] and
             os.readlink(proc/'cwd') == details[role]['cwd'], 'OBSERVER_FINAL_OWNER_CHANGED')
    after = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    need(after == before, 'OBSERVER_BOOT_CHANGED')
    old_mask = os.umask(0o077)
    try:
        result_sha = write_new(output, {'kind': 'LIVE_PREDECESSOR_OWNERS_OBSERVED', 'at': now(),
            'bootIdBefore': before, 'bootIdAfter': after, 'owners': owners, 'details': details,
            'source': source_meta, 'applicationStart': app_meta, 'scannerStart': scanner_meta,
            'allFourLive': True, 'executableAndCwdVerified': True, 'servicesStopped': False})
    finally: os.umask(old_mask)
    print(json.dumps({'status': 'LIVE_OWNERS_OBSERVED_NOT_STOPPED', 'receipt': str(output), 'sha256': result_sha}))


def observed_argv_mode(role, argv, expected, app):
    if argv == expected.get('argv'): return 'exact-start-argv'
    artifact = target_path(app.get('artifact'))
    # Node rewrites its argv buffer and leaves its unused tail NUL-padded.
    # Accept only that exact title plus an empty tail, never another argument.
    need(role == 'web' and argv and argv[0] == WEB_PROCESS_TITLE and all(x == '' for x in argv[1:]) and
         app.get('identity') == IDENTITY and app.get('packageBinding', {}).get('manifestSha256') == APP_MANIFEST_SHA and
         expected.get('cwd') == str(artifact/'runtime/apps/web') and
         expected.get('executable') == str(artifact.parent/'runtime/node24/bin/node'), 'OBSERVER_ARGV')
    return 'fixed-3941-next-server-title'


def joint_check():
    value, meta = read_json(JOINT, digest(JOINT_SHA), 128*1024)
    need(value.get('kind') == 'OFFLINE_SCANNER_CONTENT_MANIFEST_V1' and
         value.get('identity') == IDENTITY and value.get('targetBindingSha256') == PIN_SHA and
         value.get('configSha256') == CONFIG_SHA, 'JOINT_CONTRACT')
    rows = value.get('files', [])
    names = {'install_scanner.py', 'data-baseline.json', 'official-data-source-proof.json', 'host-budget-policy.json'}
    need(isinstance(rows, list) and len(rows) == len(names) and {r.get('name') for r in rows} == names, 'JOINT_FILES')
    for row in rows:
        actual = file_info(HERE/row['name'], 4*1024**2)
        need(actual['sha256'] == row.get('sha256') and actual['bytes'] == row.get('bytes'), 'JOINT_FILE_HASH')
    return {'sha256': meta['sha256'], 'applicationAssemblySha256': APP_RECEIPT_SHA,
            'runtimeAssemblySha256': RUNTIME_RECEIPT_SHA, 'windowBytes': WINDOW_BYTES}


def pins():
    value, _ = read_json(PIN, digest(PIN_SHA), 32768, 0o600)
    need(value == TARGET_BINDING, 'TARGET_BINDING_CHANGED')
    return value


def package():
    bound = pins(); directory(SOFTWARE, False)
    app, _ = read_json(SOFTWARE/'assembly-result.json', APP_RECEIPT_SHA)
    rt, _ = read_json(SOFTWARE/'runtime-assembly-result.json', RUNTIME_RECEIPT_SHA)
    am, _ = read_json(SOFTWARE/'application-manifest.json', APP_MANIFEST_SHA, 8*1024**2)
    rm, _ = read_json(SOFTWARE/'runtime-manifest.json', RUNTIME_MANIFEST_SHA, 128*1024)
    need(app.get('status') == 'APPLICATION_ASSEMBLED_AND_VERIFIED_NOT_STARTED' and
         app.get('identity') == IDENTITY and app.get('target') == str(SOFTWARE) and
         app.get('finalManifestSha256') == APP_MANIFEST_SHA and app.get('readback', {}).get('leaves') == 15741 and
         app['readback'].get('allHashesModesOwnersAndLinksReadBack') is True and am.get('identity') == IDENTITY,
         'JOINT_APPLICATION_BINDING')
    need(rt.get('status') == 'RUNTIME_ASSEMBLED_AND_VERIFIED_NOT_EXECUTED' and rt.get('identity') == IDENTITY and
         rt.get('target') == str(SOFTWARE/'runtime') and rt.get('applicationAssemblyResultSha256') == APP_RECEIPT_SHA and
         rt.get('runtimeSelectionSha256') == RUNTIME_MANIFEST_SHA and rt.get('readback', {}).get('leaves') == 170 and
         rt['readback'].get('allHashesModesOwnersAndLinksReadBack') is True and rm.get('target') == str(SOFTWARE/'runtime'),
         'JOINT_RUNTIME_BINDING')
    rows = rm.get('entries'); need(isinstance(rows, dict) and len(rows) == 170 and sha(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()) == RUNTIME_ENTRIES_SHA, 'RUNTIME_MANIFEST_SET')
    index = {'runtime/'+k: {**v, 'type': 'file' if 'sha256' in v else 'symlink'} for k, v in rows.items()}
    required = {'runtime/clamav/sbin/clamd', 'runtime/clamav/bin/sigtool', 'runtime/clamav/bin/freshclam'}
    keys = required | {k for k in index if k.startswith('runtime/clamav/lib/')}
    need(len(keys) <= 64 and required <= keys, 'CLAM_SET')
    checked = {}
    for key in sorted(keys):
        row = index[key]; p = SOFTWARE/key
        if 'symlink' in row and 'sha256' not in row:
            need(p.is_symlink() and p.lstat().st_uid == UID and os.readlink(p) == row['symlink'] and not os.path.isabs(row['symlink']), 'CLAM_LINK')
            dest = p.resolve(strict=True); need(dest.is_relative_to(LIB), 'CLAM_LINK_ESCAPE')
            checked[key] = {'symlink': row['symlink'], 'resolved': str(dest)}
        else:
            actual = file_info(p)
            need(actual['bytes'] == row.get('bytes') and actual['sha256'] == row.get('sha256') and
                 stat.S_IMODE(p.stat().st_mode) == (int(row['mode'], 8) if isinstance(row['mode'], str) else row['mode']), 'JOINT_CLAM_BYTES_MODE')
            checked[key] = actual
    for key, row in checked.items():
        if 'resolved' in row:
            dest = str(Path(row['resolved']).relative_to(SOFTWARE))
            need(dest in checked and 'sha256' in checked[dest], 'CLAM_LINK_TARGET_VERIFIED')
    native_proof()
    for key in required:
        need(NATIVE_LIBRARIES.get(str(SOFTWARE/key), {}).get('sha256') == checked[key]['sha256'], 'CLAM_ROOT_NATIVE_BINDING')
    need(file_info(LOADER, 8*1024**2, owner=0)['sha256'] == LOADER_SHA, 'EXACT_LOADER')
    _,signature_pins,refresh_ref=signature_sources()
    if refresh_ref is None:
        source_manifest, _ = read_json(SOURCE_SOFTWARE/'MANIFEST.json', BASE_MANIFEST_SHA, 16*1024**2)
        source_rows = {x['path']: x for x in source_manifest['entries']}
        for name, expected in signature_pins.items():
            key = 'scanner/signatures/'+name; row = source_rows.get(key, {})
            need(row.get('type') == 'file' and all(row.get(k) == expected[k] for k in ['bytes', 'sha256']), 'ORIGINAL_CVD_PIN')
            index[key] = row
    else:
        for name,expected in signature_pins.items():index['scanner/signatures/'+name]={'type':'file',**expected}
    REPORT.update(packageBinding=bound, scannerPackageFiles=checked)
    return index, checked


def config_check():
    info = file_info(CONFIG, 8192, 0o600)
    need(info['sha256'] == CONFIG_SHA, 'EXACT_SCANNER_CONFIG')
    return info


def prepared():
    for path in [OFFLINE, PRIVATE, SCANNER, SCANNER/'tmp', EVENTS, LOGS]: directory(path)
    prep, meta = read_json(SCANNER/'preparation.json', digest(PREP_SHA))
    need(prep.get('status') == 'PREPARED_NOT_STARTED' and prep.get('phase') == 'prepare' and
         prep.get('identity') == IDENTITY and prep.get('packagePinFileSha256') == PIN_SHA and
         prep.get('packageBinding') == pins() and prep.get('jointDeliveryBinding') == joint_check() and
         prep.get('configSha256') == CONFIG_SHA and prep.get('currentBootId') == BOOT,
         'FIRST_START_PREPARATION')
    config_check(); REPORT['preparationReceipt'] = meta
    return meta


def resources(memory=256*1024**2):
    values = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key, value = line.split(':', 1)
        if key in ('MemAvailable', 'MemTotal'): values[key] = int(value.strip().split()[0])*1024
    used = allocation(); high = REPORT.setdefault('resourceObservation', {'samples': 0, 'observedHighWater': {},
        'boundary': 'Sampled allocated high water only; sub-sample peaks and deleted-open files may be missed. Not a hard filesystem quota or general concurrency proof.'})
    high['samples'] += 1
    for key, val in used.items(): high['observedHighWater'][key] = max(high['observedHighWater'].get(key, 0), val)
    values.update(at=now(), diskFreeBytes=shutil.disk_usage(HOME).free, minDiskFreeBytes=FLOOR,
                  minMemoryAvailableBytes=memory, **used)
    sample_clock = time.monotonic()
    prior_clock = high.get('lastSampleMonotonicSeconds')
    if prior_clock is not None:
        high['maxSampleGapSeconds'] = max(high.get('maxSampleGapSeconds', 0), sample_clock-prior_clock)
    else:
        high['maxSampleGapSeconds'] = 0
    high['lastSampleMonotonicSeconds'] = sample_clock
    high['observedMinimumGuestAvailableBytes'] = min(high.get('observedMinimumGuestAvailableBytes', values['diskFreeBytes']), values['diskFreeBytes'])
    high['observedMinimumMemAvailableBytes'] = min(high.get('observedMinimumMemAvailableBytes', values['MemAvailable']), values['MemAvailable'])
    high['sampleTimingBoundary'] = 'Maximum observed monotonic gap between completed samples; requested 100ms interval is not a hard guarantee and unobserved peaks remain unknown.'
    REPORT['lastResourceObservation'] = values
    need(values['diskFreeBytes'] >= FLOOR and values['MemAvailable'] >= memory and
         used['totalAllocatedBytes'] <= WINDOW_BYTES and used['temporaryAllocatedBytes'] <= TMP_WINDOW_BYTES and
         used['logAllocatedBytes'] <= MAX_LOG, 'RESOURCE_WINDOW_CAPACITY_OR_FLOOR')
    return values


def process(pid):
    try:
        p = Path('/proc')/str(pid)
        raw = (p/'stat').read_text()
        end = raw.rfind(')')
        fields = raw[end+2:].split()
        return {'pid': pid, 'state': fields[0], 'comm': raw[raw.find('(')+1:end],
                'pgid': int(fields[2]), 'session': int(fields[3]), 'startTicks': int(fields[19]), 'uid': p.stat().st_uid}
    except (FileNotFoundError, ProcessLookupError):
        return None


def remaining_group(owner):
    rows = []
    for path in Path('/proc').iterdir():
        if path.name.isdigit():
            row = process(int(path.name))
            if row and row['uid'] == UID and row['pgid'] == owner['pid'] and row['session'] == owner['pid'] and row['startTicks'] >= owner['startTicks'] and row['state'] != 'Z':
                rows.append(row)
    return rows


def owner_matches(owner, executable=LOADER, cwd=None, argv=None):
    if cwd is None: cwd = SCANNER
    current = process(owner['pid'])
    if current is None or current['state'] == 'Z': return False
    need(current['uid'] == UID and current['startTicks'] == owner['startTicks'] and
         current['pgid'] == owner['pid'] and current['session'] == owner['pid'], 'OWNED_PROCESS_CHANGED')
    proc = Path('/proc')/str(owner['pid'])
    need(os.readlink(proc/'exe') == str(executable) and os.readlink(proc/'cwd') == str(cwd), 'OWNED_EXE_CWD')
    cmdline = (proc/'cmdline').read_bytes(); expected = argv or daemon_argv()
    need(len(cmdline) <= 16384 and cmdline.split(b'\0')[:-1] == [x.encode() for x in expected], 'OWNED_ARGV')
    return True


def term_owned(owner, fd=None, executable=LOADER, cwd=None, argv=None):
    if cwd is None: cwd = SCANNER
    opened = None
    try:
        if not owner_matches(owner, executable, cwd, argv):
            return {'status': 'ALREADY_EXITED', 'forceKill': False}
        opened = os.pidfd_open(owner['pid']) if fd is None else None
        handle = opened if opened is not None else fd
        need(owner_matches(owner, executable, cwd, argv), 'OWNER_CHANGED_BEFORE_SIGNAL')
        signal.pidfd_send_signal(handle, signal.SIGTERM)
        deadline = time.monotonic()+45
        while time.monotonic() < deadline:
            row = process(owner['pid'])
            if row is None or row['state'] == 'Z':
                return {'status': 'NORMAL_SIGTERM_EXIT', 'signal': 'SIGTERM', 'forceKill': False}
            need(owner_matches(owner, executable, cwd, argv), 'PID_REUSED_NO_FURTHER_SIGNAL')
            time.sleep(.25)
        return {'status': 'TIMEOUT_PRESERVED_NO_FORCE_KILL', 'signal': 'SIGTERM', 'forceKill': False}
    finally:
        if opened is not None:
            os.close(opened)


def listeners(ports=(3310,)):
    found = []
    for filename in ['/proc/net/tcp', '/proc/net/tcp6']:
        for line in Path(filename).read_text().splitlines()[1:]:
            row = line.split()
            address, port = row[1].split(':')
            port_number = int(port, 16)
            if row[3] == '0A' and port_number in ports:
                found.append({'table': filename, 'addressHex': address, 'port': port_number, 'inode': row[9]})
    return found


# Root observed these exact OS tools in this recovery VM on 2026-10-26.
# They read only /proc/<numeric PID>/exe; no target execution or environment read.
ROOT_READ_TOOLS = (
    ('/usr/bin/sudo', 0o4755, '0a6e94862dad3a28e5e2e73aeb41bb23c829f19817dbdc8caab8cb3bc561cb67'),
    ('/usr/bin/readlink', 0o755, 'ca85270bfc923c930577f93d5123ce9d09193df7d8ed040c80b5ab8ff99d2fc5'),
)


def _root_read_need(value, code):
    if not value:
        raise RuntimeError('CHECK_' + code)


def _root_read_tool_pins():
    for name, mode, expected_hash in ROOT_READ_TOOLS:
        path = Path(name)
        _root_read_need(path.resolve(strict=True) == path and
                        all(not p.is_symlink() for p in [path, *path.parents]), 'ROOT_READ_TOOL_CANONICAL')
        before = path.stat()
        _root_read_need(stat.S_ISREG(before.st_mode) and before.st_uid == 0 and before.st_nlink == 1 and
                        stat.S_IMODE(before.st_mode) == mode and before.st_size <= 2*1024**2,
                        'ROOT_READ_TOOL_OWNER_MODE_BOUND')
        with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as source:
            opened = os.fstat(source.fileno())
            raw = source.read(2*1024**2+1)
            after = os.fstat(source.fileno())
        _root_read_need((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino) and
                        len(raw) == before.st_size and
                        (after.st_size, after.st_mtime_ns, after.st_ctime_ns) ==
                        (before.st_size, before.st_mtime_ns, before.st_ctime_ns) and
                        hashlib.sha256(raw).hexdigest() == expected_hash, 'ROOT_READ_TOOL_HASH_CHANGED')


def _guard_process_executable(pid, expected, read_process):
    _root_read_need(type(pid) is int and 1 <= pid <= 2147483647, 'ROOT_READ_NUMERIC_PID')
    before = read_process(pid)
    if before is None or before['state'] == 'Z':
        return None
    identity = (expected['uid'], expected['startTicks'])
    _root_read_need((before['uid'], before['startTicks']) == identity, 'ROOT_READ_PID_CHANGED_BEFORE')
    path = '/proc/' + str(pid) + '/exe'
    returncode = 0
    try:
        executable = os.readlink(path)
    except (FileNotFoundError, ProcessLookupError):
        after = read_process(pid)
        if after is None or after['state'] == 'Z':
            return None
        _root_read_need((after['uid'], after['startTicks']) == identity, 'ROOT_READ_PID_CHANGED_AFTER')
        # Preserve the existing no-executable case (including kernel threads).
        # This is an absent exe link, not a comm-name privilege exemption.
        return None
    except PermissionError:
        if identity[0] != 1100:
            # Preserve r01's other-UID unreadable-exe boundary. The caller has
            # already applied global comm/listener guards; no name exemption.
            after = read_process(pid)
            if after is None or after['state'] == 'Z':
                return None
            _root_read_need((after['uid'], after['startTicks']) == identity, 'ROOT_READ_PID_CHANGED_AFTER')
            return None
        _root_read_tool_pins()
        # Exact argv and clean environment. No shell, target execution, password
        # input, sudo rule change, arbitrary path, or diagnostic output export.
        child = subprocess.Popen(['/usr/bin/sudo', '-n', '/usr/bin/readlink', path],
                                 stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 env={'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC'},
                                 start_new_session=True)
        fd = os.pidfd_open(child.pid)
        try:
            try:
                output, errors = child.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                # Only the helper-owned short metadata command receives TERM.
                # A refused/hung privileged read never licenses scanner control.
                signal.pidfd_send_signal(fd, signal.SIGTERM)
                try:
                    child.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    pass
                _root_read_need(False, 'ROOT_READLINK_TIMEOUT_NO_FORCE_KILL')
            returncode = child.returncode
            _root_read_need(len(output) <= 8192 and len(errors) <= 8192, 'ROOT_READLINK_OUTPUT_BOUND')
            executable = output.decode('utf-8').removesuffix('\n') if returncode == 0 else ''
        finally:
            os.close(fd)
    after = read_process(pid)
    if after is None or after['state'] == 'Z':
        return None
    _root_read_need((after['uid'], after['startTicks']) == identity, 'ROOT_READ_PID_CHANGED_AFTER')
    _root_read_need(returncode == 0, 'ROOT_READLINK_REFUSED_NO_FALLBACK')
    _root_read_need(0 < len(executable.encode()) <= 8192 and executable.startswith('/') and
                    not any(c in executable for c in ('\0', '\n', '\r')), 'ROOT_READLINK_ABSOLUTE_RESULT')
    return executable


def no_scanner_or_build():
    need(not listeners((3591, 3592, 45464)), 'APPLICATION_PORTS_STILL_LISTENING')
    names = {'clamd', 'freshclam', 'node', 'nodejs', 'cmake', 'cargo', 'rustc', 'cc1', 'cc1plus', 'make', 'ninja'}
    for path in Path('/proc').iterdir():
        if path.name.isdigit():
            row = process(int(path.name))
            if not row or row['state'] == 'Z':
                continue
            need(row['comm'] not in names and not row['comm'].startswith('next-server'), 'SCANNER_BUILD_OR_APP_ACTIVE')
            executable = _guard_process_executable(int(path.name), row, process)
            if executable is None:
                continue
            need(Path(executable.removesuffix(' (deleted)')).name not in ('node', 'nodejs'), 'NODE_EXECUTABLE_STILL_ACTIVE')


def child_env():
    return {'PATH': '/usr/bin:/bin', 'HOME': str(HOME), 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
            'TZ': 'UTC', 'TMPDIR': str(SCANNER/'tmp'), 'LD_LIBRARY_PATH': LIBRARY_PATH, 'LOCPATH': '/usr/lib/locale'}


def limited_child():
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_LOG, MAX_LOG))


def limited_daemon():
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_FSIZE, (DAEMON_MAX_FILE, DAEMON_MAX_FILE))


def daemon_limit(pid):
    rows = [line.split() for line in Path(f'/proc/{pid}/limits').read_text().splitlines()
            if line.startswith('Max file size')]
    need(len(rows) == 1 and rows[0][3:] == [str(DAEMON_MAX_FILE), str(DAEMON_MAX_FILE), 'bytes'],
         'DAEMON_FILE_LIMIT_READBACK')
    return {'softBytes': DAEMON_MAX_FILE, 'hardBytes': DAEMON_MAX_FILE}


def interpreter(path):
    # Read ELF metadata only; never invoke an unpinned shell/ldd wrapper.
    with path.open('rb') as f:
        h = f.read(64)
        need(len(h) == 64 and h[:6] == b'\x7fELF\x02\x01' and struct.unpack_from('<H', h, 18)[0] == 183, 'ARM64_ELF')
        offset = struct.unpack_from('<Q', h, 32)[0]
        size, count = struct.unpack_from('<HH', h, 54)
        need(size == 56 and 0 < count <= 128 and offset+size*count <= 1024*1024, 'ELF_HEADERS_BOUND')
        f.seek(offset)
        headers = f.read(size*count)
        matches = []
        for i in range(count):
            entry = struct.unpack_from('<IIQQQQQQ', headers, i*size)
            if entry[0] == 3:
                need(0 < entry[5] <= 4096 and entry[2]+entry[5] <= path.stat().st_size, 'ELF_INTERP_BOUND')
                f.seek(entry[2]);matches.append(f.read(entry[5]).rstrip(b'\0').decode('ascii'))
    need(matches == ['/lib/ld-linux-aarch64.so.1'], 'EXACT_SYSTEM_INTERPRETER')
    resolved = Path(matches[0]).resolve(strict=True)
    need(str(resolved) == '/usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1', 'SYSTEM_LOADER_PATH')
    return resolved, file_info(resolved, 8*1024**2, owner=0)


def loader_run(name, binary):
    proof = native_proof()
    roots = [r for r in proof['roots'] if r.get('finalProbePath') == str(binary)]
    need(len(roots) == 1 and roots[0].get('loaderExecuted') is True and roots[0].get('classification') == 'LOADER_LIST_RESOLUTION_ONLY', 'ACTUAL_CLAM_LOADER_ROOT')
    for row in roots[0].get('namedLibraries', []):
        update = BASE_LIBRARY_UPDATES.get(row['path'])
        if update:
            need(row['sha256'] == update['historicalSha256'], 'CLAM_LOADER_BASE_UPDATE_HISTORY')
        need(mapped_library(Path(row['path']), CURRENT_INDEX)['sha256'] ==
             (update['currentSha256'] if update else row['sha256']), 'CLAM_LOADER_BYTES_CHANGED')
    return {'binary': str(binary), 'actualNativeReceiptSha256': pins()['nativeReceipt']['sha256'],
            'priorCommandLog': roots[0]['commandLog'], 'newPrefixPrivateLibraries': sorted(r['path'] for r in roots[0]['namedLibraries'] if r['path'].startswith(str(LIB)+'/')),
            'priorActualLoaderReused': True, 'loaderReexecuted': False}


def signatures(index, import_sha):
    directory(DB)
    imported, meta = read_json(DB/'IMPORT-RECEIPT.json', import_sha)
    _,_,refresh_ref=signature_sources()
    need(imported.get(signature_reference_key())==refresh_ref and
         imported.get('status') == 'OFFLINE_SIGNATURE_IMPORT_VERIFIED_SCANNER_NOT_STARTED' and
         imported.get('identity') == IDENTITY and imported.get('manifestSha256') == BASE_MANIFEST_SHA and
         imported.get('target') == str(DB) and imported.get('targetBindingSha256') == PIN_SHA and
         imported.get('preparationSha256') == PREP_SHA and imported.get('configSha256') == CONFIG_SHA and
         imported.get('currentBootId') == BOOT and imported.get('networkUsed') is False and
         imported.get('freshclamExecuted') is False and imported.get('clamdStarted') is False, 'IMPORT_RECEIPT')
    expected = {'IMPORT-RECEIPT.json'} | {n+s for n in ['main', 'daily', 'bytecode'] for s in ['.cvd', '-verify.log']}
    names = set()
    for item in DB.iterdir():
        names.add(item.name)
        need(len(names) <= 7, 'SIGNATURE_DIRECTORY_BOUND')
    need(names == expected, 'SIGNATURE_DIRECTORY_SET')
    received = imported.get('signatures', [])
    need(len(received) == 3 and {x.get('name') for x in received} == {'main.cvd', 'daily.cvd', 'bytecode.cvd'}, 'IMPORT_SIGNATURE_SET')
    values = []
    for name in ['main.cvd', 'daily.cvd', 'bytecode.cvd']:
        row = index.get('scanner/signatures/'+name, {})
        info = file_info(DB/name, 512*1024**2, 0o600)
        need(row.get('type') == 'file' and info['bytes'] == row.get('bytes') and info['sha256'] == row.get('sha256'), 'IMPORTED_CVD_BYTES')
        with (DB/name).open('rb') as f:
            fields = f.read(512).decode('ascii').rstrip(' \x00\r\n').split(':')
        need(len(fields) == 9 and fields[0] == 'ClamAV-VDB', 'CVD_HEADER')
        info.update(name=name, version=int(fields[2]), buildEpoch=int(fields[8]))
        if TARGET_BINDING['kind']=='OFFLINE_SCANNER_TARGET_V3':info.update(cvd_header(DB/name))
        prior = next(x for x in received if x['name'] == name)
        need(all(prior.get(k) == info[k] for k in ['name', 'bytes', 'sha256', 'version', 'buildEpoch']) and
             prior.get('sigtoolExitCode') == 0, 'IMPORT_CVD_IDENTITY')
        if TARGET_BINDING['kind']=='OFFLINE_SCANNER_TARGET_V3':
            need(all(prior.get(k)==info[k] for k in ('signatures','requiredFunctionalityLevel')),
                 'IMPORT_LOCAL_CVD_HEADER_IDENTITY')
        verification = file_info(DB/(name[:-4]+'-verify.log'), 1024**2, 0o600)
        need(verification['sha256'] == prior.get('verificationLogSha256'), 'IMPORT_SIGTOOL_LOG')
        if name == 'daily.cvd':
            age = time.time()-info['buildEpoch']
            need(0 <= age <= MAX_AGE, 'DAILY_EXPIRED_OR_FUTURE')
            REPORT['dailyAgeSeconds'] = round(age, 3)
        values.append(info)
    REPORT['signatureImportReceipt'] = meta
    return values


def clamd_read(command):
    need(command in ('PING', 'VERSION'), 'READ_ONLY_COMMAND')
    with socket.create_connection(('127.0.0.1', 3310), timeout=2) as sock:
        sock.settimeout(3);sock.sendall(b'z'+command.encode()+b'\0')
        value = b''
        while b'\0' not in value:
            chunk = sock.recv(4096)
            if not chunk:
                break
            value += chunk;need(len(value) <= 16384, 'CLAMD_REPLY_BOUND')
    return value.rstrip(b'\0\r\n').decode('ascii')


def data_baseline():
    global DATA_ROWS
    need(isinstance(DATA_BASELINE_SHA, str) and re.fullmatch(r'[a-f0-9]{64}', DATA_BASELINE_SHA), 'EXTERNAL_DATA_BASELINE_SHA')
    value, meta = read_json(HERE/'data-baseline.json', DATA_BASELINE_SHA, 32768, 0o600)
    need(value.get('kind') == 'EXACT_TWO_PACKAGE_OWNED_NONEXEC_DATA_BASELINE' and
         value.get('identity') == IDENTITY and value.get('bootId') == historical_boot() and
         value.get('nativeReceiptSha256') == NATIVE_SHA and
         value.get('sourceMetadataSha256') == TARGET_BINDING['dataSourceMetadataSha256'] and
         value.get('sourceOriginSha256') == TARGET_BINDING['dataSourceOriginSha256'] and
         value.get('officialSourceProofSha256') == '21143bac15f028d09e290f42034295d68f5c1a48811d90c11b2544c42ef5b7fd', 'EXACT_DATA_BASELINE_SOURCE')
    official, official_meta = read_json(HERE/'official-data-source-proof.json', value['officialSourceProofSha256'], 32768, 0o600)
    need(official.get('status') == 'BOTH_FILES_MATCH_EXACT_AUTHENTICATED_DEB_PAYLOAD' and
         len(official.get('files', [])) == 2 and {r.get('path') for r in official['files']} == set(DATA_PATHS), 'EXACT_OFFICIAL_DATA_PROOF')
    rows = value.get('rows')
    need(isinstance(rows, list) and len(rows) == 2 and {r.get('path') for r in rows} == set(DATA_PATHS), 'EXACT_TWO_DATA_PATHS')
    for row in rows:
        p = row['path']; proof = row.get('provenance', {})
        pkg = 'libc-bin' if p == '/usr/lib/locale/C.utf8/LC_CTYPE' else 'libc6:arm64'
        need(row.get('permissions') == DATA_PATHS[p] and row.get('uid') == 0 and row.get('gid') == 0 and
             row.get('mode') == '0o644' and row.get('nlink') == 1 and type(row.get('bytes')) is int and
             0 < row['bytes'] <= 1024**2 and type(row.get('dev')) is int and type(row.get('inode')) is int and
             isinstance(row.get('sha256'), str) and re.fullmatch(r'[a-f0-9]{64}', row['sha256']) and
             isinstance(row.get('md5'), str) and re.fullmatch(r'[a-f0-9]{32}', row['md5']), 'DATA_BASELINE_FIELDS')
        authentic = next(r for r in official['files'] if r['path'] == p)
        payload = authentic.get('payloadFile', {})
        need(authentic.get('package') == pkg.split(':')[0] and authentic.get('version') == '2.39-0ubuntu8.9' and
             authentic.get('architecture') == 'arm64' and authentic.get('bytesEqual') is True and authentic.get('sha256Equal') is True and
             payload.get('archiveMember') == '.'+p and payload.get('type') == 'regular' and
             payload.get('uid') == payload.get('gid') == 0 and payload.get('mode') == '0644' and
             payload.get('bytes') == row['bytes'] and payload.get('sha256') == row['sha256'] and
             proof.get('officialPayload') == payload and proof.get('officialArchive') ==
             {k: authentic['archive'][k] for k in ['bytes', 'sha256']}, 'EXACT_AUTHENTICATED_DATA_PAYLOAD')
        need(proof.get('class') == 'EXACT_APPROVED_BASE_PACKAGE_DATA_WITH_LOCAL_MD5' and
             proof.get('package') == pkg and proof.get('version') == '2.39-0ubuntu8.9' and
             proof.get('architecture') == 'arm64' and proof.get('md5File') == '/var/lib/dpkg/info/'+pkg+'.md5sums' and
             proof.get('md5Line') == row['md5']+'  '+p[1:], 'DATA_PACKAGE_PROVENANCE')
    DATA_ROWS = {r['path']: r for r in rows}
    REPORT['nonExecutableDataBaseline'] = meta; REPORT['officialNonExecutableDataSource'] = official_meta
    return meta


def mapped_data(path, mapping):
    # Only two externally pinned package-owned data files; never a general non-x exemption.
    expected = DATA_ROWS.get(str(path)); need(expected is not None, 'EXACT_NONEXEC_DATA_PATH')
    need(mapping['permissions'] == expected['permissions'] and 'w' not in mapping['permissions'] and
         'x' not in mapping['permissions'], 'NONEXEC_DATA_MAP_PERMISSIONS')
    canonical(path); before = path.lstat()
    def identity(s):
        return (s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0 and
         stat.S_IMODE(before.st_mode) == 0o644 and before.st_nlink == 1 and
         before.st_size == expected['bytes'] and before.st_dev == expected['dev'] and
         before.st_ino == expected['inode'], 'NONEXEC_DATA_METADATA')
    major, minor = [int(x, 16) for x in mapping['device'].split(':')]
    need(int(mapping['inode']) == before.st_ino and (major, minor) ==
         (os.major(before.st_dev), os.minor(before.st_dev)), 'NONEXEC_DATA_MAPPING_IDENTITY')
    h = hashlib.sha256(); m = hashlib.md5(); total = 0
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), 'rb') as stream:
        need(identity(os.fstat(stream.fileno())) == identity(before), 'NONEXEC_DATA_OPEN_CHANGED')
        for chunk in iter(lambda: stream.read(65536), b''):
            total += len(chunk); need(total <= expected['bytes'], 'NONEXEC_DATA_GREW'); h.update(chunk); m.update(chunk)
        canonical(path)
        need(identity(os.fstat(stream.fileno())) == identity(before) == identity(path.lstat()), 'NONEXEC_DATA_READ_CHANGED')
    need(total == expected['bytes'] and h.hexdigest() == expected['sha256'] and m.hexdigest() == expected['md5'], 'NONEXEC_DATA_FULL_HASH')
    proof = expected['provenance']; md5_path = Path(proof['md5File'])
    info = file_info(md5_path, 1024**2, 0o644, owner=0)
    need(info['sha256'] == proof.get('md5FileSha256'), 'NONEXEC_DATA_MD5_SOURCE')
    with os.fdopen(os.open(md5_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), 'rb') as stream:
        raw = stream.read(1024**2+1)
    need(len(raw) <= 1024**2 and sha(raw) == info['sha256'] and
         raw.decode().splitlines().count(proof['md5Line']) == 1, 'NONEXEC_DATA_PACKAGE_MD5_ENTRY')
    return {'path': str(path), 'bytes': total, 'sha256': h.hexdigest(), 'md5': m.hexdigest(),
            'device': mapping['device'], 'inode': str(before.st_ino), 'permissions': mapping['permissions'],
            'uid': 0, 'gid': 0, 'mode': '0o644', 'nlink': 1, 'provenance': proof,
            'classification': 'EXACT_PACKAGE_OWNED_NONEXEC_DATA', 'heldFdReadStable': True}


def local_set_load_observation(signature_rows):
    # clamd emits Loaded only after cl_load succeeds. Header counts include
    # signatures the engine may intentionally ignore; they are not an equality
    # assertion about the engine's loaded count. The exact three-file directory,
    # signed bytes, config and current daemon owner are checked separately.
    snapshot=log_snapshot(DAEMON_LOG)
    with os.fdopen(os.open(DAEMON_LOG,os.O_RDONLY|os.O_NOFOLLOW),'rb') as stream:
        raw=stream.read(snapshot['prefixBytes'])
    need(len(raw)==snapshot['prefixBytes'] and sha(raw)==snapshot['prefixSha256'],'LOCAL_SET_LOG_CHANGED')
    counts=[int(x) for x in re.findall(rb'Loaded ([0-9]+) signatures\.',raw)]
    need(counts and all(n>0 for n in counts),'LOCAL_SET_LOAD_NOT_OBSERVED')
    trust_signed=re.search(rb'Bytecode: Security mode set to "?TrustSigned"?',raw) is not None
    need(trust_signed,'LOCAL_SET_SIGNED_BYTECODE_MODE')
    return {'databaseDirectory':str(DB),'databaseFiles':sorted(r['name'] for r in signature_rows),
            'loadedSignatures':counts[-1],'loadRecords':len(counts),
            'headerSignatureTotal':sum(r['signatures'] for r in signature_rows),
            'headerCountEqualityAsserted':False,'bytecodeTrustSignedObserved':trust_signed,
            'engineFunctionalityLevel':216,
            'requiredFunctionalityLevels':{r['name']:r['requiredFunctionalityLevel'] for r in signature_rows},
            'daemonLogPrefix':snapshot}


def runtime_readback(owner, signature_rows, index):
    need(owner_matches(owner), 'OWNER_NOT_RUNNING')
    found = listeners()
    need(len(found) == 1 and found[0]['table'] == '/proc/net/tcp' and found[0]['addressHex'] == '0100007F', 'LOOPBACK_LISTENER')
    proc = Path('/proc')/str(owner['pid'])
    fds = []
    for path in (proc/'fd').iterdir():
        try:
            fds.append(os.readlink(path))
        except FileNotFoundError:
            pass
    need('socket:['+found[0]['inode']+']' in fds, 'SOCKET_OWNER')
    pong = clamd_read('PING');need(pong == 'PONG', 'PING')
    version = clamd_read('VERSION');match = re.fullmatch(r'ClamAV (1\.4\.6)/(\d+)/(.+)', version)
    need(match is not None, 'CLAM_VERSION')
    epoch = int(dt.datetime.strptime(match.group(3), '%a %b %d %H:%M:%S %Y').replace(tzinfo=dt.timezone.utc).timestamp())
    daily = next(x for x in signature_rows if x['name'] == 'daily.cvd')
    need(int(match.group(2)) == daily['version'] and epoch == daily['buildEpoch'] and
         0 <= time.time()-epoch <= MAX_AGE, 'LOADED_DAILY_IDENTITY')
    with (proc/'maps').open('rb') as f:
        raw_maps = f.read(8*1024**2+1)
    need(len(raw_maps) <= 8*1024**2, 'MAPS_BOUND')
    loaded = {}; loaded_data = {}
    diagnostic = {'at': now(), 'rawMapBytes': len(raw_maps), 'rows': [], 'failedMapping': None,
                  'boundary': 'Only file path/device/inode/perms metadata. No addresses, mapped contents or environment. Libraries and two exact externally pinned package-owned data files are classified separately.'}
    REPORT['mappingDiagnostic'] = diagnostic
    lines = raw_maps.decode().splitlines()
    for line_number, line in enumerate(lines, 1):
        fields = line.split(maxsplit=5)
        if len(fields) < 6 or not fields[5].startswith('/'):
            continue
        row = {'lineNumber': line_number, 'path': fields[5], 'device': fields[3], 'inode': fields[4],
               'permissions': fields[1], 'validation': 'NOT_YET_VALIDATED'}
        need(len(row['path'].encode()) <= 4096 and len(diagnostic['rows']) < 1024, 'MAPPING_DIAGNOSTIC_BOUND')
        diagnostic['rows'].append(row)
        need(len(json.dumps(diagnostic).encode()) <= 512*1024, 'MAPPING_DIAGNOSTIC_BYTES')
    for row in diagnostic['rows']:
        try:
            path_text = row['path']
            need(not path_text.endswith(' (deleted)'), 'LOADED_LIBRARY_DELETED')
            path = Path(path_text); canonical(path)
            metadata = path.stat(); major, minor = [int(x, 16) for x in row['device'].split(':')]
            need(int(row['inode']) == metadata.st_ino and (major, minor) ==
                 (os.major(metadata.st_dev), os.minor(metadata.st_dev)), 'MAPPED_LIBRARY_INODE')
            if str(path) in DATA_PATHS:
                loaded_data[str(path)] = mapped_data(path, row); row['classification'] = 'NONEXEC_PACKAGE_DATA'
            else:
                loaded[str(path)] = mapped_library(path, index); row['classification'] = 'NATIVE_LIBRARY'
            row['validation'] = 'VERIFIED'
        except BaseException as error:
            row['validation'] = 'FAILED'
            diagnostic['failedMapping'] = {**row, 'errorCode': str(error) if isinstance(error, RuntimeError) and re.fullmatch(r'CHECK_[A-Z0-9_]+', str(error)) else type(error).__name__}
            raise
    need(any(Path(p).name.startswith('libclamav.so') for p in loaded), 'ACTUAL_LIBCLAMAV_REQUIRED')
    need('/usr/lib/locale/C.utf8/LC_CTYPE' in loaded_data, 'ACTUAL_UTF8_CTYPE_MAPPING_REQUIRED')
    with (proc/'environ').open('rb') as f:
        env = f.read(16385)
    need(len(env) <= 16384, 'ENV_BOUND')
    selected = [x for x in env.split(b'\0') if x.startswith((b'TZ=', b'LD_LIBRARY_PATH=', b'LOCPATH=', b'LANG=', b'LC_ALL='))]
    need(sorted(selected) == sorted([b'TZ=UTC', ('LD_LIBRARY_PATH='+LIBRARY_PATH).encode(),
         b'LOCPATH=/usr/lib/locale', b'LANG=C.UTF-8', b'LC_ALL=C.UTF-8']), 'CHILD_LIBRARY_ENV')
    need(owner_matches(owner), 'OWNER_CHANGED_AFTER_READBACK')
    full_set={'localSetLoad':local_set_load_observation(signature_rows)} if TARGET_BINDING['kind']=='OFFLINE_SCANNER_TARGET_V3' else {}
    return {**full_set,'ping': pong, 'actualVersion': version, 'listener': found[0], 'loadedPrivateLibraries': loaded, 'loadedNonExecutableData': loaded_data,
            'actualFileSizeLimit': daemon_limit(owner['pid']),
            'actualExecutable': file_info(LOADER, owner=0), 'declaredClamdBinary': file_info(EXE), 'config': config_check(), 'signatures': signature_rows,
            'childEnvironmentWhitelist': {'TZ': 'UTC', 'LD_LIBRARY_PATH': LIBRARY_PATH, 'LOCPATH': '/usr/lib/locale', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8'},
            'boundary': 'Every observed library mapping retains the exact native proof gate. Only two externally pinned package-owned non-executable data mappings have a separate held-fd inode/hash/md5 check; locale-archive and all unknown paths remain rejected. Unobserved future dlopen is not inferred. Five-case scans remain separate.'}


def prepare():
    global OUT
    package()
    resources()
    directory(HOME, False)
    need(not OFFLINE.exists() and not OFFLINE.is_symlink(), 'ENTIRE_NEW_SCANNER_TARGET_REQUIRED')
    need(sha(CONFIG_TEXT.encode()) == CONFIG_SHA, 'CONFIG_TEMPLATE_PIN')
    OFFLINE.mkdir(mode=0o700); OUT = OFFLINE
    PRIVATE.mkdir(mode=0o700); SCANNER.mkdir(mode=0o700); OUT = SCANNER
    LOGS.mkdir(mode=0o700); (SCANNER/'tmp').mkdir(mode=0o700); EVENTS.mkdir(mode=0o700)
    with CONFIG.open('xb') as f:
        f.write(CONFIG_TEXT.encode()); f.flush(); os.fsync(f.fileno())
    REPORT.update(status='PREPARED_NOT_STARTED', configSha256=config_check()['sha256'],
                  jointDeliveryBinding=joint_check(), signaturesImported=False, servicesStarted=False)


def loader(index):
    rows = [loader_run(name, SOFTWARE/rel) for name, rel in [('clamd', 'runtime/clamav/sbin/clamd'),
            ('sigtool', 'runtime/clamav/bin/sigtool'), ('freshclam', 'runtime/clamav/bin/freshclam')]]
    for row in rows:
        for item in row['newPrefixPrivateLibraries']:
            key = str(Path(item).relative_to(SOFTWARE));expected = index.get(key, {})
            actual = file_info(Path(item))
            need(expected.get('type') == 'file' and expected.get('sha256') == actual['sha256'] and
                 expected.get('bytes') == actual['bytes'], 'LOADER_LIBRARY_HASH')
    REPORT.update(status='LOADER_RESOLUTION_VERIFIED_DAEMON_NOT_STARTED', config=config_check(),
                  servicesStarted=False, freshclamExecuted=False, loaderResults=rows)


def loader_receipt(event, expected, checked):
    proof, meta = read_json(EVENTS/('loader-'+token(event))/'receipt.json', digest(expected))
    phase_identity(proof, 'loader')
    need(proof.get('status') == 'LOADER_RESOLUTION_VERIFIED_DAEMON_NOT_STARTED' and
         proof.get('scannerPackageFiles') == checked and proof.get('config') == config_check(), 'LOADER_RECEIPT_BINDING')
    rows = proof.get('loaderResults', [])
    need(len(rows) == 3 and {r.get('binary') for r in rows} ==
         {str(SOFTWARE/p) for p in ('runtime/clamav/sbin/clamd', 'runtime/clamav/bin/sigtool', 'runtime/clamav/bin/freshclam')}
         and all(r.get('priorActualLoaderReused') is True and r.get('loaderReexecuted') is False and
                 r.get('actualNativeReceiptSha256') == NATIVE_SHA for r in rows), 'ACTUAL_LOADER_REUSE_DECLARATION')
    return meta


def phase_identity(value, phase):
    need(value.get('phase') == phase and value.get('identity') == IDENTITY and
         value.get('currentBootId') == BOOT and value.get('packagePinFileSha256') == PIN_SHA and
         value.get('packageBinding') == pins() and value.get('preparationSha256') == PREP_SHA and
         value.get('configSha256') == CONFIG_SHA and value.get('jointDeliveryBinding') == joint_check() and
         value.get('nativeReceipt', {}).get('sha256') == NATIVE_SHA, 'PHASE_TARGET_IDENTITY')


def dependency_success():
    pin = TARGET_BINDING['dependencyReceipt']; value, meta = read_json(Path(pin['path']), pin['sha256'], 4*1024**2)
    need(value.get('status') == 'NEW_PREFIX_RUNTIME_PAYLOAD_AND_ELF_VERIFIED' and
         value.get('target') == str(DEBS) and value.get('bootId', value.get('platform', {}).get('bootId')) == historical_boot() and
         value.get('selectionSha256') == '35784a08501e366fd440449a085935f751ecb0428e88ca9c34412dc35b720851' and
         value.get('basePackageCount') == 122 and value.get('tree') ==
         {'regularFiles': 2263, 'symlinks': 135, 'treeVerified': True} and
         value.get('loader', {}).get('elfCount') == 134 and value.get('loader', {}).get('versionCommands') == 9,
         'ACTUAL_FULL_DEPENDENCY_SUCCESS_REQUIRED')
    need(value.get('baseUpdate', {}).get('overlaySha256') ==
         '7ce7c823871d70d0e84a5a5fe1ff162c6cbaaccb5d11525f6db826c2b489e6c1', 'EXACT_BASE_UPDATE')
    REPORT['dependencyVerificationReceipt'] = meta
    return meta


def start(run, import_sha, loader_event, loader_sha, import_event, import_phase_sha, index, checked):
    need(run == SCANNER_RUN, 'EXACT_TARGET_RUN')
    loader_meta = loader_receipt(loader_event, loader_sha, checked)
    imported, import_meta = read_json(EVENTS/('import-'+token(import_event))/'receipt.json', digest(import_phase_sha))
    phase_identity(imported, 'import')
    need(imported.get('status') == 'OFFLINE_SIGNATURE_IMPORT_VERIFIED_SCANNER_NOT_STARTED' and
         imported.get('importReceiptSha256') == digest(import_sha) and
         imported.get('loaderReceipt') == loader_meta and imported.get('signaturesImported') is True and
         imported.get('servicesStarted') is False, 'IMPORT_PHASE_RECEIPT_BINDING')
    REPORT['importPhaseReceipt'] = import_meta
    REPORT['loaderReceipt'] = loader_meta
    no_scanner_or_build();need(not listeners(), 'PORT_3310_OCCUPIED')
    need(not PIDFILE.exists() and not DAEMON_LOG.exists(), 'NEW_TARGET_DAEMON_FILES_REQUIRED')
    sigs = signatures(index, import_sha)
    resources(1536*1024**2)
    log = LOGS/('foreground-'+token(run)+'.log')
    loader_run('clamd', EXE)
    argv = daemon_argv()
    child = None;owner = None;fd = None;ready = False
    REPORT.update(importReceiptSha256=import_sha, loaderReceiptSha256=loader_sha, run=run,
                  daemonFileLimitBytes=DAEMON_MAX_FILE, firstStartOnly=True, localeDataClassificationOnly=True, priorHistoryTouched=False)
    try:
        with log.open('xb') as output:
            previous = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGALRM, signal.SIGTERM, signal.SIGINT})
            try:
                child = subprocess.Popen(argv, cwd=SCANNER, env=child_env(), stdin=subprocess.DEVNULL,
                    stdout=output, stderr=subprocess.STDOUT, start_new_session=True,
                    preexec_fn=lambda: limited_daemon_restored(previous))
                REPORT['createdPid'] = child.pid;fd = os.pidfd_open(child.pid);owner = process(child.pid)
                need(owner and owner['uid'] == UID and owner['pgid'] == child.pid and owner['session'] == child.pid, 'SCANNER_OWNER')
                owner = {**owner, 'argv': argv, 'executable': str(LOADER), 'declaredClamdBinary': str(EXE), 'cwd': str(SCANNER)}
            finally: signal.pthread_sigmask(signal.SIG_SETMASK, previous)
            REPORT['process'] = owner;write_new(OUT/'owned-process.json', owner)
            deadline = time.monotonic()+120
            while time.monotonic() < deadline:
                need(child.poll() is None and owner_matches(owner), 'DAEMON_EXITED')
                need(log.stat().st_size <= MAX_LOG, 'FOREGROUND_LOG_BOUND')
                resources()
                if listeners():
                    try:
                        readback = runtime_readback(owner, sigs, index)
                    except (ConnectionError, TimeoutError, OSError):
                        time.sleep(.5);continue
                    need(signatures(index, import_sha) == sigs, 'SIGNATURES_CHANGED_AFTER_START')
                    REPORT.update(runtime=readback, readinessAt=now(), readinessResources=resources())
                    ready = True;break
                time.sleep(.5)
            need(ready, 'STARTUP_TIMEOUT')
        REPORT.update(status='NEW_PREFIX_SCANNER_RUNNING_READBACK_VERIFIED', scannerLeftRunning=True,
                      businessScanCases='NOT_EXECUTED')
    except BaseException:
        if owner is None and child is not None and child.poll() is None:
            if fd is not None: signal.pidfd_send_signal(fd, signal.SIGTERM)
            else: os.kill(child.pid, signal.SIGTERM) # unreaped child created here only
            REPORT['failureCleanup'] = {'status': 'CREATED_CHILD_TERM_REQUESTED_UNCONFIRMED', 'forceKill': False}
        if owner is not None:
            REPORT['failureCleanup'] = term_owned(owner, fd)
            REPORT['remainingOwnedGroup'] = remaining_group(owner)
            REPORT['scannerLeftRunning'] = bool(REPORT['remainingOwnedGroup'])
        raise
    finally:
        if fd is not None:
            os.close(fd)
        if log.exists():
            REPORT['privateForegroundLog'] = log_snapshot(log)
        if DAEMON_LOG.exists():
            REPORT['privateDaemonLog'] = log_snapshot(DAEMON_LOG)


def started(run, expected):
    need(run == SCANNER_RUN, 'EXACT_TARGET_RUN')
    value, meta = read_json(EVENTS/('start-'+token(run))/'receipt.json', expected)
    need(value.get('status') == 'NEW_PREFIX_SCANNER_RUNNING_READBACK_VERIFIED' and value.get('run') == run and
         value.get('packagePinFileSha256') == PIN_SHA and value.get('packageBinding') == pins(), 'START_RECEIPT')
    need(value.get('currentBootId') == BOOT and Path('/proc/sys/kernel/random/boot_id').read_text().strip() == BOOT, 'START_RECEIPT_BOOT')
    if REPORT.get('phase') != 'stop': phase_identity(value, 'start')
    owner = value.get('process', {})
    need(type(owner.get('pid')) is int and owner['pid'] > 1 and type(owner.get('startTicks')) is int and
         owner.get('uid') == UID and owner.get('executable') == str(LOADER) and owner.get('cwd') == str(SCANNER), 'RECORDED_OWNER')
    return value, meta


def verify(run, expected, index):
    prior, meta = started(run, expected)
    sigs = signatures(index, prior['importReceiptSha256'])
    REPORT.update(runtime=runtime_readback(prior['process'], sigs, index), startReceipt=meta,
                  status='NEW_PREFIX_SCANNER_READBACK_VERIFIED', businessScanCases='NOT_EXECUTED')


def stop(run, expected):
    prior, meta = started(run, expected)
    # Shutdown remains possible when signatures expire or readiness fails.
    result = term_owned(prior['process'])
    remaining = remaining_group(prior['process'])
    REPORT.update(startReceipt=meta, oldProcess=prior['process'], termination=result, forceKill=False,
                  remainingOwnedGroup=remaining)
    need(result['status'] != 'TIMEOUT_PRESERVED_NO_FORCE_KILL', 'NORMAL_STOP_TIMEOUT_NO_KILL')
    need(not remaining, 'OWNED_DESCENDANTS_REMAIN_NO_FORCE_KILL')
    need(not listeners(), 'LISTENER_REMAINS_NO_ACTION')
    need(not PIDFILE.exists(), 'PIDFILE_REMAINS_NO_DELETE')
    REPORT.update(status='NEW_PREFIX_SCANNER_NORMAL_STOPPED', scannerLeftRunning=False)
    for name in [DAEMON_LOG.name, 'foreground-'+token(run)+'.log']:
        if (LOGS/name).exists():
            REPORT.setdefault('retainedPrivateLogs', []).append(log_snapshot(LOGS/name))


def execute(joint_sha, pin_sha, budget_sha, prep_sha, phase, args, *, approved_limit=HOST_CAP):
    global JOINT_SHA, BUDGET_SHA, PREP_SHA, OUT, CURRENT_INDEX
    os.umask(0o077); configure_target(pin_sha)
    JOINT_SHA, BUDGET_SHA = digest(joint_sha), digest(budget_sha)
    PREP_SHA = None if phase in ('prepare', 'stop') and prep_sha == '-' else digest(prep_sha)
    need(sys.platform == 'linux' and platform.machine() in ('aarch64', 'arm64') and os.getuid() == UID and
         os.getgid() == UID and sys.flags.isolated and not any(k.startswith(('PG', 'LD_')) for k in os.environ) and
         hasattr(os, 'pidfd_open') and hasattr(signal, 'pthread_sigmask'), 'DECLARED_ARM64_NONROOT_BASELINE')
    REPORT.update(kind='OFFLINE_SCANNER_HEALTHY_FIRST_START', phase=phase, startedAt=now(), identity=IDENTITY,
        jointDeliveryBinding=joint_check(), packagePinFileSha256=PIN_SHA, packageBinding=pins(), forceKill=False,
        appOrDatabaseAccess=False, signatureUpdates=False, sourceChanges=False, windowBytes=WINDOW_BYTES,
        preparationSha256=PREP_SHA, configSha256=CONFIG_SHA, scannerTarget=str(OFFLINE), currentBootId=BOOT)
    if phase != 'stop': data_baseline(); fixed_owners()
    signal.signal(signal.SIGTERM, interruption);signal.signal(signal.SIGINT, interruption);signal.signal(signal.SIGALRM, interruption)
    signal.setitimer(signal.ITIMER_REAL, {'prepare': 60, 'loader': 60, 'import': 330, 'start': 180, 'verify': 60, 'observe': 270, 'stop': 60}[phase])
    try:
        if phase == 'prepare': budget(initial=True, approved_limit=approved_limit);prepare()
        else:
            directory(SCANNER);directory(EVENTS);directory(LOGS)
            event = args[2] if phase in ('verify', 'stop', 'observe') else args[0]
            target = EVENTS/(phase+'-'+token(event));target.mkdir(mode=0o700);OUT = target
            write_new(OUT/'execution.claim.json', {'at': now(), 'phase': phase, 'controllerPid': os.getpid(), 'controllerSha256': file_info(Path(__file__).resolve(), 128*1024)['sha256']})
            if phase == 'stop': stop(args[0], args[1])
            else:
                budget(approved_limit=approved_limit);prepared();index, checked = package();CURRENT_INDEX = index;resources()
                if phase in ('loader', 'import', 'start'): fixed_owners(require_stopped=True)
                if phase == 'loader': no_scanner_or_build();loader(index)
                elif phase == 'import':
                    REPORT['loaderReceipt'] = loader_receipt(args[1], args[2], checked)
                    import_signatures(args[0], index)
                elif phase == 'start': start(*args, index, checked)
                elif phase == 'verify': verify(args[0], args[1], index)
                elif phase == 'observe': observe(*args, index)
    except BaseException as error:
        if phase in ('verify', 'observe') and isinstance(error, RuntimeError) and str(error).startswith(('CHECK_RESOURCE_WINDOW_', 'CHECK_FRESH_WINDOW_')) and 'failureCleanup' not in REPORT:
            try:
                prior, _ = started(args[0], args[1]);REPORT['failureCleanup'] = term_owned(prior['process'])
                REPORT['remainingOwnedGroup'] = remaining_group(prior['process']);REPORT['scannerLeftRunning'] = bool(REPORT['remainingOwnedGroup'])
            except BaseException as cleanup:
                REPORT['failureCleanup'] = {'status': 'CLEANUP_UNCONFIRMED', 'errorType': type(cleanup).__name__, 'forceKill': False}
        REPORT.update(status='FAILED_PRESERVED_NO_AUTOMATIC_RETRY', errorType=type(error).__name__, errorCode=str(error)[:200] if isinstance(error, RuntimeError) else type(error).__name__);raise
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        REPORT['finishedAt'] = now()
        if OUT is not None:
            receipt_path = OUT/('preparation.json' if phase == 'prepare' else 'receipt.json')
            receipt_sha = write_new(receipt_path, REPORT)
            print(json.dumps({'status': REPORT.get('status'), 'receipt': str(receipt_path), 'sha256': receipt_sha}), flush=True)




def base_update_verifier():
    need(TARGET_BINDING['kind'] == 'OFFLINE_SCANNER_TARGET_V3', 'BASE_UPDATE_TARGET_KIND')
    pin = TARGET_BINDING['baseUpdateVerifier']
    need(pin == {'path': str(HERE/'prepare_instance.py'), 'sha256': BASE_UPDATE_VERIFIER_SHA},
         'EXACT_BASE_UPDATE_VERIFIER')
    path = Path(pin['path']); info = file_info(path, 65536)
    need(info['sha256'] == BASE_UPDATE_VERIFIER_SHA, 'BASE_UPDATE_VERIFIER_HASH')
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        raw = stream.read(65537)
    need(len(raw) == info['bytes'] and sha(raw) == info['sha256'], 'BASE_UPDATE_VERIFIER_READ_CHANGED')
    verifier = types.ModuleType('scanner_base_update_reference'); verifier.__file__ = str(path)
    exec(compile(raw, str(path), 'exec'), verifier.__dict__)
    return verifier, info


def admit_base_library_update():
    """Reuse the exact reviewed package exception; no general hash override."""
    refs = TARGET_BINDING.get('baseUpdate')
    if refs is None:
        return {}
    verifier, info = base_update_verifier()
    updates, evidence = verifier.base_update(refs, NATIVE_LIBRARIES)
    # The shared verifier checks historical pins, aliases and installed package;
    # current bytes and metadata are read here before any native command.
    for path_text, row in updates.items():
        actual = file_info(Path(path_text), row['bytes'], mode=0o644, owner=0, single_link=False)
        need(actual['bytes'] == row['bytes'] and actual['sha256'] == row['currentSha256'] and
             Path(path_text).stat().st_gid == 0, 'CURRENT_BASE_LIBRARY_METADATA')
    REPORT['baseUpdateApplicability'] = {'verifier': info, 'sources': refs, **evidence,
        'currentLibraryBytesVerified': True, 'historicalNativeProofPreserved': True}
    return updates


def native_proof():
    global NATIVE_LIBRARIES, BASE_LIBRARY_UPDATES
    BASE_LIBRARY_UPDATES = {}
    b = pins(); dependency_success(); proof, info = read_json(NATIVE_RESULT, b['nativeReceipt']['sha256'], 4*1024**2)
    need(proof.get('status') == 'TEN_FINAL_TARGET_ELF_PROBES_VERIFIED_NOT_STARTED' and
         proof.get('bootId') == historical_boot() and proof.get('applicationAssemblyReceiptSha256') == APP_RECEIPT_SHA and
         proof.get('jointRuntimeAssemblyReceiptSha256') == RUNTIME_RECEIPT_SHA and
         proof.get('runtimeManifestSha256') == RUNTIME_MANIFEST_SHA and
         proof.get('runtimeReceiptSha256') == DEBS_RECEIPT_SHA and
         proof.get('exactBasePackageCount') == 122 and proof.get('finalTargetFilesVerified') is True and
         proof.get('sourceProbeOnly') is False and
         proof.get('finalJointApplicationTarget') == str(SOFTWARE/'application') and
         len(proof.get('roots', [])) == 10, 'FINAL_NATIVE_SUCCESS_BINDING')
    rows = proof.get('libraries', [])
    need(isinstance(rows, list) and 1 <= len(rows) <= 512 and
         len({r.get('path') for r in rows}) == len(rows), 'NATIVE_LIBRARY_SET')
    NATIVE_LIBRARIES = {r['path']: r for r in rows}
    need(NATIVE_LIBRARIES.get(str(LOADER), {}).get('sha256') == LOADER_SHA, 'NATIVE_LOADER_PIN')
    BASE_LIBRARY_UPDATES = admit_base_library_update()
    REPORT['nativeReceipt'] = info
    return proof


def fixed_owners(require_stopped=False):
    current_boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    need(current_boot == BOOT, 'EXACT_BOOT')
    REPORT['currentBootId'] = current_boot
    alive = []
    for role, expected in DATA_OWNERS.items():
        pin = TARGET_BINDING['dataServices'][role]['receipt']; record, meta = read_json(Path(pin['path']), pin['sha256'])
        wanted = {'ORIGINAL_POSTGRES_NORMAL_START_SAME_CLUSTER'} if role == 'pg' else {'ORIGINAL_REDIS_NORMAL_START_PERSISTENCE_READY'}
        if TARGET_BINDING['kind'] in ('OFFLINE_SCANNER_TARGET_V2','OFFLINE_SCANNER_TARGET_V3'):
            wanted.add('ORIGINAL_POSTGRES_STARTED_NEW_BOOT' if role=='pg' else 'ORIGINAL_REDIS_STARTED_NEW_BOOT')
        need(record.get('status') in wanted and record.get('bootId') == BOOT, 'ACTUAL_DATA_START_RECEIPT')
        if record.get('status')=='ORIGINAL_POSTGRES_STARTED_NEW_BOOT':
            need(record.get('readback',{}).get('systemId')=='7700459308674415750' and
                 record['readback'].get('data')=='/var/lib/postgresql/14/main' and record['readback'].get('port')=='5432', 'NEW_BOOT_ORIGINAL_PG')
        if record.get('status')=='ORIGINAL_REDIS_STARTED_NEW_BOOT':
            need(record.get('authenticatedPing') is True and record.get('persistence')=={'loading':'0','aof_enabled':'1','aof_last_write_status':'ok'} and
                 record.get('noFlushResetRepairOrConfigChanges') is True,'NEW_BOOT_ORIGINAL_REDIS')
        owner = record.get('readback', {}).get('process', {}) if role == 'pg' else record.get('process', {})
        need(all(str(owner.get(k)) == str(v) for k, v in expected.items()), 'DATA_START_RECEIPT_OWNER')
        REPORT.setdefault('dataServiceReceipts', {})[role] = meta
        row = process(expected['pid'])
        need(row and row['state'] != 'Z' and row['uid'] == expected['uid'] and
             row['startTicks'] == expected['startTicks'], 'DATA_OWNER_CHANGED')
        alive.append({'role': role, **row})
    if require_stopped and TARGET_BINDING['predecessor']['mode'] == 'absent':
        no_scanner_or_build();need(not listeners(), 'ABSENT_SCANNER_PORT_OCCUPIED')
        REPORT['predecessorObservation'] = 'DECLARED_ABSENT_AND_NO_PROCESS_OR_PORT_OBSERVED'
    elif require_stopped:
        b = pins()['predecessor']
        before_pin = b['beforeStopObservation']
        before, before_meta = read_json(Path(before_pin['path']), before_pin['sha256'])
        need(before.get('kind') == 'LIVE_PREDECESSOR_OWNERS_OBSERVED' and
             before.get('bootIdBefore') == before.get('bootIdAfter') == BOOT and
             before.get('owners') == PREVIOUS_OWNERS and before.get('allFourLive') is True and
             before.get('executableAndCwdVerified') is True and before.get('servicesStopped') is False,
             'ACTUAL_SAME_BOOT_PRE_STOP_OBSERVATION')
        REPORT['predecessorBeforeStopObservation'] = before_meta
        ap, _ = read_json(Path(b['applicationStop']['path']), b['applicationStop']['sha256'])
        need(ap.get('status') == 'OWNED_APPLICATIONS_STOPPED' and len(ap.get('processes', [])) == 3, 'NORMAL_APP_STOP')
        for role in ['api', 'web', 'proxy']:
            candidates = [x for x in ap['processes'] if x.get('role') == role]
            old = PREVIOUS_OWNERS[role]
            need(len(candidates) == 1 and candidates[0].get('pid') == old['pid'] and
                 str(candidates[0].get('startTicks')) == str(old['startTicks']) and
                 candidates[0].get('sigtermSent') is True, 'EXACT_APP_STOP_OWNER')
        sc, _ = read_json(Path(b['scannerStop']['path']), b['scannerStop']['sha256'])
        observed_at = dt.datetime.fromisoformat(before['at'])
        app_stopped_at = dt.datetime.fromisoformat(ap['at'])
        scanner_stopped_at = dt.datetime.fromisoformat(sc['finishedAt'])
        need(observed_at.tzinfo is not None and app_stopped_at.tzinfo is not None and
             scanner_stopped_at.tzinfo is not None and
             observed_at <= app_stopped_at <= dt.datetime.now(dt.timezone.utc) and
             observed_at <= scanner_stopped_at <= dt.datetime.now(dt.timezone.utc), 'PRE_STOP_FACT_ORDER')
        # Legacy normal-stop receipts omit bootId. The live observation already
        # binds the exact successful scanner start to this boot; join the stop
        # to that same start instead of inventing a field in historical data.
        observed_start = before.get('scannerStart', {})
        receipt_pin({key: observed_start.get(key) for key in ('path', 'sha256')})
        need(all(sc.get('startReceipt', {}).get(key) == observed_start[key] for key in ('path', 'sha256')),
             'NORMAL_STOP_OBSERVED_START_BINDING')
        need(sc.get('status') == 'NEW_PREFIX_SCANNER_NORMAL_STOPPED' and sc.get('currentBootId', BOOT) == BOOT and sc.get('forceKill') is False and
             sc.get('remainingOwnedGroup') == [] and sc.get('termination', {}).get('status') == 'NORMAL_SIGTERM_EXIT' and
             all(sc.get('oldProcess', {}).get(k) == v for k, v in PREVIOUS_OWNERS['scanner'].items()), 'EXACT_SCANNER_NORMAL_STOP')
        for expected in PREVIOUS_OWNERS.values():
            row = process(expected['pid'])
            need(row is None or (row['state'] == 'Z' and row['startTicks'] == expected['startTicks']), 'PREVIOUS_OWNER_NOT_EXITED')
    REPORT['retainedDataOwners'] = alive


def budget(initial=False, *, approved_limit=HOST_CAP):
    need(type(approved_limit) is int and approved_limit in (HOST_CAP,49*1024**3//2,25*1024**3,101*1024**3//4,51*1024**3//2),
         'APPROVED_BUDGET_LIMIT')
    policy, policy_meta = read_json(HERE/'host-budget-policy.json', TARGET_BINDING['budgetPolicySha256'], 4*1024**2)
    need(policy.get('kind') == 'OFFLINE_HOST_BUDGET_SCOPE_V1' and policy.get('limit') == approved_limit,
         'BUDGET_POLICY_KIND')
    roots = policy.get('expectedRootPaths'); reader = policy.get('reader', {})
    need(isinstance(roots, list) and 4 <= len(roots) <= 4096 and len(set(roots)) == len(roots) and
         all(isinstance(p, str) and p.startswith('/') and '..' not in Path(p).parts for p in roots),
         'COMPLETE_BUDGET_ROOTS')
    digest(reader.get('entrySha256')); deps = reader.get('dependencies')
    need(isinstance(deps, list) and 1 <= len(deps) <= 16 and len({x.get('name') for x in deps}) == len(deps),
         'BUDGET_READER_DEPENDENCIES')
    for row in deps:
        need(set(row) == {'name', 'sha256'} and re.fullmatch(r'[A-Za-z0-9_.-]+', row['name']), 'READER_DEPENDENCY')
        digest(row['sha256'])
    b, meta = read_json(HERE/('budget-'+digest(BUDGET_SHA)+'.json'), BUDGET_SHA, 4*1024**2)
    age = (dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(b['at'])).total_seconds()
    rows = b.get('rows', [])
    need(0 <= age <= 120 and b.get('scopeNarrowed') is False and b.get('reader') == reader and
         b.get('limit') == approved_limit and len(rows) == len(roots) and {x.get('path') for x in rows} == set(roots) and
         all(type(x.get('allocatedBytes')) is int and x['allocatedBytes'] >= 0 for x in rows) and
         type(b.get('totalAllocatedBytes')) is int and sum(x['allocatedBytes'] for x in rows) == b['totalAllocatedBytes'],
         'FRESH_FULL_HOST_BUDGET')
    used = allocation()['totalAllocatedBytes']; reserve = WINDOW_BYTES-used
    need(reserve >= 0 and b['totalAllocatedBytes']+reserve+64*1024**2 <= approved_limit and
         shutil.disk_usage(HOME).free >= FLOOR+reserve, 'FRESH_WINDOW_RESERVATION')
    REPORT['budgetAdmission'] = {'receipt': meta, 'policy': policy_meta, 'ageSeconds': age,
        'hostAllocatedBytes': b['totalAllocatedBytes'], 'remainingWindowReservationBytes': reserve,
        'fullWindowBytes': WINDOW_BYTES, 'hostReserveBytes': 64*1024**2,
        'approvedLimitBytes': approved_limit, 'initialTargetAbsent': initial}


def allocation():
    totals = {'signatureAllocatedBytes': 0, 'temporaryAllocatedBytes': 0, 'logAllocatedBytes': 0,
              'metadataAllocatedBytes': 0, 'totalAllocatedBytes': 0, 'entries': 0, 'vanishedDuringSample': 0}
    if not OFFLINE.exists(): return totals
    pending = [OFFLINE]; seen = set()
    while pending:
        path = pending.pop()
        try: s = path.lstat()
        except FileNotFoundError:
            totals['vanishedDuringSample'] += 1; continue
        need(s.st_uid == UID and not s.st_mode & 0o022 and not stat.S_ISLNK(s.st_mode) and
             (stat.S_ISDIR(s.st_mode) or stat.S_ISREG(s.st_mode)), 'WINDOW_TREE_TYPE_OWNER')
        need(stat.S_ISDIR(s.st_mode) or s.st_nlink == 1, 'WINDOW_NO_HARDLINK')
        key = (s.st_dev, s.st_ino); need(key not in seen, 'WINDOW_DUPLICATE_INODE');seen.add(key)
        totals['entries'] += 1;need(totals['entries'] <= 8192, 'WINDOW_ENTRY_BOUND')
        size = s.st_blocks*512; totals['totalAllocatedBytes'] += size
        if path.is_relative_to(SCANNER/'tmp'): category = 'temporaryAllocatedBytes'
        elif path.is_relative_to(LOGS) or (path.parent == DB and path.name.endswith('-verify.log')): category = 'logAllocatedBytes'
        elif path.parent == DB and path.name in CVD_PINS: category = 'signatureAllocatedBytes'
        else: category = 'metadataAllocatedBytes'
        totals[category] += size
        if stat.S_ISDIR(s.st_mode):
            try:
                with os.scandir(path) as items:
                    for item in items: pending.append(Path(item.path));need(len(pending) <= 8192, 'WINDOW_PENDING_BOUND')
            except FileNotFoundError: totals['vanishedDuringSample'] += 1
    return totals


def daemon_argv():
    return [str(LOADER), '--inhibit-cache', '--library-path', LIBRARY_PATH, str(EXE), '--config-file='+str(CONFIG), '--foreground']


def mapped_library(path, index):
    canonical(path)
    key = str(path)
    if path.is_relative_to(LIB):
        row = index.get(str(path.relative_to(SOFTWARE)), {})
        need('sha256' in row, 'MAPPED_CLAM_NOT_DECLARED')
        info = file_info(path);need(info['sha256'] == row['sha256'] and info['bytes'] == row['bytes'], 'MAPPED_CLAM_HASH')
        return {**info, 'delivery': 'joint-private-clam'}
    row = NATIVE_LIBRARIES.get(key)
    need(row is not None and row.get('delivery') in ['joint-declared-runtime-root', 'new-prefix-20deb', 'exact-122-base'], 'MAPPED_PATH_NOT_FINAL_NATIVE_PROOF')
    if row['delivery'] == 'exact-122-base':
        need(key.startswith('/usr/lib/') and isinstance(row.get('packages'), list) and row['packages'], 'MAPPED_EXACT_BASE_OWNER')
        owner = 0
    elif row['delivery'] == 'new-prefix-20deb':
        need(path.is_relative_to(DEBS), 'MAPPED_20DEB_PREFIX');owner = UID
    else:
        need(path == EXE, 'MAPPED_RUNTIME_NOT_CLAMD');owner = UID
    info = file_info(path, owner=owner, single_link=(owner != 0))
    update = BASE_LIBRARY_UPDATES.get(key)
    if update:
        s = path.stat()
        need(owner == 0 and row['sha256'] == update['historicalSha256'] and
             s.st_gid == 0 and stat.S_IMODE(s.st_mode) == 0o644, 'MAPPED_BASE_UPDATE_METADATA')
    need(info['sha256'] == (update['currentSha256'] if update else row['sha256']) and
         info['bytes'] == (update['bytes'] if update else row['bytes']), 'MAPPED_NATIVE_PROOF_BYTES')
    return {**info, 'delivery': row['delivery'], **({'packages': row['packages']} if owner == 0 else {})}


def limited_child_restored(mask):
    signal.pthread_sigmask(signal.SIG_SETMASK, mask);limited_child()


def run_sigtool(name, source):
    binary = SOFTWARE/'runtime/clamav/bin/sigtool'; argv = [str(LOADER), '--inhibit-cache', '--library-path', LIBRARY_PATH, str(binary), '--info='+str(source)]
    loader_run('sigtool', binary)
    log = DB/(name+'-verify.log'); child = None; owner = None; fd = None; row = {'argv': argv, 'timeoutSeconds': 90}
    REPORT.setdefault('signatureCommands', []).append(row)
    try:
        with log.open('xb') as output:
            previous = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGALRM, signal.SIGTERM, signal.SIGINT})
            try:
                child = subprocess.Popen(argv, cwd=SCANNER, env=child_env(), stdin=subprocess.DEVNULL, stdout=output,
                    stderr=subprocess.STDOUT, start_new_session=True, preexec_fn=lambda: limited_child_restored(previous))
                row['createdPid'] = child.pid; fd = os.pidfd_open(child.pid); owner = process(child.pid)
                need(owner and owner['uid'] == UID and owner['pgid'] == child.pid and owner['session'] == child.pid, 'SIGTOOL_OWNER')
            finally: signal.pthread_sigmask(signal.SIG_SETMASK, previous)
            deadline = time.monotonic()+90
            while child.poll() is None:
                need(time.monotonic() < deadline and log.stat().st_size <= 1024**2, 'SIGTOOL_TIME_LOG_BOUND')
                resources(); time.sleep(.1)
            row['exitCode'] = child.returncode
        need(child.returncode == 0 and log.stat().st_size <= 1024**2 and 'Verification OK.' in log.read_text(errors='replace'), 'OFFICIAL_SIGNATURE_VERIFICATION')
        return file_info(log, 1024**2, 0o600)
    finally:
        if child is not None and child.poll() is None:
            if owner is not None: row['failureCleanup'] = term_owned(owner, fd, LOADER, SCANNER, argv)
            elif fd is not None: signal.pidfd_send_signal(fd, signal.SIGTERM);row['failureCleanup'] = {'status': 'CREATED_CHILD_TERM_REQUESTED_UNCONFIRMED', 'forceKill': False}
            else: os.kill(child.pid, signal.SIGTERM);row['failureCleanup'] = {'status': 'UNREAPED_CHILD_TERM_REQUESTED_UNCONFIRMED', 'forceKill': False}
        if fd is not None: os.close(fd)


def import_signatures(event, index):
    no_scanner_or_build();fixed_owners(require_stopped=True);need(not listeners(), 'PORT_3310_OCCUPIED')
    need(not DB.exists() and not DB.is_symlink(), 'NEW_CVD_DIRECTORY_REQUIRED')
    source_dir,signature_pins,refresh_ref=signature_sources()
    DB.mkdir(mode=0o700);rows = [];report = {'status': 'FAILED_PRESERVED', 'startedAt': now(), 'networkUsed': False, 'freshclamExecuted': False, 'clamdStarted': False}
    try:
        for name in ['main.cvd', 'daily.cvd', 'bytecode.cvd']:
            source = source_dir[name] if isinstance(source_dir,dict) else source_dir/name
            expected = signature_pins[name]
            original = file_info(source, 128*1024**2)
            need(all(original[k] == expected[k] for k in ['bytes', 'sha256']), 'SOURCE_CVD_BYTES')
            full_header=cvd_header(source)
            header={k:full_header[k] for k in ('version','buildEpoch')}
            if TARGET_BINDING['kind']=='OFFLINE_SCANNER_TARGET_V3':header=full_header
            if refresh_ref is not None:
                need(all(header[key]==expected[key] for key in ('version','buildEpoch')), 'REFRESH_CVD_HEADER_IDENTITY')
            if name == 'daily.cvd': need(0 <= time.time()-header['buildEpoch'] <= MAX_AGE, 'DAILY_EXPIRED_OR_FUTURE')
            verified = run_sigtool(name[:-4], source)
            before = source.stat(); fd = os.open(source, os.O_RDONLY|os.O_NOFOLLOW)
            with os.fdopen(fd, 'rb') as inp, (DB/name).open('xb') as out:
                need((os.fstat(inp.fileno()).st_dev, os.fstat(inp.fileno()).st_ino) == (before.st_dev, before.st_ino), 'CVD_COPY_OPEN_CHANGED')
                copied = 0
                while True:
                    chunk = inp.read(1024**2)
                    if not chunk: break
                    copied += len(chunk);need(copied <= expected['bytes'], 'CVD_COPY_GREW');out.write(chunk);resources()
                out.flush();os.fsync(out.fileno())
            need(copied == expected['bytes'] and file_info(source, 128*1024**2) == original and
                 file_info(DB/name, 128*1024**2, 0o600)['sha256'] == expected['sha256'], 'CVD_SOURCE_OR_COPY_CHANGED')
            rows.append({'name': name, **expected, **header, 'sigtoolExitCode': 0, 'verificationLogSha256': verified['sha256']})
        need(sum(r['bytes'] for r in rows) == sum(r['bytes'] for r in signature_pins.values()), 'THREE_CVD_TOTAL')
        report.update(status='OFFLINE_SIGNATURE_IMPORT_VERIFIED_SCANNER_NOT_STARTED', identity=IDENTITY,
                      targetBindingSha256=PIN_SHA, preparationSha256=PREP_SHA, configSha256=CONFIG_SHA, currentBootId=BOOT,
                      manifestSha256=BASE_MANIFEST_SHA, signatures=rows, target=str(DB), sourceSoftware=str(SOURCE_SOFTWARE),
                      signatureSourceDirectory=None if isinstance(source_dir,dict) else str(source_dir),
                      **{signature_reference_key():refresh_ref})
        if TARGET_BINDING['kind']=='OFFLINE_SCANNER_TARGET_V3':
            report.update(sourceKind='OFFICIAL_CVD_LOCAL_SOURCES_V1',
                          sourceFiles={name:str(path) for name,path in source_dir.items()},
                          sourceProvenance=REPORT['localSignatureSources'],
                          originalRefreshOutcome='FAILED_PRESERVED')
        REPORT.update(status='OFFLINE_SIGNATURE_IMPORT_VERIFIED_SCANNER_NOT_STARTED', signaturesImported=True, servicesStarted=False)
    finally:
        report['finishedAt'] = now();REPORT['importReceiptSha256'] = write_new(DB/'IMPORT-RECEIPT.json', report)


def observe(run, expected, event, duration, index):
    need(duration.isdecimal() and 1 <= int(duration) <= 180, 'OBSERVE_180S_MAX')
    prior, meta = started(run, expected);owner = prior['process'];deadline = time.monotonic()+int(duration)
    write_new(OUT/'observation-ready.json', {'at': now(), 'owner': owner, 'startReceipt': meta, 'durationSeconds': int(duration), 'sampleIntervalSeconds': .1})
    try:
        while time.monotonic() < deadline:
            need(owner_matches(owner), 'OBSERVED_SCANNER_EXITED');fixed_owners();resources();time.sleep(.1)
        REPORT.update(status='BOUNDED_SCANNER_WINDOW_OBSERVED', startReceipt=meta, runtime=runtime_readback(owner, signatures(index, prior['importReceiptSha256']), index),
                      serialFivecaseResult='NOT_INFERRED_FROM_RESOURCE_OBSERVATION', scannerLeftRunning=True)
    except BaseException:
        REPORT['failureCleanup'] = term_owned(owner);REPORT['remainingOwnedGroup'] = remaining_group(owner)
        REPORT['scannerLeftRunning'] = bool(REPORT['remainingOwnedGroup']);raise

def interruption(signum, _frame):
    signal.setitimer(signal.ITIMER_REAL, 0)
    raise RuntimeError('CHECK_CONTROLLER_INTERRUPTED_' + str(signum))


def limited_daemon_restored(mask):
    signal.pthread_sigmask(signal.SIG_SETMASK, mask);limited_daemon()


if __name__ == '__main__':
    approved_limit = HOST_CAP
    if sys.argv[1:2] == ['--approved-host-limit-bytes']:
        # An execution argument, never selected from the delivered policy.
        if len(sys.argv)<3 or not re.fullmatch(r'[0-9]{1,12}',sys.argv[2]):
            raise SystemExit('CHECK_APPROVED_BUDGET_LIMIT_ARGUMENT')
        approved_limit=int(sys.argv[2]);sys.argv=[sys.argv[0]]+sys.argv[3:]
    lengths = {'prepare': 0, 'loader': 1, 'import': 3, 'start': 6, 'verify': 3, 'observe': 4, 'stop': 3}
    if len(sys.argv) == 4 and sys.argv[1] == '--observe-predecessor':
        try: observe_predecessor(sys.argv[2], sys.argv[3])
        except BaseException as error:
            print(json.dumps({'status': 'OBSERVATION_FAILED_NO_SERVICE_ACTION', 'errorType': type(error).__name__,
                              'errorCode': str(error) if isinstance(error, RuntimeError) and
                              re.fullmatch(r'CHECK_[A-Z0-9_]+', str(error)) else type(error).__name__}))
            raise SystemExit(1)
    elif len(sys.argv) >= 7 and sys.argv[1] == '--execute' and sys.argv[6] in lengths and len(sys.argv)-7 == lengths[sys.argv[6]]:
        try: execute(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6], sys.argv[7:], approved_limit=approved_limit)
        except BaseException as error:
            print(json.dumps({'status': 'FAILED_PRESERVED', 'errorType': type(error).__name__,
                              'errorCode': str(error)[:200] if isinstance(error, RuntimeError) else type(error).__name__}), flush=True)
            raise SystemExit(1)
    else:
        print(json.dumps({'status': 'PLAN_ONLY_NOT_EXECUTED', 'phases': lengths,
            'requires': '--execute EXTERNAL_CONTENT_MANIFEST_SHA EXTERNAL_TARGET_BINDING_SHA FRESH_BUDGET_SHA PREPARATION_SHA_OR_DASH PHASE ...',
            'windowBytes': WINDOW_BYTES, 'nativeSuccessfulReceiptRequired': True,
            'resourceBoundary': 'Sampled aggregate allocated cap and remaining-reservation floor; not a hard filesystem quota.'}))
