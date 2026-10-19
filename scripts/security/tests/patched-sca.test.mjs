import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ADVISORY, FINDING_ID, assertExactAdvisory, verifyInstalledPatch, verifyRemediatedAudit } from '../verify-patched-sca.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const projectRequire = createRequire(path.join(root, 'package.json'));
let dependencyRequire = projectRequire;
for (const name of ['@next/eslint-plugin-next', 'fast-glob', 'micromatch']) dependencyRequire = createRequire(dependencyRequire.resolve(`${name}/package.json`));
const installedBraces = path.dirname(dependencyRequire.resolve('braces/package.json'));
const bracesRequire = createRequire(path.join(installedBraces, 'package.json'));
const empty = () => ({ advisories: {}, muted: [], metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } });
function report() {
  const value = empty(); value.metadata.vulnerabilities.high = 1;
  value.advisories['1240992'] = JSON.parse(fs.readFileSync(new URL('./fixtures/braces-advisory.json', import.meta.url)));
  return value;
}
function put(dir, name, value) { const file = path.join(dir, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); }
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patched-sca-regression-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of ['package.json', 'pnpm-lock.yaml', 'patches/braces@3.0.3.patch', 'scripts/security/tests/braces-depth.test.mjs']) put(dir, name, fs.readFileSync(path.join(root, name), 'utf8'));
  put(dir, 'docs/security/FINDINGS.yaml', { findings: [{ id: FINDING_ID, status: 'fixed_diff_verified', verification: { targeted: { status: 'pass' }, diff_review: { status: 'pass' } } }] });
  for (const [name, version] of [['@next/eslint-plugin-next', '15.5.25'], ['fast-glob', '3.3.1'], ['micromatch', '4.0.8']]) { put(dir, `node_modules/${name}/package.json`, { name, version, main: 'index.js' }); put(dir, `node_modules/${name}/index.js`, 'module.exports = {};'); }
  const braces = path.join(dir, 'node_modules/.pnpm/braces@3.0.3_patch_hash=puxqlaaxolc2hdmxjvqssmpewy/node_modules/braces');
  fs.cpSync(installedBraces, braces, { recursive: true });
  fs.symlinkSync(braces, path.join(dir, 'node_modules/braces'));
  fs.symlinkSync(path.dirname(bracesRequire.resolve('fill-range/package.json')), path.join(dir, 'node_modules/fill-range'));
  put(dir, 'reports/pnpm-audit-all.json', report()); put(dir, 'reports/pnpm-audit.json', empty());
  put(dir, 'reports/pnpm-audit-all.exit-code', '1'); put(dir, 'reports/pnpm-audit.exit-code', '0');
  return { dir, braces };
}
test('only the exact advisory occurrence, severity and original failed exit are eligible', () => {
  assert.doesNotThrow(() => assertExactAdvisory(report(), empty(), 1, 0));
  for (const mutate of [
    r => r.advisories['1240992'].github_advisory_id = 'GHSA-unknown', r => r.advisories['1240992'].findings[0].version = '3.0.2',
    r => r.advisories['1240992'].findings[0].paths.push('other > braces@3.0.3'), r => r.advisories['1240992'].findings[0].paths[0] = 'production > braces@3.0.3',
    r => r.advisories['1240992'].severity = 'critical', r => r.advisories['1240992'].overview += ' changed', r => r.advisories['1240992'].cves.push('CVE-unknown'),
    r => r.advisories.extra = { ...r.advisories['1240992'] }, r => r.metadata.vulnerabilities.low = 1,
    r => r.muted.push(ADVISORY), r => r.error = { code: 'registry-error' }, r => delete r.metadata,
  ]) { const all = report(); mutate(all); assert.throws(() => assertExactAdvisory(all, empty(), 1, 0)); }
  for (const [allExit, prodExit] of [[0, 0], [2, 0], [1, 1], [1, 2]]) assert.throws(() => assertExactAdvisory(report(), empty(), allExit, prodExit));
  assert.throws(() => assertExactAdvisory(report(), report(), 1, 0));
});
test('actual patch source and regressions validate while raw finding stays explicitly failed', t => {
  const { dir } = fixture(t);
  const result = verifyRemediatedAudit(dir, path.join(dir, 'reports'));
  assert.equal(result.status, 'LOCALLY_REMEDIATED'); assert.equal(result.rawAuditStatus, 'FAIL'); assert.equal(result.rawAuditExitCode, 1);
  assert.equal(result.rawFindingCount, 1); assert.equal(result.locallyRemediatedCount, 1); assert.equal(result.residualFindingCount, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'reports/pnpm-audit-all.json'))), report());
});
for (const [name, mutate] of [
  ['changed lock', dir => fs.appendFileSync(path.join(dir, 'pnpm-lock.yaml'), '\n')],
  ['changed patch', dir => fs.appendFileSync(path.join(dir, 'patches/braces@3.0.3.patch'), '\n')],
  ['missing patch', dir => fs.unlinkSync(path.join(dir, 'patches/braces@3.0.3.patch'))],
  ['altered regression', dir => fs.appendFileSync(path.join(dir, 'scripts/security/tests/braces-depth.test.mjs'), '\n')],
  ['changed loaded source', (_dir, braces) => fs.appendFileSync(path.join(braces, 'lib/depth.js'), '\n')],
  ['unapplied patch', (_dir, braces) => fs.unlinkSync(path.join(braces, 'lib/depth.js'))],
  ['missing ledger', dir => fs.unlinkSync(path.join(dir, 'docs/security/FINDINGS.yaml'))],
  ['review pending', dir => put(dir, 'docs/security/FINDINGS.yaml', { findings: [{ id: FINDING_ID, status: 'in_progress' }] })],
  ['risk acceptance instead of repair', dir => put(dir, 'docs/security/FINDINGS.yaml', { findings: [{ id: FINDING_ID, status: 'risk_accepted' }] })],
  ['production root', dir => { const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))); p.dependencies = { '@next/eslint-plugin-next': '^15.5.24' }; put(dir, 'package.json', p); }],
  ['regression actually fails', dir => { fs.unlinkSync(path.join(dir, 'node_modules/fill-range')); put(dir, 'node_modules/fill-range/package.json', { main: 'index.js' }); put(dir, 'node_modules/fill-range/index.js', 'module.exports = () => { throw Error("synthetic failure") };'); }],
]) test(`fails closed for ${name}`, t => { const { dir, braces } = fixture(t); mutate(dir, braces); assert.throws(() => verifyInstalledPatch(dir)); });
test('missing and malformed original exit-code evidence remains blocked', t => {
  const { dir } = fixture(t); put(dir, 'reports/pnpm-audit.exit-code', '');
  assert.throws(() => verifyRemediatedAudit(dir, path.join(dir, 'reports')));
  fs.unlinkSync(path.join(dir, 'reports/pnpm-audit.exit-code'));
  assert.throws(() => verifyRemediatedAudit(dir, path.join(dir, 'reports')));
});

test('CI collection preserves the High finding and revalidates exact local remediation instead of trusting status', async t => {
  const { collect } = await import('../ci-evidence.mjs');
  const { execFileSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  for (const forged of [false, true]) {
    const { dir } = fixture(t);
    put(dir, '.gitleaks.toml', 'title = "synthetic"\n');
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git('init', '-q'); git('add', 'package.json', 'pnpm-lock.yaml', '.gitleaks.toml', 'patches/braces@3.0.3.patch', 'scripts/security/tests/braces-depth.test.mjs', 'docs/security/FINDINGS.yaml');
    git('-c', 'user.name=CI regression', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'synthetic exact source fixture');
    put(dir, 'reports/ci-private/security-source/metadata.json', {
      identity: { sourceCommit: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD^{tree}'), release: 'ci-123-1', buildTime: '2026-09-08T00:00:00Z' },
      lockfileSha256: createHash('sha256').update(fs.readFileSync(path.join(dir, 'pnpm-lock.yaml'))).digest('hex'),
      job: 'security-source', runId: '123', runAttempt: '1', observedAt: '2026-09-08T00:00:00Z', platformAllowed: true, sourceWorktreeClean: true,
    });
    for (const kind of ['current', 'history']) { put(dir, `reports/security/secrets/gitleaks-${kind}.json`, []); put(dir, `reports/security/secrets/gitleaks-${kind}.status`, 'PASS'); }
    put(dir, 'reports/security/sast/semgrep.json', { results: [], errors: [], version: '1.169.0' }); put(dir, 'reports/security/sast/semgrep.status', 'PASS');
    for (const name of ['pnpm-audit-all.json', 'pnpm-audit.json', 'pnpm-audit-all.exit-code', 'pnpm-audit.exit-code']) put(dir, `reports/security/sca/${name}`, fs.readFileSync(path.join(dir, 'reports', name), 'utf8'));
    put(dir, 'reports/security/sca/pnpm-audit-all.status', 'FAIL'); put(dir, 'reports/security/sca/pnpm-audit.status', 'PASS');
    put(dir, 'reports/security/sca/local-remediation.json', { status: 'LOCALLY_REMEDIATED', rawFindingCount: 0 }); // Never trusted.
    if (forged) fs.unlinkSync(path.join(dir, 'patches/braces@3.0.3.patch'));
    const result = collect(dir, 'security-source', { secrets: { outcome: 'success' }, sast: { outcome: 'success' }, sca: { outcome: 'success' } }, () => null);
    assert.equal(result.complete, !forged);
    const published = JSON.parse(fs.readFileSync(path.join(dir, 'reports/ci-public/security-source/sca-all.json')));
    assert.equal(published.state, forged ? 'FINDINGS' : 'FINDINGS_LOCALLY_REMEDIATED');
    assert.equal(published.scannerStatus, 'FAIL'); assert.equal(published.findingCount, 1); assert.equal(published.findings[0].severity, 'HIGH');
    if (!forged) { assert.equal(published.localRemediation.rawAuditExitCode, 1); assert.equal(published.localRemediation.rawFindingCount, 1); }
  }
});
