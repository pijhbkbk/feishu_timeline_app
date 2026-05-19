#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="$ROOT_DIR/reports/security/headers"
DOC_REPORT="$ROOT_DIR/docs/security/SECURITY_HEADERS_R19.md"

mkdir -p "$REPORT_DIR" "$(dirname "$DOC_REPORT")"

BASE_URL="${BASE_URL:-http://localhost:3000}"
CONFIRM_AUTHORIZED_TARGET="${CONFIRM_AUTHORIZED_TARGET:-no}"
PATHS=(
  "/"
  "/guide"
  "/dashboard"
  "/projects"
  "/projects/timeline"
  "/materials"
  "/monthly-reviews"
  "/analytics"
  "/api/health"
)

case "$BASE_URL" in
  http://localhost:*|http://127.0.0.1:*|http://[::1]:*)
    ;;
  *)
    if [ "$CONFIRM_AUTHORIZED_TARGET" != "yes" ]; then
      printf '[ERROR] Remote header target requires CONFIRM_AUTHORIZED_TARGET=yes: %s\n' "$BASE_URL" >&2
      exit 2
    fi
    ;;
esac

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
raw="$REPORT_DIR/security-headers.raw.txt"
: >"$raw"

for path in "${PATHS[@]}"; do
  url="${BASE_URL%/}$path"
  {
    printf '\n===== %s =====\n' "$url"
    curl -k -sS -D - -o /dev/null "$url" || true
  } >>"$raw"
done

{
  printf '# Security Headers R19\n\n'
  printf 'Generated: %s  \n' "$timestamp"
  printf 'Commit: %s  \n' "$commit"
  printf 'Base URL: %s\n\n' "$BASE_URL"
  printf '## Required Headers\n\n'
  printf '| Header | Requirement |\n'
  printf '|---|---|\n'
  printf '| Strict-Transport-Security | Required on HTTPS production/private cloud. |\n'
  printf '| X-Content-Type-Options | Should be `nosniff`. |\n'
  printf '| X-Frame-Options or CSP frame-ancestors | Required. |\n'
  printf '| Content-Security-Policy | Required or report-only with hardening plan. |\n'
  printf '| Referrer-Policy | Required. |\n'
  printf '| Permissions-Policy | Required. |\n'
  printf '| Cache-Control | Sensitive pages should not be publicly cached. |\n'
  printf '| Set-Cookie flags | HttpOnly, Secure on HTTPS, SameSite. |\n\n'
  printf '## Raw Output\n\n'
  printf 'See `reports/security/headers/security-headers.raw.txt`.\n\n'
  printf '## Current Acceptance\n\n'
  printf 'FAIL until each path is reviewed and missing Medium / High headers are remediated or accepted.\n'
} >"$DOC_REPORT"

printf '[INFO] Wrote %s\n' "$DOC_REPORT"
