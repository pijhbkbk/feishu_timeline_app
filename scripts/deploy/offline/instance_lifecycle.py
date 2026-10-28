#!/usr/bin/env python3
"""Bounded A2 runtime: reuse generated configuration; own only four new processes."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import select
import signal
import socket
import ssl
import stat
import subprocess
import sys
import time
import types
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent
INSTANCE = '/home/recovery/offline-instance-r30-a2-fresh-r01'
REDIS_SHA = '54a0ace7ff91c089ff23ee102420be96926db4bb436a50c9616440995f3dc113'
PORTS = {'api': 3594, 'web': 3595, 'proxy': 45474}
CONFIG_KEYS = ['bind', 'port', 'protected-mode', 'maxmemory', 'maxmemory-policy', 'maxclients',
               'appendonly', 'appendfsync', 'save', 'dir', 'auto-aof-rewrite-percentage',
               'aof-use-rdb-preamble', 'aof-load-truncated']
ctx = {}


def need(ok, code):
    if not ok:
        raise RuntimeError('CHECK_'+code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def raw_public(path, expected, maximum=65536):
    p = Path(path)
    need(p.is_absolute() and p.resolve(strict=True) == p, 'PUBLIC_PATH')
    s = p.lstat()
    need(stat.S_ISREG(s.st_mode) and s.st_uid == 1100 and s.st_nlink == 1 and not s.st_mode & 0o022 and s.st_size <= maximum, 'PUBLIC_METADATA')
    with os.fdopen(os.open(p, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as f:
        a = os.fstat(f.fileno()); raw = f.read(maximum+1); z = os.fstat(f.fileno())
    sig = lambda t: (t.st_dev, t.st_ino, t.st_size, t.st_mtime_ns, t.st_ctime_ns)
    need(sig(s) == sig(a) == sig(z) == sig(p.lstat()) and len(raw) == s.st_size and digest(raw) == expected, 'PUBLIC_PIN')
    return raw


def module(name, row):
    raw = raw_public(HERE/name, row['sha256'])
    need(len(raw) == row['bytes'], 'SUPPORT_SIZE')
    result = types.ModuleType(name[:-3]); result.__file__ = str(HERE/name)
    exec(compile(raw, result.__file__, 'exec'), result.__dict__)
    return result


def load(args, stopping=False):
    os.umask(0o077)
    need(sys.flags.isolated and os.getuid() == os.geteuid() == os.getgid() == 1100, 'ISOLATED_RECOVERY_USER')
    raw = raw_public(args.binding, args.binding_sha256)
    b = json.loads(raw)
    need(b.get('kind') == 'R30_A2_FRESH_INSTANCE_LIFECYCLE_V1' and b.get('executionAllowed') is True and
         b.get('instance') == INSTANCE and b.get('ports') == {'redis': 6381, **PORTS} and
         Path('/proc/sys/kernel/random/boot_id').read_text().strip() == b.get('bootId'), 'RUNTIME_BINDING')
    expected = {'prepare_instance.py', 'instance_policy.py', 'instance_software.py', 'instance_processes.py', 'instance_scanner.py'}
    need(set(b.get('files', {})) == expected, 'EXACT_SUPPORT_FILES')
    m = module('prepare_instance.py', b['files']['prepare_instance.py'])
    p = module('instance_processes.py', b['files']['instance_processes.py'])
    c = module('instance_software.py', b['files']['instance_software.py'])
    policy = module('instance_policy.py', b['files']['instance_policy.py'])
    ctx.update(binding=b, bindingSha=args.binding_sha256, m=m, p=p, c=c, policy=policy,
               run=args.run, stopping=stopping, startedChildren=[], redisOwner=None,
               startReceiptSha256=args.start_receipt_sha256)
    r = Path(INSTANCE); m.canonical(r)
    need(re.fullmatch('[a-z0-9][a-z0-9-]{0,63}', args.run), 'RUN_NAME')
    ctx['events'] = r/'lifecycle-events'; ctx['event'] = ctx['events']/args.run
    p.R=r; p.ART=Path(b['software'])/'application'; p.NODE=Path(b['software'])/'runtime/node24/bin/node'
    p.LOGS=r/'private/logs'; p.RUNS=r/'runtime-runs'; p.PROXY=r/'proxy.mjs'
    p.COMMIT=m.IDENTITY['sourceCommit']; p.TREE=m.IDENTITY['sourceTree']; p.BOOT=b['bootId']; p.PIN_FILE_SHA=args.binding_sha256
    p.PORTS=dict(PORTS); p.package_pins=lambda: {'bindingSha256':args.binding_sha256, 'instance':INSTANCE,
        'bootId':b['bootId'], 'configurationReceipt':b['configurationReceipt']}
    p.BASE_ENV={'PATH':str(p.NODE.parent)+':/usr/bin:/bin','HOME':'/home/recovery','LANG':'C.UTF-8','LC_ALL':'C.UTF-8',
                'TZ':'UTC','NO_COLOR':'1','NEXT_TELEMETRY_DISABLED':'1',
                'LD_LIBRARY_PATH':b['dependencies']+'/usr/lib/aarch64-linux-gnu:'+b['dependencies']+'/usr/lib/postgresql/14/lib'}
    p.validate_prepared=validate_configuration; p.bind_prestart_evidence=bind_gates; p.guard=resource_guard
    c.TARGET=Path(b['software']); c.ART=p.ART; c.NODE=p.NODE; c.BOOT=b['bootId']
    # Stopping deliberately skips private configuration, scanner, quota, native and capacity admission.
    if stopping:
        return
    config = m.pinned(b['configurationReceipt'], 65536)
    generation = m.pinned(config['targetBinding'], 65536)
    configuration_origin(config, generation, b)
    ctx.update(config=config, generation=generation)
    plan = m.pinned(generation['selectionPlan'], 65536)
    need(generation['selectionPlan']['sha256'] == m.PLAN_SHA and plan['identity'] == m.IDENTITY, 'FIXED_SOFTWARE_PLAN')
    m.memory(initial=args.phase == 'start')
    c.installed(plan, m.APP_SHA, m.ASSEMBLY_SHA, full=True)
    m.native_admission(generation, c)
    ctx['native'] = m.pinned(generation['nativeReceipt'])
    ctx['deps'] = m.pinned(generation['dependencyReceipt'])
    ctx['plan'] = plan
    ctx['budget'] = m.budget(generation, {'path':args.budget,'bytes':Path(args.budget).stat().st_size,'sha256':args.budget_sha256})
    scanner = module('instance_scanner.py', b['files']['instance_scanner.py'])
    ctx['scannerModule'] = scanner
    need(args.scanner_binding and args.scanner_sha256, 'CURRENT_SCANNER_INPUT')
    ctx['scanner'] = scanner.load(c, plan, {'path':args.scanner_binding,'sha256':args.scanner_sha256})
    validate_configuration()
    preserved()


def configuration_origin(config, generation, runtime):
    # Configuration is durable; its creation boot is historical provenance.
    # The caller separately checks the runtime binding against the live boot.
    need(generation['instance'] == config['instance'] == runtime['instance'] == INSTANCE and
         generation['software'] == config['software'] == runtime['software'] and
         generation['dependencies'] == runtime['dependencies'] and
         config['bootId'] == generation['bootId'] and
         re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', generation['bootId']) is not None,
         'GENERATION_BINDING')


def preserved():
    b, p = ctx['binding'], ctx['p']
    need(set(b['preservedOwners']) == {'pg','redis','scanner','api','web','proxy'}, 'PRESERVED_SIX')
    for role, owner in b['preservedOwners'].items():
        path = Path('/proc')/str(owner['pid'])
        values = path.joinpath('stat').read_text().rsplit(') ',1)[1].split()
        need(values[0] != 'Z' and values[19] == str(owner['startTicks']) and path.stat().st_uid == owner['uid'], 'DEPENDENCY_OWNER_CHANGED')
        if owner['uid'] == 1100:
            actual=p.proc_record(owner['pid'])
            need(all(actual[k] == owner[k] for k in ('executable','cwd')), 'PRESERVED_EXECUTABLE')


def validate_configuration():
    m,p,b,config,policy = (ctx[k] for k in ('m','p','binding','config','policy'))
    need(config['kind']=='R30_FRESH_INSTANCE_CONFIGURATION_RESULT_V1' and
         config['status']=='NEW_CONFIG_GENERATED_AND_COMPILED_CONFIG_VALIDATED_NOT_STARTED' and
         config['identity']==m.IDENTITY and config['instance']==INSTANCE and config['software']==b['software'] and
         config['bootId']==ctx['generation']['bootId'], 'ACTUAL_CONFIGURATION')
    for root in (p.R/'private',p.R/'objects',p.R/'redis',p.R/'tls'):
        m.canonical(root);s=root.stat();need(s.st_uid==s.st_gid==1100 and stat.S_IMODE(s.st_mode)==0o700, 'INSTANCE_DIRECTORY')
    env=json.loads(m.read(p.R/'private/runtime-env.json',16384,private=True))
    db=json.loads(m.read(p.R/'private/database-input.json',16384,private=True))
    need(set(db)=={'DATABASE_URL'} and m.database_url(db['DATABASE_URL'])==env['DATABASE_URL'], 'PERSISTED_DATABASE_INPUT')
    redis=urlsplit(env['REDIS_URL'])
    need(redis.scheme=='redis' and redis.hostname=='127.0.0.1' and redis.port==6381 and not redis.username and
         not redis.path and not redis.query and not redis.fragment and re.fullmatch('[a-f0-9]{64}',redis.password or ''), 'OWN_REDIS_CONFIGURATION')
    expected=policy.environment(db,redis.password,p.R,ctx['generation']['objectBucket'],m.IDENTITY)
    need(env==expected and config['publicConfig']=={k:v for k,v in env.items() if k not in ('DATABASE_URL','REDIS_URL')}, 'EXACT_RUNTIME_CONFIGURATION')
    need(m.read(p.R/'private/redis.conf',8192,private=True)==m.redis_text(p.R,redis.password).encode(), 'PERSISTED_REDIS_CONFIGURATION')
    need(m.read(p.PROXY,16384)==m.proxy_text(p.R,Path(b['software'])).encode() and
         m.sha(m.read(p.PROXY,16384))==config['proxySha256'], 'EXACT_PROXY')
    for name,key in [('ca.crt','caSha256'),('localhost.crt','leafSha256')]:
        need(m.sha(m.read(p.R/'tls'/name,32768))==config[key], 'PERSISTED_PUBLIC_CERTIFICATE')
    m.read(p.R/'tls/localhost.key',16384,private=True)  # stays in target process memory
    ssl.create_default_context(cafile=str(p.R/'tls/ca.crt'))
    no_dotenv(p.ART)
    p.config_check(env)
    ctx['env']=env;ctx['redisPassword']=redis.password
    return config,m.IDENTITY,env


def no_dotenv(artifact):
    for cwd in (artifact, artifact/'apps/api', artifact/'runtime/apps/web'):
        for name in ('.env','.env.local','.env.production','.env.production.local'):
            path=cwd/name
            need(not path.exists() and not path.is_symlink(),'NO_DOTENV')


def resource_guard():
    m,p=ctx['m'],ctx['p'];m.memory()
    need(m.shutil.disk_usage(m.HOME).free>=1024**3,'GUEST_DISK_FLOOR')
    total=0;count=0
    for root in (p.LOGS,p.R/'redis'):
        if not root.exists():continue
        for current,dirs,files in os.walk(root,followlinks=False):
            for name in dirs+files:
                path=Path(current)/name;s=path.lstat();count+=1
                need(count<=2048 and s.st_uid==1100 and not s.st_mode&0o022 and not stat.S_ISLNK(s.st_mode),'OWNED_RUNTIME_STORAGE')
                total+=s.st_blocks*512
    need(total<=64*1024**2,'NEW_RUNTIME_STORAGE_BOUND')
    return {'at':dt.datetime.now(dt.timezone.utc).isoformat(),'guestFreeBytes':m.shutil.disk_usage(m.HOME).free,
            'memAvailableBytes':m.memory(),'privateLogsAndRedisAllocatedBytes':total}


def redis_listener(owner):
    p=ctx['p'];need(p.matches(owner),'OWN_REDIS_PROCESS')
    rows=[]
    for family in ('tcp','tcp6'):
        for line in Path('/proc/net',family).read_text().splitlines()[1:]:
            v=line.split();address,port=v[1].split(':')
            if v[3]=='0A' and int(port,16)==6381:rows.append({'family':family,'address':address,'inode':v[9]})
    need(len(rows)==1 and rows[0]['family']=='tcp' and rows[0]['address']=='0100007F','OWN_REDIS_LOOPBACK_LISTENER')
    links=[]
    for fd in Path('/proc',str(owner['pid']),'fd').iterdir():
        try:links.append(os.readlink(fd))
        except FileNotFoundError:pass
    need('socket:['+rows[0]['inode']+']' in links,'OWN_REDIS_LISTENER_FD')
    return rows[0]


def redis_call(*command):
    need(command and command[0] in ('PING','INFO','CONFIG','DBSIZE'),'REDIS_READ_COMMAND')
    redis_listener(ctx['redisOwner'])
    with socket.create_connection(('127.0.0.1',6381),timeout=3) as sock, sock.makefile('rb') as f:
        deadline=time.monotonic()+5;received=0
        def value(depth=0):
            nonlocal received
            need(depth<=1 and time.monotonic()<deadline,'RESP_DEPTH_DEADLINE')
            sock.settimeout(max(.01,deadline-time.monotonic()));line=f.readline(1025);received+=len(line)
            need(line.endswith(b'\r\n') and len(line)<=1024 and received<=65536 and time.monotonic()<deadline,'RESP_LINE_BOUND')
            kind,raw=line[:1],line[1:-2]
            if kind==b'+':return raw.decode()
            if kind==b'-':raise RuntimeError('CHECK_REDIS_RESPONSE_ERROR')
            if kind==b':':return int(raw)
            if kind==b'$':
                n=int(raw);need(0<=n<=32768,'RESP_BULK_BOUND');sock.settimeout(max(.01,deadline-time.monotonic()))
                data=f.read(n+2);received+=len(data)
                need(len(data)==n+2 and data.endswith(b'\r\n') and received<=65536 and time.monotonic()<deadline,'RESP_BULK');return data[:-2].decode()
            need(kind==b'*' and 0<=int(raw)<=32,'RESP_ARRAY');return [value(depth+1) for _ in range(int(raw))]
        def send(parts):
            data=[str(v).encode() for v in parts]
            sock.sendall(b'*'+str(len(data)).encode()+b'\r\n'+b''.join(b'$'+str(len(v)).encode()+b'\r\n'+v+b'\r\n' for v in data))
            return value()
        need(send(['AUTH',ctx['redisPassword']])=='OK','OWN_REDIS_AUTH')
        return send(command)


def redis_ready(owner):
    ctx['redisOwner']=owner
    need(redis_call('PING')=='PONG','REDIS_PONG')
    info=lambda section:dict(line.split(':',1) for line in redis_call('INFO',section).splitlines() if ':' in line and not line.startswith('#'))
    server,persist=info('server'),info('persistence')
    need(server.get('process_id')==str(owner['pid']) and persist.get('loading')=='0' and
         persist.get('aof_enabled')=='1' and persist.get('aof_last_write_status')=='ok','OWN_REDIS_PERSISTENCE')
    expected={'bind':'127.0.0.1','port':'6381','protected-mode':'yes','maxmemory':'33554432',
              'maxmemory-policy':'noeviction','maxclients':'16','appendonly':'yes','appendfsync':'always',
              'save':'','dir':INSTANCE+'/redis','auto-aof-rewrite-percentage':'0',
              'aof-use-rdb-preamble':'no','aof-load-truncated':'no'}
    actual={}
    for key in CONFIG_KEYS:
        pair=redis_call('CONFIG','GET',key);need(isinstance(pair,list) and len(pair)==2 and pair[0]==key,'REDIS_CONFIG_RESPONSE');actual[key]=pair[1]
    need(actual==expected,'EXACT_REDIS_NONSECRET_CONFIG')
    return {'listener':redis_listener(owner),'configuration':actual,'loading':persist['loading'],
            'aofEnabled':persist['aof_enabled'],'aofLastWriteStatus':persist['aof_last_write_status'],
            'processId':server['process_id'],'databaseSize':redis_call('DBSIZE')}


def mapped_process(owner, required):
    m,p=ctx['m'],ctx['p'];need(p.matches(owner),'MAP_OWNER')
    proof=ctx['native']['libraries'] if required==str(p.NODE) else ctx['deps']['loader']['libraries']
    permitted={row['path']:row for row in proof}
    raw=Path('/proc',str(owner['pid']),'maps').read_bytes();need(len(raw)<=2*1024**2,'MAP_BOUND')
    found={}
    for line in raw.decode().splitlines():
        cells=line.split(maxsplit=5)
        if len(cells)!=6 or 'x' not in cells[1] or not cells[5].startswith('/'):continue
        name=cells[5];need(not name.endswith(' (deleted)') and name in permitted,'MAPPED_LIBRARY_NOT_IN_PROOF')
        row=permitted[name];path=Path(name);s=path.stat();dev=cells[3].split(':')
        need(path.resolve(strict=True)==path and s.st_ino==int(cells[4]) and
             os.major(s.st_dev)==int(dev[0],16) and os.minor(s.st_dev)==int(dev[1],16),'MAPPED_FILE_INODE')
        expected_uid=0 if row['delivery']=='exact-122-base' else 1100
        if name not in found:
            need(stat.S_ISREG(s.st_mode) and s.st_uid==expected_uid and not s.st_mode&0o022 and
                 s.st_nlink==1 and s.st_size<=256*1024**2,'MAPPED_FILE_METADATA')
            sig=lambda value:(value.st_dev,value.st_ino,value.st_size,value.st_mtime_ns,value.st_ctime_ns)
            bound=sig(s);fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW);total=0;hasher=hashlib.sha256()
            try:
                need(sig(os.fstat(fd))==bound,'MAPPED_FD_CHANGED')
                while True:
                    chunk=os.read(fd,1024**2)
                    if not chunk:break
                    total+=len(chunk);need(total<=s.st_size,'MAPPED_SIZE');hasher.update(chunk)
                need(sig(os.fstat(fd))==bound==sig(path.stat()) and total==s.st_size and
                     hasher.hexdigest()==row['sha256'],'MAPPED_BYTES')
            finally:os.close(fd)
            found[name]={'path':name,'bytes':total,'sha256':row['sha256'],'delivery':row['delivery']}
    need(required in found and p.matches(owner),'REQUIRED_PAYLOAD_MAP')
    return {'owner':owner,'executableFiles':list(found.values())}


def query(sql):
    m,b=ctx['m'],ctx['binding'];u=urlsplit(ctx['env']['DATABASE_URL']);m.database_url(ctx['env']['DATABASE_URL'])
    exe=b['dependencies']+'/usr/lib/postgresql/14/bin/psql'
    argv=[str(m.LOADER),'--inhibit-cache','--library-path',ctx['p'].BASE_ENV['LD_LIBRARY_PATH'],'--argv0',exe,exe,
          '-X','-q','-A','-t','--no-password','--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port','5432',
          '--username',m.DB_ROLE,'--dbname',m.DB_NAME]
    env={'PATH':'/usr/bin:/bin','HOME':'/home/recovery','LANG':'C.UTF-8','PGPASSWORD':unquote(u.password),
         'PGCONNECT_TIMEOUT':'5','PGOPTIONS':'-c default_transaction_read_only=on -c statement_timeout=15000'}
    result=subprocess.run(argv,input=('BEGIN READ ONLY; '+sql+'; COMMIT;').encode(),cwd=INSTANCE,env=env,
                          stdin=None,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=30,preexec_fn=m.child_limits)
    need(result.returncode==0 and len(result.stdout)<=65536,'A2_READONLY_QUERY')
    return json.loads(result.stdout)


def quota(phase):
    m=ctx['m']
    sql="""SELECT json_build_object('database',current_database(),'role',session_user,'readOnly',current_setting('transaction_read_only'),
    'owner',pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname=current_database())),
    'superuser',r.rolsuper,'createdb',r.rolcreatedb,'createrole',r.rolcreaterole,'replication',r.rolreplication,
    'bypassrls',r.rolbypassrls,'inherit',r.rolinherit,'connectionLimit',r.rolconnlimit,
    'memberships',(SELECT count(*) FROM pg_auth_members WHERE member=r.oid),
    'migrationNames',(SELECT json_agg(migration_name ORDER BY migration_name) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
    'incompleteMigrations',(SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL),
    'retentionIntervalExactMs',EXTRACT(EPOCH FROM make_interval(secs => 7776000))*1000,
    'unfinishedStates',(SELECT count(*) FROM attachment_storage_reservations WHERE state::text IN ('RESERVED','PURGING','RECONCILIATION_REQUIRED')),
    'expiredPurged',(SELECT count(*) FROM attachment_storage_reservations WHERE state::text='PURGED' AND "purgedAt" < now()-make_interval(secs=>7776000)),
    'purgedBecomingEligibleNext24h',(SELECT count(*) FROM attachment_storage_reservations WHERE state::text='PURGED' AND "purgedAt" >= now()-make_interval(secs=>7776000) AND "purgedAt" < now()+interval '24 hours'-make_interval(secs=>7776000)),
    'totalReservationRows',(SELECT count(*) FROM attachment_storage_reservations)) FROM pg_roles r WHERE rolname=session_user"""
    value=query(sql)
    original=m.pinned(ctx['config']['databaseStateReceipt'],65536)
    need(value['database']==m.DB_NAME and value['role']==value['owner']==m.DB_ROLE and value['readOnly']=='on' and
         all(value[k] is False for k in ('superuser','createdb','createrole','replication','bypassrls','inherit')) and
         value['connectionLimit']==3 and value['memberships']==0 and value['migrationNames']==original['migrationNames'] and
         value['incompleteMigrations']==0 and value['retentionIntervalExactMs']==7776000000 and
         all(value[k]==0 for k in ('unfinishedStates','expiredPurged','purgedBecomingEligibleNext24h')),'A2_QUOTA_IDENTITY_AND_GATE')
    report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'phase':phase,'identity':m.IDENTITY,'gateAllowed':True,
            'query':value,'effectiveRetentionMs':7776000000,'databaseWrites':False,'totalRowCountIsAdmissionCondition':False}
    path=ctx['event']/('quota-'+phase+'.json');m.write_new(path,report)
    return report,{'path':str(path),'sha256':m.sha(m.read(path,65536))}


def bind_gates(quota_path,quota_hash,scanner_path,scanner_hash):
    m=ctx['m'];q=json.loads(raw_public(quota_path,quota_hash))
    age=(dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(q['at'])).total_seconds()
    need(q.get('gateAllowed') is True and q.get('identity')==m.IDENTITY and q.get('phase')=='pre' and 0<=age<=120,'FRESH_PRESTART_QUOTA')
    need(scanner_path==ctx['scanner']['startPath'] and scanner_hash==ctx['scanner']['startSha256'],'SCANNER_GATE_BINDING')
    ctx['scannerModule'].live_owner(ctx['c'],ctx['scanner']['start'],ctx['scanner']['verify'])
    redis_ready(ctx['redisOwner'])
    return {'quota':{'path':quota_path,'sha256':quota_hash},'scannerApplicability':ctx['scanner']['applicability']}


def redis_stop(owner):
    p=ctx['p'];need(owner['uid']==1100 and owner['executable']==str(ctx['m'].LOADER) and owner['cwd']==INSTANCE+'/redis','OWN_REDIS_STOP_SHAPE')
    try:fd=os.pidfd_open(owner['pid'])
    except ProcessLookupError:
        with socket.socket() as sock:sock.bind(('127.0.0.1',6381))
        return {'alreadyExited':True,'pid':owner['pid'],'portClosed':True,'forceKill':False}
    try:
        need(p.matches(owner),'OWN_REDIS_STOP_IDENTITY')
        signal.pidfd_send_signal(fd,signal.SIGTERM)
        poller=select.poll();poller.register(fd,select.POLLIN)
        need(bool(poller.poll(45000)),'REDIS_STOP_TIMEOUT_NO_FORCE_KILL')
    finally:os.close(fd)
    with socket.socket() as sock:sock.bind(('127.0.0.1',6381))
    return {'pid':owner['pid'],'startTicks':owner['startTicks'],'sigtermSent':True,'pidfdExited':True,'portClosed':True,'forceKill':False}


def stop(event_name):
    m,p=ctx['m'],ctx['p'];event=ctx['event'];claim=m.pinned({'path':str(event/'claim.json'),'bytes':(event/'claim.json').stat().st_size,'sha256':digest((event/'claim.json').read_bytes())},65536)
    need(claim['bindingSha256']==ctx['bindingSha'] and claim['bootId']==ctx['binding']['bootId'] and claim['instance']==INSTANCE,'OWN_LIFECYCLE_CLAIM')
    need(re.fullmatch('[a-z0-9][a-z0-9-]{0,63}',event_name),'STOP_EVENT')
    out=event/('stop-'+event_name+'.json');need(not out.exists(),'EXCLUSIVE_STOP')
    report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'run':ctx['run'],'bootId':ctx['binding']['bootId'],
            'forceKill':False,'dataDeleted':False,'sharedServicesStopped':False}
    try:
        run_dir=p.RUNS/ctx['run']
        owners=p.owners_for(run_dir) if run_dir.exists() and (run_dir/'claim.json').exists() else {}
        redis_owner=json.loads(m.read(event/'redis-owner.json',16384)) if (event/'redis-owner.json').exists() else None
        all_owners={**owners,**({'redis':redis_owner} if redis_owner else {})}
        forbidden={o['pid'] for o in ctx['binding']['preservedOwners'].values()}
        need(all(o['pid'] not in forbidden for o in all_owners.values()),'SHARED_OWNER_CANNOT_BE_STOPPED')
        if ctx['stopping']:
            pin=ctx['startReceiptSha256'];need(isinstance(pin,str) and re.fullmatch('[a-f0-9]{64}',pin),'ACTUAL_START_RECEIPT_REQUIRED')
            actual=json.loads(raw_public(event/'result.json',pin,2*1024**2))
            need(actual['status']=='A2_FOUR_PROCESSES_STARTED_AND_VERIFIED' and actual['run']==ctx['run'] and
                 actual['bootId']==ctx['binding']['bootId'] and actual['owners']==all_owners and
                 actual['configurationReceipt']==ctx['binding']['configurationReceipt'],'ACTUAL_OWN_FOUR_START')
        errors=[]
        try:report['applications']=p.stop_owned(owners)
        except BaseException as error:errors.append('applications');report['applicationStopError']=safe_error(error)
        if redis_owner:
            try:report['redis']=redis_stop(redis_owner)
            except BaseException as error:errors.append('redis');report['redisStopError']=safe_error(error)
        need(not errors,'OWN_STOP_INCOMPLETE')
        preserved();report['status']='OWN_NEW_INSTANCE_PROCESSES_NORMAL_STOPPED'
    except BaseException as error:
        report['status']='STOP_FAILED_PRESERVED_NO_FORCE_KILL';report['errorCode']=safe_error(error);m.write_new(out,report);raise
    m.write_new(out,report);return report


def cleanup_failed_start():
    result={}
    try:result['normalCleanup']=stop('failed-start')
    except BaseException as error:
        result['cleanupErrorCode']=safe_error(error)
        # A failed first Node spawn can leave an app claim with zero owners.
        # The directly captured Redis owner remains independently safe to stop.
        owner=ctx.get('redisOwner')
        if owner:
            try:result['independentRedisCleanup']=redis_stop(owner)
            except BaseException as redis_error:result['independentRedisCleanupError']=safe_error(redis_error)
    return result


def start():
    m,p,b=ctx['m'],ctx['p'],ctx['binding'];resource_guard();m.ports_free()
    for path in (ctx['events'],p.LOGS):
        if not path.exists():path.mkdir(mode=0o700)
        m.canonical(path);need(path.stat().st_uid==1100 and stat.S_IMODE(path.stat().st_mode)==0o700,'OWN_LIFECYCLE_DIRECTORY')
    event=ctx['event'];event.mkdir(mode=0o700)
    m.write_new(event/'claim.json',{'at':dt.datetime.now(dt.timezone.utc).isoformat(),'bootId':b['bootId'],
        'instance':INSTANCE,'bindingSha256':ctx['bindingSha'],'configurationReceipt':b['configurationReceipt'],'run':ctx['run']})
    child=None;pidfd=None
    try:
        redis=Path(b['dependencies'])/'usr/bin/redis-server';payload=redis.resolve(strict=True)
        need(payload==Path(b['dependencies'])/'usr/bin/redis-check-rdb' and m.sha(m.read(payload,32*1024**2))==REDIS_SHA,'DECLARED_REDIS_PAYLOAD')
        argv=[str(m.LOADER),'--inhibit-cache','--library-path',p.BASE_ENV['LD_LIBRARY_PATH'],'--argv0',str(redis),str(redis),str(p.R/'private/redis.conf')]
        with (p.LOGS/('redis-'+ctx['run']+'.log')).open('xb') as log:
            child=subprocess.Popen(argv,cwd=p.R/'redis',env=p.BASE_ENV,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,
                                   close_fds=True,start_new_session=True,preexec_fn=p.child_limits)
        pidfd=os.pidfd_open(child.pid);owner=p.proc_record(child.pid)
        need(owner['uid']==1100 and owner['executable']==str(m.LOADER) and owner['cwd']==INSTANCE+'/redis','NEW_REDIS_OWNER')
        owner['launchedArgv']=argv;ctx['redisOwner']=owner;m.write_new(event/'redis-owner.json',owner)
        deadline=time.monotonic()+30
        while True:
            need(child.poll() is None,'REDIS_EXIT_BEFORE_READY');resource_guard()
            try:ready=redis_ready(owner);break
            except (OSError,RuntimeError):need(time.monotonic()<deadline,'REDIS_START_DEADLINE');time.sleep(.2)
        maps=mapped_process(owner,str(payload));m.write_new(event/'redis-start.json',{'at':dt.datetime.now(dt.timezone.utc).isoformat(),'owner':owner,'readiness':ready,'maps':maps})
        _,qref=quota('pre')
        p.start(ctx['run'],qref['path'],qref['sha256'],ctx['scanner']['startPath'],ctx['scanner']['startSha256'])
        owners=p.owners_for(p.RUNS/ctx['run']);p.assert_listeners(owners)
        appmaps={role:mapped_process(value,str(p.NODE)) for role,value in owners.items()}
        identities=p.four_identities(m.IDENTITY);redis_after=redis_ready(owner);quota_post,qpost=quota('post');preserved()
        report={'status':'A2_FOUR_PROCESSES_STARTED_AND_VERIFIED','at':dt.datetime.now(dt.timezone.utc).isoformat(),
                'bootId':b['bootId'],'run':ctx['run'],'instance':INSTANCE,'identity':m.IDENTITY,
                'configurationReceipt':b['configurationReceipt'],'configurationRegenerated':False,
                'configurationCreatedOnBoot':ctx['config']['bootId'],
                'owners':{**owners,'redis':owner},'identities':identities,'applicationMaps':appmaps,
                'redisReadiness':redis_after,'quotaPost':qpost,'resourceObservation':resource_guard(),
                'scannerApplicability':ctx['scanner']['applicability'],'preservedSixOwners':True,
                'migrationOrInitializationInvoked':False,'fullInstallAccepted':False}
        m.write_new(event/'result.json',report)
        print(json.dumps({'status':report['status'],'receipt':str(event/'result.json')}))
    except BaseException as error:
        failure={'status':'A2_START_FAILED_PRESERVED','at':dt.datetime.now(dt.timezone.utc).isoformat(),'errorCode':safe_error(error)}
        try:
            if child is not None and not (event/'redis-owner.json').exists() and child.poll() is None:
                if pidfd is None:pidfd=os.pidfd_open(child.pid)
                signal.pidfd_send_signal(pidfd,signal.SIGTERM);child.wait(timeout=45)
            failure.update(cleanup_failed_start())
        except BaseException as cleanup:failure['cleanupErrorCode']=safe_error(cleanup)
        m.write_new(event/'failed-result.json',failure);raise
    finally:
        if pidfd is not None:os.close(pidfd)


def safe_error(error):
    value=str(error)
    return value if re.fullmatch('CHECK_[A-Z0-9_]+',value) else type(error).__name__


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--execute',action='store_true')
    parser.add_argument('--binding');parser.add_argument('--binding-sha256');parser.add_argument('--budget');parser.add_argument('--budget-sha256')
    parser.add_argument('--scanner-binding');parser.add_argument('--scanner-sha256')
    parser.add_argument('--start-receipt-sha256')
    parser.add_argument('phase',choices=['start','stop']);parser.add_argument('run');parser.add_argument('event',nargs='?')
    args=parser.parse_args()
    if not args.execute:print(json.dumps({'status':'PLAN_ONLY'}));return
    load(args,stopping=args.phase=='stop')
    if args.phase=='start':start()
    else:print(json.dumps(stop(args.event)))


if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'status':'LIFECYCLE_FAILED_PRESERVED','errorCode':safe_error(error)}));raise SystemExit(1)
