#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="$ROOT_DIR/reports/security/secrets"
DOC_REPORT="$ROOT_DIR/docs/security/SECRETS_SCAN_R19.md"

mkdir -p "$REPORT_DIR" "$(dirname "$DOC_REPORT")"

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"

gitleaks_status="SKIPPED"
if command -v gitleaks >/dev/null 2>&1; then
  if gitleaks detect --source "$ROOT_DIR" --redact --report-format json \
    --report-path "$REPORT_DIR/gitleaks-report.json" >"$REPORT_DIR/gitleaks.log" 2>&1; then
    gitleaks_status="PASS"
  else
    gitleaks_status="FAIL"
  fi
elif command -v docker >/dev/null 2>&1; then
  if docker run --rm -v "$ROOT_DIR:/repo" zricethezav/gitleaks:latest detect \
    --source /repo --redact --report-format json \
    --report-path /repo/reports/security/secrets/gitleaks-report.json \
    >"$REPORT_DIR/gitleaks.log" 2>&1; then
    gitleaks_status="PASS"
  else
    gitleaks_status="FAIL"
  fi
else
  printf 'gitleaks and docker are not available.\n' >"$REPORT_DIR/gitleaks.log"
fi

{
  printf '# Environment-like Files\n\n'
  find "$ROOT_DIR" \
    -path "$ROOT_DIR/node_modules" -prune -o \
    -path "$ROOT_DIR/.git" -prune -o \
    -path "$ROOT_DIR/reports" -prune -o \
    -type f \( -name '.env' -o -name '.env.*' -o -path '*/deploy/env/*' \) \
    -print | sort | sed "s#^$ROOT_DIR/##"
} >"$REPORT_DIR/env-files.txt"

{
  printf '# Sensitive Key Name Locations\n\n'
  rg -n --no-heading -o \
    'FEISHU_APP_SECRET|FEISHU_APP_ID|DATABASE_URL|REDIS_URL|JWT_SECRET|SESSION_SECRET|POSTGRES_PASSWORD|API_TOKEN|COOKIE_SECRET|PRIVATE KEY|BEGIN RSA PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY' \
    "$ROOT_DIR" \
    -g '!node_modules/**' -g '!.git/**' -g '!reports/**' 2>/dev/null || true
} >"$REPORT_DIR/sensitive-key-name-locations.txt"

{
  printf '# Git Ignore Checks\n\n'
  for path in \
    .env \
    .env.production \
    apps/api/.env.production \
    apps/web/.env.production \
    deploy/env/production.env; do
    if git -C "$ROOT_DIR" check-ignore -v "$path" >/tmp/r19-gitignore-check.$$ 2>/dev/null; then
      printf 'PASS %s -> %s\n' "$path" "$(cat /tmp/r19-gitignore-check.$$)"
    else
      printf 'FAIL %s is not ignored\n' "$path"
    fi
  done
  rm -f /tmp/r19-gitignore-check.$$
} >"$REPORT_DIR/gitignore-check.txt"

cat >"$DOC_REPORT" <<EOF
# Secrets Scan R19

Generated: $timestamp
Commit: $commit

## Command Results

| Check | Status | Raw Output |
|---|---|---|
| gitleaks detect --redact | $gitleaks_status | reports/security/secrets/gitleaks.log |
| Environment-like file inventory | INFO | reports/security/secrets/env-files.txt |
| Sensitive key name location scan | INFO | reports/security/secrets/sensitive-key-name-locations.txt |
| .gitignore protection check | INFO | reports/security/secrets/gitignore-check.txt |

## Reporting Rules

- Do not paste secret values into this report.
- If a real secret is found, record only file path, line number, key type and risk.
- Any confirmed secret exposure is Critical.
- Rotate exposed Feishu App Secret, database password, Redis password, session secret and API tokens through the owning platform.

## Current Acceptance

FAIL until gitleaks output and key-name locations are manually triaged.
EOF

printf '[INFO] Wrote %s\n' "$DOC_REPORT"
