"""Read-only shared scanner admission for A2. Historical five cases remain historical."""
from pathlib import Path
import datetime,hashlib,json,os,re,time
OLD_ROOT=Path('/home/recovery/offline-validation-final-scanner-r30-r01')
NEW_ROOT=Path('/home/recovery/offline-scanner-healthy-r30-r02')
HISTORY_BOOT='2552886b-e854-4f99-8b4e-bd307d8ddb92'
CURRENT_RUN='newboot-healthy-scanner-r30-r02'
REFRESH_PATH=Path('/home/recovery/offline-signatures-r30-20261028-r01/result.json')
OLD_RUN='first-verified-joint-r30-r03'
OLD_START=OLD_ROOT/'scanner/events'/('start-'+OLD_RUN)/'receipt.json'
OLD_START_SHA='f5ee718fea939bbeef85740641c76196a9f3a8c0b27ddb0a66539f90298df084'
OLD_FIVE=OLD_ROOT/'scanner-fivecase-r01/result.json'
OLD_FIVE_SHA='78ab069d5a5c7a401c847e2ed2cbabf3bd9507f2ed9474907572bdc94f2aa20d'
NATIVE_SHA='59f7dbb8308d655d3c97a6899bb76b5939ea7857abdcea008f153611f235a237'
DATA_SHA='0203a2ca9fa6a6584942145ce8aac93ae27dbd26612069c2407cb03134d037ee'
OFFICIAL_SHA='21143bac15f028d09e290f42034295d68f5c1a48811d90c11b2544c42ef5b7fd'
PATH_KEYS={'DatabaseDirectory','TemporaryDirectory','LogFile','PidFile'}

def require(ok,code):
 if not ok:raise RuntimeError('CHECK_HANDOFF_'+code)

def sig_projection(rows):
 require(isinstance(rows,list) and len(rows)==3 and {x['name'] for x in rows}=={'main.cvd','daily.cvd','bytecode.cvd'},'CVD_SET')
 return {x['name']:{k:x[k] for k in ('bytes','sha256','version','buildEpoch')} for x in rows}

def config_rows(raw):
 rows={}
 for line in raw.decode().splitlines():
  require(line and not line.startswith('#') and len(line.split(None,1))==2,'CONFIG_LINE')
  k,v=line.split(None,1);require(k not in rows,'CONFIG_DUPLICATE');rows[k]=v
 require(len(rows)==29 and PATH_KEYS<=set(rows),'CONFIG_KEYS')
 return rows

def compare(old,five,start,verify,identity,boot,mode,old_config,new_config,now_epoch,refreshed=None):
 require(mode in ('healthy','rollback'),'MODE')
 require(old.get('identity')==identity and old.get('currentBootId')==(HISTORY_BOOT if refreshed else boot),'HISTORICAL_IDENTITY_BOOT')
 for v in (start,verify):
  require(v.get('identity')==identity and v.get('currentBootId')==boot,'RECEIPT_IDENTITY_BOOT')
 require(start.get('status')=='NEW_PREFIX_SCANNER_RUNNING_READBACK_VERIFIED' and start.get('phase')=='start' and start.get('scannerLeftRunning') is True,'ACTUAL_START')
 require(verify.get('status')=='NEW_PREFIX_SCANNER_READBACK_VERIFIED' and verify.get('phase')=='verify','ACTUAL_VERIFY')
 require(five.get('status')=='FIVECASE_REAL_CLIENT_PASS' and len(five.get('cases',[]))==5 and all(c.get('status')=='PASS' for c in five['cases']),'HISTORICAL_FIVE')
 require(five.get('identity')==identity and all(five.get('compiledIdentity',{}).get(k)==v for k,v in identity.items()) and five.get('historicalFiveCaseResultReused') is False,'HISTORICAL_COMPILED_IDENTITY')
 require(five.get('scannerStartReceipt')=={'path':str(OLD_START),'sha256':OLD_START_SHA} and all(five['scannerProcess'].get(k)==old['process'][k] for k in ('pid','startTicks','uid','executable','cwd')),'HISTORICAL_OWNER')
 require(five.get('signatureMaxAgeHours')==48 and five.get('perScanTimeoutMs')==15000 and five.get('overallDeadlineMs')==100000,'HISTORICAL_SCAN_LIMITS')
 for v in (old,start,verify):
  require(v.get('nativeReceipt',{}).get('sha256')==NATIVE_SHA and v.get('nonExecutableDataBaseline',{}).get('sha256')==DATA_SHA and v.get('officialNonExecutableDataSource',{}).get('sha256')==OFFICIAL_SHA,'NATIVE_AND_DATA_PINS')
 for key in ('applicationAssemblySha256','runtimeAssemblySha256','runtimeManifestSha256'):
  require(start['packageBinding'].get(key)==verify['packageBinding'].get(key)==old['packageBinding'][key],'SAME_SOFTWARE_'+key.upper())
 o=old['runtime'];a=start['runtime'];b=verify['runtime']
 for key in ('loadedPrivateLibraries','loadedNonExecutableData','actualFileSizeLimit','actualExecutable','declaredClamdBinary','childEnvironmentWhitelist'):
  require(o.get(key)==a.get(key)==b.get(key),'RUNTIME_EQUAL_'+key.upper())
 require(a['ping']==b['ping']=='PONG' and a['actualFileSizeLimit']=={'softBytes':134217728,'hardBytes':134217728},'READINESS_AND_LIMITS')
 if refreshed:
  verify_refreshed(refreshed,start,verify,identity,boot,now_epoch)
  require(o['actualVersion'].split('/')[0]==a['actualVersion'].split('/')[0] and a['actualVersion']==b['actualVersion'],'SAME_ENGINE_NEW_DATABASE')
 else:
  require(o['actualVersion']==a['actualVersion']==b['actualVersion'] and sig_projection(o['signatures'])==sig_projection(a['signatures'])==sig_projection(b['signatures']),'SAME_CVD')
 daily=next(x for x in b['signatures'] if x['name']=='daily.cvd');require(0<=now_epoch-daily['buildEpoch']<=172800,'CURRENT_CVD_AGE')
 before=config_rows(old_config);after=config_rows(new_config)
 require({k:v for k,v in before.items() if k not in PATH_KEYS}=={k:v for k,v in after.items() if k not in PATH_KEYS},'SAME_25_LOGICAL_DIRECTIVES')
 root=NEW_ROOT if mode=='healthy' else OLD_ROOT
 run=CURRENT_RUN if mode=='healthy' else 'rollback-after-healthy-r30-r01'
 expected={'DatabaseDirectory':str(root/'scanner-db'),'TemporaryDirectory':str(root/'scanner/tmp'),
  'LogFile':str(root/('private/scanner/clamd.log' if mode=='healthy' else 'private/scanner/clamd-'+run+'.log')),
  'PidFile':str(root/('scanner/clamd.pid' if mode=='healthy' else 'scanner/clamd-'+run+'.pid'))}
 require({k:after[k] for k in PATH_KEYS}==expected and start['run']==run,'EXACT_NEW_PATH_DIRECTIVES')
 require({k:before[k] for k in PATH_KEYS}=={'DatabaseDirectory':str(OLD_ROOT/'scanner-db'),'TemporaryDirectory':str(OLD_ROOT/'scanner/tmp'),'LogFile':str(OLD_ROOT/'private/scanner/clamd-verified-joint-r30-r03.log'),'PidFile':str(OLD_ROOT/'scanner/clamd-verified-joint-r30-r03.pid')},'OLD_CONFIG_PATHS')
 return {'historicalFiveCaseResultReused':refreshed is None,'historicalBoundaryCasesReused':['exact20MiB','compressed21MiBMember'] if refreshed else [],'newTwoCaseExecution':'ACTUAL_CURRENT_COMPILED_CLIENT_PASS' if refreshed else 'NOT_EXECUTED','newFiveCaseExecution':'NOT_EXECUTED','logicalConfigDirectivesEqual':25,
 'nativeReceiptSha256':NATIVE_SHA,'signatureBytesAndMetadataEqual':refreshed is None,'compiledClientSource':'same exact application manifest and current installed hashes',
 'newOwnerReadinessAndMaps':'ACTUAL_CURRENT_START_AND_VERIFY_RECEIPTS','oldObserverCoversNewProcess':False}

def verify_refreshed(proofs,start,verify,identity,boot,now_epoch):
 refresh,client=proofs['refresh'],proofs['client']
 require(refresh.get('status')=='OFFICIAL_SIGNATURE_REFRESH_VERIFIED_SCANNER_NOT_STARTED' and refresh.get('bootId')==boot and refresh.get('identity')==identity,'ACTUAL_REFRESH')
 require(sig_projection(refresh['signatures'])==sig_projection(start['runtime']['signatures'])==sig_projection(verify['runtime']['signatures']),'REFRESH_START_VERIFY_CVD')
 require(start['packageBinding'].get('signatureRefreshReceipt')==verify['packageBinding'].get('signatureRefreshReceipt')==proofs['refreshRef'],'REFRESH_PHASE_REFERENCE')
 require(client.get('status')=='TWOCASE_REAL_CLIENT_PASS' and client.get('identity')==identity and all(client.get('compiledIdentity',{}).get(k)==v for k,v in identity.items()) and client.get('currentBootId')==boot,'ACTUAL_CURRENT_CLIENT')
 require(client.get('scannerStartReceipt')==proofs['startRef'] and client.get('scannerProcess')==start['process'],'CURRENT_CLIENT_SCANNER_OWNER')
 require(client.get('endpoint')=={'host':'127.0.0.1','port':3310} and client.get('databaseOrHttpAccess') is False and client.get('serviceControl') is False and client.get('signatureMaxAgeHours')==48 and client.get('perScanTimeoutMs')==15000,'CURRENT_CLIENT_SCOPE')
 cases=client.get('cases',[])
 require(len(cases)==2 and {x.get('label') for x in cases}=={'clean','EICAR'},'CURRENT_CLIENT_TWO_CASES')
 expected={'clean':('CLEAN','CLEAN'),'EICAR':('REJECTED','MALWARE_FOUND:Eicar-Test-Signature')}
 daily=next(x for x in verify['runtime']['signatures'] if x['name']=='daily.cvd')
 for row in cases:
  actual=row.get('actual',{});want=expected[row['label']]
  require(row.get('status')=='PASS' and (actual.get('verdict'),actual.get('resultSummary'))==want and actual.get('engine')=='clamav' and actual.get('engineVersion')=='1.4.6' and actual.get('signatureVersion')==str(daily['version']),'CURRENT_CLIENT_VERDICTS')
 require(client['loadedScanner']['signatureVersion']==str(daily['version']) and client['loadedScanner']['signatureTimestampMs']==daily['buildEpoch']*1000 and 0<=now_epoch-daily['buildEpoch']<=172800,'CURRENT_CLIENT_LOADED_VERSION')

def live_owner(m,start,verify):
 require(Path('/proc/sys/kernel/random/boot_id').read_text().strip()==m.BOOT,'LIVE_BOOT')
 owner=start['process'];pid=owner['pid'];require(type(pid)is int and pid>1 and owner['uid']==1100,'OWNER_FIELDS')
 p=Path('/proc')/str(pid)
 def snapshot():
  s=(p/'stat').read_text();parts=s[s.rfind(')')+2:].split()
  require(parts[0]!='Z' and int(parts[19])==owner['startTicks'] and p.stat().st_uid==owner['uid'],'LIVE_PID_TICK_UID')
  require(os.readlink(p/'exe')==owner['executable'] and os.readlink(p/'cwd')==owner['cwd'],'LIVE_EXE_CWD')
  raw=(p/'cmdline').read_bytes();require(len(raw)<16384 and [x.decode() for x in raw.split(b'\0') if x]==owner['argv'],'LIVE_ARGV')
 snapshot();found=[]
 for name in ('tcp','tcp6'):
  for line in (Path('/proc/net')/name).read_text().splitlines()[1:]:
   fields=line.split();addr,port=fields[1].split(':')
   if fields[3]=='0A' and int(port,16)==3310:found.append({'table':'/proc/net/'+name,'addressHex':addr,'port':3310,'inode':fields[9]})
 require(len(found)==1 and found[0]==verify['runtime']['listener'] and found[0]['addressHex']=='0100007F','LIVE_LISTENER')
 links=[]
 for fd in (p/'fd').iterdir():
  try:links.append(os.readlink(fd))
  except FileNotFoundError:pass
 require('socket:['+found[0]['inode']+']' in links,'LIVE_SOCKET_OWNER');snapshot()


def load(m,plan,reference):
 mode="healthy";pin=reference["sha256"]
 require(mode in ('healthy','rollback') and re.fullmatch('[a-f0-9]{64}',pin or ''),'EXTERNAL_BINDING')
 binding=m.pinned(Path(reference['path']),pin,16384)
 require(binding.get('kind')=='CURRENT_INSTANCE_SCANNER_HANDOFF_V2' and binding.get('identity')==plan['identity'] and binding.get('mode')==mode and binding.get('currentBootId')==m.BOOT,'BINDING_IDENTITY')
 root=NEW_ROOT if mode=='healthy' else OLD_ROOT;run=CURRENT_RUN if mode=='healthy' else 'rollback-after-healthy-r30-r01'
 expected_start=root/'scanner/events'/('start-'+run)/'receipt.json'
 expected_verify=Path(binding['verify']['path'])
 require(expected_verify.name=='receipt.json' and expected_verify.parent.parent==root/'scanner/events' and re.fullmatch(r'verify-(?:a2|resume)-[a-z0-9-]{1,48}',expected_verify.parent.name),'A2_CURRENT_READBACK_PATH')
 require(binding['start']['path']==str(expected_start) and binding['verify']['path']==str(expected_verify),'EXACT_RECEIPT_PATHS')
 for k in ('start','verify'):require(re.fullmatch('[a-f0-9]{64}',binding[k]['sha256']) is not None,'RECEIPT_HASH')
 start=m.pinned(expected_start,binding['start']['sha256'],1024*1024);verify=m.pinned(expected_verify,binding['verify']['sha256'],1024*1024)
 old=m.pinned(OLD_START,OLD_START_SHA,131072);five=m.pinned(OLD_FIVE,OLD_FIVE_SHA,131072)
 require({k:verify['startReceipt'][k] for k in ('path','sha256')}==binding['start'],'VERIFY_ACTUAL_START')
 stamp=datetime.datetime.fromisoformat(verify['finishedAt']).timestamp();require(-5<=time.time()-stamp<=300,'VERIFY_RECENT_300_SECONDS')
 expected_config=root/('scanner/clamd.conf' if mode=='healthy' else 'scanner/events/start-'+run+'/clamd.conf')
 old_config=Path(old['runtime']['config']['path']);require(old_config==OLD_START.parent/'clamd.conf','OLD_CONFIG_PATH')
 new_meta=verify['runtime']['config'];require(new_meta['path']==str(expected_config) and start['runtime']['config']==new_meta,'NEW_CONFIG_PATH')
 old_raw=m.read(old_config,8192);new_raw=m.read(expected_config,8192)
 require(m.sha(old_raw)==old['runtime']['config']['sha256'] and m.sha(new_raw)==new_meta['sha256'],'CURRENT_CONFIG_HASH')
 if mode=='healthy':
  require(start.get('kind')==verify.get('kind')=='OFFLINE_SCANNER_HEALTHY_FIRST_START' and start.get('scannerTarget')==verify.get('scannerTarget')==str(root),'HEALTHY_TARGET')
  require(start['packageBinding']==verify['packageBinding'] and start['packagePinFileSha256']==verify['packagePinFileSha256'] and start['jointDeliveryBinding']==verify['jointDeliveryBinding'] and start['preparationSha256']==verify['preparationSha256'] and start['configSha256']==verify['configSha256']==new_meta['sha256'],'PHASE_BINDING')
 else:require(start.get('kind')==verify.get('kind')=='FINAL_JOINT_SCANNER_LOCALE_DATA_CONTROL' and start['packageBinding']==verify['packageBinding']==old['packageBinding'],'ROLLBACK_BINDING')
 require(binding['refresh']['path']==str(REFRESH_PATH) and binding['client']['path']==str(NEW_ROOT/'client-two-r01/result.json'),'EXACT_CURRENT_PROOF_PATHS')
 refreshed={'refresh':m.pinned(REFRESH_PATH,binding['refresh']['sha256'],2*1024**2),'client':m.pinned(NEW_ROOT/'client-two-r01/result.json',binding['client']['sha256'],2*1024**2),'refreshRef':binding['refresh'],'startRef':binding['start']}
 applicability=compare(old,five,start,verify,plan['identity'],m.BOOT,mode,old_raw,new_raw,time.time(),refreshed)
 applicability.update(currentRefresh=binding['refresh'],currentTwoCases=binding['client'])
 manifest=m.pinned(m.TARGET/'application-manifest.json','c6b3f29ca19eca0111e1127d1c4e07e1f4d8d2b142893ef8f0a1ca15056db8a2')
 for rel in ('apps/api/dist/modules/attachments/malware-scanner.service.js','apps/api/dist/modules/attachments/clamav-session.js','apps/api/dist/common/upload-security.constants.js','apps/api/dist/common/build-identity.generated.js'):
  row=manifest['entries'][rel];require(m.filehash(m.ART/rel,row['bytes'])==row['sha256'],'CURRENT_COMPILED_CLIENT')
 require(five['clientNode']==str(m.NODE) and m.filehash(m.NODE,119812464)==m.NODE_SHA,'CURRENT_CLIENT_NODE')
 live_owner(m,start,verify)
 applicability.update(historicalFivecase={'path':str(OLD_FIVE),'sha256':OLD_FIVE_SHA},newScannerStart=binding['start'],newScannerVerify=binding['verify'],handoffBindingSha256=pin,at=m.now())
 return {'startPath':str(expected_start),'startSha256':binding['start']['sha256'],'start':start,'verify':verify,'applicability':applicability}
