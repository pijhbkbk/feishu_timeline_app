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
    cp "$COMPOSE_ENV_EXAMPLE" "$COMPOSE_ENV_FILE"
    log "Created $COMPOSE_ENV_FILE from example. Review it before non-local deployment."
  fi
}

load_compose_env() {
  ensure_compose_env_file
  # shellcheck source=/dev/null
  set -a && . "$COMPOSE_ENV_FILE" && set +a
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

