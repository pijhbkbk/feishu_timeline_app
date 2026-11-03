import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { assertMinimatchAudit, verifyMinimatchSources, verifyMinimatchAudit, FINDING_IDS } from '../verify-minimatch-sca.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minimatch-applicability-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const name of ['package.json', 'apps/web/package.json', 'pnpm-lock.yaml',
    'patches/minimatch@10.2.5.patch', 'scripts/security/tests/minimatch-globparts.test.mjs']) {
    const target = path.join(directory, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, name), target);
  }
  // Read the installed, pinned dependency sources. Tests never modify these links.
  for (const name of ['node_modules', 'apps/web/node_modules']) {
    fs.symlinkSync(path.join(root, name), path.join(directory, name));
  }
  const findings = FINDING_IDS.map((id, index) => ({ id, root_cause_cluster: 'GHSA-g3hv-75wg-m249',
    status: index === 0 ? 'fixed_diff_verified' : 'false_positive',
    disposition: { risk_acceptance: null, false_positive_reason: index === 0 ? null : 'Synthetic reviewed mechanism absence' },
    verification: { targeted: { status: 'pass' }, diff_review: { status: 'pass' } } }));
  fs.mkdirSync(path.join(directory, 'docs/security'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'docs/security/FINDINGS.yaml'), JSON.stringify({ findings }));
  const reports = path.join(directory, 'reports');
  fs.mkdirSync(reports);
  fs.writeFileSync(path.join(reports, 'pnpm-audit-all.json'), JSON.stringify(report('all')));
  fs.writeFileSync(path.join(reports, 'pnpm-audit.json'), JSON.stringify(report('prod')));
  for (const name of ['pnpm-audit-all.exit-code', 'pnpm-audit.exit-code']) fs.writeFileSync(path.join(reports, name), '1');
  return { directory, reports, findings };
}

function report(kind) {
  const advisory = JSON.parse(fs.readFileSync(new URL(`./fixtures/minimatch-advisory-${kind}.json`, import.meta.url)));
  return { advisories: { [advisory.id]: advisory }, muted: [],
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: kind === 'all' ? 3 : 2, high: 0, critical: 0 } } };
}

test('only the complete exact full and production advisory pair is eligible', () => {
  assert.doesNotThrow(() => assertMinimatchAudit(report('all'), report('prod'), 1, 1));
  for (const kind of ['all', 'prod']) {
    for (const mutate of [
      value => { value.advisories[1244012].severity = 'low'; },
      value => { value.advisories[1244012].findings[0].version = '11.0.1'; },
      value => { value.advisories[1244012].findings[0].paths.push('unexpected dependency path'); },
      value => { value.advisories[1244012].overview += ' changed'; },
      value => { value.advisories.extra = value.advisories[1244012]; },
      value => { value.metadata.vulnerabilities.low = 1; },
      value => { value.muted.push('GHSA-g3hv-75wg-m249'); },
      value => { value.error = { code: 'registry-failure' }; },
      value => { delete value.metadata; },
    ]) {
      const all = report('all'), production = report('prod');
      mutate(kind === 'all' ? all : production);
      assert.throws(() => assertMinimatchAudit(all, production, 1, 1));
    }
  }
  for (const [allExit, productionExit] of [[0, 1], [1, 0], [2, 1], [1, 2]]) {
    assert.throws(() => assertMinimatchAudit(report('all'), report('prod'), allExit, productionExit));
  }
});

test('missing installed inputs cannot establish an applicability exception', () => {
  assert.throws(() => verifyMinimatchSources(new URL('./fixtures/', import.meta.url).pathname));
});

test('actual installed sources and bounded regressions retain both raw failures', t => {
  const { directory, reports } = fixture(t);
  const value = verifyMinimatchAudit(directory, reports);
  assert.equal(value.status, 'LOCALLY_REMEDIATED');
  assert.equal(value.rawAuditExitCode, 1);
  assert.equal(value.rawProductionAuditExitCode, 1);
  assert.equal(value.locallyRemediatedVersionCount, 1);
  assert.equal(value.notApplicableVersionCount, 2);
});

for (const name of ['pnpm-lock.yaml', 'patches/minimatch@10.2.5.patch', 'scripts/security/tests/minimatch-globparts.test.mjs']) {
  test(`changed ${name} fails closed`, t => {
    const { directory } = fixture(t);
    fs.appendFileSync(path.join(directory, name), '\n');
    assert.throws(() => verifyMinimatchSources(directory));
  });
}

test('pending review, risk acceptance and missing mechanism disposition stay blocked', t => {
  const { directory, findings } = fixture(t);
  for (const mutate of [
    value => { value[0].verification.diff_review.status = 'pending'; },
    value => { value[1].status = 'candidate'; },
    value => { value[2].disposition.false_positive_reason = null; },
    value => { value[0].disposition.risk_acceptance = { approved_by: 'synthetic' }; },
    value => { value.push(value[0]); },
  ]) {
    const altered = structuredClone(findings);
    mutate(altered);
    fs.writeFileSync(path.join(directory, 'docs/security/FINDINGS.yaml'), JSON.stringify({ findings: altered }));
    assert.throws(() => verifyMinimatchSources(directory));
  }
});

test('same-version main and exports redirection fails despite unchanged patched dist files', t => {
  const { directory } = fixture(t);
  const projectRequire = createRequire(path.join(root, 'package.json'));
  const eslintRequire = createRequire(projectRequire.resolve('eslint/package.json'));
  const installed = path.dirname(eslintRequire.resolve('minimatch/package.json'));
  fs.unlinkSync(path.join(directory, 'node_modules'));
  const copied = path.join(directory, 'node_modules/.pnpm/minimatch@10.2.5_patch_hash=rwmddqc37tufv6xtc4b7vpdhia/node_modules/minimatch');
  fs.cpSync(installed, copied, { recursive: true });
  const eslint = path.join(directory, 'node_modules/eslint');
  fs.mkdirSync(path.join(eslint, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(eslint, 'package.json'), JSON.stringify({ name: 'eslint', version: '10.8.0', main: 'index.js' }));
  fs.symlinkSync(copied, path.join(eslint, 'node_modules/minimatch'));
  const minimatchRequire = createRequire(path.join(installed, 'package.json'));
  fs.symlinkSync(path.dirname(minimatchRequire.resolve('brace-expansion/package.json')), path.join(directory, 'node_modules/brace-expansion'));
  assert.doesNotThrow(() => verifyMinimatchSources(directory));
  const manifestFile = path.join(copied, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile));
  manifest.main = './redirect.cjs';
  manifest.exports['.'].require.default = './redirect.cjs';
  fs.writeFileSync(path.join(copied, 'redirect.cjs'), 'module.exports = {};\n');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  assert.throws(() => verifyMinimatchSources(directory));
});

test('CI revalidates both reports and retains raw findings even if a status file claims success', async t => {
  const { collect } = await import('../ci-evidence.mjs');
  for (const forged of [false, true]) {
    const { directory, reports } = fixture(t);
    const put = (name, value) => {
      const target = path.join(directory, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
    };
    put('.gitleaks.toml', 'title = "synthetic"\n');
    const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git('init', '-q');
    git('add', 'package.json', 'apps/web/package.json', 'pnpm-lock.yaml', '.gitleaks.toml',
      'patches/minimatch@10.2.5.patch', 'scripts/security/tests/minimatch-globparts.test.mjs', 'docs/security/FINDINGS.yaml');
    git('-c', 'user.name=CI regression', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'synthetic minimatch fixture');
    put('reports/ci-private/security-source/metadata.json', {
      identity: { sourceCommit: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD^{tree}'), release: 'ci-123-1', buildTime: '2026-11-03T00:00:00Z' },
      lockfileSha256: createHash('sha256').update(fs.readFileSync(path.join(directory, 'pnpm-lock.yaml'))).digest('hex'),
      job: 'security-source', runId: '123', runAttempt: '1', observedAt: '2026-11-03T00:00:00Z', platformAllowed: true, sourceWorktreeClean: true,
    });
    for (const kind of ['current', 'history']) {
      put(`reports/security/secrets/gitleaks-${kind}.json`, []);
      put(`reports/security/secrets/gitleaks-${kind}.status`, 'PASS');
    }
    put('reports/security/sast/semgrep.json', { results: [], errors: [], version: '1.169.0' });
    put('reports/security/sast/semgrep.status', 'PASS');
    for (const name of ['pnpm-audit-all.json', 'pnpm-audit.json', 'pnpm-audit-all.exit-code', 'pnpm-audit.exit-code']) {
      put(`reports/security/sca/${name}`, fs.readFileSync(path.join(reports, name), 'utf8'));
    }
    put('reports/security/sca/pnpm-audit-all.status', 'FAIL');
    put('reports/security/sca/pnpm-audit.status', 'FAIL');
    put('reports/security/sca/minimatch-applicability.json', { status: 'LOCALLY_REMEDIATED', rawAdvisoryCount: 0 });
    if (forged) fs.appendFileSync(path.join(directory, 'patches/minimatch@10.2.5.patch'), '\n');
    const result = collect(directory, 'security-source', { secrets: { outcome: 'success' }, sast: { outcome: 'success' }, sca: { outcome: 'success' } }, () => null);
    assert.equal(result.complete, !forged);
    for (const [name, verifiedState] of [['sca-all', 'FINDINGS_LOCALLY_REMEDIATED'], ['sca-production', 'FINDINGS_VERIFIED_NOT_APPLICABLE']]) {
      const published = JSON.parse(fs.readFileSync(path.join(directory, `reports/ci-public/security-source/${name}.json`)));
      assert.equal(published.state, forged ? 'FINDINGS' : verifiedState);
      assert.equal(published.scannerStatus, 'FAIL');
      assert.equal(published.findingCount, 1);
      assert.equal(published.findings[0].severity, 'MEDIUM');
    }
  }
});
