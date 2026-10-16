"""Behavioral release tests: phase/identity gates, durable journals and interruption.

Existing migration helper tests remain historical; live boot/recovery now use the
mandatory separate program record. No test transports touch production data.
"""
from contextlib import ExitStack
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import native_release_r28_patch as program
import native_release_r28 as migration
import native_release as release
import native_release_backup as protection
import native_backup_controller as backup
import native_cutover as cutover
import native_runtime_app as app


REAL_ANCHOR = program.anchor


class ProgramPatchTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        folder = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.root = folder / 'state'; self.root.mkdir()
        self.backups = folder / 'backups'; self.backups.mkdir()
        self.stack.enter_context(patch.object(program, 'ROOT', self.root))
        self.stack.enter_context(patch.object(program, 'HEAD', self.root / 'head.json'))
        self.stack.enter_context(patch.object(backup, 'ROOT', self.backups))
        self.stack.enter_context(patch.object(backup, 'fsync_dir'))
        read = backup.read_file
        def local_read(path, limit, owner=None):
            self.assertTrue(Path(path).is_relative_to(folder))
            return read(path, limit, owner=os.getuid())
        self.stack.enter_context(patch.object(backup, 'read_file', side_effect=local_read))
        self.anchor = self.stack.enter_context(patch.object(program, 'anchor'))
        self.state = program.stable(program.TARGET['base'])
        self.stack.enter_context(patch.object(release, 'state', side_effect=lambda: copy.deepcopy(self.state)))
        def replace(value): self.state = copy.deepcopy(value)
        self.stack.enter_context(patch.object(release, 'replace_state', side_effect=replace))
        self.receipt = {'backup': '20260928T180000Z-1234abcd', 'runtimeCommit': program.TARGET['base'],
                        'database': migration.db.DATABASE, 'tableCount': 54, 'databaseRestored': False, 'migrationExecuted': False}
        path = self.backups / self.receipt['backup']; path.mkdir()
        backup.write_json(path / 'snapshot-complete.json', self.receipt)
        program.initialize()

    def step(self, phase):
        program.advance(phase, self.receipt if phase == 'PROTECTED' else None)

    def reach(self, phase):
        for item in program.PHASES[1:program.PHASES.index(phase)+1]: self.step(item)

    def held(self):
        with patch.object(migration, 'hold_closed', side_effect=backup.Failure('held')) as hold, \
                patch.object(release, 'close_program') as stop, patch.object(backup, 'restore') as restore:
            with self.assertRaisesRegex(backup.Failure, 'held'): program.recover_guard()
            hold.assert_called_once(); restore.assert_not_called(); stop.assert_not_called()

    def test_each_phase_authorizes_only_one_identity_and_state(self):
        for phase in program.PHASES:
            if phase != 'BASE': self.step(phase)
            c = program.TARGET['base'] if phase == 'BASE' else program.TARGET['commit']
            if phase in ('WRITE_ENABLE_INTENT', 'VERIFIED_CLOSED'):
                self.state = {'version': 1, 'active': c, 'committed': program.TARGET['base'], 'pending': True}
            else: self.state = program.stable(c)
            allowed = phase in ('BASE', 'WRITE_ENABLE_INTENT', 'VERIFIED_CLOSED', 'OPEN_INTENT', 'COMMITTED')
            for candidate in (release.OLD, migration.TARGET['base'], program.TARGET['base'], program.TARGET['commit'], '0'*40):
                with self.subTest(phase=phase, candidate=candidate):
                    if allowed and candidate == c: program.assert_start(candidate)
                    else:
                        with self.assertRaises(backup.Failure): program.assert_start(candidate)
            if phase in ('BASE', 'OPEN_INTENT', 'COMMITTED'): program.assert_start(c, ingress=True)
            else:
                with self.assertRaises(backup.Failure): program.assert_start(c, ingress=True)
            saved = self.state
            self.state = {**saved, 'pending': not saved['pending']}
            with self.assertRaises(backup.Failure): program.assert_start(c)
            self.state = saved

    def test_only_final_states_recover_and_partial_states_never_restore(self):
        program.recover_guard()
        for phase in program.PHASES[1:]:
            self.step(phase)
            self.state = program.stable(program.TARGET['commit'])
            if phase == 'COMMITTED': program.recover_guard()
            else: self.held()

    def test_missing_corrupt_or_duplicate_head_holds_closed_without_initialization(self):
        original = program.HEAD.read_bytes()
        for raw in (b'', b'{', b'{"phase":"BASE","phase":"COMMITTED","eventSha256":"x"}', b'{}'):
            program.HEAD.write_bytes(raw)
            self.held()
        program.HEAD.unlink(); self.held()
        with self.assertRaises(backup.Failure): program.initialize()
        program.HEAD.write_bytes(original); program.HEAD.chmod(0o600)
        program.record()

    def test_missing_event_or_hash_modified_plan_is_rejected(self):
        self.reach('PROTECTED')
        path = program.event_path('PROTECTED'); raw = path.read_bytes()
        value = json.loads(raw)
        for field in ('version','base','target','planSha256','migrationAnchorSha256','phase','previousSha256','backupReceiptSha256'):
            bad = copy.deepcopy(value); bad[field] = 'changed'
            path.write_text(json.dumps(bad))
            self.held()
        path.unlink(); self.held()
        path.write_bytes(raw); path.chmod(0o600); program.record()

    def test_future_event_and_reverted_head_are_detected(self):
        old = program.HEAD.read_bytes()
        self.step('PREPARED')
        program.HEAD.write_bytes(old)
        self.held()

    def test_interruption_between_immutable_event_and_head_stays_closed(self):
        with patch.object(program.os, 'replace', side_effect=RuntimeError('simulated process death')):
            with self.assertRaises(RuntimeError): self.step('PREPARED')
        self.held()

    def test_journal_cannot_skip_reverse_or_reinitialize_after_attempt(self):
        with self.assertRaises(backup.Failure): self.step('WRITE_ENABLE_INTENT')
        self.step('PREPARED')
        with self.assertRaises(backup.Failure): program.initialize()
        with self.assertRaises(backup.Failure): self.step('BASE')

    def test_receipt_changed_after_new_writes_does_not_authorize_restore(self):
        self.reach('WRITE_ENABLE_INTENT')
        path = self.backups / self.receipt['backup'] / 'snapshot-complete.json'
        path.write_text('{}')
        self.held()

    def test_original_anchor_and_all_41_migrations_are_required(self):
        bound = {**program.TARGET, 'migrationAnchorSha256': backup.sha(b'anchor')}
        with patch.object(cutover, 'committed_value'), patch.object(program, 'TARGET', bound), patch.object(migration, 'journal', return_value={
                'phase':'OPEN_41', 'target':program.TARGET['base']}) as journal, \
                patch.object(backup, 'read_file', return_value=b'anchor'), \
                patch.object(migration, 'migration_state') as migrations, patch.object(migration, 'schema_state') as schema:
            REAL_ANCHOR()
            migrations.assert_called_once_with(41); schema.assert_called_once_with(41)
            journal.return_value = None
            with self.assertRaises(backup.Failure): REAL_ANCHOR()
            journal.return_value = {'phase':'WRITE_ENABLE_INTENT', 'target':program.TARGET['base']}
            with self.assertRaises(backup.Failure): REAL_ANCHOR()
            journal.return_value = {'phase':'OPEN_41', 'target':program.TARGET['base']}
            bound['migrationAnchorSha256'] = '0'*64
            with self.assertRaises(backup.Failure): REAL_ANCHOR()

    def test_live_cutover_and_direct_start_use_patch_before_old_recovery(self):
        with patch.object(release, 'recover_pending', side_effect=backup.Failure('patch hold')) as guard, \
                patch.object(cutover, 'committed_value') as old, patch.object(backup, 'recover_restore') as restore:
            with self.assertRaisesRegex(backup.Failure, 'patch hold'): cutover.recover()
            guard.assert_called_once(); old.assert_not_called(); restore.assert_not_called()
        with patch.object(program, 'assert_start', side_effect=backup.Failure('patch hold')) as guard, \
                patch.object(app, 'runtime_identity', return_value={'commit': program.TARGET['commit']}), \
                patch.object(app, 'state_directory'), patch.object(app, 'validate_files') as validate:
            with self.assertRaisesRegex(backup.Failure, 'patch hold'): app.prepare_start('api')
            guard.assert_called_once_with(program.TARGET['commit']); validate.assert_not_called()

    def test_missing_historical_commit_cannot_fall_into_retained_pending_restore(self):
        with patch.object(program, 'anchor', side_effect=backup.Failure('historical commit missing')), \
                patch.object(migration.scope, 'close_role') as close_role, \
                patch.object(release, 'close_program') as stop, patch.object(migration, 'stop_worker') as worker, \
                patch.object(cutover, 'systemctl') as ctl, patch.object(release, 'operation'), \
                patch.object(cutover, 'present', return_value=True), \
                patch.object(backup, 'restore') as restore, patch.object(backup, 'recover_restore') as old_restore, \
                patch.object(backup, 'recover_source') as old_source, patch.object(cutover, 'close_old_role') as old_role:
            with self.assertRaisesRegex(backup.Failure, 'maintenance retained'): cutover.recover()
            close_role.assert_called_once(); stop.assert_called_once(); worker.assert_called_once()
            restore.assert_not_called(); old_restore.assert_not_called(); old_source.assert_not_called(); old_role.assert_not_called()
            ctl.assert_called_once_with('stop', 'timeline-native-redis.service')

    def test_partial_head_write_never_reauthorizes_old_program_or_mutates_anchor(self):
        self.reach('PROTECTED')
        with patch.object(program.os, 'replace', side_effect=RuntimeError('killed before head fsync')):
            with self.assertRaises(RuntimeError): self.step('WRITE_ENABLE_INTENT')
        for candidate in (program.TARGET['base'],program.TARGET['commit'],migration.TARGET['base']):
            with self.assertRaises(backup.Failure): program.assert_start(candidate)
        self.held()

    def test_new_environment_is_distinct_and_mixed_image_pair_is_rejected(self):
        self.assertEqual(release.environment_path('api',program.TARGET['commit']).name,'api-r28-ui-patch-20260928.env')
        self.assertNotEqual(release.environment_path('api',program.TARGET['base']),release.environment_path('api',program.TARGET['commit']))
        identity = release.VERSIONS[program.TARGET['commit']]
        labels={'org.opencontainers.image.revision':program.TARGET['base'],'com.feishu-timeline.source-tree':identity['tree'],
                'org.opencontainers.image.version':identity['release'],'org.opencontainers.image.created':identity['buildTime']}
        item={'Config':{'Labels':labels},'RepoDigests':[identity['images']['api']], 'Architecture':'amd64','Os':'linux'}
        with patch.object(app,'docker',return_value=json.dumps([item]).encode()):
            with self.assertRaisesRegex(backup.Failure,'artifact identity'): app.image_identity('api',identity)

    def test_54_table_backup_is_bound_to_prepared_41_schema_patch(self):
        from types import SimpleNamespace
        self.step('PREPARED'); self.state={**program.stable(program.TARGET['base']),'pending':True}
        quiescence={'apiWasRunning':True,'apiDrainSupported':True,'apiExitCode':0,'apiGracefulDrainVerified':True,'legacyApiFreezeOnly':False}
        with ExitStack() as stack:
            for obj,name in ((protection.scope,'verify'),(protection.scope,'close_role'),(protection.redis,'validate_files'),
                             (protection.redis,'validate_container'),(protection.redis,'stop'),(protection,'assert_frozen'),(cutover,'systemctl')):
                stack.enter_context(patch.object(obj,name))
            stack.enter_context(patch.object(protection.redis,'inspect',return_value={'State':{'Running':True}}))
            stack.enter_context(patch.object(protection.redis,'run',return_value=json.dumps([{'RepoDigests':[protection.redis.IMAGE],'Id':'fixed'}]).encode()))
            stack.enter_context(patch.object(protection.shutil,'disk_usage',return_value=SimpleNamespace(free=3*1024**3)))
            fingerprints=stack.enter_context(patch.object(backup,'fingerprints'))
            dump=stack.enter_context(patch.object(cutover,'dump_native',side_effect=RuntimeError('reached fixed dump')))
            for count in (52,53,55):
                fingerprints.return_value={'tables':{str(i):{} for i in range(count)}}
                with self.assertRaisesRegex(backup.Failure,'table inventory'): protection.protect(program.TARGET['base'],quiescence)
                dump.assert_not_called()
            fingerprints.return_value={'tables':{str(i):{} for i in range(54)}}
            with self.assertRaisesRegex(RuntimeError,'reached fixed dump'): protection.protect(program.TARGET['base'],quiescence)
            dump.assert_called_once()

    def test_update_orders_current_backup_and_intent_before_any_writer(self):
        events = []
        advance = program.advance
        def step(phase, protection=None):
            events.append(phase); advance(phase, protection)
        with ExitStack() as stack:
            stack.enter_context(patch.object(program, 'advance', side_effect=step))
            for obj, name in ((cutover,'committed_value'),(release,'verify_checkout'),(app,'validate_files'),
                              (release,'verify_running'),(release,'stage_environment'),(protection,'assert_frozen')):
                stack.enter_context(patch.object(obj,name))
            stack.enter_context(patch.object(backup,'locked'))
            stack.enter_context(patch.object(release,'close_program',return_value={'observed':'drained'}))
            stack.enter_context(patch.object(protection,'protect',side_effect=lambda *a: events.append('backup54') or self.receipt))
            stack.enter_context(patch.object(protection,'verify_protection',side_effect=lambda *a: events.append('frozen_data_equal')))
            stack.enter_context(patch.object(protection,'resume_dependencies',side_effect=lambda: events.append('writers_enabled')))
            stack.enter_context(patch.object(cutover,'systemctl',side_effect=lambda *a: events.append('start_sockets' if a[-1] in cutover.SOCKETS else 'start_apps')))
            stack.enter_context(patch.object(cutover,'check_health',side_effect=lambda **kw: events.append('public_health' if kw else 'private_health')))
            stack.enter_context(patch.object(protection,'verify_backup',side_effect=lambda *a: events.append('backup_integrity')))
            restore = stack.enter_context(patch.object(backup,'restore'))
            worker = stack.enter_context(patch.object(migration,'run_worker'))
            program.update()
            restore.assert_not_called(); worker.assert_not_called()
        self.assertEqual(events, ['PREPARED','backup54','PROTECTED','frozen_data_equal','WRITE_ENABLE_INTENT',
                                 'writers_enabled','start_apps','private_health','backup_integrity','VERIFIED_CLOSED',
                                 'OPEN_INTENT','start_sockets','public_health','COMMITTED'])
        self.assertEqual(self.state, program.stable(program.TARGET['commit']))
        self.assertEqual(program.record()['phase'], 'COMMITTED')


if __name__ == '__main__': unittest.main()
