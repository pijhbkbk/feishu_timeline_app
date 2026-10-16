#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validateBuildIdentity } from '../deploy/release-identity.mjs';

const MAX_BYTES = 20 * 1024 * 1024;
const REDACTED = '[REDACTED]';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const timestamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const severity = (v) => ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO', 'WARNING', 'ERROR', 'UNKNOWN'].includes(String(v).toUpperCase()) ? String(v).toUpperCase() : 'UNKNOWN';
const numeric = (v) => Number.isSafeInteger(v) && v >= 0 ? v : null;
const version = (v) => typeof v === 'string' && /^v?\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(v.trim()) ? v.trim() : null;
const isoTime = (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;
export const safeLabel = (v) => typeof v === 'string' && v.length <= 180 && /^[a-zA-Z0-9@_./+^~<>=|* -]+$/.test(v) && !/(?:gh[pousr]_|github_pat_|AKIA|ASIA|Bearer|password|cookie|token=|secret=|-----BEGIN)/i.test(v) ? v : REDACTED;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const outcome = (v) => ['success', 'failure', 'cancelled', 'skipped'].includes(v) ? v : 'unknown';

export const REPORTS = Object.freeze({
  verify: [
    { name: 'production-build', step: 'production_build', input: 'production-build/eval-source-map-check.txt', type: 'build' },
    { name: 'image-api', step: 'images', input: 'image-sca/image-1.json', status: 'image-sca/image-1.status', type: 'trivy' },
    { name: 'image-web', step: 'images', input: 'image-sca/image-2.json', status: 'image-sca/image-2.status', type: 'trivy' },
  ],
  'security-source': [
    { name: 'gitleaks-current', step: 'secrets', input: 'secrets/gitleaks-current.json', status: 'secrets/gitleaks-current.status', type: 'gitleaks' },
    { name: 'gitleaks-history', step: 'secrets', input: 'secrets/gitleaks-history.json', status: 'secrets/gitleaks-history.status', type: 'gitleaks' },
    { name: 'semgrep', step: 'sast', input: 'sast/semgrep.json', status: 'sast/semgrep.status', type: 'semgrep' },
    { name: 'sca-all', step: 'sca', input: 'sca/pnpm-audit-all.json', status: 'sca/pnpm-audit-all.status', type: 'audit' },
    { name: 'sca-production', step: 'sca', input: 'sca/pnpm-audit.json', status: 'sca/pnpm-audit.status', type: 'audit' },
  ],
});
const STEP_IDS = ['checkout', 'pnpm', 'node', 'evidence_init', 'install', 'lint', 'typecheck', 'tests', 'web_build', 'production_build', 'api_build', 'prisma', 'compose', 'api_image', 'web_image', 'images', 'security_gates', 'secrets', 'sast', 'sca'];
export function publicFiles(job) {
  assert(REPORTS[job], 'Unknown evidence job');
  return ['metadata.json', 'checks.json', ...REPORTS[job].map((r) => `${r.name}.json`)];
}

// No globbing, symlink traversal, hard links, FIFOs, or unrestricted log copies.
function checkedPath(root, relative) {
  assert(!path.isAbsolute(relative) && relative.split('/').every((p) => p && p !== '.' && p !== '..'), 'Unsafe evidence path');
  let cursor = fs.realpathSync(root);
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor) || (() => { try { return fs.lstatSync(cursor).isSymbolicLink(); } catch { return false; } })()) {
      assert(!fs.lstatSync(cursor).isSymbolicLink(), 'Symlink evidence rejected');
    }
  }
  return cursor;
}
export function readBounded(root, relative) {
  const target = checkedPath(root, relative);
  let fd;
  try {
    fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const st = fs.fstatSync(fd);
    assert(st.isFile() && st.nlink === 1 && st.size <= MAX_BYTES, 'Unsafe or oversized evidence input');
    return { data: fs.readFileSync(fd), modifiedAt: st.mtime.toISOString() };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function writeJson(root, relative, value) {
  const target = checkedPath(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}
function probe(command, args, root) {
  const r = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: MAX_BYTES, stdio: ['ignore', 'pipe', 'pipe'] });
  return r.status === 0 ? r.stdout.trim() : null; // Never expose diagnostic stderr/arguments or ambient env.
}
function git(root, ...args) {
  const value = probe('git', args, root);
  assert(value !== null, 'Git identity unavailable');
  return value;
}
function decimal(v) { return typeof v === 'string' && /^\d{1,20}$/.test(v) ? v : null; }
function dockerPlatform(value) {
  const match = /^(linux)\/(amd64|x86_64) ([\d.]+)$/.exec(value ?? '');
  return match ? { platform: 'linux/amd64', serverVersion: match[3] } : { platform: null, serverVersion: null };
}
export function initialize(root, job, env = process.env, run = probe) {
  publicFiles(job);
  const sourceCommit = git(root, 'rev-parse', 'HEAD');
  const sourceTree = git(root, 'rev-parse', 'HEAD^{tree}');
  assert(decimal(env.GITHUB_RUN_ID) && decimal(env.GITHUB_RUN_ATTEMPT), 'Missing CI run identity');
  assert(env.GITHUB_SHA === sourceCommit, 'Checkout does not match event SHA');
  const identity = validateBuildIdentity({ sourceCommit, sourceTree, release: `ci-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`, buildTime: timestamp() });
  const lock = readBounded(root, 'pnpm-lock.yaml');
  assert(lock, 'Lockfile unavailable');
  const docker = dockerPlatform(run('docker', ['info', '--format', '{{.OSType}}/{{.Architecture}} {{.ServerVersion}}'], root));
  const sourceWorktreeClean = git(root, 'status', '--porcelain', '--untracked-files=no') === '';
  const allowed = sourceWorktreeClean && process.platform === 'linux' && process.arch === 'x64' && env.CI_RUNNER_ENVIRONMENT === 'github-hosted' && docker.platform === 'linux/amd64';
  const metadata = {
    identity, lockfileSha256: sha256(lock.data), job, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
    observedAt: timestamp(), platformAllowed: allowed, sourceWorktreeClean,
    runner: { os: process.platform, architecture: process.arch, kernel: safeLabel(os.release()), environment: env.CI_RUNNER_ENVIRONMENT === 'github-hosted' ? 'github-hosted' : 'unverified', imageOS: safeLabel(env.ImageOS), imageVersion: safeLabel(env.ImageVersion) },
    buildPlatform: 'linux/amd64', docker, nodeVersion: process.version, pnpmVersion: version(run('pnpm', ['--version'], root)),
    databaseTests: { execution: 'NOT_VERIFIED_BY_THIS_ARTIFACT', provisionedByWorkflow: false },
  };
  writeJson(root, `reports/ci-private/${job}/metadata.json`, metadata);
  if (env.GITHUB_ENV) {
    fs.appendFileSync(env.GITHUB_ENV, Object.entries({ BUILD_SOURCE_COMMIT: sourceCommit, BUILD_SOURCE_TREE: sourceTree, BUILD_RELEASE: identity.release, BUILD_TIME: identity.buildTime }).map(([k, v]) => `${k}=${v}\n`).join(''));
  }
  assert(allowed, 'CI evidence requires GitHub-hosted Linux x64 and a linux/amd64 Docker daemon');
  return metadata;
}

// Match the existing Semgrep evaluator, including metadata score signals.
function semgrepSeverities(finding) {
  const score = (value) => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n >= 9 ? 'CRITICAL' : n >= 7 ? 'HIGH' : null : severity(value);
  };
  const fields = { severity: severity(finding.extra?.severity), metadataSeverity: severity(finding.extra?.metadata?.severity), securitySeveritySignal: score(finding.extra?.metadata?.['security-severity']), securitySeverityUnderscoreSignal: score(finding.extra?.metadata?.security_severity) };
  const rank = { CRITICAL: 6, HIGH: 5, ERROR: 4, MEDIUM: 3, WARNING: 3, LOW: 2, INFO: 1 };
  fields.effectiveSeverity = Object.values(fields).reduce((a, b) => (rank[b] ?? 0) > (rank[a] ?? 0) ? b : a, 'INFO');
  return fields;
}
function fileLocation(value, tracked) {
  return typeof value === 'string' && tracked.has(value) && !/(^|\/)(\.env(?:\.|$)|test-results|reports|node_modules)|\.(pem|key|dump|sql)$/i.test(value) && safeLabel(value) !== REDACTED ? value : REDACTED;
}
export function projectReport(type, raw, tracked = new Set()) {
  const location = (f, l) => ({ file: fileLocation(f, tracked), line: numeric(l) });
  if (type === 'gitleaks') {
    assert(Array.isArray(raw) && raw.every(object), 'Invalid Gitleaks report');
    return { findings: raw.map((f) => ({ ruleId: safeLabel(f.RuleID), ...location(f.File, f.StartLine), commit: /^[a-f0-9]{40}$/.test(f.Commit ?? '') ? f.Commit : null })), toolErrors: 0 };
  }
  if (type === 'semgrep') {
    assert(object(raw) && Array.isArray(raw.results) && raw.results.every(object) && Array.isArray(raw.errors), 'Invalid Semgrep report');
    return { findings: raw.results.map((f) => ({ ruleId: safeLabel(f.check_id), ...location(f.path, f.start?.line), ...semgrepSeverities(f) })), toolErrors: raw.errors.length, scannerVersion: version(raw.version) };
  }
  if (type === 'trivy') {
    assert(object(raw) && Array.isArray(raw.Results) && raw.Results.every(object), 'Invalid Trivy report');
    const findings = [];
    raw.Results.forEach((result, targetIndex) => {
      assert(result.Vulnerabilities == null || Array.isArray(result.Vulnerabilities), 'Invalid Trivy findings');
      for (const f of result.Vulnerabilities ?? []) {
        assert(object(f), 'Invalid Trivy finding');
        findings.push({ targetIndex, vulnerabilityId: safeLabel(f.VulnerabilityID), package: safeLabel(f.PkgName), installedVersion: safeLabel(f.InstalledVersion), fixedVersion: f.FixedVersion == null ? null : safeLabel(f.FixedVersion), severity: severity(f.Severity) });
      }
    });
    return { findings, toolErrors: 0, targetCount: raw.Results.length };
  }
  assert(type === 'audit' && object(raw) && !raw.error && object(raw.advisories) && object(raw.metadata?.vulnerabilities), 'Invalid pnpm audit report');
  const advisoryCounts = Object.fromEntries(['info', 'low', 'moderate', 'high', 'critical'].map((key) => {
    assert(numeric(raw.metadata.vulnerabilities[key]) !== null, 'Missing audit vulnerability counts');
    return [key, raw.metadata.vulnerabilities[key]];
  }));
  const findings = Object.values(raw.advisories).map((f) => {
    assert(object(f) && Array.isArray(f.findings), 'Invalid audit advisory');
    return { advisoryId: numeric(f.id), githubAdvisoryId: safeLabel(f.github_advisory_id), package: safeLabel(f.module_name), severity: f.severity === 'moderate' ? 'MEDIUM' : severity(f.severity), vulnerableVersions: safeLabel(f.vulnerable_versions), patchedVersions: f.patched_versions == null ? null : safeLabel(f.patched_versions), occurrences: f.findings.map((item) => {
      assert(object(item) && Array.isArray(item.paths), 'Invalid audit occurrence');
      return { version: safeLabel(item.version), dependencyPathCount: item.paths.length };
    }) };
  });
  assert(findings.length > 0 || Object.values(advisoryCounts).every((n) => n === 0), 'Missing audit findings');
  return { findings, toolErrors: 0, advisoryCounts };
}
function collectOne(root, descriptor, step, tracked, initializedAt) {
  const result = { check: descriptor.name, stepOutcome: step, state: 'NOT_EXECUTED', reportPresence: 'NOT_READ', findingCount: null, findings: null, representation: 'REDACTED_FIELD_PROJECTION', omitted: ['source snippets', 'secret values', 'authors', 'free-text messages', 'URLs', 'dependency paths', 'unlisted fields'] };
  if (step === 'skipped' || step === 'unknown') return result;
  const input = readBounded(root, `reports/security/${descriptor.input}`);
  if (!input) return { ...result, state: 'REPORT_MISSING', reportPresence: 'MISSING' };
  if (initializedAt && Date.parse(input.modifiedAt) < Date.parse(initializedAt)) return { ...result, state: 'REPORT_MISSING', reportPresence: 'STALE' };
  Object.assign(result, { reportPresence: 'PRESENT', rawReportSha256: sha256(input.data), reportModifiedAt: input.modifiedAt });
  if (descriptor.type === 'build') {
    result.state = step === 'success' && input.data.toString().trim() === 'PASS: completed production build contains no development eval-source-map markers.' ? 'PASS' : 'CHECK_FAILED';
    return result;
  }
  try {
    const parsed = projectReport(descriptor.type, JSON.parse(input.data.toString()), tracked);
    const rawStatus = readBounded(root, `reports/security/${descriptor.status}`)?.data.toString().trim();
    result.findings = parsed.findings;
    result.findingCount = parsed.findings.length;
    result.toolErrors = parsed.toolErrors;
    if (parsed.advisoryCounts) result.advisoryCounts = parsed.advisoryCounts;
    if (parsed.scannerVersion) result.scannerVersion = parsed.scannerVersion;
    result.scannerStatus = ['PASS', 'BLOCKED', 'TOOL_ERROR', 'FAIL'].includes(rawStatus) ? rawStatus : 'MISSING_OR_INVALID';
    result.state = parsed.toolErrors || result.scannerStatus === 'TOOL_ERROR' || result.scannerStatus === 'MISSING_OR_INVALID' ? 'TOOL_ERROR' : result.findingCount > 0 ? 'FINDINGS' : rawStatus === 'PASS' ? 'PASS' : 'TOOL_ERROR';
    if (step === 'success' && result.state !== 'PASS') result.inconsistentWithStep = true;
  } catch { result.state = 'TOOL_ERROR'; result.reportPresence = 'INVALID'; }
  return result;
}

function toolImage(root, script, variable) {
  const text = readBounded(root, script)?.data.toString() ?? '';
  const match = text.match(new RegExp(`${variable}_DEFAULT="([a-z0-9./:-]+@sha256:[a-f0-9]{64})"`));
  return match?.[1] ?? null;
}
function toolObservations(root, job, steps, run) {
  const tools = {};
  for (const [name, script, variable, step, args] of [
    ['gitleaks', 'scripts/security/run-secrets-scan.sh', 'GITLEAKS_IMAGE', 'secrets', ['version']],
    ['semgrep', 'scripts/security/run-sast.sh', 'SEMGREP_IMAGE', 'sast', ['semgrep', '--version']],
    ['trivy', 'scripts/security/scan-production-images.sh', 'TRIVY_IMAGE', 'images', ['version', '--format', 'json']],
  ]) {
    if ((job === 'verify') !== (name === 'trivy')) continue;
    const image = toolImage(root, script, variable);
    const ran = ['success', 'failure'].includes(steps[step]);
    let raw = null;
    if (image && ran && (name !== 'trivy' || run('docker', ['volume', 'inspect', '--format', '{{.Name}}', 'feishu-timeline-trivy-cache'], root) === 'feishu-timeline-trivy-cache')) {
      raw = run('docker', ['run', '--rm', '--pull=never', '--network=none', ...(name === 'trivy' ? ['--volume', 'feishu-timeline-trivy-cache:/root/.cache/trivy:ro'] : []), image, ...args], root);
    }
    tools[name] = { declaredImage: image, observedVersion: name === 'trivy' ? null : version(raw), observationScope: 'POST_STEP_VERSION_PROBE_NO_NETWORK', observedAt: timestamp() };
    if (name === 'trivy') {
      let info;
      try { info = JSON.parse(raw); } catch { info = null; }
      tools[name].observedVersion = version(info?.Version);
      tools[name].databaseAtCollection = { updatedAt: isoTime(info?.VulnerabilityDB?.UpdatedAt), nextUpdate: isoTime(info?.VulnerabilityDB?.NextUpdate), downloadedAt: isoTime(info?.VulnerabilityDB?.DownloadedAt) };
      tools[name].databasePerImage = 'NOT_CAPTURED';
      tools[name].freshnessDecision = 'NOT_EVALUATED_NO_APPROVED_MAX_AGE';
    }
  }
  return tools;
}
function readMetadata(root, job) {
  const input = readBounded(root, `reports/ci-private/${job}/metadata.json`);
  if (!input) return { identityState: 'MISSING' };
  try {
    const m = JSON.parse(input.data);
    const identity = validateBuildIdentity(m.identity);
    assert(identity.sourceCommit === git(root, 'rev-parse', 'HEAD') && identity.sourceTree === git(root, 'rev-parse', 'HEAD^{tree}'), 'Identity mismatch');
    assert(m.lockfileSha256 === sha256(readBounded(root, 'pnpm-lock.yaml').data), 'Lockfile changed');
    // Re-project even our own intermediate file. Never publish arbitrary JSON keys.
    return { identityState: 'PRESENT', identity, lockfileSha256: m.lockfileSha256, job, runId: decimal(m.runId), runAttempt: decimal(m.runAttempt), initializedAt: isoTime(m.observedAt), platformAllowed: m.platformAllowed === true, sourceWorktreeClean: m.sourceWorktreeClean === true,
      runner: { os: safeLabel(m.runner?.os), architecture: safeLabel(m.runner?.architecture), kernel: safeLabel(m.runner?.kernel), environment: m.runner?.environment === 'github-hosted' ? 'github-hosted' : 'unverified', imageOS: safeLabel(m.runner?.imageOS), imageVersion: safeLabel(m.runner?.imageVersion) },
      buildPlatform: m.buildPlatform === 'linux/amd64' ? m.buildPlatform : null, docker: { platform: m.docker?.platform === 'linux/amd64' ? m.docker.platform : null, serverVersion: version(m.docker?.serverVersion) }, nodeVersion: version(m.nodeVersion), pnpmVersion: version(m.pnpmVersion), databaseTests: { execution: 'NOT_VERIFIED_BY_THIS_ARTIFACT', provisionedByWorkflow: false } };
  } catch { return { identityState: 'INVALID' }; }
}
export function collect(root, job, rawSteps, run = probe) {
  const files = publicFiles(job);
  const steps = Object.fromEntries(STEP_IDS.filter((id) => Object.hasOwn(rawSteps, id)).map((id) => [id, outcome(rawSteps[id]?.outcome)]));
  const target = checkedPath(root, `reports/ci-public/${job}`);
  assert(!fs.existsSync(target), 'Refusing stale publication directory');
  const tracked = new Set(git(root, 'ls-files', '-z').split('\0'));
  // Validate/read every allowlisted input before creating any uploadable output.
  const identityMetadata = readMetadata(root, job);
  const reports = REPORTS[job].map((d) => collectOne(root, d, steps[d.step] ?? 'unknown', tracked, identityMetadata.initializedAt));
  const metadata = { ...identityMetadata, collectedAt: timestamp(), tools: toolObservations(root, job, steps, run), releaseReadiness: 'NOT_ESTABLISHED' };
  if (job === 'security-source') {
    const config = readBounded(root, '.gitleaks.toml');
    metadata.rules = { gitleaksConfigSha256: config ? sha256(config.data) : null, semgrepSources: ['p/owasp-top-ten', 'p/javascript', 'p/typescript'], semgrepEffectiveRulesSha256: null, semgrepRuleEvidence: 'MISSING_DYNAMIC_RULE_CONTENT_NOT_EXPOSED_BY_SCAN_JSON' };
  }
  metadata.evidenceGaps = Object.entries(metadata.tools).filter(([, t]) => !t.observedVersion).map(([name]) => `${name}: observed version unavailable`);
  if (job === 'security-source') metadata.evidenceGaps.push('Semgrep effective dynamic rule content digest unavailable');
  if (job === 'verify') metadata.evidenceGaps.push('Per-image DB identity and approved freshness policy unavailable');
  const complete = metadata.identityState === 'PRESENT' && metadata.sourceWorktreeClean && metadata.platformAllowed && reports.every((r) => r.state === 'PASS') && !Object.values(steps).some((s) => ['failure', 'cancelled'].includes(s));
  const checks = { job, steps, collectedChecksPassed: Boolean(complete), uploadMeansScanPassed: false, reports: reports.map((r) => ({ check: r.check, state: r.state, reportPresence: r.reportPresence, findingCount: r.findingCount })), uploadedFiles: files, retentionDaysRequested: 7, visibility: 'PUBLIC_REPOSITORY_ARTIFACT_NOT_PRIVATE_STORAGE' };
  writeJson(root, `reports/ci-public/${job}/metadata.json`, metadata);
  writeJson(root, `reports/ci-public/${job}/checks.json`, checks);
  reports.forEach((r) => writeJson(root, `reports/ci-public/${job}/${r.check}.json`, r));
  return { complete: Boolean(complete), directory: target };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command, job] = process.argv.slice(2);
    const root = process.cwd();
    if (command === 'init') initialize(root, job);
    else {
      assert(command === 'collect', 'Expected init or collect');
      const steps = JSON.parse(process.env.CI_STEP_RESULTS ?? '{}');
      assert(object(steps), 'Invalid step results');
      const result = collect(root, job, steps);
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'ready=true\n');
      if (!result.complete) process.exitCode = 1;
    }
  } catch {
    // Do not print potentially sensitive parser errors, filenames, env, or tool output.
    process.stderr.write('CI evidence failed validation; no publication-ready signal was emitted.\n');
    process.exitCode = 1;
  }
}
