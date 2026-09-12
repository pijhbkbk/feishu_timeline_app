"""Bounded pre-cutover startup check with independent exit/boot cleanup."""
import pathlib,sys,os,stat,hashlib,socket,json,time,urllib.request
INSTALLED=pathlib.Path('/usr/local/lib/timeline-native-ops')
if pathlib.Path(__file__).parent==INSTALLED:
    for p in [*reversed(INSTALLED.parents),INSTALLED]:
        i=p.lstat()
        if not stat.S_ISDIR(i.st_mode) or i.st_uid!=0 or i.st_mode&0o022:raise RuntimeError('Untrusted installed path')
    sys.path.insert(0,str(INSTALLED))
import native_backup_controller as backup
import native_runtime_app as app
PENDING=app.ROOT/'candidate-check-pending.json'
IDENTITY={'runtimeCommit':app.COMMIT,'check':'private-health-v1'}
APP_SHA='1bafab2699706e02d326fef18ed2c8b8e244cea028f58536f69dfbfa04de2125'
require=backup.require


def validate():
    require(hashlib.sha256((INSTALLED/'native_runtime_app.py').read_bytes()).hexdigest()==APP_SHA,'Candidate check app supervisor differs')
    require(not (app.ROOT/'cutover-committed.json').exists(),'Candidate check cannot act after commit')


def cleanup():
    if not PENDING.exists():return
    validate();require(backup.read_json(PENDING)==IDENTITY,'Unknown candidate check journal')
    # Try database fencing before potentially stalled Docker operations; either
    # side must still be attempted when the other dependency is unavailable.
    errors=[]
    try: app.database_scope.close_role()
    except BaseException as error: errors.append(type(error).__name__)
    for part in ('api','web'):
        try:
            app.run(['/usr/bin/systemctl','stop','timeline-native-'+part+'.service'])
            item=app.inspect(part)
            require(item is None or (not item['State']['Running'] and item['State']['Pid']==0),'Candidate process remains')
        except BaseException as error:errors.append(type(error).__name__)
    require(not errors,'Candidate cleanup incomplete; journal retained')
    PENDING.unlink();backup.fsync_dir(app.ROOT)


def health(url):
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    until=time.monotonic()+75
    while time.monotonic()<until:
        try:
            with opener.open(url,timeout=4) as response:
                raw=response.read(16385);require(len(raw)<=16384,'Response too large');value=json.loads(raw)
                require(value['runtimeCommit']==app.COMMIT and value['release']==app.RELEASE and value['buildTime']==app.BUILD_TIME,'Candidate version differs')
            return
        except (OSError,ValueError,KeyError,backup.Failure):time.sleep(1)
    raise backup.Failure('Candidate identity not ready')


def check():
    validate()
    require(not PENDING.exists() and not (app.ROOT/'candidate-check-complete.json').exists(),'Prior candidate check state retained')
    require(not (app.ROOT/'preparation-pending.json').exists() and not (app.ROOT/'cutover-pending.json').exists(),'Other operation pending')
    app.validate_files();backup.read_json(app.ROOT/'prepared.json')
    backup.write_json(PENDING,IDENTITY)
    try:
        app.run(['/usr/bin/systemctl','start','timeline-native-api.service','timeline-native-web.service'])
        health('http://172.30.44.2:3001/api/health');health('http://172.30.45.2:3000/build-info')
        for part in ('api','web'):
            item=app.inspect(part);require(item and item['State']['Running'],'Candidate not running')
            app.validate_container(part,item,app.image_identity(part))
    finally:cleanup()
    require(backup.fingerprints(app.migration.DATABASE,app.migration.ROLE)==backup.read_json(app.ROOT/'prepared-fingerprints.json'),'Candidate data changed during startup')
    result={'candidatePrivateHealth':'PASS','runtimeCommit':app.COMMIT,'hostPublicIngressChanged':False,
            'candidateStoppedAndRoleClosed':True,'completePreparedDatabaseFingerprintUnchanged':True}
    backup.write_json(app.ROOT/'candidate-check-complete.json',result)
    print(json.dumps(result),flush=True)


def main():
    require(os.geteuid()==0 and socket.gethostname()=='instance-20260408-091840' and pathlib.Path(__file__).parent==INSTALLED,'Use installed intended-host checker')
    require(sys.argv[1:] in [['check'],['cleanup']],'Unknown candidate check operation')
    with backup.locked():
        (check if sys.argv[1]=='check' else cleanup)()


if __name__=='__main__':
    try:main()
    except BaseException as error:
        print(json.dumps({'candidateCheck':'FAILED','reason':str(error) if isinstance(error,backup.Failure) else type(error).__name__}),file=sys.stderr);sys.exit(1)
