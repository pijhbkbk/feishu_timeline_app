import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('table_release_model', ROOT / 'table-release-model.py')
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)


class ReleaseModelTests(unittest.TestCase):
    def setUp(self):
        old_image = 'sha256:' + 'a' * 64
        self.cfg = {'services': {n: {'image': old_image, 'read_only': True,
                    'volumes': [{'source': '/fixed/' + n, 'target': '/data'}],
                    'networks': ['private']} for n in model.SERVICES}, 'networks': {'private': {'internal': True}}}
        for n in ['api', 'timeline-proxy']:
            self.cfg['services'][n]['environment'] = {'Y9000P_PRIVATE_DOMAIN_ENABLED': '1'}
        self.cfg['services']['timeline-proxy']['ports'] = copy.deepcopy(model.PROXY_PORTS)
        cfg = model.encode(self.cfg)
        state = {'composeSHA256': model.sha(cfg), 'services': {n: {'id': '1' * 64, 'image': old_image, 'networks': ['private']} for n in model.SERVICES}}
        self.original = {'compose.json': cfg, 'service-identities.json': model.encode(state),
                         'business-ready.py': b'# readiness unchanged\n',
                         'clamav-updater.py': ("CFG_SHA = '" + model.sha(cfg) + "'\nAPI = '" + old_image + "'\n").encode()}
        self.plan = {'baselineHashes': {n: model.sha(b) for n, b in self.original.items()},
                     'identity': {'sourceCommit': 'c' * 40, 'sourceTree': 'd' * 40, 'release': 'synthetic-release', 'buildTime': '2026-11-10T00:00:00Z'},
                     'images': {'api': 'sha256:' + 'b' * 64, 'web': 'sha256:' + 'c' * 64, 'api-ops': 'sha256:' + 'd' * 64}}

    def test_only_application_images_and_identity_change(self):
        result = model.transform(self.original, self.plan)
        updated = json.loads(result['compose.json'])
        for n in model.SERVICES - model.CHANGED:
            self.assertEqual(updated['services'][n], self.cfg['services'][n])
        self.assertEqual(updated['networks'], self.cfg['networks'])
        self.assertEqual(updated['services']['timeline-proxy']['image'], self.cfg['services']['timeline-proxy']['image'])
        for n in model.CHANGED:
            old, new = self.cfg['services'][n], updated['services'][n]
            self.assertEqual({k: v for k, v in old.items() if k not in ['image', 'environment']},
                             {k: v for k, v in new.items() if k not in ['image', 'environment']})
        self.assertIn(model.sha(result['compose.json']).encode(), result['clamav-updater.py'])
        self.assertIn(self.plan['images']['api'].encode(), result['clamav-updater.py'])

    def test_any_changed_baseline_is_rejected(self):
        for name in self.original:
            changed = dict(self.original)
            changed[name] += b' '
            with self.subTest(name=name), self.assertRaises(RuntimeError):
                model.transform(changed, self.plan)

    def test_only_exact_existing_proxy_loopback_mapping_is_accepted(self):
        for ports in [None, [], ['18443:8443'],
                      [{**model.PROXY_PORTS[0], 'host_ip': '0.0.0.0'}],
                      [{**model.PROXY_PORTS[0], 'published': '18444'}],
                      [{**model.PROXY_PORTS[0], 'target': 3001}], model.PROXY_PORTS * 2]:
            cfg = copy.deepcopy(self.cfg)
            cfg['services']['timeline-proxy']['ports'] = ports
            original = dict(self.original, **{'compose.json': model.encode(cfg)})
            state = json.loads(original['service-identities.json'])
            state['composeSHA256'] = model.sha(original['compose.json'])
            original['service-identities.json'] = model.encode(state)
            plan = dict(self.plan, baselineHashes={n: model.sha(b) for n, b in original.items()})
            with self.subTest(ports=ports), self.assertRaisesRegex(RuntimeError, 'SERVICE_PORT_BASELINE'):
                model.transform(original, plan)

    def test_scope_and_private_pair_fail_closed(self):
        for mutation in ['ports', 'flag', 'extra_service', 'recovery_digest']:
            original = dict(self.original)
            cfg = copy.deepcopy(self.cfg)
            if mutation == 'ports': cfg['services']['api']['ports'] = ['3001:3001']
            if mutation == 'flag': cfg['services']['api']['environment']['Y9000P_PRIVATE_DOMAIN_ENABLED'] = '0'
            if mutation == 'extra_service': cfg['services']['new'] = {}
            original['compose.json'] = model.encode(cfg)
            state = json.loads(original['service-identities.json'])
            state['composeSHA256'] = '0' * 64 if mutation == 'recovery_digest' else model.sha(original['compose.json'])
            original['service-identities.json'] = model.encode(state)
            plan = dict(self.plan, baselineHashes={n: model.sha(b) for n, b in original.items()})
            with self.subTest(mutation=mutation), self.assertRaises(RuntimeError):
                model.transform(original, plan)

    def test_updater_must_have_exact_single_binding(self):
        for update in [b'', b"API = 'other'\n", self.original['clamav-updater.py'] * 2]:
            original = dict(self.original, **{'clamav-updater.py': update})
            plan = dict(self.plan, baselineHashes={n: model.sha(b) for n, b in original.items()})
            with self.assertRaises(RuntimeError): model.transform(original, plan)

    def test_recovery_ids_only_change_for_three_apps(self):
        candidate = model.transform(self.original, self.plan)
        new_ids = {n: str(i + 2) * 64 for i, n in enumerate(sorted(model.CHANGED))}
        state = json.loads(model.identities(self.original['service-identities.json'], candidate['compose.json'], new_ids))
        before = json.loads(self.original['service-identities.json'])
        for n in model.SERVICES - model.CHANGED: self.assertEqual(state['services'][n], before['services'][n])
        self.assertEqual(state['composeSHA256'], model.sha(candidate['compose.json']))
        with self.assertRaises(RuntimeError): model.identities(self.original['service-identities.json'], candidate['compose.json'], {**new_ids, 'postgres17': 'f' * 64})


if __name__ == '__main__':
    unittest.main()
