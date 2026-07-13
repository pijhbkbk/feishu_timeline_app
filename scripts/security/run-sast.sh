#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="${SECURITY_REPORT_DIR:-$ROOT_DIR/reports/security/sast}"
DOC_REPORT="${SAST_DOC_REPORT:-$ROOT_DIR/docs/security/SAST_REPORT_R19.md}"
SEMGREP_VERSION="1.169.0"
SEMGREP_IMAGE_DEFAULT="docker.io/semgrep/semgrep:1.169.0@sha256:2b33f46ba66cf8cc2ad59ccfa7d22951fd00c632c38f1339e84ec8e6e641a942"
SEMGREP_IMAGE="${SEMGREP_IMAGE:-$SEMGREP_IMAGE_DEFAULT}"

mkdir -p "$REPORT_DIR" "$(dirname "$DOC_REPORT")"
rm -f "$REPORT_DIR/semgrep.json" "$REPORT_DIR/semgrep.log" \
  "$REPORT_DIR/semgrep.status" "$REPORT_DIR/semgrep.txt" \
  "$REPORT_DIR/targets.txt"

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
overall_status=0
manifest_status="PASS"

if ! "$ROOT_DIR/scripts/security/list-sast-targets.sh" >"$REPORT_DIR/targets.txt"; then
  manifest_status="TOOL_ERROR"
  overall_status=1
fi

targets=()
if [ "$manifest_status" = "PASS" ]; then
  while IFS= read -r target; do
    [ -n "$target" ] && targets+=("$target")
  done <"$REPORT_DIR/targets.txt"
fi

if [ "${#targets[@]}" -eq 0 ]; then
  printf 'No tracked authored SAST targets were discovered.\n' >"$REPORT_DIR/semgrep.log"
  semgrep_status="TOOL_ERROR"
  overall_status=1
else
  printf '[INFO] Scanning %s version-controlled candidate files with Semgrep %s\n' \
    "${#targets[@]}" "$SEMGREP_VERSION"

  scanner_rc=0
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    if docker run --rm \
      --volume "$ROOT_DIR:/src:ro" \
      --workdir /src \
      "$SEMGREP_IMAGE" \
      semgrep scan \
      --disable-version-check \
      --metrics=off \
      --config p/owasp-top-ten \
      --config p/javascript \
      --config p/typescript \
      --json \
      "${targets[@]}" \
      >"$REPORT_DIR/semgrep.json" 2>"$REPORT_DIR/semgrep.log"; then
      scanner_rc=0
    else
      scanner_rc=$?
    fi
  elif command -v semgrep >/dev/null 2>&1; then
    installed_version="$(semgrep --version 2>/dev/null | head -n 1 | tr -d '[:space:]')"
    if [ "$installed_version" != "$SEMGREP_VERSION" ]; then
      printf 'Semgrep version mismatch: expected %s, found %s.\n' \
        "$SEMGREP_VERSION" "${installed_version:-unknown}" >"$REPORT_DIR/semgrep.log"
      scanner_rc=2
    elif (
      cd "$ROOT_DIR"
      semgrep scan \
        --disable-version-check \
        --metrics=off \
        --config p/owasp-top-ten \
        --config p/javascript \
        --config p/typescript \
        --json \
        "${targets[@]}"
    ) >"$REPORT_DIR/semgrep.json" 2>"$REPORT_DIR/semgrep.log"; then
      scanner_rc=0
    else
      scanner_rc=$?
    fi
  else
    printf 'Pinned Semgrep is unavailable: Docker daemon and Semgrep %s were not found.\n' \
      "$SEMGREP_VERSION" >"$REPORT_DIR/semgrep.log"
    scanner_rc=2
  fi

  if [ "$scanner_rc" -ne 0 ]; then
    semgrep_status="TOOL_ERROR"
    overall_status=1
    printf 'Semgrep failed with exit code %s.\n' "$scanner_rc" \
      >"$REPORT_DIR/semgrep.txt"
  else
    evaluator_rc=0
    if node "$ROOT_DIR/scripts/security/evaluate-semgrep-report.mjs" \
      "$REPORT_DIR/semgrep.json" >"$REPORT_DIR/semgrep.txt" 2>&1; then
      evaluator_rc=0
    else
      evaluator_rc=$?
    fi

    case "$evaluator_rc" in
      0)
        semgrep_status="PASS"
        ;;
      1)
        semgrep_status="BLOCKED"
        overall_status=1
        ;;
      *)
        semgrep_status="TOOL_ERROR"
        overall_status=1
        ;;
    esac
  fi
fi

printf '%s' "$semgrep_status" >"$REPORT_DIR/semgrep.status"
target_count="${#targets[@]}"
if [ "$overall_status" -eq 0 ]; then
  acceptance="PASS — scanner completed and no findings or scanner errors were reported."
else
  acceptance="FAIL — a blocking finding or security-tool failure must be resolved before merge."
fi

cat >"$DOC_REPORT" <<EOF
# SAST Report R19B

Generated: $timestamp
Commit: $commit
Scope: $target_count Git-indexed or nonignored untracked TypeScript/TSX and executable config sources
Scanner: \`$SEMGREP_IMAGE\`

## Command Results

| Check | Status | Raw Output |
|---|---|---|
| Candidate target manifest | $manifest_status | reports/security/sast/targets.txt |
| Semgrep OWASP / JavaScript / TypeScript | $semgrep_status | reports/security/sast/semgrep.log |
| Semgrep finding summary | INFO | reports/security/sast/semgrep.txt |

Generated dependencies and build output are not scan inputs. The manifest is derived from
\`git ls-files --cached --others --exclude-standard\` and excludes \`node_modules\`, \`.next\`, \`dist\`, \`build\`, coverage,
generated directories, test reports, TypeScript build info and \`next-env.d.ts\`.

## Current Acceptance

$acceptance
EOF

printf '[INFO] Wrote %s\n' "$DOC_REPORT"
exit "$overall_status"
