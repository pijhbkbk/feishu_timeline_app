import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from contextlib import ExitStack
import native_backup_controller as backup
import build_native_release_bundle as bundle


class ReleaseInstallerTests(unittest.TestCase):
    def load_installer(self):
        spec = importlib.util.spec_from_file_location('fixed_installer_test', bundle.HERE / 'release-tools/install-template.py')
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        return module

    def test_interrupted_atomic_install_resumes_without_changing_runtime_state_or_losing_originals(self):
        installer = self.load_installer()
        for interrupted_at, partial in [(n, partial) for n in range(1, 20) for partial in (False, True)]:
            with self.subTest(interrupted_at=interrupted_at, partial=partial), tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
                root = Path(directory); ops = root / 'ops'; state = root / 'state'; units = root / 'units'
                for folder in (ops, state, units): folder.mkdir(mode=0o700)
                old_module = b'VALUE = "old"\n'; old_unit = b'[Service]\nType=oneshot\n'
                (ops / 'native_release.py').write_bytes(old_module)
                for name in ('native_runtime_app.py', 'native_runtime_network.py', 'native_cutover.py'):
                    (ops / name).write_bytes(old_module)
                names = bundle.NAMES
                for name in names:
                    if name.endswith('.service'): (units / name).write_bytes(old_unit)
                for name in names:
                    destination = (ops if name.endswith('.py') else units) / name
                    if destination.exists(): destination.chmod(0o644)
                stable = {'version': 1, 'active': installer.BASE, 'committed': installer.BASE, 'pending': False}
                state_file = state / 'release-6c70-state.json'; state_file.write_text(json.dumps(stable)); state_file.chmod(0o600)
                payload = {name: {'text': 'VALUE = "new"\n' if name.endswith('.py') else '[Service]\nType=oneshot\nTimeoutStartSec=600\n'} for name in names}
                for item in payload.values(): item['sha256'] = hashlib.sha256(item['text'].encode()).hexdigest()
                for key, value in [('OPS', ops), ('ROOT', state), ('UNITS', units), ('SAVED', state / 'saved'),
                                   ('JOURNAL', state / 'journal.json'), ('TARGET_ID', 'a' * 40), ('PAYLOAD', payload),
                                   ('EXPECTED', {name: hashlib.sha256(old_module).hexdigest() for name in ('native_release.py', 'native_runtime_app.py', 'native_runtime_network.py', 'native_cutover.py')}),
                                   ('EXPECTED_UNITS', {name: hashlib.sha256(old_unit).hexdigest() for name in names if name.endswith('.service')})]:
                    stack.enter_context(patch.object(installer, key, value))
                # Root ownership checks are tested by the lower-level controller suite;
                # this fixture isolates interrupted write/reentry behavior without sudo.
                stack.enter_context(patch.object(installer, 'directory'))
                stack.enter_context(patch.object(installer, 'read', side_effect=lambda path, mode=0o644: path.read_bytes()))
                stack.enter_context(patch.object(installer.os, 'geteuid', return_value=0))
                stack.enter_context(patch.object(installer.socket, 'gethostname', return_value='instance-20260408-091840'))
                stack.enter_context(patch.object(installer.subprocess, 'run'))
                stack.enter_context(patch.object(backup, 'locked'))
                stack.enter_context(patch.object(backup, 'regular'))
                stack.enter_context(patch.object(backup, 'read_json', side_effect=lambda path: json.loads(path.read_text())))
                stack.enter_context(patch.object(backup, 'write_json', side_effect=lambda path, data: installer.write(path, json.dumps(data).encode(), 0o600)))
                stack.enter_context(patch('builtins.print'))
                original_write = installer.write; count = 0
                def interrupted_write(path, raw, mode):
                    nonlocal count
                    count += 1
                    if count == interrupted_at and partial:
                        original_write(path, raw[:max(1, len(raw) // 2)], mode)
                        raise KeyboardInterrupt('Synthetic mid-write interruption')
                    original_write(path, raw, mode)
                    if count == interrupted_at: raise KeyboardInterrupt('Synthetic durable-write interruption')
                with patch.object(installer, 'write', side_effect=interrupted_write):
                    with self.assertRaises(KeyboardInterrupt): installer.main()
                self.assertEqual(json.loads(state_file.read_text()), stable)
                installer.main()
                installer.main()  # Reentry cannot execute a release or discard prior files.
                for name, item in payload.items():
                    self.assertEqual(((ops if name.endswith('.py') else units) / name).read_text(), item['text'])
                self.assertEqual((state / 'saved/native_release.py').read_bytes(), old_module)
                self.assertEqual(json.loads(state_file.read_text()), stable)

    def test_templates_reject_ambiguous_replacements(self):
        with self.assertRaisesRegex(RuntimeError, 'Unambiguous'):
            bundle.render('driver-template.py', {'NOT_A_TEMPLATE_FIELD': 'fixture'})

    def test_unfinalized_target_does_not_generate_scripts(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(bundle.release, 'TARGET', None):
            output = Path(directory) / 'output'
            with self.assertRaisesRegex(backup.Failure, 'not fixed'):
                bundle.build(output, 'a' * 40)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
