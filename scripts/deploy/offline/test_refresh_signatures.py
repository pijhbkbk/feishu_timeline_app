"""Local failure-boundary tests; no network, scanner, certificate or real CVD."""
import copy
import datetime as dt
import importlib.util
import json
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

if __name__=='__main__':unittest.main()
