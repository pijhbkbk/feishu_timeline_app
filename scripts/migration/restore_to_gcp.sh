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
REPO_STAGE_DIR="${REPO_STAGE_DIR:-}"
RESTORE_VALIDATE_ONLY="${RESTORE_VALIDATE_ONLY:-no}"

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
  printf '[INFO] %s\n' "${1:-}"
}

warn() {
  printf '[WARN] %s\n' "${1:-}" >&2
}

fail() {
  printf '[ERROR] %s\n' "${1:-}" >&2
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

validate_controlled_path() {
  local label="$1"
  local value="$2"

  if [ -z "$value" ] \
    || [ "${#value}" -gt 512 ] \
    || [[ ! "$value" =~ ^/[A-Za-z0-9._/-]+$ ]] \
    || [[ "$value" == *//* ]] \
    || [[ "$value" =~ (^|/)\.\.?(/|$) ]]; then
    fail "Invalid controlled path: $label"
  fi
}

validate_optional_controlled_path() {
  local label="$1"
  local value="$2"

  [ -z "$value" ] || validate_controlled_path "$label" "$value"
}

validate_runtime_path() {
  local path_entry
  local -a path_entries
  local IFS=':'

  [ -n "$APP_RUNTIME_PATH" ] \
    || fail 'APP_RUNTIME_PATH must not be empty.'
  read -r -a path_entries <<<"$APP_RUNTIME_PATH"
  for path_entry in "${path_entries[@]}"; do
    validate_controlled_path APP_RUNTIME_PATH "$path_entry"
  done
}

validate_yes_no() {
  local label="$1"
  local value="$2"

  case "$value" in
    yes|no)
      ;;
    *)
      fail "$label must be yes or no."
      ;;
  esac
}

validate_restore_parameters() {
  local toggle

  if [[ ! "$APP_NAME" =~ ^[a-z][a-z0-9_-]{0,63}$ ]]; then
    fail 'APP_NAME must be a bounded lowercase application name.'
  fi
  if [[ ! "$APP_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] \
    || [[ ! "$APP_GROUP" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
    fail 'APP_USER and APP_GROUP must be bounded Linux account names.'
  fi
  if [[ ! "$PNPM_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    fail 'PNPM_VERSION must be an exact semantic version.'
  fi

  validate_controlled_path APP_HOME "$APP_HOME"
  validate_controlled_path COREPACK_HOME "$COREPACK_HOME"
  validate_runtime_path
  validate_controlled_path APP_ROOT "$APP_ROOT"
  validate_controlled_path API_DIR "$API_DIR"
  validate_controlled_path WEB_DIR "$WEB_DIR"
  validate_controlled_path OBJECT_STORAGE_DIR "$OBJECT_STORAGE_DIR"
  validate_controlled_path CONFIG_REVIEW_DIR "$CONFIG_REVIEW_DIR"
  validate_controlled_path PRIMARY_API_ENV_TARGET "$PRIMARY_API_ENV_TARGET"
  validate_controlled_path PRIMARY_WEB_ENV_TARGET "$PRIMARY_WEB_ENV_TARGET"
  validate_optional_controlled_path BACKUP_ROOT "$BACKUP_ROOT"
  validate_optional_controlled_path REPO_STAGE_DIR "$REPO_STAGE_DIR"

  [ "$COREPACK_HOME" = "$APP_HOME/.cache/node/corepack" ] \
    || fail 'COREPACK_HOME must use the controlled application-home location.'
  [ "$API_DIR" = "$APP_ROOT/apps/api" ] \
    || fail 'API_DIR must use the controlled application layout.'
  [ "$WEB_DIR" = "$APP_ROOT/apps/web" ] \
    || fail 'WEB_DIR must use the controlled application layout.'
  [ "$OBJECT_STORAGE_DIR" = "$APP_ROOT/var/object-storage" ] \
    || fail 'OBJECT_STORAGE_DIR must use the controlled application layout.'
  [ "$CONFIG_REVIEW_DIR" = "$APP_ROOT/var/config-review" ] \
    || fail 'CONFIG_REVIEW_DIR must use the controlled application layout.'
  [ "$PRIMARY_API_ENV_TARGET" = "$API_DIR/.env.production" ] \
    || fail 'PRIMARY_API_ENV_TARGET must be the controlled API production env path.'
  [ "$PRIMARY_WEB_ENV_TARGET" = "$WEB_DIR/.env.production" ] \
    || fail 'PRIMARY_WEB_ENV_TARGET must be the controlled Web production env path.'

  if [ -z "$GIT_REPO_URL" ] \
    || { [[ ! "$GIT_REPO_URL" =~ ^https://[A-Za-z0-9._~:/@+-]+$ ]] \
      && [[ ! "$GIT_REPO_URL" =~ ^ssh://[A-Za-z0-9._~:/@+-]+$ ]] \
      && [[ ! "$GIT_REPO_URL" =~ ^git@[A-Za-z0-9.-]+:[A-Za-z0-9._/-]+$ ]]; }; then
    fail 'GIT_REPO_URL must be an explicit HTTPS or SSH Git URL without shell control characters.'
  fi
  if [ "${#GIT_REF}" -gt 128 ] \
    || [[ ! "$GIT_REF" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] \
    || [[ "$GIT_REF" == *..* ]] \
    || [[ "$GIT_REF" == *//* ]] \
    || [[ "$GIT_REF" == *@\{* ]]; then
    fail 'GIT_REF contains unsupported characters or ref syntax.'
  fi

  for toggle in \
    RESTORE_VALIDATE_ONLY \
    RESTORE_PRIMARY_ENV \
    RESTORE_EXTRA_ENV \
    RESTORE_OBJECT_STORAGE \
    RESTORE_DATABASE \
    REQUIRE_CONFIRM_RESTORE \
    APPLY_SYSTEM_CONFIG \
    ENABLE_TIMELINE_SITE \
    ENABLE_ROOT_PLACEHOLDER_SITE \
    ENABLE_SERVICES \
    START_SERVICES \
    RELOAD_NGINX; do
    validate_yes_no "$toggle" "${!toggle}"
  done
}

validate_restore_source_paths() {
  validate_optional_controlled_path PRIMARY_API_ENV_SOURCE "$PRIMARY_API_ENV_SOURCE"
  validate_optional_controlled_path PRIMARY_WEB_ENV_SOURCE "$PRIMARY_WEB_ENV_SOURCE"
  validate_optional_controlled_path EXTRA_ENV_SOURCE_DIR "$EXTRA_ENV_SOURCE_DIR"
  validate_optional_controlled_path DATABASE_RESTORE_FILE "$DATABASE_RESTORE_FILE"
  validate_optional_controlled_path OBJECT_STORAGE_ARCHIVE "$OBJECT_STORAGE_ARCHIVE"
}

initialize_repo_stage_dir() {
  if [ -z "$REPO_STAGE_DIR" ]; then
    REPO_STAGE_DIR="$(mktemp -d "/tmp/${APP_NAME}-repo-stage-XXXXXX")"
  fi
  validate_controlled_path REPO_STAGE_DIR "$REPO_STAGE_DIR"
}

run_as_app() {
  if [[ "$(id -u)" -eq 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      sudo -u "$APP_USER" -H -- "$@"
    else
      runuser -u "$APP_USER" -- "$@"
    fi
  else
    "$@"
  fi
}

run_as_app_with_runtime() {
  run_as_app env \
    HOME="$APP_HOME" \
    COREPACK_HOME="$COREPACK_HOME" \
    PATH="$APP_RUNTIME_PATH" \
    "$@"
}

run_as_app_in_dir() {
  local workdir="$1"
  shift

  # Static program; all dynamic values use positional arguments.
  # shellcheck disable=SC2016
  run_as_app_with_runtime bash -c '
    set -euo pipefail
    workdir="$1"
    shift
    cd -- "$workdir"
    exec "$@"
  ' restore-to-gcp "$workdir" "$@"
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

validate_trusted_env_file() {
  local env_file="$1"
  local file_mode
  local file_owner
  local file_group

  case "$env_file" in
    "$PRIMARY_API_ENV_TARGET"|"$PRIMARY_WEB_ENV_TARGET")
      ;;
    *)
      fail 'Refusing to source an env file outside the controlled production env paths.'
      ;;
  esac

  [ -f "$env_file" ] && [ ! -L "$env_file" ] \
    || fail "Trusted production env must be a regular non-symlink file: $env_file"

  file_mode="$(stat -c '%a' "$env_file" 2>/dev/null \
    || stat -f '%Lp' "$env_file" 2>/dev/null \
    || true)"
  file_owner="$(stat -c '%U' "$env_file" 2>/dev/null \
    || stat -f '%Su' "$env_file" 2>/dev/null \
    || true)"
  file_group="$(stat -c '%G' "$env_file" 2>/dev/null \
    || stat -f '%Sg' "$env_file" 2>/dev/null \
    || true)"

  [ "$file_owner" = 'root' ] \
    || fail "Trusted production env must be owned by root: $env_file"
  [ "$file_group" = "$APP_GROUP" ] \
    || fail "Trusted production env must use the application group: $env_file"
  case "$file_mode" in
    440|640)
      ;;
    *)
      fail "Trusted production env must have mode 440 or 640: $env_file"
      ;;
  esac
  run_as_app test -r "$env_file" \
    || fail "Application user cannot read the trusted production env: $env_file"
}

run_as_app_in_dir_with_trusted_env() {
  local workdir="$1"
  local env_file="$2"
  shift 2

  validate_trusted_env_file "$env_file"
  # Static program; all dynamic values use positional arguments.
  # shellcheck disable=SC2016
  run_as_app_with_runtime bash -c '
    set -euo pipefail
    workdir="$1"
    env_file="$2"
    controlled_home="$3"
    controlled_corepack_home="$4"
    controlled_path="$5"
    shift 5
    cd -- "$workdir"

    # This file is an explicitly trusted, root-controlled shell configuration boundary.
    # validate_trusted_env_file requires root ownership, the application group,
    # mode 440/640, a regular non-symlink file and an exact controlled target path.
    set -a
    source "$env_file"
    set +a

    export HOME="$controlled_home"
    export COREPACK_HOME="$controlled_corepack_home"
    export PATH="$controlled_path"
    exec "$@"
  ' restore-to-gcp \
    "$workdir" \
    "$env_file" \
    "$APP_HOME" \
    "$COREPACK_HOME" \
    "$APP_RUNTIME_PATH" \
    "$@"
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
  install -o root -g "$APP_GROUP" -m 0640 \
    "$PRIMARY_API_ENV_SOURCE" "$PRIMARY_API_ENV_TARGET"
  install -o root -g "$APP_GROUP" -m 0640 \
    "$PRIMARY_WEB_ENV_SOURCE" "$PRIMARY_WEB_ENV_TARGET"
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
  git clone -- "$GIT_REPO_URL" "$REPO_STAGE_DIR"
  git -C "$REPO_STAGE_DIR" checkout --detach "$GIT_REF"

  log "Syncing repository into $APP_ROOT without deleting var/ data or replacing trusted production env"
  install -d -m 0755 "$APP_ROOT"
  rsync -a \
    --chown="$APP_USER:$APP_GROUP" \
    --exclude 'var/' \
    --exclude 'apps/api/.env.production' \
    --exclude 'apps/web/.env.production' \
    "$REPO_STAGE_DIR"/ "$APP_ROOT"/
}

prepare_app_runtime() {
  log "Preparing node/pnpm runtime for $APP_USER"
  install -d -m 0755 -o "$APP_USER" -g "$APP_GROUP" "$APP_HOME" "$COREPACK_HOME"

  run_as_app_with_runtime bash -c '
    set -euo pipefail
    command -v node >/dev/null
    node -v >/dev/null
    command -v pnpm >/dev/null
    pnpm -v >/dev/null
  '
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
  validate_trusted_env_file "$PRIMARY_API_ENV_TARGET"
  validate_trusted_env_file "$PRIMARY_WEB_ENV_TARGET"
}

resolve_object_storage_path_from_api_env() {
  local env_file="$1"
  local workdir="$2"

  validate_trusted_env_file "$env_file"
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
  run_as_app_in_dir "$APP_ROOT" pnpm install --frozen-lockfile

  log "Building shared package"
  run_as_app_in_dir "$APP_ROOT" pnpm --filter @feishu-timeline/shared build

  log "Generating Prisma client with API production env"
  run_as_app_in_dir_with_trusted_env \
    "$API_DIR" "$PRIMARY_API_ENV_TARGET" \
    pnpm exec prisma generate --schema prisma/schema.prisma

  log "Building API without reusing the package start script"
  run_as_app_in_dir_with_trusted_env \
    "$API_DIR" "$PRIMARY_API_ENV_TARGET" \
    pnpm exec tsc -p tsconfig.build.json

  log "Validating Prisma schema with API production env"
  run_as_app_in_dir_with_trusted_env \
    "$API_DIR" "$PRIMARY_API_ENV_TARGET" \
    pnpm exec prisma validate --schema prisma/schema.prisma

  log "Building Web with Web production env"
  run_as_app_in_dir_with_trusted_env \
    "$WEB_DIR" "$PRIMARY_WEB_ENV_TARGET" \
    pnpm exec next build
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
  validate_trusted_env_file "$PRIMARY_API_ENV_TARGET"

  # This file is an explicitly trusted, root-controlled shell configuration boundary.
  # validate_trusted_env_file enforces its canonical path, ownership, group, mode,
  # regular-file type and application-user readability before this privileged source.
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

validate_restore_parameters
maybe_set_default_backup_paths
validate_restore_source_paths

if [ "$RESTORE_VALIDATE_ONLY" = 'yes' ]; then
  printf 'VALIDATION_ONLY=PASS\n'
  exit 0
fi

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

initialize_repo_stage_dir
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
