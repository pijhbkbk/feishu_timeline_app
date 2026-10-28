#!/usr/bin/env python3
"""One official ClamAV refresh into a new directory; never change a live scanner."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import signal
import stat
import subprocess
import sys
import time
import types

HERE = Path(__file__).resolve().parent
HOME = Path('/home/recovery')
FLOOR = 1024**3
WINDOW = 320*1024**2
MAX_FILE = 128*1024**2
MAX_LOG = 1024**2
REPORT = {}


def need(ok, code):
    if not ok:
        raise RuntimeError('CHECK_'+code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def support(name, expected):
    p = HERE/name; s = p.lstat()
    need(p.resolve(strict=True) == p and stat.S_ISREG(s.st_mode) and s.st_uid == 1100 and
         s.st_nlink == 1 and not s.st_mode & 0o022 and s.st_size <= 65536, 'SUPPORT_METADATA')
    raw = p.read_bytes(); need(sha(raw) == expected, 'SUPPORT_PIN')
    m = types.ModuleType(name[:-3]); m.__file__ = str(p)
    exec(compile(raw, str(p), 'exec'), m.__dict__)
    return m


def allocation(root):
    total = count = 0
    pending = [root]
    while pending:
        p = pending.pop()
        try: s = p.lstat()
        except FileNotFoundError: continue
        count += 1
        need(count <= 4096 and s.st_uid == 1100 and not s.st_mode & 0o022 and
             not stat.S_ISLNK(s.st_mode), 'UPDATE_STORAGE_METADATA')
        need(stat.S_ISDIR(s.st_mode) or (stat.S_ISREG(s.st_mode) and s.st_nlink == 1), 'UPDATE_STORAGE_TYPE')
        total += s.st_blocks*512
        if stat.S_ISDIR(s.st_mode):
            with os.scandir(p) as entries:
                for entry in entries:
                    pending.append(Path(entry.path)); need(len(pending) <= 4096, 'UPDATE_STORAGE_BOUND')
    return total


def guard(root, m, initial=False):
    available = m.shutil.disk_usage(HOME).free
    used = allocation(root)
    memory = m.memory(initial)
    tick = time.monotonic(); observation = REPORT.setdefault('resourceObservation', {})
    observation['maximumSampleGapSeconds'] = max(observation.get('maximumSampleGapSeconds', 0),
                                                tick-observation.get('lastMonotonicSeconds', tick))
    observation.update(lastMonotonicSeconds=tick, samples=observation.get('samples', 0)+1,
                       maximumAllocatedBytes=max(used, observation.get('maximumAllocatedBytes', 0)),
                       minimumGuestFreeBytes=min(available, observation.get('minimumGuestFreeBytes', available)),
                       minimumMemAvailableBytes=min(memory, observation.get('minimumMemAvailableBytes', memory)),
                       boundary='Sampled observation, not a hard filesystem quota or proof of instantaneous peaks')
    need(available >= FLOOR and used <= WINDOW, 'UPDATE_RESOURCE_FLOOR')


def limits(mask):
    signal.pthread_sigmask(signal.SIG_SETMASK, mask)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_FILE, MAX_FILE))
    resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))


def proc(pid):
    try:
        p=Path('/proc')/str(pid); fields=(p/'stat').read_text().rsplit(') ',1)[1].split()
        return {'pid':pid,'uid':p.stat().st_uid,'state':fields[0],
                'pgid':int(fields[2]),'session':int(fields[3]),'startTicks':int(fields[19])}
    except (FileNotFoundError,ProcessLookupError): return None


def capture_group(parent, owned):
    count=0; live=[]
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit(): continue
        count+=1; need(count<=16384,'PROCESS_TABLE_BOUND')
        row=proc(int(entry.name))
        if not row or row['state']=='Z' or row['pgid']!=parent['pid'] or row['session']!=parent['pid']: continue
        need(row['uid']==1100 and row['startTicks']>=parent['startTicks'],'CREATED_GROUP_OWNER')
        key=(row['pid'],row['startTicks']); live.append(key)
        if key not in owned:
            need(len(owned)<128,'CREATED_GROUP_BOUND')
            try: fd=os.pidfd_open(row['pid'])
            except ProcessLookupError: continue
            again=proc(row['pid'])
            if not again or again['state']=='Z':os.close(fd);continue
            if any(again[k]!=row[k] for k in ('uid','pgid','session','startTicks')):
                os.close(fd);raise RuntimeError('CHECK_CREATED_GROUP_CHANGED')
            owned[key]=(fd,row)
    return live


def cleanup_group(parent, owned):
    deadline=time.monotonic()+45; attempted=set(); signaled=set()
    while True:
        live=capture_group(parent,owned)
        for key in live:
            if key not in owned or key in attempted:continue
            fd,row=owned[key]; current=proc(row['pid'])
            need(current is None or all(current[k]==row[k] for k in ('uid','pgid','session','startTicks')),'CLEANUP_OWNER_CHANGED')
            if current and current['state']!='Z':
                attempted.add(key)
                try:signal.pidfd_send_signal(fd,signal.SIGTERM);signaled.add(key)
                except ProcessLookupError:pass
        if not live or time.monotonic()>=deadline:
            return {'sigtermSent':bool(signaled),'signaledOwners':[list(k) for k in sorted(signaled)],
                    'attemptedOwners':[list(k) for k in sorted(attempted)],
                    'remainingOwners':[list(k) for k in live],'exited':not live,'forceKill':False}
        time.sleep(.1)


def run(argv, env, root, m, name, seconds):
    log = root/'logs'/(name+'.log')
    row = {'name':name, 'argv':argv, 'timeoutSeconds':seconds, 'forceKill':False}
    REPORT.setdefault('commands', []).append(row)
    child = None; parent=None; primary_fd=None; owned={}
    signals={signal.SIGTERM,signal.SIGINT}; previous={s:signal.getsignal(s) for s in signals}
    def interrupted(signum,frame):raise RuntimeError('CHECK_CONTROLLER_INTERRUPTED')
    for s in signals:signal.signal(s,interrupted)
    try:
        with log.open('xb') as output:
            mask=signal.pthread_sigmask(signal.SIG_BLOCK,signals)
            try:
                child = subprocess.Popen(argv, cwd=root, env=env, stdin=subprocess.DEVNULL,
                                         stdout=output, stderr=subprocess.STDOUT, close_fds=True,
                                         start_new_session=True, preexec_fn=lambda:limits(mask))
                fd=os.pidfd_open(child.pid);primary_fd=fd;parent=proc(child.pid)
                need(parent and parent['uid']==1100 and parent['pgid']==parent['session']==child.pid,'CREATED_PARENT_OWNER')
                owned[(child.pid,parent['startTicks'])]=(fd,parent)
                row['process']=parent
            finally:signal.pthread_sigmask(signal.SIG_SETMASK,mask)
        deadline = time.monotonic()+seconds
        while True:
            live=capture_group(parent,owned)
            if child.poll() is not None:break
            guard(root, m)
            need(time.monotonic() < deadline and log.stat().st_size <= MAX_LOG, 'UPDATE_TIME_LOG_BOUND')
            time.sleep(.1)
        need(not capture_group(parent,owned),'UPDATE_DESCENDANTS_REMAINED')
        row['exitCode'] = child.returncode
        raw = m.read(log, MAX_LOG, private=True)
        row['log'] = {'path':str(log), 'bytes':len(raw), 'sha256':sha(raw)}
        need(child.returncode == 0, 'UPDATE_COMMAND_FAILED')
        return raw
    finally:
        mask=signal.pthread_sigmask(signal.SIG_BLOCK,signals)
        try:
            if parent is not None:
                row['cleanup']=cleanup_group(parent,owned)
                if row['cleanup']['exited'] and child is not None:child.wait(timeout=1)
            elif child is not None and child.poll() is None:
                if primary_fd is not None:signal.pidfd_send_signal(primary_fd,signal.SIGTERM)
                else:child.terminate()  # this Popen child has not been reaped or reused
                row['cleanup']={'sigtermSent':True,'exited':False,'forceKill':False,
                                'scope':'created direct child; descendant ownership was not established'}
                try:child.wait(timeout=45);row['cleanup']['exited']=True
                except subprocess.TimeoutExpired:pass
        finally:
            for fd,_ in owned.values():os.close(fd)
            if primary_fd is not None and all(fd!=primary_fd for fd,_ in owned.values()):os.close(primary_fd)
            try:signal.pthread_sigmask(signal.SIG_SETMASK,mask)
            finally:
                for s,handler in previous.items():signal.signal(s,handler)


def inventory(root, m):
    rows = []
    names = {p.name for p in (root/'db').iterdir()}
    need(names in ({'main.cvd','daily.cvd','bytecode.cvd'},
                   {'main.cvd','daily.cvd','bytecode.cvd','freshclam.dat'}), 'EXACT_OFFICIAL_CVD_SET')
    for name in ('main.cvd','daily.cvd','bytecode.cvd'):
        raw = m.read(root/'db'/name, MAX_FILE, private=True)
        fields = raw[:512].decode('ascii').rstrip(' \x00\r\n').split(':')
        need(len(fields) == 9 and fields[0] == 'ClamAV-VDB', 'CVD_HEADER')
        version, signatures, epoch = int(fields[2]), int(fields[3]), int(fields[8])
        need(version > 0 and signatures > 0 and epoch > 0, 'CVD_HEADER_VALUES')
        if name == 'daily.cvd': need(0 <= time.time()-epoch <= 48*3600, 'DAILY_EXPIRED_OR_FUTURE')
        rows.append({'name':name, 'path':str(root/'db'/name), 'bytes':len(raw), 'sha256':sha(raw),
                     'version':version, 'signatures':signatures, 'buildEpoch':epoch})
    return rows


def execute(args):
    os.umask(0o077)
    need(sys.flags.isolated and os.getuid() == os.geteuid() == os.getgid() == 1100 and
         sys.platform == 'linux' and os.uname().machine == 'aarch64', 'ISOLATED_GUEST')
    m = support('prepare_instance.py', args.configuration_code_sha256)
    b = m.pinned({'path':args.binding, 'bytes':Path(args.binding).stat().st_size, 'sha256':args.binding_sha256},65536)
    need(b['kind'] == 'OFFICIAL_CVD_REFRESH_ONCE_V1' and b['bootId'] == Path('/proc/sys/kernel/random/boot_id').read_text().strip(), 'LIVE_REFRESH_BINDING')
    root = Path(b['output'])
    need(root.parent == HOME and re.fullmatch('offline-signatures-[a-z0-9-]{1,48}', root.name) and
         not root.exists() and not root.is_symlink(), 'NEW_SIGNATURE_TARGET')
    config = m.pinned(b['configurationReceipt'],65536)
    generation = m.pinned(config['targetBinding'],65536)
    need(config['status'] == 'NEW_CONFIG_GENERATED_AND_COMPILED_CONFIG_VALIDATED_NOT_STARTED' and
         config['identity'] == m.IDENTITY and config['bootId'] == generation['bootId'] and
         config['software'] == generation['software'] and config['instance'] == generation['instance'], 'HISTORICAL_CONFIGURATION_ORIGIN')
    c = support('instance_software.py', b['softwareCodeSha256'])
    c.TARGET=Path(generation['software']); c.ART=c.TARGET/'application'; c.NODE=c.TARGET/'runtime/node24/bin/node'
    # Historical native receipts retain their original boot; every referenced library is read now.
    native = m.native_admission(generation,c)
    proof=m.pinned(generation['nativeReceipt']); allowed={r['path']:r for r in proof['libraries']}
    tools={name:c.TARGET/('runtime/clamav/bin/'+name) for name in ('freshclam','sigtool')}
    for p in tools.values():
        row=allowed.get(str(p),{})
        need(type(row.get('bytes')) is int and 0<row['bytes']<=256*1024**2, 'EXACT_NATIVE_TOOL_SIZE')
        need(sha(m.read(p,row['bytes'])) == row['sha256'], 'EXACT_NATIVE_TOOL')
    budget=m.budget(generation,{'path':args.budget,'bytes':Path(args.budget).stat().st_size,'sha256':args.budget_sha256})
    need(budget['hostAllocatedBytes']+WINDOW <= 24*1024**3 and m.shutil.disk_usage(HOME).free >= FLOOR+WINDOW, 'REFRESH_CAPACITY')
    ca=Path('/etc/ssl/certs/ca-certificates.crt')
    ca_raw=m.read(ca,8*1024**2,owner=0)
    need(sha(ca_raw) == b['systemCaSha256'], 'SYSTEM_CA_PIN')
    REPORT.update(kind=b['kind'], bootId=b['bootId'], identity=m.IDENTITY, startedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                  output=str(root), nativeApplicability=native, budget=budget, signatureMaxAgeHours=48,
                  officialMirror='database.clamav.net', maximumAttempts=1, tlsVerificationDisabled=False,
                  systemCaSha256=b['systemCaSha256'], servicesStarted=False, oldSignatureFilesChanged=False,
                  sourceBindingSha256=args.binding_sha256, status='FAILED_PRESERVED')
    root.mkdir(mode=0o700)
    try:
        for name in ('db','tmp','logs'): (root/name).mkdir(mode=0o700)
        conf=(f'DatabaseOwner recovery\nDatabaseDirectory {root}/db\nDatabaseMirror database.clamav.net\n'
              'ConnectTimeout 10\nReceiveTimeout 120\nMaxAttempts 1\nScriptedUpdates yes\nTestDatabases yes\nChecks 1\nForeground yes\n')
        m.write_new(root/'freshclam.conf',conf.encode())
        libraries=':'.join([str(c.TARGET/'runtime/clamav/lib'),generation['dependencies']+'/usr/lib/aarch64-linux-gnu',generation['dependencies']+'/usr/lib/postgresql/14/lib'])
        env={'PATH':'/usr/bin:/bin','HOME':str(HOME),'TMPDIR':str(root/'tmp'),'LANG':'C','LC_ALL':'C','TZ':'UTC','CURL_CA_BUNDLE':str(ca)}
        argv=lambda name:[str(m.LOADER),'--inhibit-cache','--library-path',libraries,str(tools[name])]
        guard(root,m,initial=True)
        run(argv('freshclam')+['--config-file='+str(root/'freshclam.conf'),'--stdout'],env,root,m,'freshclam-once',600)
        rows=inventory(root,m)
        for row in rows:
            output=run(argv('sigtool')+['--info='+row['path']],env,root,m,'verify-'+row['name'][:-4],90)
            need(b'Verification OK.' in output,'OFFICIAL_SIGNATURE_VERIFICATION')
        need(rows == inventory(root,m),'SIGNATURES_CHANGED_DURING_VERIFICATION')
        guard(root,m)
        REPORT.update(status='OFFICIAL_SIGNATURE_REFRESH_VERIFIED_SCANNER_NOT_STARTED',signatures=rows)
    except BaseException as error:
        REPORT['errorCode']=str(error) if isinstance(error,RuntimeError) and re.fullmatch('CHECK_[A-Z0-9_]+',str(error)) else type(error).__name__
        raise
    finally:
        REPORT['finishedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
        m.write_new(root/'result.json',REPORT)
        print(json.dumps({'status':REPORT['status'],'receipt':str(root/'result.json'),'sha256':sha(m.read(root/'result.json',1024**2))}))


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--execute',action='store_true')
    for key in ('configuration-code-sha256','binding','binding-sha256','budget','budget-sha256'):parser.add_argument('--'+key)
    args=parser.parse_args()
    if not args.execute: print(json.dumps({'status':'PLAN_ONLY'}))
    else:
        try: execute(args)
        except Exception as error:
            code=str(error) if isinstance(error,RuntimeError) and re.fullmatch('CHECK_[A-Z0-9_]+',str(error)) else type(error).__name__
            print(json.dumps({'status':'REFRESH_FAILED_NO_AUTOMATIC_RETRY','errorCode':code}))
            raise SystemExit(1)
