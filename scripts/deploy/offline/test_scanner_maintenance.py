"""Synthetic contracts only. No guest, socket, daemon, signature download or reload."""
import copy
import importlib.util
from pathlib import Path
import unittest
p=Path(__file__).with_name('scanner_maintenance.py')
spec=importlib.util.spec_from_file_location('maintenance',p)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ReloadProofTests(unittest.TestCase):
    def test_exact_success_after_compile_and_join(self):
        self.assertEqual(m.completed_reload(b'Database correctly reloaded (123 signatures)\nDatabase reload completed.\n'),123)

    def test_ack_or_old_start_message_does_not_prove_reload(self):
        for raw in (b'RELOADING',b'Loaded 123 signatures.\n',b'Database reload completed.\n',
                    b'Database correctly reloaded (123 signatures)\n'):
            with self.subTest(raw=raw),self.assertRaises(RuntimeError):m.completed_reload(raw)

    def test_failed_zero_reversed_or_duplicate_reload_rejected(self):
        good=b'Database correctly reloaded (123 signatures)\nDatabase reload completed.\n'
        for raw in (good+b'reload_th: error',good.replace(b'123',b'0'),good+good,
                    b'Database reload completed.\nDatabase correctly reloaded (123 signatures)\n'):
            with self.subTest(raw=raw),self.assertRaises(RuntimeError):m.completed_reload(raw)

    def fixture(self):
        rows=[{'name':name,'bytes':100,'sha256':str(i+1)*64,'version':i+10,'buildEpoch':1800000000-100}
              for i,name in enumerate(m.NAMES)]
        ref={'path':'old-start','sha256':'a'*64};owner={'pid':2368,'startTicks':939813,'uid':1100};identity={'sourceCommit':'b'*40}
        loaded={'kind':'SAME_PROCESS_OFFICIAL_SIGNATURE_MAINTENANCE_V1',
                'status':'SAME_PROCESS_RELOAD_READBACK_VERIFIED_CLIENT_PENDING','originalStart':ref,
                'oldFilesPreserved':True,'automaticRollback':False,'serviceStopOrStart':False,
                'identity':identity,'currentBootId':'same-boot','process':owner,'signatures':rows,
                'finishedAt':'2027-01-15T08:00:00+00:00','runtime':{'signatures':copy.deepcopy(rows),'ping':'PONG'},
                'reload':{'attempts':1,'ack':'RELOADING','ackIsCompletion':False,'loadedSignatures':123,'suffixSha256':'c'*64}}
        client={'status':'TWOCASE_REAL_CLIENT_PASS','identity':m.CLIENT_IDENTITY,'compiledIdentity':m.CLIENT_IDENTITY,
                'currentBootId':'same-boot','scannerStartReceipt':ref,'scannerProcess':owner,
                'endpoint':{'host':'127.0.0.1','port':3310},'databaseOrHttpAccess':False,'serviceControl':False,
                'signatureMaxAgeHours':48,'perScanTimeoutMs':15000,'overallDeadlineMs':60000,
                'startedAt':'2027-01-15T08:00:01+00:00','loadedScanner':{'signatureVersion':'11','signatureTimestampMs':1799999900000},
                'cases':[]}
        for label,verdict,summary in [('clean','CLEAN','CLEAN'),('EICAR','REJECTED','MALWARE_FOUND:Eicar-Test-Signature')]:
            client['cases'].append({'label':label,'status':'PASS','actual':{'verdict':verdict,'resultSummary':summary,
                'engine':'clamav','engineVersion':'1.4.6','signatureVersion':'11'}})
        return loaded,client,ref,1800000000

    def test_current_real_client_shape_can_complete_contract(self):
        self.assertEqual(m.client_acceptance(*self.fixture())['currentDailyVersion'],11)

    def test_ack_failed_reload_and_automatic_rollback_cannot_be_ready(self):
        for key,value in [('status','FAILED_PRESERVED'),('automaticRollback',True),('oldFilesPreserved',False)]:
            args=list(self.fixture());args[0][key]=value
            with self.subTest(key=key),self.assertRaises(RuntimeError):m.client_acceptance(*args)
        args=list(self.fixture());args[0]['reload'].pop('loadedSignatures')
        with self.assertRaises(RuntimeError):m.client_acceptance(*args)

    def test_old_or_future_daily_still_rejected(self):
        for now in (1800200000,1799999899):
            args=list(self.fixture());args[-1]=now
            with self.subTest(now=now),self.assertRaises(RuntimeError):m.client_acceptance(*args)

    def test_changed_owner_bytes_version_or_missing_case_rejected(self):
        for mutation in ('owner','bytes','version','cases','boot','time','verdict'):
            args=list(self.fixture());loaded,client=args[:2]
            if mutation=='owner':client['scannerProcess']={'pid':2369}
            elif mutation=='bytes':loaded['runtime']['signatures'][0]['sha256']='f'*64
            elif mutation=='version':client['loadedScanner']['signatureVersion']='10'
            elif mutation=='cases':client['cases'].pop()
            elif mutation=='boot':client['currentBootId']='other'
            elif mutation=='time':client['startedAt']='2027-01-15T07:59:59+00:00'
            else:client['cases'][1]['actual']['verdict']='CLEAN'
            with self.subTest(mutation=mutation),self.assertRaises(RuntimeError):m.client_acceptance(*args)


# These tests use actual temporary regular files. System process and daemon work
# stays outside this fixture; publication and retained failure bytes are real.
import hashlib
import json
import os
import tempfile
import types
from unittest.mock import patch

class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name).resolve()
        self.db=self.root/'scanner-db';self.db.mkdir(mode=0o700)
        self.event=self.root/'scanner-maintenance-test';self.event.mkdir(mode=0o700)
        for name in ('old','staged'):(self.event/name).mkdir(mode=0o700)
        self.rows=[];self.old=[]
        for name in m.NAMES:
            for path,raw in [(self.db/name,b'old-'+name.encode()),(self.event/'old'/name,b'old-'+name.encode()),
                             (self.event/'staged'/name,b'new-'+name.encode())]:
                path.write_bytes(raw);path.chmod(0o600)
            self.old.append(self.info(self.db/name))
            self.rows.append({**self.info(self.event/'staged'/name),'name':name})
        self.scanner=types.SimpleNamespace(DB=self.db,file_info=self.info)
        self.report={'status':'FAILED_PRESERVED','steps':[]}
    def info(self,path,*args):
        raw=path.read_bytes()
        return {'path':str(path),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    def test_all_three_publish_preserve_complete_backup(self):
        m.publish_staged(self.scanner,self.event,self.rows,self.old,lambda:None,self.report)
        for name in m.NAMES:
            self.assertEqual((self.db/name).read_bytes(),b'new-'+name.encode())
            self.assertEqual((self.event/'old'/name).read_bytes(),b'old-'+name.encode())
        self.assertEqual(len(self.report['steps']),3)
        self.assertEqual(self.report['status'],'FAILED_PRESERVED')
        self.assertFalse((self.event/'reload-attempt.json').exists())
    def test_second_publication_failure_keeps_partial_state_and_all_old_bytes(self):
        replace=os.replace;count=0
        def interrupted(source,target):
            nonlocal count
            count+=1
            if count==2:raise OSError('synthetic publication failure')
            return replace(source,target)
        with patch.object(m.os,'replace',side_effect=interrupted),self.assertRaises(OSError):
            m.publish_staged(self.scanner,self.event,self.rows,self.old,lambda:None,self.report)
        self.assertEqual((self.db/'main.cvd').read_bytes(),b'new-main.cvd')
        self.assertEqual((self.db/'daily.cvd').read_bytes(),b'old-daily.cvd')
        self.assertEqual(self.report['steps'],['PUBLISHED_main.cvd'])
        for name in m.NAMES:self.assertEqual((self.event/'old'/name).read_bytes(),b'old-'+name.encode())
        self.assertEqual(self.report['status'],'FAILED_PRESERVED')
        self.assertFalse((self.event/'reload-attempt.json').exists())
    def test_active_changed_before_publish_rejects_without_overwrite(self):
        (self.db/'main.cvd').write_bytes(b'concurrent-edit')
        with self.assertRaisesRegex(RuntimeError,'ACTIVE_CAS'):
            m.publish_staged(self.scanner,self.event,self.rows,self.old,lambda:None,self.report)
        self.assertEqual((self.db/'main.cvd').read_bytes(),b'concurrent-edit')
        self.assertEqual(self.report['steps'],[])
    def test_same_target_lock_excludes_second_writer_and_retains_inode(self):
        scanner=types.SimpleNamespace(SCANNER=self.root,UID=os.getuid())
        with m.maintenance_lock(scanner, create=True):
            before=(self.root/'maintenance.lock').stat().st_ino
            with self.assertRaises(BlockingIOError):
                with m.maintenance_lock(scanner):self.fail('second writer entered')
        with m.maintenance_lock(scanner):self.assertEqual((self.root/'maintenance.lock').stat().st_ino,before)
    def test_lock_rejects_symlink(self):
        scanner=types.SimpleNamespace(SCANNER=self.root,UID=os.getuid())
        (self.root/'maintenance.lock').symlink_to(self.db/'main.cvd')
        with self.assertRaises(OSError):
            with m.maintenance_lock(scanner):self.fail('followed symlink')



class ProtectedOwnersTests(unittest.TestCase):
    def fixture(self):
        reference={'path':'/home/recovery/joint-lifecycle-3a11-r01/events/date-start-r02/result.json',
                   'sha256':'d6b618b7a1d052c57182bd53974c15343f9f02cda1edd6ef04495489e8053080'}
        owners=[{'pid':pid,'startTicks':str(pid*10),'uid':1100,'executable':'/exact/node','cwd':'/exact/cwd'}
                for pid in (10,20,30)]
        value={'kind':'JOINT_APPLICATION_LIFECYCLE_RESULT_V1','status':'JOINT_LIFECYCLE_RUNNING',
               'bootId':'boot','identity':m.CLIENT_IDENTITY,'owners':{'api':owners[0],'web':owners[1]},'proxyOwner':owners[2]}
        observed={row['pid']:{**row,'state':'S'} for row in owners}
        scanner=types.SimpleNamespace(BOOT='boot',read_json=lambda *args:(value,{}),process=lambda pid:observed[pid])
        return scanner,reference,value,observed
    def test_same_api_web_proxy_owners_are_preserved(self):
        scanner,reference,_,_=self.fixture()
        with patch.object(m.os,'readlink',side_effect=lambda path:'/exact/node' if path.name=='exe' else '/exact/cwd'):
            m.protected_owners(scanner,reference)
    def test_reused_pid_changed_source_or_executable_rejected(self):
        for change in ('ticks','identity','exe'):
            scanner,reference,value,observed=self.fixture()
            if change=='ticks':observed[20]['startTicks']='changed'
            elif change=='identity':value['identity']={'sourceCommit':'other'}
            def link(path):
                return '/wrong/node' if change=='exe' else ('/exact/node' if path.name=='exe' else '/exact/cwd')
            with self.subTest(change=change),patch.object(m.os,'readlink',side_effect=link),self.assertRaises(RuntimeError):
                m.protected_owners(scanner,reference)


class AcceptedObservationTests(unittest.TestCase):
    def test_read_only_live_check_ignores_retired_app_owner_but_keeps_scanner_guards(self):
        with tempfile.TemporaryDirectory() as directory:
            config=Path(directory)/'clamd.conf'
            config.write_text('SelfCheck 0\nConcurrentDatabaseReload no\nOfficialDatabaseOnly yes\nBytecodeSecurity TrustSigned\n')
            listener={'addressHex':'0100007F','inode':'42'}
            start={'process':{'pid':10},'runtime':{'config':{},'listener':listener}}
            scanner=types.SimpleNamespace(owner_matches=lambda owner:True,fixed_owners=lambda:None,
                config_check=lambda:{},CONFIG=config,listeners=lambda:[listener])
            with patch.object(m,'protected_owners',side_effect=RuntimeError('retired application owner')) as guard, \
                 patch.object(Path,'iterdir',return_value=iter([Path('/synthetic/fd/0')])), \
                 patch.object(m.os,'readlink',return_value='socket:[42]'):
                m.live(scanner,start)
                guard.assert_not_called()
                with self.assertRaisesRegex(RuntimeError,'retired application owner'):
                    m.live(scanner,start,{'historical':'reference'})
            scanner.owner_matches=lambda owner:False
            with self.assertRaisesRegex(RuntimeError,'CHECK_MAINTENANCE_OWNER'):
                m.live(scanner,start)

    def test_only_accepted_read_only_consumer_relaxes_application_pid_binding(self):
        import ast,inspect
        tree=ast.parse(inspect.getsource(m))
        functions={node.name:node for node in tree.body if isinstance(node,ast.FunctionDef)}
        calls=lambda name:[node for node in ast.walk(functions[name]) if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='loaded_inputs']
        self.assertEqual(len(calls('verify_accepted')),1)
        self.assertEqual([(key.arg,key.value.value) for key in calls('verify_accepted')[0].keywords],[('protect_runtime',False)])
        self.assertEqual(calls('finalize_locked')[0].keywords,[])
        default=functions['loaded_inputs'].args.kw_defaults[0]
        self.assertIs(default.value,True)

if __name__=='__main__':unittest.main()
