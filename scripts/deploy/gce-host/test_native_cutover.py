import unittest
from unittest.mock import patch
import native_cutover as c
import native_backup_controller as b


class CutoverBoundaryTests(unittest.TestCase):
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
        with patch.object(c,'present',return_value=True),patch.object(c,'committed_value',side_effect=b.Failure('corrupt')),\
             patch.object(b,'role_change') as role,patch.object(c,'systemctl') as ctl:
            with self.assertRaises(b.Failure):c.recover()
            role.assert_not_called();ctl.assert_not_called()

    def test_precommit_closes_candidate_before_opening_old_database(self):
        order=[]
        with patch.object(c,'present',side_effect=[False,True]),patch.object(c,'pending_value'),patch.object(b,'recover_restore'),patch.object(b,'recover_source',side_effect=lambda:order.append('recover-source-opens-old')),\
             patch.object(c.scope,'close_role',side_effect=lambda:order.append('close-candidate')),\
             patch.object(c,'stop_units',side_effect=lambda _:order.append('stop-native')),patch.object(c.app,'stop'),\
             patch.object(c,'systemctl',side_effect=lambda *args:order.append(args)),patch.object(c,'no_old_journals'),\
             patch.object(b,'role_change',side_effect=lambda sql:order.append(sql)),\
             patch.object(c,'unit_state',return_value={'ActiveState':'active'}):
            self.assertEqual(c.recover(),'PRECOMMIT_OLD_RUNTIME_RESTORED')
        opening=next(i for i,v in enumerate(order) if isinstance(v,str) and 'LOGIN;' in v)
        self.assertLess(order.index('close-candidate'),opening);self.assertLess(order.index('stop-native'),opening)
        self.assertLess(order.index('close-candidate'),order.index('recover-source-opens-old'))
        self.assertLess(order.index('stop-native'),order.index('recover-source-opens-old'))

    def test_committed_recovery_never_reopens_old_role_and_queues_after_gate(self):
        calls=[]
        with patch.object(c,'present',return_value=True),patch.object(c,'committed_value'),\
             patch.object(c,'close_old_role',side_effect=lambda:calls.append('old-closed')),patch.object(c,'stop_units'),\
             patch.object(c,'systemctl',side_effect=lambda *args:calls.append(args)),patch.object(c,'no_old_journals'),\
             patch.object(c.app,'validate_files'),patch.object(c,'release_checkout'),patch.object(b,'role_change') as role:
            for _ in range(2):self.assertEqual(c.recover(),'COMMITTED_NEW_RUNTIME_READY')
            self.assertTrue(all(c.ROLE in x.args[0] and b.ROLE not in x.args[0] for x in role.call_args_list))
        starts=[v for v in calls if isinstance(v,tuple) and 'start' in v]
        self.assertEqual(starts,[])
        self.assertFalse(any(isinstance(v,tuple) and v[:1]==('enable',) and b.SERVICE in v for v in calls))

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


if __name__=='__main__':unittest.main()
