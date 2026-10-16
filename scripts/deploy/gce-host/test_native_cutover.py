import unittest
from contextlib import ExitStack
import native_release_r28 as r28
import native_release_r28_patch as program
from unittest.mock import patch
import native_cutover as c
import native_backup_controller as b
import native_release as release


class CutoverBoundaryTests(unittest.TestCase):
    def test_only_native_api_supervisor_stop_has_extended_outer_deadline(self):
        with patch.object(c.app, 'run') as run:
            c.systemctl('stop', 'timeline-native-api.service')
            run.assert_called_once_with(['/usr/bin/systemctl', 'stop', 'timeline-native-api.service'], timeout=110)
        with patch.object(c.app, 'run') as run:
            c.systemctl('stop', 'timeline-native-web.service')
            run.assert_called_once_with(['/usr/bin/systemctl', 'stop', 'timeline-native-web.service'])

    def test_failed_stopped_owned_unit_can_reset_without_losing_kill_evidence(self):
        with patch.object(c,'systemctl') as ctl,patch.object(c,'unit_state',side_effect=[
                {'ActiveState':'failed','MainPID':'0','ControlPID':'0'},
                {'ActiveState':'inactive','MainPID':'0','ControlPID':'0'}]),patch('builtins.print'):
            c.stop_units([c.APPS[0]])
            self.assertEqual([v.args for v in ctl.call_args_list],[('stop',c.APPS[0]),('reset-failed',c.APPS[0])])
        with patch.object(c,'systemctl') as ctl,patch.object(c,'unit_state',return_value={'ActiveState':'failed','MainPID':'0','ControlPID':'7'}):
            with self.assertRaises(b.Failure):c.stop_units([c.APPS[0]])
            self.assertEqual(ctl.call_count,1)

    def test_recovery_check_timeout_cannot_write_commit_and_restores_source(self):
        from contextlib import ExitStack
        from unittest.mock import Mock
        with ExitStack() as stack:
            patches=[(c,'present',False),(c,'systemctl',b'enabled\n'),(c,'no_old_journals',None),
                     (c,'release_checkout',None),(c,'unit_state',{'ActiveState':'active','UnitFileState':'enabled'}),
                     (c,'native_snapshot',{}),(b,'read_json',{'manifestSha256':c.BASELINE_MANIFEST}),
                     (c,'validate_snapshot',{'rows':'same'}),(b,'snapshot',{}),(b,'stop_source',None),
                     (c,'stop_units',None),(b,'fingerprints',{'rows':'same'}),(c,'candidate_static',None),
                     (c.backup.Path,'iterdir',iter([]))]
            for obj,name,value in patches:stack.enter_context(patch.object(obj,name,return_value=value))
            write=stack.enter_context(patch.object(b,'write_json'))
            restore=stack.enter_context(patch.object(c,'recover'))
            stack.enter_context(patch.object(c,'recovery_checkpoint',side_effect=b.Failure('checkpoint expired')))
            with self.assertRaisesRegex(b.Failure,'checkpoint expired'):c.promote(recovery_check=True)
            restore.assert_called_once()
            self.assertEqual([call.args[0] for call in write.call_args_list],[c.PENDING])

    def test_checkpoint_timeout_is_bounded_and_requires_systemd_invocation(self):
        with patch.dict(c.os.environ,{'INVOCATION_ID':'a'*32}),patch.object(c,'present',return_value=False),\
             patch.object(b,'read_file',return_value=b'pending'),patch.object(b,'write_json') as write,\
             patch.object(c.time,'sleep') as sleep,patch('builtins.print'):
            with self.assertRaisesRegex(b.Failure,'checkpoint expired'):c.recovery_checkpoint()
            sleep.assert_called_once_with(60);self.assertEqual(write.call_args.args[0],c.CHECKPOINT)
        with patch.dict(c.os.environ,{'INVOCATION_ID':''}),patch.object(b,'write_json') as write:
            with self.assertRaises(b.Failure):c.recovery_checkpoint()
            write.assert_not_called()

    def test_reconcile_requires_unchanged_journal_and_observed_kill(self):
        value={'invocationId':'a'*32,'pid':100,'pendingSha256':b.sha(b'expected')}
        for raw in (b'changed',b'expected'):
            with self.subTest(raw=raw),patch.object(c,'present',return_value=False),\
                 patch.object(b,'read_json',return_value=value),patch.object(b,'read_file',return_value=raw),\
                 patch.object(c,'pending_value'),patch.object(c,'systemctl',return_value=b'ActiveState=active\n'),\
                 patch.object(c.os,'rename') as rename:
                with self.assertRaises(b.Failure):c.reconcile_check()
                rename.assert_not_called()

    def test_source_new_writes_reject_promotion_before_final_quiescence(self):
        with patch.object(c,'present',return_value=False),patch.object(c,'systemctl',return_value=b'enabled\n'),\
             patch.object(c,'no_old_journals'),patch.object(c,'release_checkout'),\
             patch.object(c,'unit_state',return_value={'ActiveState':'active','UnitFileState':'enabled'}),\
             patch.object(c,'native_snapshot',return_value={}),patch.object(b,'read_json',return_value={'manifestSha256':c.BASELINE_MANIFEST}),\
             patch.object(c,'validate_snapshot',side_effect=[{'rows':'unchanged'},{'rows':'new write'}]),patch.object(b,'snapshot',return_value={}),\
             patch.object(b,'write_json') as write,patch.object(b,'stop_source') as stop:
            with self.assertRaisesRegex(b.Failure,'Original data changed'):c.promote()
            write.assert_not_called();stop.assert_not_called()

    def test_candidate_side_effect_rejects_promotion(self):
        with patch.object(c,'no_old_journals'),patch.object(c.app,'validate_files'),\
             patch.object(b,'read_json',side_effect=[{'runtimeCommit':c.COMMIT,'database':c.DATABASE,'administratorBound':True,'existingInternalIdPreserved':True},{'rows':'approved'}]),\
             patch.object(c.app,'inspect',return_value={'State':{'Running':False,'Pid':0}}),patch.object(c.app,'validate_container'),\
             patch.object(c.app,'image_identity'),patch.object(b,'sql',side_effect=['t','0','0']),patch.object(b,'fingerprints',return_value={'rows':'unexpected'}):
            with self.assertRaisesRegex(b.Failure,'Candidate changed'):c.candidate_static()

    def test_dangling_commit_and_illegal_pending_are_never_absent(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as directory:
            marker=Path(directory)/'commit';marker.symlink_to(Path(directory)/'missing')
            self.assertTrue(c.present(marker))
            with patch.object(c,'COMMITTED',marker),patch.object(c,'committed_value',side_effect=OSError('invalid marker')),patch.object(b,'role_change') as role:
                with self.assertRaises(OSError):c.recover()
                role.assert_not_called()
            marker.unlink();pending=Path(directory)/'pending';pending.mkdir()
            with patch.object(c,'COMMITTED',marker),patch.object(c,'PENDING',pending),patch.object(c,'pending_value',side_effect=OSError('directory marker')),patch.object(b,'role_change') as role:
                with self.assertRaises(OSError):c.recover()
                role.assert_not_called()

    def test_corrupt_commit_never_falls_back_to_old_database(self):
        with patch.object(release, 'operation'), patch.object(c, 'committed_value', side_effect=b.Failure('corrupt')) as committed, \
                patch.object(r28.scope, 'close_role') as close_role, patch.object(release, 'close_program') as stop, \
                patch.object(r28, 'stop_worker') as worker, patch.object(c, 'systemctl') as ctl, \
                patch.object(b, 'role_change') as role, patch.object(b, 'recover_restore') as restore, \
                patch.object(b, 'recover_source') as source, patch.object(c, 'close_old_role') as old_role:
            with self.assertRaisesRegex(b.Failure, 'maintenance retained'): c.recover()
            committed.assert_called_once()
            close_role.assert_called_once(); stop.assert_called_once(); worker.assert_called_once()
            ctl.assert_called_once_with('stop', 'timeline-native-redis.service')
            role.assert_not_called(); restore.assert_not_called(); source.assert_not_called(); old_role.assert_not_called()

    def test_precommit_patch_guard_closes_candidate_without_opening_old_database(self):
        order = []
        with patch.object(release, 'operation'), patch.object(program, 'record', return_value={'phase': 'PREPARED'}), \
                patch.object(r28.scope, 'close_role', side_effect=lambda: order.append('close-candidate')), \
                patch.object(release, 'close_program', side_effect=lambda: order.append('stop-native')), \
                patch.object(r28, 'stop_worker', side_effect=lambda: order.append('stop-worker')), \
                patch.object(c, 'systemctl', side_effect=lambda *args: order.append(args)), \
                patch.object(c, 'committed_value') as prior, patch.object(b, 'recover_restore') as restore, \
                patch.object(b, 'recover_source') as source, patch.object(b, 'role_change') as role:
            with self.assertRaisesRegex(b.Failure, 'maintenance retained'): c.recover()
            self.assertEqual(order, ['close-candidate', 'stop-native', 'stop-worker', ('stop', 'timeline-native-redis.service')])
            prior.assert_not_called(); restore.assert_not_called(); source.assert_not_called(); role.assert_not_called()

    def test_committed_recovery_never_reopens_old_role_and_queues_after_gate(self):
        calls = []
        commit = program.TARGET['commit']
        with patch.object(c, 'committed_value'), patch.object(c, 'close_old_role', side_effect=lambda: calls.append('old-closed')), \
                patch.object(c, 'stop_units'), patch.object(c, 'systemctl', side_effect=lambda *args: calls.append(args)), \
                patch.object(c, 'no_old_journals'), patch.object(c.app, 'validate_files'), patch.object(c, 'release_checkout'), \
                patch.object(b, 'role_change') as role, patch.object(release, 'recover_pending') as recover, \
                patch.object(release, 'state', return_value=program.stable(commit)), patch.object(release, 'verify_checkout'), \
                patch.object(program, 'assert_start', side_effect=lambda *args, **kwargs: calls.append('patch-gate')) as gate:
            for _ in range(2): self.assertEqual(c.recover(), 'COMMITTED_NEW_RUNTIME_READY')
            self.assertEqual(role.call_count, 2)
            self.assertTrue(all(c.ROLE in item.args[0] and b.ROLE not in item.args[0] for item in role.call_args_list))
            self.assertEqual(recover.call_count, 2)
            self.assertEqual(gate.call_count, 2); gate.assert_called_with(commit, ingress=True)
        enables = [i for i, value in enumerate(calls) if isinstance(value, tuple) and value[:1] == ('enable',)]
        gates = [i for i, value in enumerate(calls) if value == 'patch-gate']
        self.assertEqual(len(enables), 2)
        self.assertTrue(all(gate_index < enable_index for gate_index, enable_index in zip(gates, enables)))
        self.assertEqual([value for value in calls if isinstance(value, tuple) and 'start' in value], [])
        self.assertFalse(any(isinstance(value, tuple) and value[:1] == ('enable',) and b.SERVICE in value for value in calls))

    def test_dispatch_and_health_run_outside_lock_even_when_dependencies_are_inactive(self):
        from contextlib import contextmanager
        lock_held=[False]
        events=[]
        @contextmanager
        def lock():
            self.assertFalse(lock_held[0]);lock_held[0]=True
            try:yield
            finally:lock_held[0]=False
        def promote():self.assertTrue(lock_held[0]);events.append('durable-commit')
        def reconcile():self.assertTrue(lock_held[0]);return 'COMMITTED_NEW_RUNTIME_READY'
        def ctl(*args):
            self.assertFalse(lock_held[0]);self.assertEqual(args[:2],('--no-block','start'));events.append('queue-after-release')
        def health(**kwargs):self.assertFalse(lock_held[0]);events.append('health-after-release')
        for initially_inactive in ('network','recovery'):
            with self.subTest(initially_inactive=initially_inactive),patch.object(c.os,'geteuid',return_value=0),\
                 patch.object(c.socket,'gethostname',return_value='instance-20260408-091840'),patch.object(c,'__file__',str(c.INSTALLED/'native_cutover.py')),\
                 patch.object(c.sys,'argv',['native_cutover','promote']),patch.object(b,'locked',side_effect=lock),\
                 patch.object(c.app,'state_directory'),patch.object(c,'promote',side_effect=promote),patch.object(c,'present',return_value=True),\
                 patch.object(c,'recover',side_effect=reconcile),patch.object(c,'systemctl',side_effect=ctl),\
                 patch.object(c,'check_health',side_effect=health),patch.object(c,'committed_value',return_value={'committedAt':'fixed'}),patch('builtins.print'):
                c.main()
        self.assertEqual(events,['durable-commit','queue-after-release','health-after-release']*2)

    def test_missing_commit_or_wrong_41_schema_never_authorizes_legacy_recovery(self):
        for failure in ('missing-commit', 'migration-count', 'schema'):
            with self.subTest(failure=failure), ExitStack() as stack:
                stack.enter_context(patch.object(release, 'operation'))
                committed = stack.enter_context(patch.object(c, 'committed_value'))
                if failure == 'missing-commit': committed.side_effect = b.Failure('historical commit missing')
                bound = {**program.TARGET, 'migrationAnchorSha256': b.sha(b'synthetic-anchor')}
                stack.enter_context(patch.object(program, 'TARGET', bound))
                stack.enter_context(patch.object(r28, 'journal', return_value={'phase': 'OPEN_41', 'target': bound['base']}))
                read = stack.enter_context(patch.object(b, 'read_file', return_value=b'synthetic-anchor'))
                migrations = stack.enter_context(patch.object(r28, 'migration_state'))
                schema = stack.enter_context(patch.object(r28, 'schema_state'))
                if failure == 'migration-count': migrations.side_effect = b.Failure('41 migrations required')
                if failure == 'schema': schema.side_effect = b.Failure('41 schema differs')
                close_role = stack.enter_context(patch.object(r28.scope, 'close_role'))
                stop = stack.enter_context(patch.object(release, 'close_program'))
                worker = stack.enter_context(patch.object(r28, 'stop_worker'))
                ctl = stack.enter_context(patch.object(c, 'systemctl'))
                old_role = stack.enter_context(patch.object(c, 'close_old_role'))
                restore = stack.enter_context(patch.object(b, 'restore'))
                old_restore = stack.enter_context(patch.object(b, 'recover_restore'))
                old_source = stack.enter_context(patch.object(b, 'recover_source'))
                sql = stack.enter_context(patch.object(b, 'sql'))
                with self.assertRaisesRegex(b.Failure, 'maintenance retained'): c.recover()
                committed.assert_called_once(); close_role.assert_called_once(); stop.assert_called_once(); worker.assert_called_once()
                ctl.assert_called_once_with('stop', 'timeline-native-redis.service')
                old_role.assert_not_called(); restore.assert_not_called(); old_restore.assert_not_called(); old_source.assert_not_called(); sql.assert_not_called()
                if failure == 'missing-commit': read.assert_not_called(); migrations.assert_not_called(); schema.assert_not_called()
                elif failure == 'migration-count': migrations.assert_called_once_with(41); schema.assert_not_called()
                else: migrations.assert_called_once_with(41); schema.assert_called_once_with(41)


if __name__=='__main__':unittest.main()
