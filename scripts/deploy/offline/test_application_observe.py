"""Resource-policy boundary tests; no VM, process or business access."""
import datetime
import importlib.util
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('application_observe', Path(__file__).with_name('application-observe.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ResourceAdmissionTests(unittest.TestCase):
    def check(self, *, limit=49*1024**3//2, total=24*1024**3+128*1024**2,
              free=1024**3+64*1024**2, starting=True):
        roots = ['/Users/lixiaochen/.lima-tcr24', '/Users/lixiaochen/Library/Caches/lima', '/opt/homebrew/Cellar/lima']
        budget = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'scopeNarrowed': False, 'round30RootsIncluded': True, 'limit': limit,
                  'rows': [{'path': p, 'allocatedBytes': total if i == 0 else 0} for i, p in enumerate(roots)],
                  'totalAllocatedBytes': total}
        def need(ok, code):
            if not ok:
                raise RuntimeError(code)
        view = types.SimpleNamespace(need=need, INPUT=Path('/synthetic'), pinned=lambda *a: budget,
                                     now=lambda: budget['at'])
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(m.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=free)), \
             patch.object(Path, 'read_text', return_value='MemAvailable: 2097152 kB\nMemTotal: 4194304 kB\n'):
            return m.resources(view, types.SimpleNamespace(LOGS=Path(tmp)/'absent'), 'a'*64, starting)

    def test_retained_24_5_budget_accepts_usage_above_previous_24(self):
        self.assertEqual(self.check()['newApplicationReservationBytes'], 64*1024**2)

    def test_build_exception_does_not_become_runtime_limit(self):
        with self.assertRaisesRegex(RuntimeError, 'FRESH_COMPLETE_HOST_BUDGET'):
            self.check(limit=25*1024**3)

    def test_host_and_guest_reserves_are_not_waived(self):
        with self.assertRaisesRegex(RuntimeError, 'APPLICATION_RESOURCE_ADMISSION'):
            self.check(total=49*1024**3//2-64*1024**2+1)
        with self.assertRaisesRegex(RuntimeError, 'APPLICATION_RESOURCE_ADMISSION'):
            self.check(free=1024**3+64*1024**2-1)
        with self.assertRaisesRegex(RuntimeError, 'APPLICATION_RESOURCE_ADMISSION'):
            self.check(free=1024**3-1, starting=False)


if __name__ == '__main__':
    unittest.main()
