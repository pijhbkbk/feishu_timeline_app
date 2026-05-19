#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="$ROOT_DIR/reports/security/integrity"
MANIFEST="${MANIFEST:-$REPORT_DIR/build-integrity.sha256}"
CURRENT="$REPORT_DIR/build-integrity.current.sha256"
DIFF_OUT="$REPORT_DIR/build-integrity.diff"
DOC_REPORT="$ROOT_DIR/docs/security/WEB_TAMPER_PROTECTION_R19.md"

mkdir -p "$REPORT_DIR" "$(dirname "$DOC_REPORT")"

if [ ! -f "$MANIFEST" ]; then
  printf '[ERROR] Missing manifest: %s\n' "$MANIFEST" >&2
  exit 2
fi

hash_cmd="shasum -a 256"
if command -v sha256sum >/dev/null 2>&1; then
  hash_cmd="sha256sum"
fi

: >"$CURRENT"
for path in \
  "$ROOT_DIR/apps/web/.next/static" \
  "$ROOT_DIR/apps/web/public" \
  "$ROOT_DIR/public" \
  "$ROOT_DIR/scripts/deploy" \
  "$ROOT_DIR/deploy"; do
  if [ -e "$path" ]; then
    find "$path" -type f \
      -not -path '*/.DS_Store' \
      -print0 | sort -z | xargs -0 $hash_cmd >>"$CURRENT" || true
  fi
done

sed -i.bak "s#$ROOT_DIR/##g" "$CURRENT" 2>/dev/null || true
rm -f "$CURRENT.bak"

if diff -u "$MANIFEST" "$CURRENT" >"$DIFF_OUT"; then
  status="PASS"
else
  status="FAIL"
fi

cat >>"$DOC_REPORT" <<EOF

## Integrity Recheck

Status: $status
Manifest: \`reports/security/integrity/build-integrity.sha256\`
Current: \`reports/security/integrity/build-integrity.current.sha256\`
Diff: \`reports/security/integrity/build-integrity.diff\`
EOF

printf '[INFO] Integrity status: %s\n' "$status"
test "$status" = "PASS"
