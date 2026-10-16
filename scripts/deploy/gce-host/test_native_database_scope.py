import hashlib
import unittest
from unittest.mock import patch
import native_database_scope as scope
import native_backup_controller as backup


class DatabaseScopeTests(unittest.TestCase):
    def test_only_exact_prefix_and_original_tail_are_accepted(self):
        original=b'local all all peer\nhost all all 127.0.0.1/32 scram-sha-256\n'
        with patch.object(scope,'BASE_SHA',hashlib.sha256(original).hexdigest()):
            self.assertTrue(scope.scope_bytes_valid(scope.PREFIX+original))
            for changed in [original, b'host all all 0.0.0.0/0 trust\n'+scope.PREFIX+original,
                            scope.PREFIX+original+b'\n', scope.PREFIX.replace(b'reject',b'trust')+original]:
                self.assertFalse(scope.scope_bytes_valid(changed))

    def test_wrong_recovery_identity_never_changes_role(self):
        with patch.object(scope.Path,'exists',return_value=True),patch.object(backup,'read_json',return_value={'database':'feishu_timeline'}),patch.object(scope,'close_role') as close:
            with self.assertRaises(backup.Failure):scope.recover()
            close.assert_not_called()

    def test_pending_journal_blocks_api_credential_use(self):
        with patch.object(scope.Path,'exists',return_value=True),patch.object(backup,'read_json') as read:
            with self.assertRaises(backup.Failure):scope.verify()
            read.assert_not_called()

    def test_changed_effective_hba_path_blocks_start(self):
        with patch.object(scope.Path,'exists',return_value=False),patch.object(backup,'read_json',return_value=scope.JOURNAL),\
             patch.object(backup,'sql',return_value='/other/pg_hba.conf'),patch.object(scope,'probe') as probe:
            with self.assertRaises(backup.Failure):scope.verify()
            probe.assert_not_called()

    def test_unloaded_hba_rules_cannot_pass_with_password_failure(self):
        class Result:
            returncode=2
            stderr=b'password authentication failed'
        with patch.object(scope.Path,'exists',return_value=False),patch.object(backup,'read_json',return_value=scope.JOURNAL),\
             patch.object(backup,'sql',side_effect=[str(scope.HBA),'0']),patch.object(scope,'read_hba'),\
             patch.object(scope,'scope_bytes_valid',return_value=True),patch.object(scope,'probe',return_value=Result()):
            with self.assertRaises(backup.Failure):scope.verify()

    def test_closed_role_is_verified_and_connections_are_drained(self):
        replies=['', '1', '0', 't']
        with patch.object(backup,'role_change') as role,patch.object(backup,'sql',side_effect=replies) as sql,patch.object(scope.time,'sleep'):
            scope.close_role()
            self.assertIn('"timeline_restore_c38c57da" NOLOGIN',role.call_args.args[0])
            self.assertTrue(all('feishu_timeline_app' not in call.args[0] for call in sql.call_args_list))
        with patch.object(backup,'role_change'),patch.object(backup,'sql',side_effect=['','0','f']):
            with self.assertRaises(backup.Failure):scope.close_role()

    def test_failed_scope_install_still_closes_role_and_retains_journal(self):
        # Exercise a failure after opening a pre-existing accepted HBA installation,
        # without touching real files. No success receipt may be written.
        calls=[]
        class Info:st_mode=0o40700
        with patch.object(backup,'directory',return_value=9),patch.object(scope.os,'fstat',return_value=Info()),patch.object(scope.os,'close'),\
             patch.object(scope.Path,'exists',side_effect=[False,False]),patch.object(scope,'read_hba',return_value=scope.PREFIX+b'baseline'),\
             patch.object(scope,'scope_bytes_valid',return_value=True),patch.object(backup,'sql',side_effect=[str(scope.HBA),'t','0','0','f']),\
             patch.object(backup,'write_json',side_effect=lambda *args:calls.append(args)),patch.object(scope,'close_role') as close:
            with self.assertRaises(backup.Failure):scope.install()
            close.assert_called_once()
            self.assertEqual(len(calls),1)
            self.assertEqual(calls[0][0],scope.ROOT/'pg-scope-pending.json')


if __name__=='__main__':unittest.main()
