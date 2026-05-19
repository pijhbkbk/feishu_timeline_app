#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="$ROOT_DIR/reports/security/zap"
DOC_REPORT="$ROOT_DIR/docs/security/DAST_ZAP_REPORT_R19.md"

mkdir -p "$REPORT_DIR" "$(dirname "$DOC_REPORT")"

LOCAL_URL="${LOCAL_URL:-http://localhost:3000}"
TARGET_URL="${TARGET_URL:-${STAGING_URL:-$LOCAL_URL}}"
CONFIRM_AUTHORIZED_TARGET="${CONFIRM_AUTHORIZED_TARGET:-no}"

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"

case "$TARGET_URL" in
  http://localhost:*|http://127.0.0.1:*|http://[::1]:*|http://host.docker.internal:*)
    ;;
  *)
    if [ "$CONFIRM_AUTHORIZED_TARGET" != "yes" ]; then
      cat >"$DOC_REPORT" <<EOF
# DAST ZAP Report R19

Generated: $timestamp
Commit: $commit
Target: $TARGET_URL

## Result

BLOCKED. Remote DAST target requires explicit authorization.

Set `CONFIRM_AUTHORIZED_TARGET=yes` only after the project owner confirms that the target is staging, local tunnel, or a production-safe baseline/smoke target.
EOF
      printf '[ERROR] Remote target requires CONFIRM_AUTHORIZED_TARGET=yes: %s\n' "$TARGET_URL" >&2
      exit 2
    fi
    ;;
esac

zap_status="SKIPPED"
if command -v docker >/dev/null 2>&1; then
  if docker run --rm -t \
    -v "$REPORT_DIR:/zap/wrk/:rw" \
    ghcr.io/zaproxy/zaproxy:stable \
    zap-baseline.py \
    -t "$TARGET_URL" \
    -r zap-baseline.html \
    -J zap-baseline.json \
    -m 5 \
    -a >"$REPORT_DIR/zap-baseline.log" 2>&1; then
    zap_status="PASS"
  else
    zap_status="FAIL"
  fi
else
  printf 'docker is required for the pinned ZAP baseline container.\n' >"$REPORT_DIR/zap-baseline.log"
fi

cat >"$DOC_REPORT" <<EOF
# DAST ZAP Report R19

Generated: $timestamp
Commit: $commit
Target: $TARGET_URL

## Command Results

| Check | Status | Raw Output |
|---|---|---|
| OWASP ZAP baseline | $zap_status | reports/security/zap/zap-baseline.log |

## Report Files

- reports/security/zap/zap-baseline.html
- reports/security/zap/zap-baseline.json

## Safety Notes

- Active scan is not enabled in this script.
- Remote targets require \`CONFIRM_AUTHORIZED_TARGET=yes\`.
- Production may only be tested with passive, baseline or smoke checks.
- Tokens, cookies and passwords must not be written into this report.

## Current Acceptance

FAIL until ZAP findings are triaged and Critical / High issues are fixed.
EOF

printf '[INFO] Wrote %s\n' "$DOC_REPORT"
