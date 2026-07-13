#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="${SECURITY_REPORT_DIR:-$ROOT_DIR/reports/security/image-sca}"
TRIVY_IMAGE_DEFAULT="ghcr.io/aquasecurity/trivy:0.72.0@sha256:cffe3f5161a47a6823fbd23d985795b3ed72a4c806da4c4df16266c02accdd6f"
TRIVY_IMAGE="${TRIVY_IMAGE:-$TRIVY_IMAGE_DEFAULT}"

mkdir -p "$REPORT_DIR"
rm -f "$REPORT_DIR"/*.json "$REPORT_DIR"/*.log "$REPORT_DIR"/*.status \
  "$REPORT_DIR/summary.md"

if [ "$#" -eq 0 ]; then
  printf 'Usage: scan-production-images.sh <image> [<image> ...]\n' >&2
  exit 2
fi

overall_status=0

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  printf 'Docker daemon is required for pinned Trivy image scanning.\n' \
    >"$REPORT_DIR/tool-error.log"
  printf 'TOOL_ERROR' >"$REPORT_DIR/tool-error.status"
  exit 2
fi

{
  printf '# Production Container SCA R19B\n\n'
  printf 'Scanner: `%s`\n\n' "$TRIVY_IMAGE"
  printf '| Image | Status | Evidence |\n'
  printf '|---|---|---|\n'
} >"$REPORT_DIR/summary.md"

index=0
for image in "$@"; do
  index=$((index + 1))
  output_name="image-$index"
  status="PASS"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    printf 'Production image is not available locally: %s\n' "$image" \
      >"$REPORT_DIR/$output_name.log"
    status="TOOL_ERROR"
    overall_status=1
  else
    scanner_rc=0
    if docker run --rm \
      --volume /var/run/docker.sock:/var/run/docker.sock \
      --volume feishu-timeline-trivy-cache:/root/.cache/trivy \
      "$TRIVY_IMAGE" \
      image \
      --scanners vuln \
      --exit-code 1 \
      --format json \
      --no-progress \
      "$image" >"$REPORT_DIR/$output_name.json" \
      2>"$REPORT_DIR/$output_name.tool.log"; then
      scanner_rc=0
    else
      scanner_rc=$?
    fi

    evaluator_rc=0
    if node "$ROOT_DIR/scripts/security/evaluate-trivy-report.mjs" \
      "$REPORT_DIR/$output_name.json" >"$REPORT_DIR/$output_name.log" 2>&1; then
      evaluator_rc=0
    else
      evaluator_rc=$?
    fi

    if [ "$evaluator_rc" -eq 1 ]; then
      status="BLOCKED"
      overall_status=1
    elif [ "$scanner_rc" -ne 0 ] || [ "$evaluator_rc" -ne 0 ]; then
      status="TOOL_ERROR"
      overall_status=1
      printf '\nTrivy exit code: %s; report evaluator exit code: %s.\n' \
        "$scanner_rc" "$evaluator_rc" >>"$REPORT_DIR/$output_name.log"
    fi
  fi

  printf '%s' "$status" >"$REPORT_DIR/$output_name.status"
  printf '| `%s` | %s | `reports/security/image-sca/%s.log` |\n' \
    "$image" "$status" "$output_name" >>"$REPORT_DIR/summary.md"
done

if [ "$overall_status" -ne 0 ]; then
  printf '\nFAIL — at least one image is blocked or a security tool failed.\n' \
    >>"$REPORT_DIR/summary.md"
else
  printf '\nPASS — no vulnerabilities at any reported severity were found in the production images.\n' \
    >>"$REPORT_DIR/summary.md"
fi

exit "$overall_status"
