"""Three Node process lifecycle derived from reviewed R30 runtime reference.
Only port indirection, boot binding and bounded children are added here.
The caller supplies independently pinned configuration and admission functions.
"""
from pathlib import Path
import datetime as dt
import hashlib, http.client, json, os, re, resource, signal, socket, ssl, stat, subprocess, time
UID = 1100
ID_KEYS = ('sourceCommit', 'sourceTree', 'release', 'buildTime')
PORTS = {'api': 3594, 'web': 3595, 'proxy': 45474}
R = ART = NODE = LOGS = PROXY = RUNS = None
COMMIT = TREE = PIN_FILE_SHA = BOOT = None
BASE_ENV = {}

def unconfigured(*args, **kwargs):
    raise RuntimeError('CHECK_UNCONFIGURED_LIFECYCLE')
package_pins = validate_prepared = bind_prestart_evidence = guard = unconfigured

def child_limits():
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_FSIZE, (8*1024**2, 8*1024**2))
    resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))

def need(ok, code):
    if not ok:
        raise RuntimeError('CHECK_' + code)

def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def canonical(path):
    path = Path(path)
    need(path.is_absolute(), 'ABSOLUTE_PATH')
    current = Path('/')
    for part in path.parts[1:]:
        current /= part
        need(not current.is_symlink(), 'SYMLINK_COMPONENT')
    need(path.resolve(strict=True) == path, 'CANONICAL_PATH')
    return path

def read(path, limit=2 * 1024 * 1024, private=False):
    path = canonical(path)
    before = path.stat()
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
         before.st_size <= limit and before.st_uid == UID, 'REGULAR_OWNED_FILE')
    if private:
        need(stat.S_IMODE(before.st_mode) == 0o600, 'PRIVATE_FILE_MODE')
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        opened = os.fstat(stream.fileno())
        need((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino), 'OPEN_CHANGED')
        raw = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
    need(len(raw) == before.st_size and
         (after.st_size, after.st_mtime_ns, after.st_ctime_ns) ==
         (before.st_size, before.st_mtime_ns, before.st_ctime_ns), 'READ_CHANGED')
    return raw

def jsread(path, limit=2 * 1024 * 1024, private=False):
    return json.loads(read(path, limit, private))

def write_new(path, value):
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    need(len(raw) <= 2 * 1024 * 1024, 'RECEIPT_SIZE')
    with Path(path).open('xb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    return sha(raw)

def identity_equal(value, identity):
    return isinstance(value, dict) and all(value.get(k) == identity[k] for k in ID_KEYS)

def file_hash(path, expected_size, limit=256 * 1024 * 1024):
    path = canonical(path)
    before = path.stat()
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_uid == UID and
         before.st_size == expected_size and 0 <= expected_size <= limit, 'PACKAGE_REGULAR_FILE')
    digest = hashlib.sha256()
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        opened = os.fstat(stream.fileno())
        need((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino), 'PACKAGE_OPEN_CHANGED')
        count = 0
        for data in iter(lambda: stream.read(1024 * 1024), b''):
            count += len(data)
            need(count <= expected_size, 'PACKAGE_READ_BOUND')
            digest.update(data)
        after = os.fstat(stream.fileno())
    need(count == expected_size and
         (after.st_size, after.st_mtime_ns, after.st_ctime_ns) ==
         (before.st_size, before.st_mtime_ns, before.st_ctime_ns), 'PACKAGE_READ_CHANGED')
    return digest.hexdigest()

def config_check(env):
    source = "try{const c=require('./apps/api/dist/common/app-config.js');const i=require('./apps/api/dist/common/build-identity.generated.js').IMMUTABLE_BUILD_IDENTITY;const v=c.resolveAppConfig(process.env,i);if(v.nodeEnv!=='production'||v.deploymentEnvironment!=='staging'||v.authMockEnabled||v.notificationQueueEnabled||v.notificationInAppReminderScanEnabled||v.malwareScannerProvider!=='clamav'||v.attachmentStoragePurgedMetadataRetentionMs!==7776000000)process.exit(2);process.stdout.write('CONFIG_VALIDATED\\n')}catch{process.exit(1)}"
    result = subprocess.run([str(NODE), '--max-old-space-size=128', '-e', source],
                            cwd=ART, env={**BASE_ENV, **env}, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=20)
    need(result.returncode == 0 and result.stdout == b'CONFIG_VALIDATED\n', 'PROTECTED_CONFIG_VALIDATION')

def proc_record(pid):
    p = Path('/proc') / str(pid)
    info = p.joinpath('stat').read_text().rsplit(') ', 1)[1].split()
    return {'pid': pid, 'startTicks': info[19], 'state': info[0], 'uid': p.stat().st_uid,
            'executable': os.readlink(p / 'exe'), 'cwd': os.readlink(p / 'cwd'),
            'argv': p.joinpath('cmdline').read_bytes().rstrip(b'\0').decode().split('\0')}

def matches(record):
    try:
        actual = proc_record(record['pid'])
        # Next changes process.title (and /proc/cmdline) after launch. Ownership
        # is bound to start ticks, uid, executable and cwd; argv is evidence only.
        return all(actual[k] == record[k] for k in ('pid', 'startTicks', 'uid', 'executable', 'cwd'))
    except (FileNotFoundError, ProcessLookupError):
        return False

def listeners():
    found = []
    for name in ('tcp', 'tcp6'):
        for line in Path('/proc/net', name).read_text().splitlines()[1:]:
            cols = line.split()
            if cols[3] != '0A':
                continue
            host, port = cols[1].split(':')
            if int(port, 16) in PORTS.values():
                found.append({'family': name, 'address': host, 'port': int(port, 16), 'inode': cols[9]})
    return found

def assert_listeners(owners):
    found = listeners()
    need(len(found) == 3, 'THREE_LISTENERS')
    for role, record in owners.items():
        need(matches(record), 'OWNED_PROCESS_IDENTITY')
        inode_set = set()
        for fd in Path('/proc', str(record['pid']), 'fd').iterdir():
            try:
                link = os.readlink(fd)
                if link.startswith('socket:['):
                    inode_set.add(link[8:-1])
            except FileNotFoundError:
                pass
        rows = [x for x in found if x['port'] == PORTS[role]]
        need(len(rows) == 1 and rows[0]['family'] == 'tcp' and rows[0]['address'] == '0100007F' and
             rows[0]['inode'] in inode_set, 'LOOPBACK_OWNED_LISTENER')

class LoopbackTLS(http.client.HTTPSConnection):
    def connect(self):
        self.sock = self._context.wrap_socket(socket.create_connection(('127.0.0.1', self.port), self.timeout),
                                              server_hostname='localhost')

def identity_probe(port, path, tls=False):
    if tls:
        context = ssl.create_default_context(cafile=str(R / 'tls/ca.crt'))
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        connection = LoopbackTLS('localhost', port, context=context, timeout=3)
    else:
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
    try:
        connection.request('GET', path, headers={'Host': f'localhost:{port}', 'Connection': 'close'})
        response = connection.getresponse()
        raw = response.read(16385)
        need(response.status == 200 and len(raw) <= 16384, 'IDENTITY_HTTP_RESPONSE')
        return json.loads(raw)
    finally:
        connection.close()

def four_identities(identity):
    result = {}
    for role, port, path, tls in [('directApi', PORTS['api'], '/api/health', False), ('directWeb', PORTS['web'], '/build-info', False),
                                   ('tlsApi', PORTS['proxy'], '/api/health', True), ('tlsWeb', PORTS['proxy'], '/build-info', True)]:
        actual = identity_probe(port, path, tls)
        need(identity_equal(actual, identity) and actual.get('runtimeCommit') == COMMIT, 'FOUR_RUNTIME_IDENTITIES')
        need(actual.get('service') == ('feishu-timeline-api' if path == '/api/health' else 'feishu-timeline-web') and
             (path != '/api/health' or actual.get('status') == 'ok'), 'IDENTITY_SERVICE_HEALTH')
        result[role] = {k: actual[k] for k in ID_KEYS}
    return result

def stop_owned(owners):
    rows = []
    for role in ('proxy', 'web', 'api'):
        record = owners.get(role)
        if not record:
            continue
        try:
            pidfd = os.pidfd_open(record['pid'])
        except ProcessLookupError:
            rows.append({'role': role, 'alreadyExited': True})
            continue
        try:
            process_stat = Path('/proc', str(record['pid']), 'stat').read_text().rsplit(') ', 1)[1].split()
            if process_stat[19] == record['startTicks'] and process_stat[0] == 'Z':
                rows.append({'role': role, 'alreadyExited': True})
                continue
            need(matches(record), 'STOP_OWNERSHIP_MISMATCH')
            signal.pidfd_send_signal(pidfd, signal.SIGTERM)
        except (FileNotFoundError, ProcessLookupError):
            rows.append({'role': role, 'alreadyExited': True})
            continue
        finally:
            os.close(pidfd)
        rows.append({'role': role, 'sigtermSent': True, 'pid': record['pid'], 'startTicks': record['startTicks']})
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if not any(matches(record) for record in owners.values()):
            need(not listeners(), 'OWNED_PORTS_NOT_CLOSED')
            return rows
        time.sleep(0.25)
    raise RuntimeError('CHECK_GRACEFUL_STOP_TIMEOUT_NO_FORCE_KILL')

def run_dir(run):
    need(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', run), 'RUN_NAME')
    canonical(RUNS)
    return RUNS / run

def start(run, quota_path, quota_hash, scanner_path, scanner_hash):
    _, identity, env = validate_prepared()
    gate = bind_prestart_evidence(quota_path, quota_hash, scanner_path, scanner_hash)
    need(not listeners(), 'APPLICATION_PORT_OCCUPIED')
    out = run_dir(run)
    out.mkdir(mode=0o700)
    canonical(LOGS)
    need(LOGS.stat().st_uid == UID and stat.S_IMODE(LOGS.stat().st_mode) == 0o700, 'PRIVATE_LOG_DIRECTORY')
    logdir = LOGS / run
    logdir.mkdir(mode=0o700)
    write_new(out / 'claim.json', {'at': utc(), 'identity': identity, 'externalGates': gate,
                                 'packagePinFileSha256': PIN_FILE_SHA, 'packageBinding': package_pins(), 'bootId': BOOT})
    owners = {}
    children = []
    child_pidfds = []
    report = {'at': utc(), 'identity': identity, 'externalGates': gate, 'status': 'STARTING',
              'packagePinFileSha256': PIN_FILE_SHA, 'packageBinding': package_pins(),
              'artifact': str(ART), 'node': str(NODE),
              'applicationStdoutStderr': 'Retained in private 0700 directory / 0600 files; never included in public receipt.',
              'privateLogDirectory': str(logdir),
              'migrationOrSeedInvoked': False, 'notificationTimersEnabled': False, 'quotaTimerDisabled': False}
    try:
        definitions = [('api', ART / 'apps/api', [str(NODE), '--max-old-space-size=512', 'dist/main.js'], env),
                       ('web', ART / 'runtime/apps/web', [str(NODE), '--max-old-space-size=768', 'server.js'],
                        {k: v for k, v in env.items() if k.startswith('EXPECTED_') or k in {'NODE_ENV', 'DEPLOYMENT_ENV'}}),
                       ('proxy', R, [str(NODE), '--max-old-space-size=64', str(PROXY)], {})]
        for role, cwd, argv, role_env in definitions:
            guard()
            extra = {'PORT': str(PORTS['web']), 'HOSTNAME': '127.0.0.1'} if role == 'web' else {}
            with (logdir / f'{role}.log').open('xb') as log:
                child = subprocess.Popen(argv, cwd=cwd, env={**BASE_ENV, **role_env, **extra},
                                         stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                         close_fds=True, start_new_session=True, preexec_fn=child_limits)
            children.append(child)
            # An unreaped child PID cannot be reused before this stable handle opens.
            child_pidfds.append((role, os.pidfd_open(child.pid)))
            record = proc_record(child.pid)
            need(record['uid'] == UID and record['executable'] == str(NODE.resolve()) and
                 record['cwd'] == str(cwd), 'NEW_PROCESS_OWNERSHIP')
            record['launchedArgv'] = argv
            owners[role] = record
            write_new(out / f'owned-{role}.json', record)
        deadline = time.monotonic() + 75
        while True:
            guard()
            need(all(child.poll() is None for child in children), 'CHILD_EXIT_BEFORE_READY')
            try:
                assert_listeners(owners)
                report['identities'] = four_identities(identity)
                break
            except (OSError, ValueError, http.client.HTTPException, RuntimeError):
                need(time.monotonic() < deadline, 'START_READINESS_DEADLINE')
                time.sleep(0.5)
        report.update(status='STARTED_IDENTITY_AND_LISTENERS_VERIFIED_ONLY', owners=owners,
                      listenerEvidence=listeners(), finishedAt=utc())
    except BaseException as exc:
        report.update(status='START_FAILED', failureCode=safe_error(exc), owners=owners,
                      childExitCodes=[child.poll() for child in children])
        try:
            for role, pidfd in child_pidfds:
                if role not in owners:
                    try:
                        signal.pidfd_send_signal(pidfd, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
            report['failedStartCleanup'] = stop_owned(owners)
        except BaseException as cleanup:
            report['cleanupFailureCode'] = safe_error(cleanup)
        report['finishedAt'] = utc()
        write_new(out / 'result.json', report)
        raise
    finally:
        for _, pidfd in child_pidfds:
            os.close(pidfd)
    write_new(out / 'result.json', report)
    return report

def owners_for(out):
    canonical(out)
    claim = jsread(out / 'claim.json')
    need(claim.get('identity', {}).get('sourceCommit') == COMMIT and
         claim.get('identity', {}).get('sourceTree') == TREE and
         claim.get('bootId') == BOOT and claim.get('packagePinFileSha256') == PIN_FILE_SHA and claim.get('packageBinding') == package_pins(),
         'OWNERSHIP_CANDIDATE')
    owners = {role: jsread(out / f'owned-{role}.json') for role in PORTS if (out / f'owned-{role}.json').exists()}
    need(owners, 'OWNERSHIP_RECORDS_REQUIRED')
    expected_cwd = {'api': str(ART / 'apps/api'), 'web': str(ART / 'runtime/apps/web'), 'proxy': str(R)}
    for role, record in owners.items():
        need(type(record.get('pid')) is int and record['pid'] > 1 and
             re.fullmatch(r'[0-9]+', record.get('startTicks', '')) and record.get('uid') == UID and
             record.get('executable') == str(NODE.resolve()) and record.get('cwd') == expected_cwd[role], 'OWNERSHIP_RECORD_SHAPE')
    return owners

def safe_error(exc):
    value = str(exc)
    return value if re.fullmatch(r'CHECK_[A-Z0-9_]{1,100}', value) else 'CHECK_UNEXPECTED_ERROR'
