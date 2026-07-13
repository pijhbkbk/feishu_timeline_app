#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="${SECURITY_REPORT_DIR:-$ROOT_DIR/reports/security/secrets}"
DOC_REPORT="${SECRETS_DOC_REPORT:-$ROOT_DIR/docs/security/SECRETS_SCAN_R19.md}"
ROOT_GITLEAKS_REPORT="${ROOT_GITLEAKS_REPORT:-$ROOT_DIR/reports/security/gitleaks-report.json}"
GITLEAKS_VERSION="8.30.1"
GITLEAKS_IMAGE_DEFAULT="ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f"
GITLEAKS_IMAGE="${GITLEAKS_IMAGE:-$GITLEAKS_IMAGE_DEFAULT}"
GITLEAKS_EXECUTION_MODE="${GITLEAKS_EXECUTION_MODE:-auto}"

mkdir -p "$REPORT_DIR" "$(dirname "$DOC_REPORT")" \
  "$(dirname "$ROOT_GITLEAKS_REPORT")"
rm -f "$REPORT_DIR"/gitleaks*.json "$REPORT_DIR"/gitleaks*.log \
  "$REPORT_DIR"/gitleaks*.status "$REPORT_DIR"/gitleaks*.txt

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
overall_status=0
runner=""
runner_error=""

select_runner() {
  case "$GITLEAKS_EXECUTION_MODE" in
    auto)
      if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        runner="docker"
      elif command -v gitleaks >/dev/null 2>&1; then
        runner="native"
      else
        runner_error="Pinned Gitleaks is unavailable: Docker daemon and native Gitleaks were not found."
      fi
      ;;
    docker)
      if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        runner="docker"
      else
        runner_error="GITLEAKS_EXECUTION_MODE=docker but the Docker daemon is unavailable."
      fi
      ;;
    native)
      if command -v gitleaks >/dev/null 2>&1; then
        runner="native"
      else
        runner_error="GITLEAKS_EXECUTION_MODE=native but Gitleaks is unavailable."
      fi
      ;;
    *)
      runner_error="Unsupported GITLEAKS_EXECUTION_MODE: $GITLEAKS_EXECUTION_MODE"
      ;;
  esac

  if [ "$runner" = "native" ]; then
    version_output=""
    if ! version_output="$(gitleaks version 2>/dev/null)"; then
      runner=""
      runner_error="Native Gitleaks failed while reporting its version."
      return
    fi
    installed_version="$(printf '%s' "$version_output" | sed 's/^v//' | tr -d '[:space:]')"
    if [ "$installed_version" != "$GITLEAKS_VERSION" ]; then
      runner=""
      runner_error="Gitleaks version mismatch: expected $GITLEAKS_VERSION, found ${installed_version:-unknown}."
    fi
  fi
}

select_runner

history_preflight_error=""
git_dir="$(git -C "$ROOT_DIR" rev-parse --absolute-git-dir 2>/dev/null || true)"
shallow_repository="$(git -C "$ROOT_DIR" rev-parse --is-shallow-repository 2>/dev/null || true)"

if [ -z "$git_dir" ]; then
  history_preflight_error="Git history scan requires a valid Git repository."
elif [ -s "$git_dir/shallow" ] || [ "$shallow_repository" = "true" ]; then
  history_preflight_error="Git history scan refused a shallow repository (.git/shallow is present). Fetch full history before scanning."
elif [ "$shallow_repository" != "false" ]; then
  history_preflight_error="Unable to determine whether the Git repository contains full history."
fi

CURRENT_SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$CURRENT_SCAN_DIR"' EXIT
current_manifest="$REPORT_DIR/current-tree-files.txt"
: >"$current_manifest"

while IFS= read -r -d '' path; do
  [ -f "$ROOT_DIR/$path" ] || continue
  printf '%s\n' "$path" >>"$current_manifest"
  mkdir -p "$CURRENT_SCAN_DIR/$(dirname "$path")"
  cp -p "$ROOT_DIR/$path" "$CURRENT_SCAN_DIR/$path"
done < <(git -C "$ROOT_DIR" ls-files --cached --others --exclude-standard -z)

run_gitleaks_scan() {
  local scan_kind="$1"
  local output_name="$2"
  local report_file="$REPORT_DIR/$output_name.json"
  local log_file="$REPORT_DIR/$output_name.log"
  local summary_file="$REPORT_DIR/$output_name.txt"
  local scanner_rc=0
  local evaluator_rc=0
  local status="PASS"

  printf '[]\n' >"$report_file"

  if [ "$scan_kind" = "history" ] && [ -n "$history_preflight_error" ]; then
    printf '%s\n' "$history_preflight_error" >"$log_file"
    scanner_rc=2
  elif [ -z "$runner" ]; then
    printf '%s\n' "$runner_error" >"$log_file"
    scanner_rc=2
  elif [ "$runner" = "docker" ]; then
    if [ "$scan_kind" = "directory" ]; then
      if docker run --rm \
        --volume "$CURRENT_SCAN_DIR:/scan:ro" \
        --volume "$REPORT_DIR:/reports" \
        "$GITLEAKS_IMAGE" \
        dir /scan \
        --redact \
        --no-banner \
        --no-color \
        --timeout 300 \
        --report-format json \
        --report-path "/reports/$output_name.json" \
        >"$log_file" 2>&1; then
        scanner_rc=0
      else
        scanner_rc=$?
      fi
    elif docker run --rm \
      --env GIT_CONFIG_COUNT=1 \
      --env GIT_CONFIG_KEY_0=safe.directory \
      --env GIT_CONFIG_VALUE_0=/repo \
      --volume "$ROOT_DIR:/repo:ro" \
      --volume "$REPORT_DIR:/reports" \
      "$GITLEAKS_IMAGE" \
      git /repo \
      --log-opts=--all \
      --redact \
      --no-banner \
      --no-color \
      --timeout 300 \
      --report-format json \
      --report-path "/reports/$output_name.json" \
      >"$log_file" 2>&1; then
      scanner_rc=0
    else
      scanner_rc=$?
    fi
  elif [ "$scan_kind" = "directory" ]; then
    if gitleaks dir "$CURRENT_SCAN_DIR" \
      --redact \
      --no-banner \
      --no-color \
      --timeout 300 \
      --report-format json \
      --report-path "$report_file" \
      >"$log_file" 2>&1; then
      scanner_rc=0
    else
      scanner_rc=$?
    fi
  elif gitleaks git "$ROOT_DIR" \
    --log-opts=--all \
    --redact \
    --no-banner \
    --no-color \
    --timeout 300 \
    --report-format json \
    --report-path "$report_file" \
    >"$log_file" 2>&1; then
    scanner_rc=0
  else
    scanner_rc=$?
  fi

  if node "$ROOT_DIR/scripts/security/evaluate-gitleaks-report.mjs" \
    "$report_file" >"$summary_file" 2>&1; then
    evaluator_rc=0
  else
    evaluator_rc=$?
  fi

  if [ "$evaluator_rc" -eq 1 ] && { [ "$scanner_rc" -eq 0 ] || [ "$scanner_rc" -eq 1 ]; }; then
    status="BLOCKED"
    overall_status=1
  elif [ "$scanner_rc" -ne 0 ] || [ "$evaluator_rc" -ne 0 ]; then
    status="TOOL_ERROR"
    overall_status=1
    printf '\nGitleaks exit code: %s; report evaluator exit code: %s.\n' \
      "$scanner_rc" "$evaluator_rc" >>"$summary_file"
  fi

  printf '%s' "$status" >"$REPORT_DIR/$output_name.status"
}

run_gitleaks_scan directory gitleaks-current
run_gitleaks_scan history gitleaks-history

cp "$REPORT_DIR/gitleaks-current.json" "$ROOT_GITLEAKS_REPORT"

{
  printf '# Environment-like Files\n\n'
  find "$ROOT_DIR" \
    -path '*/node_modules' -prune -o \
    -path '*/.next' -prune -o \
    -path '*/dist' -prune -o \
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
    -g '!node_modules/**' -g '!.git/**' -g '!reports/**' \
    -g '!.next/**' -g '!dist/**' 2>/dev/null || true
} >"$REPORT_DIR/sensitive-key-name-locations.txt"

{
  printf '# Git Ignore Checks\n\n'
  for path in \
    .env \
    .env.production \
    apps/api/.env.production \
    apps/web/.env.production \
    deploy/env/production.env; do
    if git -C "$ROOT_DIR" check-ignore -v "$path" >"$REPORT_DIR/gitignore-match.tmp" 2>/dev/null; then
      printf 'PASS %s -> %s\n' "$path" "$(cat "$REPORT_DIR/gitignore-match.tmp")"
    else
      printf 'FAIL %s is not ignored\n' "$path"
    fi
  done
  rm -f "$REPORT_DIR/gitignore-match.tmp"
} >"$REPORT_DIR/gitignore-check.txt"

current_status="$(cat "$REPORT_DIR/gitleaks-current.status")"
history_status="$(cat "$REPORT_DIR/gitleaks-history.status")"
if [ "$overall_status" -eq 0 ]; then
  acceptance="PASS — current candidate files and full Git history contain no detected secret."
else
  acceptance="FAIL — a secret finding or Gitleaks tool failure must be resolved before merge."
fi

cat >"$DOC_REPORT" <<EOF
# Secrets Scan R19B

Generated: $timestamp
Commit: $commit
Scanner: \`$GITLEAKS_IMAGE\`

## Command Results

| Check | Status | Raw Output |
|---|---|---|
| Gitleaks current tracked/untracked candidate files | $current_status | reports/security/secrets/gitleaks-current.log |
| Gitleaks full Git history | $history_status | reports/security/secrets/gitleaks-history.log |
| Current-tree target manifest | INFO | reports/security/secrets/current-tree-files.txt |
| Environment-like file inventory | INFO | reports/security/secrets/env-files.txt |
| Sensitive key name location scan | INFO | reports/security/secrets/sensitive-key-name-locations.txt |
| .gitignore protection check | INFO | reports/security/secrets/gitignore-check.txt |

Reports are redacted. Do not paste or copy secret values into review records. A confirmed
secret exposure is Critical and requires immediate rotation through the owning platform.

## Current Acceptance

$acceptance
EOF

printf '[INFO] Wrote %s\n' "$DOC_REPORT"
exit "$overall_status"
