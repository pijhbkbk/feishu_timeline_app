#!/usr/bin/env bash
set -euo pipefail

# Post-restore verification helper.
# It checks more than /api/health because the current health endpoint is shallow.

IFS=$'\n\t'

APP_NAME="${APP_NAME:-feishu_timeline_app}"
APP_USER="${APP_USER:-feishu}"
APP_HOME="${APP_HOME:-/home/${APP_USER}}"
APP_RUNTIME_PATH="${APP_RUNTIME_PATH:-/usr/local/bin:/usr/bin:/bin}"
COREPACK_HOME="${COREPACK_HOME:-$APP_HOME/.cache/node/corepack}"
APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"
API_ENV_FILE="${API_ENV_FILE:-$APP_ROOT/apps/api/.env.production}"
WEB_ENV_FILE="${WEB_ENV_FILE:-$APP_ROOT/apps/web/.env.production}"
APP_HOST="${APP_HOST:-timeline.all-too-well.com}"
API_SERVICE="${API_SERVICE:-feishu-timeline-api.service}"
WEB_SERVICE="${WEB_SERVICE:-feishu-timeline-web.service}"
EXPECTED_API_WORKDIR="${EXPECTED_API_WORKDIR:-$APP_ROOT/apps/api}"
EXPECTED_WEB_WORKDIR="${EXPECTED_WEB_WORKDIR:-$APP_ROOT/apps/web}"
EXPECTED_OBJECT_STORAGE_DIR="${EXPECTED_OBJECT_STORAGE_DIR:-$APP_ROOT/var/object-storage}"

FAILURES=0

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

run_as_app() {
  if [[ "$(id -u)" -eq 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      sudo -u "$APP_USER" "$@"
    else
      runuser -u "$APP_USER" -- "$@"
    fi
  else
    "$@"
  fi
}

check() {
  local description="$1"
  shift

  if "$@"; then
    printf '[PASS] %s\n' "$description"
  else
    printf '[FAIL] %s\n' "$description" >&2
    FAILURES=$((FAILURES + 1))
  fi
}

systemd_workdir_matches() {
  local unit_name="$1"
  local expected="$2"
  local actual

  actual="$(systemctl show -p WorkingDirectory --value "$unit_name" 2>/dev/null || true)"
  [[ "$actual" = "$expected" ]]
}

object_storage_accessible_by_app_user() {
  run_as_app test -r "$EXPECTED_OBJECT_STORAGE_DIR"
}

object_storage_writable_by_app_user() {
  run_as_app test -w "$EXPECTED_OBJECT_STORAGE_DIR"
}

curl_ok() {
  curl --fail --silent --show-error "$@" >/dev/null
}

app_user_can_run_node() {
  run_as_app env HOME="$APP_HOME" PATH="$APP_RUNTIME_PATH" node -v >/dev/null
}

app_user_can_run_pnpm() {
  run_as_app env HOME="$APP_HOME" COREPACK_HOME="$COREPACK_HOME" PATH="$APP_RUNTIME_PATH" pnpm -v >/dev/null
}

resolved_object_storage_path_matches_expected() {
  local resolved_path

  resolved_path="$(
    (
      set +u
      set -a
      # shellcheck disable=SC1090
      source "$API_ENV_FILE"
      set +a
      set -u
      node -e 'const { resolve } = require("node:path"); const cwd = process.argv[1]; const root = process.env.OBJECT_STORAGE_LOCAL_ROOT || "var/object-storage"; process.stdout.write(resolve(cwd, root));' "$EXPECTED_API_WORKDIR"
    )
  )"

  [[ "$resolved_path" = "$EXPECTED_OBJECT_STORAGE_DIR" ]]
}

api_env_var_is_non_empty() {
  local var_name="$1"

  (
    set +u
    set -a
    # shellcheck disable=SC1090
    source "$API_ENV_FILE"
    set +a
    set -u
    [[ -n "${!var_name:-}" ]]
  )
}

log "Current listening sockets from ss -tlnp"
ss -tlnp || warn "ss -tlnp failed"

check "API env file exists" test -f "$API_ENV_FILE"
check "Web env file exists" test -f "$WEB_ENV_FILE"
check "API build artifact exists" test -f "$EXPECTED_API_WORKDIR/dist/main.js"
check "Web build artifact exists" test -d "$EXPECTED_WEB_WORKDIR/.next"
check "Application home exists" test -d "$APP_HOME"
check "API env has DATABASE_URL" api_env_var_is_non_empty DATABASE_URL
check "API env has REDIS_URL" api_env_var_is_non_empty REDIS_URL
check "API env has FRONTEND_URL" api_env_var_is_non_empty FRONTEND_URL
check "API env has OBJECT_STORAGE_LOCAL_ROOT" api_env_var_is_non_empty OBJECT_STORAGE_LOCAL_ROOT
check "node is available to $APP_USER" app_user_can_run_node
check "pnpm is available to $APP_USER" app_user_can_run_pnpm
check "nginx configuration validates" nginx -t
check "nginx service is active" systemctl is-active --quiet nginx
check "$API_SERVICE is active" systemctl is-active --quiet "$API_SERVICE"
check "$WEB_SERVICE is active" systemctl is-active --quiet "$WEB_SERVICE"
check "$API_SERVICE WorkingDirectory matches $EXPECTED_API_WORKDIR" systemd_workdir_matches "$API_SERVICE" "$EXPECTED_API_WORKDIR"
check "$WEB_SERVICE WorkingDirectory matches $EXPECTED_WEB_WORKDIR" systemd_workdir_matches "$WEB_SERVICE" "$EXPECTED_WEB_WORKDIR"
check "API env resolves object-storage to expected directory" resolved_object_storage_path_matches_expected
check "Port 80 is listening locally" bash -lc "ss -tlnp | grep -q ':80 '"
check "Port 3000 is listening locally" bash -lc "ss -tlnp | grep -q '127.0.0.1:3000'"
check "Port 3001 is listening locally" bash -lc "ss -tlnp | grep -q '127.0.0.1:3001'"
check "Web responds on 127.0.0.1:3000" curl_ok http://127.0.0.1:3000/
check "API responds on 127.0.0.1:3001/api/health" curl_ok http://127.0.0.1:3001/api/health
check "Nginx proxies / for timeline host" curl_ok -H "Host: $APP_HOST" http://127.0.0.1/
check "Nginx proxies /api/health for timeline host" curl_ok -H "Host: $APP_HOST" http://127.0.0.1/api/health
check "Object storage directory exists" test -d "$EXPECTED_OBJECT_STORAGE_DIR"
check "Object storage directory is accessible by app user" object_storage_accessible_by_app_user
check "Object storage directory is writable by app user" object_storage_writable_by_app_user

log "Note: /api/health is only a basic process-level check. Login, DB behavior, Redis behavior, and attachment read/write still need manual functional validation."

if [[ "$FAILURES" -gt 0 ]]; then
  warn "Post-restore verification completed with $FAILURES failure(s)."
  exit 1
fi

log "Post-restore verification completed without detected failures."
