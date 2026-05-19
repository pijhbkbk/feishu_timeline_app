#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="$ROOT_DIR/reports/security/integrity"
DOC_REPORT="$ROOT_DIR/docs/security/WEB_TAMPER_PROTECTION_R19.md"
MANIFEST="${MANIFEST:-$REPORT_DIR/build-integrity.sha256}"

mkdir -p "$REPORT_DIR" "$(dirname "$DOC_REPORT")"

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
hash_cmd="shasum -a 256"
if command -v sha256sum >/dev/null 2>&1; then
  hash_cmd="sha256sum"
fi

: >"$MANIFEST"
for path in \
  "$ROOT_DIR/apps/web/.next/static" \
  "$ROOT_DIR/apps/web/public" \
  "$ROOT_DIR/public" \
  "$ROOT_DIR/scripts/deploy" \
  "$ROOT_DIR/deploy"; do
  if [ -e "$path" ]; then
    find "$path" -type f \
      -not -path '*/.DS_Store' \
      -print0 | sort -z | xargs -0 $hash_cmd >>"$MANIFEST" || true
  fi
done

sed -i.bak "s#$ROOT_DIR/##g" "$MANIFEST" 2>/dev/null || true
rm -f "$MANIFEST.bak"

cat >"$DOC_REPORT" <<EOF
# Web Tamper Protection R19

Generated: $timestamp
Commit: $commit

## Build Integrity Manifest

- Manifest: \`reports/security/integrity/build-integrity.sha256\`

## Required Checks

- Generate hash manifest after trusted build.
- Compare manifest before and after deployment.
- Confirm Nginx static directory is read-only for non-deploy users.
- Confirm deployment directory is writable only by deploy user or CI runner.
- Confirm Nginx directory listing is off.
- Check rendered HTML and static assets for unknown scripts, iframe and external links.

## Current Acceptance

FAIL until deployment target hash comparison and static directory permission review pass.
EOF

printf '[INFO] Wrote %s\n' "$DOC_REPORT"
