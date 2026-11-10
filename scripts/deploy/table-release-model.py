"""Pure bounded transform: update application identity, preserve storage and ingress."""
import copy
import hashlib
import json
import re

SERVICES = {'api', 'web', 'timeline-proxy', 'postgres17', 'redis', 'scanner', 'cpwi', 'cpwi-proxy', 'root-site'}
CHANGED = {'api', 'web', 'timeline-proxy'}
ENV_KEYS = {'sourceCommit': 'EXPECTED_SOURCE_COMMIT', 'sourceTree': 'EXPECTED_SOURCE_TREE',
            'release': 'EXPECTED_RELEASE', 'buildTime': 'EXPECTED_BUILD_TIME'}


def need(value, code):
    if not value:
        raise RuntimeError(code)


def sha(value):
    return hashlib.sha256(value).hexdigest()


def encode(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()


def exact(data, old, new):
    need(data.count(old) == 1, 'EXACT_BINDING_REQUIRED')
    return data.replace(old, new)


def transform(original, plan):
    need(set(original) == {'compose.json', 'service-identities.json', 'clamav-updater.py', 'business-ready.py'}, 'INPUT_SCOPE')
    need(set(plan['baselineHashes']) == set(original), 'BASELINE_SCOPE')
    for name, data in original.items():
        need(sha(data) == plan['baselineHashes'][name], 'BASELINE_CHANGED_' + name)
    identity, images = plan['identity'], plan['images']
    need(set(identity) == set(ENV_KEYS) and re.fullmatch('[a-f0-9]{40}', identity['sourceCommit'])
         and re.fullmatch('[a-f0-9]{40}', identity['sourceTree']), 'CANDIDATE_IDENTITY')
    need(set(images) == {'api', 'web', 'api-ops'} and all(re.fullmatch('sha256:[a-f0-9]{64}', i) for i in images.values()), 'IMAGE_SCOPE')
    cfg = json.loads(original['compose.json'])
    before = copy.deepcopy(cfg)
    state = json.loads(original['service-identities.json'])
    need(set(cfg['services']) == SERVICES == set(state['services']), 'SERVICE_SCOPE')
    need(state['composeSHA256'] == sha(original['compose.json']), 'RECOVERY_BASELINE')
    for name in CHANGED:
        service = cfg['services'][name]
        need(service['image'] == state['services'][name]['image'] and not service.get('ports')
             and not service.get('depends_on'), 'SERVICE_BASELINE')
        if name != 'timeline-proxy':
            service['image'] = images[name]
        service.setdefault('environment', {}).update({ENV_KEYS[k]: v for k, v in identity.items()})
    need(cfg['services']['api']['environment'].get('Y9000P_PRIVATE_DOMAIN_ENABLED') == '1'
         and cfg['services']['timeline-proxy']['environment'].get('Y9000P_PRIVATE_DOMAIN_ENABLED') == '1', 'PRIVATE_PAIR_REQUIRED')
    for name in SERVICES - CHANGED:
        need(cfg['services'][name] == before['services'][name], 'UNRELATED_SERVICE_CHANGED')
    need({k: v for k, v in cfg.items() if k != 'services'} == {k: v for k, v in before.items() if k != 'services'}, 'GLOBAL_CHANGED')
    compose = encode(cfg)
    updater = exact(original['clamav-updater.py'], ("CFG_SHA = '" + sha(original['compose.json']) + "'").encode(), ("CFG_SHA = '" + sha(compose) + "'").encode())
    updater = exact(updater, ("API = '" + before['services']['api']['image'] + "'").encode(), ("API = '" + images['api'] + "'").encode())
    compile(updater, '<updated-scanner-identity>', 'exec')
    return {'compose.json': compose, 'clamav-updater.py': updater}


def identities(original, compose, new_ids):
    need(set(new_ids) == CHANGED and all(re.fullmatch('[a-f0-9]{64}', v) for v in new_ids.values()), 'CONTAINER_ID_SCOPE')
    state = json.loads(original)
    cfg = json.loads(compose)
    for name, cid in new_ids.items():
        state['services'][name].update(id=cid, image=cfg['services'][name]['image'])
    state['composeSHA256'] = sha(compose)
    return encode(state)
