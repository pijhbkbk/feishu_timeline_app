#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="$ROOT_DIR/reports/security/sca"
DOC_REPORT="$ROOT_DIR/docs/security/SCA_REPORT_R19.md"

mkdir -p "$REPORT_DIR" "$(dirname "$DOC_REPORT")"

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"

run_optional() {
  local name="$1"
  shift
  printf '[INFO] Running %s\n' "$name"
  if "$@" >"$REPORT_DIR/$name.log" 2>&1; then
    printf 'PASS' >"$REPORT_DIR/$name.status"
  else
    printf 'FAIL' >"$REPORT_DIR/$name.status"
  fi
}

run_optional pnpm-audit pnpm audit --audit-level high

osv_status="SKIPPED"
if command -v osv-scanner >/dev/null 2>&1; then
  if osv-scanner --lockfile "$ROOT_DIR/pnpm-lock.yaml" >"$REPORT_DIR/osv-scanner.log" 2>&1; then
    osv_status="PASS"
  else
    osv_status="FAIL"
  fi
elif command -v docker >/dev/null 2>&1; then
  if docker run --rm -v "$ROOT_DIR:/src" -w /src ghcr.io/google/osv-scanner:latest \
    --lockfile pnpm-lock.yaml >"$REPORT_DIR/osv-scanner.log" 2>&1; then
    osv_status="PASS"
  else
    osv_status="FAIL"
  fi
else
  printf 'osv-scanner and docker are not available.\n' >"$REPORT_DIR/osv-scanner.log"
fi
printf '%s' "$osv_status" >"$REPORT_DIR/osv-scanner.status"

trivy_fs_status="SKIPPED"
if command -v trivy >/dev/null 2>&1; then
  if trivy fs --severity HIGH,CRITICAL --ignore-unfixed --format table "$ROOT_DIR" \
    >"$REPORT_DIR/trivy-fs.log" 2>&1; then
    trivy_fs_status="PASS"
  else
    trivy_fs_status="FAIL"
  fi
elif command -v docker >/dev/null 2>&1; then
  if docker run --rm -v "$ROOT_DIR:/src" -w /src aquasec/trivy:latest \
    fs --severity HIGH,CRITICAL --ignore-unfixed --format table /src \
    >"$REPORT_DIR/trivy-fs.log" 2>&1; then
    trivy_fs_status="PASS"
  else
    trivy_fs_status="FAIL"
  fi
else
  printf 'trivy and docker are not available.\n' >"$REPORT_DIR/trivy-fs.log"
fi
printf '%s' "$trivy_fs_status" >"$REPORT_DIR/trivy-fs.status"

scan_image() {
  local image="$1"
  local output_name="$2"
  local status="SKIPPED"
  if ! command -v docker >/dev/null 2>&1; then
    printf 'docker is not available.\n' >"$REPORT_DIR/$output_name.log"
    printf '%s' "$status" >"$REPORT_DIR/$output_name.status"
    return
  fi
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    printf 'image %s is not available locally.\n' "$image" >"$REPORT_DIR/$output_name.log"
    printf '%s' "$status" >"$REPORT_DIR/$output_name.status"
    return
  fi
  if command -v trivy >/dev/null 2>&1; then
    if trivy image --severity HIGH,CRITICAL "$image" >"$REPORT_DIR/$output_name.log" 2>&1; then
      status="PASS"
    else
      status="FAIL"
    fi
  else
    if docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest \
      image --severity HIGH,CRITICAL "$image" >"$REPORT_DIR/$output_name.log" 2>&1; then
      status="PASS"
    else
      status="FAIL"
    fi
  fi
  printf '%s' "$status" >"$REPORT_DIR/$output_name.status"
}

scan_image feishu-timeline-api:latest trivy-image-api
scan_image feishu-timeline-web:latest trivy-image-web

cat >"$DOC_REPORT" <<EOF
# SCA Report R19

Generated: $timestamp
Commit: $commit

## Command Results

| Check | Status | Raw Output |
|---|---|---|
| pnpm audit --audit-level high | $(cat "$REPORT_DIR/pnpm-audit.status" 2>/dev/null || printf 'NOT_RUN') | reports/security/sca/pnpm-audit.log |
| osv-scanner --lockfile pnpm-lock.yaml | $osv_status | reports/security/sca/osv-scanner.log |
| trivy fs HIGH,CRITICAL | $trivy_fs_status | reports/security/sca/trivy-fs.log |
| trivy image feishu-timeline-api:latest | $(cat "$REPORT_DIR/trivy-image-api.status" 2>/dev/null || printf 'NOT_RUN') | reports/security/sca/trivy-image-api.log |
| trivy image feishu-timeline-web:latest | $(cat "$REPORT_DIR/trivy-image-web.status" 2>/dev/null || printf 'NOT_RUN') | reports/security/sca/trivy-image-web.log |

## Required Manual Review

- Critical dependency vulnerabilities must be fixed or proven not exploitable.
- High dependency vulnerabilities must be upgraded, replaced or temporarily mitigated.
- Do not delete lockfiles to make scanners pass.
- Avoid blind major upgrades that break the system.

## Current Acceptance

FAIL until findings are triaged and remediated.
EOF

printf '[INFO] Wrote %s\n' "$DOC_REPORT"
