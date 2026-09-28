import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
from contextlib import ExitStack, contextmanager
import native_backup_controller as backup
import build_native_r28_patch_bundle as bundle
import native_release as release
import native_release_r28 as migration
import native_release_r28_patch as program


class ReleaseInstallerTests(unittest.TestCase):
    def load_installer(self):
        spec = importlib.util.spec_from_file_location('fixed_installer_test', bundle.HERE / 'release-tools/r28-patch-install-template.py')
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        return module

    @contextmanager
    def fixture(self):
        installer = self.load_installer()
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            root = Path(directory); ops = root / 'ops'; state = root / 'state'; units = root / 'units'
            for folder in (ops, state, units): folder.mkdir(mode=0o700)
            # Use both real controller generations, including their actual imports,
            # so interruption tests detect a c5-disappearing mixed-install state.
            previous = {name: subprocess.check_output(['git', '-C', str(bundle.HERE), 'show',
                '7f509fccc05258b3f61bef69b93be52137c554ec:scripts/deploy/gce-host/' + name]) for name in bundle.EXPECTED}
            old_module = previous['native_release.py']
            for name, raw in previous.items(): (ops / name).write_bytes(raw); (ops / name).chmod(0o644)
            unit_raw = b'[Service]\nType=oneshot\n'
            for name in bundle.EXPECTED_UNITS:
                (units / name).write_bytes(unit_raw); (units / name).chmod(0o644)
            stable = {'version': 1, 'active': installer.BASE, 'committed': installer.BASE, 'pending': False}
            state_file = state / 'release-6c70-state.json'; state_file.write_text(json.dumps(stable)); state_file.chmod(0o600)
            # Historical successful and failed facts exist, and must survive unchanged.
            history = ('controller-install-20260917.json', 'controller-socket-fix-20260917.json',
                       'controller-socket-fix-20260917-complete.json', 'release-20260917-checkpoint.json',
                       'release-20260917-recovery-proof.json', 'release-20260917-update-proof.json',
                       'api-login-20260918.env', 'web-login-20260918.env',
                       'controller-install-login-20260918.json', 'release-login-20260918-recovery-proof.json', 'release-login-20260918-update-proof.json')
            for name in history: (state / name).write_bytes(b'synthetic retained history\n')
            payload = {name: {'text': (bundle.HERE / name).read_text()} for name in bundle.NAMES}
            target = bundle.TARGET
            for item in payload.values(): item['sha256'] = hashlib.sha256(item['text'].encode()).hexdigest()
            for key, value in [('OPS', ops), ('ROOT', state), ('UNITS', units), ('SAVED', state / 'saved'),
                               ('JOURNAL', state / 'journal.json'), ('TARGET_ID', target['commit']), ('PAYLOAD', payload),
                               ('EXPECTED', {n: hashlib.sha256(raw).hexdigest() for n, raw in previous.items()}),
                               ('EXPECTED_UNITS', {n: hashlib.sha256(unit_raw).hexdigest() for n in bundle.EXPECTED_UNITS})]:
                stack.enter_context(patch.object(installer, key, value))
            # Local filesystem durability is real; root ownership/host services are
            # replaced only in this synthetic fixture and verified separately.
            stack.enter_context(patch.object(installer, 'directory'))
            stack.enter_context(patch.object(installer, 'read', side_effect=lambda path, mode=0o644: path.read_bytes()))
            stack.enter_context(patch.object(installer, 'idle_release_units'))
            stack.enter_context(patch.object(installer.os, 'geteuid', return_value=0))
            stack.enter_context(patch.object(installer.socket, 'gethostname', return_value='instance-20260408-091840'))
            stack.enter_context(patch.object(backup, 'locked'))
            original_regular = backup.regular
            stack.enter_context(patch.object(backup, 'regular', side_effect=lambda fd,n,owner=None: original_regular(fd,n,owner=os.getuid())))
            stack.enter_context(patch.object(backup, 'read_json', side_effect=lambda path: json.loads(path.read_text())))
            stack.enter_context(patch('builtins.print'))
            stack.enter_context(patch.object(release, 'ROOT', state))
            stack.enter_context(patch.object(release, 'STATE', state_file))
            stack.enter_context(patch.object(program, 'ROOT', state))
            stack.enter_context(patch.object(program, 'HEAD', state / 'r28-program-patch-head.json'))
            stack.enter_context(patch.object(program, 'anchor'))
            stack.enter_context(patch.object(migration, 'journal', return_value={'phase':'OPEN_41'}))
            stack.enter_context(patch.object(migration, 'migration_state'))
            stack.enter_context(patch.object(migration, 'schema_state'))
            original_read = backup.read_file
            stack.enter_context(patch.object(backup, 'read_file', side_effect=lambda p,m,owner=None: original_read(p,m,owner=os.getuid())))
            stack.enter_context(patch.object(backup, 'fsync_dir'))
            def current():
                # Fresh interpreter: no cached module may hide an incomplete install.
                script = """
import json,os,sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
import native_backup_controller as b
import native_release as r
import native_runtime_app as app
import native_release_r28 as m
root=Path(sys.argv[2]); r.ROOT=root; r.STATE=root/'release-6c70-state.json'
read=b.read_file
b.read_file=lambda p,n,owner=None:read(p,n,owner=os.getuid())
assert r.current()['commit']==m.TARGET['commit']
assert r.environment_path('api')==root/'api-r28-20260928.env'
m.journal=lambda:{'phase':'OPEN_41'}
m.migration_state=lambda count:None
m.schema_state=lambda count:None
if 'native_release_r28_patch import assert_start' in (Path(sys.argv[1])/'native_runtime_app.py').read_text():
 import native_release_r28_patch as p
 p.ROOT=root;p.HEAD=root/'r28-program-patch-head.json';p.anchor=lambda:None
 p.assert_start(m.TARGET['commit'])
else:m.assert_start(m.TARGET['commit'])
"""
                child = subprocess.Popen([sys.executable, '-B', '-c', script, str(ops), str(state)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
                output, _ = child.communicate(timeout=15)
                self.assertEqual(child.returncode, 0, output.decode())
            def check_committed(command, **kwargs):
                self.assertEqual(command, ['/usr/bin/python3', '-I', str(ops / 'native_cutover.py'), 'check-committed'])
                try: current()
                except AssertionError as error: raise RuntimeError('Fresh-process startup rejected') from error
                return types.SimpleNamespace(returncode=0)
            stack.enter_context(patch.object(installer.subprocess, 'run', side_effect=check_committed))
            yield installer, state_file, stable, old_module, current, history

    def assert_retained(self, installer, state_file, stable, old_module, history):
        self.assertEqual(json.loads(state_file.read_text()), stable)
        self.assertEqual((installer.SAVED / 'native_release.py').read_bytes(), old_module)
        self.assertEqual(hashlib.sha256((installer.SAVED / 'native_cutover.py').read_bytes()).hexdigest(), installer.EXPECTED['native_cutover.py'])
        for name in history: self.assertEqual((installer.ROOT / name).read_bytes(), b'synthetic retained history\n')
        for name, item in installer.PAYLOAD.items(): self.assertEqual((installer.OPS / name).read_text(), item['text'])

    def test_each_partial_or_durable_write_interruption_keeps_29ed_and_resumes(self):
        for point in range(1, 12):
            for partial in (False, True):
                with self.subTest(point=point, partial=partial), self.fixture() as (installer, state_file, stable, old_module, current, history):
                    write = installer.write; count = 0
                    def interrupted(path, raw, mode):
                        nonlocal count
                        count += 1
                        if count == point and partial:
                            write(path, raw[:max(1, len(raw) // 2)], mode)
                            raise KeyboardInterrupt('Synthetic mid-write interruption')
                        write(path, raw, mode)
                        if count == point: raise KeyboardInterrupt('Synthetic durable-write interruption')
                    with patch.object(installer, 'write', side_effect=interrupted):
                        with self.assertRaises(KeyboardInterrupt): installer.main()
                    current()
                    installer.main(); installer.main()
                    self.assert_retained(installer, state_file, stable, old_module, history)

    def test_each_atomic_activation_interruption_keeps_29ed_and_resumes(self):
        for point in range(1, 13):
            with self.subTest(point=point), self.fixture() as (installer, state_file, stable, old_module, current, history):
                replace = installer.os.replace; count = 0
                def interrupted(source, destination):
                    nonlocal count
                    replace(source, destination); count += 1
                    current()
                    if count == point: raise KeyboardInterrupt('Synthetic post-activation interruption')
                with patch.object(installer.os, 'replace', side_effect=interrupted):
                    with self.assertRaises(KeyboardInterrupt): installer.main()
                current()
                installer.main(); installer.main()
                self.assert_retained(installer, state_file, stable, old_module, history)

    def test_base_event_without_head_never_activates_new_gates_or_resets_history(self):
        with self.fixture() as (installer, state_file, stable, old_module, current, history):
            write = backup.write_json
            def interrupted(path, value):
                write(path, value)
                if path == program.event_path('BASE'): raise KeyboardInterrupt('killed before BASE head')
            with patch.object(backup, 'write_json', side_effect=interrupted):
                with self.assertRaises(KeyboardInterrupt): installer.main()
            self.assertTrue(program.event_path('BASE').exists())
            self.assertFalse(program.HEAD.exists())
            current()  # previous gates still start the unchanged stable program
            with self.assertRaisesRegex(backup.Failure,'Unheaded'): installer.main()
            for name in ('native_release_backup.py','native_runtime_app.py','native_cutover.py','native_release.py'):
                self.assertEqual(hashlib.sha256((installer.OPS/name).read_bytes()).hexdigest(),installer.EXPECTED[name])

    def test_unsafe_state_or_new_attempt_prevents_every_write(self):
        for mode in ('pending', '6c70', 'unknown', 'checkpoint.json', 'recovery-proof.json', 'update-proof.json', 'rollback-proof.json'):
            with self.subTest(mode=mode), self.fixture() as (installer, state_file, stable, _, _, _):
                if mode == 'pending': state_file.write_text(json.dumps({**stable, 'pending': True}))
                elif mode in ('6c70', 'unknown'):
                    state_file.write_text(json.dumps({**stable, 'active': mode, 'committed': mode}))
                else: (installer.ROOT / ('release-r28-ui-patch-20260928-' + mode)).write_text('{}')
                with patch.object(installer, 'write') as write:
                    with self.assertRaises(RuntimeError): installer.main()
                    write.assert_not_called()

    def test_unknown_or_unjournaled_controller_or_target_prevents_every_write(self):
        for mode in ('controller', 'old-target', 'new-target', 'new-controller-no-journal', 'new-target-no-journal', 'journal'):
            with self.subTest(mode=mode), self.fixture() as (installer, _, _, _, _, _):
                if mode == 'controller': (installer.OPS / 'native_release.py').write_text('UNKNOWN=True\n')
                elif mode == 'old-target': (installer.OPS / 'native_release_target.py').write_text('TARGET=None\n')
                elif mode == 'new-target': (installer.OPS / installer.TARGET_MODULE).write_text('TARGET=None\n')
                elif mode == 'new-controller-no-journal':
                    for name, item in installer.PAYLOAD.items(): (installer.OPS / name).write_text(item['text'])
                elif mode == 'new-target-no-journal':
                    (installer.OPS / installer.TARGET_MODULE).write_text(installer.PAYLOAD[installer.TARGET_MODULE]['text'])
                else: installer.JOURNAL.write_text('{}')
                with patch.object(installer, 'write') as write:
                    with self.assertRaises(RuntimeError): installer.main()
                    write.assert_not_called()

    def test_only_target_then_controller_are_installed(self):
        self.assertEqual(bundle.NAMES, ('native_release_target_r28_patch.py', 'native_release_r28_patch.py', 'native_release_backup.py', 'native_runtime_app.py', 'native_cutover.py', 'native_release.py'))
        self.assertIn('native_release_target.py', bundle.EXPECTED)
        self.assertIn('native_release_backup.py', bundle.EXPECTED)

    def test_idle_unit_guard_preserves_failed_history_but_rejects_live_or_overridden_unit(self):
        installer = self.load_installer()
        def output(command, **kwargs):
            unit = command[2]
            value = {'ActiveState': 'failed', 'MainPID': '0', 'ControlPID': '0',
                     'FragmentPath': str(installer.UNITS / unit), 'DropInPaths': '', 'NeedDaemonReload': 'no'}
            value.update(changed)
            return types.SimpleNamespace(stdout=('\n'.join(k + '=' + v for k, v in value.items()) + '\n').encode())
        changed = {}
        with patch.object(installer.subprocess, 'run', side_effect=output): installer.idle_release_units()
        for key, value in [('ActiveState', 'active'), ('MainPID', '23'), ('ControlPID', '23'), ('FragmentPath', '/other'),
                           ('DropInPaths', '/override'), ('NeedDaemonReload', 'yes'), ('MainPID', '')]:
            changed = {key: value}
            with self.subTest(key=key, value=value), patch.object(installer.subprocess, 'run', side_effect=output):
                with self.assertRaises(RuntimeError): installer.idle_release_units()

    def test_recovery_and_update_use_fresh_proof_namespace(self):
        spec = importlib.util.spec_from_file_location('fixed_driver_test', bundle.HERE / 'release-tools/r28-patch-driver-template.py')
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        self.assertEqual(module.PREFIX, 'release-r28-ui-patch-20260928-')
        self.assertEqual(module.CHECKPOINT.name, 'release-r28-ui-patch-20260928-checkpoint.json')
        # Keep this binding explicit: the old PASS cannot satisfy this driver's reads.
        self.assertNotEqual(module.PREFIX, 'release-login-20260918-')



if __name__ == "__main__": unittest.main()
