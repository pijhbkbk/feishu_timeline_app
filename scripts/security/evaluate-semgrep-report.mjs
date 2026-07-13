#!/usr/bin/env node

import fs from 'node:fs';

const reportPath = process.argv[2];

if (!reportPath) {
  console.error('Usage: evaluate-semgrep-report.mjs <semgrep-report.json>');
  process.exit(2);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error(`Unable to parse Semgrep JSON: ${error.message}`);
  process.exit(2);
}

if (
  report === null ||
  typeof report !== 'object' ||
  Array.isArray(report) ||
  !Array.isArray(report.results) ||
  !Array.isArray(report.errors)
) {
  console.error('Invalid Semgrep JSON schema: results and errors must be arrays.');
  process.exit(2);
}

const results = report.results;
const errors = report.errors;
const severityRank = new Map([
  ['CRITICAL', 6],
  ['HIGH', 5],
  ['ERROR', 4],
  ['MEDIUM', 3],
  ['WARNING', 3],
  ['LOW', 2],
  ['INFO', 1],
]);
const severityCounts = new Map();
let blockingFindings = 0;

const normalizeSeverity = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  return value.trim().toUpperCase();
};

const normalizeSecurityScore = (value) => {
  const score = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;

  if (!Number.isFinite(score)) {
    return normalizeSeverity(value);
  }

  if (score >= 9) {
    return 'CRITICAL';
  }

  if (score >= 7) {
    return 'HIGH';
  }

  return null;
};

const severitySignals = (finding) => {
  const metadata = finding?.extra?.metadata;
  const signals = [
    normalizeSeverity(finding?.extra?.severity),
    normalizeSeverity(metadata?.severity),
    normalizeSecurityScore(metadata?.['security-severity']),
    normalizeSecurityScore(metadata?.security_severity),
  ].filter(Boolean);

  return [...new Set(signals.length > 0 ? signals : ['INFO'])];
};

const effectiveSeverity = (signals) => {
  return signals.reduce((highest, severity) => {
    const highestRank = severityRank.get(highest) ?? 0;
    const currentRank = severityRank.get(severity) ?? 0;
    return currentRank > highestRank ? severity : highest;
  }, 'INFO');
};

console.log('# Semgrep Findings');
console.log('');

for (const finding of results) {
  const signals = severitySignals(finding);
  const severity = effectiveSeverity(signals);
  severityCounts.set(severity, (severityCounts.get(severity) ?? 0) + 1);
  blockingFindings += 1;

  const path = finding?.path ?? 'unknown';
  const line = finding?.start?.line ?? '?';
  const rule = finding?.check_id ?? 'unknown-rule';
  const message = String(finding?.extra?.message ?? '').replace(/\s+/g, ' ').trim();
  console.log(`- ${severity} ${rule} ${path}:${line}`);
  if (message) {
    console.log(`  ${message}`);
  }
}

if (results.length === 0) {
  console.log('No findings.');
}

console.log('');
console.log(`Total findings: ${results.length}`);
for (const [severity, count] of [...severityCounts.entries()].sort()) {
  console.log(`${severity}: ${count}`);
}
console.log(`Blocking findings (all reported severities): ${blockingFindings}`);
console.log(`Scanner errors: ${errors.length}`);

if (errors.length > 0) {
  console.log('');
  console.log('## Scanner errors');
  for (const error of errors) {
    const message = String(error?.message ?? error?.type ?? JSON.stringify(error))
      .replace(/\s+/g, ' ')
      .trim();
    console.log(`- ${message || 'Unknown Semgrep error'}`);
  }
  process.exit(2);
}

if (blockingFindings > 0) {
  process.exit(1);
}
