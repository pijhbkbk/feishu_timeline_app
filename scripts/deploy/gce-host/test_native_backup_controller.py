import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import native_backup_controller as backup


class FileBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.source = self.root / 'source'
        self.source.mkdir()
        # Test data belongs to this unprivileged runner. Production always checks 0.
        self.fsync = patch.object(backup, 'fsync_dir', self.sync_test_directory)
        self.fsync.start()

    def tearDown(self):
        self.fsync.stop()
        self.temp.cleanup()

    @staticmethod
    def sync_test_directory(path):
        fd = backup.directory(path, trusted=False)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

    def test_copies_nested_data_with_exact_bytes_and_private_modes(self):
        (self.source / 'nested').mkdir()
        (self.source / 'nested' / 'item.bin').write_bytes(b'example\x00payload')
        records = backup.copy_objects(self.source, self.root / 'target')
        self.assertEqual(records, [{'path': 'objects/nested/item.bin', 'size': 15,
                                    'sha256': backup.sha(b'example\x00payload')}])
        actual = self.root / 'target/nested/item.bin'
        self.assertEqual(actual.read_bytes(), b'example\x00payload')
        self.assertEqual(actual.stat().st_mode & 0o777, 0o600)

    def test_empty_tree_still_compares_inventory(self):
        self.assertEqual(backup.copy_objects(self.source, self.root / 'target', expected=[]), [])

    def test_symlink_file_does_not_read_external_bytes(self):
        external = self.root / 'secret'
        external.write_bytes(b'not an object')
        (self.source / 'link').symlink_to(external)
        with self.assertRaises(backup.Failure):
            backup.copy_objects(self.source, self.root / 'target')
        self.assertFalse((self.root / 'target/link').exists())

    def test_symlink_parent_is_rejected(self):
        (self.root / 'alias').symlink_to(self.source, target_is_directory=True)
        with self.assertRaises(OSError):
            backup.copy_objects(self.root / 'alias', self.root / 'target')

    def test_hardlinked_object_is_rejected(self):
        (self.source / 'first').write_bytes(b'data')
        os.link(self.source / 'first', self.source / 'second')
        with self.assertRaises(backup.Failure):
            backup.copy_objects(self.source, self.root / 'target')

    def test_fifo_is_rejected_without_blocking(self):
        os.mkfifo(self.source / 'pipe')
        with self.assertRaises(backup.Failure):
            backup.copy_objects(self.source, self.root / 'target')

    def test_oversized_object_is_rejected_before_copy(self):
        with (self.source / 'large').open('wb') as stream:
            stream.truncate(backup.MAX_OBJECT + 1)
        with self.assertRaises(backup.Failure):
            backup.copy_objects(self.source, self.root / 'target')

    def test_total_bytes_bound(self):
        (self.source / 'first').write_bytes(b'abc')
        (self.source / 'second').write_bytes(b'def')
        with patch.object(backup, 'MAX_TOTAL', 5), self.assertRaises(backup.Failure):
            backup.copy_objects(self.source, self.root / 'target')

    def test_bounded_directory_inventory(self):
        for name in ['one', 'two', 'three']:
            (self.source / name).mkdir()
        with patch.object(backup, 'MAX_ENTRIES', 2), self.assertRaises(backup.Failure):
            backup.copy_objects(self.source, self.root / 'target')

    def test_read_detects_concurrent_change(self):
        item = self.source / 'item'
        item.write_bytes(b'abc')
        original = os.read
        modified = False
        def changing(fd, count):
            nonlocal modified
            data = original(fd, count)
            if not modified:
                modified = True
                item.write_bytes(b'longer')
            return data
        with patch.object(backup.os, 'read', changing), self.assertRaises(backup.Failure):
            backup.read_file(item, 50)

    def test_inventory_mismatch_does_not_produce_success(self):
        (self.source / 'item').write_bytes(b'data')
        with self.assertRaises(backup.Failure):
            backup.copy_objects(self.source, self.root / 'target', expected=[])

    def test_private_writer_cannot_overwrite_or_follow_link(self):
        target = self.root / 'target'
        target.write_bytes(b'keep')
        with self.assertRaises(FileExistsError):
            backup.write_private(target, b'new')
        self.assertEqual(target.read_bytes(), b'keep')
        (self.root / 'link').symlink_to(target)
        with self.assertRaises(FileExistsError):
            backup.write_private(self.root / 'link', b'new')


class ProtocolTests(unittest.TestCase):
    def test_unsafe_restore_identity_never_connects(self):
        for name, digest in [('../escape', 'a' * 64), ('20260912T000000Z-12345678', 'no')]:
            with patch.object(backup, 'sql') as sql, self.assertRaises(backup.Failure):
                backup.restore(name, digest)
            sql.assert_not_called()

    def test_checkout_cannot_be_executed_as_root(self):
        with patch.object(backup.os, 'geteuid', return_value=0), self.assertRaises(backup.Failure):
            backup.main()

    def test_nonroot_cannot_run_controller(self):
        with patch.object(backup.os, 'geteuid', return_value=501), self.assertRaises(backup.Failure):
            backup.main()

    def test_inactive_source_rejected(self):
        result = subprocess.CompletedProcess([], 3, b'inactive\n', b'')
        with patch.object(backup.subprocess, 'run', return_value=result), self.assertRaises(backup.Failure):
            backup.service_active()

    def test_source_stop_requires_whole_cgroup(self):
        with patch.object(backup, 'command', return_value=b'KillMode=process\nControlGroup=/system.slice/feishu-timeline-api.service\n') as run:
            with self.assertRaises(backup.Failure):
                backup.stop_source()
            self.assertEqual(run.call_count, 1)

    def test_failure_after_quiescing_invokes_source_recovery(self):
        with tempfile.TemporaryDirectory() as root:
            with patch.object(backup, 'ROOT', Path(root)), \
                 patch.object(backup, 'service_active'), patch.object(backup, 'check_scope_and_space'), \
                 patch.object(backup, 'sql', side_effect=['t', '0', '0']), \
                 patch.object(backup, 'write_json') as journal, \
                 patch.object(backup, 'stop_source', side_effect=backup.Failure('injected')), \
                 patch.object(backup, 'recover_source') as recover:
                with self.assertRaises(backup.Failure):
                    backup.snapshot()
                journal.assert_called_once()
                self.assertEqual(journal.call_args.args[0].name, 'source-quiesced.json')
                recover.assert_called_once()
                self.assertFalse(list(Path(root).glob('*/snapshot-complete.json')))

    def test_interrupted_restore_revokes_login_before_removing_journal(self):
        with tempfile.TemporaryDirectory() as root:
            journal = Path(root) / 'restore-pending.json'
            journal.touch()
            value = {'token': '1234abcd', 'role': 'timeline_restore_1234abcd',
                     'database': 'feishu_timeline_restore_1234abcd'}
            with patch.object(backup, 'ROOT', Path(root)), patch.object(backup, 'read_json', return_value=value), \
                 patch.object(backup, 'sql', side_effect=['', '1', '', 't', '0']) as sql, patch.object(backup, 'fsync_dir'):
                backup.recover_restore()
                closure = sql.call_args_list[0].args[0]
                self.assertIn('NOLOGIN', closure)
                self.assertIn('pg_advisory_xact_lock(' + backup.ROLE_CHANGE_LOCK, closure)
                self.assertIn('IF EXISTS', closure)
                self.assertIn("datname='feishu_timeline_restore_1234abcd'", sql.call_args_list[2].args[0])
                self.assertFalse(journal.exists())

    def test_failed_restore_closure_retains_recovery_journal(self):
        with tempfile.TemporaryDirectory() as root:
            journal = Path(root) / 'restore-pending.json'
            journal.touch()
            value = {'token': '1234abcd', 'role': 'timeline_restore_1234abcd',
                     'database': 'feishu_timeline_restore_1234abcd'}
            with patch.object(backup, 'ROOT', Path(root)), patch.object(backup, 'read_json', return_value=value), \
                 patch.object(backup, 'sql', side_effect=['', '1', '', 'f']):
                with self.assertRaises(backup.Failure):
                    backup.recover_restore()
                self.assertTrue(journal.exists())

    def test_restore_journal_cannot_target_existing_application_role(self):
        with tempfile.TemporaryDirectory() as root:
            (Path(root) / 'restore-pending.json').touch()
            value = {'token': '1234abcd', 'role': backup.ROLE, 'database': backup.DATABASE}
            with patch.object(backup, 'ROOT', Path(root)), patch.object(backup, 'read_json', return_value=value), \
                 patch.object(backup, 'sql') as sql, self.assertRaises(backup.Failure):
                backup.recover_restore()
            sql.assert_not_called()

    def test_role_creation_is_serialized_in_server_transaction(self):
        with patch.object(backup, 'sql') as sql:
            backup.role_change('CREATE ROLE "example" NOLOGIN;')
        statement = sql.call_args.args[0]
        self.assertTrue(statement.startswith('BEGIN;'))
        self.assertTrue(statement.endswith(' COMMIT;'))
        self.assertLess(statement.index('pg_advisory_xact_lock(' + backup.ROLE_CHANGE_LOCK),
                        statement.index('CREATE ROLE'))


if __name__ == '__main__':
    unittest.main()
