import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { collect, initialize, projectReport, publicFiles, readBounded } from '../ci-evidence.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const collector = path.join(repoRoot, 'scripts/security/ci-evidence.mjs');
const secret = 'ghp_' + 'x'.repeat(36); // Generated synthetic marker, never a usable credential.
const sourceSteps = { secrets: { outcome: 'success' }, sast: { outcome: 'success' }, sca: { outcome: 'success' } };
const audit = (advisories = {}) => ({ advisories, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: Object.keys(advisories).length } } });
function put(root, name, value) {
  const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
}
function fixture(t, job = 'security-source') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-evidence-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  put(root, 'apps/api/src/example.ts', 'export const example = 1;\n');
  put(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  put(root, '.gitleaks.toml', 'title = "synthetic"\n');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q'); git('add', 'apps/api/src/example.ts', 'pnpm-lock.yaml', '.gitleaks.toml');
  git('-c', 'user.name=CI evidence fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'synthetic evidence');
  const meta = { identity: { sourceCommit: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD^{tree}'), release: 'ci-123-1', buildTime: '2026-09-08T00:00:00Z' }, lockfileSha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'pnpm-lock.yaml'))).digest('hex'), job, runId: '123', runAttempt: '1', observedAt: '2026-09-08T00:00:00Z', platformAllowed: true, sourceWorktreeClean: true, buildPlatform: 'linux/amd64', runner: { os: 'linux', architecture: 'x64', kernel: 'synthetic', environment: 'github-hosted', imageOS: 'ubuntu24', imageVersion: 'synthetic' }, docker: { platform: 'linux/amd64', serverVersion: '28.0.0' }, nodeVersion: 'v24.14.0', pnpmVersion: '9.15.4', unsafe: secret };
  put(root, `reports/ci-private/${job}/metadata.json`, meta);
  return { root, meta, git };
}
function sourceReports(root) {
  for (const name of ['current', 'history']) { put(root, `reports/security/secrets/gitleaks-${name}.json`, []); put(root, `reports/security/secrets/gitleaks-${name}.status`, 'PASS'); }
  put(root, 'reports/security/sast/semgrep.json', { version: '1.169.0', results: [], errors: [] }); put(root, 'reports/security/sast/semgrep.status', 'PASS');
  for (const name of ['pnpm-audit', 'pnpm-audit-all']) { put(root, `reports/security/sca/${name}.json`, audit()); put(root, `reports/security/sca/${name}.status`, 'PASS'); }
}
const noProbe = () => null;
function output(root, job, name) { return JSON.parse(fs.readFileSync(path.join(root, `reports/ci-public/${job}/${name}.json`))); }

test('success keeps a closed file list and excludes unrelated secrets, backups and arbitrary metadata', (t) => {
  const { root } = fixture(t); sourceReports(root);
  put(root, '.env', secret); put(root, 'reports/security/secret-dump.json', { secret }); put(root, 'backups/database.dump', secret);
  assert.equal(collect(root, 'security-source', sourceSteps, noProbe).complete, true);
  const dir = path.join(root, 'reports/ci-public/security-source');
  assert.deepEqual(fs.readdirSync(dir).sort(), publicFiles('security-source').sort());
  const text = fs.readdirSync(dir).map((n) => fs.readFileSync(path.join(dir, n), 'utf8')).join('');
  assert.equal(text.includes(secret), false);
  assert.equal(output(root, 'security-source', 'metadata').releaseReadiness, 'NOT_ESTABLISHED');
  assert.equal(output(root, 'security-source', 'metadata').rules.semgrepEffectiveRulesSha256, null);
  assert.equal(output(root, 'security-source', 'metadata').databaseTests.execution, 'NOT_VERIFIED_BY_THIS_ARTIFACT');
});

test('redaction preserves every Gitleaks/Semgrep finding but excludes snippets, secret values, author and internal URLs', () => {
  const tracked = new Set(['apps/api/src/example.ts']);
  const result = projectReport('gitleaks', [{ RuleID: 'generic-api-key', File: 'apps/api/src/example.ts', StartLine: 12, Secret: secret, Match: secret, Author: 'private person', Email: 'private@example.invalid' }, { RuleID: secret, File: '/private/secret.env', StartLine: 1 }], tracked);
  assert.equal(result.findings.length, 2); assert.equal(result.findings[0].line, 12); assert.equal(result.findings[1].file, '[REDACTED]');
  assert.equal(JSON.stringify(result).includes(secret), false);
  const semgrep = projectReport('semgrep', { results: [{ check_id: 'test.rule', path: 'apps/api/src/example.ts', start: { line: 4 }, extra: { severity: 'WARNING', message: secret, lines: secret, metadata: { severity: 'HIGH', url: 'http://internal.invalid/a' } } }], errors: [{ message: secret }], version: '1.169.0' }, tracked);
  assert.equal(semgrep.findings.length, 1); assert.equal(semgrep.toolErrors, 1); assert.equal(semgrep.findings[0].metadataSeverity, 'HIGH'); assert.equal(JSON.stringify(semgrep).includes(secret), false);
});

test('SCA and Trivy preserve advisories, severity counts and occurrence counts without full dependency paths or image environment', () => {
  const a = audit({ 42: { id: 42, module_name: 'example', github_advisory_id: 'GHSA-aaaa-bbbb-cccc', severity: 'critical', vulnerable_versions: '<2.0.0', patched_versions: '>=2.0.0', findings: [{ version: '1.0.0', paths: [secret, 'a>b'] }], overview: secret, title: secret } });
  const r = projectReport('audit', a); assert.equal(r.findings.length, 1); assert.equal(r.advisoryCounts.critical, 1); assert.equal(r.findings[0].occurrences[0].dependencyPathCount, 2); assert.equal(JSON.stringify(r).includes(secret), false);
  const trivy = projectReport('trivy', { Metadata: { ImageConfig: { config: { Env: [secret] } } }, Results: [{ Target: 'private-host', Vulnerabilities: [{ VulnerabilityID: 'CVE-2026-0001', PkgName: 'example', InstalledVersion: '1.0.0', FixedVersion: '2.0.0', Severity: 'HIGH', Description: secret }] }] });
  assert.equal(trivy.findings.length, 1); assert.equal(JSON.stringify(trivy).includes(secret), false);
});

test('findings remain findings on failure and the collector still emits reviewable files', (t) => {
  const { root } = fixture(t); sourceReports(root);
  put(root, 'reports/security/secrets/gitleaks-current.json', [{ RuleID: 'rule', File: 'apps/api/src/example.ts', StartLine: 1, Secret: secret }]); put(root, 'reports/security/secrets/gitleaks-current.status', 'BLOCKED');
  assert.equal(collect(root, 'security-source', { ...sourceSteps, secrets: { outcome: 'failure' } }, noProbe).complete, false);
  assert.equal(output(root, 'security-source', 'gitleaks-current').state, 'FINDINGS');
  assert.equal(output(root, 'security-source', 'gitleaks-current').findingCount, 1);
});

for (const [name, mutate, expected] of [
  ['missing', (r) => fs.unlinkSync(path.join(r, 'reports/security/sast/semgrep.json')), 'REPORT_MISSING'],
  ['invalid', (r) => put(r, 'reports/security/sast/semgrep.json', `{broken ${secret}`), 'TOOL_ERROR'],
  ['scanner error', (r) => put(r, 'reports/security/sast/semgrep.json', { results: [], errors: [{ message: secret }] }), 'TOOL_ERROR'],
  ['stale', (r) => fs.utimesSync(path.join(r, 'reports/security/sast/semgrep.json'), 1, 1), 'REPORT_MISSING'],
  ['invalid status', (r) => put(r, 'reports/security/sast/semgrep.status', 'unexpected'), 'TOOL_ERROR'],
]) test(`${name} cannot become a zero-finding PASS`, (t) => {
  const { root } = fixture(t); sourceReports(root); mutate(root);
  assert.equal(collect(root, 'security-source', sourceSteps, noProbe).complete, false);
  assert.equal(output(root, 'security-source', 'semgrep').state, expected);
});

test('skipped scanners do not consume stale report files', (t) => {
  const { root } = fixture(t); sourceReports(root);
  assert.equal(collect(root, 'security-source', { ...sourceSteps, sast: { outcome: 'skipped' } }, noProbe).complete, false);
  assert.equal(output(root, 'security-source', 'semgrep').state, 'NOT_EXECUTED'); assert.equal(output(root, 'security-source', 'semgrep').findingCount, null);
});

test('malformed scanner schemas fail instead of fabricating empty findings', () => {
  for (const [kind, raw] of [['gitleaks', {}], ['semgrep', { results: [] }], ['trivy', { Results: [{} , { Vulnerabilities: {} }] }], ['audit', { advisories: {}, metadata: { vulnerabilities: { critical: 1 } } }]]) assert.throws(() => projectReport(kind, raw));
});

test('path traversal, symlinks, hardlinks, oversized inputs, and stale public destinations are rejected', (t) => {
  const { root } = fixture(t); sourceReports(root);
  assert.throws(() => readBounded(root, '../.env'));
  const file = path.join(root, 'reports/security/sast/semgrep.json'); fs.unlinkSync(file); fs.symlinkSync(path.join(root, 'pnpm-lock.yaml'), file);
  assert.throws(() => collect(root, 'security-source', sourceSteps, noProbe), /Symlink/); assert.equal(fs.existsSync(path.join(root, 'reports/ci-public')), false);
  fs.unlinkSync(file); fs.linkSync(path.join(root, 'pnpm-lock.yaml'), file); assert.throws(() => readBounded(root, 'reports/security/sast/semgrep.json')); fs.unlinkSync(file);
  put(root, 'reports/security/sast/semgrep.json', ''); fs.truncateSync(file, 21 * 1024 * 1024); assert.throws(() => readBounded(root, 'reports/security/sast/semgrep.json'));
  sourceReports(root); collect(root, 'security-source', sourceSteps, noProbe); assert.throws(() => collect(root, 'security-source', sourceSteps, noProbe), /stale publication/);
});

test('changed lockfile and missing init cannot claim bound successful evidence', (t) => {
  const { root } = fixture(t); sourceReports(root); put(root, 'pnpm-lock.yaml', 'changed');
  assert.equal(collect(root, 'security-source', sourceSteps, noProbe).complete, false); assert.equal(output(root, 'security-source', 'metadata').identityState, 'INVALID');
});

test('init rejects unverified execution environment without invoking any scan or install', (t) => {
  const { root, meta } = fixture(t);
  fs.unlinkSync(path.join(root, 'reports/ci-private/security-source/metadata.json'));
  const calls = [];
  assert.throws(() => initialize(root, 'security-source', { GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: meta.identity.sourceCommit, CI_RUNNER_ENVIRONMENT: 'self-hosted' }, (cmd, args) => { calls.push([cmd, args]); return cmd === 'docker' ? 'linux/amd64 28.0.0' : '9.15.4'; }), /requires GitHub-hosted/);
  assert.deepEqual(calls.map(([c, a]) => [c, a[0]]), [['docker', 'info'], ['pnpm', '--version']]);
});

test('CLI missing evidence exits nonzero but sets ready only after writing safe artifacts', (t) => {
  const { root } = fixture(t); const outputFile = path.join(root, 'github-output');
  const r = spawnSync(process.execPath, [collector, 'collect', 'security-source'], { cwd: root, encoding: 'utf8', env: { ...process.env, CI_STEP_RESULTS: JSON.stringify(sourceSteps), GITHUB_OUTPUT: outputFile } });
  assert.equal(r.status, 1); assert.equal(fs.readFileSync(outputFile, 'utf8'), 'ready=true\n');
  assert.equal(fs.readdirSync(path.join(root, 'reports/ci-public/security-source')).length, 7);
});

test('SCA script retains failure and separates parseable JSON from stderr using synthetic pnpm only', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-audit-script-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
  put(root, 'bin/pnpm', '#!/bin/sh\nprintf \'{"advisories":{},"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0}}}\\n\'\nprintf \'synthetic tool stderr\\n\' >&2\nexit 42\n'); fs.chmodSync(path.join(bin, 'pnpm'), 0o755);
  const report = path.join(root, 'reports');
  const r = spawnSync('bash', [path.join(repoRoot, 'scripts/security/run-sca.sh')], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SECURITY_REPORT_DIR: report, SCA_DOC_REPORT: path.join(root, 'sca.md') } });
  assert.equal(r.status, 1); assert.equal(fs.readFileSync(path.join(report, 'pnpm-audit.status'), 'utf8'), 'FAIL'); assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(report, 'pnpm-audit.json'))));
});

test('workflow pins uploads, uses exact output paths and retains failure and push boundaries', () => {
  const yaml = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
  assert.equal((yaml.match(/docker build --platform linux\/amd64/g) ?? []).length, 2);
  assert.equal((yaml.match(/uses: actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/g) ?? []).length, 2);
  assert.equal((yaml.match(/retention-days: 7/g) ?? []).length, 2);
  assert.equal((yaml.match(/steps\.evidence\.outputs\.ready == 'true'/g) ?? []).length, 2);
  assert.equal((yaml.match(/include-hidden-files: false/g) ?? []).length, 2);
  assert.equal((yaml.match(/if-no-files-found: error/g) ?? []).length, 2);
  assert.match(yaml, /permissions:\n  contents: read/);
  assert.match(yaml, /if: github.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(yaml, /continue-on-error|\|\| true|docker push|id-token:|security-events:|packages:|workflow_run:|repository_dispatch:/);
  for (const job of Object.keys({ verify: 1, 'security-source': 1 })) {
    const paths = [...yaml.matchAll(new RegExp(`^            (reports/ci-public/${job}/.+)$`, 'gm'))].map((m) => m[1]);
    assert.deepEqual(paths.sort(), publicFiles(job).map((n) => `reports/ci-public/${job}/${n}`).sort());
  }
});


test('Semgrep projection retains numeric and named security severity signals used by the existing evaluator', () => {
  const results = [
    { extra: { severity: 'INFO', metadata: { 'security-severity': '9.8' } } },
    { extra: { severity: 'WARNING', metadata: { security_severity: 'HIGH' } } },
    { extra: { severity: 'LOW', metadata: { 'security-severity': '3.2' } } },
  ];
  const projected = projectReport('semgrep', { results, errors: [] });
  assert.deepEqual(projected.findings.map((f) => f.effectiveSeverity), ['CRITICAL', 'HIGH', 'LOW']);
  assert.equal(projected.findings[0].securitySeveritySignal, 'CRITICAL');
  assert.equal(projected.findings[1].securitySeverityUnderscoreSignal, 'HIGH');
});

test('verify collects both image results and only allowlisted Trivy version/DB fields', (t) => {
  const { root } = fixture(t, 'verify');
  put(root, 'reports/security/production-build/eval-source-map-check.txt', 'PASS: completed production build contains no development eval-source-map markers.\n');
  for (const n of [1, 2]) {
    put(root, `reports/security/image-sca/image-${n}.json`, { Results: [{ Vulnerabilities: [] }] });
    put(root, `reports/security/image-sca/image-${n}.status`, 'PASS');
  }
  put(root, 'scripts/security/scan-production-images.sh', 'TRIVY_IMAGE_DEFAULT="ghcr.io/example/tool:1.0.0@sha256:' + 'a'.repeat(64) + '"');
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args]);
    return args[0] === 'volume' ? 'feishu-timeline-trivy-cache' : JSON.stringify({ Version: '0.72.0', VulnerabilityDB: { UpdatedAt: '2026-09-08T00:00:00Z', NextUpdate: '2026-09-09T00:00:00Z', DownloadedAt: '2026-09-08T00:05:00Z', Secret: secret }, Secret: secret });
  };
  assert.equal(collect(root, 'verify', { production_build: { outcome: 'success' }, images: { outcome: 'success' } }, run).complete, true);
  assert.equal(calls.length, 2); assert.equal(calls[1][1].includes('--pull=never'), true); assert.equal(calls[1][1].includes('--network=none'), true);
  const m = output(root, 'verify', 'metadata'); assert.equal(m.tools.trivy.observedVersion, '0.72.0'); assert.equal(m.tools.trivy.databaseAtCollection.updatedAt, '2026-09-08T00:00:00Z'); assert.equal(m.tools.trivy.databasePerImage, 'NOT_CAPTURED'); assert.equal(JSON.stringify(m).includes(secret), false);
  assert.equal(fs.readdirSync(path.join(root, 'reports/ci-public/verify')).length, 5);
});

test('CLI unsafe source never emits ready, even if it can produce some other reports', (t) => {
  const { root } = fixture(t); sourceReports(root);
  const file = path.join(root, 'reports/security/sast/semgrep.json'); fs.unlinkSync(file); fs.symlinkSync(path.join(root, 'pnpm-lock.yaml'), file);
  const out = path.join(root, 'github-output');
  const r = spawnSync(process.execPath, [collector, 'collect', 'security-source'], { cwd: root, encoding: 'utf8', env: { ...process.env, CI_STEP_RESULTS: JSON.stringify(sourceSteps), GITHUB_OUTPUT: out } });
  assert.equal(r.status, 1); assert.equal(fs.existsSync(out), false); assert.equal(fs.existsSync(path.join(root, 'reports/ci-public')), false);
});
