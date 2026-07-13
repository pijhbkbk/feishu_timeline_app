#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/deploy/compose.staging.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-$ROOT_DIR/deploy/env/staging.env}"
COMPOSE_ENV_EXAMPLE="${COMPOSE_ENV_EXAMPLE:-$ROOT_DIR/deploy/env/staging.env.example}"
STATE_DIR="${STATE_DIR:-$ROOT_DIR/deploy/.state}"

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
  [[ "${AUTH_MOCK_ENABLED:-}" == "false" ]] \
    || fail "AUTH_MOCK_ENABLED must be false for staging deployment."
  [[ "${NEXT_PUBLIC_ENABLE_MOCK_LOGIN:-}" == "false" ]] \
    || fail "NEXT_PUBLIC_ENABLE_MOCK_LOGIN must be false for staging deployment."

  [[ "${POSTGRES_PASSWORD:-}" =~ ^[A-Za-z0-9_-]{20,}$ ]] \
    || fail "POSTGRES_PASSWORD must be at least 20 URL-safe characters."
  [[ "$POSTGRES_PASSWORD" != replace-* && "$POSTGRES_PASSWORD" != "postgres" ]] \
    || fail "POSTGRES_PASSWORD still uses a template/default value."
  [[ "${DATABASE_URL:-}" != *"postgres:postgres@"* ]] \
    || fail "DATABASE_URL still contains the default PostgreSQL credential."

  [[ "${REDIS_PASSWORD:-}" =~ ^[A-Za-z0-9_-]{20,}$ ]] \
    || fail "REDIS_PASSWORD must be at least 20 URL-safe characters."
  [[ "$REDIS_PASSWORD" != replace-* ]] \
    || fail "REDIS_PASSWORD still uses a template value."
  [[ "${REDIS_URL:-}" == "redis://:${REDIS_PASSWORD}@redis:6379" ]] \
    || fail "REDIS_URL must authenticate with REDIS_PASSWORD on the staging Redis service."

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
  # shellcheck source=/dev/null
  set -a && . "$COMPOSE_ENV_FILE" && set +a
  validate_staging_security_env
}

load_release_state_if_present() {
  local file="${1:-$STATE_DIR/current.env}"

  if [[ -f "$file" ]]; then
    # shellcheck source=/dev/null
    set -a && . "$file" && set +a
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
