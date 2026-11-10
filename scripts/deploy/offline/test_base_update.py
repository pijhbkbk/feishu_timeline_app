"""Exact base-update admission boundaries; no Linux/installation claim."""
import copy
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('prepare_instance', Path(__file__).with_name('prepare_instance.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class BaseUpdateGuards(unittest.TestCase):
    def setUp(self):
        self.refs = {k: {'sha256': h} for k, h in {
            'result': '8c88a81d3416506140f4f61f5afc3ff2942981bd16f95d873ad5bdbbaceeb723',
            'metadata': '5a18c71bd16dffba909339fda86dda427e359d8ef3f44a651d37106a5370313e',
            'analysis': 'dcf5c000d4934d7751969be45cd37eb5c5ed8835ddfde6877ce4a54631b0aa48'}.items()}
        self.delta = [{'package': 'libbrotli1:arm64', 'before': ['1.1.0-2build2', 'arm64', 'ii '],
                       'after': ['1.1.0-2ubuntu0.1', 'arm64', 'ii ']}]
        self.rows = []
        for name, old, new, size in [
            ('dec', 'b7895f0fd4ad47408cb01fcb959ae6792804c15512526166f9bf48358714d0b5', '18ab766ad16cd9806ff65a9397e6c09c6bea15d7e8ef1b7614bb4b6134a25e58', 67688),
            ('common', '016600f673a5d1a565cf98f608d8425033593ab78827eccc3384596f70386c8c', '71fdb0eb9f2c43c777ed0e7ab30f0741f76861739798a618ab030c12c792919c', 198784)]:
            self.rows.append({'path': '/usr/lib/aarch64-linux-gnu/libbrotli'+name+'.so.1.1.0',
                              'historicalSha256': old, 'currentSha256': new, 'bytes': size, 'mode': 0o644,
                              'uid': 0, 'package': 'libbrotli1:arm64', 'version': '1.1.0-2ubuntu0.1'})
        deb = '911411fb6fdfb4ab91dd4242f5a0a5e1f47b38e003a25c8dc7730238cb323e18'
        self.proof = {'kind': 'R30_BROTLI_EXACT_UPDATE_AND_TARGETED_LOADER_V1',
                      'status': 'OFFICIAL_PAYLOAD_READBACK_AND_AFFECTED_LIBCURL_LOADER_PASS',
                      'historicalDependencyReceiptSha256': m.DEPS_SHA,
                      'metadataReceiptSha256': self.refs['metadata']['sha256'],
                      'debAnalysisSha256': self.refs['analysis']['sha256'], 'debSha256': deb,
                      'loader': {'exitCode': 0, 'normalizedNamedOutputEqualHistorical': True},
                      'baseDelta': self.delta, 'changedNativeLibraries': self.rows}
        self.metadata = {'baseCount': 122, 'baseDelta': self.delta, 'package': {'SHA256': deb}}
        self.analysis = {'debSha256': deb, 'dependenciesUnchangedFromRetainedClosure': True}
        self.combined = {r['path']: {'sha256': r['historicalSha256'], 'delivery': 'exact-122-base'} for r in self.rows}

    def call(self, proof=None, query=None):
        with patch.object(m, 'pinned', side_effect=[proof or self.proof, self.metadata, self.analysis]), \
             patch.object(m, 'base_library_alias'), \
             patch.object(m.subprocess, 'run', return_value=query or subprocess.CompletedProcess([], 0, b'1.1.0-2ubuntu0.1\tarm64\tii \n', b'')):
            return m.base_update(self.refs, self.combined)

    def test_no_opt_in_keeps_the_original_baseline(self):
        with patch.object(m, 'pinned', side_effect=AssertionError('must not read')):
            self.assertEqual(m.base_update(None, self.combined), ({}, None))

    def test_explicit_exact_update_keeps_historical_rows_unchanged(self):
        original = copy.deepcopy(self.combined)
        updates, evidence = self.call()
        self.assertEqual(set(updates), set(self.combined))
        self.assertEqual(self.combined, original)
        self.assertFalse(evidence['targetedLoaderReexecutedNow'])

    def test_changed_evidence_pin_is_not_consumed(self):
        self.refs['result']['sha256'] = '0'*64
        with patch.object(m, 'pinned', side_effect=AssertionError('must not read')), self.assertRaisesRegex(RuntimeError, 'EXACT_BASE_UPDATE_PINS'):
            m.base_update(self.refs, self.combined)

    def test_unknown_extra_duplicate_or_changed_library_is_rejected(self):
        changes = []
        for field, value in [('path', '/usr/lib/aarch64-linux-gnu/libc.so.6'), ('currentSha256', '0'*64),
                             ('historicalSha256', '0'*64), ('uid', 1100), ('mode', 0o666),
                             ('bytes', 1), ('version', '1.1.0-2ubuntu0.2')]:
            bad = copy.deepcopy(self.proof); bad['changedNativeLibraries'][0][field] = value; changes.append(bad)
        bad = copy.deepcopy(self.proof); bad['changedNativeLibraries'].append(copy.deepcopy(self.rows[0])); changes.append(bad)
        bad = copy.deepcopy(self.proof); bad['changedNativeLibraries'][1] = copy.deepcopy(self.rows[0]); changes.append(bad)
        for bad in changes:
            with self.subTest(rows=bad['changedNativeLibraries']), self.assertRaises(RuntimeError):
                self.call(bad)

    def test_failed_loader_or_changed_base_set_is_not_accepted(self):
        for key, value in [('exitCode', 1), ('normalizedNamedOutputEqualHistorical', False)]:
            bad = copy.deepcopy(self.proof); bad['loader'][key] = value
            with self.assertRaises(RuntimeError): self.call(bad)
        self.metadata['baseCount'] = 121
        with self.assertRaises(RuntimeError): self.call()

    def test_current_installed_version_must_match_not_merely_the_receipt(self):
        for reply in [subprocess.CompletedProcess([], 0, b'1.1.0-2build2\tarm64\tii \n', b''),
                      subprocess.CompletedProcess([], 0, b'1.1.0-2ubuntu0.2\tarm64\tii \n', b''),
                      subprocess.CompletedProcess([], 1, b'', b'not installed')]:
            with self.assertRaisesRegex(RuntimeError, 'CURRENT_BASE_PACKAGE_VERSION'): self.call(query=reply)

    def test_history_must_match_and_only_base_deliveries_can_change(self):
        for field, value in [('delivery', 'new-prefix-20deb'), ('sha256', '0'*64)]:
            before = copy.deepcopy(self.combined)
            self.combined[self.rows[0]['path']][field] = value
            with self.assertRaisesRegex(RuntimeError, 'BASE_UPDATE_MATCHES_HISTORY'): self.call()
            self.combined = before

    def test_real_symlink_redirection_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td).resolve(); library = root/'libbrotlidec.so.1.1.0'; library.write_bytes(b'fixture')
            other = root/'unexpected'; other.write_bytes(b'fixture')
            alias = root/'libbrotlidec.so.1'; alias.symlink_to(other.name)
            real_lstat = Path.lstat
            def simulated_linux_owner(path):
                actual = real_lstat(path)
                if path != alias:
                    return actual
                values = list(actual); values[4] = values[5] = 0
                return os.stat_result(values)
            # Mac's uid and primary gid differ. Only ownership is simulated;
            # the two real link targets and canonical path checks remain real.
            with patch.object(Path, 'lstat', simulated_linux_owner):
                with self.assertRaisesRegex(RuntimeError, 'BASE_UPDATE_LIBRARY_ALIAS'):
                    m.base_library_alias(str(library))
                alias.unlink(); alias.symlink_to(library.name)
                m.base_library_alias(str(library))


if __name__ == '__main__':
    unittest.main()
