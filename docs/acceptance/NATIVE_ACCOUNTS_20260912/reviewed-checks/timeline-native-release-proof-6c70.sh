set -eu
sudo -n /usr/bin/python3 -I - <<'READBACK'
import datetime, hashlib, json, os, pathlib, socket, sys, time, subprocess, urllib.request
assert os.geteuid()==0 and socket.gethostname()=='instance-20260408-091840'
import re, stat
ops=pathlib.Path('/usr/local/lib/timeline-native-ops')
for p in (ops,pathlib.Path('/var/lib/timeline-native-app'),pathlib.Path('/etc/systemd/system')):
 for node in [*reversed(p.parents),p]:
  i=node.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and i.st_mode&0o022==0
def fixed_file(path,digest):
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  i=os.fstat(fd);assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and i.st_nlink==1 and stat.S_IMODE(i.st_mode)==0o644 and i.st_size<=200000
  with os.fdopen(fd,'rb',closefd=False) as stream:raw=stream.read(200001)
  assert len(raw)==i.st_size and hashlib.sha256(raw).hexdigest()==digest
 finally:os.close(fd)
for name,digest in {'native_backup_controller.py': '5bfda36db359474f5ef218ab3d2b103fbd2acefea49757fcac25494ce3a3874d', 'native_candidate_check.py': '3d28bdf044c3326f0ccead5f8433e2d068ccd7cb8b63ae24a7682c54f86dd944', 'native_cutover.py': '50bd61b849e31eacd80ba823fc5ca1bb84f9d651169837083e8bd378e955950a', 'native_database_scope.py': 'e44fad1b0554569e215d7e3ea3bf3d1ab2c11a35c62a14949c7d05900cc76dcc', 'native_migration_probe.py': '375ce24629be5f40cfe106ebea736a3c69d8f4b23ea3f77b141f9b90cc351dab', 'native_runtime_app.py': '7440febc72c120ac547e24e06f19019f891c6611cf21294e7f28fd6eaf9f782d', 'native_runtime_network.py': 'd85f6a2ff101c1180b56b059b313571b38f84ddbeca8c1b213f2a20a96020807', 'native_runtime_redis.py': 'e21b6e15c3a50c345f60f8c31f65c7bbfe245a77ffacf2403568bffd54a8cbbc', 'native_release.py': '33d00c08ef539c08cf679946fbf125819cfe79441ee40adfd52bb9ee755877bf'}.items():fixed_file(ops/name,digest)
for name,digest in {'timeline-native-release.service': 'd3106494657f0c705ed8f12c0be6cea4437e2e8aaba7fb643a2a8194b5198f8d', 'timeline-native-release-check.service': '017e3f320c0e79bba013d663e0a11c6776157f23af59b7475c513c43399b2c31', 'timeline-native-release-rollback.service': '8d15fb4715475c89955d59e3c0db227117debe5dfac714c7363e0a6aff336f15'}.items():fixed_file(pathlib.Path('/etc/systemd/system')/name,digest)
sys.path.insert(0,str(ops))

import native_backup_controller as backup
import native_cutover as cutover
import native_runtime_app as app
import native_release as release
invocation='eda408d91239469294d684e40f758b15'
unit='timeline-native-release.service'
def show(prop):return cutover.systemctl('show',unit,'--property='+prop,'--value').decode().strip()
assert show('FragmentPath')=='/etc/systemd/system/'+unit and show('DropInPaths')=='' and show('NeedDaemonReload')=='no'
assert show('ActiveState')=='inactive' and show('MainPID')=='0' and show('ControlPID')=='0'
raw=backup.command(['/usr/bin/journalctl','-u',unit,'-n','40','--no-pager','-o','json'],timeout=30)
assert len(raw)<262144
events=[json.loads(line) for line in raw.splitlines()]
expected={'nativeProgramUpdated':True,'runtimeCommit':release.NEW,'databaseRestored':False,'initialMigrationReplayed':False}
finished=[]
for event in events:
 if event.get('_SYSTEMD_INVOCATION_ID')==invocation:
  try:value=json.loads(event['MESSAGE'])
  except (ValueError,KeyError):continue
  if value==expected:finished.append(event)
assert len(finished)==1,'Fixed successful update journal entry absent'
event=finished[0];timestamp=int(event['__REALTIME_TIMESTAMP']);boot=event['_BOOT_ID']
success=[e for e in events if e.get('_PID')=='1' and e.get('_BOOT_ID')==boot and
 e.get('MESSAGE')=='timeline-native-release.service: Deactivated successfully.' and
 timestamp<=int(e['__REALTIME_TIMESTAMP'])<=timestamp+180000000]
assert len(success)==1,'Supervisor successful exit not proved'
assert not any(e.get('_BOOT_ID')==boot and timestamp<=int(e['__REALTIME_TIMESTAMP']) and
 ('Failed' in e.get('MESSAGE','') or 'failed' in e.get('MESSAGE','')) for e in events)
assert release.state()=={'version':1,'active':release.NEW,'committed':release.NEW,'pending':False}
release.verify_checkout(release.NEW);release.ingress_ready();release.verify_running();app.validate_files();cutover.check_health(public=True)
before=backup.read_json(app.ROOT/'release-6c70-data-before.json')
after=backup.fingerprints(cutover.DATABASE,cutover.ROLE)
assert before==after,'Database changed since reviewed program-update baseline'
initial=cutover.committed_value()
legacy=cutover.validate_snapshot(initial['sourceBackup'],backup.DATABASE,46)
assert backup.fingerprints(backup.DATABASE,backup.ROLE)==legacy
assert backup.sql("SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='"+backup.ROLE+"';")=='t'
assert backup.sql("SELECT rolcanlogin FROM pg_roles WHERE rolname='"+cutover.ROLE+"';")=='t'
assert backup.sql('SELECT count(*) FROM public."_prisma_migrations";',cutover.DATABASE,cutover.ROLE)=='37'
images={}
for component in ('api','web'):
 item=app.inspect(component);image=app.image_identity(component);app.validate_container(component,item,image)
 assert item['State']['Running'] and not item['State']['OOMKilled']
 images[component]={'repositoryDigest':item['Config']['Image'],'imageId':image['Id'],
  'runtimeCommit':image['Config']['Labels']['org.opencontainers.image.revision'],'running':True}
units={}
for name in cutover.OLD+cutover.APPS+cutover.SOCKETS+cutover.PROXIES:
 state=cutover.unit_state(name);units[name]={'active':state['ActiveState'],'enabled':state['UnitFileState']}
assert all(units[u]['active']=='inactive' and units[u]['enabled']=='disabled' for u in cutover.OLD)
assert all(units[u]['active']=='active' for u in cutover.APPS+cutover.SOCKETS+cutover.PROXIES)
nginx=pathlib.Path('/etc/nginx/sites-enabled/feishu-timeline').read_text()
assert 'timeline.all-too-well.com' in nginx and 'http://127.0.0.1:3000' in nginx and 'http://127.0.0.1:3001' in nginx
unrelated=json.loads(app.run(['/usr/bin/docker','container','inspect','--format','{{json .State}}','cp-wi-sync-auto']))
assert unrelated['Running'] and unrelated['Health']['Status']=='healthy'
with socket.create_connection(('127.0.0.1',23310),timeout=5) as stream:
 stream.sendall(b'zPING\0');assert stream.recv(64)==b'PONG\0'
with socket.create_connection(('127.0.0.1',23310),timeout=5) as stream:
 stream.sendall(b'zVERSION\0');scanner=stream.recv(256).rstrip(b'\0\n').decode()
result={'runtimeProof':'PASS','environment':'production','url':'https://timeline.all-too-well.com',
 'hostname':'timeline.all-too-well.com','runtimeCommit':release.NEW,'runtimeTree':release.current()['tree'],
 'release':release.current()['release'],'buildTime':release.current()['buildTime'],
 'deploymentTime':datetime.datetime.fromtimestamp(int(success[0]['__REALTIME_TIMESTAMP'])/1000000,datetime.timezone.utc).isoformat(),
 'updateInvocationId':invocation,'journalControllerCompletion':True,'journalSupervisorSuccessfulExit':True,
 'systemdGarbageCollectedInactiveUnitProperties':True,'updateRepeated':False,
 'runtimeCheckout':'/home/lixiaochen/timeline-native-delivery/releases/'+release.NEW,
 'targetCheckoutHead':release.NEW,'database':cutover.DATABASE,'migrationCount':37,
 'all52TableContentsSchemaAndSequencesUnchanged':True,'databaseRestored':False,'initialMigrationReplayed':False,
 'oldDatabaseUnchangedAndRoleClosed':True,'images':images,'units':units,
 'nginxUpstreams':{'web':'127.0.0.1:3000','api':'127.0.0.1:3001'},
 'scannerReachable':True,'scannerVersion':scanner,'unrelatedWorkloadHealthy':True,
 'exactDomainBrowserAcceptance':'PENDING_BROWSER_CONNECTION','productOwnerAcceptance':'AWAITING_PRODUCT_OWNER_CONFIRMATION'}
assert not release.present(app.ROOT/'release-6c70-update-readback.json')
backup.write_json(app.ROOT/'release-6c70-update-readback.json',result)
print(json.dumps(result),flush=True)

READBACK
