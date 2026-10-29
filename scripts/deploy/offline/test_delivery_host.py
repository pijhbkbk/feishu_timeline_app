import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('delivery_host',HERE/'delivery_host.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class HostTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name).resolve()/'delivery';self.root.mkdir()
        (self.root/'operations').mkdir();(self.root/'bindings').mkdir();(self.root/'lima').mkdir()
        self.input='/home/recovery/public-input-fixture'
        files={f'operations/{n}':(HERE/n).read_bytes() for n in ('delivery_host.py','delivery_check.py')}
        files.update({f'operations/{n}':b'# fixture only\n' for n in ('prepare_instance.py','instance_policy.py','instance_software.py')})
        files['bindings/config.json']=b'{}\n';files['bindings/selection.json']=b'{}\n'
        policy={'kind':'OFFLINE_HOST_BUDGET_SCOPE_V1','limit':m.LIMIT,'expectedRootPaths':[str(self.root)]}
        files['bindings/policy.json']=json.dumps(policy).encode()
        rows=[]
        for name,raw in files.items():
            (self.root/name).write_bytes(raw); rows.append({'path':name,'bytes':len(raw),'sha256':m.sha(raw)})
        self.manifest={'kind':'R30_MATERIALIZED_SOFTWARE_DELIVERY_V1','applicationIdentity':{'sourceCommit':'3941beccddd0dfce94c8f0f7fd7d62819fb05270'},'files':rows,'entrypoints':{'new-instance-config':{'program':'operations/prepare_instance.py','support':['operations/instance_policy.py','operations/instance_software.py'],'inputs':['bindings/config.json','bindings/selection.json'],'scope':'fixture'}}}
        raw=json.dumps(self.manifest).encode();(self.root/'manifest.json').write_bytes(raw);self.pin=m.sha(raw)
        (self.root/'SHA256SUMS').write_text(''.join(r['sha256']+'  '+r['path']+'\n' for r in rows)+self.pin+'  manifest.json\n')
        # A public transport-file fixture; prepare verifies its bytes but never
        # executes it. The separate bounded-process tests use the real Python.
        cli=self.root.parent/'transport';cli.write_bytes(b'fixture transport\n');cli.chmod(0o600)
        self.binding={'kind':'R30_EXPLICIT_DELIVERY_HOST_V1','lima':{'path':str(cli),'sha256':m.sha(cli.read_bytes()),'home':str(self.root/'lima'),'vm':'fixture-vm'},'guest':{'hostname':'lima-fixture','bootId':'9fee751f-120b-451e-9b1b-b17eac34bf98','input':self.input},'inputFiles':[{'source':f'operations/{n}','guest':self.input+'/'+n} for n in ('prepare_instance.py','instance_policy.py','instance_software.py')]+[{'source':'bindings/config.json','guest':self.input+'/configuration-check-binding.json'},{'source':'bindings/selection.json','guest':'/home/recovery/other-input/selection-plan.json'}],'budgetPolicy':'bindings/policy.json','allowedAbsentBudgetRoots':[],'invocations':{'new-instance-config':['--check-native-admission','--binding',self.input+'/configuration-check-binding.json','--binding-sha256',m.sha(b'{}\n')]}}
    def tearDown(self):self.temp.cleanup()
    def prepare(self,b=None):
        with patch.object(m,'budget',return_value={'fixture':True}):
            return m.prepare(self.root,self.pin,b or self.binding,'new-instance-config',True)
    def test_delivered_inputs_resolve_from_unrelated_cwd(self):
        old=Path.cwd()
        try:
            os.chdir('/')
            out=self.prepare();self.assertEqual(out[0]['files'],8)
            self.assertIn('/home/recovery/other-input/selection-plan.json',out[2])
        finally:os.chdir(old)
    def test_missing_transitive_support_refused(self):
        b=copy.deepcopy(self.binding);b['inputFiles'].pop(1)
        with self.assertRaisesRegex(RuntimeError,'ENTRY_INPUT_CLOSURE'):self.prepare(b)
    def test_different_code_and_unknown_file_refused(self):
        (self.root/'operations/prepare_instance.py').write_bytes(b'changed')
        with self.assertRaisesRegex(RuntimeError,'FILE_SIZE'):self.prepare()
    def test_preflight_cannot_dispatch_generation(self):
        b=copy.deepcopy(self.binding);b['invocations']['new-instance-config'][0]='--execute'
        with self.assertRaisesRegex(RuntimeError,'READONLY_PREFLIGHT_COMMAND'):self.prepare(b)
    def test_guest_mapping_path_escape_refused(self):
        b=copy.deepcopy(self.binding);b['inputFiles'][0]['guest']='/home/recovery/x/../private.py'
        with self.assertRaisesRegex(RuntimeError,'INPUT_MAPPING'):self.prepare(b)
    def test_wrong_transport_sha_refused(self):
        b=copy.deepcopy(self.binding);b['lima']['sha256']='0'*64
        with self.assertRaisesRegex(RuntimeError,'INPUT_SHA256'):self.prepare(b)
    def test_duplicate_json_key_refused(self):
        with self.assertRaisesRegex(RuntimeError,'DUPLICATE_JSON_KEY'):m.decode(b'{"x":1,"x":2}')
    def test_budget_preserves_explicit_absent_denominator(self):
        absent=self.root/'absent-cache'
        p={'kind':'OFFLINE_HOST_BUDGET_SCOPE_V1','limit':m.LIMIT,'expectedRootPaths':[str(self.root),str(absent)]}
        r=m.budget(p,self.root,[str(absent)])
        self.assertEqual(len(r['rows']),2);self.assertEqual(r['rows'][1]['allocatedBytes'],0)
        self.assertFalse(r['scopeNarrowed'])
        with self.assertRaises(FileNotFoundError):m.budget(p,self.root,[])
    def test_transport_failure_and_output_bound(self):
        code,out,err=m.bounded([sys.executable,'-I','-B','-c','import sys;print("public");sys.exit(3)'],{'PATH':'/usr/bin:/bin'},self.root,3,64)
        self.assertEqual((code,out,err),(3,b'public\n',b''))
        with self.assertRaisesRegex(RuntimeError,'TRANSPORT_OUTPUT_BOUND'):
            m.bounded([sys.executable,'-I','-B','-c','print("x"*4096)'],{'PATH':'/usr/bin:/bin'},self.root,3,64)
    def test_transport_deadline_stops_owned_process(self):
        with self.assertRaisesRegex(RuntimeError,'TRANSPORT_TIMEOUT'):
            m.bounded([sys.executable,'-I','-B','-c','import time;time.sleep(5)'],{'PATH':'/usr/bin:/bin'},self.root,.1,64)
    def test_closed_pipes_timeout_preserves_output(self):
        with self.assertRaises(m.TransportFailure) as caught:
            m.bounded([sys.executable,'-I','-B','-c','import os,time;os.write(1,b"before-close");os.close(1);os.close(2);time.sleep(5)'],{'PATH':'/usr/bin:/bin'},self.root,.2,64)
        self.assertEqual(str(caught.exception),'CHECK_TRANSPORT_TIMEOUT')
        self.assertEqual(caught.exception.stdout,b'before-close')

if __name__=='__main__':unittest.main()
