"""Current scanner admission rejects stale/mismatched refresh and real-client evidence."""
import copy
import importlib.util
from pathlib import Path
import unittest
p=Path(__file__).with_name('instance_scanner.py');spec=importlib.util.spec_from_file_location('scanner',p)
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)

class RefreshAdmission(unittest.TestCase):
 def fixture(self):
  identity={'sourceCommit':'a'*40};boot='current';now=1800000000
  rows=[{'name':n,'bytes':i+1,'sha256':str(i)*64,'version':100+i,'buildEpoch':now-100} for i,n in enumerate(('main.cvd','daily.cvd','bytecode.cvd'))]
  reference={'path':str(s.REFRESH_PATH),'sha256':'b'*64};startref={'path':'current-start','sha256':'c'*64}
  start={'process':{'pid':123,'startTicks':456},'runtime':{'signatures':rows},'packageBinding':{'signatureRefreshReceipt':reference}}
  verify=copy.deepcopy(start)
  client={'status':'TWOCASE_REAL_CLIENT_PASS','identity':identity,'compiledIdentity':identity,'currentBootId':boot,
   'scannerStartReceipt':startref,'scannerProcess':start['process'],'endpoint':{'host':'127.0.0.1','port':3310},
   'databaseOrHttpAccess':False,'serviceControl':False,'signatureMaxAgeHours':48,'perScanTimeoutMs':15000,
   'loadedScanner':{'signatureVersion':'101','signatureTimestampMs':(now-100)*1000},'cases':[]}
  for label,verdict,summary in [('clean','CLEAN','CLEAN'),('EICAR','REJECTED','MALWARE_FOUND:Eicar-Test-Signature')]:
   client['cases'].append({'label':label,'status':'PASS','actual':{'verdict':verdict,'resultSummary':summary,'engine':'clamav','engineVersion':'1.4.6','signatureVersion':'101'}})
  proofs={'refresh':{'status':'OFFICIAL_SIGNATURE_REFRESH_VERIFIED_SCANNER_NOT_STARTED','bootId':boot,'identity':identity,'signatures':rows},
   'client':client,'refreshRef':reference,'startRef':startref}
  return proofs,start,verify,identity,boot,now
 def test_actual_fresh_two_cases_admitted(self):s.verify_refreshed(*self.fixture())
 def test_stale_or_future_signature_rejected(self):
  args=list(self.fixture())
  for shift in (172801,-101):
   args[-1]=1800000000+shift
   with self.assertRaisesRegex(RuntimeError,'CURRENT_CLIENT_LOADED_VERSION'):s.verify_refreshed(*args)
 def test_changed_database_byte_and_owner_are_rejected(self):
  for target in ('database','owner','boot','receipt','verdict','version','count'):
   args=list(self.fixture());proofs,start,verify,*_=args
   if target=='database':verify['runtime']['signatures'][1]['sha256']='f'*64
   elif target=='owner':proofs['client']['scannerProcess']={'pid':124,'startTicks':456}
   elif target=='boot':proofs['client']['currentBootId']='old'
   elif target=='receipt':proofs['client']['scannerStartReceipt']={'path':'old','sha256':'c'*64}
   elif target=='verdict':proofs['client']['cases'][1]['actual']['verdict']='CLEAN'
   elif target=='version':proofs['client']['loadedScanner']['signatureVersion']='100'
   else:proofs['client']['cases'].append(copy.deepcopy(proofs['client']['cases'][0]))
   with self.subTest(target=target),self.assertRaises(RuntimeError):s.verify_refreshed(*args)

 def local_fixture(self):
  args=list(self.fixture());proofs,start,verify,identity,boot,_=args
  manifest={'path':'/home/recovery/input/local-sources.json','sha256':'d'*64}
  imported={'path':str(s.NEW_ROOT/'scanner-db/IMPORT-RECEIPT.json'),'sha256':'e'*64}
  rows=proofs['refresh']['signatures']
  for row in rows:row.update(sigtoolExitCode=0,verificationLogSha256='f'*64,requiredFunctionalityLevel=90)
  proofs.update(sourceKind='OFFICIAL_CVD_LOCAL_SOURCES_V1',refreshRef=imported)
  proofs['refresh']={'status':'OFFLINE_SIGNATURE_IMPORT_VERIFIED_SCANNER_NOT_STARTED','sourceKind':'OFFICIAL_CVD_LOCAL_SOURCES_V1',
   'currentBootId':boot,'identity':identity,'signatures':rows,'signatureMaterialManifest':manifest,
   'networkUsed':False,'freshclamExecuted':False,'clamdStarted':False,'originalRefreshOutcome':'FAILED_PRESERVED',
   'target':str(s.NEW_ROOT/'scanner-db')}
  for receipt in (start,verify):
   receipt['packageBinding']={'kind':'OFFLINE_SCANNER_TARGET_V3','signatureMaterialManifest':manifest}
   receipt['signatureImportReceipt']=copy.deepcopy(imported)
   receipt['runtime']['localSetLoad']={'databaseDirectory':str(s.NEW_ROOT/'scanner-db'),
    'databaseFiles':['bytecode.cvd','daily.cvd','main.cvd'],'loadedSignatures':20,
    'engineFunctionalityLevel':216,'requiredFunctionalityLevels':{r['name']:90 for r in rows},
    'headerCountEqualityAsserted':False,'bytecodeTrustSignedObserved':True,'daemonLogPrefix':{'path':str(s.NEW_ROOT/'private/scanner/clamd.log'),'prefixSha256':'f'*64}}
  return args

 def test_actual_local_import_and_current_client_can_be_admitted(self):s.verify_refreshed(*self.local_fixture())
 def test_local_manifest_alone_or_partial_verification_never_counts_as_import(self):
  for key in ('status','freshclamExecuted','signatureMaterialManifest','sigtool','sourceKind','importRef','importPath','load'):
   args=self.local_fixture();proofs,start,verify,*_=args
   if key=='status':proofs['refresh']['status']='SOURCES_DECLARED_NOT_VERIFIED'
   elif key=='freshclamExecuted':proofs['refresh']['freshclamExecuted']=True
   elif key=='signatureMaterialManifest':proofs['refresh']['signatureMaterialManifest']={'path':'different','sha256':'d'*64}
   elif key=='sigtool':proofs['refresh']['signatures'][0]['sigtoolExitCode']=1
   elif key=='sourceKind':proofs['sourceKind']='unknown'
   elif key=='importPath':proofs['refreshRef']['path']='/home/recovery/other/IMPORT-RECEIPT.json'
   elif key=='load':start['runtime']['localSetLoad']['databaseFiles']=['daily.cvd']
   else:start['signatureImportReceipt']['sha256']='0'*64
   with self.subTest(key=key),self.assertRaises(RuntimeError):s.verify_refreshed(*args)

if __name__=='__main__':unittest.main()
