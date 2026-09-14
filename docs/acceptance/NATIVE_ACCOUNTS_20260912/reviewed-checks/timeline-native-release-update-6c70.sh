set -eu
sudo -n /usr/bin/python3 -I - <<'REVIEWED_UPDATE'
import datetime, hashlib, json, os, pathlib, socket, sys, time
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
def show(unit,property):
 return cutover.systemctl('show',unit,'--property='+property,'--value').decode().strip()
def fixed_unit(unit):
 assert unit in ('timeline-native-release.service','timeline-native-release-check.service')
 assert show(unit,'FragmentPath')=='/etc/systemd/system/'+unit
 assert show(unit,'DropInPaths')=='' and show(unit,'NeedDaemonReload')=='no'
 assert show(unit,'ActiveState')=='inactive' and show(unit,'MainPID')=='0' and show(unit,'ControlPID')=='0'
 return show(unit,'InvocationID')
def post_recovery_success(unit,invocation):
 assert show(unit,'InvocationID')==invocation
 post=show(unit,'ExecStopPost')
 assert '/usr/bin/python3' in post and '/usr/local/lib/timeline-native-ops/native_release.py recover' in post
 assert re.search(r'code=exited\s*;\s*status=0(?:\s|[;}])',post), 'ExecStopPost did not exit successfully'

proof=backup.read_json(app.ROOT/'release-6c70-recovery-proof.json')
assert proof['fixedProgramInterruptionRecovery']=='PASS' and proof['allDatabaseFingerprintsUnchanged'] and proof['recoveredRuntimeCommit']==release.OLD
assert proof['checkpointRuntimeCommit']==release.NEW and proof['execStopPostSucceeded']
checkpoint=backup.read_json(release.CHECKPOINT)
assert proof['invocationId']==checkpoint['invocationId'] and proof['checkpointStateSha256']==checkpoint['releaseStateSha256']
assert proof['baselineSha256']==backup.sha(backup.read_file(app.ROOT/'release-6c70-data-before.json',1024*1024,owner=0))
assert release.state()=={'version':1,'active':release.OLD,'committed':release.OLD,'pending':False}
unit='timeline-native-release.service'
previousInvocation=fixed_unit(unit)
cutover.systemctl('--no-block','start',unit)
deadline=time.monotonic()+600
while time.monotonic()<deadline:
 status=cutover.systemctl('show',unit,'--property=ActiveState','--value').decode().strip()
 if status=='failed':raise RuntimeError('Supervised program update failed; inspect retained recovery state')
 if status=='inactive' and release.state()['active']==release.NEW:break
 time.sleep(1)
else:raise RuntimeError('Program update completion not observed')
assert cutover.systemctl('show',unit,'--property=Result','--value').decode().strip()=='success'
assert cutover.systemctl('show',unit,'--property=ExecMainStatus','--value').decode().strip()=='0'
invocation=show(unit,'InvocationID');assert invocation!=previousInvocation
post_recovery_success(unit,invocation)
assert release.state()=={'version':1,'active':release.NEW,'committed':release.NEW,'pending':False}
cutover.check_health(public=True);release.verify_running();release.ingress_ready()
before=backup.read_json(app.ROOT/'release-6c70-data-before.json')
after=backup.fingerprints(cutover.DATABASE,cutover.ROLE)
result={'nativeProgramUpdated':True,'runtimeCommit':release.NEW,**release.VERSIONS[release.NEW],
 'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'updateCompletedAt':cutover.systemctl('show','timeline-native-release.service','--property=InactiveEnterTimestamp','--value').decode().strip(),
 'database':cutover.DATABASE,'databaseRestored':False,'initialMigrationReplayed':False,
 'allDatabaseFingerprintsUnchanged':before==after,
 'changedTables':[name for name in before['tables'] if before['tables'][name]!=after['tables'][name]],
 'schemaUnchanged':before['schemaSha256']==after['schemaSha256'],
 'publicUpstreamHealth':'PASS','exactDomainBrowserAcceptance':'PENDING',
 'invocationId':invocation,'execStopPostSucceeded':True}
result['databaseVerification']='PASS' if before==after else 'CHANGES_REQUIRE_INVESTIGATION'
backup.write_json(app.ROOT/'release-6c70-update-proof.json',result)
print(json.dumps(result),flush=True)
assert before==after,'Investigate database changes after program update'
REVIEWED_UPDATE
