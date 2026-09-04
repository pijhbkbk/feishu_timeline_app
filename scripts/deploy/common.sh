#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/deploy/compose.staging.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-$ROOT_DIR/deploy/env/staging.env}"
COMPOSE_ENV_EXAMPLE="${COMPOSE_ENV_EXAMPLE:-$ROOT_DIR/deploy/env/staging.env.example}"
STATE_DIR="${STATE_DIR:-$ROOT_DIR/deploy/.state}"
RELEASE_IDENTITY_HELPER="$ROOT_DIR/scripts/deploy/release-identity.mjs"

COMPOSE_ENV_ALLOWED_KEYS=(
  COMPOSE_PROJECT_NAME
  DEPLOYMENT_ENV
  APPROVED_RELEASE_MANIFEST
  APPROVED_API_IMAGE
  APPROVED_API_OPS_IMAGE
  APPROVED_WEB_IMAGE
  APPROVED_POSTGRES_IMAGE
  EXPECTED_SOURCE_COMMIT
  EXPECTED_SOURCE_TREE
  EXPECTED_RELEASE
  EXPECTED_BUILD_TIME
  STAGING_HTTP_PORT
  STAGING_WEB_PORT
  STAGING_API_PORT
  STAGING_POSTGRES_PORT
  STAGING_REDIS_PORT
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
  FRONTEND_URL
  DATABASE_URL
  REDIS_PASSWORD
  REDIS_URL
  AUTH_MOCK_ENABLED
  SESSION_COOKIE_NAME
  SESSION_TTL_SECONDS
  NOTIFICATION_QUEUE_ENABLED
  NOTIFICATION_QUEUE_POLL_MS
  NOTIFICATION_OVERDUE_SCAN_MS
  NOTIFICATION_RETRY_DELAY_MS
  NOTIFICATION_MAX_RETRIES
  NOTIFICATION_REDIS_QUEUE_MAX_JOBS
  NOTIFICATION_MEMORY_QUEUE_MAX_JOBS
  NOTIFICATION_MEMORY_DEDUPE_MAX_KEYS
  NOTIFICATION_JOB_MAX_BYTES
  NOTIFICATION_SCAN_BATCH_SIZE
  NOTIFICATION_SCAN_MAX_ITEMS
  SUPPLIER_CATALOG_MAX_ITEMS
  SUPPLIER_MUTATION_MAX_REQUESTS
  SUPPLIER_MUTATION_WINDOW_MS
  OBJECT_STORAGE_PROVIDER
  OBJECT_STORAGE_LOCAL_ROOT
  OBJECT_STORAGE_ENDPOINT
  OBJECT_STORAGE_BUCKET
  OBJECT_STORAGE_ACCESS_KEY
  OBJECT_STORAGE_SECRET_KEY
  ATTACHMENT_STORAGE_GLOBAL_MAX_BYTES
  ATTACHMENT_STORAGE_PROJECT_MAX_BYTES
  ATTACHMENT_STORAGE_ACTOR_MAX_BYTES
  ATTACHMENT_STORAGE_GLOBAL_MAX_OBJECTS
  ATTACHMENT_STORAGE_PROJECT_MAX_OBJECTS
  ATTACHMENT_STORAGE_ACTOR_MAX_OBJECTS
  ATTACHMENT_STORAGE_MIN_FREE_BYTES
  ATTACHMENT_STORAGE_RESERVATION_TTL_MS
  ATTACHMENT_STORAGE_ACTOR_WINDOW_MS
  ATTACHMENT_STORAGE_RECONCILE_INTERVAL_MS
  ATTACHMENT_STORAGE_RECONCILE_BATCH_SIZE
  ATTACHMENT_STORAGE_RECONCILIATION_LEASE_MS
  ATTACHMENT_STORAGE_RECONCILIATION_RETRY_MS
  ATTACHMENT_STORAGE_PURGED_METADATA_RETENTION_MS
  MALWARE_SCANNER_PROVIDER
  CLAMAV_HOST
  CLAMAV_PORT
  CLAMAV_TIMEOUT_MS
  UPLOAD_ADMISSION_GLOBAL_LIMIT
  UPLOAD_ADMISSION_PER_ACTOR_LIMIT
  UPLOAD_ADMISSION_PER_TARGET_LIMIT
  UPLOAD_ADMISSION_RATE_MAX_REQUESTS
  UPLOAD_ADMISSION_RATE_WINDOW_MS
  DOWNLOAD_ADMISSION_GLOBAL_LIMIT
  DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT
  DOWNLOAD_ADMISSION_PER_TARGET_LIMIT
  DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS
  DOWNLOAD_ADMISSION_RATE_WINDOW_MS
  API_MEM_LIMIT
  API_PIDS_LIMIT
  FEISHU_APP_ID
  FEISHU_APP_SECRET
  FEISHU_REDIRECT_URI
  OAUTH_PROVIDER
  FEISHU_AUTHORIZATION_ENDPOINT
  NEXT_PUBLIC_APP_NAME
  NEXT_PUBLIC_API_BASE_URL
  NEXT_PUBLIC_ENABLE_MOCK_LOGIN
  NEXT_PUBLIC_UI_VERSION
  NEXT_PUBLIC_UI_DATA_MODE
  V1_FALLBACK_ENABLED
  NEXT_PUBLIC_R26_V2_PROTOTYPE
  NEXT_PUBLIC_R26_V2_DATA_MODE
  REDIS_IMAGE
  NGINX_IMAGE
)

RELEASE_STATE_ALLOWED_KEYS=(
  API_IMAGE_REPO
  API_OPS_IMAGE_REPO
  WEB_IMAGE_REPO
  POSTGRES_IMAGE_REPO
  IMAGE_TAG
  RELEASED_AT
  GIT_SHA
  GIT_DIRTY
  OCI_CREATED
  OCI_SOURCE
  OCI_VERSION
  API_IMAGE_ID
  API_OPS_IMAGE_ID
  WEB_IMAGE_ID
  POSTGRES_IMAGE_ID
  REDIS_IMAGE
  REDIS_IMAGE_ID
  NGINX_IMAGE
  NGINX_IMAGE_ID
)

log() {
  printf '[INFO] %s\n' "$*"
}

fail() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

validate_config_path() {
  local label="$1"
  local path="$2"

  if [ -z "$path" ] \
    || [ "${#path}" -gt 1024 ] \
    || [[ "$path" != /* ]] \
    || [[ "$path" =~ [[:cntrl:]] ]] \
    || [[ ! "$path" =~ ^/[A-Za-z0-9._/-]+$ ]] \
    || [[ "$path" =~ (^|/)\.\.?(/|$) ]]; then
    fail "$label must be an absolute normalized path using safe characters."
  fi
}

source_free_load_env_file() {
  local file="$1"
  shift
  local key
  local value
  local line
  local allowed_key
  local is_allowed
  local seen_keys=$'\n'
  local file_size

  validate_config_path 'Configuration file' "$file"
  [[ -f "$file" && ! -L "$file" ]] \
    || fail "Configuration file must be a regular non-symlink file: $file"
  file_size="$(wc -c <"$file" | tr -d '[:space:]')"
  [[ "$file_size" =~ ^[0-9]+$ ]] && [ "$file_size" -le 131072 ] \
    || fail "Configuration file exceeds the 128 KiB limit: $file"
  if LC_ALL=C od -An -v -t x1 "$file" | grep -Eq '(^|[[:space:]])00([[:space:]]|$)'; then
    fail "Configuration file contains NUL: $file"
  fi
  if LC_ALL=C grep -q $'\r' "$file"; then
    fail "Configuration file contains a carriage return: $file"
  fi

  for allowed_key in "$@"; do
    unset "$allowed_key"
  done

  while IFS= read -r line || [ -n "$line" ]; do
    [ -z "$line" ] && continue
    [[ "$line" == \#* ]] && continue
    [ "${#line}" -le 8192 ] || fail "Configuration line exceeds 8192 characters: $file"
    [[ "$line" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]] \
      || fail "Configuration file contains an invalid line: $file"
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    is_allowed=no
    for allowed_key in "$@"; do
      if [ "$key" = "$allowed_key" ]; then
        is_allowed=yes
        break
      fi
    done
    [ "$is_allowed" = yes ] || fail "Configuration key is not allowlisted: $key"
    case "$seen_keys" in
      *$'\n'"$key"$'\n'*) fail "Configuration key is duplicated: $key" ;;
    esac
    seen_keys="${seen_keys}${key}"$'\n'
    [ "${#value}" -le 4096 ] || fail "Configuration value is too long: $key"
    printf -v "$key" '%s' "$value"
    export "$key"
  done <"$file"
}

validate_digest_pinned_image() {
  local label="$1"
  local image="$2"
  local reference
  local digest

  if [ -z "$image" ] \
    || [ "${#image}" -gt 335 ] \
    || [[ ! "$image" =~ ^([^@]+)@sha256:([a-f0-9]{64})$ ]]; then
    fail "$label must be an image reference pinned as image@sha256:<64 lowercase hex characters>."
  fi

  reference="${BASH_REMATCH[1]}"
  digest="${BASH_REMATCH[2]}"
  if [ "${#reference}" -gt 255 ] \
    || { [ "${#reference}" -gt 1 ] \
      && [[ ! "$reference" =~ ^[a-z0-9][a-z0-9._/:_-]*[a-z0-9]$ ]]; } \
    || [[ ! "$reference" =~ ^[a-z0-9._/:_-]+$ ]] \
    || [[ "$reference" == *..* ]] \
    || [[ "$reference" == *//* ]] \
    || [[ "$reference" == *::* ]] \
    || [[ ! "$digest" =~ ^[a-f0-9]{64}$ ]] \
    || [[ "$digest" =~ ^0{64}$ ]] \
    || [[ "$reference" =~ (placeholder|replace[-_]?with|replace[-_]?me) ]]; then
    fail "$label contains an invalid digest-pinned image reference."
  fi
}

ensure_compose_env_file() {
  validate_config_path COMPOSE_ENV_FILE "$COMPOSE_ENV_FILE"
  validate_config_path COMPOSE_ENV_EXAMPLE "$COMPOSE_ENV_EXAMPLE"
  mkdir -p "$(dirname "$COMPOSE_ENV_FILE")"

  if [[ ! -f "$COMPOSE_ENV_FILE" ]]; then
    umask 077
    cp "$COMPOSE_ENV_EXAMPLE" "$COMPOSE_ENV_FILE"
    chmod 600 "$COMPOSE_ENV_FILE"
    fail "Created $COMPOSE_ENV_FILE from the template. Replace every placeholder and rerun; deployment did not start."
  fi

  local env_mode
  env_mode="$(stat -c '%a' "$COMPOSE_ENV_FILE" 2>/dev/null \
    || stat -f '%Lp' "$COMPOSE_ENV_FILE" 2>/dev/null \
    || true)"
  [[ "$env_mode" =~ ^[0-7]00$ ]] \
    || fail "Staging environment file must not be readable by group/other users (required mode: 600 or stricter)."
}

validate_staging_security_env() {
  local database_prefix
  local scanner_host

  [[ "${DEPLOYMENT_ENV:-}" == "staging" ]] \
    || fail "DEPLOYMENT_ENV must be staging for staging deployment."
  [[ "${AUTH_MOCK_ENABLED:-}" == "false" ]] \
    || fail "AUTH_MOCK_ENABLED must be false for staging deployment."
  [[ "${NEXT_PUBLIC_ENABLE_MOCK_LOGIN:-}" == "false" ]] \
    || fail "NEXT_PUBLIC_ENABLE_MOCK_LOGIN must be false for staging deployment."

  validate_digest_pinned_image APPROVED_API_IMAGE "${APPROVED_API_IMAGE:-}"
  validate_digest_pinned_image APPROVED_API_OPS_IMAGE "${APPROVED_API_OPS_IMAGE:-}"
  validate_digest_pinned_image APPROVED_WEB_IMAGE "${APPROVED_WEB_IMAGE:-}"
  validate_digest_pinned_image APPROVED_POSTGRES_IMAGE "${APPROVED_POSTGRES_IMAGE:-}"
  validate_config_path APPROVED_RELEASE_MANIFEST "${APPROVED_RELEASE_MANIFEST:-}"
  [[ -f "$APPROVED_RELEASE_MANIFEST" && ! -L "$APPROVED_RELEASE_MANIFEST" ]] \
    || fail "APPROVED_RELEASE_MANIFEST must be a regular non-symlink file."
  require_command node
  node "$RELEASE_IDENTITY_HELPER" validate-identity \
    --source-commit "${EXPECTED_SOURCE_COMMIT:-}" \
    --source-tree "${EXPECTED_SOURCE_TREE:-}" \
    --release "${EXPECTED_RELEASE:-}" \
    --build-time "${EXPECTED_BUILD_TIME:-}" \
    || fail "Expected release identity is invalid."
  node "$RELEASE_IDENTITY_HELPER" validate-manifest \
    --manifest "$APPROVED_RELEASE_MANIFEST" \
    || fail "Approved release manifest is invalid."
  node "$RELEASE_IDENTITY_HELPER" validate-approval \
    --manifest "$APPROVED_RELEASE_MANIFEST" \
    --expected-source-commit "$EXPECTED_SOURCE_COMMIT" \
    --expected-source-tree "$EXPECTED_SOURCE_TREE" \
    --expected-release "$EXPECTED_RELEASE" \
    --expected-build-time "$EXPECTED_BUILD_TIME" \
    --api-repository-digest "$APPROVED_API_IMAGE" \
    --api-ops-repository-digest "$APPROVED_API_OPS_IMAGE" \
    --web-repository-digest "$APPROVED_WEB_IMAGE" \
    || fail "Approved manifest does not match the expected identity and image digests."

  [[ "${POSTGRES_PASSWORD:-}" =~ ^[A-Za-z0-9_-]{20,}$ ]] \
    || fail "POSTGRES_PASSWORD must be at least 20 URL-safe characters."
  [[ "$POSTGRES_PASSWORD" != replace-* && "$POSTGRES_PASSWORD" != "postgres" ]] \
    || fail "POSTGRES_PASSWORD still uses a template/default value."
  database_prefix="postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@postgres:5432/"
  [[ "${DATABASE_URL:-}" == "$database_prefix"* ]] \
    || fail "DATABASE_URL must authenticate to the staging PostgreSQL service with the configured credentials."

  [[ "${REDIS_PASSWORD:-}" =~ ^[A-Za-z0-9_-]{20,}$ ]] \
    || fail "REDIS_PASSWORD must be at least 20 URL-safe characters."
  [[ "$REDIS_PASSWORD" != replace-* ]] \
    || fail "REDIS_PASSWORD still uses a template value."
  [[ "${REDIS_URL:-}" == "redis://:${REDIS_PASSWORD}@redis:6379" ]] \
    || fail "REDIS_URL must authenticate with REDIS_PASSWORD on the staging Redis service."

  [[ "${MALWARE_SCANNER_PROVIDER:-}" == "clamav" ]] \
    || fail "MALWARE_SCANNER_PROVIDER must be clamav for staging deployment."
  scanner_host="${CLAMAV_HOST:-}"
  if [ "${#scanner_host}" -gt 253 ] \
    || [[ ! "$scanner_host" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] \
    || [[ "$scanner_host" == *..* ]] \
    || [[ "$scanner_host" == "localhost" ]] \
    || [[ "$scanner_host" == 127.* ]] \
    || [[ "$scanner_host" == *.localhost ]] \
    || [[ "$scanner_host" == replace-* ]] \
    || [[ "$scanner_host" == *placeholder* ]]; then
    fail "CLAMAV_HOST must be an approved non-placeholder scanner hostname."
  fi
  if [[ ! "${CLAMAV_PORT:-}" =~ ^[1-9][0-9]*$ ]] \
    || [ "$CLAMAV_PORT" -gt 65535 ]; then
    fail "CLAMAV_PORT must be an integer from 1 through 65535."
  fi
  if [[ ! "${CLAMAV_TIMEOUT_MS:-}" =~ ^[1-9][0-9]*$ ]] \
    || [ "$CLAMAV_TIMEOUT_MS" -lt 1000 ] \
    || [ "$CLAMAV_TIMEOUT_MS" -gt 60000 ]; then
    fail "CLAMAV_TIMEOUT_MS must be an integer from 1000 through 60000."
  fi

  if [[ ! "${UPLOAD_ADMISSION_GLOBAL_LIMIT:-}" =~ ^[1-4]$ ]]; then
    fail "UPLOAD_ADMISSION_GLOBAL_LIMIT must be an integer from 1 through 4."
  fi
  if [[ ! "${UPLOAD_ADMISSION_PER_ACTOR_LIMIT:-}" =~ ^[1-4]$ ]] \
    || [ "$UPLOAD_ADMISSION_PER_ACTOR_LIMIT" -gt "$UPLOAD_ADMISSION_GLOBAL_LIMIT" ]; then
    fail "UPLOAD_ADMISSION_PER_ACTOR_LIMIT must be from 1 through 4 and not exceed the global limit."
  fi
  if [[ ! "${UPLOAD_ADMISSION_PER_TARGET_LIMIT:-}" =~ ^[1-4]$ ]]; then
    fail "UPLOAD_ADMISSION_PER_TARGET_LIMIT must be an integer from 1 through 4."
  fi
  if [[ ! "${UPLOAD_ADMISSION_RATE_MAX_REQUESTS:-}" =~ ^[1-9][0-9]?$ ]] \
    || [ "$UPLOAD_ADMISSION_RATE_MAX_REQUESTS" -gt 60 ]; then
    fail "UPLOAD_ADMISSION_RATE_MAX_REQUESTS must be an integer from 1 through 60."
  fi
  if [[ ! "${UPLOAD_ADMISSION_RATE_WINDOW_MS:-}" =~ ^[1-9][0-9]*$ ]] \
    || [ "$UPLOAD_ADMISSION_RATE_WINDOW_MS" -lt 1000 ] \
    || [ "$UPLOAD_ADMISSION_RATE_WINDOW_MS" -gt 300000 ]; then
    fail "UPLOAD_ADMISSION_RATE_WINDOW_MS must be an integer from 1000 through 300000."
  fi
  if [[ ! "${DOWNLOAD_ADMISSION_GLOBAL_LIMIT:-}" =~ ^[1-9][0-9]?$ ]] \
    || [ "$DOWNLOAD_ADMISSION_GLOBAL_LIMIT" -gt 32 ]; then
    fail "DOWNLOAD_ADMISSION_GLOBAL_LIMIT must be an integer from 1 through 32."
  fi
  if [[ ! "${DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT:-}" =~ ^[1-8]$ ]] \
    || [ "$DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT" -gt "$DOWNLOAD_ADMISSION_GLOBAL_LIMIT" ]; then
    fail "DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT must be from 1 through 8 and not exceed the global limit."
  fi
  if [[ ! "${DOWNLOAD_ADMISSION_PER_TARGET_LIMIT:-}" =~ ^[1-8]$ ]] \
    || [ "$DOWNLOAD_ADMISSION_PER_TARGET_LIMIT" -gt "$DOWNLOAD_ADMISSION_GLOBAL_LIMIT" ]; then
    fail "DOWNLOAD_ADMISSION_PER_TARGET_LIMIT must be from 1 through 8 and not exceed the global limit."
  fi
  if [[ ! "${DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS:-}" =~ ^[1-9][0-9]{0,2}$ ]] \
    || [ "$DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS" -gt 120 ]; then
    fail "DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS must be an integer from 1 through 120."
  fi
  if [[ ! "${DOWNLOAD_ADMISSION_RATE_WINDOW_MS:-}" =~ ^[1-9][0-9]*$ ]] \
    || [ "$DOWNLOAD_ADMISSION_RATE_WINDOW_MS" -lt 1000 ] \
    || [ "$DOWNLOAD_ADMISSION_RATE_WINDOW_MS" -gt 300000 ]; then
    fail "DOWNLOAD_ADMISSION_RATE_WINDOW_MS must be an integer from 1000 through 300000."
  fi
  if [[ ! "${API_MEM_LIMIT:-}" =~ ^([1-9][0-9]*)([mMgG])$ ]]; then
    fail "API_MEM_LIMIT must be a positive m or g memory limit."
  fi
  local api_mem_amount="${BASH_REMATCH[1]}"
  local api_mem_unit
  api_mem_unit="$(printf '%s' "${BASH_REMATCH[2]}" | tr '[:upper:]' '[:lower:]')"
  if { [ "$api_mem_unit" = m ] && { [ "$api_mem_amount" -lt 256 ] || [ "$api_mem_amount" -gt 4096 ]; }; } \
    || { [ "$api_mem_unit" = g ] && { [ "$api_mem_amount" -lt 1 ] || [ "$api_mem_amount" -gt 4 ]; }; }; then
    fail "API_MEM_LIMIT must be between 256m and 4096m (or 1g through 4g)."
  fi
  if [[ ! "${API_PIDS_LIMIT:-}" =~ ^[1-9][0-9]*$ ]] \
    || [ "$API_PIDS_LIMIT" -lt 64 ] \
    || [ "$API_PIDS_LIMIT" -gt 1024 ]; then
    fail "API_PIDS_LIMIT must be an integer from 64 through 1024."
  fi

  if [[ -n "${FEISHU_APP_ID:-}${FEISHU_APP_SECRET:-}" ]]; then
    [[ -n "${FEISHU_APP_ID:-}" && -n "${FEISHU_APP_SECRET:-}" ]] \
      || fail "FEISHU_APP_ID and FEISHU_APP_SECRET must be configured together."
    [[ "$FEISHU_APP_ID" != staging-* && "$FEISHU_APP_SECRET" != staging-* ]] \
      || fail "Feishu credentials still use template values."
  fi

  if [[ "${OBJECT_STORAGE_PROVIDER:-local}" != "local" ]]; then
    [[ -n "${OBJECT_STORAGE_ACCESS_KEY:-}" && -n "${OBJECT_STORAGE_SECRET_KEY:-}" ]] \
      || fail "Non-local object storage requires access and secret keys."
    [[ "$OBJECT_STORAGE_ACCESS_KEY" != staging-* && "$OBJECT_STORAGE_SECRET_KEY" != staging-* ]] \
      || fail "Object-storage credentials still use template values."
  fi
}

load_compose_env() {
  ensure_compose_env_file
  source_free_load_env_file "$COMPOSE_ENV_FILE" "${COMPOSE_ENV_ALLOWED_KEYS[@]}"
  validate_staging_security_env
}

load_release_state_if_present() {
  local file="${1:-$STATE_DIR/current.env}"

  if [[ -f "$file" ]]; then
    source_free_load_env_file "$file" "${RELEASE_STATE_ALLOWED_KEYS[@]}"
  fi
}

compose() {
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_for_service_health() {
  local service="$1"
  local timeout="${2:-180}"
  local started_at
  started_at="$(date +%s)"

  local container_id
  container_id="$(compose ps -q "$service")"
  [[ -n "$container_id" ]] || fail "Service $service has no container id."

  while true; do
    local now
    now="$(date +%s)"
    if (( now - started_at > timeout )); then
      fail "Timed out waiting for $service to become healthy."
    fi

    local status
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"

    case "$status" in
      healthy|running)
        log "Service $service is $status."
        return 0
        ;;
      exited|dead|unhealthy)
        fail "Service $service entered $status state."
        ;;
      *)
        sleep 2
        ;;
    esac
  done
}
