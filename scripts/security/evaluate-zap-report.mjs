#!/usr/bin/env node

import fs from 'node:fs';

const reportPath = process.argv[2];

if (!reportPath) {
  console.error('Usage: evaluate-zap-report.mjs <zap-report.json>');
  process.exit(2);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error(`Unable to parse ZAP JSON: ${error.message}`);
  process.exit(2);
}

if (
  report === null ||
  typeof report !== 'object' ||
  Array.isArray(report) ||
  !Object.hasOwn(report, 'site') ||
  !Array.isArray(report.site) ||
  report.site.length === 0
) {
  console.error('Invalid ZAP JSON schema: site must be a non-empty array.');
  process.exit(2);
}

const riskByCode = new Map([
  ['0', 'INFO'],
  ['1', 'LOW'],
  ['2', 'MEDIUM'],
  ['3', 'HIGH'],
  ['4', 'CRITICAL'],
]);
const counts = new Map(
  ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map((severity) => [severity, 0]),
);
const findings = [];

for (const site of report.site) {
  if (
    site === null ||
    typeof site !== 'object' ||
    Array.isArray(site) ||
    !Array.isArray(site.alerts)
  ) {
    console.error('Invalid ZAP JSON schema: every site must contain an alerts array.');
    process.exit(2);
  }

  const siteName = String(site['@name'] ?? site['@host'] ?? 'unknown-site');

  for (const alert of site.alerts) {
    if (alert === null || typeof alert !== 'object' || Array.isArray(alert)) {
      console.error('Invalid ZAP JSON schema: every alert must be an object.');
      process.exit(2);
    }

    const riskCode = String(alert.riskcode ?? '');
    const severity = riskByCode.get(riskCode);
    if (!severity) {
      console.error(`Invalid ZAP JSON schema: unsupported or missing riskcode ${riskCode || '(empty)'}.`);
      process.exit(2);
    }

    counts.set(severity, counts.get(severity) + 1);
    findings.push({
      severity,
      site: siteName.replace(/\s+/g, ' ').trim(),
      id: String(alert.pluginid ?? alert.alertRef ?? 'unknown-rule')
        .replace(/\s+/g, ' ')
        .trim(),
      name: String(alert.name ?? alert.alert ?? 'unnamed alert')
        .replace(/\s+/g, ' ')
        .trim(),
    });
  }
}

const blocking =
  counts.get('CRITICAL') + counts.get('HIGH') + counts.get('MEDIUM');
const triaged = counts.get('LOW') + counts.get('INFO');
const result =
  blocking > 0
    ? 'FAIL'
    : triaged > 0
      ? 'PASS_WITH_TRIAGED_LOW_INFO'
      : 'PASS';

console.log('# ZAP Risk Evaluation');
console.log('');
console.log(`Result: ${result}`);
console.log(`Critical: ${counts.get('CRITICAL')}`);
console.log(`High: ${counts.get('HIGH')}`);
console.log(`Medium: ${counts.get('MEDIUM')}`);
console.log(`Low: ${counts.get('LOW')}`);
console.log(`Info: ${counts.get('INFO')}`);
console.log(`Blocking findings: ${blocking}`);
console.log('');

if (findings.length === 0) {
  console.log('No alert findings.');
} else {
  console.log('## Findings');
  console.log('');
  for (const finding of findings) {
    console.log(
      `- ${finding.severity} ${finding.id} ${finding.name} (site: ${finding.site})`,
    );
  }
}

if (blocking > 0) {
  process.exit(1);
}
