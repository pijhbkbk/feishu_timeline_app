import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('reviewed integrity exceptions keep changed values, new credentials and other paths blocking', { timeout: 120_000 }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'integrity-allowlist-'));
  try {
    const relative = 'scripts/deploy/gce-host/build_native_r28_patch_bundle.py';
    const approvedLine = fs.readFileSync(path.join(root, relative), 'utf8').split('\n')
      .find(line => line.includes("'timeline-native-api.service':"));
    assert.ok(approvedLine);
    const changedLine = approvedLine.replace(/[a-f0-9]{64}/, randomBytes(32).toString('hex'));
    const extraLine = `api_key = '${randomBytes(32).toString('hex')}'`;
    const fixtures = {
      [`approved/${relative}`]: approvedLine,
      [`changed/${relative}`]: changedLine,
      [`appended/${relative}`]: `${approvedLine}\n${extraLine}`,
      'unrelated/metadata.py': approvedLine,
    };
    for (const [name, text] of Object.entries(fixtures)) {
      const filename = path.join(directory, name);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, `${text}\n`, { mode: 0o600 });
    }
    const config = path.join(root, '.gitleaks.toml');
    const report = path.join(directory, 'findings.json');
    const version = spawnSync('gitleaks', ['version'], { encoding: 'utf8' });
    let result;
    if (version.status === 0 && version.stdout.trim().replace(/^v/, '') === '8.30.1') {
      result = spawnSync('gitleaks', ['dir', directory, '--config', config, '--redact', '--no-banner', '--report-format', 'json', '--report-path', report], { encoding: 'utf8', timeout: 90_000 });
    } else {
      const script = fs.readFileSync(path.join(root, 'scripts/security/run-secrets-scan.sh'), 'utf8');
      const image = script.match(/^GITLEAKS_IMAGE_DEFAULT="([^"]+)"$/m)?.[1];
      assert.match(image ?? '', /^ghcr\.io\/gitleaks\/gitleaks:v8\.30\.1@sha256:[a-f0-9]{64}$/);
      result = spawnSync('docker', ['run', '--rm', '--volume', `${directory}:/fixtures`, '--volume', `${config}:/gitleaks.toml:ro`, image, 'dir', '/fixtures', '--config', '/gitleaks.toml', '--redact', '--no-banner', '--report-format', 'json', '--report-path', '/fixtures/findings.json'], { encoding: 'utf8', timeout: 90_000 });
    }
    assert.equal(result.status, 1, `expected blocked scan, got ${result.status}: ${result.stderr}`);
    const findings = JSON.parse(fs.readFileSync(report, 'utf8'));
    assert.equal(findings.length, 3);
    const files = findings.map(item => item.File.replaceAll('\\', '/'));
    assert.equal(files.some(file => file.includes('/approved/')), false);
    for (const directoryName of ['changed', 'appended', 'unrelated']) {
      assert.equal(files.filter(file => file.includes(`/${directoryName}/`)).length, 1);
    }
    assert.equal(findings.every(item => item.RuleID === 'generic-api-key'), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
