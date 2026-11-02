"""Synthetic files exercise source rejection and import, not real CVD acceptance."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC=importlib.util.spec_from_file_location('scanner',Path(__file__).with_name('install_scanner.py'))
m=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(m)


class LocalSources(unittest.TestCase):
    def setUp(self):
        previous_umask=os.umask(0o077);self.addCleanup(lambda:os.umask(previous_umask))
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        self.home=Path(temp.name).resolve();self.old=self.home/'offline-signatures-old'
        self.failed=self.home/'offline-signatures-failed';self.clock=1800000000
        self.patches=[]
        for key,value in {'HOME':self.home,'UID':os.getuid(),'BOOT':'current','REPORT':{},
                          'DB':self.home/'new-db','PIN_SHA':'1'*64,'PREP_SHA':'2'*64,'CONFIG_SHA':'3'*64}.items():
            p=patch.object(m,key,value,create=True);p.start();self.patches.append(p)
        p=patch.object(m.time,'time',return_value=self.clock);p.start();self.patches.append(p)
        original_info=m.file_info
        # The production default owner was bound at definition time (Linux 1100).
        # This fixture uses the real Mac owner and retains all actual file checks.
        p=patch.object(m,'file_info',side_effect=lambda *a,**kw:original_info(*a,**{'owner':os.getuid(),**kw}))
        p.start();self.patches.append(p)
        self.addCleanup(lambda:[p.stop() for p in reversed(self.patches)])
        for root in (self.old,self.failed):
            (root/'db').mkdir(parents=True,mode=0o700);(root/'logs').mkdir(mode=0o700)
        self.rows=[]
        for name,version,count,epoch in [('main.cvd',63,20,100000),('daily.cvd',28171,30,self.clock-100),('bytecode.cvd',339,5,100000)]:
            source=(self.failed if name=='daily.cvd' else self.old)/'db'/name
            raw=f'ClamAV-VDB:date:{version}:{count}:90:hash:sig:builder:{epoch}'.encode().ljust(512,b' ')+b'synthetic'
            self.write(source,raw)
            self.rows.append({'name':name,'path':str(source),'bytes':len(raw),'sha256':m.sha(raw),
                'version':version,'signatures':count,'requiredFunctionalityLevel':90,'buildEpoch':epoch})
        base={'kind':'OFFICIAL_CVD_REFRESH_ONCE_V1','identity':m.IDENTITY,'officialMirror':'database.clamav.net',
              'maximumAttempts':1,'tlsVerificationDisabled':False,'servicesStarted':False,
              'oldSignatureFilesChanged':False,'signatureMaxAgeHours':48}
        self.previous={**base,'output':str(self.old),'status':'OFFICIAL_SIGNATURE_REFRESH_VERIFIED_SCANNER_NOT_STARTED',
            'commands':[{'name':n,'exitCode':0,'cleanup':{'exited':True},'forceKill':False}
                for n in ('freshclam-once','verify-main','verify-daily','verify-bytecode')],
            'signatures':copy.deepcopy(self.rows)}
        self.log=(b'query_remote_database_version: main.cvd version from DNS: 63\n'
                  b'Database test passed.\ndaily.cvd updated (version: 28171, sigs: 30, f-level: 90)\n'
                  b'Transferred a partial file\n')
        self.write(self.failed/'logs/freshclam-once.log',self.log)
        self.failure={**base,'output':str(self.failed),'status':'FAILED_PRESERVED','bootId':'current',
            'errorCode':'CHECK_UPDATE_COMMAND_FAILED','commands':[{'name':'freshclam-once','exitCode':5,
                'forceKill':False,'cleanup':{'exited':True,'remainingOwners':[]},
                'log':{'path':str(self.failed/'logs/freshclam-once.log'),'bytes':len(self.log),'sha256':m.sha(self.log)}}]}
        self.manifest={'kind':'OFFICIAL_CVD_LOCAL_SOURCES_V1','status':'SOURCES_DECLARED_NOT_VERIFIED',
            'identity':m.IDENTITY,'bootId':'current','files':copy.deepcopy(self.rows),'bytecodeRemoteVersion':None}
        self.persist()

    def write(self,path,raw):path.write_bytes(raw);path.chmod(0o600)
    def pin(self,path,value):
        raw=json.dumps(value,sort_keys=True).encode();self.write(path,raw)
        return {'path':str(path),'sha256':hashlib.sha256(raw).hexdigest()}
    def persist(self):
        self.manifest['historicalRefresh']=self.pin(self.old/'result.json',self.previous)
        self.manifest['failedDownload']=self.pin(self.failed/'result.json',self.failure)
        m.TARGET_BINDING={'kind':'OFFLINE_SCANNER_TARGET_V3','signatureMaterialManifest':self.pin(self.home/'sources.json',self.manifest)}
    def check(self):return m.signature_sources()

    def test_unchanged_main_bytecode_age_is_allowed_without_claiming_remote_bytecode(self):
        before={str(p):p.read_bytes() for p in self.home.rglob('*') if p.is_file()}
        with patch.object(m.subprocess,'Popen',side_effect=AssertionError('no process in source admission')):
            sources,rows,reference=self.check()
        self.assertEqual(rows['main.cvd']['version'],63);self.assertEqual(len(sources),3)
        self.assertEqual(reference,m.TARGET_BINDING['signatureMaterialManifest'])
        self.assertIsNone(m.REPORT['localSignatureSources']['bytecodeRemoteVersion'])
        self.assertFalse(m.REPORT['localSignatureSources']['newSetVerified'])
        self.assertEqual(before,{str(p):p.read_bytes() for p in self.home.rglob('*') if p.is_file()})

    def test_main_version_gap_rejects_even_when_file_and_historical_hash_agree(self):
        self.log=self.log.replace(b'DNS: 63',b'DNS: 64');self.write(self.failed/'logs/freshclam-once.log',self.log)
        self.failure['commands'][0]['log'].update(bytes=len(self.log),sha256=m.sha(self.log));self.persist()
        with self.assertRaisesRegex(RuntimeError,'LOCAL_CVD_MAIN_VERSION_GAP'):self.check()

    def test_stale_or_future_daily_is_not_made_fresh_by_copy_time(self):
        for now in (self.clock+172801,self.clock-101):
            with patch.object(m.time,'time',return_value=now),self.assertRaisesRegex(RuntimeError,'LOCAL_CVD_DAILY_APPLICABILITY'):self.check()

    def test_tampered_file_cannot_be_accepted_by_only_updating_manifest(self):
        row=self.manifest['files'][2];p=Path(row['path']);raw=p.read_bytes()+b'tampered'
        self.write(p,raw);row.update(bytes=len(raw),sha256=m.sha(raw));self.persist()
        with self.assertRaisesRegex(RuntimeError,'LOCAL_CVD_RETAINED_OFFICIAL_BYTES'):self.check()

    def test_partial_main_from_failed_directory_is_not_a_source(self):
        self.manifest['files'][0]['path']=str(self.failed/'db/main.cvd');self.persist()
        with self.assertRaisesRegex(RuntimeError,'LOCAL_CVD_FILE_ORIGIN'):self.check()

    def test_functionality_level_newer_than_pinned_engine_is_rejected(self):
        row=self.manifest['files'][1];p=Path(row['path']);raw=p.read_bytes().replace(b':90:',b':999:')
        # Keep a real 512-byte synthetic header and unchanged body boundary.
        raw=raw[:514].rstrip(b' ').ljust(512,b' ')+b'synthetic'
        self.write(p,raw);row.update(bytes=len(raw),sha256=m.sha(raw),requiredFunctionalityLevel=999);self.persist()
        with self.assertRaisesRegex(RuntimeError,'LOCAL_CVD_ENGINE_FUNCTIONALITY_LEVEL'):self.check()

    def test_failed_original_or_unclean_download_cannot_supply_provenance(self):
        self.previous['commands'][0]['exitCode']=5;self.persist()
        with self.assertRaisesRegex(RuntimeError,'LOCAL_CVD_PRIOR_COMPLETE_SUCCESS'):self.check()
        self.previous['commands'][0]['exitCode']=0;self.failure['commands'][0]['cleanup']['remainingOwners']=[123];self.persist()
        with self.assertRaisesRegex(RuntimeError,'LOCAL_CVD_FAILED_DOWNLOAD_PRESERVED'):self.check()

    def test_missing_duplicate_or_fake_verified_source_declarations_rejected(self):
        base=copy.deepcopy(self.manifest)
        for mutate in (lambda v:v['files'].pop(),lambda v:v['files'].append(v['files'][0]),
                       lambda v:v.update(status='VERIFIED'),lambda v:v.update(bytecodeRemoteVersion=339),
                       lambda v:v.update(bootId='old')):
            self.manifest=copy.deepcopy(base);mutate(self.manifest);self.persist()
            with self.subTest(value=self.manifest),self.assertRaises(RuntimeError):self.check()

    def import_set(self,fail_second=False):
        self.check();calls=[]
        def verify(name,source):
            calls.append(name)
            if fail_second and len(calls)==2:raise RuntimeError('synthetic verification failure')
            raw=b'fixture verification';self.write(m.DB/(name+'-verify.log'),raw)
            return {'sha256':m.sha(raw)}
        original={str(p):p.read_bytes() for p in (self.old/'db').iterdir()}
        original.update({str(p):p.read_bytes() for p in (self.failed/'db').iterdir()})
        with patch.object(m,'no_scanner_or_build'),patch.object(m,'fixed_owners'),\
             patch.object(m,'listeners',return_value=[]),patch.object(m,'resources'),patch.object(m,'run_sigtool',side_effect=verify):
            if fail_second:
                with self.assertRaisesRegex(RuntimeError,'synthetic verification failure'):m.import_signatures('fixture',{})
            else:m.import_signatures('fixture',{})
        self.assertTrue(all(Path(p).read_bytes()==raw for p,raw in original.items()))
        return json.loads((m.DB/'IMPORT-RECEIPT.json').read_text()),calls

    def test_import_verifies_each_source_and_preserves_failure_identity(self):
        result,calls=self.import_set()
        self.assertEqual(calls,['main','daily','bytecode'])
        self.assertEqual(result['sourceKind'],'OFFICIAL_CVD_LOCAL_SOURCES_V1')
        self.assertEqual(result['originalRefreshOutcome'],'FAILED_PRESERVED')
        self.assertNotIn('signatureRefreshReceipt',result)
        self.assertFalse(result['networkUsed']);self.assertFalse(result['freshclamExecuted'])
        for row in result['signatures']:
            self.assertEqual(row['requiredFunctionalityLevel'],90)
            self.assertEqual(m.sha((m.DB/row['name']).read_bytes()),row['sha256'])

    def test_failed_verification_keeps_partial_target_and_never_claims_full_import(self):
        result,calls=self.import_set(True)
        self.assertEqual(calls,['main','daily']);self.assertEqual(result['status'],'FAILED_PRESERVED')
        self.assertFalse((m.DB/'daily.cvd').exists());self.assertFalse((m.DB/'bytecode.cvd').exists())

    def test_load_log_count_is_observed_without_false_header_sum_requirement(self):
        log=self.home/'clamd.log';self.write(log,b'Bytecode: Security mode set to "TrustSigned".\nLoaded 41 signatures.\n')
        with patch.object(m,'DAEMON_LOG',log):
            observation=m.local_set_load_observation(self.rows)
            self.assertEqual(observation['loadedSignatures'],41)
            self.assertEqual(observation['headerSignatureTotal'],55)
            self.assertFalse(observation['headerCountEqualityAsserted'])
            self.write(log,b'Loading databases...\n')
            with self.assertRaisesRegex(RuntimeError,'LOCAL_SET_LOAD_NOT_OBSERVED'):m.local_set_load_observation(self.rows)


if __name__=='__main__':unittest.main()
