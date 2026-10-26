"""Local boundary tests; never run an installer, loader, service or guest command."""
import copy
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HELPER = Path(__file__).with_name('install_runtime_debs.py')
spec = importlib.util.spec_from_file_location('offline_debs', HELPER)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BudgetTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.datetime(2026, 10, 27, tzinfo=datetime.timezone.utc)
        self.reader = {'entrySha256': 'a' * 64,
                       'dependencies': [{'name': 'host.py', 'sha256': 'b' * 64}]}
        # The real current denominator exceeds 256. The whole set remains required.
        self.roots = ['/approved/scope-%03d' % n for n in range(344)]
        self.policy = {'kind': 'OFFLINE_HOST_BUDGET_SCOPE_V1', 'limit': module.CAP,
                       'reader': self.reader, 'expectedRootPaths': self.roots}
        self.budget = {'at': self.now.isoformat(), 'limit': module.CAP,
                       'scopeNarrowed': False, 'reader': self.reader,
                       'rows': [{'path': p, 'allocatedBytes': 4096} for p in self.roots],
                       'totalAllocatedBytes': 344 * 4096}

    def check(self, budget):
        module.check_budget(budget, self.policy, self.now)

    def test_full_344_root_scope_allowed(self):
        with patch.object(module, 'load', return_value=self.policy):
            self.assertEqual(module.scope_policy(Path('/not-read'), 'a' * 64), self.policy)
        self.check(self.budget)

    def test_omitted_replaced_or_duplicate_root_rejected(self):
        for mutation in ('omit', 'replace', 'duplicate'):
            with self.subTest(mutation=mutation):
                value = copy.deepcopy(self.budget)
                if mutation == 'omit':
                    value['rows'].pop()
                else:
                    value['rows'][-1]['path'] = '/different' if mutation == 'replace' else self.roots[0]
                value['totalAllocatedBytes'] = sum(r['allocatedBytes'] for r in value['rows'])
                with self.assertRaises(module.Refused): self.check(value)

    def test_reader_dependency_and_entry_both_bound(self):
        for which in ('entry', 'dependency'):
            value = copy.deepcopy(self.budget)
            if which == 'entry': value['reader']['entrySha256'] = 'c' * 64
            else: value['reader']['dependencies'][0]['sha256'] = 'c' * 64
            with self.assertRaisesRegex(module.Refused, 'BUDGET_READER_CHAIN'): self.check(value)

    def test_stale_future_naive_and_incorrect_sum_rejected(self):
        for seconds in (-121, 1):
            value = copy.deepcopy(self.budget)
            value['at'] = (self.now + datetime.timedelta(seconds=seconds)).isoformat()
            with self.assertRaisesRegex(module.Refused, 'BUDGET_FRESH'): self.check(value)
        value = copy.deepcopy(self.budget);value['at'] = '2026-10-27T00:00:00'
        with self.assertRaisesRegex(module.Refused, 'BUDGET_FRESH'): self.check(value)
        value = copy.deepcopy(self.budget);value['totalAllocatedBytes'] += 1
        with self.assertRaisesRegex(module.Refused, 'BUDGET_SUM'): self.check(value)

    def test_exact_reservation_boundary_and_one_byte_over(self):
        value = copy.deepcopy(self.budget)
        value['rows'][0]['allocatedBytes'] += module.CAP - module.RESERVE - value['totalAllocatedBytes']
        value['totalAllocatedBytes'] = module.CAP - module.RESERVE
        self.check(value)
        value['rows'][0]['allocatedBytes'] += 1;value['totalAllocatedBytes'] += 1
        with self.assertRaisesRegex(module.Refused, 'BUDGET_FRESH_CAP'): self.check(value)

    def test_negative_bool_float_allocations_and_narrowed_scope_rejected(self):
        for allocation in (-1, True, 1.5):
            value = copy.deepcopy(self.budget);value['rows'][0]['allocatedBytes'] = allocation
            with self.assertRaisesRegex(module.Refused, 'BUDGET_ROW_TYPES'): self.check(value)
        value = copy.deepcopy(self.budget);value['scopeNarrowed'] = True
        with self.assertRaisesRegex(module.Refused, 'BUDGET_NARROWED'): self.check(value)


class TargetTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='offline-deb-boundary-')
        self.root = Path(self.tmp.name).resolve()
        self.paths = {key: str(self.root / key) for key in ('input', 'base', 'target', 'output')}
        for key in ('input', 'base'): Path(self.paths[key]).mkdir(mode=0o700)
        self.root_patch = patch.object(module, 'ROOT', self.root);self.root_patch.start()
        # UID metadata alone is simulated for this Mac fixture. Real path types,
        # links, collisions, exclusive writes and contents use this temporary tree.
        original = Path.lstat
        def owned(path):
            values = list(original(path));values[4] = 1100
            return os.stat_result(values)
        self.owner_patch = patch.object(Path, 'lstat', owned);self.owner_patch.start()

    def tearDown(self):
        self.owner_patch.stop();self.root_patch.stop();self.tmp.cleanup()

    def test_new_target_changes_no_files(self):
        self.assertEqual(module.target_paths(self.paths)['target'], self.root / 'target')
        self.assertFalse((self.root / 'target').exists())
        self.assertFalse((self.root / 'output').exists())

    def test_existing_target_or_evidence_never_reused(self):
        for key in ('target', 'output'):
            path = self.root / key;path.mkdir()
            sentinel = path / 'keep';sentinel.write_bytes(b'old evidence')
            with self.assertRaisesRegex(module.Refused, 'TARGET_EXISTS'): module.target_paths(self.paths)
            self.assertEqual(sentinel.read_bytes(), b'old evidence')
            sentinel.unlink();path.rmdir()  # Fixture only; installer has no deletion path.

    def test_symlink_input_and_dangling_target_rejected(self):
        link = self.root / 'input-link';link.symlink_to(self.root / 'input')
        value = {**self.paths, 'input': str(link)}
        with self.assertRaisesRegex(module.Refused, 'EXISTING_DIRECTORY'): module.target_paths(value)
        (self.root / 'target').symlink_to(self.root / 'absent')
        with self.assertRaisesRegex(module.Refused, 'TARGET_EXISTS'): module.target_paths(self.paths)

    def test_parent_escape_noncanonical_and_path_collision_rejected(self):
        for value in (str(self.root / '..' / 'elsewhere'), '/home/other/target',
                      str(self.root) + '//target', self.paths['input']):
            with self.subTest(path=value), self.assertRaises(module.Refused):
                module.target_paths({**self.paths, 'target': value})

    def test_fresh_binding_records_new_identity_and_is_exclusive(self):
        identity = {'hostname': 'approved-new-host', 'bootId': '99999999-1111-2222-3333-444444444444',
                    'uid': 1100, 'gid': 1100, 'architecture': 'aarch64', 'osId': 'ubuntu', 'osVersion': '24.04'}
        args = SimpleNamespace(**self.paths, base_install_sha256='d' * 64, budget_policy_sha256='e' * 64)
        with patch.object(module, 'platform_identity', return_value=identity), \
             patch.object(module, 'base_install') as receipt, patch.object(module, 'scope_policy'):
            result = module.prepare_target(args)
            receipt.assert_called_once_with(self.root / 'base', 'd' * 64)
            path = self.root / 'input/target-binding.json';raw = path.read_bytes()
            binding = json.loads(raw)
            self.assertEqual(binding['platform'], identity)
            self.assertEqual(result['bindingSha256'], hashlib.sha256(raw).hexdigest())
            self.assertFalse(result['authorizationGranted'])
            self.assertNotIn('failure', raw.decode().lower())
            with self.assertRaises(FileExistsError): module.prepare_target(args)
            self.assertEqual(path.read_bytes(), raw)
        changed = {**identity, 'bootId': 'different-current-boot'}
        with patch.object(module, 'platform_identity', return_value=changed), \
             patch.object(module, 'load', return_value=binding):
            with self.assertRaisesRegex(module.Refused, 'TARGET_IDENTITY_CHANGED'):
                module.fixed_inputs(SimpleNamespace(input=self.paths['input'], binding_sha256='f' * 64))
        self.assertFalse((self.root / 'target').exists())
        self.assertFalse((self.root / 'output').exists())


class CommandTests(unittest.TestCase):
    def test_payload_phase_cannot_report_native_success_or_call_loader(self):
        tree = {'regularFiles': 2263, 'symlinks': 135, 'treeVerified': True}
        with patch.object(module, 'verify_tree', return_value=tree) as verify, \
             patch.object(module, 'loader_checks', side_effect=AssertionError('native execution forbidden')):
            actual, loader, status = module.final_verification(defer_native_checks=True)
            self.assertEqual(actual, tree)
            self.assertIsNone(loader)
            self.assertEqual(status, 'FIXED_RUNTIME_PAYLOAD_EXTRACTED_AND_READBACK_VERIFIED')
            self.assertEqual(verify.call_count, 2)

    def test_payload_phase_still_refuses_invalid_or_changing_tree(self):
        for values in ([module.Refused('EXTRACTED_FILE')], [{'files': 1}, {'files': 2}]):
            with patch.object(module, 'verify_tree', side_effect=values), \
                 patch.object(module, 'loader_checks') as native:
                with self.assertRaises(module.Refused): module.final_verification(True)
                native.assert_not_called()

    def test_default_still_requires_complete_native_coverage(self):
        for count in (133, 134):
            with patch.object(module, 'verify_tree', return_value={'treeVerified': True}), \
                 patch.object(module, 'loader_checks', return_value={'elfCount': count, 'versionCommands': 9}):
                if count == 133:
                    with self.assertRaisesRegex(module.Refused, 'FIXED_VERIFICATION_COVERAGE'):
                        module.final_verification()
                else:
                    self.assertEqual(module.final_verification()[2], 'NEW_PREFIX_RUNTIME_PAYLOAD_AND_ELF_VERIFIED')

    def test_install_without_execute_does_not_read_or_write(self):
        result = subprocess.run([sys.executable, '-I', '-B', str(HELPER), 'install',
                                 '--input', '/path/never-created', '--binding-sha256', 'absent',
                                 '--budget-sha256', 'absent'], capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), {'status': 'PLAN_NOT_EXECUTED'})

    def test_duplicate_json_keys_rejected(self):
        with self.assertRaisesRegex(module.Refused, 'DUPLICATE_JSON_KEY'):
            json.loads('{"target":1,"target":2}', object_pairs_hook=module.unique_object)


if __name__ == '__main__': unittest.main()
