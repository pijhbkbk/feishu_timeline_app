#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY_TARGET="${DEPLOY_TARGET:-staging}"
APP_BASE_URL="${APP_BASE_URL:-https://timeline.all-too-well.com}"
APP_HOST="${APP_HOST:-timeline.all-too-well.com}"
STATIC_PROBE_PATH="${STATIC_PROBE_PATH:-/login}"
SHOW_COMPOSE_STATUS="${SHOW_COMPOSE_STATUS:-yes}"
TMP_DIR="$(mktemp -d)"
FAILURES=0
declare -a FAILURE_SUMMARY=()

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

for arg in "$@"; do
  case "$arg" in
    DEPLOY_TARGET=*) DEPLOY_TARGET="${arg#*=}" ;;
    APP_BASE_URL=*) APP_BASE_URL="${arg#*=}" ;;
    APP_HOST=*) APP_HOST="${arg#*=}" ;;
    STATIC_PROBE_PATH=*) STATIC_PROBE_PATH="${arg#*=}" ;;
    SHOW_COMPOSE_STATUS=*) SHOW_COMPOSE_STATUS="${arg#*=}" ;;
    *)
      printf '[ERROR] Unsupported argument: %s\n' "$arg" >&2
      exit 1
      ;;
  esac
done

section() {
  printf '\n== %s ==\n' "$1"
}

pass() {
  printf '[PASS] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

record_failure() {
  local message="$1"
  printf '[FAIL] %s\n' "$message" >&2
  FAILURE_SUMMARY+=("$message")
  FAILURES=$((FAILURES + 1))
}

probe_url() {
  local name="$1"
  local url="$2"
  local expected_code="${3:-200}"
  local follow_redirects="${4:-yes}"
  local header_file="$TMP_DIR/$(date +%s%N).headers"
  local body_file="$TMP_DIR/$(date +%s%N).body"
  local curl_args=(-k -sS --retry 2 --retry-delay 1 --retry-all-errors --connect-timeout 5 --max-time 20 -D "$header_file" -o "$body_file" -w '%{http_code}|%{url_effective}')
  local result
  local code
  local final_url

  if [ "$follow_redirects" = "yes" ]; then
    curl_args+=(-L --max-redirs 5)
  fi

  result="$(curl "${curl_args[@]}" "$url" 2>/dev/null || true)"
  code="${result%%|*}"
  final_url="${result#*|}"

  if [ "$code" = "$expected_code" ]; then
    pass "$name -> code=$code url=${final_url:-$url}"
  else
    record_failure "$name -> expected=$expected_code actual=${code:-<none>} url=${final_url:-$url}"
  fi

  LAST_HEADER_FILE="$header_file"
  LAST_BODY_FILE="$body_file"
  LAST_HTTP_CODE="$code"
  LAST_FINAL_URL="$final_url"
}

extract_static_asset() {
  local body_file="$1"

  grep -Eo '/_next/static/[^"'"'"'<> ]+' "$body_file" | head -n1 || true
}

run_staging_health_checks() {
  local HTTP_PORT WEB_PORT API_PORT asset_path

  # shellcheck source=/dev/null
  . "$ROOT_DIR/scripts/deploy/common.sh"

  require_command docker
  require_command curl

  load_compose_env
  load_release_state_if_present

  section "Compose Service Status"
  wait_for_service_health postgres 180
  wait_for_service_health redis 120
  wait_for_service_health api 180
  wait_for_service_health web 180
  wait_for_service_health nginx 120

  if [ "$SHOW_COMPOSE_STATUS" = "yes" ]; then
    compose ps
  fi

  HTTP_PORT="${STAGING_HTTP_PORT:-8080}"
  WEB_PORT="${STAGING_WEB_PORT:-3100}"
  API_PORT="${STAGING_API_PORT:-3101}"

  section "HTTP Checks"
  probe_url "nginx root" "http://127.0.0.1:${HTTP_PORT}/" "200" "yes"
  probe_url "nginx login" "http://127.0.0.1:${HTTP_PORT}/login" "200" "yes"
  probe_url "web login" "http://127.0.0.1:${WEB_PORT}/login" "200" "yes"
  probe_url "nginx api health" "http://127.0.0.1:${HTTP_PORT}/api/health" "200" "no"
  if grep -q '"status":"ok"' "$LAST_BODY_FILE" 2>/dev/null; then
    pass "nginx api health payload -> status=ok"
  else
    record_failure "nginx api health payload missing status=ok"
  fi

  probe_url "api health" "http://127.0.0.1:${API_PORT}/api/health" "200" "no"
  if grep -q '"status":"ok"' "$LAST_BODY_FILE" 2>/dev/null; then
    pass "api health payload -> status=ok"
  else
    record_failure "api health payload missing status=ok"
  fi

  probe_url "static asset source" "http://127.0.0.1:${HTTP_PORT}${STATIC_PROBE_PATH}" "200" "yes"
  asset_path="$(extract_static_asset "$LAST_BODY_FILE")"
  if [ -n "$asset_path" ]; then
    probe_url "static asset" "http://127.0.0.1:${HTTP_PORT}${asset_path}" "200" "no"
  else
    record_failure "static asset probe -> no asset path found in ${STATIC_PROBE_PATH}"
  fi
}

run_production_service_checks() {
  local remote_script
  local line name status

  # shellcheck source=/dev/null
  . "$ROOT_DIR/scripts/deploy/gce-common.sh"
  require_gcloud

  remote_script="$(mktemp)"
  cat >"$remote_script" <<'EOF'
set -euo pipefail
for svc in feishu-timeline-api feishu-timeline-web nginx postgresql redis-server; do
  printf '%s=%s\n' "$svc" "$(systemctl is-active "$svc" || true)"
done
EOF

  section "Remote Service Status"
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    name="${line%%=*}"
    status="${line#*=}"
    if [ "$status" = "active" ]; then
      pass "$name -> $status"
    else
      record_failure "$name -> expected=active actual=${status:-<none>}"
    fi
  done < <(gce_run_remote_script "$remote_script")
  rm -f "$remote_script"
}

run_production_http_checks() {
  local asset_path

  require_command curl

  section "HTTP Checks"
  probe_url "root" "${APP_BASE_URL}/" "200" "yes"
  probe_url "login" "${APP_BASE_URL}/login" "200" "yes"
  probe_url "dashboard" "${APP_BASE_URL}/dashboard" "200" "yes"
  probe_url "projects" "${APP_BASE_URL}/projects" "200" "yes"
  probe_url "api health" "${APP_BASE_URL}/api/health" "200" "no"
  if grep -q '"status":"ok"' "$LAST_BODY_FILE" 2>/dev/null; then
    pass "api health payload -> status=ok"
  else
    record_failure "api health payload missing status=ok"
  fi

  probe_url "static asset source" "${APP_BASE_URL}${STATIC_PROBE_PATH}" "200" "yes"
  asset_path="$(extract_static_asset "$LAST_BODY_FILE")"
  if [ -n "$asset_path" ]; then
    probe_url "static asset" "${APP_BASE_URL}${asset_path}" "200" "no"
  else
    record_failure "static asset probe -> no asset path found in ${STATIC_PROBE_PATH}"
  fi
}

print_summary() {
  section "Failure Summary"

  if [ "$FAILURES" -eq 0 ]; then
    pass "No failures detected"
    return 0
  fi

  local item
  for item in "${FAILURE_SUMMARY[@]}"; do
    printf ' - %s\n' "$item" >&2
  done

  return 1
}

case "$DEPLOY_TARGET" in
  staging)
    run_staging_health_checks
    ;;
  production|prod)
    run_production_service_checks
    run_production_http_checks
    ;;
  *)
    printf '[ERROR] Unsupported DEPLOY_TARGET=%s\n' "$DEPLOY_TARGET" >&2
    exit 1
    ;;
esac

print_summary
