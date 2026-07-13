#!/usr/bin/env node

import fs from 'node:fs';

const reportPath = process.argv[2];

if (!reportPath) {
  console.error('Usage: evaluate-trivy-report.mjs <trivy-report.json>');
  process.exit(2);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error(`Unable to parse Trivy JSON: ${error.message}`);
  process.exit(2);
}

if (
  report === null ||
  typeof report !== 'object' ||
  Array.isArray(report) ||
  !Object.hasOwn(report, 'Results') ||
  !Array.isArray(report.Results)
) {
  console.error('Invalid Trivy JSON schema: Results must be an array.');
  process.exit(2);
}

const results = report.Results;
const blocking = [];

for (const result of results) {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    console.error('Invalid Trivy JSON schema: every Results entry must be an object.');
    process.exit(2);
  }

  const target = result?.Target ?? 'unknown-target';
  const rawVulnerabilities = result.Vulnerabilities;
  if (
    rawVulnerabilities !== undefined &&
    rawVulnerabilities !== null &&
    !Array.isArray(rawVulnerabilities)
  ) {
    console.error(
      'Invalid Trivy JSON schema: Vulnerabilities must be an array when present.',
    );
    process.exit(2);
  }
  const vulnerabilities = rawVulnerabilities ?? [];

  for (const vulnerability of vulnerabilities) {
    const severity = String(vulnerability?.Severity ?? 'UNKNOWN').toUpperCase();
    blocking.push({
      target,
      severity,
      id: vulnerability?.VulnerabilityID ?? 'unknown-vulnerability',
      packageName: vulnerability?.PkgName ?? 'unknown-package',
      installedVersion: vulnerability?.InstalledVersion ?? 'unknown-version',
      fixedVersion: vulnerability?.FixedVersion ?? 'not-published',
    });
  }
}

console.log('# Trivy Vulnerability Findings');
console.log('');

if (blocking.length === 0) {
  console.log('No vulnerability findings.');
} else {
  for (const finding of blocking) {
    console.log(
      `- ${finding.severity} ${finding.id} ${finding.packageName}@${finding.installedVersion} ` +
        `(target: ${finding.target}, fixed: ${finding.fixedVersion})`,
    );
  }
}

console.log('');
console.log(`Blocking findings: ${blocking.length}`);

if (blocking.length > 0) {
  process.exit(1);
}
