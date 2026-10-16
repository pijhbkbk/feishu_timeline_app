import unittest
from unittest.mock import patch
import native_candidate_check as check
import native_backup_controller as backup


class CandidateCleanupTests(unittest.TestCase):
    def test_cleanup_closes_database_even_when_docker_cannot_stop_a_service(self):
        with patch.object(check.pathlib.Path,'exists',return_value=True),\
             patch.object(check,'validate'),patch.object(backup,'read_json',return_value=check.IDENTITY),\
             patch.object(check.app,'run',side_effect=backup.Failure('Docker unavailable')),\
             patch.object(check.app.database_scope,'close_role') as close,patch.object(check.pathlib.Path,'unlink') as unlink:
            with self.assertRaisesRegex(backup.Failure,'cleanup incomplete'):check.cleanup()
            close.assert_called_once();unlink.assert_not_called()

    def test_postgres_failure_still_attempts_both_service_stops(self):
        with patch.object(check.pathlib.Path,'exists',return_value=True),patch.object(check,'validate'),\
             patch.object(backup,'read_json',return_value=check.IDENTITY),patch.object(check.app,'run') as run,\
             patch.object(check.app,'inspect',return_value=None),patch.object(check.app.database_scope,'close_role',side_effect=backup.Failure('PG down')),\
             patch.object(check.pathlib.Path,'unlink') as unlink:
            with self.assertRaises(backup.Failure):check.cleanup()
            self.assertEqual(run.call_count,2);unlink.assert_not_called()

    def test_unknown_journal_cannot_stop_application(self):
        with patch.object(check.pathlib.Path,'exists',return_value=True),patch.object(check,'validate'),\
             patch.object(backup,'read_json',return_value={'check':'unknown'}),patch.object(check.app,'run') as run:
            with self.assertRaises(backup.Failure):check.cleanup()
            run.assert_not_called()

    def test_no_journal_is_a_noop_after_later_runtime_updates(self):
        with patch.object(check.pathlib.Path,'exists',return_value=False),patch.object(check,'validate') as validate,\
             patch.object(check.app.database_scope,'close_role') as close:
            check.cleanup();validate.assert_not_called();close.assert_not_called()

    def test_live_container_prevents_cleanup_receipt_removal(self):
        with patch.object(check.pathlib.Path,'exists',return_value=True),patch.object(check,'validate'),\
             patch.object(backup,'read_json',return_value=check.IDENTITY),patch.object(check.app,'run'),\
             patch.object(check.app,'inspect',return_value={'State':{'Running':True,'Pid':123}}),\
             patch.object(check.app.database_scope,'close_role') as close,patch.object(check.pathlib.Path,'unlink') as unlink:
            with self.assertRaises(backup.Failure):check.cleanup()
            close.assert_called_once();unlink.assert_not_called()


if __name__=='__main__':unittest.main()
