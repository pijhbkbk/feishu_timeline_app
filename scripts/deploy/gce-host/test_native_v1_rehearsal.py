import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import native_backup_controller as backup
import native_v1_rehearsal as rehearsal


class RehearsalTests(unittest.TestCase):
    def setUp(self):
        self.value = {'base': rehearsal.prepare.BASE, 'opsImageId': 'sha256:' + 'a'*64,
            'candidate': {'sourceCommit': 'b'*40, 'sourceTree': 'c'*40,
                          'release': 'ci-123-1', 'buildTime': '2026-11-04T00:00:00Z'},
            'migrations': {str(index): 'd'*64 for index in range(54)}}
        self.image = {'Id': self.value['opsImageId'], 'Os': 'linux', 'Architecture': 'amd64',
            'Config': {'User': 'node', 'Labels': {'org.opencontainers.image.revision': 'b'*40,
                'com.feishu-timeline.source-tree': 'c'*40, 'org.opencontainers.image.version': 'ci-123-1',
                'org.opencontainers.image.created': '2026-11-04T00:00:00Z'}}}

    def test_exact_candidate_image_is_required(self):
        with patch.object(backup, 'command', return_value=json.dumps([self.image]).encode()):
            rehearsal.image_identity(self.value)
        for key, value in [('Id', 'sha256:'+'f'*64), ('Architecture', 'arm64'), ('Os', 'windows')]:
            item = copy.deepcopy(self.image)
            item[key] = value
            with self.subTest(key=key), patch.object(backup, 'command', return_value=json.dumps([item]).encode()):
                with self.assertRaises(backup.Failure): rehearsal.image_identity(self.value)
        self.image['Config']['Labels']['org.opencontainers.image.revision'] = 'e'*40
        with patch.object(backup, 'command', return_value=json.dumps([self.image]).encode()):
            with self.assertRaises(backup.Failure): rehearsal.image_identity(self.value)

    def test_production_database_or_role_cannot_enter_recovery(self):
        for key, value in [('DATABASE', rehearsal.prepare.DATABASE), ('ROLE', rehearsal.prepare.ROLE)]:
            with self.subTest(key=key), patch.object(rehearsal, key, value), patch.object(backup, 'sql') as sql:
                with self.assertRaisesRegex(backup.Failure, 'Production recovery forbidden'): rehearsal.recover()
                sql.assert_not_called()

    def test_missing_pending_has_no_database_or_container_effect(self):
        with patch.object(rehearsal.os.path, 'lexists', return_value=False), \
                patch.object(backup, 'sql') as sql, patch.object(backup, 'command') as command:
            rehearsal.recover()
            sql.assert_not_called()
            command.assert_not_called()

    def test_mismatched_pending_refuses_before_role_closure(self):
        with patch.object(rehearsal.os.path, 'lexists', return_value=True), \
                patch.object(backup, 'read_json', return_value={'database': rehearsal.prepare.DATABASE}), \
                patch.object(backup, 'read_file', return_value=b'plan'), patch.object(backup, 'role_change') as role:
            with self.assertRaisesRegex(backup.Failure, 'recovery binding'): rehearsal.recover()
            role.assert_not_called()

    def test_owned_rehearsal_role_is_closed_and_only_its_sessions_terminated(self):
        pending = {'database': rehearsal.DATABASE, 'role': rehearsal.ROLE, 'planSha256': backup.sha(b'plan')}
        queries = []
        def sql(query):
            queries.append(query)
            if 'SELECT NOT rolcanlogin' in query: return 't'
            return '1' if 'FROM pg_roles' in query else '0'
        with patch.object(rehearsal.os.path, 'lexists', return_value=True), \
                patch.object(backup, 'read_json', return_value=pending), \
                patch.object(backup, 'read_file', return_value=b'plan'), \
                patch.object(backup, 'sql', side_effect=sql), \
                patch.object(backup, 'command', return_value=b''):
            rehearsal.recover()
        self.assertTrue(all(rehearsal.prepare.ROLE not in query for query in queries))
        self.assertIn('pg_advisory_xact_lock', queries[0])
        self.assertIn('IF EXISTS', queries[0])
        self.assertIn('"' + rehearsal.ROLE + '" NOLOGIN', queries[0])
        self.assertIn("usename='" + rehearsal.ROLE + "'", queries[3])

    def test_missing_role_lookup_still_follows_locked_creation_barrier(self):
        pending = {'database': rehearsal.DATABASE, 'role': rehearsal.ROLE, 'planSha256': backup.sha(b'plan')}
        with patch.object(rehearsal.os.path, 'lexists', return_value=True), \
                patch.object(backup, 'read_json', return_value=pending), patch.object(backup, 'read_file', return_value=b'plan'), \
                patch.object(backup, 'sql', side_effect=['', '0', '0']) as sql, \
                patch.object(backup, 'command', return_value=b''):
            rehearsal.recover()
        self.assertIn('pg_advisory_xact_lock(' + backup.ROLE_CHANGE_LOCK, sql.call_args_list[0].args[0])
        self.assertIn('NOLOGIN', sql.call_args_list[0].args[0])
        self.assertIn('SELECT count(*) FROM pg_roles', sql.call_args_list[1].args[0])

    def test_role_closure_readback_failure_cannot_report_recovery_success(self):
        pending = {'database': rehearsal.DATABASE, 'role': rehearsal.ROLE, 'planSha256': backup.sha(b'plan')}
        with patch.object(rehearsal.os.path, 'lexists', return_value=True), \
                patch.object(backup, 'read_json', return_value=pending), patch.object(backup, 'read_file', return_value=b'plan'), \
                patch.object(backup, 'sql', side_effect=['', '1', 'f']), patch.object(backup, 'command') as command:
            with self.assertRaisesRegex(backup.Failure, 'closure unverified'): rehearsal.recover()
            command.assert_not_called()

    def test_scope_requires_real_cross_database_rejection_and_target_authentication(self):
        deny = SimpleNamespace(returncode=2, stdout=b'', stderr=b'pg_hba.conf rejects connection')
        wrong = SimpleNamespace(returncode=2, stdout=b'', stderr=b'password authentication failed')
        allowed = SimpleNamespace(returncode=0, stdout=b'1\n', stderr=b'')
        with patch.object(rehearsal, 'probe', side_effect=[deny, deny, deny, wrong, allowed]) as probe:
            rehearsal.verify_scope('synthetic-test-password')
        self.assertEqual([call.args[0] for call in probe.call_args_list],
                         ['postgres', 'feishu_timeline', rehearsal.prepare.DATABASE, rehearsal.DATABASE, rehearsal.DATABASE])
        for first in [allowed, wrong]:
            with patch.object(rehearsal, 'probe', return_value=first), self.assertRaises(backup.Failure):
                rehearsal.verify_scope('synthetic-test-password')

    def test_scope_cannot_accept_unloaded_rules_before_opening_role(self):
        prefix = rehearsal.scope.PREFIX + rehearsal.scope.V1_REHEARSAL_PREFIX
        with patch.object(backup, 'sql', side_effect=[str(rehearsal.scope.HBA), '0', 't']), \
                patch.object(rehearsal.scope, 'read_hba', return_value=prefix+b'original'), \
                patch.object(rehearsal.scope, 'scope_bytes_valid', return_value=True), \
                patch.object(rehearsal, 'probe', return_value=SimpleNamespace(returncode=2, stderr=b'password authentication failed')), \
                patch.object(rehearsal.time, 'sleep'), patch.object(rehearsal.scope, 'verify') as original_scope:
            with self.assertRaisesRegex(backup.Failure, 'not effective'): rehearsal.install_scope()
            original_scope.assert_not_called()

    def test_open_role_requires_closed_identity_and_effective_isolation(self):
        prefix = rehearsal.scope.PREFIX + rehearsal.scope.V1_REHEARSAL_PREFIX
        denied = SimpleNamespace(returncode=2, stderr=b'pg_hba.conf rejects connection')
        with patch.object(rehearsal.scope, 'read_hba', return_value=prefix+b'original'), \
                patch.object(rehearsal.scope, 'scope_bytes_valid', return_value=True), \
                patch.object(rehearsal, 'probe', return_value=denied), \
                patch.object(backup, 'sql', side_effect=['t', rehearsal.ROLE, '0', '0']), \
                patch.object(backup, 'role_change') as role:
            rehearsal.open_role()
            self.assertIn('"' + rehearsal.ROLE + '" LOGIN CONNECTION LIMIT 4 VALID UNTIL', role.call_args.args[0])
        for replies in [['f'], ['t', 'another_owner'], ['t', rehearsal.ROLE, '1'], ['t', rehearsal.ROLE, '0', '1']]:
            with self.subTest(replies=replies), \
                    patch.object(rehearsal.scope, 'read_hba', return_value=prefix+b'original'), \
                    patch.object(rehearsal.scope, 'scope_bytes_valid', return_value=True), \
                    patch.object(rehearsal, 'probe', return_value=denied), \
                    patch.object(backup, 'sql', side_effect=replies), patch.object(backup, 'role_change') as role:
                with self.assertRaises(backup.Failure): rehearsal.open_role()
                role.assert_not_called()


if __name__ == '__main__':
    unittest.main()
