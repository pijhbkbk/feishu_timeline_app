"""Focused synthetic process/state/cache boundaries; never contacts a VM."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

HERE=Path(__file__).resolve().parent
def load(name):
    spec=importlib.util.spec_from_file_location(name,HERE/(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
m=load('joint_lifecycle');cache=load('joint_runtime_cache');host=load('joint_lifecycle_host')
consumer=load('application_delta')

def owner(role,pid=123):
    cwd,argv=m.expected(role)
    return {'pid':pid,'startTicks':'12345','uid':1100,'executable':str(m.NODE),'cwd':cwd,'argv':argv}

class ProcessTests(unittest.TestCase):
    def setUp(self):m.ctx.clear()
    def test_stale_identity_prevents_all_signals(self):
        v={'owners':{'api':owner('api',124),'web':owner('web')}}
        with patch.object(m,'boot'),patch.object(m,'current',side_effect=['RUNNING','RUNNING','STALE']),\
             patch.object(m.os,'pidfd_open',return_value=10,create=True),\
             patch.object(m.os,'close') as close,patch.object(m.signal,'pidfd_send_signal',create=True) as send:
            with self.assertRaisesRegex(RuntimeError,'OWNER_REUSED'):m.stop_owned(v)
            send.assert_not_called();close.assert_called_once_with(10)
    def test_stop_handles_one_exited_role_and_never_signals_shared(self):
        v={'owners':{'api':owner('api',124),'web':owner('web')}}
        poll=Mock();poll.poll.return_value=[(10,1)]
        with patch.object(m,'boot'),patch.object(m,'current',side_effect=['EXITED','RUNNING','RUNNING','RUNNING']),\
             patch.object(m,'listening_ports',return_value=set()),patch.object(m.select,'poll',return_value=poll),\
             patch.object(m.os,'pidfd_open',return_value=10,create=True) as opened,patch.object(m.os,'close'),\
             patch.object(m.signal,'pidfd_send_signal',create=True) as send:
            result=m.stop_owned(v)
            opened.assert_called_once_with(124);send.assert_called_once_with(10,m.signal.SIGTERM)
            self.assertTrue(result[0]['alreadyExited']);self.assertTrue(result[1]['normalExit'])
    def test_foreign_listener_is_not_killed(self):
        with patch.object(m,'listening_ports',return_value={3591}),patch.object(m.signal,'pidfd_send_signal',create=True) as send:
            with self.assertRaisesRegex(RuntimeError,'APPLICATION_PORT_NOT_FREE'):m.stop_owned({'owners':{}})
            send.assert_not_called()
    def test_unresolved_child_not_misreported_as_stopped(self):
        with patch.object(m,'listening_ports',return_value=set()):
            self.assertEqual(m.inspect({'owners':{},'unresolvedChildren':['api']})['status'],'UNRESOLVED_CHILD')
    def test_time_wait_not_listener(self):
        rows='header\n 0: 0100007F:0E07 00000000:0000 06 other\n 1: 0100007F:0E08 00000000:0000 0A other\n'
        with patch.object(Path,'read_text',return_value=rows):self.assertEqual(m.listening_ports(),{3592})
    def test_next_process_title_is_not_owner_identity(self):
        v=owner('web');parts=['S']+['0']*18+['12345']
        def link(p):return v['executable'] if str(p).endswith('/exe') else v['cwd']
        with patch.object(Path,'read_text',return_value='123 (next-server) '+' '.join(parts)),\
             patch.object(Path,'stat',return_value=types.SimpleNamespace(st_uid=1100)),patch.object(m.os,'readlink',side_effect=link):
            self.assertEqual(m.current(v),'RUNNING')
            v['startTicks']='999';self.assertEqual(m.current(v),'STALE')
    def test_partial_start_keeps_original_and_cleanup_failures(self):
        j=types.SimpleNamespace(cleanup=Mock(side_effect=RuntimeError('CHECK_CLEANUP')))
        o=types.SimpleNamespace(resources=Mock(),quota=Mock(return_value={}))
        m.ctx.update(j=j,o=o)
        with patch.object(m,'listening_ports',return_value=set()),patch.object(m,'spawn_owned',side_effect=RuntimeError('CHECK_START')):
            with self.assertRaisesRegex(RuntimeError,'CHECK_START'):m.start_owned({'owners':{}})
        self.assertEqual(m.ctx['cleanupFailureCode'],'CHECK_CLEANUP');j.cleanup.assert_called_once()

class StateTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name).resolve()
        self.event=self.root/'events'/'restart-1';self.event.mkdir(parents=True)
        m.ctx.clear();self.v={'owners':{},'proxyOwner':{'fixture':True}}
        m.ctx.update(event=self.event,args=types.SimpleNamespace(event='restart-1',binding_sha256='b'*64),previousStateSha256='a'*64,claimSha256='c'*64)
        (self.root/'pending.json').write_text(json.dumps({'event':'restart-1'}))
    def tearDown(self):self.temp.cleanup()
    def test_result_is_durable_before_handle_release(self):
        def released():
            p=json.loads((self.root/'state.json').read_bytes())
            self.assertEqual(p['sha256'],hashlib.sha256((self.event/'result.json').read_bytes()).hexdigest())
            self.assertFalse((self.root/'pending.json').exists())
        m.ctx['j']=types.SimpleNamespace(release_handles=Mock(side_effect=released))
        with patch.object(m,'ROOT',self.root),patch.object(m,'read',side_effect=lambda p,*a:Path(p).read_bytes()),contextlib.redirect_stdout(io.StringIO()):
            m.finish(self.v,{'status':'JOINT_LIFECYCLE_RUNNING','owners':{}})
        self.assertTrue(m.ctx['statePublished']);m.ctx['j'].release_handles.assert_called_once()
    def test_pointer_failure_retains_claim_and_handles(self):
        j=types.SimpleNamespace(release_handles=Mock());m.ctx['j']=j
        with patch.object(m,'ROOT',self.root),patch.object(m.os,'replace',side_effect=OSError('synthetic')):
            with self.assertRaises(OSError):m.finish(self.v,{'status':'JOINT_LIFECYCLE_RUNNING','owners':{}})
        self.assertTrue((self.root/'pending.json').exists());self.assertTrue((self.event/'result.json').exists())
        self.assertFalse(m.ctx.get('statePublished'));j.release_handles.assert_not_called()
    def test_external_state_cas_rejects_stale_argument(self):
        (self.root/'state.json').write_text(json.dumps({'sha256':'b'*64}))
        with patch.object(m,'ROOT',self.root),patch.object(m,'read',side_effect=lambda p,*a:Path(p).read_bytes()):
            with self.assertRaisesRegex(RuntimeError,'STALE_STATE_ARGUMENT'):m.state('a'*64)
    def test_readonly_status_discovers_current_state(self):
        result={'identity':m.IDENTITY,'bootId':m.BOOT,'owners':{},'proxyOwner':{}}
        raw=json.dumps(result).encode();digest=m.sha(raw);(self.event/'result.json').write_bytes(raw)
        (self.root/'state.json').write_text(json.dumps({'path':str(self.event/'result.json'),'sha256':digest}))
        with patch.object(m,'ROOT',self.root),patch.object(m,'read',side_effect=lambda p,*a:Path(p).read_bytes()):
            self.assertEqual(m.state('a'*64,discover=True),result)
            self.assertEqual(m.ctx['previousStateSha256'],digest)
    def test_only_exact_published_claim_can_be_finished(self):
        claim={'event':'restart-1','action':'restart','identity':m.IDENTITY,'bootId':m.BOOT,'bindingSha256':'b'*64,'previousStateSha256':'a'*64}
        digest=m.write(self.event/'claim.json',claim)
        (self.root/'pending.json').write_text(json.dumps({'event':'restart-1','claim':str(self.event/'claim.json'),'claimSha256':digest}))
        value={**claim,'claimSha256':digest};m.ctx['stateReceiptPath']=self.event/'result.json'
        with patch.object(m,'ROOT',self.root),patch.object(m,'read',side_effect=lambda p,*a:Path(p).read_bytes()):
            with self.assertRaisesRegex(RuntimeError,'UNRESOLVED_PRIOR_OPERATION'):
                m.resolve_published_pending({**value,'unresolvedChildren':['api']})
            self.assertTrue((self.root/'pending.json').exists())
            with self.assertRaisesRegex(RuntimeError,'PUBLISHED_CLAIM_BINDING'):
                m.resolve_published_pending({**value,'action':'stop'})
            m.resolve_published_pending(value)
            self.assertFalse((self.root/'pending.json').exists())
    def test_missing_binding_digest_rejected_before_file_reads(self):
        with patch.object(sys,'argv',['joint_lifecycle','stop','--execute-reviewed']),patch.object(m,'boot'),patch.object(m,'read') as read:
            with self.assertRaisesRegex(RuntimeError,'EXTERNAL_BINDING_DIGEST'):m.main()
            read.assert_not_called()
    def test_concurrent_lock_refused(self):
        with patch.object(m,'ROOT',self.root),patch.object(m,'private_dir'),\
             patch.object(m.os,'fstat',return_value=types.SimpleNamespace(st_mode=0o100600,st_nlink=1,st_uid=1100,st_gid=1100)):
            fd=m.instance_lock()
            try:
                with self.assertRaisesRegex(RuntimeError,'LIFECYCLE_BUSY'):m.instance_lock()
            finally:os.close(fd)

class CacheTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name).resolve();self.rows={}
        route=cache.ROUTES['icon.svg'];self.prefix=cache.PREFIX+'/APP_ROUTE/'+route+'/$/icon.svg'
        for suffix,raw in [('.body',b'<svg/>'),('.meta',b'{"headers":{},"routeCache":{"isFallback":false}}')]:
            seed=cache.SEED+'/icon.svg'+suffix;self.put(seed,raw)
            self.rows[seed]={'sha256':hashlib.sha256(raw).hexdigest()}
            self.put(self.prefix+suffix,raw if suffix=='.body' else b'{"headers":{},"routeCache":{"isFallback":false},"routeCacheLastModified":1}')
    def tearDown(self):self.temp.cleanup()
    def put(self,name,raw):
        p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True)
        for d in [p.parent,*p.parent.parents]:
            if d==self.root:break
            d.chmod(0o700)
        p.write_bytes(raw);p.chmod(0o600);return p
    def test_exact_public_seed_promotion(self):
        extra,proof=cache.promoted_rows(self.root,self.rows,consumer)
        self.assertEqual(len(extra),2);self.assertFalse(proof['compiledManifestChanged'])
    def test_type_substitution_is_rejected(self):
        p=self.root/(self.prefix+'.meta');p.write_text('{"headers":{},"routeCache":{"isFallback":0},"routeCacheLastModified":1}')
        with self.assertRaisesRegex(RuntimeError,'METADATA_DIFFERS'):cache.promoted_rows(self.root,self.rows,consumer)
    def test_changed_body_and_missing_pair_rejected(self):
        p=self.root/(self.prefix+'.body');p.write_bytes(b'changed')
        with self.assertRaisesRegex(RuntimeError,'BODY_DIFFERS'):cache.promoted_rows(self.root,self.rows,consumer)
        p.unlink()
        with self.assertRaisesRegex(RuntimeError,'INCOMPLETE_PROMOTION'):cache.promoted_rows(self.root,self.rows,consumer)
    def test_link_is_not_followed(self):
        p=self.root/(self.prefix+'.body');p.unlink();p.symlink_to(self.root/(cache.SEED+'/icon.svg.body'))
        with self.assertRaisesRegex(RuntimeError,'OWNER_OR_CANONICAL_PATH'):cache.promoted_rows(self.root,self.rows,consumer)
    def test_unbounded_directory_is_refused_during_enumeration(self):
        directory=self.root/cache.PREFIX
        for i in range(40):(directory/('extra'+str(i))).mkdir(mode=0o700)
        with self.assertRaisesRegex(RuntimeError,'TREE_BOUND'):cache.promoted_rows(self.root,self.rows,consumer)

class HostTests(unittest.TestCase):
    def setUp(self):
        host.state.clear();host.state.update(guestPid=123,guestStartTicks='456',event='r1',action='restart',phase='switch-post-verify')
    def terminal(self,value):
        with patch.object(host,'save'):host.handle_line(json.dumps(value).encode(),None)
    def test_success_requires_exact_receipt(self):
        with self.assertRaisesRegex(host.Failure,'GUEST_SUCCESS_RECEIPT'):self.terminal({'status':'JOINT_LIFECYCLE_RUNNING'})
        self.terminal({'status':'JOINT_LIFECYCLE_RUNNING','path':host.ROOT+'/events/r1/result.json','sha256':'a'*64})
    def test_phase_cannot_skip_or_repeat(self):
        host.state.pop('phase');host.transition('prepare')
        with self.assertRaisesRegex(host.Failure,'BUDGET_PHASE_ORDER'):host.transition('switch-post-stop')
        host.transition('switch-pre-stop');host.transition('switch-post-stop');host.transition('switch-post-verify')
        with self.assertRaisesRegex(host.Failure,'BUDGET_PHASE_ORDER'):host.transition('switch-post-verify')
    def test_stop_cannot_request_budget(self):
        host.state.update(action='stop');host.state.pop('phase')
        with self.assertRaisesRegex(host.Failure,'BUDGET_PHASE_ORDER'):host.transition('prepare')
    def test_protocol_requires_same_controller_owner(self):
        msg={'status':'NEED_BUDGET','protocol':host.PROTOCOL,'requestId':'r1:prepare','phase':'prepare','starting':True,'bootId':host.BOOT,'guestPid':999,'guestStartTicks':'456'}
        with self.assertRaisesRegex(host.Failure,'REQUEST_BINDING'):host.reply_budget(msg,None)
    def test_hardlink_delivery_input_refused(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d).resolve()/'input';p.write_bytes(b'public');p.chmod(0o600)
            os.link(p,p.with_name('alias'))
            with self.assertRaisesRegex(host.Failure,'HOST_INPUT_METADATA'):host.read(p)
    def test_joint_budget_calls_real_delivered_reader_with_retention_limit(self):
        # Exercise the actual transitive reader, not a stub returning a policy.
        with tempfile.TemporaryDirectory() as d:
            root=Path(d).resolve(); roots=[]
            for i in range(375):
                p=root/str(i);p.mkdir();roots.append(str(p))
            roots.append('/Users/lixiaochen/Library/Caches/lima')
            raw=(HERE/'delivery_host.py').read_bytes()
            host.state['pins']={'files':{'delivery_host.py':{'sha256':host.sha(raw)}},'budgetRootPaths':roots}
            captured={}; modules=[]; original_factory=types.ModuleType
            def factory(name):
                module=original_factory(name);modules.append(module);return module
            def save(name,value):captured[name]=value
            with patch.object(host,'OP',Path(roots[0])),patch.object(host.types,'ModuleType',side_effect=factory),patch.object(host,'save',side_effect=save),patch.object(host,'own_run',return_value=types.SimpleNamespace(returncode=0,stderr=b'',stdout=b'EXCLUSIVE_0600_VERIFIED\n')):
                reader=host.load_budget_host()
                with patch.object(modules[0],'bounded',return_value=(0,b'4',b'')):
                    digest=reader.budget('prepare',host.INPUT,64*1024**2)
                    for allowance in (25*1024**3,49*1024**3//2):
                        host.state['approvedHostLimitBytes']=allowance
                        digest=reader.budget('prepare',host.INPUT,64*1024**2)
                        self.assertEqual(json.loads(captured['prepare.budget.json'])['limit'],allowance)
                    for invalid in (True,26*1024**3,float(25*1024**3)):
                        host.state['approvedHostLimitBytes']=invalid
                        with self.assertRaisesRegex(host.Failure,'APPROVED_HOST_LIMIT'):
                            reader.budget('invalid',host.INPUT,64*1024**2)
            result=json.loads(captured['prepare.budget.json'])
            self.assertEqual(digest,host.sha(captured['prepare.budget.json']))
            self.assertEqual(result['limit'],49*1024**3//2)
            self.assertEqual(len(result['rows']),376)
            self.assertEqual(result['reserve'],64*1024**2)


class CandidateContinuationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name).resolve()
        self.event=self.root/'events'/'actual-stop';self.event.mkdir(parents=True)
        self.saved=(m.APP,m.IDENTITY,m.DELTA,m.DELTA_SHA)
        m.ctx.clear()
    def tearDown(self):
        m.APP,m.IDENTITY,m.DELTA,m.DELTA_SHA=self.saved
        self.temp.cleanup()
    def binding(self,target):
        t=m.TARGETS[target]
        return {'kind':'R30_JOINT_APPLICATION_LIFECYCLE_V2','target':target,
                'identity':t['identity'],'application':t['application'],
                'root':str(self.root),'bootId':m.BOOT}
    def stopped(self,source,target,changes=None):
        claim={'event':'actual-stop','action':'stop','identity':m.TARGETS[source]['identity'],
               'bootId':m.BOOT,'bindingSha256':'b'*64,'previousStateSha256':'a'*64}
        raw=json.dumps(claim).encode();(self.event/'claim.json').write_bytes(raw)
        result={**claim,'kind':'JOINT_APPLICATION_LIFECYCLE_RESULT_V1','status':'JOINT_LIFECYCLE_STOPPED',
                'owners':{},'proxyOwner':{'fixture':True},'claimSha256':m.sha(raw)}
        if changes:result.update(changes)
        raw=json.dumps(result).encode();digest=m.sha(raw);path=self.event/'result.json';path.write_bytes(raw)
        (self.root/'state.json').write_text(json.dumps({'path':str(path),'sha256':digest}))
        binding=self.binding(target);binding['predecessor']={'target':source,'path':str(path),'sha256':digest}
        m.ctx.update(binding=binding,args=types.SimpleNamespace(action='start'))
        m.bind_target(binding)
        return digest,result
    def test_forward_and_reverse_require_real_stopped_state(self):
        with patch.object(m,'ROOT',self.root),patch.object(m,'read',side_effect=lambda p,*a:Path(p).read_bytes()):
            for source,target in [('joint3a11','layout5b07'),('layout5b07','joint3a11'),
                                  ('layout5b07','workbook9c412dd'),('workbook9c412dd','layout5b07'),
                                  ('workbook9c412dd','save2e0c191'),('save2e0c191','workbook9c412dd')]:
                digest,result=self.stopped(source,target)
                self.assertEqual(m.state(digest),result)
                self.assertEqual(m.ctx['transitionOrigin']['sha256'],digest)
                self.assertEqual(m.APP,Path(m.TARGETS[target]['application']))
    def test_foreign_running_failed_pending_and_wrong_boot_are_rejected(self):
        with patch.object(m,'ROOT',self.root),patch.object(m,'read',side_effect=lambda p,*a:Path(p).read_bytes()):
            for change in [{'status':'JOINT_LIFECYCLE_RUNNING'}, {'status':'FAILED_PRESERVED'},
                           {'owners':{'api':owner('api')}}, {'unresolvedChildren':['api']},
                           {'errorCode':'CHECK_ERROR'}, {'bootId':'wrong'}, {'claimSha256':''}]:
                digest,_=self.stopped('joint3a11','layout5b07',change)
                with self.assertRaises(RuntimeError):m.state(digest)
            digest,_=self.stopped('joint3a11','layout5b07')
            (self.root/'pending.json').write_text('{}')
            with self.assertRaisesRegex(RuntimeError,'PREDECESSOR_NOT_NORMAL_STOP'):m.state(digest)
    def test_wrong_predecessor_and_nonstart_cannot_adopt(self):
        with patch.object(m,'ROOT',self.root),patch.object(m,'read',side_effect=lambda p,*a:Path(p).read_bytes()):
            for key,value in [('target','layout5b07'),('path','/wrong'),('sha256','f'*64)]:
                digest,_=self.stopped('joint3a11','layout5b07')
                m.ctx['binding']['predecessor'][key]=value
                with self.assertRaisesRegex(RuntimeError,'STOPPED_PREDECESSOR_BINDING'):m.state(digest)
            digest,_=self.stopped('joint3a11','layout5b07');m.ctx['args'].action='stop'
            with self.assertRaisesRegex(RuntimeError,'STOPPED_PREDECESSOR_BINDING'):m.state(digest)
            with self.assertRaisesRegex(RuntimeError,'STALE_STATE_ARGUMENT'):m.state('f'*64)
    def test_new_target_never_falls_back_to_initial_running_receipt(self):
        with patch.object(m,'ROOT',self.root):
            for target in ('layout5b07','workbook9c412dd','save2e0c191'):
                m.bind_target(self.binding(target));m.ctx['binding']=self.binding(target)
                with self.assertRaisesRegex(RuntimeError,'NEW_TARGET_REQUIRES_STATE'):m.state(m.INITIAL_SHA)
    def test_arbitrary_candidate_rejected_and_owner_scope_follows_exact_target(self):
        with patch.object(m,'ROOT',self.root):
            b=self.binding('layout5b07');b['identity']={**b['identity'],'sourceCommit':'f'*40}
            with self.assertRaisesRegex(RuntimeError,'BINDING_SCOPE'):m.bind_target(b)
            m.bind_target(self.binding('layout5b07'))
            good=owner('api');m.validate_owner('api',good)
            good['cwd']=m.TARGETS['joint3a11']['application']+'/apps/api'
            with self.assertRaisesRegex(RuntimeError,'APPLICATION_OWNER_SCOPE'):m.validate_owner('api',good)

class NewBootBindingTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name).resolve()
        self.saved=(m.ROOT,m.BOOT,m.APP,m.IDENTITY,m.DELTA,m.DELTA_SHA)
        m.ROOT=self.root;m.BOOT='589fefa8-c3d5-477d-a597-7303774115c9'
        m.APP=Path(m.TARGETS['menud9d00d2']['application']);m.IDENTITY=m.TARGETS['menud9d00d2']['identity']
        self.old_path=self.root/'events'/'old-running'/'result.json';self.old_path.parent.mkdir(parents=True)
        self.old={'kind':'JOINT_APPLICATION_LIFECYCLE_RESULT_V1','status':'JOINT_LIFECYCLE_RUNNING',
                  'bootId':'9fee751f-120b-451e-9b1b-b17eac34bf98','identity':m.TARGETS['save2e0c191']['identity'],
                  'owners':{'api':{'pid':123},'web':{'pid':124}},'proxyOwner':{'pid':125}}
        self.proxy={'status':'ORIGINAL_PROXY_STARTED_NEW_BOOT','bootId':m.BOOT,'process':{'pid':999}}
        self.proxy_path=Path('/home/recovery/instance/vm-resume-r30-20261102-r02/proxy-start.json')
        self.set_source()
        m.ctx.clear();m.ctx['binding']={'target':'menud9d00d2','runtimeRecovery':{
            'previousState':{'path':str(self.old_path),'sha256':self.digest,'bootId':self.old['bootId'],'target':'save2e0c191'},
            'proxy':{'path':str(self.proxy_path),'sha256':m.sha(m.packed(self.proxy))}}}
        def fixture_read(path,digest=None,maximum=256*1024):
            raw=m.packed(self.proxy) if Path(path)==self.proxy_path else Path(path).read_bytes()
            m.need(digest is None or m.sha(raw)==digest,'PUBLIC_DIGEST');return raw
        self.reader=patch.object(m,'read',side_effect=fixture_read);self.reader.start()
        self.ports=patch.object(m,'listening_ports',return_value=set());self.ports.start()
    def tearDown(self):
        self.reader.stop();self.ports.stop()
        m.ROOT,m.BOOT,m.APP,m.IDENTITY,m.DELTA,m.DELTA_SHA=self.saved;m.ctx.clear();self.tmp.cleanup()
    def set_source(self):
        raw=m.packed(self.old);self.old_path.write_bytes(raw);self.digest=m.sha(raw)
        (self.root/'state.json').write_bytes(m.packed({'path':str(self.old_path),'sha256':self.digest}))
    def operation(self):
        value=m.recovery_origin(self.digest)
        event=self.root/'events'/'recover-newboot';event.mkdir()
        m.ctx.update(event=event,args=types.SimpleNamespace(event=event.name,binding_sha256='b'*64),claimSha256='c'*64)
        (self.root/'pending.json').write_bytes(m.packed({'event':event.name,'claim':str(event/'claim.json'),'claimSha256':'c'*64}))
        return value,event
    def test_old_pid_reuse_is_never_inspected_or_signaled(self):
        with patch.object(m,'current',side_effect=AssertionError('old owner read')),patch.object(m.signal,'pidfd_send_signal',create=True) as send:
            value=m.recovery_origin(self.digest)
        self.assertEqual(value['owners'],{});send.assert_not_called()
        self.assertEqual(m.ctx['recoveryOrigin']['historicalOwners'],self.old['owners'])
        self.assertEqual(m.ctx['recoveryOrigin']['interruptionCause'],'UNKNOWN')
    def test_old_boot_running_cannot_enter_normal_start(self):
        with self.assertRaisesRegex(RuntimeError,'STATE_IDENTITY_OR_BOOT'):m.state(self.digest)
    def test_origin_requires_exact_pointer_and_no_pending(self):
        (self.root/'state.json').write_bytes(m.packed({'path':str(self.old_path),'sha256':'a'*64}))
        with self.assertRaisesRegex(RuntimeError,'RECOVERY_POINTER_CAS'):m.recovery_origin(self.digest)
        self.set_source();(self.root/'pending.json').write_text('{}')
        with self.assertRaisesRegex(RuntimeError,'RECOVERY_ORIGIN_SCOPE'):m.recovery_origin(self.digest)
    def test_non_running_origin_or_application_listener_rejected(self):
        self.old['status']='FAILED_PRESERVED';self.set_source()
        m.ctx['binding']['runtimeRecovery']['previousState']['sha256']=self.digest
        with self.assertRaisesRegex(RuntimeError,'RECOVERY_OLD_RUNNING_SOURCE'):m.recovery_origin(self.digest)
        self.old['status']='JOINT_LIFECYCLE_RUNNING';self.set_source()
        m.ctx['binding']['runtimeRecovery']['previousState']['sha256']=self.digest
        with patch.object(m,'listening_ports',return_value={3591}),self.assertRaisesRegex(RuntimeError,'RECOVERY_APPS_MUST_BE_ABSENT'):
            m.recovery_origin(self.digest)
    def test_publish_keeps_history_and_normal_start_can_read_new_binding(self):
        original=self.old_path.read_bytes();value,event=self.operation()
        with contextlib.redirect_stdout(io.StringIO()):m.finish(value,{'status':'BOOT_RECOVERED','action':'recover-boot','owners':{}})
        pointer=json.loads((self.root/'state.json').read_text());result=json.loads((event/'result.json').read_text())
        self.assertEqual(result['status'],'BOOT_RECOVERED');self.assertEqual(result['bootId'],m.BOOT)
        self.assertEqual(self.old_path.read_bytes(),original);self.assertFalse((self.root/'pending.json').exists())
        m.ctx['args'].action='start'
        self.assertEqual(m.state(pointer['sha256'])['status'],'BOOT_RECOVERED')
    def test_failed_binding_preserves_old_pointer_and_claim_result(self):
        original=(self.root/'state.json').read_bytes();_,event=self.operation()
        with patch.object(m.signal,'pidfd_send_signal',create=True) as send,contextlib.redirect_stdout(io.StringIO()):
            m.preserve_recovery_failure({'status':'FAILED_PRESERVED','errorCode':'CHECK_SCANNER_NOT_READY','owners':{}})
        self.assertEqual((self.root/'state.json').read_bytes(),original);send.assert_not_called()
        self.assertTrue((event/'result.json').exists());self.assertFalse((self.root/'pending.json').exists())
    def test_failed_binding_never_clears_foreign_pending(self):
        _,event=self.operation();(self.root/'pending.json').write_text('{"event":"foreign"}')
        with self.assertRaisesRegex(RuntimeError,'RECOVERY_FAILURE_PENDING_CHANGED'):
            m.preserve_recovery_failure({'status':'FAILED_PRESERVED','owners':{}})
        self.assertTrue((event/'result.json').exists());self.assertTrue((self.root/'pending.json').exists())
    def test_host_recovery_has_only_prepare_phase_and_distinct_success(self):
        host.state.clear();host.state.update(action='recover-boot',event='recover-newboot',guestPid=1)
        host.transition('prepare')
        with self.assertRaisesRegex(host.Failure,'BUDGET_PHASE_ORDER'):host.transition('switch-post-stop')
        with patch.object(host,'save'):
            host.handle_line(json.dumps({'status':'BOOT_RECOVERED','path':host.ROOT+'/events/recover-newboot/result.json','sha256':'a'*64}).encode(),None)

class RecoveryServicesTests(unittest.TestCase):
    def setUp(self):
        self.boot=m.BOOT;m.BOOT='589fefa8-c3d5-477d-a597-7303774115c9';m.ctx.clear()
        directory='/home/recovery/instance/vm-resume-r30-20261102-r02'
        proxy_path=Path('/home/recovery/instance/scanner-handoff-3941bec-r01/proxy.mjs')
        self.pg={'status':'ORIGINAL_POSTGRES_STARTED_NEW_BOOT','bootId':m.BOOT,'noRestoreMigrationSeedOrRepair':True,
            'readback':{'systemId':'7700459308674415750','data':'/var/lib/postgresql/14/main','port':'5432',
            'process':{'pid':111,'uid':109,'startTicks':'10','bootId':m.BOOT}}}
        self.rd={'status':'ORIGINAL_REDIS_STARTED_NEW_BOOT','bootId':m.BOOT,'authenticatedPing':True,
            'noFlushResetRepairOrConfigChanges':True,'process':{'pid':222,'uid':1100,'startTicks':'20','bootId':m.BOOT},
            'settings':{'bind':'127.0.0.1','protected-mode':'yes','appendonly':'yes','appendfsync':'always',
                        'aof-load-truncated':'no','maxmemory-policy':'noeviction'},
            'persistence':{'loading':'0','aof_enabled':'1','aof_last_write_status':'ok'}}
        self.proxy={'status':'ORIGINAL_PROXY_STARTED_NEW_BOOT','bootId':m.BOOT,'proxyPath':str(proxy_path),'proxySha256':m.sha(b'proxy'),
            'process':{'pid':333,'uid':1100,'executable':str(m.NODE),'cwd':'/home/recovery/instance',
                       'launchedArgv':[str(m.NODE),'--max-old-space-size=64',str(proxy_path)]}}
        self.r={'pg':{'path':directory+'/pg-start.json','sha256':'a'*64},
                'redis':{'path':directory+'/redis-start.json','sha256':'b'*64},
                'proxy':{'path':directory+'/proxy-start.json','sha256':'c'*64},
                'scanner':{'root':'/home/recovery/offline-scanner-healthy-20261102-r01',
                    'run':'newboot-healthy-scanner-20261102-r01','refreshPath':'/home/recovery/offline-signatures-20261102-r01/result.json',
                    'handoff':{'path':'/proof','sha256':'d'*64}}}
        m.ctx['binding']={'runtimeRecovery':self.r}
        self.base=types.SimpleNamespace(PROXY=proxy_path,read=lambda *a:b'proxy',matches=lambda *a:True,
            listeners=lambda:[{'port':45464,'family':'tcp','address':'0100007F','inode':'77'}])
        self.handoff=types.SimpleNamespace(load=Mock(return_value={'start':{'process':{'pid':444,'uid':1100,'startTicks':40}},
            'applicability':{'verified':True,'currentRefresh':{'path':self.r['scanner']['refreshPath'],'sha256':'e'*64}}}))
    def tearDown(self):m.BOOT=self.boot;m.ctx.clear()
    def invoke(self, *, wrong_tick=False, socket_link='socket:[77]'):
        def reference(ref,expected,maximum=256*1024):
            self.assertEqual(ref['path'],str(expected))
            return {'pg-start.json':self.pg,'redis-start.json':self.rd,'proxy-start.json':self.proxy}[expected.name]
        def proc_text(path,*a,**k):
            tick='99' if wrong_tick else ('10' if str(path)=='/proc/111/stat' else '20')
            return '111 (process) '+' '.join(['S']+['0']*18+[tick])
        with patch.object(m,'recovery_ref',side_effect=reference),patch.object(m,'load_module',return_value=self.handoff),\
             patch.object(Path,'read_text',proc_text),patch.object(Path,'stat',lambda p,*a,**k:types.SimpleNamespace(st_uid=109 if str(p)=='/proc/111' else 1100)),\
             patch.object(Path,'iterdir',return_value=iter([Path('/proc/333/fd/3')])),patch.object(m.os,'readlink',return_value=socket_link):
            return m.current_recovery_services(types.SimpleNamespace(),{'identity':'base'},self.base,{'proxyOwner':self.proxy['process']})
    def test_current_services_derive_shared_owners_from_actual_receipts(self):
        self.assertEqual(self.invoke(),((111,'10',109),(222,'20',1100),(444,'40',1100)))
        self.handoff.load.assert_called_once();self.assertEqual(m.ctx['currentRecoveryEvidence']['pg'],self.r['pg'])
    def test_data_identity_and_persistence_cannot_be_substituted(self):
        self.pg['readback']['systemId']='different'
        with self.assertRaisesRegex(RuntimeError,'RECOVERY_ORIGINAL_POSTGRES'):self.invoke()
        self.pg['readback']['systemId']='7700459308674415750';self.rd['settings']['aof-load-truncated']='yes'
        with self.assertRaisesRegex(RuntimeError,'RECOVERY_ORIGINAL_REDIS'):self.invoke()
    def test_local_material_is_only_the_current_scanner_import_receipt(self):
        scanner=self.r['scanner'];del scanner['refreshPath']
        scanner['materialPath']=scanner['root']+'/scanner-db/IMPORT-RECEIPT.json'
        with self.assertRaisesRegex(RuntimeError,'RECOVERY_SCANNER_SOURCE_KIND'):self.invoke()
        proof=self.handoff.load.return_value['applicability'];del proof['currentRefresh']
        proof['currentLocalImport']={'path':scanner['materialPath'],'sha256':'f'*64}
        self.assertEqual(self.invoke(),((111,'10',109),(222,'20',1100),(444,'40',1100)))
        scanner['materialPath']='/home/recovery/unrelated/IMPORT-RECEIPT.json'
        with self.assertRaisesRegex(RuntimeError,'RECOVERY_SCANNER_SCOPE'):self.invoke()
    def test_live_pid_reuse_or_wrong_socket_refuses_binding(self):
        with self.assertRaisesRegex(RuntimeError,'RECOVERY_DATA_LIVE_OWNER'):self.invoke(wrong_tick=True)
        with self.assertRaisesRegex(RuntimeError,'RECOVERY_PROXY_SOCKET_OWNER'):self.invoke(socket_link='socket:[foreign]')
    def test_second_scanner_root_requires_its_paired_run(self):
        self.r['scanner']['root']='/home/recovery/offline-scanner-healthy-20261102-r02'
        with self.assertRaisesRegex(RuntimeError,'RECOVERY_SCANNER_SCOPE'):self.invoke()
        self.r['scanner']['run']='newboot-healthy-scanner-20261102-r02'
        self.invoke()

    def test_scanner_scope_and_proxy_recipe_are_fixed(self):
        self.r['scanner']['root']='/home/recovery/arbitrary'
        with self.assertRaisesRegex(RuntimeError,'RECOVERY_SCANNER_SCOPE'):self.invoke()
        self.r['scanner']['root']='/home/recovery/offline-scanner-healthy-20261102-r01'
        self.proxy['process']['launchedArgv']=['unapproved']
        with self.assertRaisesRegex(RuntimeError,'RECOVERY_PROXY_OWNER'):self.invoke()

if __name__=='__main__':unittest.main()
