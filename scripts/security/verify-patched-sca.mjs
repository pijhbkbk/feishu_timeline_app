#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const FINDING_ID = 'R28-CI-BRACES-001';
export const ADVISORY = 'GHSA-vfj7-8cjw-p6xm';
export const PATCH_SHA = '77f69000e7a7240e6e8a7043a3eae0fabf328aec3be934685dcd656d9f02ee23';
export const LOCK_SHA = 'd96a07aa3f39bf74bcf855ef5ad2e7c8ec7f799465f19c38fa0440f30d41e896';
const TEST_SHA = '5583cbf7fe14fffc2c9927c07387190509b0a707b32d97f4e1b88ac1234f808e';
const PNPM_PATCH = 'puxqlaaxolc2hdmxjvqssmpewy';
const SOURCES = Object.freeze({
  'package.json': '56f08b888a4f30dc7cf8a7dbb36ffe92b737912ba36abe9d069d32167c957ac7',
  'index.js': '332ea07c7b006361aad12aa994ca75dc1db8e8382b884909e2f38f10b85c88a4',
  'lib/compile.js': 'a682f1be54a19ff4f7dc479c7003b625ab508c2ea6ce012c8351616485003871',
  'lib/constants.js': 'c18ac5adb57308f1ce42a28552da3a31f5d83709743ebd9a636336813a744d4b',
  'lib/depth.js': '1bf42d1214bc1bad6f3b6bfffb800fcf19227b0c0fc2b6638a30f1ecaebbca67',
  'lib/expand.js': 'a8921bf59b0a50090eee962d912c61bdac7e1400db174b706d26f1c27d07ed68',
  'lib/parse.js': '0857f1e6d0f2599b7a9299e5980756d2adbed8116be0fb6e15502a9b46d8a86a',
  'lib/stringify.js': 'd3cd3d614aa460fb416e5b3c1d3b7dbf604695ab6923f8f6866f7aea605c4c8a',
  'lib/utils.js': 'b5a7596aa67730412b3c029ef09e84e6b67b8e445cffd35d1d295549c89066c7',
});
const PATH = '. > @next/eslint-plugin-next@15.5.25 > fast-glob@3.3.1 > micromatch@4.0.8 > braces@3.0.3';
const assert = (ok) => { if (!ok) throw new Error('Exact local remediation evidence did not validate'); };
const hash = value => createHash('sha256').update(value).digest('hex');
const read = name => { const stat = fs.statSync(name); assert(stat.isFile() && stat.size <= 20 * 1024 * 1024); return fs.readFileSync(name); };
const json = name => JSON.parse(read(name));
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const zeroCounts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
function counts(report, expected) {
  assert(object(report) && !report.error && object(report.advisories) && object(report.metadata?.vulnerabilities));
  assert(Object.keys(report.metadata.vulnerabilities).sort().join() === Object.keys(expected).sort().join());
  for (const [key, value] of Object.entries(expected)) assert(report.metadata.vulnerabilities[key] === value);
  assert(Array.isArray(report.muted) && report.muted.length === 0);
}
export function assertExactAdvisory(all, prod, allExit, prodExit) {
  assert(allExit === 1 && prodExit === 0);
  counts(prod, zeroCounts); assert(Object.keys(prod.advisories).length === 0);
  counts(all, { ...zeroCounts, high: 1 });
  const entries = Object.values(all.advisories); assert(entries.length === 1);
  const entry = entries[0];
  assert(hash(canonical(entry)) === '4ab281bb579e411493a491cf8546abe3ee17849ff1ecb21e44093ca8521be7bd');
  assert(entry.github_advisory_id === ADVISORY && entry.module_name === 'braces' && entry.severity === 'high');
  assert(entry.vulnerable_versions === '<=3.0.3' && entry.patched_versions === '<0.0.0');
  assert(JSON.stringify(entry.cves) === '["CVE-2026-93687"]');
  assert(JSON.stringify(entry.cwe) === '["CWE-674"]');
  assert(entry.cvss?.score === 7.5 && entry.cvss?.vectorString === 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H');
  assert(Array.isArray(entry.findings) && entry.findings.length === 1);
  assert(entry.findings[0].version === '3.0.3' && JSON.stringify(entry.findings[0].paths) === JSON.stringify([PATH]));
}
export function verifyInstalledPatch(root) {
  assert(hash(read(path.join(root, 'pnpm-lock.yaml'))) === LOCK_SHA);
  assert(hash(read(path.join(root, 'patches/braces@3.0.3.patch'))) === PATCH_SHA);
  assert(hash(read(path.join(root, 'scripts/security/tests/braces-depth.test.mjs'))) === TEST_SHA);
  const manifest = json(path.join(root, 'package.json'));
  assert(manifest.pnpm?.patchedDependencies?.['braces@3.0.3'] === 'patches/braces@3.0.3.patch');
  assert(manifest.devDependencies?.['@next/eslint-plugin-next'] === '^15.5.24');
  assert(!manifest.dependencies?.['@next/eslint-plugin-next'] && !manifest.optionalDependencies?.['@next/eslint-plugin-next']);
  const ledger = json(path.join(root, 'docs/security/FINDINGS.yaml'));
  const findings = ledger.findings?.filter(finding => finding.id === FINDING_ID);
  assert(findings?.length === 1 && ['fixed_diff_verified', 'fixed_full_verified', 'closed'].includes(findings[0].status));
  assert(findings[0].verification?.targeted?.status === 'pass' && findings[0].verification?.diff_review?.status === 'pass');
  let require = createRequire(path.join(root, 'package.json'));
  let bracesRoot;
  for (const [name, version] of [['@next/eslint-plugin-next', '15.5.25'], ['fast-glob', '3.3.1'], ['micromatch', '4.0.8'], ['braces', '3.0.3']]) {
    const file = require.resolve(`${name}/package.json`);
    assert(json(file).version === version);
    require = createRequire(file);
    if (name === 'braces') bracesRoot = path.dirname(file);
  }
  assert(bracesRoot.includes(`braces@3.0.3_patch_hash=${PNPM_PATCH}`));
  for (const [file, expected] of Object.entries(SOURCES)) assert(hash(read(path.join(bracesRoot, file))) === expected);
  // Execute the reviewed negative regressions against the actual installed chain.
  // A timeout, signal, test failure, altered test, or missing install fails closed.
  const childEnv = { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' };
  delete childEnv.NODE_TEST_CONTEXT;
  const test = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(root, 'scripts/security/tests/braces-depth.test.mjs')], {
    cwd: root, timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8',
    env: childEnv, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert(test.status === 0 && !test.signal && !test.error);
  for (const line of ['# tests 3', '# pass 3', '# fail 0', '# skipped 0']) assert(test.stdout.split('\n').includes(line));
  return { findingId: FINDING_ID, advisory: ADVISORY, package: 'braces', version: '3.0.3', patchSha256: PATCH_SHA,
    pnpmPatchHash: PNPM_PATCH, lockfileSha256: LOCK_SHA, loadedSourceSha256: SOURCES, regressionSha256: TEST_SHA,
    regressionResultSha256: hash(test.stdout), regressionStatus: 'PASS', scope: 'DEVELOPMENT_ONLY_EXACT_CHAIN' };
}
export function verifyRemediatedAudit(root, reportDir) {
  const allBytes = read(path.join(reportDir, 'pnpm-audit-all.json'));
  const prodBytes = read(path.join(reportDir, 'pnpm-audit.json'));
  const allCode = read(path.join(reportDir, 'pnpm-audit-all.exit-code')).toString().trim();
  const prodCode = read(path.join(reportDir, 'pnpm-audit.exit-code')).toString().trim();
  assert(allCode === '1' && prodCode === '0');
  const allExit = Number(allCode), prodExit = Number(prodCode);
  assertExactAdvisory(JSON.parse(allBytes), JSON.parse(prodBytes), allExit, prodExit);
  const evidence = verifyInstalledPatch(root);
  return { status: 'LOCALLY_REMEDIATED', rawAuditStatus: 'FAIL', rawAuditExitCode: allExit, rawFindingCount: 1,
    locallyRemediatedCount: 1, residualFindingCount: 0, productionAuditStatus: 'PASS', productionAuditExitCode: prodExit,
    auditAllSha256: hash(allBytes), auditProductionSha256: hash(prodBytes), ...evidence };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(JSON.stringify(verifyRemediatedAudit(process.cwd(), process.argv[2]), null, 2) + '\n'); }
  catch { process.stdout.write(JSON.stringify({ status: 'BLOCKED', reason: 'Exact advisory, reviewed patch, installed source, ledger, audit or regression evidence did not validate' }) + '\n'); process.exitCode = 1; }
}
