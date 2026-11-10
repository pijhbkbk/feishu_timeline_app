import importlib.util
import json
from pathlib import Path
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('table_release_host', Path(__file__).resolve().parents[1] / 'table-release-host.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class FailureBarrierTests(unittest.TestCase):
    def setUp(self):
        host.SWITCHED = True
        host.COMMITTED = False
        host.PAUSED = False
        host.NEW_IDS = {'api': 'a' * 64, 'web': 'b' * 64}

    def test_failure_after_guard_release_restores_barrier_before_stopping(self):
        events = []
        running = set(host.NEW_IDS.values())

        def run(args, **kwargs):
            events.append(tuple(args))
            if args[:2] == ['docker', 'stop']: running.remove(args[-1])
            return types.SimpleNamespace(stdout=b'inactive\n', returncode=0)

        with patch.object(Path, 'exists', return_value=False), \
             patch.object(host, 'save', side_effect=lambda *a: events.append(('guard-created',))), \
             patch.object(host, 'read', return_value=json.dumps({'source': str(host.OUT)}).encode()), \
             patch.object(host, 'run', side_effect=run), \
             patch.object(host, 'inspect', side_effect=lambda cid: {'State': {'Running': cid in running}}):
            host.retain_failure_barrier()
        self.assertEqual(events[0], ('guard-created',))
        self.assertEqual(events[1], ('systemctl', 'stop', host.TIMER))
        self.assertEqual(events[2], ('systemctl', 'is-active', host.TIMER))
        self.assertFalse(running)
        self.assertTrue(host.PAUSED)

    def test_foreign_guard_is_not_overwritten_or_used_to_stop_services(self):
        with patch.object(Path, 'exists', return_value=True), \
             patch.object(host, 'read', return_value=b'{"source":"different-operation"}'), \
             patch.object(host, 'save') as save, patch.object(host, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'FAILURE_GUARD_OWNERSHIP'):
                host.retain_failure_barrier()
            save.assert_not_called()
            run.assert_not_called()

    def test_timer_failure_keeps_barrier_and_does_not_stop_candidate(self):
        events = []
        with patch.object(Path, 'exists', return_value=False), \
             patch.object(host, 'save', side_effect=lambda *a: events.append('guard')), \
             patch.object(host, 'read', return_value=json.dumps({'source': str(host.OUT)}).encode()), \
             patch.object(host, 'run', side_effect=RuntimeError('TIMER_STOP_FAILED')), \
             patch.object(host, 'inspect') as inspect:
            with self.assertRaisesRegex(RuntimeError, 'TIMER_STOP_FAILED'):
                host.retain_failure_barrier()
            self.assertEqual(events, ['guard'])
            inspect.assert_not_called()

    def test_committed_or_preflight_failure_does_not_stop_running_application(self):
        for switched, committed in [(False, False), (True, True)]:
            host.SWITCHED, host.COMMITTED = switched, committed
            with patch.object(host, 'run') as run, patch.object(host, 'save') as save:
                host.retain_failure_barrier()
                run.assert_not_called()
                save.assert_not_called()


class SourceFilenameTests(unittest.TestCase):
    def test_preserves_exact_basename(self):
        for name in ['Synthetic Source.xlsx', '合成原件.xlsx', 'source.xlsx']:
            self.assertEqual(host.source_filename(name), name)

    def test_rejects_paths_controls_and_wrong_type_before_copy(self):
        for name in [None, [], '../source.xlsx', '/tmp/source.xlsx', 'a\\source.xlsx', 'a\n.xlsx', 'a\x7f.xlsx', 'source.json', '.xlsx', 'x' * 241 + '.xlsx', '合' * 80 + '.xlsx']:
            with self.assertRaisesRegex(RuntimeError, 'SOURCE_FILENAME'):
                host.source_filename(name)


if __name__ == '__main__':
    unittest.main()
