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

if __name__=='__main__':unittest.main()
