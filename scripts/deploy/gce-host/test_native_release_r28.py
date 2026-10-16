import copy
import json
import tempfile
from pathlib import Path
from contextlib import ExitStack
import unittest
from unittest.mock import patch
import native_release_r28 as r28
import native_release as release
import native_runtime_app as app
import native_cutover as cutover
import native_release_backup as protection
import native_backup_controller as backup


def stable(commit):
    return {'version': 1, 'active': commit, 'committed': commit, 'pending': False}


class R28BoundaryTests(unittest.TestCase):
    def test_only_the_reviewed_whole_schema_line_transformation_is_accepted(self):
        source = 'unchanged schema\n' + r28.SCHEMA_SOURCE_LINE
        restored = 'unchanged schema\n' + r28.SCHEMA_RESTORED_LINE
        check = lambda a, b: r28.verify_schema_bytes(a, b, backup.sha(a.encode()), backup.sha(b.encode()))
        check(source, restored)
        variants = [restored.replace('500', '501'), restored.replace('4000', '4001'),
                    restored.replace(' AND (char_length(("issueType")::text) <= 500)', ''),
                    restored.replace('::text', '::varchar'), restored + r28.SCHEMA_RESTORED_LINE,
                    restored + 'COMMENT ON TABLE example IS \'changed\';\n',
                    restored + 'ALTER TABLE example SET (fillfactor=80);\n']
        for variant in variants:
            with self.subTest(variant=variant), self.assertRaises(backup.Failure): check(source, variant)
        with self.assertRaises(backup.Failure): check(restored, source)
        with self.assertRaises(backup.Failure): check(source + r28.SCHEMA_SOURCE_LINE, restored)
        with self.assertRaises(backup.Failure): r28.verify_schema_bytes(source, restored, '0' * 64, backup.sha(restored.encode()))
        with self.assertRaises(backup.Failure): r28.verify_schema_bytes(source, restored, backup.sha(source.encode()), '0' * 64)

    def test_restore_requires_exact_data_and_both_fixed_schema_inventories(self):
        source = {'tables': {'example': {'rows': 2, 'sha256': 'rows'}}, 'sequences': {'seq': '2|t'}, 'schemaSha256': 'a' * 64}
        restored = {**copy.deepcopy(source), 'schemaSha256': 'b' * 64}
        r28.verify_restore_fingerprints(source, restored, r28.SCHEMA[37], r28.RESTORED_SCHEMA_37)
        for field in ('tables', 'sequences', 'schemaSha256', 'source_inventory', 'restore_inventory'):
            bad = copy.deepcopy(restored); before = r28.SCHEMA[37]; after = r28.RESTORED_SCHEMA_37
            if field == 'source_inventory': before = 'c' * 64
            elif field == 'restore_inventory': after = 'c' * 64
            else: bad[field] = {} if field != 'schemaSha256' else 'invalid'
            with self.subTest(field=field), self.assertRaises(backup.Failure):
                r28.verify_restore_fingerprints(source, bad, before, after)

    def test_cutover_closes_migration_writers_before_old_receipt_or_service_validation(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            retained = Path(directory) / 'r28-migration-release.json'
            retained.write_text('{"phase":"WRITE_ENABLE_INTENT"}')
            stack.enter_context(patch.object(r28, 'JOURNAL', retained))
            stack.enter_context(patch.object(release, 'operation'))
            stack.enter_context(patch.object(r28, 'journal', return_value={'phase': 'WRITE_ENABLE_INTENT'}))
            stack.enter_context(patch.object(release, 'state', return_value={**stable(r28.TARGET['base']), 'pending': True}))
            role = stack.enter_context(patch.object(r28.scope, 'close_role'))
            app_stop = stack.enter_context(patch.object(release, 'close_program'))
            worker = stack.enter_context(patch.object(r28, 'stop_worker'))
            ctl = stack.enter_context(patch.object(cutover, 'systemctl'))
            prior = stack.enter_context(patch.object(cutover, 'committed_value', side_effect=backup.Failure('bad historical receipt')))
            old = stack.enter_context(patch.object(cutover, 'close_old_role', side_effect=backup.Failure('old cleanup failed')))
            with self.assertRaisesRegex(backup.Failure, 'maintenance retained'): cutover.recover()
            role.assert_called_once(); app_stop.assert_called_once(); worker.assert_called_once()
            ctl.assert_called_once_with('stop', 'timeline-native-redis.service')
            prior.assert_not_called(); old.assert_not_called()

    def test_active_publisher_prevents_early_cutover_cleanup(self):
        with patch.object(r28, 'present', return_value=True), patch.object(release, 'present', return_value=True), \
                patch.object(release, 'operation', side_effect=release.OperationActive('active')), \
                patch.object(r28, 'hold_closed') as close, patch.object(cutover, 'committed_value') as prior:
            with self.assertRaises(release.OperationActive): cutover.recover()
            close.assert_not_called(); prior.assert_not_called()

    def test_missing_release_state_with_retained_journal_closes_all_writers(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            missing = Path(directory) / 'missing-state.json'
            retained = Path(directory) / 'r28-migration-release.json'
            retained.write_text('{"phase":"MIGRATION_STARTED"}')
            stack.enter_context(patch.object(release, 'STATE', missing))
            stack.enter_context(patch.object(r28, 'JOURNAL', retained))
            stack.enter_context(patch.object(release, 'operation'))
            stack.enter_context(patch.object(r28, 'journal', return_value={'phase': 'MIGRATION_STARTED'}))
            role = stack.enter_context(patch.object(r28.scope, 'close_role'))
            app_stop = stack.enter_context(patch.object(release, 'close_program'))
            worker = stack.enter_context(patch.object(r28, 'stop_worker'))
            ctl = stack.enter_context(patch.object(cutover, 'systemctl'))
            replace = stack.enter_context(patch.object(release, 'replace_state'))
            restore = stack.enter_context(patch.object(backup, 'restore'))
            with self.assertRaisesRegex(backup.Failure, 'maintenance retained'):
                release.recover_pending()
            role.assert_called_once(); app_stop.assert_called_once(); worker.assert_called_once()
            ctl.assert_called_once_with('stop', 'timeline-native-redis.service')
            replace.assert_not_called(); restore.assert_not_called()
            self.assertTrue(retained.exists()); self.assertFalse(missing.exists())

    def test_snapshot_preserves_non_id_primary_keys_and_multiple_credentials(self):
        rows = {'local_credentials': [{'userId': 'first', 'passwordHash': 'synthetic-one'}, {'userId': 'second', 'passwordHash': 'synthetic-two'}],
                'supplier_mutation_buckets': [{'actorUserId': 'first', 'requestCount': 2}],
                'reminder_scan_states': [{'name': 'scan', 'cursor': 'fixed'}],
                'workflow_tasks': [{'id': 'task', 'status': 'COMPLETED'}]}
        with patch.object(backup, 'sql', side_effect=['100', '\n'.join(rows), *[json.dumps(r) for r in rows.values()]]):
            result = r28.snapshot()
            self.assertEqual(set(result['local_credentials']), {'first', 'second'})
            self.assertEqual(result['local_credentials']['second'], rows['local_credentials'][1])
            self.assertEqual(set(result['supplier_mutation_buckets']), {'first'})
            self.assertEqual(set(result['reminder_scan_states']), {'scan'})

    def test_snapshot_rejects_duplicate_keys_and_oversized_tables(self):
        for response in ('BOUNDS_EXCEEDED', '[{"userId":"duplicate"},{"userId":"duplicate"}]', '[{"id":"wrong"}]'):
            with self.subTest(response=response), patch.object(backup, 'sql', side_effect=['100', 'local_credentials', response]):
                with self.assertRaises(backup.Failure): r28.snapshot()

    def test_direct_start_requires_exact_schema_and_migration_phase(self):
        with patch.object(r28, 'journal', return_value=None), patch.object(r28, 'migration_state') as schema, patch.object(r28, 'schema_state') as actual:
            r28.assert_start(r28.TARGET['base'])
            schema.assert_called_once_with(37)
            actual.assert_called_once_with(37)
            with self.assertRaises(backup.Failure): r28.assert_start(r28.TARGET['commit'])
        for phase in r28.PHASES:
            with self.subTest(phase=phase), patch.object(r28, 'journal', return_value={'phase': phase}), \
                    patch.object(r28, 'migration_state') as schema, patch.object(r28, 'schema_state') as actual:
                with self.assertRaises(backup.Failure): r28.assert_start(r28.TARGET['base'])
                if phase in ('WRITE_ENABLE_INTENT', 'OPEN_41'):
                    r28.assert_start(r28.TARGET['commit']); schema.assert_called_once_with(41)
                    actual.assert_called_once_with(41)
                else:
                    with self.assertRaises(backup.Failure): r28.assert_start(r28.TARGET['commit'])
                    schema.assert_not_called()
                    actual.assert_not_called()

    def test_unknown_or_partial_schema_blocks_start(self):
        for journal in (None, {'phase': 'WRITE_ENABLE_INTENT'}):
            commit = r28.TARGET['base'] if journal is None else r28.TARGET['commit']
            with patch.object(r28, 'journal', return_value=journal), \
                    patch.object(r28.db, 'migration_rows', return_value=[]):
                with self.assertRaisesRegex(backup.Failure, 'migration identity'): r28.assert_start(commit)

    def test_recovery_after_any_migration_intent_never_selects_old_or_restores(self):
        for phase in r28.PHASES:
            for active in (r28.TARGET['base'], r28.TARGET['commit']):
                with self.subTest(phase=phase, active=active), ExitStack() as stack:
                    stack.enter_context(patch.object(r28, 'journal', return_value={'phase': phase}))
                    stack.enter_context(patch.object(release, 'state', return_value={**stable(r28.TARGET['base']), 'active': active, 'pending': True}))
                    close_role = stack.enter_context(patch.object(r28.scope, 'close_role'))
                    close_app = stack.enter_context(patch.object(release, 'close_program'))
                    stop = stack.enter_context(patch.object(r28, 'stop_worker'))
                    ctl = stack.enter_context(patch.object(cutover, 'systemctl'))
                    state = stack.enter_context(patch.object(release, 'replace_state'))
                    restore = stack.enter_context(patch.object(backup, 'restore'))
                    with self.assertRaisesRegex(backup.Failure, 'maintenance retained'): release.recover_pending_unlocked()
                    close_role.assert_called_once(); close_app.assert_called_once(); stop.assert_called_once()
                    ctl.assert_called_once_with('stop', 'timeline-native-redis.service')
                    state.assert_not_called(); restore.assert_not_called()

    def test_open_recovery_keeps_new_writes_and_only_accepts_exact_new_state(self):
        with patch.object(r28, 'journal', return_value={'phase': 'OPEN_41'}), \
                patch.object(release, 'state', return_value=stable(r28.TARGET['commit'])), \
                patch.object(r28, 'assert_start') as start, patch.object(r28, 'hold_closed') as hold, \
                patch.object(backup, 'restore') as restore:
            r28.recover_guard()
            start.assert_called_once_with(r28.TARGET['commit']); hold.assert_not_called(); restore.assert_not_called()

    def test_damaged_journal_or_receipt_and_schema_mismatch_close_all_writers(self):
        for reason in ('unknown journal', 'missing receipt', 'changed receipt', 'schema mismatch'):
            with self.subTest(reason=reason), patch.object(r28, 'journal', side_effect=backup.Failure(reason)), \
                    patch.object(r28.scope, 'close_role') as role, patch.object(release, 'close_program') as app_stop, \
                    patch.object(r28, 'stop_worker') as worker, patch.object(cutover, 'systemctl') as ctl, \
                    patch.object(release, 'replace_state') as replace, patch.object(backup, 'restore') as restore:
                with self.assertRaisesRegex(backup.Failure, 'maintenance retained'): r28.recover_guard()
                role.assert_called_once(); app_stop.assert_called_once(); worker.assert_called_once(); ctl.assert_called_once()
                replace.assert_not_called(); restore.assert_not_called()

    def test_open_journal_with_bad_schema_is_closed_not_left_running(self):
        with patch.object(r28, 'journal', return_value={'phase': 'OPEN_41'}), \
                patch.object(release, 'state', return_value=stable(r28.TARGET['commit'])), \
                patch.object(r28, 'assert_start', side_effect=backup.Failure('schema mismatch')), \
                patch.object(r28.scope, 'close_role') as role, patch.object(release, 'close_program'), \
                patch.object(r28, 'stop_worker'), patch.object(cutover, 'systemctl'):
            with self.assertRaisesRegex(backup.Failure, 'maintenance retained'): r28.recover_guard()
            role.assert_called_once()

    def test_cleanup_failure_does_not_skip_remaining_shutdown_attempts(self):
        with patch.object(r28.scope, 'close_role', side_effect=backup.Failure('role close error')), \
                patch.object(release, 'close_program') as app_stop, patch.object(r28, 'stop_worker') as worker, \
                patch.object(cutover, 'systemctl') as ctl:
            with self.assertRaisesRegex(backup.Failure, 'cleanup incomplete'): r28.hold_closed()
            app_stop.assert_called_once(); worker.assert_called_once(); ctl.assert_called_once()

    def test_existing_journal_forbids_blind_update(self):
        with patch.object(r28, 'present', return_value=True), patch.object(backup, 'locked') as lock:
            with self.assertRaisesRegex(backup.Failure, 'no blind retry'): r28.update()
            lock.assert_not_called()

    def test_worker_failure_always_closes_role_and_stops_owned_child(self):
        for kind in ('migrate', 'reconcile'):
            phase = 'MIGRATION_STARTED' if kind == 'migrate' else 'DB41_VERIFIED'
            with self.subTest(kind=kind), ExitStack() as stack:
                for obj, name in [(protection, 'assert_frozen'), (r28.scope, 'verify'), (r28, 'image_identity'), (r28, 'credentials_file')]:
                    stack.enter_context(patch.object(obj, name))
                stack.enter_context(patch.object(r28, 'journal', return_value={'phase': phase}))
                stack.enter_context(patch.object(r28, 'inspect_worker', return_value=None))
                stack.enter_context(patch.object(backup, 'sql', side_effect=['t', '0']))
                role = stack.enter_context(patch.object(backup, 'role_change'))
                stack.enter_context(patch.object(r28.db, 'docker', side_effect=KeyboardInterrupt))
                close = stack.enter_context(patch.object(r28.scope, 'close_role'))
                stop = stack.enter_context(patch.object(r28, 'stop_worker'))
                with self.assertRaises(KeyboardInterrupt): r28.run_worker(kind)
                role.assert_called_once(); close.assert_called_once(); stop.assert_called_once()

    def test_fixed_update_orders_protection_migration_validation_and_write_enable(self):
        self.exercise_update(None)

    def test_partial_migration_and_postmigration_validation_failure_stay_closed(self):
        for failure in ('migrate', 'verify_migration', 'reconcile', 'verify_reconcile', 'private_health'):
            with self.subTest(failure=failure): self.exercise_update(failure)

    def exercise_update(self, failure):
        value = stable(r28.TARGET['base']); phase = None; events = []
        def write(next_value):
            nonlocal value
            value = copy.deepcopy(next_value); events.append('state:' + str(value['pending']))
        def advance(next_phase, protection=None):
            nonlocal phase
            phase = next_phase; events.append(next_phase)
        def worker(kind):
            events.append(kind)
            if failure == kind: raise backup.Failure('injected ' + kind)
        def event(name):
            def fn(*args, **kwargs):
                events.append(name)
                if name == failure: raise backup.Failure('injected ' + name)
            return fn
        def ctl(*args):
            self.assertIn('WRITE_ENABLE_INTENT', events)
            if args[-1] in cutover.SOCKETS: self.assertFalse(value['pending'])
            events.append('start')
        def health(public=False):
            event('public_health' if public else 'private_health')()
        with ExitStack() as stack:
            stack.enter_context(patch.object(r28, 'present', return_value=False))
            stack.enter_context(patch.object(backup, 'locked'))
            for obj, name in [(cutover, 'committed_value'), (cutover, 'no_old_journals'), (r28, 'migration_state'),
                              (r28, 'schema_state'), (release, 'verify_checkout'), (app, 'validate_files'),
                              (release, 'verify_running'), (r28, 'image_identity'), (release, 'stage_environment'),
                              (release, 'close_program'), (backup, 'write_json'), (backup, 'copy_objects')]:
                stack.enter_context(patch.object(obj, name))
            stack.enter_context(patch.object(protection, 'verify_backup', return_value={'objects': []}))
            stack.enter_context(patch.object(r28, 'access_state', return_value={}))
            stack.enter_context(patch.object(protection, 'protect', return_value={'backup': 'synthetic'}))
            stack.enter_context(patch.object(r28, 'snapshot', return_value={}))
            for name in ('verify_backup_restore', 'verify_migration', 'verify_reconcile'):
                stack.enter_context(patch.object(r28, name, side_effect=event(name)))
            stack.enter_context(patch.object(protection, 'verify_protection', side_effect=event('protected')))
            stack.enter_context(patch.object(protection, 'resume_dependencies', side_effect=event('resume')))
            stack.enter_context(patch.object(r28, 'advance', side_effect=advance))
            stack.enter_context(patch.object(r28, 'run_worker', side_effect=worker))
            stack.enter_context(patch.object(release, 'state', side_effect=lambda: value.copy()))
            stack.enter_context(patch.object(release, 'replace_state', side_effect=write))
            stack.enter_context(patch.object(cutover, 'systemctl', side_effect=ctl))
            stack.enter_context(patch.object(cutover, 'check_health', side_effect=health))
            restore = stack.enter_context(patch.object(backup, 'restore'))
            stack.enter_context(patch('builtins.print'))
            if failure:
                with self.assertRaisesRegex(backup.Failure, 'injected'): r28.update()
                self.assertTrue(value['pending']); self.assertNotIn('OPEN_41', events)
                self.assertNotIn('public_health', events)
            else:
                r28.update()
                self.assertEqual(value, stable(r28.TARGET['commit']))
                order = ('verify_backup_restore', 'protected', 'MIGRATION_STARTED', 'migrate', 'verify_migration',
                         'DB41_VERIFIED', 'reconcile', 'verify_reconcile', 'RECONCILED', 'WRITE_ENABLE_INTENT',
                         'resume', 'start', 'private_health', 'OPEN_41', 'public_health')
                indices = [events.index(e) for e in order]
                self.assertEqual(indices, sorted(indices)); self.assertEqual(events.count('reconcile'), 2)
            restore.assert_not_called()


if __name__ == '__main__': unittest.main()
