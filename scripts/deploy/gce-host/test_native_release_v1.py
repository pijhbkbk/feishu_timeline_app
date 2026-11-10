"""Fixed V1 phase, recovery, artifact and call-order regression with synthetic state."""
from contextlib import ExitStack, nullcontext
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import native_release_v1 as v1
import native_release as release
import native_release_r28_patch as previous
import native_backup_controller as backup
import native_runtime_app as app


class V1ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.folder = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.root = self.folder / 'state'
        self.root.mkdir(mode=0o700)
        self.backups = self.folder / 'backups'
        self.backups.mkdir()
        self.stack.enter_context(patch.object(v1, 'ROOT', self.root))
        self.stack.enter_context(patch.object(v1, 'HEAD', self.root / 'head.json'))
        self.stack.enter_context(patch.object(backup, 'ROOT', self.backups))
        self.stack.enter_context(patch.object(backup, 'fsync_dir'))
        read = backup.read_file
        def local_read(path, limit, owner=None):
            self.assertTrue(Path(path).is_relative_to(self.folder))
            return read(path, limit, owner=os.getuid())
        self.stack.enter_context(patch.object(backup, 'read_file', side_effect=local_read))
        self.stack.enter_context(patch.object(backup, 'directory', side_effect=lambda p, trusted: os.open(p, os.O_RDONLY)))
        self.stack.enter_context(patch.object(v1, 'old_anchors'))
        self.database = self.stack.enter_context(patch.object(v1, 'database_state'))
        self.state = previous.stable(v1.TARGET['base'])
        self.stack.enter_context(patch.object(release, 'state', side_effect=lambda: copy.deepcopy(self.state)))
        def replace(value):
            self.state = copy.deepcopy(value)
        self.stack.enter_context(patch.object(release, 'replace_state', side_effect=replace))
        self.receipt = {'backup': '20261104T010000Z-1234abcd', 'runtimeCommit': v1.TARGET['base'],
                        'database': v1.cutover.DATABASE, 'tableCount': 54,
                        'databaseRestored': False, 'migrationExecuted': False}
        folder = self.backups / self.receipt['backup']
        folder.mkdir()
        backup.write_json(folder / 'snapshot-complete.json', self.receipt)
        backup.write_json(self.root / 'before.json', {'synthetic': 'fresh B1'})
        self.proof = {'oldTables': 54, 'newTables': 18, 'migrations': 54,
                      'oldColumnsUnchanged': True, 'personProfilesExact': True, 'implicitAdmissionGranted': False}
        v1.advance('BASE')

    def step(self, phase):
        if phase == 'DB54_VERIFIED':
            backup.write_json(self.root / 'migration-complete.json', self.proof)
        v1.advance(phase, self.receipt if phase == 'PROTECTED' else None)

    def reach(self, phase):
        for item in v1.PHASES[1:v1.PHASES.index(phase) + 1]:
            self.step(item)

    def held(self):
        with patch.object(v1, 'hold_closed', side_effect=backup.Failure('held')) as hold, \
                patch.object(backup, 'restore') as restore:
            with self.assertRaises(backup.Failure):
                v1.recover_guard()
            hold.assert_called_once()
            restore.assert_not_called()

    def test_all_phases_identity_state_and_ingress(self):
        for phase in v1.PHASES:
            if phase != 'BASE':
                self.step(phase)
            commit = v1.TARGET['base'] if phase == 'BASE' else v1.TARGET['commit']
            self.state = previous.stable(commit)
            if phase in ('WRITE_ENABLE_INTENT', 'VERIFIED_CLOSED'):
                self.state.update(committed=v1.TARGET['base'], pending=True)
            allowed = phase in ('BASE', 'WRITE_ENABLE_INTENT', 'VERIFIED_CLOSED', 'OPEN_INTENT', 'COMMITTED')
            for candidate in (v1.TARGET['base'], v1.TARGET['commit'], release.OLD, '0' * 40):
                with self.subTest(phase=phase, candidate=candidate):
                    if allowed and candidate == commit:
                        v1.assert_start(candidate)
                    else:
                        with self.assertRaises(backup.Failure):
                            v1.assert_start(candidate)
            if phase in ('BASE', 'OPEN_INTENT', 'COMMITTED'):
                v1.assert_start(commit, ingress=True)
            else:
                with self.assertRaises(backup.Failure):
                    v1.assert_start(commit, ingress=True)
            saved = self.state
            self.state = {**saved, 'pending': not saved['pending']}
            with self.assertRaises(backup.Failure):
                v1.assert_start(commit)
            self.state = saved

    def test_only_stable_recovery_and_no_snapshot_restore(self):
        v1.recover_guard()
        for phase in v1.PHASES[1:]:
            self.step(phase)
            self.state = previous.stable(v1.TARGET['commit'])
            if phase == 'COMMITTED':
                v1.recover_guard()
            else:
                self.held()

    def test_missing_corrupt_duplicate_head_never_falls_back(self):
        for raw in (b'', b'{', b'{}', b'{"phase":"BASE","phase":"COMMITTED","eventSha256":"x"}'):
            v1.HEAD.write_bytes(raw)
            self.held()
        v1.HEAD.unlink()
        self.held()

    def test_ahead_event_or_interrupted_head_remains_closed(self):
        with patch.object(v1.os, 'replace', side_effect=RuntimeError('interrupted')):
            with self.assertRaises(RuntimeError):
                self.step('PREPARED')
        self.held()

    def test_skip_reverse_or_reinitialize_rejected(self):
        with self.assertRaises(backup.Failure):
            self.step('MIGRATION_STARTED')
        self.step('PREPARED')
        with self.assertRaises(backup.Failure):
            self.step('BASE')
        with self.assertRaises(backup.Failure):
            v1.initialize()

    def test_fresh_baseline_and_migration_proof_are_required_after_new_writes(self):
        self.reach('WRITE_ENABLE_INTENT')
        for path in (self.root / 'before.json', self.root / 'migration-complete.json',
                     self.backups / self.receipt['backup'] / 'snapshot-complete.json'):
            original = path.read_bytes()
            path.write_text('{}')
            self.held()
            path.write_bytes(original)
        v1.record()

    def test_pre_migration_abort_retains_evidence_and_disables_reuse(self):
        self.reach('PROTECTED')
        self.state['pending'] = True
        with patch.object(backup, 'locked', return_value=nullcontext()), \
                patch.object(v1.protection, 'resume_dependencies') as resume, \
                patch.object(v1.cutover, 'systemctl'), patch.object(v1.cutover, 'check_health'):
            v1.resume_base()
            resume.assert_called_once()
            v1.assert_start(v1.TARGET['base'], ingress=True)
            with self.assertRaises(backup.Failure):
                v1.update()
        self.assertTrue((self.root / 'aborted-before-migration.json').exists())

    def test_migration_intent_forbids_old_resume_before_any_service_action(self):
        self.reach('MIGRATION_STARTED')
        with patch.object(backup, 'locked', return_value=nullcontext()), \
                patch.object(v1.protection, 'resume_dependencies') as resume:
            with self.assertRaises(backup.Failure):
                v1.resume_base()
            resume.assert_not_called()

    def test_closure_attempts_all_writers_even_if_one_fails(self):
        with patch.object(v1.scope, 'close_role', side_effect=RuntimeError('failed')) as role, \
                patch.object(release, 'close_program') as program, patch.object(v1, 'stop_worker') as worker, \
                patch.object(v1.cutover, 'systemctl') as ctl:
            with self.assertRaisesRegex(backup.Failure, 'closure incomplete'):
                v1.hold_closed()
            role.assert_called_once()
            program.assert_called_once()
            worker.assert_called_once()
            ctl.assert_called_once_with('stop', v1.protection.REDIS_UNIT)

    def test_migration_failure_closes_role_and_worker(self):
        self.reach('MIGRATION_STARTED')
        with ExitStack() as stack:
            stack.enter_context(patch.object(v1, 'worker', return_value=None))
            stack.enter_context(patch.object(v1.protection, 'assert_frozen'))
            stack.enter_context(patch.object(v1.scope, 'verify'))
            stack.enter_context(patch.object(v1, 'verified_image'))
            original = backup.read_json
            stack.enter_context(patch.object(backup, 'read_json', side_effect=lambda path:
                {'database': v1.cutover.DATABASE, 'role': v1.cutover.ROLE, 'password': 's' * 48}
                if Path(path).name == 'credentials.json' else original(path)))
            stack.enter_context(patch.object(backup, 'role_change'))
            stack.enter_context(patch.object(backup, 'command', side_effect=backup.Failure('worker failed')))
            role = stack.enter_context(patch.object(v1.scope, 'close_role', side_effect=backup.Failure('close failed')))
            worker = stack.enter_context(patch.object(v1, 'stop_worker'))
            with self.assertRaisesRegex(backup.Failure, 'close failed'):
                v1.migrate()
            role.assert_called_once()
            worker.assert_called_once()
            self.assertFalse((self.root / 'migration-complete.json').exists())

    def test_actual_entry_points_dispatch_v1_before_legacy_recovery(self):
        with patch.object(v1, 'assert_start', side_effect=backup.Failure('V1 held')) as guard, \
                patch.object(previous, 'assert_start') as old:
            with self.assertRaisesRegex(backup.Failure, 'V1 held'):
                release.assert_start(v1.TARGET['base'], ingress=True)
            guard.assert_called_once_with(v1.TARGET['base'], ingress=True)
            old.assert_not_called()
        with patch.object(v1, 'recover_guard', side_effect=backup.Failure('V1 held')) as guard, \
                patch.object(previous, 'recover_guard') as old:
            with self.assertRaisesRegex(backup.Failure, 'V1 held'):
                release.recover_pending_unlocked()
            guard.assert_called_once()
            old.assert_not_called()


    def test_exact_imported_image_binding_and_legacy_path(self):
        imported = self.root / 'images'
        imported.mkdir()
        identity = {'sourceCommit': v1.TARGET['commit'], 'sourceTree': v1.TARGET['tree'],
                    'release': v1.TARGET['release'], 'buildTime': v1.TARGET['buildTime']}
        entry = {'name': 'api', 'imageId': v1.TARGET['images']['api'],
                 'archiveSha256': 'a' * 64, 'scan': {'findings': [], 'toolErrors': 0}}
        backup.write_json(imported / 'manifest.json', {'identity': identity, 'images': [entry]})
        receipt = {'imageImport': 'PASS', 'identity': identity, 'images': [
            {key: entry[key] for key in ('name', 'imageId', 'archiveSha256')}]}
        backup.write_json(imported / 'import-result.json', receipt)
        labels = {'org.opencontainers.image.revision': v1.TARGET['commit'],
                  'com.feishu-timeline.source-tree': v1.TARGET['tree'],
                  'org.opencontainers.image.version': v1.TARGET['release'],
                  'org.opencontainers.image.created': v1.TARGET['buildTime']}
        image = {'Id': entry['imageId'], 'Os': 'linux', 'Architecture': 'amd64',
                 'Config': {'User': 'node', 'Labels': labels}}
        target = {**v1.TARGET, 'imageManifestSha256': backup.sha((imported / 'manifest.json').read_bytes())}
        with patch.object(v1, 'IMPORT', imported), patch.object(v1, 'TARGET', target), \
                patch.object(v1, 'plan', return_value={'candidate': identity}), \
                patch.object(app, 'docker', side_effect=lambda *args: json.dumps([image]).encode()):
            self.assertEqual(app.image_identity('api', v1.identity())['Id'], entry['imageId'])
            for field, bad in (('Id', 'sha256:' + '0' * 64), ('Architecture', 'arm64')):
                original = image[field]
                image[field] = bad
                with self.assertRaises(backup.Failure):
                    v1.verified_image('api', v1.identity())
                image[field] = original
            with self.assertRaises(backup.Failure):
                v1.verified_image('api', {**v1.identity(), 'release': 'mixed'})
            labels['org.opencontainers.image.revision'] = v1.TARGET['base']
            with self.assertRaises(backup.Failure):
                v1.verified_image('api')
            labels['org.opencontainers.image.revision'] = v1.TARGET['commit']
            (imported / 'manifest.json').write_text('{}')
            with self.assertRaises(backup.Failure):
                v1.verified_image('api')

    def test_complete_update_uses_fresh_protection_before_migration_and_open(self):
        events = []
        with ExitStack() as stack:
            for obj, name in ((backup, 'locked'),):
                stack.enter_context(patch.object(obj, name, side_effect=nullcontext))
            for obj, name in ((release, 'verify_checkout'), (release, 'verify_running'),
                              (v1, 'stage_environment'), (app, 'validate_files'),
                              (v1.protection, 'verify_protection'), (v1.protection, 'verify_backup'),
                              (v1.protection, 'resume_dependencies')):
                stack.enter_context(patch.object(obj, name, side_effect=lambda *a, _name=name: events.append(_name)))
            stack.enter_context(patch.object(release, 'close_program', side_effect=lambda **kw: events.append('drained')))
            stack.enter_context(patch.object(v1.protection, 'protect', side_effect=lambda *a: events.append('fresh B1') or self.receipt))
            stack.enter_context(patch.object(v1, 'plan', return_value={'migrations': {str(i): str(i) for i in range(54)}}))
            stack.enter_context(patch.object(v1.preservation, 'capture_before', return_value={'fresh': True}))
            # The synthetic fixture pre-created before.json for phase tests. The normal path must create it once.
            (self.root / 'before.json').unlink()
            stack.enter_context(patch.object(backup, 'sql', return_value='0'))
            def migrate():
                self.assertEqual(v1.record()['phase'], 'MIGRATION_STARTED')
                self.assertEqual(backup.read_json(self.root / 'before.json'), {'fresh': True})
                events.append('migrate')
                backup.write_json(self.root / 'migration-complete.json', self.proof)
            stack.enter_context(patch.object(v1, 'migrate', side_effect=migrate))
            stack.enter_context(patch.object(v1.cutover, 'systemctl', side_effect=lambda *a: events.append(a)))
            stack.enter_context(patch.object(v1.cutover, 'check_health', side_effect=lambda **kw: events.append(('health', kw))))
            v1.update()
        self.assertEqual(v1.record()['phase'], 'COMMITTED')
        self.assertEqual(self.state, previous.stable(v1.TARGET['commit']))
        self.assertLess(events.index('drained'), events.index('fresh B1'))
        self.assertLess(events.index('fresh B1'), events.index('migrate'))
        self.assertLess(events.index('migrate'), events.index('resume_dependencies'))
        self.assertLess(events.index('verify_backup'), events.index(('--no-block', 'start', *v1.cutover.SOCKETS)))


if __name__ == '__main__':
    unittest.main()
