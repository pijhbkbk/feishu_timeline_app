"""Integrity boundary tests for a new standalone delivery root, no VM access."""
import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('delivery',Path(__file__).with_name('delivery_check.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name).resolve()
        (self.root/'ops').mkdir();(self.root/'ops/run.py').write_bytes(b'# public fixture\n')
        raw=(self.root/'ops/run.py').read_bytes()
        self.row={'path':'ops/run.py','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
        self.manifest={'kind':'R30_MATERIALIZED_SOFTWARE_DELIVERY_V1',
            'applicationIdentity':{'sourceCommit':'3941beccddd0dfce94c8f0f7fd7d62819fb05270'},
            'files':[self.row],'entrypoints':{'check':{'program':'ops/run.py','support':[],'inputs':[],'scope':'fixture'}}}
        self.write_manifest()
    def tearDown(self):self.temp.cleanup()
    def write_manifest(self):
        raw=json.dumps(self.manifest).encode();(self.root/'manifest.json').write_bytes(raw)
        self.sha=hashlib.sha256(raw).hexdigest()
        (self.root/'SHA256SUMS').write_text(self.row['sha256']+'  ops/run.py\n'+self.sha+'  manifest.json\n')
    def test_complete_delivery_from_unrelated_cwd(self):
        with patch.object(m.os,'getcwd',side_effect=AssertionError('no cwd discovery')):
            r=m.check(self.root,self.sha)
        self.assertEqual(r['files'],1);self.assertFalse(r['filesWritten']);self.assertFalse(r['sourceCheckoutRead'])
    def test_tampered_bytes_and_manifest_pin_are_rejected(self):
        with self.assertRaisesRegex(RuntimeError,'FILE_SHA256'):m.check(self.root,'0'*64)
        (self.root/'ops/run.py').write_bytes(b'X'*self.row['bytes'])
        with self.assertRaisesRegex(RuntimeError,'FILE_SHA256'):m.check(self.root,self.sha)
    def test_missing_declared_support_is_not_a_complete_delivery(self):
        self.manifest['entrypoints']['check']['support']=['ops/missing.py'];self.write_manifest()
        with self.assertRaisesRegex(RuntimeError,'MISSING_ENTRYPOINT_FILE'):m.check(self.root,self.sha)
    def test_unknown_private_or_link_additions_are_rejected(self):
        p=self.root/'unlisted';p.write_bytes(b'not part of delivery')
        with self.assertRaisesRegex(RuntimeError,'UNLISTED_OR_MISSING_FILE'):m.check(self.root,self.sha)
        p.unlink();p.symlink_to('/outside')
        with self.assertRaisesRegex(RuntimeError,'EXTRA_SYMLINK'):m.check(self.root,self.sha)
    def test_source_escape_and_changed_checksum_set_rejected(self):
        for name in ('../source','/absolute','a//b','a/./b'):
            with self.assertRaisesRegex(RuntimeError,'RELATIVE_PATH'):m.relative(name)
        (self.root/'SHA256SUMS').write_text(self.sha+'  manifest.json\n')
        with self.assertRaisesRegex(RuntimeError,'CHECKSUM_SET'):m.check(self.root,self.sha)
    def test_unreadable_extra_tree_cannot_disappear_from_closed_set(self):
        def denied(*args,**kwargs):
            kwargs['onerror'](PermissionError('fixture inaccessible subtree'))
            return iter(())
        with patch.object(m.os,'walk',side_effect=denied):
            with self.assertRaisesRegex(RuntimeError,'TREE_READ_ERROR'):m.check(self.root,self.sha)

    def test_delta_cannot_pass_as_standalone_or_retag_an_old_package(self):
        self.manifest.update(kind='R30_MATERIALIZED_APPLICATION_DELTA_DELIVERY_V1',
                             applicationIdentity=m.JOINT_IDENTITY.copy(),
                             requiredBaseDeliveryManifestSha256=m.JOINT_BASE_DELIVERY,
                             standalone=False)
        self.write_manifest()
        with self.assertRaisesRegex(RuntimeError,'JOINT_INPUT_CLOSURE'):m.check(self.root,self.sha)
        for field,value in [('standalone',True),('requiredBaseDeliveryManifestSha256','0'*64),
                            ('applicationIdentity',{'sourceCommit':m.JOINT_IDENTITY['sourceCommit']})]:
            old=self.manifest[field];self.manifest[field]=value;self.write_manifest()
            with self.assertRaisesRegex(RuntimeError,'JOINT_MANIFEST_CONTRACT'):m.check(self.root,self.sha)
            self.manifest[field]=old

    def test_delta_requires_delivered_inputs_and_the_exact_consumer_entry(self):
        names=[*m.JOINT_INPUTS,'INSTALL.md','operations/delivery_check.py']
        rows=[]
        for name in names:
            p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'public fixture '+name.encode())
            raw=p.read_bytes();rows.append({'path':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
        self.manifest.update(kind='R30_MATERIALIZED_APPLICATION_DELTA_DELIVERY_V1',
            applicationIdentity=m.JOINT_IDENTITY.copy(),requiredBaseDeliveryManifestSha256=m.JOINT_BASE_DELIVERY,
            standalone=False,files=[self.row,*rows])
        entry={'program':'operations/application_delta.py','support':[],
               'inputs':['delta/manifest.json','delta/application-delta.tar.gz','inputs/base-application-manifest.json'],
               'scope':'check/assemble/verify exact base plus delta; no service or database actions'}
        self.manifest['entrypoints']['application-delta']=entry
        pins={r['path']:r['sha256'] for r in rows if r['path'] in m.JOINT_INPUTS}
        def materialize():
            self.write_manifest()
            (self.root/'SHA256SUMS').write_text(''.join(r['sha256']+'  '+r['path']+'\n' for r in self.manifest['files'])+self.sha+'  manifest.json\n')
        with patch.object(m,'JOINT_INPUTS',pins):
            materialize();result=m.check(self.root,self.sha)
            self.assertFalse(result['baseDeliveryContentsVerifiedByThisCheck'])
            self.assertEqual(result['requiredBaseDeliveryManifestSha256'],m.JOINT_BASE_DELIVERY)
            entry['inputs'].remove('delta/application-delta.tar.gz');materialize()
            with self.assertRaisesRegex(RuntimeError,'JOINT_ENTRYPOINT_CONTRACT'):m.check(self.root,self.sha)

    def test_layout_identity_cannot_retag_previous_delta(self):
        self.check_identity_cannot_retag_previous_delta(m.LAYOUT_IDENTITY,'LAYOUT_INPUTS')

    def test_workbook_identity_cannot_retag_previous_delta(self):
        self.check_identity_cannot_retag_previous_delta(m.WORKBOOK_IDENTITY,'WORKBOOK_INPUTS')

    def test_save_identity_cannot_retag_previous_delta(self):
        self.check_identity_cannot_retag_previous_delta(m.SAVE_IDENTITY,'SAVE_INPUTS')

    def test_menu_identity_cannot_retag_previous_delta(self):
        self.check_identity_cannot_retag_previous_delta(m.MENU_IDENTITY,'MENU_INPUTS')

    def test_menu_save_identity_cannot_retag_previous_delta(self):
        self.check_identity_cannot_retag_previous_delta(m.MENU_SAVE_IDENTITY,'MENU_SAVE_INPUTS')

    def check_identity_cannot_retag_previous_delta(self,new_identity,pins_name):
        names=[*m.JOINT_INPUTS,'INSTALL.md','operations/delivery_check.py']
        rows=[];payloads={}
        for name in names:
            raw=b'old public fixture '+name.encode();payloads[name]=raw
            p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
            rows.append({'path':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
        oldpins={r['path']:r['sha256'] for r in rows if r['path'] in m.JOINT_INPUTS}
        changed=['delta/manifest.json','delta/application-delta.tar.gz','inputs/composite-application-manifest.json']
        newpins={**oldpins,**{name:hashlib.sha256(b'new '+payloads[name]).hexdigest() for name in changed}}
        self.manifest.update(kind='R30_MATERIALIZED_APPLICATION_DELTA_DELIVERY_V1',
            applicationIdentity=m.JOINT_IDENTITY.copy(),requiredBaseDeliveryManifestSha256=m.JOINT_BASE_DELIVERY,
            standalone=False,files=[self.row,*rows])
        self.manifest['entrypoints']['application-delta']={
            'program':'operations/application_delta.py','support':[],
            'inputs':['delta/manifest.json','delta/application-delta.tar.gz','inputs/base-application-manifest.json'],
            'scope':'check/assemble/verify exact base plus delta; no service or database actions'}
        def materialize():
            self.write_manifest()
            (self.root/'SHA256SUMS').write_text(''.join(r['sha256']+'  '+r['path']+'\n' for r in self.manifest['files'])+self.sha+'  manifest.json\n')
        with patch.object(m,'JOINT_INPUTS',oldpins),patch.object(m,pins_name,newpins):
            materialize();m.check(self.root,self.sha)
            self.manifest['applicationIdentity']=new_identity.copy();materialize()
            with self.assertRaisesRegex(RuntimeError,'JOINT_INPUT_CLOSURE'):m.check(self.root,self.sha)
            for row in rows:
                if row['path'] in changed:
                    raw=b'new '+payloads[row['path']];(self.root/row['path']).write_bytes(raw)
                    row.update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
            materialize();m.check(self.root,self.sha)
            self.manifest['applicationIdentity']['buildTime']=m.JOINT_IDENTITY['buildTime'];materialize()
            with self.assertRaisesRegex(RuntimeError,'JOINT_MANIFEST_CONTRACT'):m.check(self.root,self.sha)

if __name__=='__main__':unittest.main()
