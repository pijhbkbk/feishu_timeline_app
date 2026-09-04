#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY_TARGET="${DEPLOY_TARGET:-staging}"
STATIC_PROBE_PATH="${STATIC_PROBE_PATH:-/login}"
SHOW_COMPOSE_STATUS="${SHOW_COMPOSE_STATUS:-yes}"
MANIFEST_OVERRIDE=''
TMP_DIR="$(mktemp -d /tmp/feishu-release-health.XXXXXX)"
FAILURES=0
FAILURE_SUMMARY=()

# shellcheck source=scripts/deploy/common.sh
. "$ROOT_DIR/scripts/deploy/common.sh"

cleanup() {
  case "$TMP_DIR" in
    /tmp/feishu-release-health.*)
      find "$TMP_DIR" -mindepth 1 -depth -delete
      rmdir "$TMP_DIR"
      ;;
    *)
      printf '[WARN] Refusing to clean unexpected temporary path.\n' >&2
      ;;
  esac
}
trap cleanup EXIT

for arg in "$@"; do
  case "$arg" in
    DEPLOY_TARGET=*) DEPLOY_TARGET="${arg#*=}" ;;
    STATIC_PROBE_PATH=*) STATIC_PROBE_PATH="${arg#*=}" ;;
    SHOW_COMPOSE_STATUS=*) SHOW_COMPOSE_STATUS="${arg#*=}" ;;
    APPROVED_RELEASE_MANIFEST=*) MANIFEST_OVERRIDE="${arg#*=}" ;;
    *)
      printf '[ERROR] Unsupported health-check argument.\n' >&2
      exit 64
      ;;
  esac
done

case "$SHOW_COMPOSE_STATUS" in
  yes|no) ;;
  *)
    printf '[ERROR] SHOW_COMPOSE_STATUS must be yes or no.\n' >&2
    exit 64
    ;;
esac
if [ "${#STATIC_PROBE_PATH}" -gt 512 ] \
  || [[ ! "$STATIC_PROBE_PATH" =~ ^/[A-Za-z0-9._~/-]+$ ]] \
  || [[ "$STATIC_PROBE_PATH" == //* ]] \
  || [[ "$STATIC_PROBE_PATH" =~ (^|/)\.\.?(/|$) ]]; then
  printf '[ERROR] STATIC_PROBE_PATH must be a normalized absolute URL path.\n' >&2
  exit 64
fi

section() {
  printf '\n== %s ==\n' "$1"
}

pass() {
  printf '[PASS] %s\n' "$*"
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
  local output_name="$5"
  local header_file="$TMP_DIR/$output_name.headers"
  local body_file="$TMP_DIR/$output_name.json"
  local curl_args=(-k -sS --retry 2 --retry-delay 1 --retry-all-errors --connect-timeout 5 --max-time 20 -D "$header_file" -o "$body_file" -w '%{http_code}|%{url_effective}')
  local result
  local code
  local final_url

  if [ "$follow_redirects" = yes ]; then
    curl_args+=(-L --max-redirs 5)
  fi
  result="$(curl "${curl_args[@]}" "$url" 2>/dev/null || true)"
  code="${result%%|*}"
  final_url="${result#*|}"
  if [ "$code" = "$expected_code" ]; then
    pass "$name -> code=$code url=${final_url:-$url}"
  else
    record_failure "$name -> expected=$expected_code actual=${code:-<none>} url=${final_url:-$url}"
    [ -f "$body_file" ] || printf '{}\n' >"$body_file"
  fi
  LAST_BODY_FILE="$body_file"
}

extract_static_asset() {
  local body_file="$1"
  grep -Eo '/_next/static/[^"'"'"'<> ]+' "$body_file" | head -n1 || true
}

capture_json() {
  local output_file="$1"
  shift
  if ! "$@" >"$output_file" 2>/dev/null; then
    printf '[]\n' >"$output_file"
    return 1
  fi
}

verify_release_identity() {
  local api_container_id="$1"
  local web_container_id="$2"
  local postgres_container_id="$3"
  local redis_container_id="$4"
  local nginx_container_id="$5"
  local api_response="$6"
  local web_response="$7"
  local api_image_inspect="$TMP_DIR/api-image-inspect.json"
  local api_ops_image_inspect="$TMP_DIR/api-ops-image-inspect.json"
  local web_image_inspect="$TMP_DIR/web-image-inspect.json"
  local postgres_image_inspect="$TMP_DIR/postgres-image-inspect.json"
  local redis_image_inspect="$TMP_DIR/redis-image-inspect.json"
  local nginx_image_inspect="$TMP_DIR/nginx-image-inspect.json"
  local api_container_inspect="$TMP_DIR/api-container-inspect.json"
  local web_container_inspect="$TMP_DIR/web-container-inspect.json"
  local postgres_container_inspect="$TMP_DIR/postgres-container-inspect.json"
  local redis_container_inspect="$TMP_DIR/redis-container-inspect.json"
  local nginx_container_inspect="$TMP_DIR/nginx-container-inspect.json"
  local capture_failed=no

  capture_json "$api_image_inspect" docker image inspect "$RELEASE_API_IMAGE" \
    || capture_failed=yes
  capture_json "$api_ops_image_inspect" docker image inspect "$RELEASE_API_OPS_IMAGE" \
    || capture_failed=yes
  capture_json "$web_image_inspect" docker image inspect "$RELEASE_WEB_IMAGE" \
    || capture_failed=yes
  capture_json "$postgres_image_inspect" docker image inspect "$RELEASE_POSTGRES_IMAGE" \
    || capture_failed=yes
  capture_json "$redis_image_inspect" docker image inspect "$RELEASE_REDIS_IMAGE" \
    || capture_failed=yes
  capture_json "$nginx_image_inspect" docker image inspect "$RELEASE_NGINX_IMAGE" \
    || capture_failed=yes
  capture_json "$api_container_inspect" docker inspect "$api_container_id" \
    || capture_failed=yes
  capture_json "$web_container_inspect" docker inspect "$web_container_id" \
    || capture_failed=yes
  capture_json "$postgres_container_inspect" docker inspect "$postgres_container_id" \
    || capture_failed=yes
  capture_json "$redis_container_inspect" docker inspect "$redis_container_id" \
    || capture_failed=yes
  capture_json "$nginx_container_inspect" docker inspect "$nginx_container_id" \
    || capture_failed=yes

  if [ "$capture_failed" = yes ]; then
    record_failure 'Unable to collect complete immutable image/container evidence.'
    return
  fi

  if node "$RELEASE_IDENTITY_HELPER" verify-evidence \
    --manifest "$APPROVED_RELEASE_MANIFEST" \
    --expected-source-commit "$EXPECTED_SOURCE_COMMIT" \
    --expected-source-tree "$EXPECTED_SOURCE_TREE" \
    --expected-release "$EXPECTED_RELEASE" \
    --expected-build-time "$EXPECTED_BUILD_TIME" \
    --api-response "$api_response" \
    --web-response "$web_response" \
    --api-repository-digest "$RELEASE_API_IMAGE" \
    --api-ops-repository-digest "$RELEASE_API_OPS_IMAGE" \
    --web-repository-digest "$RELEASE_WEB_IMAGE" \
    --postgres-repository-digest "$RELEASE_POSTGRES_IMAGE" \
    --redis-repository-digest "$RELEASE_REDIS_IMAGE" \
    --nginx-repository-digest "$RELEASE_NGINX_IMAGE" \
    --api-image-inspect "$api_image_inspect" \
    --api-ops-image-inspect "$api_ops_image_inspect" \
    --web-image-inspect "$web_image_inspect" \
    --postgres-image-inspect "$postgres_image_inspect" \
    --redis-image-inspect "$redis_image_inspect" \
    --nginx-image-inspect "$nginx_image_inspect" \
    --api-container-inspect "$api_container_inspect" \
    --web-container-inspect "$web_container_inspect" \
    --postgres-container-inspect "$postgres_container_inspect" \
    --redis-container-inspect "$redis_container_inspect" \
    --nginx-container-inspect "$nginx_container_inspect"; then
    pass 'Approved manifest, all six product images, running containers and runtime identities agree'
  else
    record_failure 'Immutable release identity evidence is missing, malformed or inconsistent.'
  fi
}

run_staging_health_checks() {
  local http_port
  local web_port
  local api_port
  local asset_path
  local api_response
  local web_response
  local api_container_id
  local web_container_id
  local postgres_container_id
  local redis_container_id
  local nginx_container_id

  require_command docker
  require_command curl
  require_command node
  load_compose_env

  if [ -n "$MANIFEST_OVERRIDE" ]; then
    validate_config_path APPROVED_RELEASE_MANIFEST "$MANIFEST_OVERRIDE"
    if [ "$MANIFEST_OVERRIDE" != "$APPROVED_RELEASE_MANIFEST" ]; then
      fail 'Manifest CLI argument must exactly match APPROVED_RELEASE_MANIFEST in the protected environment file.'
    fi
  fi

  section 'Compose Service Status'
  wait_for_service_health postgres 180
  wait_for_service_health redis 120
  wait_for_service_health api 180
  wait_for_service_health web 180
  wait_for_service_health nginx 120
  if [ "$SHOW_COMPOSE_STATUS" = yes ]; then
    compose ps
  fi

  http_port="${STAGING_HTTP_PORT:-8080}"
  web_port="${STAGING_WEB_PORT:-3100}"
  api_port="${STAGING_API_PORT:-3101}"

  section 'HTTP Checks'
  probe_url 'nginx root' "http://127.0.0.1:${http_port}/" 200 yes nginx-root
  probe_url 'nginx login' "http://127.0.0.1:${http_port}/login" 200 yes nginx-login
  probe_url 'web login' "http://127.0.0.1:${web_port}/login" 200 yes web-login

  probe_url 'nginx API health' "http://127.0.0.1:${http_port}/api/health" 200 no api-identity
  api_response="$LAST_BODY_FILE"
  probe_url 'direct API health' "http://127.0.0.1:${api_port}/api/health" 200 no api-direct
  probe_url 'nginx Web build identity' "http://127.0.0.1:${http_port}/build-info" 200 no web-identity
  web_response="$LAST_BODY_FILE"
  probe_url 'direct Web build identity' "http://127.0.0.1:${web_port}/build-info" 200 no web-direct

  probe_url 'static asset source' "http://127.0.0.1:${http_port}${STATIC_PROBE_PATH}" 200 yes static-source
  asset_path="$(extract_static_asset "$LAST_BODY_FILE")"
  if [ -n "$asset_path" ]; then
    probe_url 'static asset' "http://127.0.0.1:${http_port}${asset_path}" 200 no static-asset
  else
    record_failure "Static asset probe found no asset path in $STATIC_PROBE_PATH."
  fi

  api_container_id="$(compose ps -q api || true)"
  web_container_id="$(compose ps -q web || true)"
  postgres_container_id="$(compose ps -q postgres || true)"
  redis_container_id="$(compose ps -q redis || true)"
  nginx_container_id="$(compose ps -q nginx || true)"
  if [ -z "$api_container_id" ] \
    || [ -z "$web_container_id" ] \
    || [ -z "$postgres_container_id" ] \
    || [ -z "$redis_container_id" ] \
    || [ -z "$nginx_container_id" ]; then
    record_failure 'One or more running product container identities are missing.'
  else
    verify_release_identity \
      "$api_container_id" \
      "$web_container_id" \
      "$postgres_container_id" \
      "$redis_container_id" \
      "$nginx_container_id" \
      "$api_response" \
      "$web_response"
  fi
}

print_summary() {
  section 'Failure Summary'
  if [ "$FAILURES" -eq 0 ]; then
    pass 'No failures detected'
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
    record_failure 'Production verification is disabled until RC3 supplies the external root-owned OCI release controller.'
    ;;
  *)
    printf '[ERROR] Unsupported DEPLOY_TARGET.\n' >&2
    exit 64
    ;;
esac

print_summary
