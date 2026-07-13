#!/usr/bin/env node

import fs from 'node:fs';

const reportPath = process.argv[2];

if (!reportPath) {
  console.error('Usage: evaluate-gitleaks-report.mjs <gitleaks-report.json>');
  process.exit(2);
}

let findings;
try {
  findings = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error(`Unable to parse Gitleaks JSON: ${error.message}`);
  process.exit(2);
}

if (!Array.isArray(findings)) {
  console.error('Invalid Gitleaks JSON: expected a top-level array.');
  process.exit(2);
}

console.log('# Gitleaks Findings');
console.log('');

if (findings.length === 0) {
  console.log('No findings.');
} else {
  for (const finding of findings) {
    const rule = finding?.RuleID ?? finding?.Description ?? 'unknown-rule';
    const file = finding?.File ?? 'unknown-file';
    const line = finding?.StartLine ?? '?';
    const commit = finding?.Commit ? ` commit=${finding.Commit}` : '';
    console.log(`- ${rule} ${file}:${line}${commit}`);
  }
}

console.log('');
console.log(`Blocking findings: ${findings.length}`);

if (findings.length > 0) {
  process.exit(1);
}
