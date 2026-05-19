#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="$ROOT_DIR/reports/security/sast"
DOC_REPORT="$ROOT_DIR/docs/security/SAST_REPORT_R19.md"

mkdir -p "$REPORT_DIR" "$(dirname "$DOC_REPORT")"

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"

run_capture() {
  local name="$1"
  shift
  printf '[INFO] Running %s\n' "$name"
  if "$@" >"$REPORT_DIR/$name.log" 2>&1; then
    printf 'PASS' >"$REPORT_DIR/$name.status"
    return 0
  fi
  printf 'FAIL' >"$REPORT_DIR/$name.status"
  return 1
}

run_optional() {
  local name="$1"
  shift
  run_capture "$name" "$@" || true
}

run_optional pnpm-lint pnpm lint
run_optional pnpm-typecheck pnpm typecheck

semgrep_status="SKIPPED"
if command -v semgrep >/dev/null 2>&1; then
  if semgrep --config p/owasp-top-ten --config p/javascript --config p/typescript \
    --json --output "$REPORT_DIR/semgrep.json" apps packages >"$REPORT_DIR/semgrep.log" 2>&1; then
    semgrep_status="PASS"
  else
    semgrep_status="FAIL"
  fi
elif command -v docker >/dev/null 2>&1; then
  if docker run --rm -v "$ROOT_DIR:/src" -w /src semgrep/semgrep:latest \
    semgrep --config p/owasp-top-ten --config p/javascript --config p/typescript \
    --json --output /src/reports/security/sast/semgrep.json apps packages \
    >"$REPORT_DIR/semgrep.log" 2>&1; then
    semgrep_status="PASS"
  else
    semgrep_status="FAIL"
  fi
else
  printf 'semgrep and docker are not available.\n' >"$REPORT_DIR/semgrep.log"
fi
printf '%s' "$semgrep_status" >"$REPORT_DIR/semgrep.status"

dangerous_patterns="$REPORT_DIR/dangerous-patterns.txt"
{
  printf '# Dangerous Pattern Locations\n'
  printf '\n'
  rg -n --no-heading \
    'eval\(|new Function\(|dangerouslySetInnerHTML|\.innerHTML|child_process|\bexec\(|\$queryRaw|\$executeRaw|redirect\s*=|cors\(|sameSite|httpOnly|secure:' \
    "$ROOT_DIR/apps" "$ROOT_DIR/packages" \
    -g '!**/.next/**' \
    -g '!**/dist/**' \
    -g '!**/playwright-report/**' \
    -g '!**/test-results/**' \
    -g '!**/*.tsbuildinfo' \
    2>/dev/null || true
} >"$dangerous_patterns"

semgrep_text="$REPORT_DIR/semgrep.txt"
if [ -f "$REPORT_DIR/semgrep.json" ]; then
  node - "$REPORT_DIR/semgrep.json" >"$semgrep_text" <<'NODE' || true
const fs = require('node:fs');
const reportPath = process.argv[2];
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const results = Array.isArray(report.results) ? report.results : [];
console.log(`# Semgrep Findings\n`);
console.log(`Total findings: ${results.length}\n`);
for (const finding of results) {
  const path = finding.path ?? 'unknown';
  const start = finding.start?.line ?? '?';
  const rule = finding.check_id ?? 'unknown-rule';
  const severity = finding.extra?.severity ?? 'INFO';
  const message = String(finding.extra?.message ?? '').replace(/\s+/g, ' ').trim();
  console.log(`- ${severity} ${rule} ${path}:${start}`);
  if (message) {
    console.log(`  ${message}`);
  }
}
NODE
else
  printf 'Semgrep JSON report was not generated. See semgrep.log.\n' >"$semgrep_text"
fi

cat >"$DOC_REPORT" <<EOF
# SAST Report R19

Generated: $timestamp
Commit: $commit
Scope: apps, packages

## Command Results

| Check | Status | Raw Output |
|---|---|---|
| pnpm lint | $(cat "$REPORT_DIR/pnpm-lint.status" 2>/dev/null || printf 'NOT_RUN') | reports/security/sast/pnpm-lint.log |
| pnpm typecheck | $(cat "$REPORT_DIR/pnpm-typecheck.status" 2>/dev/null || printf 'NOT_RUN') | reports/security/sast/pnpm-typecheck.log |
| Semgrep OWASP / JS / TS | $semgrep_status | reports/security/sast/semgrep.log |
| Semgrep text summary | INFO | reports/security/sast/semgrep.txt |
| Dangerous pattern grep | INFO | reports/security/sast/dangerous-patterns.txt |

## Required Manual Review

- Review Semgrep findings and classify each item as Critical / High / Medium / Low / Info.
- Review dangerous pattern locations for real exploitability.
- Do not copy secrets or token values into this report.
- Critical / High findings must be fixed and retested before PASS.

## Current Acceptance

FAIL until findings are triaged and remediated.
EOF

printf '[INFO] Wrote %s\n' "$DOC_REPORT"
