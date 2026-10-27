"""Bounded configuration guard tests; these do not claim Linux installation."""
import copy
import datetime as dt
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


def load(name):
    path = Path(__file__).with_name(name+'.py')
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


m, policy = load('prepare_instance'), load('instance_policy')


class ConfigurationGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.db = 'postgresql://'+m.DB_ROLE+':'+'a'*32+'@127.0.0.1:5432/'+m.DB_NAME+'?schema=public'

    def tearDown(self):
        self.temp.cleanup()

    def test_default_plan_never_reads_nonexistent_inputs(self):
        p = subprocess.run([sys.executable, '-I', '-B', str(Path(m.__file__)), '--binding', '/missing/b',
                            '--binding-sha256', 'bad', '--budget', '/missing/q', '--budget-sha256', 'bad'],
                           capture_output=True, text=True)
        self.assertEqual(p.returncode, 0)
        self.assertEqual(json.loads(p.stdout)['status'], 'PLAN_ONLY_NO_TARGET_READ_OR_WRITE')

    def test_database_target_and_role_are_exact(self):
        self.assertEqual(m.database_url(self.db), self.db)
        for bad in [self.db.replace(m.DB_ROLE, 'truck_color_app'), self.db.replace(m.DB_NAME, 'truck_color_recovery_r24_20261025'),
                    self.db.replace('127.0.0.1', 'example.com'), self.db+'&connection_limit=20', self.db+'#fragment',
                    self.db.replace('a'*32, 'short'), self.db+'\n']:
            with self.subTest(url_kind='invalid'), self.assertRaises(RuntimeError):
                m.database_url(bad)

    def test_private_read_rejects_symlink_and_hardlink(self):
        p = self.root/'value'
        p.write_bytes(b'private')
        p.chmod(0o600)
        alias = self.root/'alias'
        alias.symlink_to(p)
        with self.assertRaises(RuntimeError):
            m.read(alias, owner=os.getuid())
        alias.unlink()
        os.link(p, alias)
        with self.assertRaises(RuntimeError):
            m.read(p, owner=os.getuid())

    def test_read_rejects_bound_and_writable_input(self):
        p = self.root/'value'
        p.write_bytes(b'abc')
        p.chmod(0o600)
        with self.assertRaises(RuntimeError):
            m.read(p, owner=os.getuid()+1)
        with self.assertRaises(RuntimeError):
            m.read(p, 2, owner=os.getuid())
        p.chmod(0o666)
        with self.assertRaises(RuntimeError):
            m.read(p, owner=os.getuid())

    def test_exclusive_output_preserves_existing_file(self):
        p = self.root/'receipt'
        m.write_new(p, {'original': True})
        with self.assertRaises(FileExistsError):
            m.write_new(p, {'replacement': True})
        self.assertEqual(json.loads(p.read_text()), {'original': True})

    def test_support_never_executes_unpinned_bytes(self):
        p = self.root/'support.py'
        p.write_text('raise AssertionError("must not execute")')
        p.chmod(0o600)
        real_read = m.read
        with patch.object(m, 'HERE', self.root), patch.object(m, 'read', lambda p, limit: real_read(p, limit, owner=os.getuid())):
            with self.assertRaisesRegex(RuntimeError, 'SUPPORT_PIN'):
                m.support('support.py', '0'*64)

    def test_generated_policy_keeps_security_and_isolates_ports(self):
        env = policy.environment({'DATABASE_URL': self.db}, 'b'*64, self.root, 'synthetic-fresh-r30', m.IDENTITY)
        self.assertEqual(len(env), 46)
        self.assertEqual(env['AUTH_MOCK_ENABLED'], 'false')
        self.assertEqual(env['LOCAL_RUNTIME_PROFILE'], 'loopback-https')
        self.assertEqual(env['CLAMAV_MAX_SIGNATURE_AGE_HOURS'], '48')
        self.assertEqual(env['ATTACHMENT_STORAGE_PURGED_METADATA_RETENTION_MS'], '7776000000')
        self.assertEqual(env['SESSION_COOKIE_NAME'], 'ft_a2_fresh_r30')
        self.assertEqual(env['PORT'], '3594')
        self.assertEqual(env['REDIS_URL'], 'redis://:'+'b'*64+'@127.0.0.1:6381')
        self.assertEqual(env['FRONTEND_URL'], 'https://localhost:45474')
        proxy = m.proxy_text(self.root, Path('/home/recovery/offline-software-test'))
        self.assertIn('api?3594:3595', proxy)
        self.assertIn("listen(45474,'127.0.0.1')", proxy)
        self.assertNotIn('45464', proxy)

    def test_redis_is_bounded_and_durable(self):
        value = m.redis_text(self.root, 'a'*64)
        for line in ['protected-mode yes', 'daemonize no', 'port 6381', 'maxclients 16', 'maxmemory 33554432',
                     'appendfsync always', 'aof-load-truncated no', 'maxmemory-policy noeviction']:
            self.assertIn(line+'\n', value)
        with self.assertRaises(RuntimeError):
            m.redis_text(self.root, 'bad\nport 6379')

    def budget_inputs(self):
        roots = ['/r1', '/r2', '/r3', '/r4']
        reader = {'entrySha256': 'a'*64, 'dependencies': [{'name': 'helper', 'sha256': 'b'*64}]}
        policy = {'kind': 'OFFLINE_HOST_BUDGET_SCOPE_V1', 'limit': 24*1024**3, 'expectedRootPaths': roots, 'reader': reader}
        receipt = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'scopeNarrowed': False, 'reader': reader,
                   'limit': policy['limit'], 'rows': [{'path': x, 'allocatedBytes': 100} for x in roots], 'totalAllocatedBytes': 400}
        return policy, receipt

    def test_budget_rejects_omission_stale_changed_reader_and_low_capacity(self):
        policy, receipt = self.budget_inputs()
        bad_cases = []
        b = copy.deepcopy(receipt); b['rows'].pop(); bad_cases.append(b)
        b = copy.deepcopy(receipt); b['reader']['entrySha256'] = 'c'*64; bad_cases.append(b)
        b = copy.deepcopy(receipt); b['at'] = '2000-01-01T00:00:00+00:00'; bad_cases.append(b)
        b = copy.deepcopy(receipt); b['totalAllocatedBytes'] = 1; bad_cases.append(b)
        for bad in bad_cases:
            with patch.object(m, 'pinned', side_effect=[policy, bad]), patch.object(m.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=2*1024**3)):
                with self.assertRaises(RuntimeError): m.budget({'budgetPolicy': {}}, {})
        with patch.object(m, 'pinned', side_effect=[policy, receipt]), patch.object(m.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=2*1024**3)):
            self.assertEqual(m.budget({'budgetPolicy': {}}, {})['hostAllocatedBytes'], 400)
        with patch.object(m, 'pinned', side_effect=[policy, receipt]), patch.object(m.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=1024**3)):
            with self.assertRaises(RuntimeError): m.budget({'budgetPolicy': {}}, {})

    def test_payload_only_cannot_enter_native_admission(self):
        with patch.object(m, 'pinned', return_value={'status': 'FIXED_RUNTIME_PAYLOAD_EXTRACTED_AND_READBACK_VERIFIED'}):
            with self.assertRaisesRegex(RuntimeError, 'FULL_NATIVE_DEPENDENCIES'):
                m.native_admission({'dependencyReceipt': {'sha256': m.DEPS_SHA}}, types.SimpleNamespace())

    def test_existing_object_dependencies_and_privileged_role_are_rejected(self):
        state = {'kind': 'A2_DATABASE_READONLY_STATE_VERIFIED', 'at': dt.datetime.now(dt.timezone.utc).isoformat(),
                 'database': m.DB_NAME, 'role': m.DB_ROLE, 'owner': m.DB_ROLE,
                 'readOnlyTransaction': 'on', 'databaseWrites': False,
                 'connectionLimit': 3, 'memberships': 0, 'completedMigrations': 54,
                 'migrationNamesEqualApprovedInitialization': True,
                 'initializationReceiptSha256': 'd911ef383340521b3d23caa7945e13c6e660cbc8602da6c9b54cab90ea3fa8ee'}
        state.update({k: False for k in ('superuser', 'createdb', 'createrole', 'replication', 'bypassrls', 'inherit')})
        state.update({k: 0 for k in ('attachments', 'sheetImages', 'colorImportBatches', 'reservations', 'incompleteMigrations')})
        state.update({k: 1 for k in ('users', 'admins', 'credentials', 'usableCredentials', 'initializations', 'adminRoleLinks')})
        with patch.object(m, 'pinned', return_value=state):
            self.assertEqual(m.database_state({}), state)
        for key, value in [('attachments', 1), ('sheetImages', 1), ('colorImportBatches', 1), ('reservations', 1),
                           ('superuser', True), ('migrationNamesEqualApprovedInitialization', False),
                           ('role', 'truck_color_app'), ('at', '2000-01-01T00:00:00+00:00')]:
            bad = {**state, key: value}
            with self.subTest(field=key), patch.object(m, 'pinned', return_value=bad):
                with self.assertRaises(RuntimeError): m.database_state({})


if __name__ == '__main__':
    unittest.main()
