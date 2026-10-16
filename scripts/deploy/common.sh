#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/deploy/compose.staging.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-$ROOT_DIR/deploy/env/staging.env}"
COMPOSE_ENV_EXAMPLE="${COMPOSE_ENV_EXAMPLE:-$ROOT_DIR/deploy/env/staging.env.example}"
STATE_DIR="${STATE_DIR:-$ROOT_DIR/deploy/.state}"
DOTENV_DATA_TOOL="${DOTENV_DATA_TOOL:-$ROOT_DIR/scripts/deploy/dotenv-data.py}"

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
      && [[ ! "$reference" =~ ^[A-Za-z0-9][A-Za-z0-9._/:_-]*[A-Za-z0-9]$ ]]; } \
    || [[ ! "$reference" =~ ^[A-Za-z0-9._/:_-]+$ ]] \
    || [[ "$reference" == *..* ]] \
    || [[ "$reference" == *//* ]] \
    || [[ "$reference" == *::* ]] \
    || [[ ! "$digest" =~ ^[a-f0-9]{64}$ ]]; then
    fail "$label contains an invalid digest-pinned image reference."
  fi
}

ensure_compose_env_file() {
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
  local api_mem_unit="${BASH_REMATCH[2],,}"
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

load_dotenv_data() {
  local profile="$1"
  local file="$2"
  local dotenv_dump
  local previous_umask
  local key
  local value

  require_command python3
  previous_umask="$(umask)"
  umask 077
  dotenv_dump="$(mktemp /tmp/feishu-timeline-dotenv.XXXXXX)" \
    || { umask "$previous_umask"; fail 'Unable to create a private dotenv transfer file.'; }
  umask "$previous_umask"

  if ! python3 "$DOTENV_DATA_TOOL" keys0 --profile "$profile" >"$dotenv_dump"; then
    rm -f -- "$dotenv_dump"
    fail "Unknown dotenv profile: $profile"
  fi
  while IFS= read -r -d '' key; do
    unset "$key"
  done <"$dotenv_dump"

  if ! python3 "$DOTENV_DATA_TOOL" env0 --profile "$profile" "$file" >"$dotenv_dump"; then
    rm -f -- "$dotenv_dump"
    fail "Invalid $profile dotenv data: $file"
  fi

  while IFS= read -r -d '' key; do
    if ! IFS= read -r -d '' value; then
      rm -f -- "$dotenv_dump"
      fail "Truncated validated dotenv data: $file"
    fi
    printf -v "$key" '%s' "$value"
    export "$key"
  done <"$dotenv_dump"
  rm -f -- "$dotenv_dump"
}

load_compose_env() {
  ensure_compose_env_file
  load_dotenv_data staging "$COMPOSE_ENV_FILE"
  validate_staging_security_env
}

load_release_state_if_present() {
  local file="${1:-$STATE_DIR/current.env}"

  if [[ -f "$file" ]]; then
    load_dotenv_data release "$file"
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
