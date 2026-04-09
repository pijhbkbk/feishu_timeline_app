#!/usr/bin/env bash
set -euo pipefail

# Conservative restore helper for the new GCP Ubuntu VM.
# It restores into the legacy-compatible /opt layout and keeps risky steps behind explicit flags.

IFS=$'\n\t'

APP_NAME="${APP_NAME:-feishu_timeline_app}"
APP_USER="${APP_USER:-feishu}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
APP_HOME="${APP_HOME:-/home/${APP_USER}}"
APP_RUNTIME_PATH="${APP_RUNTIME_PATH:-/usr/local/bin:/usr/bin:/bin}"
COREPACK_HOME="${COREPACK_HOME:-$APP_HOME/.cache/node/corepack}"
PNPM_VERSION="${PNPM_VERSION:-9.15.4}"

APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"
API_DIR="${API_DIR:-$APP_ROOT/apps/api}"
WEB_DIR="${WEB_DIR:-$APP_ROOT/apps/web}"
OBJECT_STORAGE_DIR="${OBJECT_STORAGE_DIR:-$APP_ROOT/var/object-storage}"
CONFIG_REVIEW_DIR="${CONFIG_REVIEW_DIR:-$APP_ROOT/var/config-review}"

BACKUP_ROOT="${BACKUP_ROOT:-}"
PRIMARY_API_ENV_SOURCE="${PRIMARY_API_ENV_SOURCE:-}"
PRIMARY_WEB_ENV_SOURCE="${PRIMARY_WEB_ENV_SOURCE:-}"
EXTRA_ENV_SOURCE_DIR="${EXTRA_ENV_SOURCE_DIR:-}"
DATABASE_RESTORE_FILE="${DATABASE_RESTORE_FILE:-}"
OBJECT_STORAGE_ARCHIVE="${OBJECT_STORAGE_ARCHIVE:-}"

PRIMARY_API_ENV_TARGET="${PRIMARY_API_ENV_TARGET:-$API_DIR/.env.production}"
PRIMARY_WEB_ENV_TARGET="${PRIMARY_WEB_ENV_TARGET:-$WEB_DIR/.env.production}"

GIT_REPO_URL="${GIT_REPO_URL:-}"
GIT_REF="${GIT_REF:-main}"
REPO_STAGE_DIR="${REPO_STAGE_DIR:-$(mktemp -d "/tmp/${APP_NAME}-repo-stage-XXXXXX")}"

RESTORE_PRIMARY_ENV="${RESTORE_PRIMARY_ENV:-no}"
RESTORE_EXTRA_ENV="${RESTORE_EXTRA_ENV:-no}"
RESTORE_OBJECT_STORAGE="${RESTORE_OBJECT_STORAGE:-no}"
RESTORE_DATABASE="${RESTORE_DATABASE:-no}"
REQUIRE_CONFIRM_RESTORE="${REQUIRE_CONFIRM_RESTORE:-no}"

APPLY_SYSTEM_CONFIG="${APPLY_SYSTEM_CONFIG:-no}"
ENABLE_TIMELINE_SITE="${ENABLE_TIMELINE_SITE:-no}"
ENABLE_ROOT_PLACEHOLDER_SITE="${ENABLE_ROOT_PLACEHOLDER_SITE:-no}"
ENABLE_SERVICES="${ENABLE_SERVICES:-no}"
START_SERVICES="${START_SERVICES:-no}"
RELOAD_NGINX="${RELOAD_NGINX:-no}"

TIMELINE_NGINX_SOURCE_REL="deploy/nginx/timeline.all-too-well.com.conf"
ROOT_PLACEHOLDER_SOURCE_REL="deploy/nginx/all-too-well.com.placeholder.conf"
API_SERVICE_SOURCE_REL="deploy/systemd/feishu-timeline-api.service"
WEB_SERVICE_SOURCE_REL="deploy/systemd/feishu-timeline-web.service"

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

fail() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    fail "Please run restore_to_gcp.sh as root."
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Missing required command: $1"
  fi
}

run_as_app() {
  if [[ "$(id -u)" -eq 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      sudo -u "$APP_USER" -H bash -lc "$*"
    else
      runuser -u "$APP_USER" -- bash -lc "$*"
    fi
  else
    bash -lc "$*"
  fi
}

ensure_app_user_exists() {
  if ! id "$APP_USER" >/dev/null 2>&1; then
    fail "Application user does not exist: $APP_USER. Run bootstrap_gcp.sh first or create the account manually."
  fi
}

ensure_app_home_exists() {
  if [[ ! -d "$APP_HOME" ]]; then
    fail "Application home directory not found: $APP_HOME. Web service requires a real HOME for pnpm/corepack."
  fi
}

maybe_set_default_backup_paths() {
  if [[ -z "$BACKUP_ROOT" ]]; then
    return 0
  fi

  [[ -z "$PRIMARY_API_ENV_SOURCE" ]] && PRIMARY_API_ENV_SOURCE="$BACKUP_ROOT/env/primary/api.env.production"
  [[ -z "$PRIMARY_WEB_ENV_SOURCE" ]] && PRIMARY_WEB_ENV_SOURCE="$BACKUP_ROOT/env/primary/web.env.production"
  [[ -z "$EXTRA_ENV_SOURCE_DIR" ]] && EXTRA_ENV_SOURCE_DIR="$BACKUP_ROOT/env/extra"
  [[ -z "$OBJECT_STORAGE_ARCHIVE" ]] && OBJECT_STORAGE_ARCHIVE="$BACKUP_ROOT/object-storage/${APP_NAME}-object-storage.tar.gz"

  if [[ -z "$DATABASE_RESTORE_FILE" ]]; then
    if [[ -f "$BACKUP_ROOT/database/${APP_NAME}.dump" ]]; then
      DATABASE_RESTORE_FILE="$BACKUP_ROOT/database/${APP_NAME}.dump"
    elif [[ -f "$BACKUP_ROOT/database/${APP_NAME}.sql" ]]; then
      DATABASE_RESTORE_FILE="$BACKUP_ROOT/database/${APP_NAME}.sql"
    fi
  fi
}

restore_primary_env_if_requested() {
  if [[ "$RESTORE_PRIMARY_ENV" != "yes" ]]; then
    warn "RESTORE_PRIMARY_ENV=no; expecting $PRIMARY_API_ENV_TARGET and $PRIMARY_WEB_ENV_TARGET to be prepared manually."
    return 0
  fi

  [[ -f "$PRIMARY_API_ENV_SOURCE" ]] || fail "Primary API env source not found: $PRIMARY_API_ENV_SOURCE"
  [[ -f "$PRIMARY_WEB_ENV_SOURCE" ]] || fail "Primary Web env source not found: $PRIMARY_WEB_ENV_SOURCE"

  log "Restoring primary env files into legacy-compatible paths"
  install -d -m 0755 "$API_DIR" "$WEB_DIR"
  install -m 0640 "$PRIMARY_API_ENV_SOURCE" "$PRIMARY_API_ENV_TARGET"
  install -m 0640 "$PRIMARY_WEB_ENV_SOURCE" "$PRIMARY_WEB_ENV_TARGET"
  chown "$APP_USER:$APP_GROUP" "$PRIMARY_API_ENV_TARGET" "$PRIMARY_WEB_ENV_TARGET"
}

restore_extra_env_if_requested() {
  local source_file
  local relative_path
  local target_path

  if [[ "$RESTORE_EXTRA_ENV" != "yes" ]]; then
    warn "RESTORE_EXTRA_ENV=no; skipping optional extra env files."
    return 0
  fi

  [[ -d "$EXTRA_ENV_SOURCE_DIR" ]] || fail "Extra env source directory not found: $EXTRA_ENV_SOURCE_DIR"

  log "Restoring extra env files from $EXTRA_ENV_SOURCE_DIR"
  while IFS= read -r source_file; do
    relative_path="${source_file#"$EXTRA_ENV_SOURCE_DIR"/}"
    target_path="/$relative_path"

    case "$target_path" in
      "$APP_ROOT"/*)
        install -D -m 0640 "$source_file" "$target_path"
        chown "$APP_USER:$APP_GROUP" "$target_path"
        ;;
      *)
        warn "Skipping extra env outside APP_ROOT: $target_path"
        ;;
    esac
  done < <(find "$EXTRA_ENV_SOURCE_DIR" -type f | sort)
}

sync_repo_into_app_root() {
  [[ -n "$GIT_REPO_URL" ]] || fail "GIT_REPO_URL is required."

  log "Cloning repository into temporary staging dir: $REPO_STAGE_DIR"
  git clone "$GIT_REPO_URL" "$REPO_STAGE_DIR"
  git -C "$REPO_STAGE_DIR" checkout "$GIT_REF"

  log "Syncing repository into $APP_ROOT without deleting var/ data"
  install -d -m 0755 "$APP_ROOT"
  rsync -a --exclude 'var/' "$REPO_STAGE_DIR"/ "$APP_ROOT"/

  log "Setting ownership for application directory"
  chown -R "$APP_USER:$APP_GROUP" "$APP_ROOT"
}

prepare_app_runtime() {
  log "Preparing node/pnpm runtime for $APP_USER"
  install -d -m 0755 -o "$APP_USER" -g "$APP_GROUP" "$APP_HOME" "$COREPACK_HOME"

  run_as_app "export HOME='$APP_HOME' COREPACK_HOME='$COREPACK_HOME' PATH='$APP_RUNTIME_PATH'; command -v node >/dev/null && node -v >/dev/null && command -v pnpm >/dev/null && pnpm -v >/dev/null"
}

clean_build_outputs() {
  log "Removing stale build outputs only: $API_DIR/dist and $WEB_DIR/.next"
  rm -rf "$API_DIR/dist" "$WEB_DIR/.next"
}

restore_object_storage_if_requested() {
  if [[ "$RESTORE_OBJECT_STORAGE" != "yes" ]]; then
    warn "RESTORE_OBJECT_STORAGE=no; skipping object storage restore."
    return 0
  fi

  [[ -f "$OBJECT_STORAGE_ARCHIVE" ]] || fail "Object storage archive not found: $OBJECT_STORAGE_ARCHIVE"

  log "Restoring object storage archive into $OBJECT_STORAGE_DIR"
  install -d -m 0750 -o "$APP_USER" -g "$APP_GROUP" "$OBJECT_STORAGE_DIR"
  tar -C "$OBJECT_STORAGE_DIR" -xzf "$OBJECT_STORAGE_ARCHIVE"
  chown -R "$APP_USER:$APP_GROUP" "$OBJECT_STORAGE_DIR"
}

require_runtime_env_files_for_build() {
  [[ -f "$PRIMARY_API_ENV_TARGET" ]] || fail "API env file not found: $PRIMARY_API_ENV_TARGET"
  [[ -f "$PRIMARY_WEB_ENV_TARGET" ]] || fail "Web env file not found: $PRIMARY_WEB_ENV_TARGET"
}

resolve_object_storage_path_from_api_env() {
  local env_file="$1"
  local workdir="$2"

  (
    set +u
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
    set -u
    node -e 'const { resolve } = require("node:path"); const cwd = process.argv[1]; const root = process.env.OBJECT_STORAGE_LOCAL_ROOT || "var/object-storage"; process.stdout.write(resolve(cwd, root));' "$workdir"
  )
}

verify_object_storage_resolution() {
  local resolved_path

  resolved_path="$(resolve_object_storage_path_from_api_env "$PRIMARY_API_ENV_TARGET" "$API_DIR")"
  log "Resolved object-storage path from API env: $resolved_path"

  if [[ "$resolved_path" != "$OBJECT_STORAGE_DIR" ]]; then
    fail "Resolved object-storage path ($resolved_path) does not match expected migration path ($OBJECT_STORAGE_DIR). Review apps/api/.env.production before continuing."
  fi
}

build_application() {
  require_runtime_env_files_for_build
  prepare_app_runtime
  clean_build_outputs
  verify_object_storage_resolution

  log "Installing dependencies"
  run_as_app "export HOME='$APP_HOME' COREPACK_HOME='$COREPACK_HOME' PATH='$APP_RUNTIME_PATH'; cd '$APP_ROOT' && pnpm install --frozen-lockfile"

  log "Building shared package"
  run_as_app "export HOME='$APP_HOME' COREPACK_HOME='$COREPACK_HOME' PATH='$APP_RUNTIME_PATH'; cd '$APP_ROOT' && pnpm --filter @feishu-timeline/shared build"

  log "Generating Prisma client with API production env"
  run_as_app "export HOME='$APP_HOME' COREPACK_HOME='$COREPACK_HOME' PATH='$APP_RUNTIME_PATH'; cd '$API_DIR' && set -a && source '.env.production' && set +a && pnpm exec prisma generate --schema prisma/schema.prisma"

  log "Building API without reusing the package start script"
  run_as_app "export HOME='$APP_HOME' COREPACK_HOME='$COREPACK_HOME' PATH='$APP_RUNTIME_PATH'; cd '$API_DIR' && set -a && source '.env.production' && set +a && pnpm exec tsc -p tsconfig.build.json"

  log "Validating Prisma schema with API production env"
  run_as_app "export HOME='$APP_HOME' COREPACK_HOME='$COREPACK_HOME' PATH='$APP_RUNTIME_PATH'; cd '$API_DIR' && set -a && source '.env.production' && set +a && pnpm exec prisma validate --schema prisma/schema.prisma"

  log "Building Web with Web production env"
  run_as_app "export HOME='$APP_HOME' COREPACK_HOME='$COREPACK_HOME' PATH='$APP_RUNTIME_PATH'; cd '$WEB_DIR' && set -a && source '.env.production' && set +a && pnpm exec next build"
}

restore_database_if_requested() {
  if [[ "$RESTORE_DATABASE" != "yes" ]]; then
    warn "RESTORE_DATABASE=no; skipping database restore."
    return 0
  fi

  if [[ "$REQUIRE_CONFIRM_RESTORE" != "yes" ]]; then
    fail "RESTORE_DATABASE=yes requires REQUIRE_CONFIRM_RESTORE=yes."
  fi

  [[ -f "$DATABASE_RESTORE_FILE" ]] || fail "Database restore file not found: $DATABASE_RESTORE_FILE"
  [[ -f "$PRIMARY_API_ENV_TARGET" ]] || fail "API env file not found for DB restore: $PRIMARY_API_ENV_TARGET"

  set +u
  set -a
  # shellcheck disable=SC1090
  source "$PRIMARY_API_ENV_TARGET"
  set +a
  set -u

  [[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is missing from $PRIMARY_API_ENV_TARGET"

  log "Restoring PostgreSQL from $DATABASE_RESTORE_FILE"
  case "$DATABASE_RESTORE_FILE" in
    *.dump)
      pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$DATABASE_RESTORE_FILE"
      ;;
    *.sql)
      psql "$DATABASE_URL" <"$DATABASE_RESTORE_FILE"
      ;;
    *)
      fail "Unsupported database restore file type: $DATABASE_RESTORE_FILE"
      ;;
  esac
}

stage_or_apply_system_config() {
  local timeline_src="$APP_ROOT/$TIMELINE_NGINX_SOURCE_REL"
  local root_src="$APP_ROOT/$ROOT_PLACEHOLDER_SOURCE_REL"
  local api_service_src="$APP_ROOT/$API_SERVICE_SOURCE_REL"
  local web_service_src="$APP_ROOT/$WEB_SERVICE_SOURCE_REL"

  [[ -f "$timeline_src" ]] || fail "Missing nginx template: $timeline_src"
  [[ -f "$root_src" ]] || fail "Missing nginx template: $root_src"
  [[ -f "$api_service_src" ]] || fail "Missing systemd template: $api_service_src"
  [[ -f "$web_service_src" ]] || fail "Missing systemd template: $web_service_src"

  if [[ "$APPLY_SYSTEM_CONFIG" != "yes" ]]; then
    log "APPLY_SYSTEM_CONFIG=no; copying templates into $CONFIG_REVIEW_DIR for manual review"
    install -d -m 0750 "$CONFIG_REVIEW_DIR/nginx" "$CONFIG_REVIEW_DIR/systemd"
    install -m 0644 "$timeline_src" "$CONFIG_REVIEW_DIR/nginx/"
    install -m 0644 "$root_src" "$CONFIG_REVIEW_DIR/nginx/"
    install -m 0644 "$api_service_src" "$CONFIG_REVIEW_DIR/systemd/"
    install -m 0644 "$web_service_src" "$CONFIG_REVIEW_DIR/systemd/"
    return 0
  fi

  log "Installing systemd unit files"
  install -m 0644 "$api_service_src" /etc/systemd/system/feishu-timeline-api.service
  install -m 0644 "$web_service_src" /etc/systemd/system/feishu-timeline-web.service

  log "Installing nginx vhost templates"
  install -m 0644 "$timeline_src" /etc/nginx/sites-available/timeline.all-too-well.com.conf
  install -m 0644 "$root_src" /etc/nginx/sites-available/all-too-well.com.placeholder.conf

  log "Reloading systemd daemon"
  systemctl daemon-reload

  if [[ "$ENABLE_TIMELINE_SITE" = "yes" ]]; then
    ln -sfn /etc/nginx/sites-available/timeline.all-too-well.com.conf /etc/nginx/sites-enabled/timeline.all-too-well.com.conf
  else
    warn "ENABLE_TIMELINE_SITE=no; timeline vhost installed but not enabled."
  fi

  if [[ "$ENABLE_ROOT_PLACEHOLDER_SITE" = "yes" ]]; then
    ln -sfn /etc/nginx/sites-available/all-too-well.com.placeholder.conf /etc/nginx/sites-enabled/all-too-well.com.placeholder.conf
  else
    warn "ENABLE_ROOT_PLACEHOLDER_SITE=no; root placeholder vhost installed but not enabled."
  fi

  log "Validating nginx syntax after config install"
  nginx -t

  if [[ "$ENABLE_SERVICES" = "yes" ]]; then
    log "Enabling systemd services"
    systemctl enable feishu-timeline-api.service feishu-timeline-web.service
  else
    warn "ENABLE_SERVICES=no; services were not enabled."
  fi

  if [[ "$START_SERVICES" = "yes" ]]; then
    log "Restarting services"
    systemctl restart feishu-timeline-api.service feishu-timeline-web.service
  else
    warn "START_SERVICES=no; services were not started."
  fi

  if [[ "$RELOAD_NGINX" = "yes" ]]; then
    log "Reloading nginx"
    systemctl reload nginx
  else
    warn "RELOAD_NGINX=no; nginx was not reloaded."
  fi
}

require_root
ensure_app_user_exists
ensure_app_home_exists
require_command git
require_command rsync
require_command tar
require_command pnpm
require_command nginx
require_command node
require_command corepack
require_command systemctl

maybe_set_default_backup_paths
restore_primary_env_if_requested
restore_extra_env_if_requested
sync_repo_into_app_root
restore_object_storage_if_requested
build_application
restore_database_if_requested
stage_or_apply_system_config

log "Restore flow completed."
log "Recommended next steps:"
log "  1. Review $PRIMARY_API_ENV_TARGET and $PRIMARY_WEB_ENV_TARGET"
log "  2. Review /etc/systemd/system/feishu-timeline-*.service"
log "  3. Review /etc/nginx/sites-available/*.conf"
log "  4. Run scripts/migration/post_restore_verify.sh"
log "TLS is intentionally not automated here. Example follow-up commands after HTTP validation:"
log "  certbot --nginx -d timeline.all-too-well.com"
log "  # Later, if the root placeholder also needs HTTPS:"
log "  certbot --nginx -d all-too-well.com"
