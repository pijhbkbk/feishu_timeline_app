"""Generate the narrowly reviewed d16 helper repair; never contact a server."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import build_native_release_bundle as bundle

OLD_OPERATIONS = 'd16dc78cae8ef67f24c0530f2705e2f81f27236c'
OLD_HELPER_SHA = '78b9299b5550997d2d939c5b2fc0205b6bd7e0ca620163771a061aede37e8f1a'
OLD_JOURNAL_SHA = '52fd69be9a0fae281801b5640714ca9184a1adcc00c9f5a9856ea02e36c82862'
HELPER = 'native_release_backup.py'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def build(output, operations_commit):
    bundle.release.require_target()
    repo = bundle.HERE.parents[2]
    def git(*args):
        return subprocess.check_output(['git', '-C', str(repo), '-c', 'core.hooksPath=/dev/null', *args])
    if git('rev-parse', 'HEAD').decode().strip() != operations_commit or git('status', '--porcelain').strip():
        raise RuntimeError('Generate from the exact clean committed operations source')
    before = {name: git('show', OLD_OPERATIONS + ':scripts/deploy/gce-host/' + name) for name in bundle.NAMES}
    for name, raw in before.items():
        if name != HELPER and raw != (bundle.HERE / name).read_bytes():
            raise RuntimeError('Socket repair changed another runtime controller or unit')
    if sha(before[HELPER]) != OLD_HELPER_SHA:
        raise RuntimeError('Reviewed installed d16 helper identity differs')
    prior_units = {name: sha(git('show', 'c33c1bdd93639bdb01f584ea78c71ba90a838f9d:scripts/deploy/gce-host/' + name))
                   for name in bundle.NAMES if name.endswith('.service')}
    old_journal = {'version': 1, 'target': bundle.release.NEW, 'base': bundle.release.OLD,
                   'expectedControllers': bundle.EXPECTED, 'expectedUnits': prior_units,
                   'payload': {name: sha(raw) for name, raw in before.items()}}
    encoded = lambda data: (json.dumps(data, sort_keys=True, separators=(',', ':')) + '\n').encode()
    if sha(encoded(old_journal)) != OLD_JOURNAL_SHA:
        raise RuntimeError('Actual read-back d16 install journal identity differs')
    new_helper = (bundle.HERE / HELPER).read_bytes()
    if new_helper == before[HELPER]:
        raise RuntimeError('Repair has no helper change')
    new_journal = json.loads(encoded(old_journal)); new_journal['payload'][HELPER] = sha(new_helper)
    expected = {**bundle.EXPECTED, **{name: sha(raw) for name, raw in before.items() if name.endswith('.py')}}
    units = {name: sha(raw) for name, raw in before.items() if name.endswith('.service')}
    identity = {'fromOperationsCommit': OLD_OPERATIONS, 'toOperationsCommit': operations_commit,
                'runtimeCommit': bundle.release.NEW}
    source = bundle.render('socket-fix-template.py', {'EXPECTED': expected, 'EXPECTED_UNITS': units,
                           'OLD_INSTALL_JOURNAL': old_journal, 'NEW_INSTALL_JOURNAL': new_journal,
                           'OLD_HELPER_SHA': OLD_HELPER_SHA,
                           'NEW_HELPER': {'text': new_helper.decode(), 'sha256': sha(new_helper)},
                           'PATCH_IDENTITY': identity})
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    name = 'timeline-native-release-socket-fix-20260917.sh'
    script = output / name; script.write_text(source); script.chmod(0o600)
    manifest = {**identity, 'purpose': 'exact-installed-d16-socket-helper-repair', 'oldHelperSha256': OLD_HELPER_SHA,
                'newHelperSha256': sha(new_helper), 'oldInstallJournalSha256': OLD_JOURNAL_SHA,
                'newInstallJournalSha256': sha(encoded(new_journal)), 'scripts': {name: sha(source.encode())},
                'productionExecuted': False}
    path = output / 'manifest.json'; path.write_text(json.dumps(manifest, indent=2) + '\n'); path.chmod(0o600)
    print(json.dumps({'repairPrepared': True, 'directory': str(output), 'operationsCommit': operations_commit,
                      'runtimeCommit': bundle.release.NEW, 'productionExecuted': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--operations-commit', required=True)
    parser.add_argument('--output', required=True, type=Path); args = parser.parse_args()
    if not args.output.is_absolute():
        raise SystemExit('Use an explicit private output directory')
    build(args.output, args.operations_commit)
