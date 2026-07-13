#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="${SECURITY_REPORT_DIR:-$ROOT_DIR/reports/security/zap}"
DOC_REPORT="${DOC_REPORT:-$ROOT_DIR/docs/security/DAST_ZAP_REPORT_R19.md}"
EVALUATOR="$ROOT_DIR/scripts/security/evaluate-zap-report.mjs"
ZAP_IMAGE='ghcr.io/zaproxy/zaproxy:stable@sha256:8d387b1a63e3425beef4846e39719f5af2a787753af2d8b6558c6257d7a577a2'

mkdir -p "$REPORT_DIR" "$(dirname "$DOC_REPORT")"

LOCAL_URL="${LOCAL_URL:-http://localhost:3000}"
TARGET_URL="${TARGET_URL:-${STAGING_URL:-$LOCAL_URL}}"
CONFIRM_AUTHORIZED_TARGET="${CONFIRM_AUTHORIZED_TARGET:-no}"

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
json_report="$REPORT_DIR/zap-baseline.json"
html_report="$REPORT_DIR/zap-baseline.html"
log_report="$REPORT_DIR/zap-baseline.log"
evaluation_report="$REPORT_DIR/zap-evaluation.txt"
status_file="$REPORT_DIR/zap-baseline.status"

write_report() {
  local result="$1"
  local detail="$2"

  {
    printf '# DAST ZAP Report R19B\n\n'
    printf 'Generated: %s\n' "$timestamp"
    printf 'Commit: %s\n' "$commit"
    printf 'Target: %s\n' "$TARGET_URL"
    printf 'Image: `%s`\n' "$ZAP_IMAGE"
    printf 'Result: **%s**\n\n' "$result"
    printf '## Evaluation\n\n'
    printf '%s\n\n' "$detail"
    if [ -s "$evaluation_report" ]; then
      sed -n '1,260p' "$evaluation_report"
      printf '\n'
    fi
    printf '## Report files\n\n'
    printf -- '- `%s`\n' "$log_report"
    printf -- '- `%s`\n' "$json_report"
    printf -- '- `%s`\n\n' "$html_report"
    printf '## Gate policy\n\n'
    printf -- '- Critical, High, or Medium alerts block the gate.\n'
    printf -- '- Reports containing only Low/Info alerts are explicitly recorded as `PASS_WITH_TRIAGED_LOW_INFO`.\n'
    printf -- '- Docker/ZAP execution failures, missing artifacts, invalid JSON, and invalid schemas fail closed.\n'
    printf -- '- Active scan is not enabled. Remote targets require explicit authorization.\n'
  } >"$DOC_REPORT"
}

case "$TARGET_URL" in
  http://localhost:*|http://127.0.0.1:*|http://\[::1\]:*|http://host.docker.internal:*)
    ;;
  *)
    if [ "$CONFIRM_AUTHORIZED_TARGET" != "yes" ]; then
      printf 'BLOCKED\n' >"$status_file"
      write_report \
        'BLOCKED' \
        'Remote DAST target requires `CONFIRM_AUTHORIZED_TARGET=yes` after explicit authorization.'
      printf '[ERROR] Remote target requires CONFIRM_AUTHORIZED_TARGET=yes: %s\n' "$TARGET_URL" >&2
      exit 2
    fi
    ;;
esac

# Never allow a failed run to reuse artifacts from an older successful scan.
rm -f "$json_report" "$html_report" "$log_report" "$evaluation_report"

docker_rc=0
if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required for the pinned ZAP baseline container.\n' >"$log_report"
  docker_rc=127
else
  docker run --rm \
    -v "$REPORT_DIR:/zap/wrk/:rw" \
    "$ZAP_IMAGE" \
    zap-baseline.py \
    -t "$TARGET_URL" \
    -r zap-baseline.html \
    -J zap-baseline.json \
    -m "${ZAP_MINUTES:-5}" \
    -a >"$log_report" 2>&1 || docker_rc=$?
fi

# zap-baseline.py uses 1/2 for alert-policy outcomes. Other non-zero codes are
# execution failures and must not be reinterpreted through a possibly partial JSON file.
if [ "$docker_rc" -gt 2 ]; then
  printf 'TOOL_ERROR\n' >"$status_file"
  write_report 'TOOL_ERROR' "Docker/ZAP execution failed with exit code $docker_rc."
  printf '[ERROR] ZAP execution failed with exit code %s\n' "$docker_rc" >&2
  exit 2
fi

if [ ! -s "$json_report" ] || [ ! -s "$html_report" ]; then
  printf 'TOOL_ERROR\n' >"$status_file"
  write_report 'TOOL_ERROR' 'ZAP did not produce both non-empty JSON and HTML reports.'
  printf '[ERROR] ZAP report artifacts are missing or empty.\n' >&2
  exit 2
fi

evaluation_rc=0
node "$EVALUATOR" "$json_report" >"$evaluation_report" 2>&1 || evaluation_rc=$?

case "$evaluation_rc" in
  0)
    if grep -Fx 'Result: PASS_WITH_TRIAGED_LOW_INFO' "$evaluation_report" >/dev/null; then
      result='PASS_WITH_TRIAGED_LOW_INFO'
      detail='The machine-readable report contains only Low/Info alerts; no Critical/High/Medium alerts were accepted.'
    elif grep -Fx 'Result: PASS' "$evaluation_report" >/dev/null; then
      result='PASS'
      detail='The machine-readable report contains no alert findings.'
    else
      printf 'TOOL_ERROR\n' >"$status_file"
      write_report 'TOOL_ERROR' 'The ZAP evaluator returned success without a recognized result.'
      printf '[ERROR] ZAP evaluator returned an unrecognized result.\n' >&2
      exit 2
    fi
    printf '%s\n' "$result" >"$status_file"
    write_report "$result" "$detail"
    printf '[%s] Wrote %s\n' "$result" "$DOC_REPORT"
    exit 0
    ;;
  1)
    printf 'FAIL\n' >"$status_file"
    write_report 'FAIL' 'At least one Critical, High, or Medium ZAP alert blocks acceptance.'
    printf '[FAIL] ZAP reported a blocking risk. See %s\n' "$DOC_REPORT" >&2
    exit 1
    ;;
  *)
    printf 'TOOL_ERROR\n' >"$status_file"
    write_report 'TOOL_ERROR' "ZAP JSON evaluation failed with exit code $evaluation_rc."
    printf '[ERROR] ZAP JSON evaluation failed with exit code %s\n' "$evaluation_rc" >&2
    exit 2
    ;;
esac
