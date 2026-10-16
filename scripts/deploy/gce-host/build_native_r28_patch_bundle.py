"""Build reviewable fixed-host scripts from the finalized operations checkout.

This local generator executes no SSH, Docker, cloud or deployment commands.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
import subprocess
import sys
from native_release_target_r28_patch import TARGET

HERE = Path(__file__).resolve().parent
EXPECTED = {'native_candidate_check.py': '3d28bdf044c3326f0ccead5f8433e2d068ccd7cb8b63ae24a7682c54f86dd944', 'native_release_target_owner_20260918.py': '132b63772ceaff26fa2fa20bce603e8f39ecbdb9577dafbad1c8b15c6be3918a', 'native_release_target_20260918.py': '9c1e432ba68333d7e05ab4a671e981c52826e9a5851452490f73f495f9cb4356', 'native_release.py': '8e00fac181d406df59ec01f37eac479b594a70e7e277635ecb7ac8c7428f6eb6', 'native_release_target.py': '206eb354ef49598ab46d387573b562decccda8553f21713f1dec22c2fd3f71f0', 'native_release_backup.py': 'e1c7b96aaf7318080223280bdbfc97c1601a2b8036f9a4ccbcc2f3b400548c6e', 'native_runtime_app.py': 'c66d63475a498307392b1941df18f592f7ac824714ccc30c3fc4644039239776', 'native_backup_controller.py': '5bfda36db359474f5ef218ab3d2b103fbd2acefea49757fcac25494ce3a3874d', 'native_cutover.py': 'fa989ea6beec8e85db104dfc5efe3a4998c5e9422206c73288e4cabf96367501', 'native_database_scope.py': 'e44fad1b0554569e215d7e3ea3bf3d1ab2c11a35c62a14949c7d05900cc76dcc', 'native_migration_probe.py': '375ce24629be5f40cfe106ebea736a3c69d8f4b23ea3f77b141f9b90cc351dab', 'native_runtime_network.py': '1777805fe945e862fb72946598766b6961b07cc22e6e8f98acfa9db0cd0de246', 'native_runtime_redis.py': 'e21b6e15c3a50c345f60f8c31f65c7bbfe245a77ffacf2403568bffd54a8cbbc', 'native_release_target_r28.py': 'f82f0e3102abecaff590d3b911b09d3ee3eb17c4f5a7e48e853a27c86dc2b67a', 'native_r28_preservation.py': '75d6b2eab10fda9d2055e381a3f6608adc1a13cdd1265ed18b2952e4d0ee9740', 'native_r28_schema.py': 'a137832c2fe72b657be1169e2b580e741750c94da7a8185fcbf4f549ea9f240f', 'native_release_r28.py': '7f1d9f8d682f25715df6642c11c3f3ec0fdcee4c72603e7bb01ee4fb8376761a'}
EXPECTED_UNITS = {
    'timeline-native-api.service': 'a5600c9b4f98c4a8852cb3e79ab395033fc685bd235e87277689f4da364412d1',
    'timeline-native-release.service': '78c12a115c07fa06dc3b2ecfbe3bdccaa7e2f4dfa71031b223426934eac768aa',
    'timeline-native-release-check.service': 'b6a95ff98b6f269549044a702cffccf3d1835a81b432e2dc561aca05e2174c43',
    'timeline-native-release-rollback.service': '47f0dd19deadaeccaf3e0c5ad81eaefe178a5972560650f05ec102f3f222ff7b',
}
# Existing helpers and units are verified, never rewritten. The single live
# controller switch comes last, after its separately named target is durable.
NAMES = ('native_release_target_r28_patch.py', 'native_release_r28_patch.py', 'native_release_backup.py', 'native_runtime_app.py', 'native_cutover.py', 'native_release.py')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def render(template, replacements, root=True):
    source = (HERE / 'release-tools' / template).read_text()
    for name, value in replacements.items():
        marker = name + ' = None'
        if source.count(marker) != 1:
            raise RuntimeError('Unambiguous template assignment required')
        source = source.replace(marker, name + ' = ' + repr(value))
    compile(source, template, 'exec')
    return "set -eu\n" + ("sudo -n " if root else "") + "/usr/bin/python3 -I - <<'FIXED_REVIEWED_SCRIPT'\n" + source + "\nFIXED_REVIEWED_SCRIPT\n"


def build(output, operations_commit):
    if TARGET['base'] != '29ed14c81e297c56699ba571cfc6946a00ccb942' or TARGET['commit'] == TARGET['base']:
        raise RuntimeError('Program-only patch baseline is not fixed')
    registry = 'us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/'
    for component in ('api', 'web'):
        if not re.fullmatch(re.escape(registry + component + '@sha256:') + r'[a-f0-9]{64}', TARGET['images'][component]):
            raise RuntimeError('Final immutable image pair is required before generating installation scripts')
    repository = HERE.parents[2]
    def git(*args):
        return subprocess.check_output(['git', '-C', str(repository), '-c', 'core.hooksPath=/dev/null', *args]).decode().strip()
    if git('rev-parse', 'HEAD') != operations_commit or git('status', '--porcelain'):
        raise RuntimeError('Generate only from the exact clean committed operations source')
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    payload = {name: {'sha256': sha((HERE / name).read_bytes()), 'text': (HERE / name).read_text()} for name in NAMES}
    # These fixed digests came from the 2026-09-28 actual production readback. Refuse an
    # accidentally edited dependency even though only the declared R28 files are transferred.
    for name, expected in {**EXPECTED, **EXPECTED_UNITS}.items():
        if name not in NAMES and sha((HERE / name).read_bytes()) != expected:
            raise RuntimeError('Unchanged installed dependency differs: ' + name)
    scripts = {'install': render('r28-patch-install-template.py', {'EXPECTED': EXPECTED, 'EXPECTED_UNITS': EXPECTED_UNITS,
                    'PAYLOAD': payload, 'TARGET_ID': TARGET['commit']})}
    scripts['checkout'] = render('r28-patch-checkout-template.py', {'IDENTITY': TARGET, 'OPERATIONS_COMMIT': operations_commit}, root=False)
    scripts['pull'] = render('r28-patch-pull-template.py', {'IDENTITY': TARGET})
    fixed = {**EXPECTED, **{name: value['sha256'] for name, value in payload.items() if name.endswith('.py')}}
    for mode in ('update', 'proof'):
        scripts[mode] = render('r28-patch-driver-template.py', {'EXPECTED': fixed, 'EXPECTED_UNITS': EXPECTED_UNITS, 'MODE': mode})
    manifest = {'purpose': 'fixed-r28-ui-41-to-41-program-patch', 'operationsCommit': operations_commit,
                'runtimeIdentity': TARGET, 'productionExecuted': False,
                'priorControllerHashesFromReadOnlyPreflight': EXPECTED,
                'unchangedUnitHashes': EXPECTED_UNITS, 'scripts': {}}
    for mode, source in scripts.items():
        name = 'timeline-native-r28-ui-patch-' + mode + '-20260928.sh'
        (output / name).write_text(source); (output / name).chmod(0o600)
        manifest['scripts'][name] = sha(source.encode())
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (output / 'manifest.json').chmod(0o600)
    print(json.dumps({'releaseScriptsPrepared': True, 'directory': str(output), 'operationsCommit': operations_commit,
                      'runtimeCommit': TARGET['commit'], 'productionExecuted': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--operations-commit', required=True)
    args = parser.parse_args()
    if not args.output.is_absolute():
        raise SystemExit('Use an explicit private output directory')
    build(args.output, args.operations_commit)
