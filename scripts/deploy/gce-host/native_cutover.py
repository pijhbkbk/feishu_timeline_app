"""One-way fixed-host promotion of the verified native-account database copy.

Before COMMITTED, recover the old system after closing the candidate. Once the
commit receipt is durable, never re-open the old DB or fall back to old services.
Formal ingress checks the same immutable receipt on every start.
"""
import os
from pathlib import Path
import stat
import sys
INSTALLED = Path('/usr/local/lib/timeline-native-ops')
if Path(__file__).parent == INSTALLED:
    for node in [*reversed(INSTALLED.parents), INSTALLED]:
        i=node.lstat()
        if not stat.S_ISDIR(i.st_mode) or i.st_uid!=0 or i.st_mode&0o022:
            raise RuntimeError('Untrusted controller directory')
    sys.path.insert(0,str(INSTALLED))
import datetime
import hashlib
import json
import pwd
import re
import resource
import secrets
import socket
import subprocess
import time
import urllib.request
import native_backup_controller as backup
import native_runtime_app as app
import native_database_scope as scope

ROOT=app.ROOT
COMMIT=app.COMMIT
DATABASE=app.migration.DATABASE
ROLE=app.migration.ROLE
BASELINE='20260912T144907Z-9b8c486b'
BASELINE_MANIFEST='691880a21aceb71992e78762b0082bc37a73d8a656b025a84b5d1adc283989f0'
SOURCE_HEAD='535041bb25f21d548d863d07b35e3e952b0aeb2c'
RELEASE_CHECKOUT=Path('/home/lixiaochen/timeline-native-delivery/releases')/COMMIT
OLD=['feishu-timeline-api.service','feishu-timeline-web.service']
APPS=['timeline-native-api.service','timeline-native-web.service']
SOCKETS=['timeline-native-api-ingress.socket','timeline-native-web-ingress.socket']
PROXIES=['timeline-native-api-ingress.service','timeline-native-web-ingress.service']
RECOVERY='timeline-native-cutover-recover.service'
PENDING=ROOT/'cutover-pending.json'
COMMITTED=ROOT/'cutover-committed.json'
CHECKPOINT=ROOT/'precommit-check-ready.json'
CHECK_UNIT='timeline-native-precommit-check.service'
require=backup.require


def present(path):
    try: path.lstat(); return True
    except FileNotFoundError: return False


def check_legacy():
    app.state_directory()
    require(not present(COMMITTED), 'Native commit entry exists; legacy startup forbidden')
    if present(PENDING): pending_value()


def systemctl(*args):
    limits = {'timeout': 110} if args == ('stop', 'timeline-native-api.service') else {}
    return app.run(['/usr/bin/systemctl', *args], **limits)


def unit_state(unit):
    require(unit in OLD+APPS+SOCKETS+PROXIES+[RECOVERY],'Unsupported unit')
    raw=systemctl('show',unit,'-p','ActiveState','-p','MainPID','-p','ControlPID','-p','UnitFileState','-p','KillMode').decode()
    return dict(line.split('=',1) for line in raw.splitlines())


def stop_units(units):
    # Stop socket activation first. No unknown unit/container is acted on.
    for unit in units:
        systemctl('stop',unit)
        value=unit_state(unit)
        require(value.get('MainPID','0')=='0' and value.get('ControlPID','0')=='0','Unit processes remain: '+unit)
        if value['ActiveState']=='failed':
            require(unit in OLD+APPS+SOCKETS+PROXIES,'Cannot reset evidence unit')
            print(json.dumps({'stoppedUnitFailureRetainedInJournal':unit,'priorState':value}),flush=True)
            systemctl('reset-failed',unit)
            value=unit_state(unit)
        require(value['ActiveState']=='inactive' and value.get('MainPID','0')=='0' and value.get('ControlPID','0')=='0','Unit stop not proved: '+unit)


def no_old_journals():
    for path in [backup.ROOT/'source-quiesced.json',backup.ROOT/'restore-pending.json',
                 app.migration.ROOT/'pending.json',ROOT/'preparation-pending.json',ROOT/'pg-scope-pending.json',ROOT/'candidate-check-pending.json']:
        require(not present(path),'Previous recovery journal remains')


def validate_snapshot(value, source, tables):
    require(type(value) is dict and set(value)=={'backup','manifestSha256','fingerprintsSha256','tableCount','objectCount','source'} and
            type(value['backup']) is str and backup.BACKUP.fullmatch(value['backup']) and
            all(type(value[k]) is str and re.fullmatch(r'[a-f0-9]{64}',value[k]) for k in ['manifestSha256','fingerprintsSha256']) and
            value['source']==source and value['tableCount']==tables and value['objectCount']==0,'Snapshot receipt rejected')
    directory=backup.ROOT/value['backup']
    require(backup.read_json(directory/'snapshot-complete.json')==value,'Snapshot receipt changed')
    manifest_raw=backup.read_file(directory/'restore-manifest.json',1024*1024,owner=0)
    fp_raw=backup.read_file(directory/'table-fingerprints.json',1024*1024,owner=0)
    require(backup.sha(manifest_raw)==value['manifestSha256'] and backup.sha(fp_raw)==value['fingerprintsSha256'],'Snapshot evidence changed')
    manifest=json.loads(manifest_raw)
    require(manifest['version']==1 and manifest['objects']==[],'Unexpected snapshot objects')
    dump=manifest['database']
    require(type(dump) is dict and set(dump)=={'path','size','sha256'} and dump['path']=='database.dump' and type(dump['size']) is int and 0<dump['size']<=backup.MAX_DUMP and re.fullmatch(r'[a-f0-9]{64}',dump['sha256']),'Snapshot dump metadata rejected')
    raw=backup.read_file(directory/'database.dump',backup.MAX_DUMP,owner=0)
    require(raw.startswith(b'PGDMP') and len(raw)==dump['size'] and backup.sha(raw)==dump['sha256'],'Snapshot dump missing or corrupted')
    return json.loads(fp_raw)


def pending_value():
    value=backup.read_json(PENDING)
    require(type(value) is dict and set(value)=={'version','runtimeCommit','sourceBackup','nativeBackup'} and value['version']==1 and
            value['runtimeCommit']==COMMIT,'Unknown cutover journal')
    validate_snapshot(value['sourceBackup'],backup.DATABASE,46)
    validate_snapshot(value['nativeBackup'],DATABASE,52)
    return value


def committed_value():
    value=backup.read_json(COMMITTED)
    require(type(value) is dict and set(value)=={'version','runtimeCommit','sourceBackup','nativeBackup','committedAt','database','sourceTree','release'} and
            value['version']==1 and value['runtimeCommit']==COMMIT and value['database']==DATABASE and value['sourceTree']==app.TREE and
            value['release']==app.RELEASE and type(value['committedAt']) is str and
            re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00',value['committedAt']), 'Unknown COMMITTED receipt; never roll back automatically')
    validate_snapshot(value['sourceBackup'],backup.DATABASE,46)
    validate_snapshot(value['nativeBackup'],DATABASE,52)
    return value


def release_checkout():
    account=pwd.getpwnam('lixiaochen')
    i=RELEASE_CHECKOUT.lstat();require(stat.S_ISDIR(i.st_mode) and i.st_uid==account.pw_uid and i.st_mode&0o022==0,'Release checkout identity differs')
    def git(*args):
        return backup.command(['/usr/bin/git','-C',str(RELEASE_CHECKOUT),'-c','core.hooksPath=/dev/null',*args],user='lixiaochen').decode().strip()
    require(git('rev-parse','HEAD')==COMMIT and git('rev-parse','HEAD^{tree}')==app.TREE and git('status','--porcelain')=='','Release checkout differs')


def candidate_static():
    no_old_journals();app.validate_files()
    value=backup.read_json(ROOT/'prepared.json')
    require(value['runtimeCommit']==COMMIT and value['database']==DATABASE and value['administratorBound'] and value['existingInternalIdPreserved'],'Candidate preparation proof missing')
    for part in ('api','web'):
        item=app.inspect(part)
        require(item and not item['State']['Running'] and item['State']['Pid']==0,'Candidate must be stopped before comparison')
        app.validate_container(part,item,app.image_identity(part))
    require(backup.sql("SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='"+ROLE+"';")=='t','Candidate role must be closed')
    require(backup.sql("SELECT count(*) FROM pg_stat_activity WHERE datname='"+DATABASE+"';")=='0','Candidate clients remain')
    require(backup.sql("SELECT count(*) FROM pg_prepared_xacts WHERE database='"+DATABASE+"';")=='0','Candidate prepared transactions remain')
    expected=backup.read_json(ROOT/'prepared-fingerprints.json')
    require(backup.fingerprints(DATABASE,ROLE)==expected,'Candidate changed after approved administrator binding')
    require(list((ROOT/'objects').iterdir())==[],'Candidate objects changed')
    return expected


def dump_native(path):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    account=pwd.getpwnam('postgres')
    def limits(): resource.setrlimit(resource.RLIMIT_FSIZE,(backup.MAX_DUMP,backup.MAX_DUMP))
    try:
        result=subprocess.run([backup.PG+'pg_dump','--format=custom','--no-owner','--no-privileges','--role='+ROLE,'--dbname='+DATABASE],
                              cwd='/',env=backup.ENV,stdout=fd,stderr=subprocess.PIPE,timeout=120,user=account.pw_uid,
                              group=account.pw_gid,extra_groups=[],preexec_fn=limits)
        require(result.returncode==0 and len(result.stderr)<=65536,'Native dump failed');os.fsync(fd)
    finally: os.close(fd)
    raw=backup.read_file(path,backup.MAX_DUMP,owner=0);require(raw.startswith(b'PGDMP'),'Native custom dump invalid')
    backup.fsync_dir(path.parent)
    return {'path':'database.dump','size':len(raw),'sha256':backup.sha(raw)}


def native_snapshot():
    fingerprints=candidate_static()
    if present(ROOT/'native-backup-verified.json'):
        receipt=backup.read_json(ROOT/'native-backup-verified.json')
        require(validate_snapshot(receipt,DATABASE,52)==fingerprints,'Verified native snapshot differs')
        return receipt
    backup.check_scope_and_space()
    name=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ-')+secrets.token_hex(4)
    path=backup.ROOT/name;path.mkdir(mode=0o700)
    dump=dump_native(path/'database.dump')
    objects=backup.copy_objects(ROOT/'objects',path/'objects',expected=[])
    require(backup.fingerprints(DATABASE,ROLE)==fingerprints,'Native database changed while backed up')
    backup.write_json(path/'restore-manifest.json',{'version':1,'database':dump,'objects':objects})
    backup.write_json(path/'table-fingerprints.json',fingerprints)
    receipt={'backup':name,'manifestSha256':backup.sha(backup.read_file(path/'restore-manifest.json',1024*1024,owner=0)),
             'fingerprintsSha256':backup.sha(backup.read_file(path/'table-fingerprints.json',1024*1024,owner=0)),
             'tableCount':52,'objectCount':0,'source':DATABASE}
    backup.write_json(path/'snapshot-complete.json',receipt)
    restored=backup.restore(name,receipt['manifestSha256'])
    require(restored['databaseAndObjectsVerified'] and restored['tableCount']==52 and restored['objectCount']==0,'Native restore verification failed')
    backup.write_json(ROOT/'native-backup-verified.json',receipt)
    print(json.dumps({'nativeSnapshotAndIndependentRestore':'PASS','backup':name,'nativePasswordHashesPreserved':True,'redisSessionsBackedUp':False}),flush=True)
    return receipt


def close_old_role():
    backup.role_change('ALTER ROLE "'+backup.ROLE+'" NOLOGIN;')
    backup.sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='"+backup.ROLE+"' AND datname='"+backup.DATABASE+"' AND pid<>pg_backend_pid();")
    require(backup.sql("SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='"+backup.ROLE+"';")=='t','Old role closure unproved')


def recover():
    # The installed 41-schema program contract permanently supersedes pre-native
    # recovery. A lost historical commit receipt must never reopen legacy writes.
    from native_release import recover_pending, ingress_ready
    recover_pending()
    committed_value()
    close_old_role(); stop_units(OLD)
    systemctl('disable', *OLD)
    ingress_ready()
    no_old_journals(); app.validate_files(); release_checkout()
    backup.role_change('ALTER ROLE "'+ROLE+'" LOGIN CONNECTION LIMIT 12;')
    systemctl('enable', *APPS, *SOCKETS)
    return 'COMMITTED_NEW_RUNTIME_READY'


def check_health(public=False):
    identity=app.runtime_identity()
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    urls=['http://127.0.0.1:3001/api/health','http://127.0.0.1:3000/build-info'] if public else ['http://172.30.44.2:3001/api/health','http://172.30.45.2:3000/build-info']
    for url in urls:
        until=time.monotonic()+75
        while time.monotonic()<until:
            try:
                with opener.open(url,timeout=4) as response:
                    raw=response.read(16385);require(len(raw)<=16384,'Health response oversized');value=json.loads(raw)
                    require(value['runtimeCommit']==identity['commit'] and value['sourceTree']==identity['tree'] and
                            value['release']==identity['release'] and value['buildTime']==identity['buildTime'],'Runtime identity differs')
                break
            except (OSError,ValueError,KeyError,backup.Failure):time.sleep(1)
        else: raise backup.Failure('New runtime health unavailable')


def recovery_checkpoint():
    invocation=os.environ.get('INVOCATION_ID','')
    require(re.fullmatch(r'[a-f0-9]{32}',invocation) is not None,'Supervised invocation required')
    require(not present(CHECKPOINT),'Previous recovery checkpoint retained')
    value={'invocationId':invocation,'pid':os.getpid(),
           'pendingSha256':backup.sha(backup.read_file(PENDING,16384,owner=0))}
    backup.write_json(CHECKPOINT,value)
    print(json.dumps({'precommitRecoveryCheckpoint':value}),flush=True)
    # This branch never reaches COMMITTED, including when its observer disconnects.
    time.sleep(60)
    raise backup.Failure('Recovery check checkpoint expired; restoring old runtime')


def reconcile_check():
    require(not present(COMMITTED),'Committed runtime cannot reconcile a rehearsal')
    checkpoint=backup.read_json(CHECKPOINT)
    require(type(checkpoint) is dict and set(checkpoint)=={'invocationId','pid','pendingSha256'} and
            re.fullmatch(r'[a-f0-9]{32}',checkpoint['invocationId']) and type(checkpoint['pid']) is int and checkpoint['pid']>1,
            'Unknown recovery checkpoint')
    require(backup.sha(backup.read_file(PENDING,16384,owner=0))==checkpoint['pendingSha256'],'Recovery check journal changed')
    receipt=pending_value()
    raw=systemctl('show',CHECK_UNIT,'-p','InvocationID','-p','ActiveState','-p','Result','-p','ExecMainCode','-p','ExecMainStatus').decode()
    observed=dict(line.split('=',1) for line in raw.splitlines())
    require(observed=={'InvocationID':checkpoint['invocationId'],'ActiveState':'failed','Result':'signal','ExecMainCode':'2','ExecMainStatus':'9'},
            'Check unit did not prove the intended SIGKILL')
    logs=app.run(['/usr/bin/journalctl','_SYSTEMD_INVOCATION_ID='+checkpoint['invocationId'],'--no-pager','-o','cat']).decode()
    require('{"cutoverRecovery": "PRECOMMIT_OLD_RUNTIME_RESTORED"}' in logs,'Automatic ExecStopPost recovery proof absent')
    require(all(unit_state(u)['ActiveState']=='active' and unit_state(u)['UnitFileState']=='enabled' for u in OLD),'Old units not restored')
    require(backup.sql("SELECT rolcanlogin FROM pg_roles WHERE rolname='"+backup.ROLE+"';")=='t','Old role not restored')
    require(all(unit_state(u)['ActiveState']=='inactive' for u in APPS+SOCKETS+PROXIES),'Native units remain active')
    require(all(unit_state(u)['UnitFileState']=='disabled' for u in APPS+SOCKETS),'Native units remain enabled')
    candidate_static()
    require(backup.fingerprints(backup.DATABASE,backup.ROLE)==validate_snapshot(receipt['sourceBackup'],backup.DATABASE,46),'Old data changed during recovery check')
    archived=ROOT/'precommit-check-pending-evidence.json'
    require(not present(archived),'Reconciliation evidence already exists')
    os.rename(PENDING,archived);backup.fsync_dir(ROOT)
    print(json.dumps({'precommitProcessInterruptionRecovery':'PASS','runtimeCommit':COMMIT,'oldRuntimeRestored':True,
                      'nativeRuntimeClosed':True,'pendingPreservedAsEvidence':True,'wholeHostRebootTested':False}),flush=True)


def promote(recovery_check=False):
    require(not present(PENDING) and not present(COMMITTED),'Cutover already attempted; explicit recovery required')
    require(systemctl('is-enabled',RECOVERY).strip()==b'enabled','Boot cutover recovery must be enabled first')
    no_old_journals();release_checkout()
    require(all(unit_state(unit)['ActiveState']=='active' and unit_state(unit)['UnitFileState']=='enabled' for unit in OLD),'Original services must initially be active/enabled')
    native=native_snapshot()
    baseline=backup.read_json(backup.ROOT/BASELINE/'snapshot-complete.json')
    require(baseline['manifestSha256']==BASELINE_MANIFEST,'Original restore source identity differs')
    expected_source=validate_snapshot(baseline,backup.DATABASE,46)
    source=backup.snapshot()
    require(validate_snapshot(source,backup.DATABASE,46)==expected_source,'Original data changed since candidate copy; refuse promotion')
    value={'version':1,'runtimeCommit':COMMIT,'sourceBackup':source,'nativeBackup':native}
    backup.write_json(PENDING,value)
    try:
        backup.stop_source();stop_units([OLD[1]])
        require(backup.fingerprints(backup.DATABASE,backup.ROLE)==expected_source,'Source changed between snapshot and final quiescence')
        require(list(backup.SOURCE.iterdir())==[],'Original object storage changed')
        candidate_static()
        systemctl('disable',*OLD)
        no_old_journals()
        if recovery_check: recovery_checkpoint()
        committed={**value,'database':DATABASE,'sourceTree':app.TREE,'release':app.RELEASE,
                   'committedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')}
        # The one-way decision is durable before any public port can accept a native write.
        backup.write_json(COMMITTED,committed)
        return committed
    except BaseException:
        if not present(COMMITTED): recover()
        raise


def dispatch_new(state):
    if state == 'COMMITTED_NEW_RUNTIME_READY':
        # Run after releasing the shared operation lock. Required recovery/network
        # units may need that lock themselves; they are not assumed already active.
        systemctl('--no-block','start',*APPS,*SOCKETS)


def main():
    require(os.geteuid()==0 and socket.gethostname()=='instance-20260408-091840' and Path(__file__).parent==INSTALLED,'Use reviewed intended-host controller')
    require(sys.argv[1:] in [['promote'],['recover'],['check-committed'],['check-legacy'],['native-snapshot'],['precommit-recovery-check'],['reconcile-check']],'Unsupported cutover command')
    app.state_directory()
    action=sys.argv[1]
    if action=='check-legacy': check_legacy();return
    if action=='check-committed':
        committed_value()
        from native_release import ingress_ready
        ingress_ready()
        return
    if action=='precommit-recovery-check':
        with backup.locked(): promote(recovery_check=True)
        raise backup.Failure('Recovery check returned unexpectedly')
    if action=='reconcile-check':
        with backup.locked(): reconcile_check()
        return
    if action=='promote':
        try:
            with backup.locked(): promote()
        finally:
            if present(COMMITTED):
                with backup.locked(): state=recover()
                dispatch_new(state)
        check_health(public=True)
        committed=committed_value()
        print(json.dumps({'cutoverCommitted':True,'runtimeCommit':COMMIT,'database':DATABASE,'committedAt':committed['committedAt'],
                          'localUpstreamIdentityVerified':True,'exactDomainBrowserAcceptance':'PENDING','oldDatabaseRetained':True}),flush=True)
    else:
        with backup.locked():
            state=recover() if action=='recover' else native_snapshot()
        if action=='recover':
            dispatch_new(state)
            print(json.dumps({'cutoverRecovery':state}))


if __name__=='__main__':
    try: main()
    except BaseException as error:
        print(json.dumps({'nativeCutover':'FAILED','reason':str(error) if isinstance(error,backup.Failure) else type(error).__name__}),file=sys.stderr);sys.exit(1)
