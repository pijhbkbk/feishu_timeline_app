import copy
from contextlib import ExitStack, contextmanager
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import native_release as release
import native_runtime_app as app
import native_cutover as cutover
import native_backup_controller as backup


def stable(commit=release.OLD):
    return {'version': 1, 'active': commit, 'committed': commit, 'pending': False}


class ReleaseBoundaryTests(unittest.TestCase):
    def test_live_operation_lock_blocks_competing_recovery_without_state_change(self):
        regular = backup.regular
        with tempfile.TemporaryDirectory() as directory, patch.object(release, 'ROOT', Path(directory)), \
                patch.object(backup, 'regular', side_effect=lambda fd, maximum, owner: regular(fd, maximum, owner=os.getuid())), \
                patch.object(release, 'present', return_value=True), patch.object(release, 'recover_pending_unlocked') as recover:
            with release.operation():
                with self.assertRaises(release.OperationActive):
                    release.recover_pending()
                recover.assert_not_called()
            release.recover_pending()
            recover.assert_called_once()

    def test_main_holds_independent_lock_for_whole_update_and_rollback_call(self):
        regular = backup.regular
        observed = []
        def update(**kwargs):
            with self.assertRaises(release.OperationActive):
                with release.operation():
                    self.fail('Competing operation acquired the lock')
            observed.append(kwargs)
        with tempfile.TemporaryDirectory() as directory, patch.object(release, 'ROOT', Path(directory)), \
                patch.object(backup, 'regular', side_effect=lambda fd, maximum, owner: regular(fd, maximum, owner=os.getuid())), \
                patch.object(release, 'INSTALLED', Path(release.__file__).parent), \
                patch.object(release.os, 'geteuid', return_value=0), \
                patch.object(release.socket, 'gethostname', return_value='instance-20260408-091840'), \
                patch.object(app, 'state_directory'), patch.object(release, 'update', side_effect=update):
            for action in ('update', 'rollback'):
                with patch.object(release.sys, 'argv', ['native_release.py', action]):
                    release.main()
            self.assertEqual(observed, [{'rehearse': False, 'rollback': False}, {'rehearse': False, 'rollback': True}])

    def test_interrupted_rollback_restores_new_program_without_database_restore(self):
        pending = {'version': 1, 'active': release.OLD, 'committed': release.NEW, 'pending': True}
        with patch.object(release, 'state', return_value=pending), patch.object(release, 'close_program'), \
                patch.object(release, 'replace_state') as write, patch.object(backup, 'restore') as restore, patch('builtins.print'):
            release.recover_pending_unlocked()
            write.assert_called_once_with(stable(release.NEW))
            restore.assert_not_called()

    def test_rollback_accepts_stopped_or_missing_new_containers(self):
        for existing in (None, {'State': {'Running': False, 'Pid': 0}}):
            value = stable(release.NEW)
            seen = []
            def write(next_value):
                nonlocal value
                value = next_value
            def validate_running():
                # Only the replacement OLD is required to be running at the final gate.
                seen.append(value.copy())
                self.assertEqual(value['active'], release.OLD)
            with self.subTest(existing=existing), ExitStack() as stack:
                for obj, name in [(cutover, 'committed_value'), (cutover, 'no_old_journals'),
                                  (release, 'stage_environment'), (release, 'close_program'),
                                  (app, 'validate_files'), (cutover, 'systemctl'), (cutover, 'check_health')]:
                    stack.enter_context(patch.object(obj, name))
                checkout = stack.enter_context(patch.object(release, 'verify_checkout'))
                inspect = stack.enter_context(patch.object(app, 'inspect', return_value=existing))
                stack.enter_context(patch.object(release, 'verify_running', side_effect=validate_running))
                stack.enter_context(patch.object(backup, 'locked'))
                stack.enter_context(patch.object(release, 'state', side_effect=lambda: value.copy()))
                stack.enter_context(patch.object(release, 'replace_state', side_effect=write))
                stack.enter_context(patch('builtins.print'))
                release.update(rollback=True)
                self.assertEqual(value, stable())
                self.assertEqual(len(seen), 1)
                self.assertEqual(inspect.call_count, 2)
                checkout.assert_called_once_with(release.OLD)

    def test_rollback_rejects_unknown_container_before_release_intent(self):
        with patch.object(backup, 'locked'), patch.object(cutover, 'committed_value'), \
                patch.object(cutover, 'no_old_journals'), patch.object(release, 'verify_checkout'), \
                patch.object(release, 'state', return_value=stable(release.NEW)), \
                patch.object(app, 'inspect', side_effect=backup.Failure('Unowned application container')), \
                patch.object(release, 'replace_state') as write:
            with self.assertRaisesRegex(backup.Failure, 'Unowned'):
                release.update(rollback=True)
            write.assert_not_called()

    def test_missing_state_preserves_original_metadata_and_environment_paths(self):
        with patch.object(release, 'present', return_value=False):
            self.assertEqual(release.current()['commit'], app.COMMIT)
            self.assertEqual(release.current()['images'], app.IMAGES)
            self.assertEqual(release.environment_path('api'), app.ROOT / 'api.env')
            self.assertEqual(release.environment_path('web'), app.ROOT / 'web.env')

    def test_unknown_or_inconsistent_state_fails_closed(self):
        invalid = [None, [], {**stable(), 'active': []}, {**stable(), 'active': 'unknown'},
                   {**stable(), 'version': True}, {**stable(), 'pending': 1},
                   {**stable(), 'extra': 'field'}, {**stable(), 'active': release.NEW},
                   {**stable(), 'committed': 'unknown'}]
        for value in invalid:
            with self.subTest(value=value), patch.object(release, 'present', return_value=True), \
                    patch.object(backup, 'read_json', return_value=value):
                with self.assertRaises(backup.Failure):
                    release.current()

    def test_pending_prevents_ingress_before_checkout_or_commands(self):
        value = {**stable(), 'active': release.NEW, 'pending': True}
        with patch.object(release, 'state', return_value=value), patch.object(release, 'verify_checkout') as verify:
            with self.assertRaisesRegex(backup.Failure, 'pending'):
                release.ingress_ready()
            verify.assert_not_called()
        with patch.object(release, 'state', return_value=stable(release.NEW)), patch.object(release, 'verify_checkout') as verify:
            release.ingress_ready()
            verify.assert_called_once_with(release.NEW)

    def test_new_environment_changes_only_metadata_and_preserves_private_paths(self):
        with patch.object(release, 'state', return_value=stable()):
            old = app.fixed_environment({'password': 'fixture-db'}, 'fixture-redis')
        with patch.object(release, 'state', return_value=stable(release.NEW)):
            new = app.fixed_environment({'password': 'fixture-db'}, 'fixture-redis')
            self.assertEqual(release.environment_path('api'), app.ROOT / 'api-6c70.env')
            self.assertEqual(release.environment_path('web'), app.ROOT / 'web-6c70.env')
        changed = {key for key in old if old[key] != new[key]}
        self.assertEqual(changed, {'EXPECTED_SOURCE_COMMIT', 'EXPECTED_SOURCE_TREE', 'EXPECTED_RELEASE', 'EXPECTED_BUILD_TIME'})
        self.assertEqual(app.COMMIT, release.OLD)
        self.assertEqual(app.migration.COMMIT, release.OLD)

    def test_wrong_image_version_is_rejected_before_container_creation(self):
        identity = release.VERSIONS[release.NEW]
        image = {'RepoDigests': [identity['images']['api']], 'Architecture': 'amd64', 'Os': 'linux',
                 'Config': {'Labels': {'org.opencontainers.image.revision': release.OLD,
                                       'com.feishu-timeline.source-tree': identity['tree'],
                                       'org.opencontainers.image.version': identity['release'],
                                       'org.opencontainers.image.created': identity['buildTime']}}}
        with patch.object(app, 'docker', return_value=json.dumps([image]).encode()):
            with self.assertRaisesRegex(backup.Failure, 'identity differs'):
                app.image_identity('api', identity)

    def test_recovery_selects_old_native_program_only_after_owned_containers_stop(self):
        events = []
        pending = {**stable(), 'active': release.NEW, 'pending': True}
        with patch.object(release, 'state', return_value=pending), \
                patch.object(release, 'close_program', side_effect=lambda: events.append('stop')), \
                patch.object(release, 'replace_state', side_effect=lambda value: events.append(value)), \
                patch.object(backup, 'role_change') as roles, patch.object(backup, 'sql') as sql, patch('builtins.print'):
            self.assertTrue(release.recover_pending_unlocked())
            self.assertEqual(events, ['stop', stable()])
            roles.assert_not_called()
            sql.assert_not_called()
        with patch.object(release, 'state', return_value=pending), \
                patch.object(release, 'close_program', side_effect=backup.Failure('still running')), \
                patch.object(release, 'replace_state') as write:
            with self.assertRaises(backup.Failure):
                release.recover_pending_unlocked()
            write.assert_not_called()

    def test_committed_new_program_is_not_rolled_back(self):
        with patch.object(release, 'state', return_value=stable(release.NEW)), \
                patch.object(release, 'close_program') as close, patch.object(release, 'replace_state') as write:
            self.assertFalse(release.recover_pending_unlocked())
            close.assert_not_called()
            write.assert_not_called()

    def test_update_releases_lock_before_start_and_commits_only_after_private_health(self):
        events = []
        value = stable()
        locked = False
        @contextmanager
        def lock():
            nonlocal locked
            self.assertFalse(locked)
            locked = True
            try:
                yield
            finally:
                locked = False
        def write(next_value):
            nonlocal value
            self.assertTrue(locked)
            value = copy.deepcopy(next_value)
            events.append(('state', value.copy()))
        def systemctl(*args):
            self.assertFalse(locked)
            events.append(('start', args))
        def health(public=False):
            self.assertFalse(locked)
            self.assertEqual(value['pending'], not public)
            events.append(('health', public))
        with ExitStack() as stack:
            for obj, name in [(cutover, 'committed_value'), (cutover, 'no_old_journals'),
                              (release, 'verify_checkout'), (app, 'validate_files'),
                              (release, 'verify_running'), (release, 'stage_environment'), (release, 'close_program')]:
                stack.enter_context(patch.object(obj, name))
            stack.enter_context(patch.object(backup, 'locked', lock))
            stack.enter_context(patch.object(release, 'state', side_effect=lambda: value.copy()))
            stack.enter_context(patch.object(release, 'replace_state', side_effect=write))
            stack.enter_context(patch.object(cutover, 'systemctl', side_effect=systemctl))
            stack.enter_context(patch.object(cutover, 'check_health', side_effect=health))
            roles = stack.enter_context(patch.object(backup, 'role_change'))
            restore = stack.enter_context(patch.object(backup, 'restore'))
            stack.enter_context(patch('builtins.print'))
            release.update()
            self.assertEqual(value, stable(release.NEW))
            self.assertEqual([event[0] for event in events], ['state', 'state', 'start', 'health', 'state', 'start', 'health'])
            roles.assert_not_called()
            restore.assert_not_called()

    def test_private_health_failure_keeps_recoverable_intent_and_ingress_closed(self):
        value = stable()
        def write(next_value):
            nonlocal value
            value = next_value
        with ExitStack() as stack:
            for obj, name in [(cutover, 'committed_value'), (cutover, 'no_old_journals'), (release, 'verify_checkout'),
                              (app, 'validate_files'), (release, 'verify_running'), (release, 'stage_environment'),
                              (release, 'close_program')]:
                stack.enter_context(patch.object(obj, name))
            stack.enter_context(patch.object(backup, 'locked'))
            stack.enter_context(patch.object(release, 'state', side_effect=lambda: value.copy()))
            stack.enter_context(patch.object(release, 'replace_state', side_effect=write))
            ctl = stack.enter_context(patch.object(cutover, 'systemctl'))
            stack.enter_context(patch.object(cutover, 'check_health', side_effect=backup.Failure('not healthy')))
            with self.assertRaises(backup.Failure):
                release.update()
            self.assertEqual(value, {**stable(), 'active': release.NEW, 'pending': True})
            ctl.assert_called_once_with('--no-block', 'start', *cutover.APPS)


if __name__ == '__main__':
    unittest.main()
