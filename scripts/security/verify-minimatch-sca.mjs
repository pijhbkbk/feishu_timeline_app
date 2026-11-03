import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ADVISORY = 'GHSA-g3hv-75wg-m249';
export const FINDING_IDS = ['R49-CI-MINIMATCH-001', 'R49-CI-MINIMATCH-002', 'R49-CI-MINIMATCH-003'];
export const LOCK_SHA = '3420869473d1aa7c8bacb4f6310920c9f04231d5be3d3672d9c2677dfdd1be1f';
export const PATCH_SHA = '22cdec6c47402add7095162a13280d3663ea55e66f3e6eedacf8f53f420091a1';
const TEST_SHA = 'bdd79e44bf13bdbc156d05674fadb8ace5c2aacbfb9b0fe919bbc2d6d6a6e465';
const PATCH_KEY = 'minimatch@10.2.5_patch_hash=rwmddqc37tufv6xtc4b7vpdhia';
const SOURCES = {
  '10.2.5': {
    'package.json': '4b3a08a7ad20dead8bbe4b4fe97a2746bded7c51d218ef3034eb4e330ad31f08',
    'dist/commonjs/index.js': 'f2bf9d502fc4168999e929f2014f193473ed5883ca7a9c8db654be1d1a7bad95',
    'dist/esm/index.js': '58810e5da05a47480e45900b61195fffe389f4a25f97ba5b161bd0a49388c9cc',
  },
  '3.1.5': {
    'package.json': 'eefa1c89527d52bbb2e8b053fe8ecf3e3ced399bdba82cf27e0e92edfd833938',
    'minimatch.js': '746849f267c4868a53729225bd85c7dccd387712136fb305fcc0a3eadd4a3d9d',
  },
  '5.1.9': {
    'package.json': 'dc1b9424c2ec4c845ba05e7402f7d22807f4ac85d31725892fd3dcafaa08f800',
    'minimatch.js': '1339bca8b70e33847860daa8fc3ccfa62487e143670da01a3b718d40d5fd424f',
  },
};
const assert = condition => { if (!condition) throw new Error('Exact minimatch evidence did not validate'); };
const hash = value => createHash('sha256').update(value).digest('hex');
const read = file => {
  const stat = fs.statSync(file);
  assert(stat.isFile() && stat.size <= 20 * 1024 * 1024);
  return fs.readFileSync(file);
};
const json = file => JSON.parse(read(file));
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';

export function assertMinimatchAudit(all, production, allExit, productionExit) {
  assert(allExit === 1 && productionExit === 1);
  for (const [report, count, expected] of [
    [all, 3, '52cc98a30e8a82bdf91400cf7a22bc4a14fd51ff331bd74c160abb185033fbab'],
    [production, 2, 'bc810762319e80320e966c353813e64b86ea20f7915619a294cfe071b9c80ea9'],
  ]) {
    assert(report && !report.error && report.advisories && !Array.isArray(report.advisories));
    assert(Array.isArray(report.muted) && report.muted.length === 0);
    assert(canonical(report.metadata?.vulnerabilities) === canonical({ info: 0, low: 0, moderate: count, high: 0, critical: 0 }));
    const entries = Object.values(report.advisories);
    assert(entries.length === 1 && entries[0].github_advisory_id === ADVISORY);
    // Bind the complete advisory and exact installed versions/paths. A changed
    // description, occurrence, severity, or additional advisory requires review.
    assert(hash(canonical(entries[0])) === expected);
  }
}

function packageFrom(rootManifest, chain) {
  let require = createRequire(rootManifest);
  for (const name of chain) require = createRequire(require.resolve(`${name}/package.json`));
  return { directory: path.dirname(require.resolve('minimatch/package.json')), entry: require.resolve('minimatch') };
}

export function verifyMinimatchSources(root) {
  assert(hash(read(path.join(root, 'pnpm-lock.yaml'))) === LOCK_SHA);
  assert(hash(read(path.join(root, 'patches/minimatch@10.2.5.patch'))) === PATCH_SHA);
  assert(hash(read(path.join(root, 'scripts/security/tests/minimatch-globparts.test.mjs'))) === TEST_SHA);
  const manifest = json(path.join(root, 'package.json'));
  assert(manifest.pnpm?.patchedDependencies?.['minimatch@10.2.5'] === 'patches/minimatch@10.2.5.patch');
  const ledger = json(path.join(root, 'docs/security/FINDINGS.yaml'));
  for (const [index, id] of FINDING_IDS.entries()) {
    const matches = ledger.findings?.filter(finding => finding.id === id);
    assert(matches?.length === 1);
    const finding = matches[0];
    assert(finding.root_cause_cluster === ADVISORY && finding.disposition?.risk_acceptance === null);
    assert(finding.verification?.targeted?.status === 'pass' && finding.verification?.diff_review?.status === 'pass');
    if (index === 0) assert(['fixed_diff_verified', 'fixed_full_verified', 'closed'].includes(finding.status));
    else assert(finding.status === 'false_positive' && finding.disposition?.false_positive_reason);
  }
  const packages = {
    '10.2.5': packageFrom(path.join(root, 'package.json'), ['eslint']),
    '3.1.5': packageFrom(path.join(root, 'apps/web/package.json'), ['exceljs', 'archiver', 'archiver-utils', 'glob']),
    '5.1.9': packageFrom(path.join(root, 'apps/web/package.json'), ['exceljs', 'archiver', 'readdir-glob']),
  };
  assert(packages['10.2.5'].directory.includes(PATCH_KEY));
  for (const [version, { directory, entry }] of Object.entries(packages)) {
    assert(json(path.join(directory, 'package.json')).version === version);
    for (const [file, expected] of Object.entries(SOURCES[version])) assert(hash(read(path.join(directory, file))) === expected);
    assert(entry === path.join(directory, version === '10.2.5' ? 'dist/commonjs/index.js' : 'minimatch.js'));
  }
  const childEnv = { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(root, 'scripts/security/tests/minimatch-globparts.test.mjs')], {
    cwd: root, timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8', env: childEnv, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert(result.status === 0 && !result.signal && !result.error);
  for (const line of ['# tests 8', '# pass 8', '# fail 0', '# skipped 0']) assert(result.stdout.split('\n').includes(line));
  return { advisory: ADVISORY, findingIds: FINDING_IDS, patchSha256: PATCH_SHA, lockfileSha256: LOCK_SHA,
    loadedSourceSha256: SOURCES, regressionSha256: TEST_SHA, regressionResultSha256: hash(result.stdout),
    applicability: { '10.2.5': 'UPSTREAM_FIX_BACKPORTED', '3.1.5': 'PREPROCESSING_MECHANISM_ABSENT', '5.1.9': 'PREPROCESSING_MECHANISM_ABSENT' } };
}

export function verifyMinimatchAudit(root, directory) {
  const all = read(path.join(directory, 'pnpm-audit-all.json'));
  const production = read(path.join(directory, 'pnpm-audit.json'));
  const allExit = read(path.join(directory, 'pnpm-audit-all.exit-code')).toString().trim();
  const productionExit = read(path.join(directory, 'pnpm-audit.exit-code')).toString().trim();
  assert(allExit === '1' && productionExit === '1');
  assertMinimatchAudit(JSON.parse(all), JSON.parse(production), Number(allExit), Number(productionExit));
  return { ...verifyMinimatchSources(root), status: 'LOCALLY_REMEDIATED', rawAuditStatus: 'FAIL', rawProductionAuditStatus: 'FAIL',
    rawAuditExitCode: 1, rawProductionAuditExitCode: 1, rawAdvisoryCount: 1, rawAffectedVersionCount: 3,
    locallyRemediatedVersionCount: 1, notApplicableVersionCount: 2, residualFindingCount: 0,
    auditAllSha256: hash(all), auditProductionSha256: hash(production),
    boundary: 'Exact advisory and installed sources only. Original audit findings remain visible. No image or runtime security clearance.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(JSON.stringify(verifyMinimatchAudit(process.cwd(), process.argv[2]), null, 2) + '\n'); }
  catch { process.stdout.write(JSON.stringify({ status: 'BLOCKED', reason: 'Exact advisory, installed sources, patch, regressions or independent finding disposition did not validate' }) + '\n'); process.exitCode = 1; }
}
