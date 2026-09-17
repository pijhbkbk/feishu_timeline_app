from contextlib import ExitStack
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
import native_backup_controller as backup
import native_cutover as cutover
import native_release as release
import native_release_backup as protection
import native_runtime_app as app
import native_runtime_redis as redis


class ReleaseProtectionTests(unittest.TestCase):
    def test_real_systemd_socket_shape_has_no_main_pid(self):
        # Production systemctl show exposes ControlPID for socket units, but
        # MainPID belongs to their paired service. Keep each service explicit.
        def unit_state(unit):
            value = {'ActiveState': 'inactive', 'ControlPID': '0'}
            if unit not in cutover.SOCKETS:
                value['MainPID'] = '0'
            return value
        stopped = {'State': {'Running': False, 'Pid': 0, 'ExitCode': 0, 'OOMKilled': False}}
        with patch.object(cutover, 'unit_state', side_effect=unit_state), \
                patch.object(app, 'inspect', return_value=None), \
                patch.object(backup, 'sql', side_effect=['0', '0', 't']), \
                patch.object(redis, 'inspect', return_value=stopped):
            protection.assert_frozen()

    def test_socket_shape_exception_does_not_accept_missing_service_pid_or_live_writers(self):
        cases = [(cutover.APPS[0], {'ActiveState': 'inactive', 'ControlPID': '0'}),
                 (cutover.PROXIES[0], {'ActiveState': 'inactive', 'ControlPID': '0'}),
                 (cutover.SOCKETS[0], {'ActiveState': 'inactive', 'MainPID': '23', 'ControlPID': '0'}),
                 (cutover.SOCKETS[0], {'ActiveState': 'inactive'}),
                 (cutover.SOCKETS[0], {'ActiveState': 'inactive', 'ControlPID': '23'}),
                 (cutover.SOCKETS[0], {'ActiveState': 'active', 'ControlPID': '0'}),
                 (cutover.APPS[0], {'ActiveState': 'inactive', 'MainPID': '0'})]
        for affected, invalid in cases:
            def unit_state(unit):
                if unit == affected:
                    return invalid
                value = {'ActiveState': 'inactive', 'ControlPID': '0'}
                if unit not in cutover.SOCKETS:
                    value['MainPID'] = '0'
                return value
            with self.subTest(unit=affected, value=invalid), \
                    patch.object(cutover, 'unit_state', side_effect=unit_state), patch.object(backup, 'sql') as sql:
                with self.assertRaisesRegex(backup.Failure, 'writer/ingress'):
                    protection.assert_frozen()
                sql.assert_not_called()

    def test_requires_durable_previous_commit_before_any_closure(self):
        for value in [None, {'version': 1, 'active': release.OLD, 'committed': release.OLD, 'pending': False},
                      {'version': 1, 'active': 'different', 'committed': release.OLD, 'pending': True}]:
            with self.subTest(value=value), patch.object(release, 'state', return_value=value), \
                    patch.object(protection.scope, 'close_role') as close, patch.object(cutover, 'systemctl') as ctl:
                with self.assertRaisesRegex(backup.Failure, 'Durable'):
                    protection.protect(release.OLD)
                close.assert_not_called(); ctl.assert_not_called()

    def test_unhealthy_redis_refuses_freeze_and_database_dump(self):
        with patch.object(release, 'state', return_value={'version': 1, 'active': release.OLD, 'committed': release.OLD, 'pending': True}), \
                patch.object(protection.scope, 'verify'), patch.object(redis, 'validate_files'), \
                patch.object(redis, 'inspect', return_value={'State': {'Running': False}}), \
                patch.object(protection.scope, 'close_role') as close, patch.object(cutover, 'dump_native') as dump:
            with self.assertRaisesRegex(backup.Failure, 'Redis must be healthy'):
                protection.protect(release.OLD)
            close.assert_not_called(); dump.assert_not_called()

    def test_frozen_gate_requires_all_application_and_native_storage_writers_stopped(self):
        inactive = {'ActiveState': 'inactive', 'MainPID': '0', 'ControlPID': '0'}
        stopped = {'State': {'Running': False, 'Pid': 0, 'ExitCode': 0, 'OOMKilled': False}}
        with patch.object(cutover, 'unit_state', return_value=inactive), patch.object(app, 'inspect', return_value=None), \
                patch.object(backup, 'sql', side_effect=['0', '0', 't']), patch.object(redis, 'inspect', return_value=stopped):
            protection.assert_frozen()
        for corrupt in ({**stopped['State'], 'ExitCode': 137}, {**stopped['State'], 'OOMKilled': True},
                        {**stopped['State'], 'Running': True}):
            with patch.object(cutover, 'unit_state', return_value=inactive), patch.object(app, 'inspect', return_value=None), \
                    patch.object(backup, 'sql', side_effect=['0', '0', 't']), patch.object(redis, 'inspect', return_value={'State': corrupt}):
                with self.assertRaisesRegex(backup.Failure, 'Redis did not stop cleanly'):
                    protection.assert_frozen()
        with patch.object(cutover, 'unit_state', return_value={**inactive, 'MainPID': '100'}), patch.object(backup, 'sql') as sql:
            with self.assertRaisesRegex(backup.Failure, 'writer/ingress'):
                protection.assert_frozen()
            sql.assert_not_called()

    def test_database_change_after_private_start_is_not_ignored_or_restored(self):
        with patch.object(protection, 'verify_backup'), patch.object(backup, 'read_json', return_value={'baseline': True}), \
                patch.object(backup, 'fingerprints', return_value={'baseline': False}), patch.object(backup, 'restore') as restore:
            with self.assertRaisesRegex(backup.Failure, 'Database changed'):
                protection.verify_protection({'backup': '20260917T000000Z-12345678'})
            restore.assert_not_called()

    def test_resume_reopens_only_fixed_native_role_and_starts_only_native_redis(self):
        with patch.object(backup, 'role_change') as role, patch.object(cutover, 'systemctl') as ctl:
            protection.resume_dependencies()
            role.assert_called_once_with('ALTER ROLE "' + cutover.ROLE + '" LOGIN CONNECTION LIMIT 12;')
            ctl.assert_called_once_with('--no-block', 'start', 'timeline-native-redis.service')

    def test_manifest_path_escape_and_duplicate_are_rejected_before_file_read(self):
        receipt = {'backup': '20260917T000000Z-12345678', 'runtimeCommit': release.OLD,
                   'manifestSha256': hashlib.sha256(b'manifest').hexdigest(),
                   'fingerprintsSha256': hashlib.sha256(b'fingerprint').hexdigest()}
        base = {'purpose': 'native-program-release-protection', 'sourceDatabase': cutover.DATABASE,
                'runtimeCommit': release.OLD, 'database': {'path': 'database.dump', 'size': 0, 'sha256': ''},
                'objects': [], 'redisFiles': []}
        for path in ('../outside', '/etc/shadow', 'objects/../../outside', 'arbitrary/file', 'objects//ambiguous'):
            manifest = copy.deepcopy(base); manifest['database']['path'] = path
            with self.subTest(path=path), patch.object(backup, 'directory', return_value=123), patch.object(protection.os, 'close'), \
                    patch.object(protection.os, 'fstat', return_value=types.SimpleNamespace(st_mode=0o40700)), \
                    patch.object(backup, 'read_file', side_effect=[b'manifest', b'fingerprint']) as read, \
                    patch.object(backup, 'read_json', return_value=manifest):
                with self.assertRaisesRegex(backup.Failure, 'path outside'):
                    protection.verify_backup(receipt)
                self.assertEqual(read.call_count, 2)


if __name__ == '__main__':
    unittest.main()
