"""Resource-policy boundary tests; no VM, process or business access."""
import copy
import datetime
from contextlib import nullcontext
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
              free=1024**3+64*1024**2, starting=True, approved_limit=49*1024**3//2,
              clock_ages=None, host_policy=None, budget_updates=None):
        roots = ['/Users/lixiaochen/.lima-tcr24', '/Users/lixiaochen/Library/Caches/lima', '/opt/homebrew/Cellar/lima']
        budget = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'scopeNarrowed': False, 'round30RootsIncluded': True, 'limit': limit,
                  'rows': [{'path': p, 'allocatedBytes': total if i == 0 else 0} for i, p in enumerate(roots)],
                  'totalAllocatedBytes': total}
        if budget_updates is not None:
            budget.update(copy.deepcopy(budget_updates))
        def need(ok, code):
            if not ok:
                raise RuntimeError(code)
        view = types.SimpleNamespace(need=need, INPUT=Path('/synthetic'), pinned=lambda *a: budget,
                                     now=lambda: budget['at'])
        clock_patch = nullcontext()
        if clock_ages is not None:
            sample_time = datetime.datetime.fromisoformat(budget['at'])
            times = iter(sample_time + datetime.timedelta(seconds=age) for age in clock_ages)

            class Clock(datetime.datetime):
                @classmethod
                def now(cls, timezone=None):
                    return next(times)

            clock_patch = patch.object(m.datetime, 'datetime', Clock)
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(m.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=free)), \
             patch.object(Path, 'read_text', return_value='MemAvailable: 2097152 kB\nMemTotal: 4194304 kB\n'), \
             clock_patch:
            return m.resources(view, types.SimpleNamespace(LOGS=Path(tmp)/'absent'), 'a'*64, starting,
                               approved_limit=approved_limit, host_policy=host_policy)

    def test_retained_24_5_budget_accepts_usage_above_previous_24(self):
        self.assertEqual(self.check()['newApplicationReservationBytes'], 64*1024**2)

    def test_build_exception_does_not_become_runtime_limit(self):
        with self.assertRaisesRegex(RuntimeError, 'FRESH_COMPLETE_HOST_BUDGET'):
            self.check(limit=25*1024**3)

    def test_explicit_owner_25_limit_accepts_new_usage_and_keeps_reserves(self):
        cap=25*1024**3
        result=self.check(limit=cap,approved_limit=cap,total=cap-64*1024**2)
        self.assertEqual(result['hostLimitBytes'],cap)
        self.assertEqual(result['hostReservedBytes'],64*1024**2)
        for starting in (True,False):
            with self.subTest(starting=starting),self.assertRaisesRegex(RuntimeError,'APPLICATION_RESOURCE_ADMISSION'):
                self.check(limit=cap,approved_limit=cap,total=cap-64*1024**2+1,starting=starting)
        with self.assertRaisesRegex(RuntimeError,'APPLICATION_RESOURCE_ADMISSION'):
            self.check(limit=cap,approved_limit=cap,free=1024**3+64*1024**2-1)

    def test_policy_cannot_change_explicit_allowance(self):
        with self.assertRaisesRegex(RuntimeError,'FRESH_COMPLETE_HOST_BUDGET'):
            self.check(limit=49*1024**3//2,approved_limit=25*1024**3)
        for value in (True,25.0*1024**3,26*1024**3):
            with self.subTest(value=value),self.assertRaisesRegex(RuntimeError,'APPROVED_HOST_LIMIT'):
                self.check(approved_limit=value)

    def test_explicit_25_quarter_host_allowance_retains_runtime_floors(self):
        self.check_explicit_allowance_floors(101 * 1024**3 // 4)

    def test_explicit_25_half_host_allowance_retains_runtime_floors(self):
        self.check_explicit_allowance_floors(51 * 1024**3 // 2)
        with self.assertRaisesRegex(RuntimeError, 'FRESH_COMPLETE_HOST_BUDGET'):
            self.check(limit=51 * 1024**3 // 2, approved_limit=101 * 1024**3 // 4)

    def check_explicit_allowance_floors(self, cap):
        result = self.check(limit=cap, approved_limit=cap, total=cap-64*1024**2)
        self.assertEqual(result['hostLimitBytes'], cap)
        self.assertEqual(result['hostReservedBytes'], 64*1024**2)
        self.assertEqual(result['newApplicationReservationBytes'], 64*1024**2)
        for old_cap in (49*1024**3//2, 25*1024**3):
            with self.assertRaisesRegex(RuntimeError, 'FRESH_COMPLETE_HOST_BUDGET'):
                self.check(limit=cap, approved_limit=old_cap)
        for invalid in (cap+1, float(cap)):
            with self.assertRaisesRegex(RuntimeError, 'APPROVED_HOST_LIMIT'):
                self.check(limit=cap, approved_limit=invalid)
        with self.assertRaisesRegex(RuntimeError, 'APPLICATION_RESOURCE_ADMISSION'):
            self.check(limit=cap, approved_limit=cap, total=cap-64*1024**2+1)
        with self.assertRaisesRegex(RuntimeError, 'APPLICATION_RESOURCE_ADMISSION'):
            self.check(limit=cap, approved_limit=cap, free=1024**3+64*1024**2-1)

    def test_host_and_guest_reserves_are_not_waived(self):
        with self.assertRaisesRegex(RuntimeError, 'APPLICATION_RESOURCE_ADMISSION'):
            self.check(total=49*1024**3//2-64*1024**2+1)
        with self.assertRaisesRegex(RuntimeError, 'APPLICATION_RESOURCE_ADMISSION'):
            self.check(free=1024**3+64*1024**2-1)
        with self.assertRaisesRegex(RuntimeError, 'APPLICATION_RESOURCE_ADMISSION'):
            self.check(free=1024**3-1, starting=False)

    def test_small_clock_offset_waits_then_requires_nonfuture_budget(self):
        with patch.object(m.time, 'sleep') as sleep:
            result = self.check(clock_ages=[-0.103, 0.001])
        sleep.assert_called_once_with(0.103)
        self.assertEqual(result['clockWaitSeconds'], 0.103)
        self.assertEqual(result['budgetAgeSeconds'], 0.001)

    def test_clock_wait_keeps_future_stale_and_capacity_rejections(self):
        for ages in ([-0.1, -0.001], [-0.1, 120.001], [-1.001], [120.001]):
            with self.subTest(ages=ages), patch.object(m.time, 'sleep') as sleep:
                with self.assertRaisesRegex(RuntimeError, 'FRESH_COMPLETE_HOST_BUDGET'):
                    self.check(clock_ages=ages)
                self.assertEqual(sleep.call_count, 1 if len(ages) == 2 else 0)
        with patch.object(m.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'APPLICATION_RESOURCE_ADMISSION'):
                self.check(clock_ages=[-0.1, 0.001], free=1024**3-1)


    def current_capacity_fixture(self):
        cap = 40 * 1024**3
        reserve = 10 * 1024**3
        window = 64 * 1024**2
        roots = ['/Users/lixiaochen/.lima-tcr24', '/Users/lixiaochen/Library/Caches/lima',
                 '/opt/homebrew/Cellar/lima']
        policy = {'limit': cap, 'authorizedLimits': [cap], 'capacityReaderSha256': 'b' * 64,
                  'expectedRootPaths': roots, 'physicalReserveBytes': reserve,
                  'physicalWritePaths': roots[:2],
                  'reader': {'dependencies': [{'name': 'delivery_host.py', 'sha256': 'b' * 64}]}}
        receipt = {'authorizedLimits': [cap], 'readerSha256': 'b' * 64,
                   'physicalCapacity': {'reserveBytes': reserve, 'additionalBytes': window,
                                        'filesystems': [{'device': 1, 'paths': roots[:2],
                                                         'availableBytes': reserve + window,
                                                         'additionalBytes': window,
                                                         'afterAdditionalBytes': reserve}]}}
        return policy, receipt

    def check_current(self, policy, receipt, **kwargs):
        values = {'limit': policy['limit'], 'approved_limit': policy['limit'],
                  'total': policy['limit'] - 128 * 1024**2,
                  'host_policy': policy, 'budget_updates': receipt}
        values.update(kwargs)
        return self.check(**values)

    def test_current_40_receipt_keeps_both_reserves_and_phase_window(self):
        policy, receipt = self.current_capacity_fixture()
        result = self.check_current(policy, receipt)
        self.assertEqual(result['hostLimitBytes'], 40 * 1024**3)
        self.assertEqual(result['hostReservedBytes'], 64 * 1024**2)
        self.assertEqual(result['newApplicationReservationBytes'], 64 * 1024**2)
        self.assertEqual(result['guestAvailableBytes'], 1024**3 + 64 * 1024**2)
        with self.assertRaisesRegex(RuntimeError, 'HOST_PHASE_CAPACITY'):
            self.check_current(policy, receipt, total=policy['limit'] - 128 * 1024**2 + 1)
        self.check_current(policy, receipt, starting=False, total=policy['limit'] - 64 * 1024**2)

    def test_current_limit_requires_explicit_policy_and_matching_reader(self):
        policy, receipt = self.current_capacity_fixture()
        with self.assertRaisesRegex(RuntimeError, 'APPROVED_HOST_LIMIT'):
            self.check_current(policy, receipt, host_policy=None)
        for limit in (policy['limit'] + 1, True, float(policy['limit'])):
            with self.subTest(limit=limit), self.assertRaisesRegex(RuntimeError, 'APPROVED_HOST_LIMIT'):
                self.check_current(policy, receipt, approved_limit=limit)
        for field, value in [('readerSha256', 'c' * 64), ('authorizedLimits', [policy['limit'] + 1])]:
            changed = copy.deepcopy(receipt)
            changed[field] = value
            with self.subTest(field=field), self.assertRaisesRegex(RuntimeError, 'HOST_PHYSICAL_CAPACITY_PROOF'):
                self.check_current(policy, changed)
        changed_policy = {**policy, 'capacityReaderSha256': 'c' * 64}
        with self.assertRaisesRegex(RuntimeError, 'HOST_PHYSICAL_CAPACITY_PROOF'):
            self.check_current(changed_policy, receipt)

    def test_current_physical_receipt_fields_are_required(self):
        policy, receipt = self.current_capacity_fixture()
        for field in ('readerSha256', 'authorizedLimits', 'physicalCapacity'):
            changed = copy.deepcopy(receipt)
            changed.pop(field)
            with self.subTest(field=field), self.assertRaisesRegex(RuntimeError, 'HOST_PHYSICAL_CAPACITY_PROOF'):
                self.check_current(policy, changed)
        for field in ('reserveBytes', 'additionalBytes', 'filesystems'):
            changed = copy.deepcopy(receipt)
            changed['physicalCapacity'].pop(field)
            with self.subTest(field=field), self.assertRaisesRegex(RuntimeError, 'HOST_PHYSICAL_CAPACITY_PROOF'):
                self.check_current(policy, changed)

    def test_current_physical_window_and_volume_readback_cannot_be_understated(self):
        policy, receipt = self.current_capacity_fixture()
        variants = []
        short_window = copy.deepcopy(receipt)
        short_window['physicalCapacity']['additionalBytes'] -= 1
        variants.append(short_window)
        tampered = copy.deepcopy(receipt)
        tampered['physicalCapacity']['filesystems'][0]['afterAdditionalBytes'] += 1
        variants.append(tampered)
        low_space = copy.deepcopy(receipt)
        low_space['physicalCapacity']['filesystems'][0]['availableBytes'] -= 1
        low_space['physicalCapacity']['filesystems'][0]['afterAdditionalBytes'] -= 1
        variants.append(low_space)
        missing_path = copy.deepcopy(receipt)
        missing_path['physicalCapacity']['filesystems'][0]['paths'].pop()
        variants.append(missing_path)
        for index, changed in enumerate(variants):
            with self.subTest(index=index), self.assertRaisesRegex(RuntimeError, 'HOST_PHYSICAL_CAPACITY_PROOF'):
                self.check_current(policy, changed)
        lower_floor = copy.deepcopy(receipt)
        lower_floor['physicalCapacity']['reserveBytes'] = 1024**3
        with self.assertRaisesRegex(RuntimeError, 'HOST_PHYSICAL_CAPACITY_PROOF'):
            self.check_current({**policy, 'physicalReserveBytes': 1024**3}, lower_floor)

    def test_current_receipt_retains_full_scope_freshness_and_guest_floor(self):
        policy, receipt = self.current_capacity_fixture()
        with self.assertRaisesRegex(RuntimeError, 'HOST_PHYSICAL_CAPACITY_PROOF'):
            self.check_current({**policy, 'expectedRootPaths': policy['expectedRootPaths'][:-1]}, receipt)
        with self.assertRaisesRegex(RuntimeError, 'FRESH_COMPLETE_HOST_BUDGET'):
            self.check_current(policy, {**receipt, 'scopeNarrowed': True})
        with self.assertRaisesRegex(RuntimeError, 'FRESH_COMPLETE_HOST_BUDGET'):
            self.check_current(policy, receipt, clock_ages=[120.001])
        for starting, free in [(True, 1024**3 + 64 * 1024**2 - 1), (False, 1024**3 - 1)]:
            with self.subTest(starting=starting), self.assertRaisesRegex(RuntimeError, 'APPLICATION_RESOURCE_ADMISSION'):
                self.check_current(policy, receipt, starting=starting, free=free)


if __name__ == '__main__':
    unittest.main()
