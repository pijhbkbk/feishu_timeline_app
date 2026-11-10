import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('activation_resume', ROOT / 'table-release-resume-activation.py')
resume = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resume)
host_spec = importlib.util.spec_from_file_location('activation_host', ROOT / 'table-release-host.py')
host = importlib.util.module_from_spec(host_spec)
host_spec.loader.exec_module(host)


class ResumeBoundaryTests(unittest.TestCase):
    def test_only_this_uncommitted_attempt_can_persist_failure(self):
        for owned, committed, expected in [(False, False, False), (False, True, False), (True, True, False), (True, False, True)]:
            save = Mock()
            h = {'RESUME_STARTED_HERE': owned, 'COMMITTED': committed, 'OUT': Path('/unused'), 'save': save}
            resume.save_owned_failure(h, {'status': 'failed'})
            self.assertEqual(save.called, expected)

    def test_success_notification_loss_does_not_raise_activation_failure(self):
        with patch('builtins.print', side_effect=BrokenPipeError):
            resume.emit_success({'status': 'PRODUCTION_DEPLOYED_GUI_PENDING'})

    def test_verified_bytes_reject_changed_digest_or_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / 'fixed.py'
            p.write_bytes(b'fixed input'); p.chmod(0o600)
            digest = hashlib.sha256(p.read_bytes()).hexdigest()
            self.assertEqual(resume.verified_bytes(p, digest, os.getuid(), 100), b'fixed input')
            with self.assertRaisesRegex(RuntimeError, 'PINNED_FILE_CHANGED'):
                resume.verified_bytes(p, '0' * 64, os.getuid(), 100)
            link = Path(directory) / 'link.py'; link.symlink_to(p)
            with self.assertRaises(OSError): resume.verified_bytes(link, digest, os.getuid(), 100)

    def test_failed_prerequisites_never_reach_application_activation(self):
        for scenario, code in [('marker', 'RESUME_ALREADY_ATTEMPTED'), ('phase', 'RESUME_FAILURE_SCOPE'),
                               ('guard', 'RESUME_GUARD'), ('timer', 'RESUME_TIMER_ACTIVE')]:
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as directory:
                root = Path(directory).resolve(); runtime = root / 'runtime-recovery'
                out = root / 'table-first-release-20261110-r03'
                runtime.mkdir(); out.mkdir()
                if scenario == 'marker': (out / 'activation-resume-started.json').write_text('{}')
                failure = {'phase': 'REHEARSAL' if scenario == 'phase' else 'ACTIVATE_APPLICATIONS',
                           'status': 'FAILED_REVIEW_REQUIRED', 'errorCode': 'COMMAND_FAILED_docker_84ed86a7d83e',
                           'recoveryGuardRetained': True, 'timerPaused': True}
                def read(p):
                    return json.dumps(failure if p.name == 'failure.json' else
                                      {'source': 'foreign-attempt' if scenario == 'guard' else str(out)}).encode()
                h = {'ROOT': root, 'RUNTIME': runtime, 'OUT': out, 'GUARD': runtime / 'RECOVERY_BLOCKED.json',
                     'TIMER': 'synthetic.timer', 'read': read, 'run': Mock(return_value=types.SimpleNamespace(stdout=b'active\n')),
                     'activate_applications': Mock()}
                original_stat = Path.stat
                def metadata(p, *args, **kwargs):
                    value = original_stat(p, *args, **kwargs)
                    return types.SimpleNamespace(st_uid=0, st_mode=value.st_mode) if p in [root, runtime, out] else value
                with patch.object(Path, 'stat', metadata), patch.object(resume, 'verified_bytes', return_value=b'{"plan":{}}'):
                    with self.assertRaisesRegex(RuntimeError, code): resume.resume(h, 'a' * 64, 'b' * 64)
                h['activate_applications'].assert_not_called()

    def test_compose_config_failure_precedes_any_old_container_removal(self):
        events = []
        def run(args, **kwargs):
            events.append(args)
            raise RuntimeError('COMPOSE_CONFIG_FAILED')
        with patch.object(Path, 'exists', return_value=True), patch.object(host, 'read', return_value=b'fixed'), \
             patch.object(host, 'run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'COMPOSE_CONFIG_FAILED'):
                host.activate_applications({'compose.json': b'fixed'})
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0][0], '/usr/libexec/docker/cli-plugins/docker-compose')
        self.assertEqual(events[0][-2:], ['config', '--quiet'])


if __name__ == '__main__':
    unittest.main()
