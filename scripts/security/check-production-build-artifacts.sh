#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD_DIR="${1:-$ROOT_DIR/apps/web/.next}"
REPORT_DIR="${SECURITY_REPORT_DIR:-$ROOT_DIR/reports/security/production-build}"
REPORT_FILE="$REPORT_DIR/eval-source-map-check.txt"

mkdir -p "$REPORT_DIR"
: >"$REPORT_FILE"

if [ ! -d "$BUILD_DIR" ]; then
  printf 'FAIL: production build directory does not exist: %s\n' "$BUILD_DIR" \
    | tee -a "$REPORT_FILE" >&2
  exit 2
fi

if [ ! -s "$BUILD_DIR/BUILD_ID" ]; then
  printf 'FAIL: BUILD_ID is missing; this is not a completed Next.js production build.\n' \
    | tee -a "$REPORT_FILE" >&2
  exit 1
fi

if [ ! -d "$BUILD_DIR/server" ] || [ ! -d "$BUILD_DIR/static" ]; then
  printf 'FAIL: expected Next.js production server/static artifacts are missing.\n' \
    | tee -a "$REPORT_FILE" >&2
  exit 1
fi

pattern='eval-source-map|eval-cheap-module-source-map|sourceURL=webpack-internal'
matches_file="$REPORT_DIR/eval-source-map-files.txt"
: >"$matches_file"

# Scan the same complete file set on every host, including hidden pnpm stores.
# Collect first so a traversal failure cannot disappear in process substitution.
files_file="$REPORT_DIR/eval-source-map-inputs.txt"
if ! find "$BUILD_DIR" -type f \
  \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.map' \) \
  -print0 >"$files_file"; then
  printf 'FAIL: artifact scanner could not enumerate build files.\n' \
    | tee -a "$REPORT_FILE" >&2
  exit 2
fi
while IFS= read -r -d '' file; do
  grep_rc=0
  if LC_ALL=C grep -El "$pattern" "$file" >/dev/null 2>&1; then
    printf '%s\n' "$file" >>"$matches_file"
  else
    grep_rc=$?
    if [ "$grep_rc" -gt 1 ]; then
      printf 'FAIL: artifact scanner could not read a build file.\n' \
        | tee -a "$REPORT_FILE" >&2
      exit 2
    fi
  fi
done <"$files_file"

if [ -s "$matches_file" ]; then
  printf 'FAIL: development eval-source-map markers were found in production artifacts.\n' \
    | tee -a "$REPORT_FILE" >&2
  printf 'Matched files (contents intentionally omitted):\n' >>"$REPORT_FILE"
  sed "s#^$ROOT_DIR/##" "$matches_file" >>"$REPORT_FILE"
  exit 1
fi

printf 'PASS: completed production build contains no development eval-source-map markers.\n' \
  | tee -a "$REPORT_FILE"
