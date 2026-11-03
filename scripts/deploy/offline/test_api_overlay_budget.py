"""Exercise the retained budget protocol with an explicitly extended scope."""
import importlib.util
import io
import json
from pathlib import Path
import types
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('api_overlay', Path(__file__).with_name('api_overlay.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class BudgetScopeTests(unittest.TestCase):
    def check(self, count, *, current=False, observed=None, policy_roots=None):
        roots = [m.HOST_PREPARATION, *('/synthetic/'+str(i) for i in range(count-1))]
        pins = {'budgetRootPaths': roots}
        if current:
            pins['hostBudgetPolicy'] = {'expectedRootPaths': roots if policy_roots is None else policy_roots}
        budget = {'rows': [{'path': p} for p in (roots if observed is None else observed)]}
        observe = Mock(return_value={'validated': True})
        m.ctx.clear()
        m.ctx.update(args=types.SimpleNamespace(budget_channel_stdio=True, event='scope-fixture'),
                     m=types.SimpleNamespace(), base=types.SimpleNamespace(), pins=pins,
                     observe=types.SimpleNamespace(resources=observe))
        reply = json.dumps({'requestId': 'scope-fixture:prepare', 'phase': 'prepare',
                            'protocol': 'A09_BUDGET_STDIO_V1', 'status': 'BUDGET_READY',
                            'sha256': 'a'*64}).encode()+b'\n'
        poller = Mock(); poller.poll.return_value = [(0, 1)]
        with patch.object(m, 'stat_owner', return_value=('1', m.UID, 'S')), \
             patch.object(m.select, 'poll', return_value=poller), \
             patch.object(m.os, 'read', return_value=reply), \
             patch.object(m, 'pinned', return_value=budget), \
             patch.object(m.sys, 'stdout', io.StringIO()):
            result = m.resources(True, 'prepare')
        self.assertEqual(observe.call_count, 2)
        self.assertEqual(result['budgetSha256'], 'a'*64)
        return roots

    def test_legacy_scope_remains_exact(self):
        roots = self.check(376)
        self.check(376, observed=list(reversed(roots)))
        for count in (375, 377, 378):
            with self.subTest(count=count), self.assertRaisesRegex(m.Rejected, 'COMPLETE_NEW_BUDGET_ROOTS'):
                self.check(count)

    def test_current_extended_scope_reaches_original_resource_checks(self):
        self.check(378, current=True)
        self.check(4096, current=True)

    def test_scope_omission_duplicate_reorder_and_policy_mismatch_rejected(self):
        roots = self.check(378, current=True)
        for observed in (roots[:-1], roots+[roots[-1]], list(reversed(roots))):
            with self.subTest(observed=len(observed)), self.assertRaisesRegex(m.Rejected, 'COMPLETE_NEW_BUDGET_ROOTS'):
                self.check(378, current=True, observed=observed)
        with self.assertRaisesRegex(m.Rejected, 'COMPLETE_NEW_BUDGET_ROOTS'):
            self.check(378, current=True, policy_roots=roots[:-1])
        for count in (375, 4097):
            with self.subTest(count=count), self.assertRaisesRegex(m.Rejected, 'COMPLETE_NEW_BUDGET_ROOTS'):
                self.check(count, current=True)


if __name__ == '__main__':
    unittest.main()
