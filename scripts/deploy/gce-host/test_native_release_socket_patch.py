from contextlib import ExitStack, contextmanager
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import native_backup_controller as backup
import build_native_release_bundle as bundle


class SocketRepairTests(unittest.TestCase):
    def load(self):
        spec = importlib.util.spec_from_file_location('socket_repair_test', bundle.HERE / 'release-tools/socket-fix-template.py')
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        return module

    @contextmanager
    def fixture(self):
        repair = self.load()
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            root = Path(directory); ops = root / 'ops'; state = root / 'state'; units = root / 'units'
            for folder in (ops, state, units): folder.mkdir(mode=0o700)
            before = b'VALUE = "old"\n'; after = b'VALUE = "fixed"\n'; base = b'BASE = True\n'; unit = b'[Service]\n'
            helper = ops / repair.HELPER; helper.write_bytes(before); helper.chmod(0o644)
            (ops / 'native_backup_controller.py').write_bytes(base); (ops / 'native_backup_controller.py').chmod(0o644)
            (units / 'timeline-native-api.service').write_bytes(unit); (units / 'timeline-native-api.service').chmod(0o644)
            stable = {'version': 1, 'active': repair.BASE, 'committed': repair.BASE, 'pending': False}
            state_file = state / 'release-6c70-state.json'; state_file.write_text(json.dumps(stable)); state_file.chmod(0o600)
            sha = lambda raw: hashlib.sha256(raw).hexdigest()
            old = {'version': 1, 'base': repair.BASE, 'target': 'a' * 40, 'payload': {repair.HELPER: sha(before)}}
            new = json.loads(json.dumps(old)); new['payload'][repair.HELPER] = sha(after)
            install = state / 'controller-install-20260917.json'; install.write_bytes(repair.encoded(old)); install.chmod(0o600)
            values = {'OPS': ops, 'ROOT': state, 'UNITS': units, 'SAVED': state / 'saved', 'JOURNAL': state / 'repair.json',
                      'COMPLETE': state / 'complete.json', 'INSTALL_JOURNAL': install, 'OLD_HELPER_SHA': sha(before),
                      'NEW_HELPER': {'text': after.decode(), 'sha256': sha(after)}, 'OLD_INSTALL_JOURNAL': old,
                      'NEW_INSTALL_JOURNAL': new, 'EXPECTED': {repair.HELPER: sha(before), 'native_backup_controller.py': sha(base)},
                      'EXPECTED_UNITS': {'timeline-native-api.service': sha(unit)},
                      'PATCH_IDENTITY': {'fromOperationsCommit': 'd' * 40, 'toOperationsCommit': 'e' * 40, 'runtimeCommit': 'a' * 40}}
            for name, value in values.items(): stack.enter_context(patch.object(repair, name, value))
            # Exercise real atomic file operations without root or host service access.
            stack.enter_context(patch.object(repair, 'directory'))
            stack.enter_context(patch.object(repair, 'read', side_effect=lambda path, mode=0o644: path.read_bytes()))
            stack.enter_context(patch.object(repair, 'unit_idle'))
            stack.enter_context(patch.object(repair.os, 'geteuid', return_value=0))
            stack.enter_context(patch.object(repair.socket, 'gethostname', return_value='instance-20260408-091840'))
            stack.enter_context(patch.object(repair.subprocess, 'run'))
            stack.enter_context(patch.object(backup, 'locked'))
            stack.enter_context(patch.object(backup, 'regular'))
            stack.enter_context(patch.object(backup, 'read_json', side_effect=lambda path: json.loads(path.read_text())))
            stack.enter_context(patch('builtins.print'))
            yield repair, state_file, stable, before, after

    def test_each_half_or_complete_write_interruption_retains_originals_and_resumes(self):
        for point in range(1, 7):
            for partial in (False, True):
                with self.subTest(point=point, partial=partial), self.fixture() as (repair, state_file, stable, before, after):
                    write = repair.write; calls = 0
                    def interrupted(path, raw, mode):
                        nonlocal calls
                        calls += 1
                        if calls == point and partial:
                            write(path, raw[:max(1, len(raw) // 2)], mode)
                            raise KeyboardInterrupt('Synthetic mid-write interruption')
                        write(path, raw, mode)
                        if calls == point: raise KeyboardInterrupt('Synthetic durable-write interruption')
                    with patch.object(repair, 'write', side_effect=interrupted):
                        with self.assertRaises(KeyboardInterrupt): repair.main()
                    self.assertEqual(json.loads(state_file.read_text()), stable)
                    repair.main(); repair.main()
                    self.assertEqual((repair.OPS / repair.HELPER).read_bytes(), after)
                    self.assertEqual(repair.INSTALL_JOURNAL.read_bytes(), repair.encoded(repair.NEW_INSTALL_JOURNAL))
                    self.assertEqual((repair.SAVED / repair.HELPER).read_bytes(), before)
                    self.assertEqual((repair.SAVED / repair.INSTALL_JOURNAL.name).read_bytes(), repair.encoded(repair.OLD_INSTALL_JOURNAL))
                    self.assertEqual(json.loads(state_file.read_text()), stable)

    def test_pending_state_or_checkpoint_prevents_every_write(self):
        for mode in ('pending', 'checkpoint'):
            with self.subTest(mode=mode), self.fixture() as (repair, state_file, stable, before, after):
                if mode == 'pending': state_file.write_text(json.dumps({**stable, 'pending': True}))
                else: (repair.ROOT / 'release-20260917-checkpoint.json').write_text('{}')
                with patch.object(repair, 'write') as write:
                    with self.assertRaises(RuntimeError): repair.main()
                    write.assert_not_called()

    def test_unknown_installed_helper_or_journal_prevents_every_write(self):
        for mode in ('helper', 'journal'):
            with self.subTest(mode=mode), self.fixture() as (repair, state_file, stable, before, after):
                destination = repair.OPS / repair.HELPER if mode == 'helper' else repair.INSTALL_JOURNAL
                destination.write_bytes(b'unknown')
                with patch.object(repair, 'write') as write:
                    with self.assertRaises(RuntimeError): repair.main()
                    write.assert_not_called()

    def test_changed_helper_without_durable_repair_journal_is_rejected(self):
        with self.fixture() as (repair, state_file, stable, before, after):
            (repair.OPS / repair.HELPER).write_bytes(after)
            with patch.object(repair, 'write') as write:
                with self.assertRaisesRegex(RuntimeError, 'begin from exact installed d16'): repair.main()
                write.assert_not_called()

    def test_release_unit_contract_is_not_widened(self):
        repair = self.load(); unit = 'timeline-native-release-check.service'
        valid = {'ActiveState': 'failed', 'MainPID': '0', 'ControlPID': '0', 'FragmentPath': str(repair.UNITS / unit),
                 'DropInPaths': '', 'NeedDaemonReload': 'no'}
        def render(value): return ('\n'.join(k + '=' + v for k, v in value.items()) + '\n').encode()
        with patch.object(repair.subprocess, 'check_output', return_value=render(valid)):
            repair.unit_idle(unit)
        for key, value in [('ActiveState', 'active'), ('MainPID', '23'), ('ControlPID', '23'), ('FragmentPath', '/other'),
                           ('DropInPaths', '/other.conf'), ('NeedDaemonReload', 'yes')]:
            with self.subTest(key=key), patch.object(repair.subprocess, 'check_output', return_value=render({**valid, key: value})):
                with self.assertRaises(RuntimeError): repair.unit_idle(unit)


if __name__ == '__main__': unittest.main()
