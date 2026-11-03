from contextlib import ExitStack
from pathlib import Path
from types import SimpleNamespace
import json
import tempfile
import unittest
from unittest.mock import patch
import native_backup_controller as backup
import native_v1_prepare as prepare


class PreparationTests(unittest.TestCase):
    def test_baseline_rejects_other_program_pending_or_missing_old_anchor(self):
        with patch.object(prepare.previous, 'record', return_value={'phase': 'COMMITTED'}) as record, \
                patch.object(prepare.release, 'state', return_value=prepare.previous.stable(prepare.BASE)) as state, \
                patch.object(prepare.release, 'verify_checkout') as checkout:
            prepare.baseline()
            checkout.assert_called_once_with(prepare.BASE)
            for field in ['active', 'committed']:
                state.return_value = {**prepare.previous.stable(prepare.BASE), field: 'a' * 40}
                with self.assertRaises(backup.Failure): prepare.baseline()
            state.return_value = prepare.previous.stable(prepare.BASE)
            record.return_value = {'phase': 'PREPARED'}
            with self.assertRaises(backup.Failure): prepare.baseline()

    def test_snapshot_preserves_backup_before_resume_and_never_calls_migration(self):
        events = []
        with ExitStack() as stack:
            folder = Path(stack.enter_context(tempfile.TemporaryDirectory()))
            stack.enter_context(patch.object(prepare, 'ROOT', folder / 'new'))
            stack.enter_context(patch.object(backup, 'locked'))
            stack.enter_context(patch.object(prepare, 'baseline'))
            stack.enter_context(patch.object(prepare.release, 'state', return_value=prepare.previous.stable(prepare.BASE)))
            stack.enter_context(patch.object(backup, 'read_json', return_value={
                'base': prepare.BASE, 'migrations': {f'{index:014d}_m': 'a' * 64 for index in range(54)}}))
            for obj, name in [(prepare.preservation, 'migration_rows'), (prepare.release, 'verify_running'),
                              (backup, 'fsync_dir'), (backup, 'write_json'), (prepare.protection, 'assert_frozen')]:
                stack.enter_context(patch.object(obj, name))
            stack.enter_context(patch.object(backup, 'read_file', return_value=b'synthetic receipt'))
            stack.enter_context(patch.object(prepare, 'event', side_effect=lambda phase, *args: events.append(phase)))
            stack.enter_context(patch.object(prepare.release, 'replace_state', side_effect=lambda value: events.append('pending')))
            stack.enter_context(patch.object(prepare.release, 'close_program', side_effect=lambda **kw: events.append('drain')))
            stack.enter_context(patch.object(prepare.protection, 'protect', side_effect=lambda *args: events.append('backup') or {'backup': 'test'}))
            stack.enter_context(patch.object(prepare.preservation, 'capture_before', side_effect=lambda *args: events.append('capture')))
            stack.enter_context(patch.object(prepare.protection, 'verify_protection', side_effect=lambda *args: events.append('compare')))
            stack.enter_context(patch.object(prepare, 'resume', side_effect=lambda: events.append('resume')))
            result = prepare.snapshot()
        self.assertEqual(events, ['INTENT', 'pending', 'drain', 'backup', 'capture', 'compare', 'PROTECTED', 'resume'])
        self.assertFalse(result['productionMigrated'])
        self.assertFalse(result['productionRestored'])

    def test_resume_checks_old_anchor_before_any_write_enable(self):
        with patch.object(backup, 'locked'), patch.object(prepare, 'saved'), \
                patch.object(prepare, 'baseline', side_effect=backup.Failure('anchor changed')), \
                patch.object(prepare.release, 'replace_state') as state, \
                patch.object(prepare.protection, 'resume_dependencies') as resume:
            with self.assertRaisesRegex(backup.Failure, 'anchor changed'): prepare.resume()
            state.assert_not_called()
            resume.assert_not_called()

    def test_current_program_backup_requires_committed_phase_and_exact_54_tables(self):
        protection = prepare.protection
        with ExitStack() as stack:
            stack.enter_context(patch.object(prepare.release, 'state', return_value={
                **prepare.previous.stable(prepare.BASE), 'pending': True}))
            record = stack.enter_context(patch.object(prepare.previous, 'record', return_value={'phase': 'COMMITTED'}))
            for obj, name in [(protection.scope, 'verify'), (protection.scope, 'close_role'),
                              (protection.redis, 'validate_files'), (protection.redis, 'validate_container'),
                              (protection.redis, 'stop'), (protection, 'assert_frozen'), (prepare.cutover, 'systemctl')]:
                stack.enter_context(patch.object(obj, name))
            stack.enter_context(patch.object(protection.redis, 'inspect', return_value={'State': {'Running': True}}))
            stack.enter_context(patch.object(protection.redis, 'run', return_value=json.dumps([
                {'RepoDigests': [protection.redis.IMAGE], 'Id': 'synthetic'}]).encode()))
            stack.enter_context(patch.object(protection.shutil, 'disk_usage', return_value=SimpleNamespace(free=3*1024**3)))
            fingerprints = stack.enter_context(patch.object(backup, 'fingerprints', return_value={'tables': dict.fromkeys(range(53))}))
            quiescence = {'apiWasRunning': True, 'apiDrainSupported': True, 'apiExitCode': 0,
                          'apiGracefulDrainVerified': True, 'legacyApiFreezeOnly': False}
            with self.assertRaisesRegex(backup.Failure, 'table inventory'):
                protection.protect(prepare.BASE, quiescence)
            fingerprints.return_value = {'tables': dict.fromkeys(range(54))}
            record.return_value = {'phase': 'PREPARED'}
            with self.assertRaisesRegex(backup.Failure, 'must be committed'):
                protection.protect(prepare.BASE, quiescence)
            record.return_value = {'phase': 'COMMITTED'}
            # Stop before directory creation on the real fixed backup root.
            with patch.object(protection.secrets, 'token_hex', side_effect=RuntimeError('scope passed')):
                with self.assertRaisesRegex(RuntimeError, 'scope passed'):
                    protection.protect(prepare.BASE, quiescence)


if __name__ == '__main__':
    unittest.main()
