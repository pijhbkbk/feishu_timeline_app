import argparse
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('application_delta', Path(__file__).with_name('application_delta.py'))
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)


class DeltaAcceptance(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.base, self.package = self.root / 'base', self.root / 'package'
        self.base.mkdir(mode=0o700)
        self.package.mkdir(mode=0o700)
        self.old = {}
        for name in ('node_modules/pkg/index.js', 'runtime/node_modules/next/index.js',
                     'apps/api/dist/main.js', 'runtime/apps/web/server.js',
                     'runtime/apps/web/.next/server/static.js', 'apps/api/package.json'):
            data = ('old:' + name).encode()
            path = self.base / name
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            path.write_bytes(data)
            path.chmod(0o600)
            self.old[name] = self.row(data)
        link = self.base / 'apps/api/node_modules/pkg'
        link.parent.mkdir(parents=True, mode=0o700)
        link.symlink_to('../../../node_modules/pkg')
        self.old['apps/api/node_modules/pkg'] = {'symlink': '../../../node_modules/pkg', 'dangling': False}
        for parent, dirs, _ in os.walk(self.base, followlinks=False):
            Path(parent).chmod(0o700)
        self.base_manifest = self.root / 'base.json'
        self.base_manifest.write_bytes(d.packed({'entries': self.old}))
        self.base_manifest.chmod(0o600)
        self.pin = patch.object(d, 'BASE_SHA', d.sha(self.base_manifest.read_bytes()))
        self.pin.start()
        self.addCleanup(self.pin.stop)
        self.addCleanup(self.temp.cleanup)
        self.new = {p: self.row(('new:' + p).encode()) for p in
                    ('apps/api/dist/main.js', 'runtime/apps/web/server.js',
                     'runtime/apps/web/.next/server/static.js')}
        self.manifest = {
            'kind': 'APPLICATION_BASE_PLUS_DELTA_V1', 'baseManifestSha256': d.BASE_SHA,
            'identity': {'sourceCommit': 'a' * 40, 'sourceTree': 'b' * 40,
                         'release': 'synthetic-test', 'buildTime': '2026-10-30T00:00:00Z'},
            'replacementPrefixes': d.PREFIXES, 'entries': self.new, 'removedBaseEntries': [],
            'preservedBaseEntryCount': len(self.old) - 3, 'compositeEntryCount': len(self.old)}
        self.make_archive()
        self.args = argparse.Namespace(package=self.package, base=self.base, base_manifest=self.base_manifest,
                                       target=self.root / 'target', receipt=self.root / 'receipt.json',
                                       mode='assemble', manifest_sha256='')
        self.seal()

    @staticmethod
    def row(data):
        return {'bytes': len(data), 'mode': 0o600, 'sha256': d.sha(data), 'sourceKind': 'compiled'}

    def make_archive(self, extra=None):
        path = self.package / 'application-delta.tar.gz'
        with tarfile.open(path, 'w:gz') as archive:
            for name, row in self.new.items():
                info = tarfile.TarInfo(name)
                info.mode, info.size = row['mode'], row['bytes']
                archive.addfile(info, io.BytesIO(('new:' + name).encode()))
            if extra:
                archive.addfile(extra)
        path.chmod(0o600)
        self.manifest['archive'] = {'name': path.name, 'bytes': path.stat().st_size, 'sha256': d.sha(path.read_bytes())}

    def seal(self):
        path = self.package / 'manifest.json'
        path.write_bytes(d.packed(self.manifest))
        path.chmod(0o600)
        self.args.manifest_sha256 = d.sha(path.read_bytes())

    def test_assemble_readback_and_preserve_base(self):
        before = {k: (os.readlink(self.base/k) if 'symlink' in v else (self.base/k).read_bytes())
                  for k, v in self.old.items()}
        result = d.run(self.args)
        self.assertEqual(result['status'], 'APPLICATION_VERIFIED_NOT_STARTED')
        self.assertEqual((self.args.target/'apps/api/node_modules/pkg/index.js').read_bytes(),
                         (self.base/'node_modules/pkg/index.js').read_bytes())
        for a in d.ALIASES:
            self.assertEqual(os.readlink(self.args.target/a), str(self.base/a))
        self.assertEqual(before, {k: (os.readlink(self.base/k) if 'symlink' in v else (self.base/k).read_bytes())
                                 for k, v in self.old.items()})
        self.args.mode, self.args.receipt = 'verify', self.root/'verify.json'
        d.run(self.args)

    def test_wrong_base_content_rejected_before_target(self):
        (self.base/'apps/api/package.json').write_bytes(b'changed')
        with self.assertRaisesRegex(RuntimeError, 'EXACT_MODE_SIZE|FILE_SHA256'):
            d.run(self.args)
        self.assertFalse(self.args.target.exists())

    def test_existing_target_not_overwritten(self):
        self.args.target.mkdir()
        marker = self.args.target/'keep'
        marker.write_text('owner data')
        with self.assertRaisesRegex(RuntimeError, 'TARGET_EXISTS'):
            d.run(self.args)
        self.assertEqual(marker.read_text(), 'owner data')

    def test_tar_traversal_and_hardlinks_rejected(self):
        for name, kind in (('../escape', tarfile.REGTYPE), ('unlisted', tarfile.LNKTYPE)):
            with self.subTest(name=name):
                info = tarfile.TarInfo(name)
                info.type, info.linkname = kind, 'apps/api/dist/main.js'
                self.make_archive(info)
                self.seal()
                with self.assertRaisesRegex(RuntimeError, 'ARCHIVE_MEMBER'):
                    d.run(self.args)
                self.assertFalse(self.args.target.exists())

    def test_manifest_cannot_preserve_old_code_as_fallback(self):
        self.manifest['removedBaseEntries'] = ['apps/api/dist/main.js']
        self.seal()
        with self.assertRaisesRegex(RuntimeError, 'TOMBSTONES'):
            d.run(self.args)

    def test_unlisted_base_file_and_external_link_rejected(self):
        extra = self.base/'secret'
        extra.write_text('fixture')
        with self.assertRaisesRegex(RuntimeError, 'EXTRA_LEAF'):
            d.run(self.args)
        extra.unlink()
        link = self.base/'apps/api/node_modules/pkg'
        link.unlink()
        link.symlink_to(str(self.root))
        with self.assertRaisesRegex(RuntimeError, 'EXACT_LINK'):
            d.run(self.args)

    def test_changed_alias_and_hardlinked_dependency_rejected(self):
        d.run(self.args)
        alias = self.args.target/'node_modules'
        alias.unlink()
        alias.symlink_to(self.base/'runtime/node_modules')
        self.args.mode, self.args.receipt = 'verify', self.root/'verify.json'
        with self.assertRaisesRegex(RuntimeError, 'EXACT_DIRECTORY_ALIAS'):
            d.run(self.args)
        alias.unlink()
        alias.symlink_to(self.base/'node_modules')
        os.link(self.base/'node_modules/pkg/index.js', self.root/'hardlink')
        with self.assertRaisesRegex(RuntimeError, 'FILE_TYPE_OR_HARDLINK'):
            d.run(self.args)

    def test_capacity_failure_is_before_target(self):
        with patch.object(d.shutil, 'disk_usage', return_value=argparse.Namespace(free=d.FLOOR-1)):
            with self.assertRaisesRegex(RuntimeError, 'GUEST_FREE_FLOOR'):
                d.run(self.args)
        self.assertFalse(self.args.target.exists())

    def test_receipt_cannot_mutate_inputs_or_verified_target(self):
        for root in (self.base, self.package):
            self.args.receipt = root/'receipt.json'
            with self.assertRaisesRegex(RuntimeError, 'RECEIPT_OUTSIDE_INPUTS_AND_TARGET'):
                d.run(self.args)
            self.assertFalse(self.args.receipt.exists())
            self.assertFalse(self.args.target.exists())
        self.args.receipt = self.root/'receipt.json'
        d.run(self.args)
        self.args.mode, self.args.receipt = 'verify', self.args.target/'receipt.json'
        with self.assertRaisesRegex(RuntimeError, 'RECEIPT_OUTSIDE_INPUTS_AND_TARGET'):
            d.run(self.args)
        self.assertFalse(self.args.receipt.exists())

    def test_package_cannot_be_target_parent(self):
        self.args.target = self.package/'target'
        with self.assertRaisesRegex(RuntimeError, 'DISJOINT_PACKAGE_TARGET'):
            d.run(self.args)
        self.assertFalse(self.args.target.exists())

    def test_directory_permissions_remain_exact(self):
        (self.base/'node_modules').chmod(0o755)
        with self.assertRaisesRegex(RuntimeError, 'EXTRA_OR_WRITABLE_DIRECTORY'):
            d.run(self.args)
        self.assertFalse(self.args.target.exists())

    def test_exact_old_runtime_state_is_preserved_but_never_copied(self):
        state = self.base/d.BASE_UNCONSUMED_STATE
        state.mkdir(mode=0o700)
        private = state/'unknown-state'
        private.write_text('synthetic do not consume')
        private.chmod(0)
        result = d.run(self.args)
        self.assertEqual([r['path'] for r in result['unconsumedBaseDirectories']], [d.BASE_UNCONSUMED_STATE])
        self.assertFalse((self.args.target/d.BASE_UNCONSUMED_STATE).exists())
        self.assertEqual(private.stat().st_mode & 0o777, 0)
        private.chmod(0o600)
        self.assertEqual(private.read_text(), 'synthetic do not consume')
        (self.args.target/d.BASE_UNCONSUMED_STATE).mkdir(mode=0o700)
        self.args.mode, self.args.receipt = 'verify', self.root/'verify.json'
        with self.assertRaisesRegex(RuntimeError, 'EXTRA_OR_WRITABLE_DIRECTORY|TREE_BOUND'):
            d.run(self.args)
        self.assertFalse(self.args.receipt.exists())

    def test_runtime_state_exception_never_accepts_link_or_neighbor(self):
        state = self.base/d.BASE_UNCONSUMED_STATE
        state.symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, 'WRITABLE_BY_OTHERS|CANONICAL_PATH|FILE_TYPE_OR_HARDLINK'):
            d.run(self.args)
        state.unlink()
        state.write_text('not a directory')
        state.chmod(0o600)
        with self.assertRaisesRegex(RuntimeError, 'FILE_TYPE_OR_HARDLINK'):
            d.run(self.args)
        state.unlink()
        (state.parent/'other-state').mkdir(mode=0o700)
        with self.assertRaisesRegex(RuntimeError, 'EXTRA_OR_WRITABLE_DIRECTORY'):
            d.run(self.args)
        self.assertFalse(self.args.target.exists())


if __name__ == '__main__':
    unittest.main()
