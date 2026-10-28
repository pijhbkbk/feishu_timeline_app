#!/usr/bin/env python3
"""Resume original configured preview after VM interruption; never regenerate data or TLS."""
from pathlib import Path
import argparse,datetime,hashlib,importlib.util,json,os,re,signal,socket,subprocess,sys,types,urllib.parse
sys.dont_write_bytecode=True
INPUT=Path('/home/recovery/input-r30-resume-app-20261028-r01')
COMMON_SHA='e5bcab7034c15c237ab860481377651c95b1991351af3a16e1acd0137424983a'
PINS_SHA=MANIFEST_SHA=COPY_SHA=BUDGET_SHA=None
LIBPATH='/home/recovery/runtime-debs-r30-r02/usr/lib/aarch64-linux-gnu:/home/recovery/runtime-debs-r30-r02/usr/lib/postgresql/14/lib'
# Null until actual independent native and new scanner receipts are bound.
FINAL_NATIVE_RECEIPT_SHA='59f7dbb8308d655d3c97a6899bb76b5939ea7857abdcea008f153611f235a237'
FINAL_SCANNER_START_PATH='/home/recovery/offline-validation-final-scanner-r30-r01/scanner/events/start-first-verified-joint-r30-r03/receipt.json'
FINAL_SCANNER_RUN='first-verified-joint-r30-r03'
FINAL_FIVECASE_PATH=Path('/home/recovery/offline-validation-final-scanner-r30-r01/scanner-fivecase-r01/result.json')
NATIVE_PROOF=None;observe=None;HANDOFF=None;handoff=None

def binding():
 return {'kind':'JOINT_INSTALLED_LOCAL_APPLICATION_RUNTIME','identity':plan['identity'],'sourceImageSha256':plan['sourceImageSha256'],'buildReceiptSha256':plan['sourceIndexes']['reuse-build-receipt.json'],'selectionSha256':plan['selectionSha256'],'manifestSha256':MANIFEST_SHA,'applicationAssemblyReceiptSha256':COPY_SHA,'runtimeAssemblyReceiptSha256':'5ee49d4eacf651ef3584fb377bab083bd24ac1ac537d05f2f4103104c70685d1','runtimeManifestSha256':'3da9be29b8d38878d4fb660d90d3fdc2f2490ef17813b723b35dc500b7ed81fd','nativeLoaderReceiptSha256':FINAL_NATIVE_RECEIPT_SHA}
def validate_build():
 receipt=m.installed(plan,MANIFEST_SHA,COPY_SHA)
 for d in (m.ART,m.ART/'apps/api',m.ART/'runtime/apps/web'):
  for name in ('.env','.env.local','.env.production','.env.production.local'):m.need(not (d/name).exists() and not (d/name).is_symlink(),'NO_DOTENV')
 return receipt,plan['identity'],plan['sourceIndexes']['reuse-build-receipt.json']
def bind_gates(quota_path,quota_sha,scanner_path,scanner_sha):
 result=original_bind(quota_path,quota_sha,scanner_path,scanner_sha)
 q,_=base.bound_receipt(quota_path,quota_sha)
 age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(q['at'])).total_seconds()
 m.need(q.get('gateAllowed') is True and q.get('identity')==plan['identity'] and q.get('effectiveRetentionMs')==7776000000 and q.get('databaseWrites') is False and q.get('phase')=='pre' and q.get('applicationAssemblyReceiptSha256')==COPY_SHA and q.get('manifestSha256')==MANIFEST_SHA and -5<=age<=120,'CURRENT_CANDIDATE_QUOTA')
 m.need(all(q['gate'][k]==0 for k in ('unfinishedStates','expiredPurged','purgedBecomingEligibleNext24h')),'QUOTA_THREE_ZERO')
 records=current_data_receipts(q['startupReceiptSha256']['pg'],q['startupReceiptSha256']['redis'],q['startupReceiptSha256']['scanner'])
 m.need(Path(scanner_path)==FINAL_FIVECASE_PATH,'EXACT_NEW_FIVECASE_PUBLIC_RESULT')
 scan,_=base.bound_receipt(scanner_path,scanner_sha);sc=records['scanner'];owner=sc['process']
 m.need(scan.get('identity')==plan['identity'] and all(scan.get('compiledIdentity',{}).get(k)==v for k,v in plan['identity'].items()),'NEW_COMPILED_SCANNER_CLIENT_IDENTITY')
 m.need(scanner_sha==handoff.OLD_FIVE_SHA,'EXACT_HISTORICAL_FIVECASE')
 result['scannerReuseApplicability']=HANDOFF['applicability']
 result['boundary']='Current CLEAN/EICAR verified with refreshed signatures; unchanged size/decompression boundaries retain historical evidence. No new five-case execution.'
 return result

def initialize(stopping=False):
 global base,original_bind,NATIVE_PROOF,observe
 m.need(re.fullmatch('[a-f0-9]{64}',FINAL_NATIVE_RECEIPT_SHA or '') is not None and FINAL_SCANNER_START_PATH and FINAL_SCANNER_RUN,'ACTUAL_NATIVE_AND_SCANNER_BINDINGS_PENDING')
 native=None if stopping else m.pinned(Path('/home/recovery/final-native-loader-r30-r02-evidence/result.json'),FINAL_NATIVE_RECEIPT_SHA)
 if not stopping:m.need(native['status']=='TEN_FINAL_TARGET_ELF_PROBES_VERIFIED_NOT_STARTED' and native['finalTargetFilesVerified'] is True and native['sourceProbeOnly'] is False,'ACTUAL_FINAL_NATIVE_LOADER')
 NATIVE_PROOF=native
 observe=types.ModuleType('application_observe');exec(compile(m.read(INPUT/'application-observe.py',32768),str(INPUT/'application-observe.py'),'exec'),observe.__dict__)
 raw=m.read(INPUT/'runtime-reference.py',128*1024);base=types.ModuleType('runtime_reference');base.__file__=str(INPUT/'runtime-reference.py');exec(compile(raw,base.__file__,'exec'),base.__dict__)
 base.ART=m.ART;base.NODE=m.NODE;base.COMMIT=plan['identity']['sourceCommit'];base.TREE=plan['identity']['sourceTree'];base.RELEASE=plan['identity']['release'];base.BUILD_TIME=plan['identity']['buildTime'];base.BUILD_RECEIPT_SHA=plan['sourceIndexes']['reuse-build-receipt.json']
 base.OFFLINE=m.R/'scanner-handoff-3941bec-r01';base.OFFLINE_PRIVATE=base.PRIVATE/'scanner-handoff-3941bec-r01';base.LOGS=base.OFFLINE_PRIVATE/'logs';base.ENVFILE=base.OFFLINE_PRIVATE/'runtime-env.json';base.PROXY=base.OFFLINE/'proxy.mjs';base.PREP=base.OFFLINE/'preparation.json';base.RUNS=base.OFFLINE/'runs'
 base.BASE_ENV={**base.BASE_ENV,'PATH':str(m.NODE.parent)+':/usr/bin:/bin','LD_LIBRARY_PATH':LIBPATH};base.PIN_FILE_SHA=PINS_SHA;base.package_pins=binding;base.validate_build=validate_build
 base.OLD_IDENTITY=plan['identity'];base.OLD_BASELINE=plan['sourceIndexes']['reuse-build-receipt.json']
 base.SOURCE_PREP=m.R/'final-joint-3941bec-r01/preparation.json';base.SOURCE_ENV=base.PRIVATE/'final-joint-3941bec-r01/runtime-env.json'
 base.validate_prepared=validate_existing_configuration
 original_bound=base.bound_receipt
 def bound_public(path,expected):
  if Path(path)==FINAL_FIVECASE_PATH:return m.pinned(FINAL_FIVECASE_PATH,expected,2*1024**2),{'path':str(FINAL_FIVECASE_PATH),'sha256':expected}
  return original_bound(path,expected)
 base.bound_receipt=bound_public
 original_bind=base.bind_prestart_evidence;base.bind_prestart_evidence=bind_gates

def validate_existing_configuration():
 # Configuration origin remains E122. New execution pins are not its creation pins.
 receipt,identity,receipt_hash=validate_build()
 prep=m.pinned(base.PREP,'2240d40b77daca4c273b5d95080d7b8bb860073835b5e7b81e5705cee4e09203',65536)
 m.need(prep.get('identity')==identity and prep['buildReceiptSha256']==receipt_hash and
        prep['packagePinFileSha256']=='7be393d7999bdbd8f5087e2014c4b8ee1fafb1917ec8f5c276f7b50e8e3d3600' and
        prep['packageBinding']==binding() and prep['artifact']==str(m.ART) and prep['node']==str(m.NODE), 'EXISTING_CONFIG_ORIGIN')
 envraw=base.read(base.ENVFILE,private=True)
 m.need(prep['envSha256']==m.sha(envraw) and prep['proxySha256']==m.sha(base.read(base.PROXY)) and
        prep['caSha256']==m.sha(base.read(m.R/'tls/ca.crt',32768)) and
        prep['leafSha256']==m.sha(base.read(m.R/'tls/localhost.crt',32768)), 'EXISTING_CONFIG_CONTENT')
 env=json.loads(envraw);base.config_check(env)
 return receipt,identity,env

def current_data_receipts(pg_sha,redis_sha,scanner_sha):
 m.need(HANDOFF is not None and scanner_sha==HANDOFF['startSha256'],'ACTUAL_HANDOFF_REQUIRED')
 handoff.live_owner(m,HANDOFF['start'],HANDOFF['verify'])
 records={}
 for role,path,h in [('pg',m.R/'vm-resume-r30-20261028-r01/pg-start.json',pg_sha),('redis',m.R/'vm-resume-r30-20261028-r01/redis-start.json',redis_sha),('scanner',Path(FINAL_SCANNER_START_PATH),scanner_sha)]:
  record=m.pinned(path,h,131072);records[role]=record
  if role=='pg':m.need(record.get('status')=='ORIGINAL_POSTGRES_STARTED_NEW_BOOT' and record.get('bootId')==m.BOOT,'PG_RECEIPT');owner=record['readback']['process']
  elif role=='redis':m.need(record.get('status')=='ORIGINAL_REDIS_STARTED_NEW_BOOT' and record.get('bootId')==m.BOOT,'REDIS_RECEIPT');owner=record['process']
  else:m.need(record.get('status')=='NEW_PREFIX_SCANNER_RUNNING_READBACK_VERIFIED' and record.get('run')==FINAL_SCANNER_RUN and record.get('currentBootId')==m.BOOT,'SCANNER_RECEIPT');owner=record['process']
  p=Path('/proc')/str(owner['pid']);raw=(p/'stat').read_text();m.need(raw[raw.rfind(')')+2:].split()[19]==str(owner['startTicks']) and p.stat().st_uid==owner['uid'],'CURRENT_SERVICE_OWNER')
 m.need(pg_sha=='8157ac693d5bc0bece3bf2b5626b06098f658533198c49e53d5c99cdb801c03e' and redis_sha=='34690e10045e93b89592b84e0485cc0188583e25514365bd4f72f70addcd808a','EXACT_CURRENT_DATA_RECEIPTS')
 pg=records['pg'];rd=records['redis']
 m.need(pg['readback']['systemId']=='7700459308674415750' and pg['readback']['data']=='/var/lib/postgresql/14/main' and pg['readback']['port']=='5432' and pg.get('noRestoreMigrationSeedOrRepair') is True,'SAME_POSTGRES_CLUSTER')
 m.need(rd.get('authenticatedPing') is True and rd.get('noFlushResetRepairOrConfigChanges') is True and rd['settings']=={'bind':'127.0.0.1','protected-mode':'yes','appendonly':'yes','appendfsync':'always','aof-load-truncated':'no','maxmemory-policy':'noeviction'} and rd['persistence']=={'loading':'0','aof_enabled':'1','aof_last_write_status':'ok'},'SAME_REDIS_PERSISTENCE')
 return records

def quota(phase,run,pg_sha,redis_sha,scanner_sha):
 base.run_dir(run);records=current_data_receipts(pg_sha,redis_sha,scanner_sha)
 _,identity,env=base.validate_prepared()
 if phase=='pre':m.need(not base.listeners(),'APP_MUST_BE_STOPPED')
 else:
  owners=base.owners_for(base.run_dir(run));m.need(set(owners)==set(base.PORTS),'THREE_OWNERS');base.assert_listeners(owners);base.four_identities(identity)
 source="const c=require('./apps/api/dist/common/app-config.js');const i=require('./apps/api/dist/common/build-identity.generated.js').IMMUTABLE_BUILD_IDENTITY;process.stdout.write(String(c.resolveAppConfig(process.env,i).attachmentStoragePurgedMetadataRetentionMs))"
 result=subprocess.run([str(m.NODE),'--max-old-space-size=128','-e',source],cwd=m.ART,env={**base.BASE_ENV,**env},stdin=subprocess.DEVNULL,capture_output=True,timeout=20);m.need(result.returncode==0 and result.stdout==b'7776000000','EFFECTIVE_RETENTION')
 q="BEGIN TRANSACTION READ ONLY; SELECT json_build_object('database',current_database(),'address',inet_server_addr()::text,'port',inet_server_port()); SELECT json_build_object('role',current_user,'readOnly',current_setting('transaction_read_only')); SELECT json_build_object('observedAt',clock_timestamp(),'retentionMs',7776000000,'retentionSeconds',7776000,'retentionIntervalExactMs',EXTRACT(EPOCH FROM make_interval(secs => 7776000))*1000,'unfinishedStates',(SELECT count(*) FROM public.attachment_storage_reservations WHERE state::text IN ('RESERVED','PURGING','RECONCILIATION_REQUIRED')),'expiredPurged',(SELECT count(*) FROM public.attachment_storage_reservations WHERE state::text='PURGED' AND \"purgedAt\" < now() - make_interval(secs => 7776000)),'purgedBecomingEligibleNext24h',(SELECT count(*) FROM public.attachment_storage_reservations WHERE state::text='PURGED' AND \"purgedAt\" >= now() - make_interval(secs => 7776000) AND \"purgedAt\" < now() + interval '24 hours' - make_interval(secs => 7776000)),'totalReservationRows',(SELECT count(*) FROM public.attachment_storage_reservations)); COMMIT;"
 db=urllib.parse.urlsplit(env['DATABASE_URL']);m.need(db.hostname=='127.0.0.1' and db.port==5432 and db.username=='truck_color_app' and db.path=='/truck_color_recovery_r24_20261025','EXACT_DATABASE')
 penv={'PATH':'/usr/bin:/bin','HOME':'/home/recovery','LANG':'C.UTF-8','PGPASSWORD':urllib.parse.unquote(db.password),'PGOPTIONS':'-c default_transaction_read_only=on'}
 result=subprocess.run(['/usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1','--inhibit-cache','--library-path',LIBPATH,'/home/recovery/runtime-debs-r30-r02/usr/lib/postgresql/14/bin/psql','-h','127.0.0.1','-p','5432','-U','truck_color_app','-X','-A','-t','-q','-v','ON_ERROR_STOP=1','-d','truck_color_recovery_r24_20261025','-f','-'],input=q,capture_output=True,text=True,cwd='/tmp',env=penv,timeout=20);m.need(result.returncode==0 and len(result.stdout)<65536,'READONLY_QUOTA_QUERY')
 a,b,c=[json.loads(x) for x in result.stdout.splitlines() if x.strip()];m.need(a=={'database':'truck_color_recovery_r24_20261025','address':'127.0.0.1/32','port':5432} and b=={'role':'truck_color_app','readOnly':'on'} and c['retentionIntervalExactMs']==7776000000,'QUERY_IDENTITY')
 allowed=all(c[x]==0 for x in ('unfinishedStates','expiredPurged','purgedBecomingEligibleNext24h'))
 report={'at':m.now(),'phase':phase,'run':run,'identity':identity,'gateAllowed':allowed,'database':a,'transaction':b,'gate':c,'effectiveRetentionMs':7776000000,'databaseWrites':False,'applicationAssemblyReceiptSha256':COPY_SHA,'manifestSha256':MANIFEST_SHA,'startupReceiptSha256':{'pg':pg_sha,'redis':redis_sha,'scanner':scanner_sha},'startupReceipts':records,'totalReservationRowsPriorObservation':39,'totalReservationRowsMatchPriorObservation':c['totalReservationRows']==39,'totalRowCountIsAdmissionCondition':False}
 path=base.OFFLINE/('quota-'+phase+'-'+run+'.json');h=m.write(path,report);print(json.dumps({'path':str(path),'sha256':h,'report':report}),flush=True)
 if not allowed:raise RuntimeError('CHECK_QUOTA_GATE_FALSE_PRESERVED')

def main():
 global m,pins,plan,PINS_SHA,MANIFEST_SHA,COPY_SHA,BUDGET_SHA,HANDOFF,handoff,FINAL_SCANNER_START_PATH,FINAL_SCANNER_RUN
 p=argparse.ArgumentParser();p.add_argument('--execute-reviewed',action='store_true');p.add_argument('--pins-sha256');p.add_argument('--manifest-sha256');p.add_argument('--copy-sha256');p.add_argument('--budget-sha256');p.add_argument('--handoff-sha256');p.add_argument('--handoff-mode',choices=['healthy','rollback']);p.add_argument('phase',nargs='?');p.add_argument('args',nargs='*');a=p.parse_args()
 if not a.execute_reviewed:print(json.dumps({'status':'PLAN_ONLY','phases':['quota-pre','start','verify','quota-post','stop'],'runtime':'Joint installed application/runtime; PG and Redis retain actual existing E102/E105/E106 boundary'}));return
 raw=(INPUT/'preview-common.py').read_bytes()
 if len(raw)>65536 or hashlib.sha256(raw).hexdigest()!=COMMON_SHA:raise RuntimeError('CHECK_COMMON_EXTERNAL_PIN')
 m=types.ModuleType('preview_common');m.__file__=str(INPUT/'preview-common.py');exec(compile(raw,m.__file__,'exec'),m.__dict__)
 PINS_SHA=a.pins_sha256;MANIFEST_SHA=a.manifest_sha256;COPY_SHA=a.copy_sha256;BUDGET_SHA=a.budget_sha256
 m.need(all(re.fullmatch('[a-f0-9]{64}',x or '') for x in (PINS_SHA,MANIFEST_SHA,COPY_SHA)),'EXTERNAL_PINS');pins,plan=m.load(PINS_SHA)
 if a.phase not in ('prepare','stop'):
  handoff=types.ModuleType('scanner_handoff');exec(compile(m.read(INPUT/'scanner-handoff.py',65536),str(INPUT/'scanner-handoff.py'),'exec'),handoff.__dict__)
  m.need(a.handoff_mode=='healthy','RESUME_HEALTHY_SCANNER_ONLY')
  HANDOFF=handoff.load(m,plan,{'path':str(INPUT/'handoff-healthy.json'),'sha256':a.handoff_sha256})
  FINAL_SCANNER_START_PATH=HANDOFF['startPath'];FINAL_SCANNER_RUN=HANDOFF['start']['run']
 initialize(a.phase=='stop')
 resource=None if a.phase=='stop' else observe.resources(m,base,BUDGET_SHA,a.phase in ('prepare','start'))
 if a.phase=='start' and len(a.args)==5:
  base.start(*a.args)
  try:print(json.dumps(observe.record(m,base,a.args[0],'after-start',NATIVE_PROOF,observe.resources(m,base,BUDGET_SHA)),default=list))
  except BaseException:
   m.write(base.run_dir(a.args[0])/'post-start-observation-failure-stop.json',{'at':m.now(),'cleanup':base.stop_owned(base.owners_for(base.run_dir(a.args[0])))});raise
 elif a.phase=='verify' and len(a.args)==1:
  _,identity,_=base.validate_prepared();owners=base.owners_for(base.run_dir(a.args[0]));m.need(set(owners)==set(base.PORTS),'THREE_OWNERS');base.assert_listeners(owners);print(json.dumps({'status':'IDENTITY_LISTENERS_AND_MAPS_VERIFIED','identities':base.four_identities(identity),'nativeObservation':observe.record(m,base,a.args[0],'verify',NATIVE_PROOF,resource)},default=list))
 elif a.phase in ('quota-pre','quota-post') and len(a.args)==4:quota(a.phase.split('-')[1],*a.args)
 elif a.phase=='stop' and len(a.args)==2:
  run,event=a.args;m.need(re.fullmatch('[a-z0-9][a-z0-9-]{0,63}',event) is not None,'STOP_EVENT');path=base.run_dir(run)/('stop-'+event+'.json');m.need(not path.exists(),'EXCLUSIVE_STOP')
  try:result={'status':'OWNED_APPLICATIONS_STOPPED','at':m.now(),'processes':base.stop_owned(base.owners_for(base.run_dir(run)))}
  except Exception as ex:
   result={'status':'STOP_FAILED_NO_FORCE_KILL','at':m.now(),'failureCode':base.safe_error(ex)};h=m.write(path,result);print(json.dumps({'path':str(path),'sha256':h,'report':result}));raise
  h=m.write(path,result);print(json.dumps({'path':str(path),'sha256':h,'report':result}))
 else:raise RuntimeError('CHECK_EXACT_INVOCATION')
if __name__=='__main__':
 os.umask(0o077)
 def deadline(*_):raise RuntimeError('CHECK_HELPER_DEADLINE')
 if '--execute-reviewed' in sys.argv:signal.signal(signal.SIGALRM,deadline);signal.alarm(145)
 try:main()
 except Exception as ex:
  value=str(ex);print(json.dumps({'status':'FAILED_PRESERVED','code':value if re.fullmatch('CHECK_[A-Z0-9_]+',value) else type(ex).__name__}));sys.exit(1)
