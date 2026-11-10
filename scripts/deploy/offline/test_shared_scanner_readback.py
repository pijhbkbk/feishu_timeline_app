"""Read-only wrapper budget forwarding; no Linux service actions."""
import contextlib
import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

spec=importlib.util.spec_from_file_location('shared_scanner',Path(__file__).with_name('shared_scanner_readback.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ReadOnlyBudget(unittest.TestCase):
    def invoke(self,reject=False):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td).resolve();source=root/'scanner.py';raw=b'# synthetic reference\n';source.write_bytes(raw)
            scanner=types.ModuleType('fixture')
            for name in ('configure_target','directory','data_baseline','fixed_owners','prepared','resources','verify','cleanup','stop'):
                setattr(scanner,name,Mock())
            scanner.need=lambda ok,code:None if ok else (_ for _ in ()).throw(RuntimeError(code))
            scanner.platform=types.SimpleNamespace(machine=lambda:'aarch64')
            scanner.os=types.SimpleNamespace(getuid=lambda:1100,getgid=lambda:1100,umask=lambda n:None)
            scanner.digest=lambda v:v;scanner.now=lambda:'fixture';scanner.joint_check=lambda:{};scanner.pins=lambda:{}
            scanner.write_new=Mock(return_value='a'*64);scanner.REPORT={};scanner.IDENTITY={};scanner.PIN_SHA='a'*64
            scanner.BOOT='fixture';scanner.CONFIG_SHA='a'*64;scanner.WINDOW_BYTES=1;scanner.SCANNER=root
            scanner.EVENTS=root;scanner.LOGS=root;scanner.OFFLINE=root;scanner.package=lambda:({}, {})
            scanner.budget=Mock(side_effect=RuntimeError('CHECK_BUDGET') if reject else None)
            args=types.SimpleNamespace(target_sha256='a'*64,content_sha256='b'*64,budget_sha256='c'*64,
                preparation_sha256='d'*64,start_sha256='e'*64,event='resume-fixture',run='fixture',approved_host_limit_bytes=25*1024**3)
            with patch.object(m,'SOURCE',source),patch.object(m,'SOURCE_SHA',hashlib.sha256(raw).hexdigest()),                 patch.object(m.types,'ModuleType',return_value=scanner),patch.object(m.sys,'platform','linux'),contextlib.redirect_stdout(io.StringIO()):
                if reject:
                    with self.assertRaisesRegex(RuntimeError,'CHECK_BUDGET'):m.observe(args)
                else:m.observe(args)
            scanner.budget.assert_called_once_with(approved_limit=25*1024**3)
            scanner.cleanup.assert_not_called();scanner.stop.assert_not_called()
            return scanner
    def test_explicit_25_reaches_actual_budget(self):self.invoke().verify.assert_called_once()
    def test_rejected_budget_does_not_verify_or_stop_shared_service(self):
        scanner=self.invoke(True);scanner.verify.assert_not_called()
        self.assertEqual(scanner.REPORT['status'],'SHARED_SCANNER_READBACK_FAILED_NO_SERVICE_ACTION')

if __name__=='__main__':unittest.main()
