#!/usr/bin/env python3
"""Build a local M1 artifact exclusively from an explicit committed Git archive.
Default is plan-only. No runtime service, Docker, deployment, or migration runs.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

IDENTITY_PATHS = ('apps/api/src/common/build-identity.generated.ts', 'apps/web/src/lib/build-identity.generated.ts')
PUBLIC_BUILD = {'NEXT_PUBLIC_API_BASE_URL': '/api', 'NEXT_PUBLIC_UI_VERSION': 'v2',
    'NEXT_PUBLIC_UI_DATA_MODE': 'real', 'NEXT_PUBLIC_ENABLE_MOCK_LOGIN': 'false', 'V1_FALLBACK_ENABLED': 'false'}
SCOPES = {'api': ('apps/api/dist', []), 'web': ('apps/web/.next', ['cache']), 'shared': ('packages/shared/dist', [])}


def sha_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        while block := handle.read(1024 * 1024): digest.update(block)
    return digest.hexdigest()


def write_json(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2); handle.write('\n')


def git(repo, *args):
    result = subprocess.run(['git', '-C', str(repo), *args], capture_output=True, check=False)
    if result.returncode: raise RuntimeError('Git source verification failed; no release was built.')
    return result.stdout.decode().strip()


def sanitized_environment():
    # Preserve tool locations/cache homes, never application resource credentials,
    # injected Node options, or arbitrary public build variables from the caller.
    result = {key: os.environ[key] for key in ('PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ', 'PNPM_HOME', 'XDG_CACHE_HOME', 'COREPACK_HOME') if key in os.environ}
    result.update({'CI': 'true', 'NEXT_TELEMETRY_DISABLED': '1'})
    return result


def run(args, cwd, env, log, stage):
    descriptor = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'wb') as handle:
        result = subprocess.run(args, cwd=cwd, env=env, stdout=handle, stderr=subprocess.STDOUT, timeout=1800, check=False)
    if result.returncode: raise RuntimeError(f'{stage} failed ({result.returncode}); release directory retained. Private log: {log}')


def validate_archive_member(member):
    name = member.name
    parts = PurePosixPath(name).parts
    if not name or name.startswith('/') or any(part in ('..', '.git', 'node_modules', '.next') for part in parts):
        raise RuntimeError('Archive contains an unsafe or generated path; extraction refused.')
    if member.issym() or member.islnk() or not (member.isdir() or member.isfile()):
        raise RuntimeError('Archive contains a link or non-file entry; extraction refused.')
    leaf = parts[-1]
    if (leaf.startswith('.env') and leaf != '.env.example' and not leaf.endswith('.example')) or leaf in ('credentials.json', 'admin.password', 'postgres.env') or leaf.endswith(('.pem', '.p12', '.pfx', '.key')):
        raise RuntimeError('Archive contains a potential private configuration/key file; extraction refused.')
    if parts[0] == '.m1-build' or name == 'm1-artifact-manifest.json':
        raise RuntimeError('Archive conflicts with the local artifact evidence directory.')


def extract_archive(repo, commit, destination):
    source = {}
    with tempfile.TemporaryFile(dir='/private/tmp') as handle:
        result = subprocess.run(['git', '-C', str(repo), 'archive', '--format=tar', commit], stdout=handle, stderr=subprocess.PIPE, check=False)
        if result.returncode: raise RuntimeError('Git archive failed; no working-tree files were copied.')
        handle.seek(0); digest = hashlib.sha256()
        while block := handle.read(1024 * 1024): digest.update(block)
        archive_sha = digest.hexdigest(); handle.seek(0)
        with tarfile.open(fileobj=handle, mode='r:') as archive:
            entries = archive.getmembers()
            for member in entries: validate_archive_member(member)
            for member in entries:
                output = destination / member.name
                if member.isdir(): output.mkdir(parents=True, exist_ok=True, mode=0o700); continue
                output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                reader = archive.extractfile(member)
                if reader is None: raise RuntimeError('Archive member has no file data.')
                descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o700 if member.mode & 0o111 else 0o600)
                file_hash = hashlib.sha256()
                with os.fdopen(descriptor, 'wb') as writer:
                    while block := reader.read(1024 * 1024): writer.write(block); file_hash.update(block)
                source[member.name] = file_hash.hexdigest()
    return archive_sha, source


def inventory(root, relative, excludes):
    base = root / relative
    if not base.is_dir() or base.is_symlink(): raise RuntimeError(f'Artifact directory missing or unsafe: {relative}')
    rows = []
    def visit(directory):
        for path in sorted(directory.iterdir(), key=lambda value: value.name):
            rel = path.relative_to(base).as_posix()
            if any(rel == item or rel.startswith(item + '/') for item in excludes): continue
            if path.is_symlink():
                if not path.resolve().is_relative_to(root): raise RuntimeError('Artifact symlink escapes release directory.')
                rows.append({'path': rel, 'kind': 'symlink', 'target': os.readlink(path)})
            elif path.is_dir(): visit(path)
            elif path.is_file(): rows.append({'path': rel, 'kind': 'file', 'size': path.stat().st_size, 'sha256': sha_file(path)})
            else: raise RuntimeError('Artifact contains a special file.')
    visit(base)
    if not rows: raise RuntimeError(f'Artifact has no files: {relative}')
    rows.sort(key=lambda value: value['path'])
    serialized = json.dumps(rows, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode()
    return {'root': relative, 'excludedPaths': excludes, 'entries': len(rows),
        'regularFiles': sum(row['kind'] == 'file' for row in rows),
        'totalBytes': sum(row.get('size', 0) for row in rows),
        'sha256': hashlib.sha256(serialized).hexdigest()}, rows


def verify_manifest(path):
    root = path.parent.resolve(); value = json.loads(path.read_text())
    if value.get('kind') != 'local-m1-committed-artifact' or value.get('status') != 'BUILD_COMPLETE': raise RuntimeError('Unsupported or incomplete artifact manifest.')
    for name, (relative, excludes) in SCOPES.items():
        actual, _ = inventory(root, relative, excludes)
        if actual != value['artifacts'][name]: raise RuntimeError(f'Artifact content changed: {name}')
    if (root / 'apps/web/.next/BUILD_ID').read_text().strip() != value['webBuildId']: raise RuntimeError('Next BUILD_ID changed.')
    print(json.dumps({'status': 'ARTIFACT_DIGESTS_MATCH', 'manifestPath': str(path), 'sourceCommit': value['identity']['sourceCommit']}, ensure_ascii=False))


def build(repo, commit, execute):
    if not repo.is_absolute(): raise RuntimeError('Worktree must be an absolute path.')
    repo = repo.resolve()
    if git(repo, 'rev-parse', '--show-toplevel') != str(repo): raise RuntimeError('Worktree must identify the exact Git top-level directory.')
    if not re.fullmatch(r'[a-f0-9]{40}', commit) or git(repo, 'cat-file', '-t', commit) != 'commit': raise RuntimeError('Source must be an existing full 40-character commit object.')
    tree = git(repo, 'rev-parse', commit + '^{tree}')
    destination = repo / 'var/m1-releases' / commit
    if destination.exists() or destination.is_symlink(): raise RuntimeError('Release directory already exists; it will not be reused, replaced, or cleaned.')
    # Refuse ancestor links instead of writing outside the selected worktree.
    for parent in (repo / 'var', repo / 'var/m1-releases'):
        if parent.is_symlink(): raise RuntimeError('Release parent must not be a symlink.')
    commands = [['pnpm', 'install', '--frozen-lockfile'],
        ['pnpm', '--filter', '@feishu-timeline/shared', 'build'],
        ['pnpm', '--filter', '@feishu-timeline/api', 'build'],
        ['pnpm', '--filter', '@feishu-timeline/web', 'build']]
    if not execute:
        print(json.dumps({'mode': 'PLAN_ONLY', 'sourceCommit': commit, 'sourceTree': tree, 'releaseDirectory': str(destination),
            'source': 'git archive; dirty worktree files excluded', 'commands': commands, 'manifest': str(destination / 'm1-artifact-manifest.json')}, ensure_ascii=False)); return
    os.umask(0o077); destination.mkdir(parents=True, mode=0o700)
    archive_sha, original = extract_archive(repo, commit, destination)
    metadata = destination / '.m1-build'; metadata.mkdir(mode=0o700)
    logs = metadata / 'logs'; logs.mkdir(mode=0o700)
    write_json(metadata / 'source-files.json', original)
    identity = {'sourceCommit': commit, 'sourceTree': tree, 'release': 'm1-' + commit[:12],
        'buildTime': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    env = sanitized_environment()
    run(commands[0], destination, env, logs / '01-install.log', 'Frozen dependency install')
    generator = ['node', 'scripts/deploy/release-identity.mjs', 'generate-ts', '--source-commit', commit, '--source-tree', tree,
        '--release', identity['release'], '--build-time', identity['buildTime']]
    for index, output in enumerate(IDENTITY_PATHS):
        run([*generator, '--output', output], destination, env, logs / f'02-identity-{index}.log', 'Official immutable identity generation')
    expected = {'EXPECTED_SOURCE_COMMIT': commit, 'EXPECTED_SOURCE_TREE': tree, 'EXPECTED_RELEASE': identity['release'], 'EXPECTED_BUILD_TIME': identity['buildTime']}
    build_env = {**env, **expected, **PUBLIC_BUILD, 'NODE_ENV': 'production', 'DEPLOYMENT_ENV': 'production'}
    for index, command in enumerate(commands[1:], 3):
        run(command, destination, build_env, logs / f'{index:02}-build.log', command[2])
    changed = [path for path, digest in original.items() if path not in IDENTITY_PATHS and (not (destination / path).is_file() or sha_file(destination / path) != digest)]
    if changed: raise RuntimeError('Build changed archived source outside approved identity files: ' + ', '.join(changed))
    # Read compiled API identity and execute only the compiled Web build-info
    # handler. No listening socket, database, authentication, or API service starts.
    verifier = """const assert=require('node:assert/strict'); (async()=>{const expected=JSON.parse(process.argv[1]); const api=require('./apps/api/dist/common/build-identity.generated.js').IMMUTABLE_BUILD_IDENTITY; assert.deepEqual(api,expected); const web=require('./apps/web/.next/server/app/build-info/route.js'); const response=await web.routeModule.userland.GET(); const payload=await response.json(); for(const key of Object.keys(expected))assert.equal(payload[key],expected[key]); assert.equal(payload.runtimeCommit,expected.sourceCommit); console.log(JSON.stringify({compiledApiIdentity:api,compiledWebIdentity:Object.fromEntries(Object.keys(expected).map(key=>[key,payload[key]])),runtimeCommit:payload.runtimeCommit}));})().catch(()=>{console.error('Compiled identity verification failed.');process.exitCode=1;});"""
    run(['node', '-e', verifier, json.dumps(identity)], destination, build_env, logs / '06-compiled-identity.log', 'Compiled API and Web identity verification')
    compiled = json.loads((logs / '06-compiled-identity.log').read_text().strip())
    artifacts = {}
    for name, (relative, excludes) in SCOPES.items():
        artifacts[name], entries = inventory(destination, relative, excludes)
        write_json(metadata / f'{name}-files.json', entries)
    web_build_id = (destination / 'apps/web/.next/BUILD_ID').read_text().strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', web_build_id): raise RuntimeError('Next BUILD_ID is missing or invalid.')
    versions = {}
    for tool in ('node', 'pnpm'):
        result = subprocess.run([tool, '--version'], env=env, capture_output=True, text=True, check=True)
        versions[tool] = result.stdout.strip()
    manifest = {'schemaVersion': 1, 'kind': 'local-m1-committed-artifact', 'status': 'BUILD_COMPLETE', 'identity': identity,
        'source': {'method': 'git archive', 'archiveSha256': archive_sha, 'dirtyWorktreeIncluded': False,
            'trackedSourceUnchangedExcept': list(IDENTITY_PATHS)},
        'dependencyLockSha256': sha_file(destination / 'pnpm-lock.yaml'), 'tools': versions,
        'buildCommands': commands, 'publicBuildConfiguration': PUBLIC_BUILD,
        'compiledIdentityVerification': compiled, 'artifacts': artifacts, 'webBuildId': web_build_id,
        'digestMethod': 'SHA-256 of canonical UTF-8 JSON file inventory (sorted paths and keys; compact separators). Web excludes .next/cache. Individual inventories reside in .m1-build/*-files.json.',
        'runtimeServiceStarted': False, 'runtimeIdentityVerifiedOverHttp': False,
        'containerImages': 'Not built; local compiled artifacts only.'}
    output = destination / 'm1-artifact-manifest.json'; write_json(output, manifest)
    print(json.dumps({'status': 'BUILD_COMPLETE', 'releaseDirectory': str(destination), 'manifestPath': str(output),
        'identity': identity, 'webBuildId': web_build_id, 'artifactSha256': {name: value['sha256'] for name, value in artifacts.items()}}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worktree', type=Path)
    parser.add_argument('--commit')
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--verify-manifest', type=Path)
    args = parser.parse_args()
    try:
        if args.verify_manifest:
            if args.execute or args.worktree or args.commit: parser.error('--verify-manifest cannot be combined with build arguments.')
            verify_manifest(args.verify_manifest.resolve()); return
        if not args.worktree or not args.commit: parser.error('--worktree and --commit are required for a build plan or execution.')
        build(args.worktree, args.commit, args.execute)
    except Exception as exc:
        print(str(exc) if isinstance(exc, RuntimeError) else f'Artifact preparation stopped ({type(exc).__name__}); partial release retained.', file=sys.stderr)
        raise SystemExit(1)


if __name__ == '__main__': main()
