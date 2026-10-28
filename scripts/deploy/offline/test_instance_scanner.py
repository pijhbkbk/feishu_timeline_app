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

if __name__=='__main__':unittest.main()
