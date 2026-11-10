"""Local failure-boundary tests; no network, scanner, certificate or real CVD."""
import copy
import datetime as dt
import importlib.util
import json
import os
import stat
from contextlib import contextmanager
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

path=Path(__file__).with_name('refresh_signatures.py')
spec=importlib.util.spec_from_file_location('refresh_signatures',path)
refresh=importlib.util.module_from_spec(spec);spec.loader.exec_module(refresh)


class RefreshTests(unittest.TestCase):
    def setUp(self):refresh.REPORT.clear()

    def test_default_does_not_read_binding_or_run_program(self):
        result=subprocess.run([sys.executable,'-I','-B',str(path)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0);self.assertEqual(json.loads(result.stdout),{'status':'PLAN_ONLY'})

    def fixture(self,root,epoch=100000):
        (root/'db').mkdir()
        for name in ('main.cvd','daily.cvd','bytecode.cvd'):
            header=f'ClamAV-VDB:date:1:2:3:hash:sig:builder:{epoch}'.encode().ljust(512,b' ')
            (root/'db'/name).write_bytes(header+b'fixture')
        return types.SimpleNamespace(read=lambda p,*args,**kwargs:p.read_bytes())

    def test_inventory_accepts_only_exact_named_set_and_preserves_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m=self.fixture(root)
            with patch.object(refresh.time,'time',return_value=100001):
                rows=refresh.inventory(root,m)
                self.assertEqual(len(rows),3)
                self.assertEqual(rows[1]['sha256'],refresh.sha((root/'db/daily.cvd').read_bytes()))
                (root/'db/unapproved.cvd').write_bytes(b'unknown')
                with self.assertRaisesRegex(RuntimeError,'EXACT_OFFICIAL_CVD_SET'):refresh.inventory(root,m)

    def test_expired_future_and_malformed_headers_are_rejected(self):
        for epoch in (1,500000):
            with tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);m=self.fixture(root,epoch)
                with patch.object(refresh.time,'time',return_value=200000):
                    with self.assertRaisesRegex(RuntimeError,'DAILY_EXPIRED_OR_FUTURE'):refresh.inventory(root,m)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m=self.fixture(root)
            (root/'db/main.cvd').write_bytes(b'Not a signed CVD')
            with self.assertRaisesRegex(RuntimeError,'CVD_HEADER'):refresh.inventory(root,m)

    def test_storage_walk_rejects_links_before_following_them(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'link').symlink_to('/unapproved')
            # Only owner is adapted for this Mac fixture; link rejection remains real.
            original=Path.lstat
            def metadata(p):
                s=original(p)
                return types.SimpleNamespace(st_uid=1100,st_mode=s.st_mode,st_nlink=s.st_nlink,st_blocks=s.st_blocks)
            with patch.object(Path,'lstat',metadata):
                with self.assertRaisesRegex(RuntimeError,'UPDATE_STORAGE_METADATA'):refresh.allocation(root)

    def test_cleanup_terms_created_descendants_with_pidfds(self):
        parent={'pid':456,'uid':1100,'pgid':456,'session':456,'startTicks':100,'state':'S'}
        descendant={**parent,'pid':457,'startTicks':101}
        owned={(456,100):(12,parent),(457,101):(13,descendant)}
        with patch.object(refresh,'capture_group',side_effect=[list(owned),[]]),patch.object(refresh,'proc',side_effect=[parent,descendant]),patch.object(refresh.signal,'pidfd_send_signal',create=True) as send,patch.object(refresh.time,'sleep'):
            result=refresh.cleanup_group(parent,owned)
        self.assertEqual(send.call_args_list,[((12,refresh.signal.SIGTERM),),((13,refresh.signal.SIGTERM),)])
        self.assertTrue(result['exited']);self.assertFalse(result['forceKill'])

    def test_resource_failure_closes_created_child_window(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'logs').mkdir()
            child=types.SimpleNamespace(pid=456,poll=lambda:None,wait=lambda timeout:0)
            parent={'pid':456,'uid':1100,'pgid':456,'session':456,'startTicks':100,'state':'S'}
            with patch.object(refresh.subprocess,'Popen',return_value=child),patch.object(refresh.os,'pidfd_open',return_value=12,create=True),patch.object(refresh.os,'close') as close,patch.object(refresh,'proc',return_value=parent),patch.object(refresh,'capture_group',return_value=[(456,100)]),patch.object(refresh,'cleanup_group',return_value={'exited':True,'forceKill':False}) as cleanup,patch.object(refresh,'guard',side_effect=RuntimeError('CHECK_UPDATE_RESOURCE_FLOOR')):
                with self.assertRaisesRegex(RuntimeError,'UPDATE_RESOURCE_FLOOR'):
                    refresh.run(['fixture'],{},root,None,'bounded-failure',1)
            cleanup.assert_called_once()
            close.assert_called_once_with(12)
            self.assertFalse(refresh.REPORT['commands'][0]['cleanup']['forceKill'])

    def test_pidfd_failure_still_terminates_unreaped_created_child(self):
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'logs').mkdir()
            child=types.SimpleNamespace(pid=456,poll=lambda:None,wait=Mock(return_value=0),terminate=Mock())
            with patch.object(refresh.subprocess,'Popen',return_value=child),patch.object(refresh.os,'pidfd_open',side_effect=OSError('fixture'),create=True):
                with self.assertRaises(OSError):refresh.run(['fixture'],{},root,None,'pidfd-failure',1)
            child.terminate.assert_called_once();child.wait.assert_called_once_with(timeout=45)
            self.assertTrue(refresh.REPORT['commands'][0]['cleanup']['exited'])

    def test_exited_process_is_not_recorded_as_signaled(self):
        parent={'pid':456,'uid':1100,'pgid':456,'session':456,'startTicks':100,'state':'S'}
        owned={(456,100):(12,parent)}
        with patch.object(refresh,'capture_group',side_effect=[list(owned),[]]),patch.object(refresh,'proc',return_value=None),patch.object(refresh.signal,'pidfd_send_signal',create=True) as send,patch.object(refresh.time,'sleep'):
            result=refresh.cleanup_group(parent,owned)
        send.assert_not_called();self.assertFalse(result['sigtermSent']);self.assertEqual(result['signaledOwners'],[])


class AdmissionTests(unittest.TestCase):
    def test_check_mode_never_starts_download_or_creates_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)/'new-output'
            result = (None, {'bootId': 'live'}, root, None, None, None, {'checked': True}, None, {'verified': True})
            with patch.object(refresh, 'admission', return_value=result), \
                 patch.object(refresh, 'run', side_effect=AssertionError('no process')), \
                 patch.object(Path, 'mkdir', side_effect=AssertionError('no directory')), \
                 patch('builtins.print') as output:
                refresh.execute(types.SimpleNamespace(check_admission=True))
            self.assertEqual(json.loads(output.call_args.args[0])['status'], 'REFRESH_NOT_EXECUTED_ADMISSION_VERIFIED')
            self.assertFalse(root.exists())

    def test_admission_rejects_native_before_budget_directory_or_download(self):
        # Exercise the real admission wiring, including separate live refresh boot
        # and unchanged historical configuration boot. No private files are read.
        generation = {'bootId': 'old', 'software': '/home/recovery/offline-software-test',
                      'instance': '/home/recovery/offline-instance-test'}
        config = {'status': 'NEW_CONFIG_GENERATED_AND_COMPILED_CONFIG_VALIDATED_NOT_STARTED',
                  'identity': {'fixed': True}, **generation, 'targetBinding': {}}
        b = {'kind': 'OFFICIAL_CVD_REFRESH_ONCE_V1', 'bootId': 'live',
             'output': '/home/recovery/offline-signatures-test', 'configurationReceipt': {},
             'softwareCodeSha256': 'a'*64, 'baseUpdate': {'explicit': 'proof'}}
        native = unittest.mock.Mock(side_effect=RuntimeError('CHECK_TEST_NATIVE_REJECT'))
        m = types.SimpleNamespace(IDENTITY={'fixed': True}, pinned=unittest.mock.Mock(side_effect=[b,config,generation]), native_admission=native)
        c = types.SimpleNamespace()
        with patch.object(refresh, 'support', side_effect=[m,c]), \
             patch.object(refresh.sys, 'flags', types.SimpleNamespace(isolated=1)), \
             patch.object(refresh.sys, 'platform', 'linux'), patch.object(refresh.os, 'getuid', return_value=1100), \
             patch.object(refresh.os, 'geteuid', return_value=1100), patch.object(refresh.os, 'getgid', return_value=1100), \
             patch.object(refresh.os, 'uname', return_value=types.SimpleNamespace(machine='aarch64')), \
             patch.object(Path, 'stat', return_value=types.SimpleNamespace(st_size=1)), \
             patch.object(Path, 'exists', return_value=False), patch.object(Path, 'is_symlink', return_value=False), \
             patch.object(Path, 'read_text', return_value='live'), \
             patch.object(Path, 'mkdir', side_effect=AssertionError('no writes')):
            with self.assertRaisesRegex(RuntimeError, 'TEST_NATIVE_REJECT'):
                refresh.admission(types.SimpleNamespace(configuration_code_sha256='a'*64,binding='/binding',binding_sha256='b'*64))
        native.assert_called_once_with(generation,c,b['baseUpdate'])



class RefreshRetentionTests(unittest.TestCase):
    def test_real_budget_wiring_keeps_configuration_origin_and_reserve(self):
        config_path=Path(__file__).with_name('prepare_instance.py')
        spec=importlib.util.spec_from_file_location('refresh_budget_support',config_path)
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        limit=25*1024**3;roots=['/r'+str(i) for i in range(376)]
        reader={'entrySha256':'a'*64,'dependencies':[{'name':'reader','sha256':'b'*64}]}
        policy={'kind':'OFFLINE_HOST_BUDGET_SCOPE_V1','limit':limit,'expectedRootPaths':roots,'reader':reader}
        used=limit-refresh.WINDOW-m.RESERVE
        receipt={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'scopeNarrowed':False,'reader':reader,'limit':limit,
                 'rows':[{'path':p,'allocatedBytes':used if i==0 else 0} for i,p in enumerate(roots)],'totalAllocatedBytes':used}
        generation={'budgetPolicy':{'path':'/old-policy','bytes':1,'sha256':'c'*64},'instance':'historical'}
        binding={'executionBudgetPolicy':{'path':'/new-policy','bytes':1,'sha256':'d'*64}}
        original=copy.deepcopy(generation)
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'budget.json';path.write_text('{}')
            args=types.SimpleNamespace(budget=str(path),budget_sha256='e'*64,approved_host_limit_bytes=limit)
            with patch.object(m,'pinned',side_effect=[policy,receipt]) as pins,patch.object(m.shutil,'disk_usage',return_value=types.SimpleNamespace(free=refresh.FLOOR+refresh.WINDOW)):
                result=refresh.operation_budget(m,binding,generation,args)
                self.assertEqual(pins.call_args_list[0].args[0],binding['executionBudgetPolicy'])
                self.assertEqual(result['configurationBudgetPolicy'],original['budgetPolicy'])
                self.assertEqual(result['limit'],limit)
            self.assertEqual(generation,original)
            args.approved_host_limit_bytes=24*1024**3
            with patch.object(m,'pinned',side_effect=[policy,receipt]),patch.object(m.shutil,'disk_usage',return_value=types.SimpleNamespace(free=2*1024**3)):
                with self.assertRaisesRegex(RuntimeError,'FRESH_COMPLETE_BUDGET'):refresh.operation_budget(m,binding,generation,args)
            args.approved_host_limit_bytes=limit;receipt['rows'][0]['allocatedBytes']+=1;receipt['totalAllocatedBytes']+=1
            with patch.object(m,'pinned',side_effect=[policy,receipt]),patch.object(m.shutil,'disk_usage',return_value=types.SimpleNamespace(free=2*1024**3)):
                with self.assertRaisesRegex(RuntimeError,'REFRESH_CAPACITY'):refresh.operation_budget(m,binding,generation,args)

class DiagnosticStateTests(unittest.TestCase):
    def fixture(self):
        root='/home/recovery/offline-signatures-failed-r01';data=b'opaque-existing-cooldown-state'
        log=b'ERROR: Download failed (18) Transferred a partial file\n'
        prior={'output':root,'status':'FAILED_PRESERVED','bootId':'live','identity':{'fixed':True},
               'errorCode':'CHECK_UPDATE_COMMAND_FAILED','maximumAttempts':1,'officialMirror':'database.clamav.net',
               'tlsVerificationDisabled':False,'finishedAt':dt.datetime.fromtimestamp(1000,dt.timezone.utc).isoformat(),
               'commands':[{'name':'freshclam-once','exitCode':5,'cleanup':{'exited':True,'remainingOwners':[]},
                   'log':{'path':root+'/logs/freshclam-once.log','bytes':len(log),'sha256':refresh.sha(log)}}]}
        binding={'bootId':'live','diagnosticRetry':{'kind':'PARTIAL_TRANSFER_VERBOSE_ONCE_V1',
            'previousReceipt':{'path':root+'/result.json','bytes':1,'sha256':'a'*64},
            'updateState':{'path':root+'/db/freshclam.dat','bytes':len(data),'sha256':refresh.sha(data)}}}
        reader=unittest.mock.Mock(side_effect=lambda p,*a,**k: log if str(p).endswith('.log') else data)
        m=types.SimpleNamespace(IDENTITY=prior['identity'],pinned=lambda *a:prior,read=reader)
        return binding,prior,m,data,log
    def test_default_has_no_retry_or_state_read(self):
        self.assertEqual(refresh.diagnostic_state(None,{}),(None,None))
    def test_explicit_diagnostic_keeps_opaque_state_and_requires_wait(self):
        b,p,m,data,_=self.fixture()
        with patch.object(refresh.time,'time',return_value=1300):
            actual,proof=refresh.diagnostic_state(m,b)
        self.assertEqual(actual,data);self.assertTrue(proof['cooldownStatePreserved']);self.assertFalse(proof['automaticRetry'])
        with patch.object(refresh.time,'time',return_value=1299):
            with self.assertRaisesRegex(RuntimeError,'PREVIOUS_CLEANUP_AND_WAIT'):refresh.diagnostic_state(m,b)
    def test_recursive_retry_and_remaining_process_refused(self):
        b,p,m,_,_=self.fixture();p['diagnosticRetry']={'prior':True}
        with self.assertRaisesRegex(RuntimeError,'PREVIOUS_ATTEMPT'):refresh.diagnostic_state(m,b)
        p.pop('diagnosticRetry');p['commands'][0]['cleanup']['remainingOwners']=[[1,2]]
        with patch.object(refresh.time,'time',return_value=1300),self.assertRaisesRegex(RuntimeError,'PREVIOUS_CLEANUP_AND_WAIT'):
            refresh.diagnostic_state(m,b)
    def test_changed_state_and_wrong_path_refused(self):
        b,p,m,_,_=self.fixture()
        b['diagnosticRetry']['updateState']['sha256']='f'*64
        with patch.object(refresh.time,'time',return_value=1300),self.assertRaisesRegex(RuntimeError,'UPDATE_STATE_PIN'):
            refresh.diagnostic_state(m,b)
        b['diagnosticRetry']['updateState']['path']='/home/recovery/another/freshclam.dat'
        with patch.object(refresh.time,'time',return_value=1300),self.assertRaisesRegex(RuntimeError,'UPDATE_STATE'):
            refresh.diagnostic_state(m,b)
    def test_explicit_denial_cannot_be_retried_as_partial_transfer(self):
        for suffix in (b'HTTP/1.1 403',b'error code 429',b'cool-down',b'rate limited',b'blocked'):
            b,p,m,data,log=self.fixture();log+=suffix
            p['commands'][0]['log'].update(bytes=len(log),sha256=refresh.sha(log))
            m.read.side_effect=lambda path,*a,**k:log if str(path).endswith('.log') else data
            with self.subTest(suffix=suffix),patch.object(refresh.time,'time',return_value=1300),self.assertRaisesRegex(RuntimeError,'EXPLICIT_SERVER_REFUSAL'):
                refresh.diagnostic_state(m,b)


class SignatureReuseTests(unittest.TestCase):
    def setUp(self):
        refresh.REPORT.clear()
        support_path = path.with_name('prepare_instance.py')
        spec = importlib.util.spec_from_file_location('reuse_support_fixture', support_path)
        self.support = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.support)

    @contextmanager
    def owned_metadata(self, uid=1100, gid=1100):
        # The only platform adaptation is the fixture UID/GID. File type, mode,
        # link count, inode and change timestamps still come from real files.
        original = Path.lstat
        def metadata(value):
            observed = original(value)
            fields = {key: getattr(observed, key) for key in
                      ('st_dev', 'st_ino', 'st_mode', 'st_nlink', 'st_size',
                       'st_mtime_ns', 'st_ctime_ns', 'st_blocks')}
            return types.SimpleNamespace(**fields, st_uid=uid, st_gid=gid)
        with patch.object(Path, 'lstat', new=metadata):
            yield

    def put_private(self, destination, raw):
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)
        destination.chmod(0o600)
        return {'path': str(destination), 'bytes': len(raw), 'sha256': refresh.sha(raw)}

    def put_json(self, destination, value):
        return self.put_private(destination, json.dumps(value, sort_keys=True).encode())

    def fixture(self, home):
        source = home/'offline-scanner-fixture/scanner-db'
        previous = home/'offline-signatures-fixture'
        payloads = {}
        rows = []
        for name, version in [('main.cvd', 63), ('daily.cvd', 28171), ('bytecode.cvd', 339)]:
            payload = f'ClamAV-VDB:date:{version}:2:3:hash:sig:builder:100000'.encode().ljust(512, b' ') + name.encode()
            payloads[name] = payload
            pin = self.put_private(source/name, payload)
            rows.append({'name': name, 'bytes': pin['bytes'], 'sha256': pin['sha256'],
                         'version': version, 'sigtoolExitCode': 0})
        imported = {'status': 'OFFLINE_SIGNATURE_IMPORT_VERIFIED_SCANNER_NOT_STARTED',
                    'identity': self.support.IDENTITY, 'currentBootId': 'fixture-boot',
                    'target': str(source), 'signatures': rows}
        receipt = {'kind': 'OFFICIAL_CVD_REFRESH_ONCE_V1', 'status': 'FAILED_PRESERVED',
                   'identity': self.support.IDENTITY, 'bootId': 'fixture-boot',
                   'output': str(previous), 'maximumAttempts': 1,
                   'officialMirror': 'database.clamav.net', 'tlsVerificationDisabled': False,
                   'commands': [{'name': 'freshclam-once', 'exitCode': 5,
                                 'cleanup': {'exited': True, 'remainingOwners': [], 'forceKill': False}}]}
        state = b'opaque-original-freshclam-state-with-cooldown'
        reuse = {'kind': 'VERIFIED_MAIN_BYTECODE_AND_UPDATER_STATE_V1',
                 'verifiedImport': self.put_json(source/'IMPORT-RECEIPT.json', imported),
                 'updateReceipt': self.put_json(previous/'result.json', receipt),
                 'updateState': self.put_private(previous/'db/freshclam.dat', state)}
        binding = {'kind': 'OFFICIAL_CVD_REFRESH_ONCE_V1', 'bootId': 'fixture-boot',
                   'systemCaSha256': 'a'*64, 'reuseExisting': reuse}
        return {'source': source, 'previous': previous, 'payloads': payloads, 'imported': imported,
                'previousReceipt': receipt, 'state': state, 'binding': binding}

    def test_absent_reuse_does_not_touch_sources_or_reader(self):
        reader = types.SimpleNamespace(pinned=unittest.mock.Mock(side_effect=AssertionError('no read')))
        with patch.object(refresh, 'reusable_file', side_effect=AssertionError('no source')):
            self.assertEqual(refresh.reusable_inputs(reader, {}), ([], None, None))
        reader.pinned.assert_not_called()

    def test_verified_main_and_bytecode_are_selected_with_exact_original_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp).resolve()
            fixture = self.fixture(home)
            with patch.object(refresh, 'HOME', home), self.owned_metadata():
                rows, state, proof = refresh.reusable_inputs(self.support, fixture['binding'])
            self.assertEqual([row['name'] for row in rows], ['main.cvd', 'bytecode.cvd'])
            self.assertEqual(state, fixture['state'])
            self.assertEqual(proof['freshclamDatabaseSelection'], 'DEFAULT_ALL_OFFICIAL_DATABASES')
            self.assertNotIn('allOfficialDatabasesCheckedByFreshclam', proof)
            self.assertTrue(proof['cooldownStatePreserved'])
            for row in rows:
                self.assertEqual(Path(row['path']).read_bytes(), fixture['payloads'][row['name']])

    def test_reuse_receipt_pin_and_import_status_are_required(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp).resolve()
            fixture = self.fixture(home)
            binding = copy.deepcopy(fixture['binding'])
            binding['reuseExisting']['verifiedImport']['sha256'] = 'f'*64
            with patch.object(refresh, 'HOME', home), self.owned_metadata():
                with self.assertRaisesRegex(RuntimeError, 'INPUT_PIN'):
                    refresh.reusable_inputs(self.support, binding)
                fixture['imported']['status'] = 'SOURCES_DECLARED_NOT_VERIFIED'
                fixture['binding']['reuseExisting']['verifiedImport'] = self.put_json(
                    fixture['source']/'IMPORT-RECEIPT.json', fixture['imported'])
                with self.assertRaisesRegex(RuntimeError, 'VERIFIED_REUSE_ORIGIN'):
                    refresh.reusable_inputs(self.support, fixture['binding'])

    def test_unverified_reused_file_and_missing_import_member_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp).resolve()
            fixture = self.fixture(home)
            for status in (None, 1):
                fixture['imported']['signatures'][0]['sigtoolExitCode'] = status
                fixture['binding']['reuseExisting']['verifiedImport'] = self.put_json(
                    fixture['source']/'IMPORT-RECEIPT.json', fixture['imported'])
                with self.subTest(status=status), patch.object(refresh, 'HOME', home), self.owned_metadata():
                    with self.assertRaisesRegex(RuntimeError, 'VERIFIED_REUSE_FILE'):
                        refresh.reusable_inputs(self.support, fixture['binding'])
            fixture['imported']['signatures'].pop()
            fixture['binding']['reuseExisting']['verifiedImport'] = self.put_json(
                fixture['source']/'IMPORT-RECEIPT.json', fixture['imported'])
            with patch.object(refresh, 'HOME', home), self.owned_metadata():
                with self.assertRaisesRegex(RuntimeError, 'REUSE_IMPORT_SET'):
                    refresh.reusable_inputs(self.support, fixture['binding'])

    def test_update_state_origin_and_digest_cannot_be_replaced(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp).resolve()
            fixture = self.fixture(home)
            mutations = [('path', str(home/'unrelated/freshclam.dat'), 'REUSE_UPDATER_STATE'),
                         ('sha256', 'f'*64, 'REUSE_UPDATER_STATE_PIN'),
                         ('bytes', 4097, 'REUSE_UPDATER_STATE')]
            for field, value, code in mutations:
                binding = copy.deepcopy(fixture['binding'])
                binding['reuseExisting']['updateState'][field] = value
                with self.subTest(field=field), patch.object(refresh, 'HOME', home), self.owned_metadata():
                    with self.assertRaisesRegex(RuntimeError, code):
                        refresh.reusable_inputs(self.support, binding)
            fixture['previousReceipt']['tlsVerificationDisabled'] = True
            fixture['binding']['reuseExisting']['updateReceipt'] = self.put_json(
                fixture['previous']/'result.json', fixture['previousReceipt'])
            with patch.object(refresh, 'HOME', home), self.owned_metadata():
                with self.assertRaisesRegex(RuntimeError, 'UPDATER_STATE_ORIGIN'):
                    refresh.reusable_inputs(self.support, fixture['binding'])

    def test_updater_state_requires_resolved_producer_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp).resolve()
            fixture = self.fixture(home)
            original = copy.deepcopy(fixture['previousReceipt'])
            variants = []
            missing = copy.deepcopy(original)
            missing.pop('commands')
            variants.append(missing)
            empty = copy.deepcopy(original)
            empty['commands'] = []
            variants.append(empty)
            for field, value in [('exitCode', None), ('cleanup', {})]:
                changed = copy.deepcopy(original)
                changed['commands'][0][field] = value
                variants.append(changed)
            for field, value in [('exited', False), ('remainingOwners', [[456, 100]])]:
                changed = copy.deepcopy(original)
                changed['commands'][0]['cleanup'][field] = value
                variants.append(changed)
            for index, previous in enumerate(variants):
                binding = copy.deepcopy(fixture['binding'])
                binding['reuseExisting']['updateReceipt'] = self.put_json(
                    fixture['previous']/'result.json', previous)
                with self.subTest(index=index), patch.object(refresh, 'HOME', home), self.owned_metadata():
                    with self.assertRaisesRegex(RuntimeError, 'UPDATER_STATE_PRODUCER'):
                        refresh.reusable_inputs(self.support, binding)

    def test_successful_four_command_updater_state_and_unknown_command_boundary(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp).resolve()
            fixture = self.fixture(home)
            receipt = fixture['previousReceipt']
            receipt['status'] = 'OFFICIAL_SIGNATURE_REFRESH_VERIFIED_SCANNER_NOT_STARTED'
            receipt['commands'] = [{'name': name, 'exitCode': 0,
                                    'cleanup': {'exited': True, 'remainingOwners': [], 'forceKill': False}}
                                   for name in ['freshclam-once', 'verify-main', 'verify-daily', 'verify-bytecode']]
            fixture['binding']['reuseExisting']['updateReceipt'] = self.put_json(
                fixture['previous']/'result.json', receipt)
            with patch.object(refresh, 'HOME', home), self.owned_metadata():
                _, state, _ = refresh.reusable_inputs(self.support, fixture['binding'])
            self.assertEqual(state, fixture['state'])
            receipt['commands'][-1]['name'] = 'unexpected-command'
            fixture['binding']['reuseExisting']['updateReceipt'] = self.put_json(
                fixture['previous']/'result.json', receipt)
            with patch.object(refresh, 'HOME', home), self.owned_metadata():
                with self.assertRaisesRegex(RuntimeError, 'UPDATER_STATE_PRODUCER'):
                    refresh.reusable_inputs(self.support, fixture['binding'])

    def test_reuse_rejects_unknown_binding_fields_and_import_location(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp).resolve()
            fixture = self.fixture(home)
            binding = copy.deepcopy(fixture['binding'])
            binding['reuseExisting']['files'] = ['daily.cvd']
            with self.assertRaisesRegex(RuntimeError, 'REUSE_BINDING'):
                refresh.reusable_inputs(self.support, binding)
            fixture['imported']['target'] = str(home/'unrelated-db')
            fixture['binding']['reuseExisting']['verifiedImport'] = self.put_json(
                fixture['source']/'IMPORT-RECEIPT.json', fixture['imported'])
            with patch.object(refresh, 'HOME', home), self.owned_metadata():
                with self.assertRaisesRegex(RuntimeError, 'VERIFIED_REUSE_ORIGIN'):
                    refresh.reusable_inputs(self.support, fixture['binding'])

    def test_source_mode_owner_symlink_and_hardlink_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            source = root/'main.cvd'
            pin = self.put_private(source, b'synthetic CVD bytes')
            for uid, gid in [(1101, 1100), (1100, 1101)]:
                with self.subTest(uid=uid, gid=gid), self.owned_metadata(uid, gid):
                    with self.assertRaisesRegex(RuntimeError, 'REUSE_SOURCE_METADATA'):
                        refresh.reusable_file(None, source, pin)
            source.chmod(0o644)
            with self.owned_metadata(), self.assertRaisesRegex(RuntimeError, 'REUSE_SOURCE_METADATA'):
                refresh.reusable_file(None, source, pin)
            source.chmod(0o600)
            link = root/'link.cvd'
            link.symlink_to(source)
            with self.owned_metadata(), self.assertRaisesRegex(RuntimeError, 'REUSE_SOURCE_METADATA'):
                refresh.reusable_file(None, link, pin)
            hardlink = root/'hardlink.cvd'
            os.link(source, hardlink)
            with self.owned_metadata(), self.assertRaisesRegex(RuntimeError, 'REUSE_SOURCE_METADATA'):
                refresh.reusable_file(None, source, pin)

    def test_source_digest_and_atomic_replacement_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            source = root/'main.cvd'
            payload = b'synthetic signature data'
            pin = self.put_private(source, payload)
            with self.owned_metadata(), self.assertRaisesRegex(RuntimeError, 'REUSE_SOURCE_CHANGED_OR_HASH'):
                refresh.reusable_file(None, source, {**pin, 'sha256': 'f'*64})
            original_read = refresh.os.read
            replaced = False
            def replace_after_first_read(descriptor, size):
                nonlocal replaced
                result = original_read(descriptor, size)
                if result and not replaced:
                    replacement = root/'replacement'
                    self.put_private(replacement, payload)
                    replacement.replace(source)
                    replaced = True
                return result
            with self.owned_metadata(), patch.object(refresh.os, 'read', side_effect=replace_after_first_read):
                with self.assertRaisesRegex(RuntimeError, 'REUSE_SOURCE_CHANGED_OR_HASH'):
                    refresh.reusable_file(None, source, pin)
            self.assertTrue(replaced)

    def test_exclusive_copy_readback_and_existing_target_preserve_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            source = root/'main.cvd'
            payload = b'synthetic source bytes'
            pin = self.put_private(source, payload)
            destination = root/'copy.cvd'
            with self.owned_metadata(), patch.object(refresh, 'guard') as guard:
                refresh.reusable_file(None, source, pin, destination, root)
                refresh.reusable_file(None, destination, pin)
                with self.assertRaises(FileExistsError):
                    refresh.reusable_file(None, source, pin, destination, root)
            self.assertEqual(source.read_bytes(), payload)
            self.assertEqual(destination.read_bytes(), payload)
            self.assertNotEqual(source.stat().st_ino, destination.stat().st_ino)
            self.assertEqual(stat.S_IMODE(destination.stat().st_mode), 0o600)
            guard.assert_called_once_with(root, None)

    def test_copy_resource_failure_keeps_partial_evidence_and_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            source = root/'main.cvd'
            payload = b'synthetic bytes'
            pin = self.put_private(source, payload)
            destination = root/'copy.cvd'
            with self.owned_metadata(), patch.object(refresh, 'guard', side_effect=RuntimeError('CHECK_UPDATE_RESOURCE_FLOOR')):
                with self.assertRaisesRegex(RuntimeError, 'UPDATE_RESOURCE_FLOOR'):
                    refresh.reusable_file(None, source, pin, destination, root)
            self.assertTrue(destination.exists())
            self.assertEqual(source.read_bytes(), payload)

    def admission_fixture(self, home, fixture, reuse=True):
        binding = copy.deepcopy(fixture['binding'])
        if not reuse:
            binding.pop('reuseExisting')
        output = home/'offline-signatures-new'
        generation = {'dependencies': str(home/'dependencies')}
        software = types.SimpleNamespace(TARGET=home/'software')
        tools = {'freshclam': home/'freshclam-fixture', 'sigtool': home/'sigtool-fixture'}
        return (self.support, binding, output, generation, software, tools,
                {'fixture': True}, home/'ca-fixture', {'fixture': True})

    def test_diagnostic_and_reuse_state_conflict_precedes_output_creation(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp).resolve()
            fixture = self.fixture(home)
            admission = self.admission_fixture(home, fixture)
            with patch.object(refresh, 'HOME', home), self.owned_metadata(), \
                 patch.object(refresh, 'admission', return_value=admission), \
                 patch.object(refresh, 'diagnostic_state', return_value=(b'different state', {})), \
                 patch.object(refresh, 'run', side_effect=AssertionError('no program')):
                with self.assertRaisesRegex(RuntimeError, 'REUSE_DIAGNOSTIC_STATE_MISMATCH'):
                    refresh.execute(types.SimpleNamespace(check_admission=False, binding_sha256='a'*64))
            self.assertFalse(admission[2].exists())

    def run_synthetic_refresh(self, home, fixture, reuse, failed_sigtool=None):
        admission = self.admission_fixture(home, fixture, reuse)
        output = admission[2]
        calls = []
        def command(argv, env, root, support, name, seconds):
            calls.append({'name': name, 'argv': argv, 'seconds': seconds})
            if name == 'freshclam-once':
                if reuse:
                    self.assertEqual((root/'db/freshclam.dat').read_bytes(), fixture['state'])
                    self.assertEqual((root/'db/main.cvd').read_bytes(), fixture['payloads']['main.cvd'])
                    self.assertEqual((root/'db/bytecode.cvd').read_bytes(), fixture['payloads']['bytecode.cvd'])
                    self.assertFalse((root/'db/daily.cvd').exists())
                for filename, raw in fixture['payloads'].items():
                    if not (root/'db'/filename).exists():
                        self.put_private(root/'db'/filename, raw)
                return b'fixture updater complete'
            return b'Verification rejected' if name == failed_sigtool else b'Verification OK.'
        with patch.object(refresh, 'HOME', home), self.owned_metadata(), \
             patch.object(refresh, 'admission', return_value=admission), \
             patch.object(refresh, 'guard'), patch.object(refresh, 'run', side_effect=command), \
             patch.object(refresh.time, 'time', return_value=100001), \
             patch.object(refresh.subprocess, 'Popen', side_effect=AssertionError('no actual subprocess')), \
             patch('builtins.print'):
            if failed_sigtool is None:
                refresh.execute(types.SimpleNamespace(check_admission=False, binding_sha256='a'*64))
            else:
                with self.assertRaisesRegex(RuntimeError, 'OFFICIAL_SIGNATURE_VERIFICATION'):
                    refresh.execute(types.SimpleNamespace(check_admission=False, binding_sha256='a'*64))
        return output, calls

    def test_normal_and_reuse_paths_keep_full_database_selection_and_three_sigtools(self):
        for reuse in (False, True):
            with self.subTest(reuse=reuse), tempfile.TemporaryDirectory() as tmp:
                refresh.REPORT.clear()
                home = Path(tmp).resolve()
                fixture = self.fixture(home)
                output, calls = self.run_synthetic_refresh(home, fixture, reuse)
                self.assertEqual([row['name'] for row in calls],
                                 ['freshclam-once', 'verify-main', 'verify-daily', 'verify-bytecode'])
                self.assertEqual([row['seconds'] for row in calls], [600, 90, 90, 90])
                self.assertEqual(calls[0]['argv'][-2:], ['--config-file='+str(output/'freshclam.conf'), '--stdout'])
                self.assertFalse(any('update-db' in arg for row in calls for arg in row['argv']))
                configuration = (output/'freshclam.conf').read_text()
                self.assertIn('ScriptedUpdates '+('no' if reuse else 'yes')+'\n', configuration)
                self.assertIn('TestDatabases yes\n', configuration)
                self.assertIn('MaxAttempts 1\n', configuration)
                report = json.loads((output/'result.json').read_bytes())
                self.assertEqual(report['status'], 'OFFICIAL_SIGNATURE_REFRESH_VERIFIED_SCANNER_NOT_STARTED')
                self.assertEqual(len(report['signatures']), 3)
                self.assertEqual('reusedInputs' in report, reuse)
                for name, raw in fixture['payloads'].items():
                    self.assertEqual((fixture['source']/name).read_bytes(), raw)

    def test_reused_file_still_requires_postupdate_signature_verification(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp).resolve()
            fixture = self.fixture(home)
            output, calls = self.run_synthetic_refresh(home, fixture, True, 'verify-main')
            self.assertEqual([row['name'] for row in calls], ['freshclam-once', 'verify-main'])
            report = json.loads((output/'result.json').read_bytes())
            self.assertEqual(report['status'], 'FAILED_PRESERVED')
            self.assertEqual(report['errorCode'], 'CHECK_OFFICIAL_SIGNATURE_VERIFICATION')
            self.assertEqual((fixture['previous']/'db/freshclam.dat').read_bytes(), fixture['state'])


if __name__=='__main__':unittest.main()
