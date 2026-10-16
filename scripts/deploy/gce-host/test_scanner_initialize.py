import hashlib
import os
from pathlib import Path
from types import SimpleNamespace
import tempfile
import subprocess
import unittest
from unittest.mock import patch

import scanner_initialize as initializer
from scanner_update_policy import UpdateFailure


class HistoricalFloorTests(unittest.TestCase):
    def floor(self, root, verification=b'Verification OK'):
        base = Path(root)
        source = base / 'old'
        source.mkdir()
        signed = 1789017849
        for name in ('main', 'daily', 'bytecode'):
            raw = f'ClamAV-VDB:date:28119:1:1:hash:signature:builder:{signed}'.encode().ljust(512, b' ')
            (source / (name + '.cvd')).write_bytes(raw)
        (source / 'freshclam.dat').write_bytes(b'metadata')
        def digest(path, *args, **kwargs):
            raw = path.read_bytes()
            return hashlib.sha256(raw).hexdigest(), len(raw)
        real_fstat = os.fstat
        def historical_owner(fd):
            info = real_fstat(fd)
            return SimpleNamespace(st_uid=100, st_mode=info.st_mode & ~0o022)
        with patch.object(initializer, 'BASE', base), patch.object(initializer, 'LEGACY_SOURCE', source), \
             patch.object(initializer, 'secure_dir', side_effect=lambda path: os.open(path, os.O_RDONLY)), \
             patch.object(initializer.os, 'fstat', side_effect=historical_owner), \
             patch.object(initializer, 'file_hash', side_effect=digest), \
             patch.object(initializer, 'inspect', return_value=None), \
             patch.object(initializer, 'docker', return_value=verification), \
             patch.object(initializer, 'stop_container') as stop:
            try:
                return initializer.historical_floor()
            finally:
                self.assertGreaterEqual(stop.call_count, 1)
                stop.assert_called_with(initializer.VERIFY)

    def test_official_historical_floor_does_not_approve_stale_runtime(self):
        with tempfile.TemporaryDirectory() as root:
            floor = self.floor(root)
            state = initializer.State.decode(initializer.State(1, floor, None).encode())
            self.assertIsNone(state.approved)
            self.assertEqual(len(state.floor.files), 3)
            with self.assertRaises(UpdateFailure):
                floor.validate(floor.daily_stime + 48 * 3600)
            self.assertEqual((Path(root) / 'legacy-floor').stat().st_mode & 0o777, 0o755)
            for path in (Path(root) / 'legacy-floor').iterdir():
                self.assertEqual(path.stat().st_mode & 0o777, 0o444)
                self.assertNotEqual(path.stat().st_ino, (Path(root) / 'old' / path.name).stat().st_ino)

    def test_unsigned_floor_rejected_and_verifier_stopped(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(UpdateFailure):
                self.floor(root, verification=b'Not verified')
            self.assertFalse((Path(root) / 'state.json').exists())


class InstallationTests(unittest.TestCase):
    def test_exclusive_install_file_cannot_replace_state(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'state.json'
            path.write_bytes(b'preserved historical floor')
            with self.assertRaises(FileExistsError):
                initializer.exclusive_file(path, b'reset', 0o600)
            self.assertEqual(path.read_bytes(), b'preserved historical floor')

    def test_failed_initializer_is_not_automatically_retried_or_reset(self):
        with tempfile.TemporaryDirectory() as root:
            base = Path(root)
            with patch.object(initializer, 'BASE', base), \
                 patch.object(initializer, '__file__', str(initializer.INSTALLED / 'scanner_initialize.py')), \
                 patch.object(initializer.os, 'geteuid', return_value=0), \
                 patch.object(initializer.sys, 'argv', ['scanner_initialize.py']), \
                 patch.object(initializer, 'secure_dir', side_effect=lambda path, **kw: os.open(path, os.O_RDONLY)), \
                 patch.object(initializer, 'preflight', side_effect=UpdateFailure('injected preflight failure')) as preflight, \
                 patch.object(initializer, 'retire_legacy') as retire:
                with self.assertRaises(UpdateFailure):
                    initializer.main()
                with self.assertRaises(FileExistsError):
                    initializer.main()
                preflight.assert_called_once()
                retire.assert_not_called()


class LegacyRecoveryTests(unittest.TestCase):
    def recovery(self, interrupt):
        with tempfile.TemporaryDirectory() as root:
            base = Path(root)
            unit = base / 'timeline-clamd.service'
            raw = b'reviewed legacy unit'
            unit.write_bytes(raw)
            digest = hashlib.sha256(raw).hexdigest()
            running = {name: True for name in initializer.LEGACY}
            stopped_once = [False]
            disabled = [False]
            def inspect(name):
                identity, image = initializer.LEGACY[name]
                return {'Id': identity, 'Image': image, 'State': {'Running': running[name], 'Pid': 123 if running[name] else 0}}
            def docker(*args, **kwargs):
                if args[0] == 'stop':
                    running[args[-1]] = False
                    if interrupt == 'between_engines' and not stopped_once[0]:
                        stopped_once[0] = True
                        raise InterruptedError('Injected stop interruption')
                return b''
            def run(args, **kwargs):
                if args[1] == 'stop' and interrupt == 'before_stop' and not stopped_once[0]:
                    stopped_once[0] = True
                    raise InterruptedError('Injected early interruption')
                if args[1] == 'disable':
                    disabled[0] = True
                output = b'MainPID=0\nActiveState=inactive\n' if args[1] == 'show' else b'masked\n' if args[1] == 'is-enabled' else b''
                return subprocess.CompletedProcess(args, 1 if args[1] == 'is-enabled' else 0, output, b'')
            def file_hash(path, *args, **kw):
                data = path.read_bytes()
                return hashlib.sha256(data).hexdigest(), len(data)
            with patch.object(initializer, 'CONFIG', base), patch.object(initializer, 'LEGACY_UNIT', unit), \
                 patch.object(initializer, 'LEGACY_UNIT_SHA', digest), \
                 patch.object(initializer, 'file_hash', side_effect=file_hash), \
                 patch.object(initializer, 'secure_dir', side_effect=lambda path: os.open(path, os.O_RDONLY)), \
                 patch.object(initializer, 'inspect', side_effect=inspect), \
                 patch.object(initializer, 'run', side_effect=run), patch.object(initializer, 'docker', side_effect=docker):
                if interrupt:
                    with self.assertRaises(InterruptedError):
                        initializer.retire_legacy()
                initializer.retire_legacy()
                initializer.retire_legacy()  # Repeated closure is safe and cannot initialize floor.
            self.assertFalse(any(running.values()))
            self.assertTrue(disabled[0])
            self.assertEqual(os.readlink(unit), '/dev/null')
            self.assertEqual((base / 'legacy-timeline-clamd.service.saved').read_bytes(), raw)
            self.assertFalse((base / 'state.json').exists())

    def test_recovery_after_interruption_before_stop(self):
        self.recovery('before_stop')

    def test_recovery_after_interruption_between_engines(self):
        self.recovery('between_engines')

    def test_repeated_normal_retirement_preserves_saved_unit(self):
        self.recovery(None)


if __name__ == '__main__':
    unittest.main()
