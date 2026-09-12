import json
from pathlib import Path
import unittest
from unittest.mock import patch

import native_migration_probe as probe
import native_backup_controller as backup


class ProjectionTests(unittest.TestCase):
    def test_projection_uses_only_captured_columns_and_preserves_old_migration_rows(self):
        names = ['20260811090000_migration_' + str(i) for i in range(26)]
        with patch.object(probe, 'query', return_value='26:' + 'a' * 64) as query:
            result = probe.projection('_prisma_migrations', ['id', 'migration_name', 'checksum'], names)
        sql = query.call_args.args[0]
        self.assertIn('SELECT "id","migration_name","checksum" FROM public."_prisma_migrations" WHERE migration_name IN (', sql)
        self.assertNotIn('SELECT *', sql)
        self.assertEqual(result, {'count': 26, 'sha256': 'a' * 64})

    def test_identifier_injection_never_reaches_sql(self):
        with patch.object(probe, 'query') as query:
            for name in ['users; DROP TABLE users', 'users"', '../users', '', 'a' * 64]:
                with self.assertRaises(backup.Failure):
                    probe.projection(name, ['id'])
            query.assert_not_called()

    def test_historical_migration_filter_cannot_select_another_table(self):
        with patch.object(probe, 'query') as query:
            with self.assertRaises(backup.Failure):
                probe.projection('users', ['id'], ['20260912190000_native_accounts'] * 26)
            query.assert_not_called()

    def test_unknown_incomplete_or_oversized_migration_state_rejected(self):
        for rows in [[{'finished': False, 'rolled_back': False}], [{'finished': True, 'rolled_back': True}],
                     [{'finished': True, 'rolled_back': False}] * 65]:
            with patch.object(probe, 'query', return_value=json.dumps(rows)):
                with self.assertRaises(backup.Failure):
                    probe.migration_rows()


class RecoveryTests(unittest.TestCase):
    def test_manifest_interruption_has_prior_journal_and_runs_recovery(self):
        receipt = {'database': probe.DATABASE, 'role': probe.ROLE, 'databaseAndObjectsVerified': True,
                   'manifestSha256': '691880a21aceb71992e78762b0082bc37a73d8a656b025a84b5d1adc283989f0'}
        credentials = {'database': probe.DATABASE, 'role': probe.ROLE, 'password': 'a' * 48}
        image = {'Config': {'Labels': {'org.opencontainers.image.revision': probe.COMMIT,
                                      'com.feishu-timeline.source-tree': probe.TREE}}, 'RepoDigests': [probe.IMAGE]}
        with patch.object(Path, 'exists', return_value=False), \
             patch.object(backup, 'read_json', side_effect=[receipt, credentials]), \
             patch.object(backup, 'sql', side_effect=['t', '0', '0']), \
             patch.object(probe, 'query', return_value='1048576'), \
             patch.object(probe, 'docker', return_value=json.dumps([image]).encode()), \
             patch.object(probe, 'inspect', return_value=None), \
             patch.object(backup, 'write_json') as write, patch.object(probe, 'recover') as recover:
            def interrupt():
                self.assertEqual(write.call_args.args[0], probe.ROOT / 'pending.json')
                raise InterruptedError('Manifest client killed')
            with patch.object(probe, 'candidate_manifest', side_effect=interrupt):
                with self.assertRaises(InterruptedError):
                    probe.probe()
            recover.assert_called_once()

    def test_owned_container_requires_exact_image_and_label_before_stop(self):
        item = {'Config': {'Labels': {}, 'Image': probe.IMAGE}, 'State': {'Running': True}}
        class Result:
            returncode = 0
            stdout = json.dumps([item]).encode()
            stderr = b''
        with patch.object(probe.subprocess, 'run', return_value=Result()), patch.object(probe, 'docker') as docker:
            with self.assertRaises(backup.Failure):
                probe.stop_owned(probe.CONTAINER)
            docker.assert_not_called()

    def test_database_login_closes_even_if_container_cleanup_fails(self):
        journal = {'database': probe.DATABASE, 'role': probe.ROLE, 'container': probe.CONTAINER, 'commit': probe.COMMIT}
        def exists(path):
            return path.name == 'pending.json'
        with patch.object(Path, 'exists', exists), patch.object(backup, 'read_json', return_value=journal), \
             patch.object(probe, 'stop_owned', side_effect=backup.Failure('injected Docker failure')), \
             patch.object(backup, 'role_change') as change, \
             patch.object(backup, 'sql', side_effect=['', 't', '0']), \
             patch.object(Path, 'unlink') as remove:
            with self.assertRaisesRegex(backup.Failure, 'resources retained'):
                probe.recover()
            change.assert_called_once_with('ALTER ROLE "timeline_restore_c38c57da" NOLOGIN CONNECTION LIMIT 1;')
            remove.assert_not_called()

    def test_role_recovery_refuses_another_database_journal(self):
        journal = {'database': 'feishu_timeline', 'role': probe.ROLE, 'container': probe.CONTAINER, 'commit': probe.COMMIT}
        with patch.object(Path, 'exists', return_value=True), patch.object(backup, 'read_json', return_value=journal), \
             patch.object(probe, 'stop_owned') as stop, patch.object(backup, 'role_change') as change:
            with self.assertRaises(backup.Failure):
                probe.recover()
            stop.assert_not_called()
            change.assert_not_called()

    def test_migration_never_accepts_another_restore_receipt(self):
        with patch.object(Path, 'exists', return_value=False), \
             patch.object(backup, 'read_json', return_value={'database': 'feishu_timeline', 'role': probe.ROLE}), \
             patch.object(backup, 'role_change') as change:
            with self.assertRaises(backup.Failure):
                probe.probe()
            change.assert_not_called()


if __name__ == '__main__':
    unittest.main()
