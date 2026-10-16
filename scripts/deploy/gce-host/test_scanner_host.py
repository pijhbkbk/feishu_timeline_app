import copy
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import scanner_host as adapter
from scanner_update_policy import DatabaseFile, DownloadFailure, RunningSet, UpdateFailure, VerifiedSet


class RuntimeIdentityTests(unittest.TestCase):
    def setUp(self):
        self.host = adapter.LinuxHost.__new__(adapter.LinuxHost)
        self.host.config_hash = 'a' * 64
        self.host.security_profile = {'defaultAction': 'SCMP_ACT_ERRNO', 'syscalls': []}
        signed = int(datetime.datetime(2026, 9, 12, 6, tzinfo=datetime.timezone.utc).timestamp())
        self.files = tuple(DatabaseFile(name + '.cvd', 'b' * 64, 512, 20) for name in ('main', 'daily', 'bytecode'))
        self.expected = RunningSet(VerifiedSet(self.files, 20, signed), 'boot:container:pid:start', adapter.IMAGE, 'a' * 64)
        self.item = {'Image': adapter.IMAGE, 'State': {'Running': True, 'OOMKilled': False},
                     'Config': {'Entrypoint': ['/usr/sbin/clamd'], 'Cmd': ['--config-file=/etc/clamav/clamd.conf'],
                                'User': '100:101', 'Env': ['TZ=UTC']},
                     'HostConfig': {'ReadonlyRootfs': True, 'NetworkMode': 'none', 'PortBindings': {},
                                    'RestartPolicy': {'Name': 'no'}, 'CapDrop': ['ALL'], 'CapAdd': None,
                                    'Privileged': False, 'PidMode': '', 'Memory': 3 * 1024 ** 3,
                                    'MemorySwap': 3 * 1024 ** 3, 'NanoCpus': 1500000000, 'PidsLimit': 128,
                                    'Tmpfs': {'/tmp': 'rw,noexec,nosuid,size=128m'},
                                    'SecurityOpt': ['no-new-privileges', 'seccomp=' + json.dumps(self.host.security_profile)]},
                     'Mounts': [
                         {'Type': 'bind', 'Source': str(adapter.CONFIG / 'clamd.conf'), 'Destination': '/etc/clamav/clamd.conf', 'RW': False},
                         {'Type': 'bind', 'Source': str(adapter.BASE / 'sets' / ('c' * 32)), 'Destination': '/var/lib/clamav', 'RW': False},
                         {'Type': 'bind', 'Source': str(adapter.SOCKET_ROOT / 'engine'), 'Destination': '/run/clamav', 'RW': True}]}
        self.version = b'ClamAV 1.4.6/20/Sat Sep 12 06:00:00 2026'

    def verify(self, item=None, version=None, corrupt=False, remaining=None):
        def digest(path, *args):
            if path.name == 'clamd.conf':
                return 'a' * 64, 300
            return ('d' if corrupt else 'b') * 64, 512
        with patch.object(adapter, 'owned_container', return_value=item or self.item), \
             patch.object(adapter, 'database_directory', return_value=Path('/frozen')), \
             patch.object(adapter, 'bounded_entries', return_value=[Path(file.name) for file in self.files]), \
             patch.object(adapter, 'file_hash', side_effect=digest), \
             patch.object(adapter, 'process_identity', return_value=self.expected.process_start_identity), \
             patch.object(adapter, 'engine_command', return_value=version or self.version), \
             patch.object(self.host, 'now', return_value=self.expected.databases.daily_stime +
                          (60 if remaining is None else 48 * 3600 - remaining)):
            return self.host.verify_active(self.expected)

    def test_exact_loaded_identity(self):
        self.assertEqual(self.verify(), self.expected)

    def test_published_scanner_port_rejected(self):
        self.item['HostConfig']['PortBindings'] = {'3310/tcp': [{'HostPort': '3310'}]}
        with self.assertRaises(UpdateFailure):
            self.verify()

    def test_privileged_container_rejected(self):
        self.item['HostConfig']['Privileged'] = True
        with self.assertRaises(UpdateFailure):
            self.verify()

    def test_extra_capabilities_rejected(self):
        self.item['HostConfig']['CapAdd'] = ['SYS_ADMIN']
        with self.assertRaises(UpdateFailure):
            self.verify()

    def test_docker_json_seccomp_matches_independent_of_whitespace(self):
        self.item['HostConfig']['SecurityOpt'][1] = 'seccomp=' + json.dumps(self.host.security_profile, indent=2)
        self.assertEqual(self.verify(), self.expected)

    def test_unconfined_or_changed_seccomp_rejected(self):
        for value in ['seccomp=unconfined', 'seccomp=' + str(adapter.CONFIG / 'seccomp-amd64.json'),
                      'seccomp=' + json.dumps({'defaultAction': 'SCMP_ACT_ALLOW', 'syscalls': []})]:
            self.item['HostConfig']['SecurityOpt'][1] = value
            with self.assertRaises(UpdateFailure):
                self.verify()

    def test_extra_security_option_rejected(self):
        self.item['HostConfig']['SecurityOpt'].append('apparmor=unconfined')
        with self.assertRaises(UpdateFailure):
            self.verify()

    def test_unbounded_memory_rejected(self):
        self.item['HostConfig']['Memory'] = 0
        with self.assertRaises(UpdateFailure):
            self.verify()

    def test_extra_host_mount_rejected(self):
        self.item['Mounts'].append({'Type': 'bind', 'Source': '/', 'Destination': '/host', 'RW': False})
        with self.assertRaises(UpdateFailure):
            self.verify()

    def test_extra_docker_volume_rejected(self):
        self.item['Mounts'].append({'Type': 'volume', 'Source': 'unexpected', 'Destination': '/data', 'RW': True})
        with self.assertRaises(UpdateFailure):
            self.verify()

    def test_rejects_before_expiry_to_cover_monitor_and_shutdown_latency(self):
        for remaining in (1, adapter.ADMISSION_MARGIN_SECONDS - 1):
            with self.assertRaises(UpdateFailure):
                self.verify(remaining=remaining)
        self.assertEqual(self.verify(remaining=adapter.ADMISSION_MARGIN_SECONDS), self.expected)

    def test_modified_database_bytes_rejected(self):
        with self.assertRaises(UpdateFailure):
            self.verify(corrupt=True)

    def test_same_version_with_different_loaded_timestamp_rejected(self):
        with self.assertRaises(UpdateFailure):
            self.verify(version=b'ClamAV 1.4.6/20/Sat Sep 12 05:00:00 2026')

    def test_unexpected_timezone_rejected(self):
        self.item['Config']['Env'] = []
        with self.assertRaises(UpdateFailure):
            self.verify()

    def test_writable_database_mount_rejected(self):
        self.item['Mounts'][1]['RW'] = True
        with self.assertRaises(UpdateFailure):
            adapter.database_directory(self.item)


class LifecycleTests(unittest.TestCase):
    def test_loaded_identity_failure_is_not_hidden_as_readiness_timeout(self):
        host = adapter.LinuxHost.__new__(adapter.LinuxHost)
        with patch.object(host, 'verify_active', side_effect=UpdateFailure('Scanner isolation differs')), \
             patch.object(adapter.time, 'sleep') as sleep:
            with self.assertRaisesRegex(UpdateFailure, 'Scanner isolation differs'):
                host.verify_loaded(object())
            sleep.assert_not_called()

    def test_open_starts_socket_and_probes_only_after_approval_and_identity(self):
        host = adapter.LinuxHost.__new__(adapter.LinuxHost)
        host.store = MagicMock()
        expected = object()
        host.store.read.return_value.approved = expected
        stream = MagicMock()
        stream.recv.return_value = b'PONG\0'
        with patch.object(host, 'verify_active') as verify, patch.object(adapter, 'run') as run, \
             patch.object(adapter.socket, 'create_connection') as connect:
            connect.return_value.__enter__.return_value = stream
            host.open_admission(expected)
            self.assertEqual(verify.call_count, 2)
            run.assert_called_once_with(['/usr/bin/systemctl', 'start', adapter.PROXY_SOCKET])
            connect.assert_called_once_with(('127.0.0.1', 3310), timeout=10)
            stream.sendall.assert_called_once_with(b'zPING\0')

    def test_unapproved_process_never_opens_socket(self):
        host = adapter.LinuxHost.__new__(adapter.LinuxHost)
        host.store = MagicMock()
        host.store.read.return_value.approved = None
        with patch.object(adapter, 'run') as run:
            with self.assertRaises(UpdateFailure):
                host.open_admission(object())
            run.assert_not_called()

    def test_runtime_command_explicitly_fixes_timezone(self):
        self.assertIn('--env=TZ=UTC', adapter.common_args(adapter.ENGINE))

    def test_failed_check_recovery_closes_under_lock_without_docker_inspect(self):
        store = MagicMock()
        with tempfile.TemporaryDirectory() as root:
            fd = os.open(root, os.O_RDONLY)
            with patch.object(adapter, '__file__', str(adapter.INSTALLED / 'scanner_host.py')), \
                 patch.object(adapter.os, 'geteuid', return_value=0), \
                 patch.object(adapter.sys, 'argv', ['scanner_host.py', 'recover-check']), \
                 patch.dict(os.environ, {'SERVICE_RESULT': 'timeout'}), \
                 patch.object(adapter, 'secure_dir', return_value=fd), \
                 patch.object(adapter, 'StateStore', return_value=store), \
                 patch.object(adapter.LinuxHost, '__init__', side_effect=AssertionError('Must not inspect Docker')), \
                 patch.object(adapter.LinuxHost, 'close_admission') as close:
                adapter.main()
                store.locked.assert_called_once()
                close.assert_called_once_with(None)
                store.read.assert_not_called()

    def test_unowned_container_is_never_stopped(self):
        item = {'Config': {'Labels': {}}, 'Image': adapter.IMAGE}
        with patch.object(adapter, 'inspect', return_value=item), patch.object(adapter, 'docker') as docker:
            with self.assertRaises(UpdateFailure):
                adapter.stop_container(adapter.ENGINE)
            docker.assert_not_called()

    def test_close_requires_proxy_process_exit(self):
        replies = [b'', b'ActiveState=inactive\n', b'ActiveState=inactive\nMainPID=55\n']
        with patch.object(adapter, 'run', side_effect=[subprocess.CompletedProcess([], 0, value, b'') for value in replies]):
            with self.assertRaises(UpdateFailure):
                adapter.LinuxHost.close_admission(None)

    def test_close_rejects_forwardable_connection(self):
        replies = [b'', b'ActiveState=inactive\n', b'ActiveState=inactive\nMainPID=0\n', b'ESTAB 0 0 127.0.0.1:3310 127.0.0.1:9999\n']
        with patch.object(adapter, 'run', side_effect=[subprocess.CompletedProcess([], 0, value, b'') for value in replies]):
            with self.assertRaises(UpdateFailure):
                adapter.LinuxHost.close_admission(None)

    def test_close_allows_kernel_fin_wait_without_proxy(self):
        replies = [b'', b'ActiveState=inactive\n', b'ActiveState=inactive\nMainPID=0\n', b'FIN-WAIT-2 0 0 127.0.0.1:3310 127.0.0.1:9999\n']
        with patch.object(adapter, 'run', side_effect=[subprocess.CompletedProcess([], 0, value, b'') for value in replies]):
            adapter.LinuxHost.close_admission(None)

    def test_download_timeout_stops_owned_writer_before_failure(self):
        host = adapter.LinuxHost.__new__(adapter.LinuxHost)
        host.freshclam_hash = 'a' * 64
        candidate = adapter.Candidate('c' * 32, Path('/candidate/download'))
        with patch.object(adapter, 'owned_container', return_value=None), \
             patch.object(host, 'approved_active', return_value=None), \
             patch.object(adapter, 'file_hash', return_value=('a' * 64, 200)), \
             patch.object(adapter, 'run', side_effect=subprocess.TimeoutExpired('docker', 450)), \
             patch.object(adapter, 'stop_container') as stop:
            with self.assertRaises(UpdateFailure) as raised:
                host.download(candidate)
            self.assertNotIsInstance(raised.exception, DownloadFailure)
            stop.assert_called_once_with(adapter.DOWNLOADER)

    def test_freshclam_signature_errors_are_not_network_fallback(self):
        for status in [7, 8, 2, 9, 14, 19]:
            host = adapter.LinuxHost.__new__(adapter.LinuxHost)
            host.freshclam_hash = 'a' * 64
            with patch.object(adapter, 'owned_container', return_value=None), \
                 patch.object(host, 'approved_active', return_value=None), \
                 patch.object(adapter, 'file_hash', return_value=('a' * 64, 200)), \
                 patch.object(adapter, 'run', return_value=subprocess.CompletedProcess([], status, b'', b'')), \
                 patch.object(adapter, 'stop_container'):
                with self.assertRaises(UpdateFailure) as raised:
                    host.download(adapter.Candidate('c' * 32, Path('/candidate/download')))
                self.assertNotIsInstance(raised.exception, DownloadFailure)

    def test_explicit_network_errors_can_keep_verified_fresh_active(self):
        for status in adapter.DOWNLOAD_FAILURE_CODES:
            host = adapter.LinuxHost.__new__(adapter.LinuxHost)
            host.freshclam_hash = 'a' * 64
            with patch.object(adapter, 'owned_container', return_value=None), \
                 patch.object(host, 'approved_active', return_value=None), \
                 patch.object(adapter, 'file_hash', return_value=('a' * 64, 200)), \
                 patch.object(adapter, 'run', return_value=subprocess.CompletedProcess([], status, b'', b'')), \
                 patch.object(adapter, 'stop_container'):
                with self.assertRaises(DownloadFailure):
                    host.download(adapter.Candidate('c' * 32, Path('/candidate/download')))

    def test_cleanup_preserves_promoted_set_after_failed_activation(self):
        host = adapter.LinuxHost.__new__(adapter.LinuxHost)
        candidate = adapter.Candidate('c' * 32, Path('/work/c/download'), Path('/sets/c'), True)
        with patch.object(adapter, 'owned_container', return_value=None), patch.object(adapter.shutil, 'rmtree') as remove:
            host.cleanup_candidate(candidate)
        remove.assert_called_once_with(Path('/work/c'))

    def test_cleanup_removes_only_unpromoted_candidate(self):
        host = adapter.LinuxHost.__new__(adapter.LinuxHost)
        candidate = adapter.Candidate('c' * 32, Path('/work/c/download'), Path('/sets/c'), False)
        with patch.object(adapter, 'owned_container', return_value=None), patch.object(adapter.shutil, 'rmtree') as remove:
            host.cleanup_candidate(candidate)
        self.assertEqual([call.args[0] for call in remove.call_args_list], [Path('/sets/c'), Path('/work/c')])


class FilesystemTests(unittest.TestCase):
    def test_frozen_database_directory_readable_under_service_umask(self):
        with tempfile.TemporaryDirectory() as root:
            base = Path(root)
            (base / 'sets').mkdir()
            download = base / 'download'
            download.mkdir()
            signed = 1789192800
            for name in ('main', 'daily', 'bytecode'):
                header = f'ClamAV-VDB:date:20:1:1:hash:signature:builder:{signed}'
                (download / (name + '.cvd')).write_bytes(header.encode().ljust(512, b' '))
            host = adapter.LinuxHost.__new__(adapter.LinuxHost)
            candidate = adapter.Candidate('c' * 32, download)
            real_hash = adapter.file_hash
            old_umask = os.umask(0o077)
            try:
                with patch.object(adapter, 'BASE', base), \
                     patch.object(adapter, 'file_hash', side_effect=lambda path, **kw: real_hash(path, owner=os.getuid())), \
                     patch.object(adapter, 'owned_container', return_value=None), \
                     patch.object(adapter, 'stop_container'), \
                     patch.object(adapter, 'docker', return_value=b'Verification OK'), \
                     patch.object(adapter, 'secure_dir', side_effect=lambda path: os.open(path, os.O_RDONLY)), \
                     patch.object(host, 'now', return_value=signed + 60):
                    host.verify_candidate(candidate)
            finally:
                os.umask(old_umask)
            self.assertEqual(candidate.frozen.stat().st_mode & 0o777, 0o755)
            for file in candidate.frozen.iterdir():
                self.assertEqual(file.stat().st_mode & 0o777, 0o444)
                self.assertNotEqual(file.stat().st_ino, (download / file.name).stat().st_ino)

    def test_directory_bound_applies_during_inventory(self):
        with tempfile.TemporaryDirectory() as root:
            for index in range(5):
                (Path(root) / str(index)).touch()
            with self.assertRaises(UpdateFailure):
                adapter.bounded_entries(Path(root), 4)

    def test_file_hash_rejects_links_and_writable_files(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'file'
            path.write_bytes(b'example')
            os.chmod(path, 0o666)
            with self.assertRaises(UpdateFailure):
                adapter.file_hash(path, owner=os.getuid())
            os.chmod(path, 0o600)
            os.link(path, Path(root) / 'second')
            with self.assertRaises(UpdateFailure):
                adapter.file_hash(path, owner=os.getuid())


class CommandBoundTests(unittest.TestCase):
    def test_output_bound_applies_while_command_is_still_running(self):
        with tempfile.TemporaryDirectory() as root:
            pidfile = Path(root) / 'pid'
            script = 'import os,sys,time; open(sys.argv[1],"w").write(str(os.getpid())); os.write(1,b"a"*2097152); time.sleep(60)'
            with self.assertRaises(UpdateFailure):
                adapter.run([sys.executable, '-c', script, str(pidfile)], timeout=5)
            with self.assertRaises(ProcessLookupError):
                os.kill(int(pidfile.read_text()), 0)

    def test_timeout_reaps_command_process(self):
        with tempfile.TemporaryDirectory() as root:
            pidfile = Path(root) / 'pid'
            script = 'import os,sys,time; open(sys.argv[1],"w").write(str(os.getpid())); time.sleep(60)'
            with self.assertRaises(subprocess.TimeoutExpired):
                adapter.run([sys.executable, '-c', script, str(pidfile)], timeout=0.5)
            with self.assertRaises(ProcessLookupError):
                os.kill(int(pidfile.read_text()), 0)


if __name__ == '__main__':
    unittest.main()
