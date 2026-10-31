#!/usr/bin/env python3
"""Normal lifecycle of the exact joint API/Web on the existing recovery VM.

Uses delivered, pinned runtime primitives. No instance creation, database writes,
shared-service control, old-candidate rollback or implicit process discovery.
Each mutation requires the current external state digest and an instance lock.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import select
import signal
import stat
import subprocess
import sys
import time
import types

HERE = Path(__file__).resolve().parent
ROOT = Path('/home/recovery/joint-lifecycle-3a11-r01')
APP = Path('/home/recovery/application-joint-3a11-r01')
NODE = Path('/home/recovery/offline-software-r30-3941bec-r01/runtime/node24/bin/node')
BOOT = '9fee751f-120b-451e-9b1b-b17eac34bf98'
IDENTITY = {'sourceCommit': '3a11b23edd291869d29331d2abc089d2ae6fbc67',
            'sourceTree': '8cc6afd7566142a967fd265b4a4f6b14f0c1f000',
            'release': 'truck-joint-3a11b23edd29-r01', 'buildTime': '2026-10-30T07:14:36Z'}
INITIAL = Path('/home/recovery/joint-preview-3a11-r01/events/switch-r01/result.json')
INITIAL_SHA = '6717b032593de6e240ccbebe342fa997e58ba819821a66ac35546516a6512b8e'
DELTA = Path('/home/recovery/input-joint-delivery-20261031-r01/delta')
DELTA_SHA = '97b61b6b5957e5639b806a4ffdb2283eeb7c44a941f6902dfd546a68583ebedd'
PORTS = {'api': 3591, 'web': 3592}
TARGETS = {
    'joint3a11': {'identity': IDENTITY, 'application': str(APP),
                 'delta': str(DELTA), 'deltaSha256': DELTA_SHA},
    'layout5b07': {
        'identity': {'sourceCommit': '5b07fe3404cb83d485b924b9fdc65f1a1a18ddf0',
                     'sourceTree': '3122780c1149a496d7bd58c19cb7e88d1c1c6816',
                     'release': 'truck-layout-5b07fe3404cb-r01', 'buildTime': '2026-10-31T03:14:40Z'},
        'application': '/home/recovery/application-layout-5b07-r01',
        'delta': '/home/recovery/input-layout-lifecycle-20261031-r01/delta',
        'deltaSha256': 'bb5c7d58cbe8f4433abb3509f707e7aae2a41b4c860005d82dfc7bab9d8dcb43'},
    'workbook9c412dd': {
        'identity': {'sourceCommit': '9c412ddf892db584633d3e083781e8bfc393fba5',
                     'sourceTree': 'dde64d42b3f35b23bde0d53a21872f4ab1a37e55',
                     'release': 'truck-workbook-return-9c412ddf892d-r01', 'buildTime': '2026-10-31T05:03:04Z'},
        'application': '/home/recovery/application-workbook-9c412dd-r01',
        'delta': '/home/recovery/input-workbook-lifecycle-20261031-r01/delta',
        'deltaSha256': '77f6b2593ab32bbd180bf2c81a6cf310880c100a1ef051b0f3843e4ec17e1862'},
}
ctx = {}


def need(ok, code):
    if not ok:
        raise RuntimeError('CHECK_' + code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path, digest=None, maximum=256*1024):
    path = Path(path); s = path.lstat()
    need(path.is_absolute() and path.resolve(strict=True) == path and stat.S_ISREG(s.st_mode)
         and s.st_nlink == 1 and s.st_uid == s.st_gid == 1100 and
         stat.S_IMODE(s.st_mode) == 0o600 and s.st_size <= maximum, 'PUBLIC_FILE')
    with os.fdopen(os.open(path, os.O_RDONLY|os.O_NOFOLLOW), 'rb') as f:
        opened = os.fstat(f.fileno()); raw = f.read(maximum+1); after = os.fstat(f.fileno())
    sig = lambda v: (v.st_dev,v.st_ino,v.st_mode,v.st_size,v.st_mtime_ns,v.st_ctime_ns)
    need(len(raw) == s.st_size and sig(s) == sig(opened) == sig(after) == sig(path.lstat()), 'PUBLIC_FILE_CHANGED')
    need(digest is None or re.fullmatch('[a-f0-9]{64}', digest) and sha(raw) == digest, 'PUBLIC_DIGEST')
    return raw


def packed(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'))+'\n').encode()


def syncdir(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)


def write(path, value):
    raw = packed(value); need(len(raw) <= 256*1024, 'RECEIPT_SIZE')
    fd = os.open(path, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(raw); f.flush(); os.fsync(f.fileno())
    syncdir(Path(path).parent)
    return sha(raw)


def private_dir(path):
    if not path.exists():
        path.mkdir(mode=0o700)
    s=path.lstat()
    need(path.resolve(strict=True)==path and stat.S_ISDIR(s.st_mode) and
         s.st_uid==s.st_gid==1100 and stat.S_IMODE(s.st_mode)==0o700, 'PRIVATE_DIRECTORY')


def instance_lock():
    private_dir(ROOT)
    path=ROOT/'lifecycle.lock'
    fd=os.open(path,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    try:
        s=os.fstat(fd)
        need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid==s.st_gid==1100
             and stat.S_IMODE(s.st_mode)==0o600, 'LOCK_METADATA')
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:need(False,'LIFECYCLE_BUSY')
        return fd
    except BaseException:
        os.close(fd);raise


def boot():
    need(sys.flags.isolated and os.getuid()==os.geteuid()==os.getgid()==1100 and
         os.uname().nodename=='lima-truck-color-recovery-r24-20261025' and
         Path('/proc/sys/kernel/random/boot_id').read_text().strip()==BOOT, 'EXECUTION_SCOPE')


def expected(role):
    need(role in PORTS, 'APPLICATION_ROLE')
    cwd=APP/('apps/api' if role=='api' else 'runtime/apps/web')
    argv=[str(NODE),'--max-old-space-size='+('512' if role=='api' else '768'),
          str(APP/'apps/api/dist/main.js') if role=='api' else 'server.js']
    return str(cwd),argv


def validate_owner(role, owner):
    cwd,argv=expected(role)
    need(isinstance(owner,dict) and type(owner.get('pid')) is int and owner['pid']>1 and
         re.fullmatch('[0-9]+',owner.get('startTicks','')) and owner.get('uid')==1100 and
         owner.get('executable')==str(NODE) and owner.get('cwd')==cwd and owner.get('argv')==argv,
         'APPLICATION_OWNER_SCOPE')


def current(owner):
    p=Path('/proc')/str(owner['pid'])
    try:
        raw=(p/'stat').read_text(); parts=raw[raw.rfind(')')+2:].split()
        if parts[0]=='Z':return 'EXITED'
        if parts[19]!=owner['startTicks'] or p.stat().st_uid!=owner['uid']:return 'STALE'
        if os.readlink(p/'exe')!=owner['executable'] or os.readlink(p/'cwd')!=owner['cwd']:return 'STALE'
        # Next changes process.title after launch. The bound launch recipe is
        # evidence; live ownership uses PID/start ticks/UID/executable/cwd.
        return 'RUNNING'
    except FileNotFoundError:
        return 'EXITED'


def listening_ports():
    found=set()
    for name in ('tcp','tcp6'):
        for line in Path('/proc/net',name).read_text().splitlines()[1:]:
            columns=line.split()
            # TIME_WAIT and historical connection rows are not listeners.
            if columns[3]=='0A':found.add(int(columns[1].split(':')[-1],16))
    return found & set(PORTS.values())


def bind_target(binding):
    """Two explicit, reviewed candidates share one existing instance lock."""
    global APP, IDENTITY, DELTA, DELTA_SHA
    if binding.get('kind') == 'R30_JOINT_APPLICATION_LIFECYCLE_V1':
        target = TARGETS['joint3a11']
    else:
        need(binding.get('kind') == 'R30_JOINT_APPLICATION_LIFECYCLE_V2' and
             binding.get('target') in TARGETS, 'TARGET_BINDING')
        target = TARGETS[binding['target']]
    need(binding.get('identity') == target['identity'] and
         binding.get('application') == target['application'] and
         binding.get('bootId') == BOOT and binding.get('root') == str(ROOT), 'BINDING_SCOPE')
    APP, IDENTITY = Path(target['application']), target['identity']
    DELTA, DELTA_SHA = Path(target['delta']), target['deltaSha256']


def stopped_predecessor(value, path, digest):
    """Only an externally pinned actual normal stop can bridge identities."""
    binding, args = ctx['binding'], ctx['args']
    predecessor = binding.get('predecessor', {})
    source = TARGETS.get(predecessor.get('target'), {})
    need(binding.get('kind') == 'R30_JOINT_APPLICATION_LIFECYCLE_V2' and args.action == 'start'
         and set(predecessor) == {'target', 'path', 'sha256'} and source and
         source['identity'] != IDENTITY and value.get('identity') == source['identity'] and
         predecessor['path'] == str(path) and predecessor['sha256'] == digest,
         'STOPPED_PREDECESSOR_BINDING')
    need(value.get('kind') == 'JOINT_APPLICATION_LIFECYCLE_RESULT_V1' and
         value.get('action') == 'stop' and value.get('status') == 'JOINT_LIFECYCLE_STOPPED' and
         value.get('owners') == {} and value.get('bootId') == BOOT and
         not any(value.get(k) for k in ('unresolvedChildren', 'errorCode', 'cleanupIncomplete',
                                       'cleanupFailureCode', 'statePublicationUncertain')) and
         not (ROOT/'pending.json').exists(), 'PREDECESSOR_NOT_NORMAL_STOP')
    need(re.fullmatch('[a-f0-9]{64}', value.get('claimSha256', '')) is not None,
         'PREDECESSOR_CLAIM_DIGEST')
    claim = json.loads(read(path.parent/'claim.json', value.get('claimSha256')))
    need(claim.get('identity') == source['identity'] and claim.get('bootId') == BOOT and
         claim.get('event') == path.parent.name and claim.get('action') == 'stop' and
         claim.get('bindingSha256') == value.get('bindingSha256') and
         claim.get('previousStateSha256') == value.get('previousStateSha256'), 'PREDECESSOR_CLAIM')
    ctx['transitionOrigin'] = dict(predecessor)


def state(expected_sha, discover=False):
    pointer=ROOT/'state.json'
    if not pointer.exists():
        need(IDENTITY == TARGETS['joint3a11']['identity'] and
             ctx.get('binding', {}).get('kind', 'R30_JOINT_APPLICATION_LIFECYCLE_V1') ==
             'R30_JOINT_APPLICATION_LIFECYCLE_V1', 'NEW_TARGET_REQUIRES_STATE')
        need(discover or expected_sha==INITIAL_SHA,'INITIAL_EXTERNAL_STATE')
        expected_sha=INITIAL_SHA
        source=json.loads(read(INITIAL,INITIAL_SHA))
        need(source['status']=='JOINT_PREVIEW_RUNNING' and source['identity']==IDENTITY and source['bootId']==BOOT,
             'INITIAL_RUNNING_RECEIPT')
        owners=source['after']['owners']
        value={'bootId':BOOT,'identity':IDENTITY,'owners':{r:owners[r] for r in PORTS},
               'proxyOwner':owners['proxy'],'status':'RUNNING','sourceReceipt':str(INITIAL)}
    else:
        p=json.loads(read(pointer));need(discover or p['sha256']==expected_sha,'STALE_STATE_ARGUMENT')
        expected_sha=p['sha256']
        path=Path(p['path'])
        need(path.parent.parent==ROOT/'events' and path.name=='result.json','STATE_RECEIPT_PATH')
        value=json.loads(read(path,expected_sha))
        ctx['stateReceiptPath']=path
        need(value['bootId']==BOOT,'STATE_IDENTITY_OR_BOOT')
        if value['identity'] != IDENTITY:
            stopped_predecessor(value, path, expected_sha)
    need(set(value['owners'])<=set(PORTS),'STATE_OWNER_ROLES')
    for role,owner in value['owners'].items():validate_owner(role,owner)
    ctx['previousStateSha256']=expected_sha
    return value


def resolve_published_pending(value):
    """Finish only an exactly identified, already published operation."""
    pending=ROOT/'pending.json'
    if not pending.exists():return
    p=json.loads(read(pending));event=p.get('event','')
    need(re.fullmatch('[a-z0-9][a-z0-9-]{0,47}',event) and
         ctx.get('stateReceiptPath')==ROOT/'events'/event/'result.json' and
         p.get('claim')==str(ROOT/'events'/event/'claim.json') and
         p.get('claimSha256')==value.get('claimSha256') and
         not value.get('unresolvedChildren'), 'UNRESOLVED_PRIOR_OPERATION')
    claim=json.loads(read(Path(p['claim']),p['claimSha256']))
    need(claim.get('identity')==IDENTITY and claim.get('bootId')==BOOT and
         claim.get('event')==event and claim.get('action')==value.get('action') and
         claim.get('bindingSha256')==value.get('bindingSha256') and
         claim.get('previousStateSha256')==value.get('previousStateSha256'), 'PUBLISHED_CLAIM_BINDING')
    pending.unlink();syncdir(ROOT)


def inspect(value):
    owners={role:current(owner) for role,owner in value['owners'].items()}
    ports=sorted(listening_ports())
    if value.get('unresolvedChildren'):
        return {'status':'UNRESOLVED_CHILD','owners':owners,'listeningPorts':ports,
                'unresolvedChildren':value['unresolvedChildren']}
    status='RUNNING' if len(owners)==2 and all(v=='RUNNING' for v in owners.values()) else (
        'STOPPED' if all(v=='EXITED' for v in owners.values()) and not ports else 'PARTIAL_OR_STALE')
    return {'status':status,'owners':owners,'listeningPorts':ports}


def stop_owned(value):
    # No configuration, health, scanner, DB or capacity dependency on this path.
    handles=[];results=[]
    try:
        for role in ('web','api'):
            owner=value['owners'].get(role)
            if owner is None:continue
            validate_owner(role,owner);boot()
            observed=current(owner);need(observed!='STALE','OWNER_REUSED_OR_CHANGED')
            if observed=='EXITED':results.append({'role':role,'alreadyExited':True});continue
            try:fd=os.pidfd_open(owner['pid'])
            except ProcessLookupError:
                results.append({'role':role,'alreadyExited':True});continue
            handles.append((role,owner,fd))
            need(current(owner)=='RUNNING','OWNER_CHANGED_AFTER_PIDFD')
        for role,owner,fd in handles:
            boot();observed=current(owner)
            if observed=='EXITED':
                results.append({'role':role,'alreadyExited':True});continue
            need(observed=='RUNNING','OWNER_CHANGED_BEFORE_SIGNAL')
            signal.pidfd_send_signal(fd,signal.SIGTERM)
            poll=select.poll();poll.register(fd,select.POLLIN)
            need(bool(poll.poll(45000)),'NORMAL_STOP_TIMEOUT')
            results.append({'role':role,'pid':owner['pid'],'startTicks':owner['startTicks'],'normalExit':True})
    finally:
        for _,_,fd in handles:os.close(fd)
    need(not listening_ports(),'APPLICATION_PORT_NOT_FREE')
    return results


def load_module(name):
    row=ctx['binding']['files'][name];raw=read(HERE/name,row['sha256'])
    need(len(raw)==row['bytes'],'HELPER_SIZE')
    m=types.ModuleType(name[:-3]);m.__file__=str(HERE/name)
    exec(compile(raw,m.__file__,'exec'),m.__dict__)
    return m


def prepare_runtime(value):
    j=load_module('joint_preview.py');o=load_module('api_overlay.py');j.o=o
    m=load_module('preview-common.py');m.INPUT=HERE
    old_pins,plan=m.load(o.LEGACY_PINS_SHA)
    rv=load_module('runtime-preview.py');rv.INPUT=HERE;rv.m=m;rv.plan=plan
    rv.PINS_SHA,rv.MANIFEST_SHA,rv.COPY_SHA=o.LEGACY_PINS_SHA,o.APP_SHA,o.ASSEMBLY_SHA
    rv.initialize(False)
    _,old_id,old_env=rv.validate_existing_configuration()
    need(not {'NODE_OPTIONS','NODE_PATH','LD_PRELOAD'}&set(old_env),'ENVIRONMENT_INJECTION')
    o.INPUT=HERE;o.ROOT=ROOT;j.ROOT=ROOT;j.INPUT=HERE
    j.APP=APP;j.IDENTITY=IDENTITY
    o.ctx.update(args=ctx['args'],pins=ctx['binding'],m=m,base=rv.base,observe=rv.observe,
                 native=rv.NATIVE_PROOF,old_id=old_id,old_env=old_env,event=ctx['event'],logs=ctx['logs'])
    j.ctx.update(original={'proxy':value['proxyOwner']},priorIdentities={},children=[],
                 proxyListener=[r for r in rv.base.listeners() if r['port']==45464])
    j.retained()
    ctx.update(j=j,o=o)
    o.resources(True,'prepare')
    checker=load_module('application_delta.py')
    _,old,rows=checker.contract(DELTA,DELTA_SHA,o.ART.parent/'application-manifest.json')
    started=time.monotonic()
    def guard():need(time.monotonic()-started<=90,'APPLICATION_VERIFY_DEADLINE')
    checker.verify_tree(o.ART,old,guard,old_base=True)
    cache=load_module('joint_runtime_cache.py');extra,proof=cache.promoted_rows(APP,rows,checker,guard)
    checker.verify_tree(APP,{**rows,**extra},guard,base=o.ART)
    o.write(ctx['event']/'runtime-public-icon-cache.json',proof)
    for root in (APP,APP/'apps/api',APP/'runtime/apps/web'):
        for name in ('.env','.env.local','.env.production','.env.production.local'):
            need(not os.path.lexists(root/name),'NO_DOTENV')
    j.config_preflight()
    return j,o


def start_owned(value):
    j,o=ctx['j'],ctx['o']
    need(not listening_ports() and all(current(v)=='EXITED' for v in value['owners'].values()),'START_REQUIRES_STOPPED_APPS')
    o.resources(True,'switch-post-stop')
    before=o.quota('pre')
    owners={}
    try:
        for role in ('api','web'):owners[role]=spawn_owned(role)
        result=j.observe(owners,True);after=o.quota('post');o.resources(False,'switch-post-verify')
        return owners,{'after':result,'quotaPre':before,'quotaPost':after}
    except BaseException as original:
        # Cleanup attempts both direct children even if one cleanup fails.
        try:ctx['startCleanup']=j.cleanup('normal-start')
        except BaseException as cleanup:ctx['cleanupFailureCode']=safe_code(cleanup)
        raise


def spawn_owned(role):
    """Use the existing launch/observe primitives with durable ownership records."""
    j,o=ctx['j'],ctx['o'];cwd,argv=expected(role)
    j.retained();need(j.free(role),'APP_PORT_OCCUPIED')
    write(ctx['event']/('normal-'+role+'-intent.json'),
          {'role':role,'bootId':BOOT,'cwd':cwd,'argv':argv,'identity':IDENTITY})
    with (ctx['logs']/('normal-'+role+'.log')).open('xb') as stream:
        child=subprocess.Popen(argv,cwd=cwd,env=j.environment(role,True),stdin=subprocess.DEVNULL,
                               stdout=stream,stderr=subprocess.STDOUT,close_fds=True,
                               start_new_session=True,preexec_fn=lambda:o.limits(4*1024**2))
    item={'child':child,'fd':None,'role':role};j.ctx['children'].append(item)
    owner=o.ctx['base'].proc_record(child.pid)
    owner['argv']=argv
    validate_owner(role,owner);item['owner']=owner
    write(ctx['event']/('normal-'+role+'-owner.json'),{**owner,'bootId':BOOT})
    item['fd']=os.pidfd_open(child.pid)
    until=time.monotonic()+60
    while time.monotonic()<until:
        need(child.poll() is None,'APP_EARLY_EXIT')
        try:
            j.listener(role,owner);return owner
        except o.Rejected as error:
            if str(error)!='CHECK_APP_LISTENER':raise
        time.sleep(.2)
    need(False,'APP_READY_TIMEOUT')


def safe_code(error):
    code=str(error)
    return code if re.fullmatch('CHECK_[A-Z0-9_]+',code) else 'CHECK_LIFECYCLE_INTERNAL'


def finish(value, report):
    report.update(kind='JOINT_APPLICATION_LIFECYCLE_RESULT_V1',identity=IDENTITY,bootId=BOOT,
                  previousStateSha256=ctx['previousStateSha256'],proxyOwner=value['proxyOwner'],
                  bindingSha256=ctx['args'].binding_sha256,claimSha256=ctx['claimSha256'])
    if 'transitionOrigin' in ctx:report['transitionOrigin']=ctx['transitionOrigin']
    digest=write(ctx['event']/'result.json',report)
    pointer={'path':str(ctx['event']/'result.json'),'sha256':digest}
    temp=ROOT/('state-'+ctx['args'].event+'.tmp');write(temp,pointer)
    # The current pointer is mutable; historical results are always exclusive.
    if (ROOT/'state.json').exists():
        old=json.loads(read(ROOT/'state.json'));need(old['sha256']==ctx['previousStateSha256'],'STATE_CHANGED_DURING_LOCK')
    os.replace(temp,ROOT/'state.json')
    # After atomic publication, ownership is externally discoverable. A later
    # receipt/transport error must not silently stop the published applications.
    ctx['statePublished']=True
    syncdir(ROOT)
    # Only this transient pointer is removed; its immutable claim stays in event.
    pending=json.loads(read(ROOT/'pending.json'))
    need(pending['event']==ctx['args'].event,'PENDING_CLAIM_CHANGED')
    if not report.get('unresolvedChildren'):(ROOT/'pending.json').unlink();syncdir(ROOT)
    if 'j' in ctx:ctx['j'].release_handles()
    print(json.dumps({'status':report['status'],'path':pointer['path'],'sha256':digest}),flush=True)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('action',choices=('status','start','stop','restart'))
    p.add_argument('--execute-reviewed',action='store_true');p.add_argument('--binding-sha256')
    p.add_argument('--expected-state-sha256');p.add_argument('--event');p.add_argument('--budget-channel-stdio',action='store_true')
    a=p.parse_args()
    if not a.execute_reviewed:
        print(json.dumps({'status':'PLAN_ONLY','actions':['status','start','stop','restart'],'components':['api','web']}));return
    boot();need(re.fullmatch('[a-f0-9]{64}',a.binding_sha256 or ''),'EXTERNAL_BINDING_DIGEST')
    binding=json.loads(read(HERE/'binding.json',a.binding_sha256))
    bind_target(binding)
    row=binding['files']['joint_lifecycle.py'];need(sha(read(Path(__file__)))==row['sha256'],'EXECUTION_FILE_PIN')
    ctx.update(args=a,binding=binding)
    lock=instance_lock()
    try:
        value=state(a.expected_state_sha256,discover=a.action=='status')
        if a.action=='status':
            print(json.dumps({'status':'JOINT_LIFECYCLE_STATUS','stateSha256':ctx['previousStateSha256'],
                              'observed':inspect(value),'pendingClaim':
                              json.loads(read(ROOT/'pending.json')) if (ROOT/'pending.json').exists() else None}));return
        resolve_published_pending(value)
        need(re.fullmatch('[a-z0-9][a-z0-9-]{0,47}',a.event or ''),'EVENT_NAME')
        for path in (ROOT/'events',ROOT/'private'):private_dir(path)
        event=ROOT/'events'/a.event;logs=ROOT/'private'/a.event
        event.mkdir(mode=0o700);logs.mkdir(mode=0o700);ctx.update(event=event,logs=logs)
        syncdir(event.parent);syncdir(logs.parent)
        claim={'event':a.event,'action':a.action,'previousStateSha256':a.expected_state_sha256,
               'bindingSha256':a.binding_sha256,'bootId':BOOT,'identity':IDENTITY,'ownersBefore':value['owners']}
        if 'transitionOrigin' in ctx:claim['transitionOrigin']=ctx['transitionOrigin']
        claim_sha=write(event/'claim.json',claim)
        ctx['claimSha256']=claim_sha
        write(ROOT/'pending.json',{'event':a.event,'claim':str(event/'claim.json'),'claimSha256':claim_sha})
        report={'action':a.action,'status':'FAILED_PRESERVED','owners':dict(value['owners'])}
        try:
            if a.action in ('start','restart'):
                need(a.budget_channel_stdio,'START_REQUIRES_BUDGET_CHANNEL')
                prepare_runtime(value)
            if a.action in ('stop','restart'):
                if a.action=='restart':ctx['o'].resources(True,'switch-pre-stop')
                report['stops']=stop_owned(value);report['owners']={}
            if a.action in ('start','restart'):
                owners,proof=start_owned(value);report.update(owners=owners,**proof,status='JOINT_LIFECYCLE_RUNNING')
            else:report['status']='JOINT_LIFECYCLE_STOPPED'
            finish(value,report)
        except BaseException as error:
            report['status']='FAILED_PRESERVED';report['errorCode']=safe_code(error)
            if not ctx.get('statePublished') and 'j' in ctx and ctx['j'].ctx.get('children'):
                try:report['failureCleanup']=ctx['j'].cleanup('operation-failure')
                except BaseException as cleanup:
                    report['cleanupFailureCode']=safe_code(cleanup);report['cleanupIncomplete']=True
            if 'cleanupFailureCode' in ctx:report['startCleanupFailureCode']=ctx['cleanupFailureCode']
            # Preserve any direct child still owned after incomplete cleanup.
            if 'j' in ctx:
                for item in ctx['j'].ctx.get('children',[]):
                    if item.get('owner') is not None:report['owners'][item['role']]=item['owner']
                    elif not item.get('cleaned'):
                        report.setdefault('unresolvedChildren',[]).append(item['role'])
            report['observed']=inspect(report)
            if not (event/'result.json').exists():finish(value,report)
            else:
                # A failed publication never overwrites a result already synced.
                # Keep the claim unresolved and report the final observed state.
                write(event/'publication-failure.json',report)
                print(json.dumps({'status':'FAILED_PRESERVED','errorCode':report['errorCode'],
                                  'preservedEvent':str(event),'statePublished':bool(ctx.get('statePublished')),
                                  'statePublicationUncertain':True}),flush=True)
            raise SystemExit(1)
    finally:
        fcntl.flock(lock,fcntl.LOCK_UN);os.close(lock)


if __name__=='__main__':
    os.umask(0o077)
    try:main()
    except Exception as error:
        code=str(error)
        print(json.dumps({'status':'FAILED_PRESERVED','errorCode':code if re.fullmatch('CHECK_[A-Z0-9_]+',code) else 'CHECK_LIFECYCLE_INTERNAL'}))
        raise SystemExit(1)
