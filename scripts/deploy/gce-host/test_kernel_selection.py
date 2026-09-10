import contextlib
import importlib.util
import io
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('kernel_selection', Path(__file__).with_name('timeline-select-lts-kernel.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class KernelSelectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.states = {}
        self.bad_initrd = set()
        self.writes = []
        self.saved = ''
        self.syntax_ok = True
        self.versions = []

    def kernel(self, version, image='installed', modules='installed', complete=True):
        self.versions.append(version)
        self.states['linux-image-' + version] = image
        self.states['linux-modules-' + version] = modules
        for name in ['boot/vmlinuz-' + version, 'boot/initrd.img-' + version, 'lib/modules/' + version + '/modules.builtin', 'lib/modules/' + version + '/modules.dep']:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('synthetic')
        if not complete:
            (self.root / ('lib/modules/' + version + '/modules.dep')).unlink()

    def run_command(self, args, **kwargs):
        code, stdout = 0, ''
        if args[0] == 'dpkg-query':
            stdout = self.states.get(args[-1], '')
        elif args[:2] == ['dpkg', '--compare-versions']:
            number = lambda value: tuple(int(x) for x in re.findall(r'\d+', value))
            code = 0 if number(args[2]) < number(args[4]) else 1
        elif args[0] == 'lsinitramfs':
            code = int(Path(args[1]).name.removeprefix('initrd.img-') in self.bad_initrd)
        elif args[0] == 'grub-script-check':
            code = 0 if self.syntax_ok else 1
        elif args[0] == 'grub-set-default':
            self.writes.append(args[1])
            self.saved = 'saved_entry=' + args[1] + '\n'
        else:
            raise AssertionError(args)
        if code and kwargs.get('check'):
            raise subprocess.CalledProcessError(code, args)
        return subprocess.CompletedProcess(args, code, stdout=stdout)

    def invoke(self, arguments=(), saved_default=True):
        grub = self.root / 'boot/grub/grub.cfg'
        grub.parent.mkdir(parents=True, exist_ok=True)
        grub.write_text(('set default="${saved_entry}"\n' if saved_default else 'set default="0"\n') + "submenu 'Advanced' $menuentry_id_option 'advanced' {\n" + ''.join(" menuentry 'Linux' $menuentry_id_option 'gnulinux-" + v + "-advanced-disk' { }\n" for v in self.versions) + '}\n')
        def trust(path):
            info = path.lstat()
            if path.is_symlink() or info.st_mode & 0o022:
                raise RuntimeError('UNTRUSTED_BOOT_FILE')
        with patch.object(module, 'Path', side_effect=lambda p: self.root / str(p).lstrip('/')), patch.object(module.os, 'geteuid', return_value=0), patch.object(module, 'trusted_file', side_effect=trust), patch.object(module.sys, 'argv', ['selector', *arguments]), patch.object(module.subprocess, 'run', side_effect=self.run_command), patch.object(module.subprocess, 'check_output', side_effect=lambda *a, **k: self.saved), contextlib.redirect_stdout(io.StringIO()):
            module.main()

    def test_chooses_numeric_newest(self):
        self.kernel('5.15.0-999-gcp'); self.kernel('5.15.0-1115-gcp')
        self.invoke(); self.assertIn('1115', self.writes[0])

    def test_incomplete_old_candidate_does_not_block_complete_new(self):
        self.kernel('5.15.0-999-gcp', complete=False); self.kernel('5.15.0-1115-gcp')
        self.invoke(); self.assertIn('1115', self.writes[0])

    def test_corrupt_new_initrd_falls_back(self):
        self.kernel('5.15.0-1114-gcp'); self.kernel('5.15.0-1115-gcp')
        self.bad_initrd.add('5.15.0-1115-gcp')
        self.invoke(); self.assertIn('1114', self.writes[0])

    def test_can_remove_broken_old_when_complete_new_exists(self):
        self.kernel('5.15.0-999-gcp', complete=False); self.kernel('5.15.0-1115-gcp')
        self.invoke(('--prerm', '5.15.0-999-gcp')); self.assertEqual([], self.writes)

    def test_cannot_remove_last_complete_kernel(self):
        self.kernel('5.15.0-1115-gcp')
        with self.assertRaisesRegex(RuntimeError, 'REFUSE_REMOVE_LAST'):
            self.invoke(('--prerm', '5.15.0-1115-gcp'))
        self.assertEqual([], self.writes)

    def test_exact_postinst_half_configured_image_allowed(self):
        self.kernel('5.15.0-1115-gcp', image='half-configured')
        self.invoke(('--postinst', '5.15.0-1115-gcp')); self.assertEqual(1, len(self.writes))

    def test_half_configured_modules_never_selected(self):
        self.kernel('5.15.0-1115-gcp', image='half-configured', modules='half-configured')
        with self.assertRaisesRegex(RuntimeError, 'NO_COMPLETE'):
            self.invoke(('--postinst', '5.15.0-1115-gcp'))

    def test_cloud_default_override_prevents_write(self):
        self.kernel('5.15.0-1115-gcp')
        with self.assertRaisesRegex(RuntimeError, 'DOES_NOT_USE_SAVED'):
            self.invoke(saved_default=False)
        self.assertEqual([], self.writes)

    def test_grub_syntax_error_prevents_write(self):
        self.kernel('5.15.0-1115-gcp'); self.syntax_ok = False
        with self.assertRaises(subprocess.CalledProcessError): self.invoke()
        self.assertEqual([], self.writes)

    def test_untrusted_candidate_fails_closed(self):
        self.kernel('5.15.0-1115-gcp')
        (self.root / 'boot/vmlinuz-5.15.0-1115-gcp').chmod(0o666)
        with self.assertRaisesRegex(RuntimeError, 'UNTRUSTED'): self.invoke()
        self.assertEqual([], self.writes)


if __name__ == '__main__':
    unittest.main()
