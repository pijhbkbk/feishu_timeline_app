"""Build reviewable fixed-host scripts from the finalized operations checkout.

This local generator executes no SSH, Docker, cloud or deployment commands.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import native_release as release

HERE = Path(__file__).resolve().parent
EXPECTED = {
    'native_release.py': '33d00c08ef539c08cf679946fbf125819cfe79441ee40adfd52bb9ee755877bf',
    'native_runtime_app.py': '7440febc72c120ac547e24e06f19019f891c6611cf21294e7f28fd6eaf9f782d',
    'native_backup_controller.py': '5bfda36db359474f5ef218ab3d2b103fbd2acefea49757fcac25494ce3a3874d',
    'native_cutover.py': '50bd61b849e31eacd80ba823fc5ca1bb84f9d651169837083e8bd378e955950a',
    'native_database_scope.py': 'e44fad1b0554569e215d7e3ea3bf3d1ab2c11a35c62a14949c7d05900cc76dcc',
    'native_migration_probe.py': '375ce24629be5f40cfe106ebea736a3c69d8f4b23ea3f77b141f9b90cc351dab',
    'native_runtime_network.py': 'd85f6a2ff101c1180b56b059b313571b38f84ddbeca8c1b213f2a20a96020807',
    'native_runtime_redis.py': 'e21b6e15c3a50c345f60f8c31f65c7bbfe245a77ffacf2403568bffd54a8cbbc',
}
NAMES = ('native_release_target.py', 'native_release_backup.py', 'native_release.py', 'native_runtime_app.py', 'native_runtime_network.py', 'native_cutover.py', 'timeline-native-api.service',
         'timeline-native-release.service', 'timeline-native-release-check.service', 'timeline-native-release-rollback.service')


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
    release.require_target()
    repository = HERE.parents[2]
    def git(*args):
        return subprocess.check_output(['git', '-C', str(repository), '-c', 'core.hooksPath=/dev/null', *args]).decode().strip()
    if git('rev-parse', 'HEAD') != operations_commit or git('status', '--porcelain'):
        raise RuntimeError('Generate only from the exact clean committed operations source')
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    payload = {name: {'sha256': sha((HERE / name).read_bytes()), 'text': (HERE / name).read_text()} for name in NAMES}
    prior_units = {}
    # Unit source from the immutable actual 6c70 deployment, not today's edited units.
    for name in NAMES:
        if name.endswith('.service'):
            raw = subprocess.check_output(['git', '-C', str(repository), 'show', 'c33c1bdd93639bdb01f584ea78c71ba90a838f9d:scripts/deploy/gce-host/' + name])
            prior_units[name] = sha(raw)
    scripts = {'install': render('install-template.py', {'EXPECTED': EXPECTED, 'EXPECTED_UNITS': prior_units,
                    'PAYLOAD': payload, 'TARGET_ID': release.NEW})}
    scripts['checkout'] = render('checkout-template.py', {'IDENTITY': release.TARGET, 'OPERATIONS_COMMIT': operations_commit}, root=False)
    scripts['pull'] = render('pull-template.py', {'IDENTITY': release.TARGET})
    fixed = {**EXPECTED, **{name: value['sha256'] for name, value in payload.items() if name.endswith('.py')}}
    units = {name: value['sha256'] for name, value in payload.items() if name.endswith('.service')}
    for mode in ('rehearse', 'update', 'proof', 'rollback'):
        scripts[mode] = render('driver-template.py', {'EXPECTED': fixed, 'EXPECTED_UNITS': units, 'MODE': mode})
    manifest = {'purpose': 'fixed-6c70-program-upgrade', 'operationsCommit': operations_commit,
                'runtimeIdentity': release.TARGET, 'productionExecuted': False,
                'priorControllerHashesFromReadOnlyPreflight': EXPECTED, 'scripts': {}}
    for mode, source in scripts.items():
        name = 'timeline-native-release-' + mode + '-20260917.sh'
        (output / name).write_text(source); (output / name).chmod(0o600)
        manifest['scripts'][name] = sha(source.encode())
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (output / 'manifest.json').chmod(0o600)
    print(json.dumps({'releaseScriptsPrepared': True, 'directory': str(output), 'operationsCommit': operations_commit,
                      'runtimeCommit': release.NEW, 'productionExecuted': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--operations-commit', required=True)
    args = parser.parse_args()
    if not args.output.is_absolute():
        raise SystemExit('Use an explicit private output directory')
    build(args.output, args.operations_commit)
