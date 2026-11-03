#!/usr/bin/env python3
"""Bounded lifecycle tests; temporary local files are not Linux installation evidence."""
import copy
import datetime as dt
import types
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('install_scanner.py')
spec = importlib.util.spec_from_file_location('scanner_entry', SOURCE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
D = 'a'*64
BOOT = '11111111-1111-1111-1111-111111111111'
INPUT = Path('/home/recovery/input-scanner-test')

def target():
    return {'kind': 'OFFLINE_SCANNER_TARGET_V1', 'identity': m.IDENTITY, 'currentBootId': BOOT,
        'paths': {'input': str(INPUT), 'software': '/home/recovery/software-test',
            'sourceSoftware': '/home/recovery/source-test', 'dependencies': '/home/recovery/debs-test',
            'scanner': '/home/recovery/scanner-test'}, 'run': 'first-start',
        'applicationAssemblySha256': D, 'runtimeAssemblySha256': D, 'runtimeManifestSha256': D,
        'nativeReceipt': {'path': '/home/recovery/native-test/result.json', 'sha256': D},
        'dependencyReceipt': {'path': '/home/recovery/debs-evidence-test/result.json', 'sha256': D},
        'dataServices': {role: {'receipt': {'path': '/home/recovery/data-test/'+role+'.json', 'sha256': D},
            'owner': {'pid': 100+i, 'startTicks': 1000+i, 'uid': 109 if role == 'pg' else 1100}}
            for i, role in enumerate(('pg', 'redis'))}, 'predecessor': {'mode': 'absent'},
        'dataBaselineSha256': D, 'dataSourceMetadataSha256': D, 'dataSourceOriginSha256': D,
        'budgetPolicySha256': D}

class TargetBindingTests(unittest.TestCase):
    def setUp(self):
        self.here = patch.object(m, 'HERE', INPUT); self.here.start(); self.addCleanup(self.here.stop)
    def test_fresh_target_needs_no_historical_failure_keys(self):
        self.assertEqual(m.validate_target(target())['scanner'], Path('/home/recovery/scanner-test'))
    def test_v2_keeps_historical_boot_separate_and_requires_signature_source(self):
        value=target();value.update(kind='OFFLINE_SCANNER_TARGET_V2',
            historicalEvidenceBootId='22222222-2222-2222-2222-222222222222',
            signatureRefreshReceipt={'path':'/home/recovery/offline-signatures-fixture/result.json','sha256':D})
        m.validate_target(value)
        with patch.object(m,'TARGET_BINDING',value),patch.object(m,'BOOT',BOOT):
            self.assertEqual(m.historical_boot(),value['historicalEvidenceBootId'])
            self.assertEqual(m.BOOT,BOOT)
        for key in ('historicalEvidenceBootId','signatureRefreshReceipt'):
            changed=copy.deepcopy(value);del changed[key]
            with self.subTest(key=key),self.assertRaises(RuntimeError):m.validate_target(changed)
        value['kind']='OFFLINE_SCANNER_TARGET_V1'
        with self.assertRaises(RuntimeError):m.validate_target(value)
    def test_path_collisions_escape_and_shell_text_rejected(self):
        for value in ['/home/recovery/software-test', '/home/recovery/../other', '/home/recovery/nested/target',
                      '/home/recovery/bad name', '/home/recovery/target;cmd']:
            with self.subTest(value=value):
                v=target();v['paths']['scanner']=value
                with self.assertRaises(RuntimeError):m.validate_target(v)
    def test_v3_has_explicit_material_manifest_not_a_successful_refresh(self):
        value=target();value.update(kind='OFFLINE_SCANNER_TARGET_V3',historicalEvidenceBootId=BOOT,
            signatureMaterialManifest={'path':'/home/recovery/input-scanner-test/local-sources.json','sha256':D})
        m.validate_target(value)
        value['signatureRefreshReceipt']=value['signatureMaterialManifest']
        with self.assertRaisesRegex(RuntimeError,'TARGET_BINDING_SCHEMA'):m.validate_target(value)
    def test_wrong_identity_unknown_keys_and_invalid_pins_rejected(self):
        for mutate in (lambda v:v.update(identity={}), lambda v:v.update(approvedForExecution=True),
                       lambda v:v.update(nativeReceipt={'path':'/etc/passwd','sha256':D}),
                       lambda v:v.update(dataBaselineSha256='old-pass')):
            v=target();mutate(v)
            with self.assertRaises(RuntimeError):m.validate_target(v)
    def test_absence_cannot_carry_synthetic_stop_or_owners(self):
        v=target();v['predecessor']['owners']={}
        with self.assertRaises(RuntimeError):m.validate_target(v)
    def test_pid_reuse_or_missing_owner_fields_not_normalized(self):
        for row in ({'pid':True,'startTicks':123,'uid':1100},{'pid':123,'startTicks':'123','uid':1100},
                    {'pid':123,'startTicks':123,'uid':0},{'pid':123,'uid':1100}):
            with self.assertRaises(RuntimeError):m.validate_owner(row)

class BaseLibraryUpdateTests(unittest.TestCase):
    def test_opt_in_is_paired_v3_and_exact_verifier_only(self):
        value=target();value.update(kind='OFFLINE_SCANNER_TARGET_V3',historicalEvidenceBootId=BOOT,
            signatureMaterialManifest={'path':str(INPUT/'local-sources.json'),'sha256':D},
            baseUpdateVerifier={'path':str(INPUT/'prepare_instance.py'),'sha256':m.BASE_UPDATE_VERIFIER_SHA},
            baseUpdate={k:{'path':'/home/recovery/proof/'+k,'sha256':D,'bytes':1} for k in ('result','metadata','analysis')})
        with patch.object(m,'HERE',INPUT):
            m.validate_target(value)
            for key in ('baseUpdate','baseUpdateVerifier'):
                changed=copy.deepcopy(value);del changed[key]
                with self.assertRaises(RuntimeError):m.validate_target(changed)
            changed=copy.deepcopy(value);changed['baseUpdateVerifier']['sha256']=D
            with self.assertRaisesRegex(RuntimeError,'EXACT_BASE_UPDATE_VERIFIER'):m.validate_target(changed)
            changed=copy.deepcopy(value);changed['kind']='OFFLINE_SCANNER_TARGET_V2'
            changed['signatureRefreshReceipt']=changed.pop('signatureMaterialManifest')
            with self.assertRaisesRegex(RuntimeError,'TARGET_BINDING_SCHEMA'):m.validate_target(changed)

    def test_absent_opt_in_never_loads_reference(self):
        with patch.object(m,'TARGET_BINDING',target()),patch.object(m,'base_update_verifier',side_effect=AssertionError('not opted in')):
            self.assertEqual(m.admit_base_library_update(),{})

    def test_verifier_uses_exact_real_source_bytes(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td).resolve();p=root/'prepare_instance.py'
            p.write_bytes(SOURCE.with_name('prepare_instance.py').read_bytes());p.chmod(0o600)
            real=m.file_info
            with patch.object(m,'HERE',root),patch.object(m,'TARGET_BINDING',{'kind':'OFFLINE_SCANNER_TARGET_V3',
                 'baseUpdateVerifier':{'path':str(p),'sha256':m.BASE_UPDATE_VERIFIER_SHA}}),                 patch.object(m,'file_info',side_effect=lambda *a,**kw:real(*a,**{'owner':os.getuid(),**kw})):
                self.assertTrue(callable(m.base_update_verifier()[0].base_update))
                p.write_bytes(p.read_bytes()+b'\n# changed')
                with self.assertRaisesRegex(RuntimeError,'BASE_UPDATE_VERIFIER_HASH'):m.base_update_verifier()

    def test_current_mapping_rejects_no_opt_in_other_library_and_metadata(self):
        p=Path('/usr/lib/aarch64-linux-gnu/libbrotlidec.so.1.1.0')
        row={'sha256':'1'*64,'bytes':10,'delivery':'exact-122-base','packages':['libbrotli1:arm64']}
        update={'historicalSha256':row['sha256'],'currentSha256':'2'*64,'bytes':11}
        info={'path':str(p),'sha256':'2'*64,'bytes':11}
        with patch.object(m,'LIB',Path('/home/recovery/lib')),patch.object(m,'canonical'),             patch.object(m,'NATIVE_LIBRARIES',{str(p):row}),patch.object(m,'BASE_LIBRARY_UPDATES',{}),             patch.object(m,'file_info',return_value=info),patch.object(Path,'stat',return_value=types.SimpleNamespace(st_gid=0,st_mode=0o644)):
            with self.assertRaisesRegex(RuntimeError,'MAPPED_NATIVE_PROOF_BYTES'):m.mapped_library(p,{})
            m.BASE_LIBRARY_UPDATES[str(p)]=update
            self.assertEqual(m.mapped_library(p,{})['sha256'],'2'*64)
            m.BASE_LIBRARY_UPDATES.clear();m.BASE_LIBRARY_UPDATES[str(p)+'-unrelated']=update
            with self.assertRaisesRegex(RuntimeError,'MAPPED_NATIVE_PROOF_BYTES'):m.mapped_library(p,{})
            m.BASE_LIBRARY_UPDATES[str(p)]=update
            with patch.object(Path,'stat',return_value=types.SimpleNamespace(st_gid=1100,st_mode=0o644)):
                with self.assertRaisesRegex(RuntimeError,'MAPPED_BASE_UPDATE_METADATA'):m.mapped_library(p,{})

    def test_loader_keeps_old_proof_but_compares_admitted_current_hash(self):
        binary=Path('/home/recovery/freshclam');path='/usr/lib/aarch64-linux-gnu/libbrotlidec.so.1.1.0'
        row={'path':path,'sha256':'1'*64}
        proof={'roots':[{'finalProbePath':str(binary),'loaderExecuted':True,'classification':'LOADER_LIST_RESOLUTION_ONLY',
                        'namedLibraries':[row],'commandLog':{'sha256':D}}]}
        updates={path:{'historicalSha256':'1'*64,'currentSha256':'2'*64,'bytes':11}}
        with patch.object(m,'native_proof',return_value=proof),patch.object(m,'BASE_LIBRARY_UPDATES',updates),             patch.object(m,'mapped_library',return_value={'sha256':'2'*64}),patch.object(m,'pins',return_value={'nativeReceipt':{'sha256':D}}):
            self.assertTrue(m.loader_run('freshclam',binary)['priorActualLoaderReused'])
            self.assertEqual(row['sha256'],'1'*64)
            updates[path]['historicalSha256']='3'*64
            with self.assertRaisesRegex(RuntimeError,'CLAM_LOADER_BASE_UPDATE_HISTORY'):m.loader_run('freshclam',binary)


class PhaseTests(unittest.TestCase):
    def setUp(self):
        self.patches=[]
        for key,val in {'REPORT':{},'PIN_SHA':D,'PREP_SHA':'b'*64,'BOOT':BOOT,'CONFIG_SHA':'c'*64,
                        'NATIVE_SHA':'d'*64,'TARGET_BINDING':target()}.items():
            p=patch.object(m,key,val);p.start();self.patches.append(p)
        self.addCleanup(lambda:[p.stop() for p in reversed(self.patches)])
    def phase(self, name):
        return {'phase':name,'identity':m.IDENTITY,'currentBootId':BOOT,'packagePinFileSha256':D,
            'packageBinding':target(),'preparationSha256':'b'*64,'configSha256':'c'*64,
            'jointDeliveryBinding':{'sha256':'e'*64},'nativeReceipt':{'sha256':'d'*64}}
    def test_phase_receipt_rejects_cross_target_boot_prep_config_or_phase(self):
        with patch.object(m,'pins',return_value=target()), patch.object(m,'joint_check',return_value={'sha256':'e'*64}):
            m.phase_identity(self.phase('loader'),'loader')
            for key in ('phase','identity','currentBootId','packagePinFileSha256','packageBinding',
                        'preparationSha256','configSha256','jointDeliveryBinding','nativeReceipt'):
                with self.subTest(field=key):
                    value=self.phase('loader');value[key]='different'
                    with self.assertRaises((RuntimeError,AttributeError)):m.phase_identity(value,'loader')
    def full_dependency(self):
        return {'status':'NEW_PREFIX_RUNTIME_PAYLOAD_AND_ELF_VERIFIED','target':'/home/recovery/debs-test',
            'bootId':BOOT,'selectionSha256':'35784a08501e366fd440449a085935f751ecb0428e88ca9c34412dc35b720851',
            'basePackageCount':122,'tree':{'regularFiles':2263,'symlinks':135,'treeVerified':True},
            'loader':{'elfCount':134,'versionCommands':9},
            'baseUpdate':{'overlaySha256':'7ce7c823871d70d0e84a5a5fe1ff162c6cbaaccb5d11525f6db826c2b489e6c1'}}
    def test_payload_only_cannot_be_used_for_native_admission(self):
        value=self.full_dependency();value.update(status='FIXED_RUNTIME_PAYLOAD_EXTRACTED_AND_READBACK_VERIFIED',loader=None)
        with patch.object(m,'DEBS',Path('/home/recovery/debs-test')),patch.object(m,'read_json',return_value=(value,{})):
            with self.assertRaisesRegex(RuntimeError,'ACTUAL_FULL_DEPENDENCY_SUCCESS_REQUIRED'):m.dependency_success()
    def test_direct_success_does_not_recurse_historical_failures(self):
        value=self.full_dependency();value['originalFailurePreserved']='/nonexistent/historical-failure.json'
        with patch.object(m,'DEBS',Path('/home/recovery/debs-test')),patch.object(m,'read_json',return_value=(value,{'sha256':D})) as reader:
            self.assertEqual(m.dependency_success(),{'sha256':D});self.assertEqual(reader.call_count,1)

    def test_previous_boot_native_proof_keeps_its_origin(self):
        value=self.full_dependency();binding=target();binding.update(kind='OFFLINE_SCANNER_TARGET_V2',historicalEvidenceBootId=BOOT)
        new_boot='33333333-3333-3333-3333-333333333333'
        with patch.object(m,'TARGET_BINDING',binding),patch.object(m,'BOOT',new_boot),patch.object(m,'DEBS',Path('/home/recovery/debs-test')),patch.object(m,'read_json',return_value=(value,{'sha256':D})):
            self.assertEqual(m.dependency_success(),{'sha256':D})
            value['bootId']=new_boot
            with self.assertRaisesRegex(RuntimeError,'ACTUAL_FULL_DEPENDENCY_SUCCESS_REQUIRED'):m.dependency_success()

    def test_refresh_origin_requires_verified_fresh_complete_set_and_exit(self):
        root='/home/recovery/offline-signatures-fixture'
        binding=target();binding.update(kind='OFFLINE_SCANNER_TARGET_V2',signatureRefreshReceipt={'path':root+'/result.json','sha256':D})
        receipt={'kind':'OFFICIAL_CVD_REFRESH_ONCE_V1','output':root,
            'status':'OFFICIAL_SIGNATURE_REFRESH_VERIFIED_SCANNER_NOT_STARTED','identity':m.IDENTITY,
            'signatureMaxAgeHours':48,'officialMirror':'database.clamav.net','maximumAttempts':1,
            'tlsVerificationDisabled':False,'servicesStarted':False,'oldSignatureFilesChanged':False,
            'commands':[{'name':name,'exitCode':0,'cleanup':{'exited':True},'forceKill':False} for name in ('freshclam-once','verify-main','verify-daily','verify-bytecode')],
            'signatures':[{'name':name,'path':root+'/db/'+name,'bytes':10,'sha256':D,'version':1,'buildEpoch':100000} for name in m.CVD_PINS]}
        with patch.object(m,'TARGET_BINDING',binding),patch.object(m,'read_json',side_effect=lambda *_:(receipt,{'sha256':D})),patch.object(m.time,'time',return_value=100001):
            source,pins,reference=m.signature_sources()
            self.assertEqual(str(source),root+'/db');self.assertEqual(len(pins),3)
            self.assertEqual(reference,binding['signatureRefreshReceipt'])
            receipt['commands'][0]['cleanup']['exited']=False
            with self.assertRaisesRegex(RuntimeError,'SIGNATURE_REFRESH_COMMANDS'):m.signature_sources()
            receipt['commands'][0]['cleanup']['exited']=True
            daily=next(r for r in receipt['signatures'] if r['name']=='daily.cvd');daily['buildEpoch']=200000
            with self.assertRaisesRegex(RuntimeError,'DAILY_EXPIRED_OR_FUTURE'):m.signature_sources()
    def test_loader_and_import_inner_outer_identity_are_distinct(self):
        v=self.phase('import');v.update(status='OFFLINE_SIGNATURE_IMPORT_VERIFIED_SCANNER_NOT_STARTED',
            importReceiptSha256='f'*64,loaderReceipt={'sha256':D},signaturesImported=True,servicesStarted=False)
        with (patch.object(m,'SCANNER_RUN','first-start'),patch.object(m,'EVENTS',Path('/home/recovery/events')),
             patch.object(m,'loader_receipt',return_value={'sha256':D}),patch.object(m,'phase_identity'),
             patch.object(m,'read_json',return_value=(v,{'sha256':'e'*64})),patch.object(m,'no_scanner_or_build') as safety):
            with self.assertRaisesRegex(RuntimeError,'IMPORT_PHASE_RECEIPT_BINDING'):
                m.start('first-start','e'*64,'loader',D,'import','e'*64,{}, {})
            safety.assert_not_called()
    def test_config_is_created_once_in_new_root_not_start_event(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp).resolve();off=root/'offline';scanner=off/'scanner';private=off/'private';logs=private/'scanner'
            values={'HOME':root,'OFFLINE':off,'PRIVATE':private,'SCANNER':scanner,'LOGS':logs,
                    'EVENTS':scanner/'events','CONFIG':scanner/'clamd.conf','UID':os.getuid(),
                    'CONFIG_TEXT':'Foreground yes\n','CONFIG_SHA':m.sha(b'Foreground yes\n')}
            from contextlib import ExitStack
            with ExitStack() as stack:
                for k,v in values.items():stack.enter_context(patch.object(m,k,v))
                for name in ('package','resources','joint_check'):stack.enter_context(patch.object(m,name))
                actual_file_info=m.file_info
                stack.enter_context(patch.object(m,'file_info',side_effect=lambda *args,**kw:actual_file_info(*args,owner=os.getuid(),**kw)))
                old=os.umask(0o077)
                try:
                    m.prepare();self.assertEqual((scanner/'clamd.conf').read_bytes(),b'Foreground yes\n')
                    self.assertEqual(list((scanner/'events').iterdir()),[])
                    with self.assertRaisesRegex(RuntimeError,'ENTIRE_NEW_SCANNER_TARGET_REQUIRED'):m.prepare()
                finally:os.umask(old)
    def test_execute_prepare_dispatch_uses_digest_function_and_no_history(self):
        from contextlib import ExitStack
        with ExitStack() as stack:
            for obj,key,val in [(m.sys,'platform','linux'),(m.platform,'machine',lambda:'aarch64'),
                                (m.os,'getuid',lambda:1100),(m.os,'getgid',lambda:1100),
                                (m,'OUT',None),(m,'REPORT',{})]:
                stack.enter_context(patch.object(obj,key,val))
            stack.enter_context(patch.object(m.os,'pidfd_open',create=True))
            stack.enter_context(patch.object(m.os,'environ',{}))
            stack.enter_context(patch.object(m.signal,'signal'))
            stack.enter_context(patch.object(m.signal,'setitimer'))
            stack.enter_context(patch.object(m,'configure_target'))
            stack.enter_context(patch.object(m,'joint_check',return_value={}))
            stack.enter_context(patch.object(m,'pins',return_value=target()))
            for name in ('data_baseline','fixed_owners','budget'):
                stack.enter_context(patch.object(m,name))
            prepared=stack.enter_context(patch.object(m,'prepare'))
            old=os.umask(0o077)
            try:m.execute(D,D,D,'-','prepare',[])
            finally:os.umask(old)
            prepared.assert_called_once_with()
            self.assertIsNone(m.PREP_SHA)
    def stop_bridge(self, mutate=None):
        import datetime
        from contextlib import ExitStack
        v=target(); owners={role:{'pid':200+i,'startTicks':2000+i,'uid':1100}
            for i,role in enumerate(('api','web','proxy','scanner'))}
        pin=lambda name:{'path':'/home/recovery/stop-test/'+name+'.json','sha256':D}
        v['predecessor']={'mode':'own-normal-stop','owners':owners,'applicationStop':pin('app'),
            'scannerStop':pin('scanner'),'beforeStopObservation':pin('before')}
        clock=m.dt.datetime.now(m.dt.timezone.utc)
        before={'kind':'LIVE_PREDECESSOR_OWNERS_OBSERVED','bootIdBefore':BOOT,'bootIdAfter':BOOT,
            'owners':owners,'allFourLive':True,'executableAndCwdVerified':True,'servicesStopped':False,
            'at':(clock-datetime.timedelta(seconds=5)).isoformat(), 'scannerStart':pin('scanner-start')}
        app={'status':'OWNED_APPLICATIONS_STOPPED','at':(clock-datetime.timedelta(seconds=4)).isoformat(),
            'processes':[{'role':role,'pid':owners[role]['pid'],'startTicks':str(owners[role]['startTicks']),
                'sigtermSent':True} for role in ('api','web','proxy')]}
        scanner={'status':'NEW_PREFIX_SCANNER_NORMAL_STOPPED','forceKill':False,'startReceipt':pin('scanner-start'),
            'remainingOwnedGroup':[],'termination':{'status':'NORMAL_SIGTERM_EXIT'},'oldProcess':owners['scanner'],
            'finishedAt':(clock-datetime.timedelta(seconds=3)).isoformat()}
        if mutate:mutate(before,app,scanner)
        dataowners={role:row['owner'] for role,row in v['dataServices'].items()}
        records={'before':before,'app':app,'scanner':scanner,
            'pg':{'status':'ORIGINAL_POSTGRES_NORMAL_START_SAME_CLUSTER','bootId':BOOT,
                'readback':{'process':dataowners['pg']}},
            'redis':{'status':'ORIGINAL_REDIS_NORMAL_START_PERSISTENCE_READY','bootId':BOOT,'process':dataowners['redis']}}
        live={row['pid']:{**row,'state':'S'} for row in dataowners.values()}
        with ExitStack() as stack:
            for key,val in {'TARGET_BINDING':v,'DATA_OWNERS':dataowners,'PREVIOUS_OWNERS':owners}.items():
                stack.enter_context(patch.object(m,key,val))
            stack.enter_context(patch.object(m,'pins',return_value=v))
            stack.enter_context(patch.object(m,'read_json',side_effect=lambda path,*a:(records[path.stem],{'sha256':D})))
            stack.enter_context(patch.object(m.Path,'read_text',return_value=BOOT))
            stack.enter_context(patch.object(m,'process',side_effect=lambda pid:live.get(pid)))
            m.fixed_owners(require_stopped=True)
    def test_same_boot_live_observation_connects_legacy_stop_without_fabricating_boot(self):
        self.stop_bridge()
    def test_scanner_stop_must_join_observed_successful_start(self):
        mutations=[lambda b,a,s:s['startReceipt'].update(sha256='b'*64),
                   lambda b,a,s:s['startReceipt'].update(path='/home/recovery/other-start.json'),
                   lambda b,a,s:s.pop('startReceipt'),
                   lambda b,a,s:b.pop('scannerStart'),
                   lambda b,a,s:s.update(currentBootId='different')]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                with self.assertRaises(RuntimeError):self.stop_bridge(mutate)
    def test_cross_boot_owner_or_stop_order_bridge_rejected(self):
        mutations=[lambda b,a,s:b.update(bootIdAfter='different'),
                   lambda b,a,s:b.update(owners={}),
                   lambda b,a,s:a['processes'][0].update(startTicks='9999'),
                   lambda b,a,s:s.update(finishedAt='2000-01-01T00:00:00+00:00')]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                with self.assertRaises(RuntimeError):self.stop_bridge(mutate)
    def test_stop_dispatch_ignores_native_signature_data_service_and_budget_admission(self):
        from contextlib import ExitStack
        with tempfile.TemporaryDirectory() as temp, ExitStack() as stack:
            events=Path(temp).resolve()/'events';events.mkdir()
            for obj,key,val in [(m.sys,'platform','linux'),(m.platform,'machine',lambda:'aarch64'),
                (m.os,'getuid',lambda:1100),(m.os,'getgid',lambda:1100),(m,'EVENTS',events),
                (m,'SCANNER',events.parent),(m,'LOGS',events.parent),(m,'OUT',None),(m,'REPORT',{})]:
                stack.enter_context(patch.object(obj,key,val))
            stack.enter_context(patch.object(m.os,'pidfd_open',create=True))
            stack.enter_context(patch.object(m.os,'environ',{}))
            for name in ('signal','setitimer'):stack.enter_context(patch.object(m.signal,name))
            for name in ('configure_target','directory'):stack.enter_context(patch.object(m,name))
            stack.enter_context(patch.object(m,'joint_check',return_value={}))
            stack.enter_context(patch.object(m,'pins',return_value=target()))
            stack.enter_context(patch.object(m,'file_info',return_value={'sha256':D}))
            guards=[stack.enter_context(patch.object(m,name,side_effect=AssertionError(name)))
                    for name in ('data_baseline','fixed_owners','budget','package','prepared')]
            stopped=stack.enter_context(patch.object(m,'stop',side_effect=lambda *a:m.REPORT.update(status='STOP_FIXTURE')))
            old=os.umask(0o077)
            try:m.execute(D,D,D,'-','stop',['first-start',D,'stop-event'],approved_limit=25*1024**3)
            finally:os.umask(old)
            stopped.assert_called_once_with('first-start',D)
            for guard in guards:guard.assert_not_called()
            self.assertEqual(json.loads((events/'stop-stop-event/receipt.json').read_text())['status'],'STOP_FIXTURE')
    def test_only_frozen_web_process_title_is_accepted_after_exact_owner_checks(self):
        app={'artifact':'/home/recovery/software-test/application','identity':m.IDENTITY,
             'packageBinding':{'manifestSha256':m.APP_MANIFEST_SHA}}
        owner={'argv':['node','server.js'],'cwd':'/home/recovery/software-test/application/runtime/apps/web',
               'executable':'/home/recovery/software-test/runtime/node24/bin/node'}
        self.assertEqual(m.observed_argv_mode('web',['next-server (v15.5.28)'],owner,app),'fixed-3941-next-server-title')
        self.assertEqual(m.observed_argv_mode('web',['next-server (v15.5.28)']+['']*85,owner,app),'fixed-3941-next-server-title')
        for tail in (['extra'], ['', 'extra'], [' ', '']):
            with self.assertRaises(RuntimeError):m.observed_argv_mode('web',['next-server (v15.5.28)']+tail,owner,app)
        self.assertEqual(m.observed_argv_mode('web',owner['argv'],owner,app),'exact-start-argv')
        for role,argv,cwd in [('api',['next-server (v15.5.28)'],owner['cwd']),
                              ('web',['next-server (v15.5.29)'],owner['cwd']),
                              ('web',['next-server (v15.5.28)'],'/home/recovery/wrong')]:
            with self.assertRaises(RuntimeError):m.observed_argv_mode(role,argv,{**owner,'cwd':cwd},app)
    def test_owner_default_cwd_is_resolved_at_call_time(self):
        import inspect
        self.assertIsNone(inspect.signature(m.owner_matches).parameters['cwd'].default)
        self.assertIsNone(inspect.signature(m.term_owned).parameters['cwd'].default)


class ScannerRetentionBudgetTests(unittest.TestCase):
    def test_explicit_limit_and_both_remaining_window_floors(self):
        self.check_explicit_limit_and_floors(25*1024**3)

    def test_explicit_25_quarter_limit_and_both_remaining_window_floors(self):
        self.check_explicit_limit_and_floors(101*1024**3//4)

    def check_explicit_limit_and_floors(self, limit):
        roots=['/r'+str(i) for i in range(376)]
        reader={'entrySha256':'a'*64,'dependencies':[{'name':'reader','sha256':'b'*64}]}
        policy={'kind':'OFFLINE_HOST_BUDGET_SCOPE_V1','limit':limit,'expectedRootPaths':roots,'reader':reader}
        used=64*1024**2;remaining=m.WINDOW_BYTES-used;total=limit-remaining-64*1024**2
        receipt={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'scopeNarrowed':False,'reader':reader,'limit':limit,
                 'rows':[{'path':p,'allocatedBytes':total if i==0 else 0} for i,p in enumerate(roots)],'totalAllocatedBytes':total}
        def call(approved=limit,guest=None):
            with patch.object(m,'TARGET_BINDING',{'budgetPolicySha256':D}),patch.object(m,'BUDGET_SHA',D),patch.object(m,'REPORT',{}), \
                 patch.object(m,'read_json',side_effect=[(policy,{'sha256':D}),(receipt,{'sha256':D})]), \
                 patch.object(m,'allocation',return_value={'totalAllocatedBytes':used}), \
                 patch.object(m.shutil,'disk_usage',return_value=types.SimpleNamespace(free=m.FLOOR+remaining if guest is None else guest)):
                m.budget(approved_limit=approved);return m.REPORT['budgetAdmission']
        self.assertEqual(call()['approvedLimitBytes'],limit)
        self.assertEqual(call()['hostReserveBytes'],64*1024**2)
        with self.assertRaisesRegex(RuntimeError,'BUDGET_POLICY_KIND'):call(m.HOST_CAP)
        with self.assertRaisesRegex(RuntimeError,'FRESH_WINDOW_RESERVATION'):call(guest=m.FLOOR+remaining-1)
        receipt['rows'][0]['allocatedBytes']+=1;receipt['totalAllocatedBytes']+=1
        with self.assertRaisesRegex(RuntimeError,'FRESH_WINDOW_RESERVATION'):call()
        for invalid in (True,-1,26*1024**3,float(limit)):
            with self.assertRaisesRegex(RuntimeError,'APPROVED_BUDGET_LIMIT'):call(invalid)

if __name__=='__main__':unittest.main()
