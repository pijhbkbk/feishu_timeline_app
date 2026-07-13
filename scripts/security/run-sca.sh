#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="${SECURITY_REPORT_DIR:-$ROOT_DIR/reports/security/sca}"
DOC_REPORT="${SCA_DOC_REPORT:-$ROOT_DIR/docs/security/SCA_REPORT_R19.md}"

mkdir -p "$REPORT_DIR" "$(dirname "$DOC_REPORT")"
rm -f "$REPORT_DIR/pnpm-audit.log" "$REPORT_DIR/pnpm-audit.status" \
  "$REPORT_DIR/pnpm-audit-all.log" "$REPORT_DIR/pnpm-audit-all.status"

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"

overall_status=0

printf '[INFO] Auditing all workspace dependencies at Low-or-higher threshold\n'
if (
  cd "$ROOT_DIR"
  pnpm audit --audit-level low
) >"$REPORT_DIR/pnpm-audit-all.log" 2>&1; then
  all_audit_status="PASS"
else
  all_audit_status="FAIL"
  overall_status=1
fi
printf '%s' "$all_audit_status" >"$REPORT_DIR/pnpm-audit-all.status"

printf '[INFO] Auditing production dependencies at Low-or-higher threshold\n'
if (
  cd "$ROOT_DIR"
  pnpm audit --prod --audit-level low
) >"$REPORT_DIR/pnpm-audit.log" 2>&1; then
  audit_status="PASS"
else
  audit_status="FAIL"
  overall_status=1
fi
printf '%s' "$audit_status" >"$REPORT_DIR/pnpm-audit.status"

if [ "$overall_status" -eq 0 ]; then
  acceptance="PASS — neither the full workspace nor the production dependency graph has a reported vulnerability."
else
  acceptance="FAIL — pnpm reported a production/development vulnerability or the audit tool/registry failed."
fi

cat >"$DOC_REPORT" <<EOF
# Dependency SCA Report R19B

Generated: $timestamp
Commit: $commit
Scope: all workspace dependencies, with production dependencies also reported as a separate release gate

## Command Results

| Check | Status | Raw Output |
|---|---|---|
| \`pnpm audit --audit-level low\` | $all_audit_status | reports/security/sca/pnpm-audit-all.log |
| \`pnpm audit --prod --audit-level low\` | $audit_status | reports/security/sca/pnpm-audit.log |

Container-image SCA is a separate gate implemented by
\`scripts/security/scan-production-images.sh\`; it scans the exact images built by CI.

## Current Acceptance

$acceptance
EOF

printf '[INFO] Wrote %s\n' "$DOC_REPORT"
exit "$overall_status"
