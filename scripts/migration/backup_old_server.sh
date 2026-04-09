#!/usr/bin/env bash
set -euo pipefail

# Conservative backup helper for the existing Tencent Cloud host.
# It exports data and configuration only. It never deletes or modifies live state.

IFS=$'\n\t'

APP_NAME="${APP_NAME:-feishu_timeline_app}"
TIMESTAMP="${TIMESTAMP:-$(date '+%Y%m%dT%H%M%S')}"
APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"
BACKUP_ROOT="${BACKUP_ROOT:-$PWD/backup-${APP_NAME}-${TIMESTAMP}}"
PACKAGE_PATH="${PACKAGE_PATH:-${BACKUP_ROOT}.tar.gz}"

NGINX_CONF_DIR="${NGINX_CONF_DIR:-/etc/nginx}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
PRIMARY_API_ENV="${PRIMARY_API_ENV:-$APP_ROOT/apps/api/.env.production}"
PRIMARY_WEB_ENV="${PRIMARY_WEB_ENV:-$APP_ROOT/apps/web/.env.production}"
EXTRA_ENV_CANDIDATES_RAW="${EXTRA_ENV_CANDIDATES_RAW:-$APP_ROOT/.env $APP_ROOT/apps/api/.env $APP_ROOT/apps/web/.env}"
OBJECT_STORAGE_DIR="${OBJECT_STORAGE_DIR:-$APP_ROOT/var/object-storage}"
SERVICE_UNIT_NAMES_RAW="${SERVICE_UNIT_NAMES_RAW:-feishu-timeline-api.service feishu-timeline-web.service}"

DATABASE_BACKUP_MODE="${DATABASE_BACKUP_MODE:-auto}"
DATABASE_BACKUP_FORMAT="${DATABASE_BACKUP_FORMAT:-custom}"
DATABASE_BACKUP_FILE="${DATABASE_BACKUP_FILE:-$BACKUP_ROOT/database/${APP_NAME}.dump}"
DATABASE_URL="${DATABASE_URL:-}"
DATABASE_NAME="${DATABASE_NAME:-}"
DATABASE_USER="${DATABASE_USER:-}"
DATABASE_HOST="${DATABASE_HOST:-}"
DATABASE_PORT="${DATABASE_PORT:-}"
DATABASE_EXTRA_ARGS="${DATABASE_EXTRA_ARGS:-}"

NGINX_OUT_DIR="$BACKUP_ROOT/nginx"
SYSTEMD_OUT_DIR="$BACKUP_ROOT/systemd"
PRIMARY_ENV_OUT_DIR="$BACKUP_ROOT/env/primary"
EXTRA_ENV_OUT_DIR="$BACKUP_ROOT/env/extra"
DATABASE_OUT_DIR="$BACKUP_ROOT/database"
OBJECT_STORAGE_OUT_DIR="$BACKUP_ROOT/object-storage"
REPORT_FILE="$BACKUP_ROOT/backup-report.txt"

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

run_as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi

  "$@"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Missing required command: $1"
  fi
}

write_report_line() {
  printf '%s\n' "$*" >>"$REPORT_FILE"
}

copy_file_if_exists() {
  local source_path="$1"
  local dest_path="$2"

  if [[ ! -f "$source_path" ]]; then
    warn "File not found, skipping: $source_path"
    return 0
  fi

  log "Copying $source_path -> $dest_path"
  run_as_root install -D -m 0640 "$source_path" "$dest_path"
}

safe_tar_directory() {
  local source_dir="$1"
  local archive_path="$2"

  if [[ ! -d "$source_dir" ]]; then
    warn "Directory not found, skipping: $source_dir"
    return 0
  fi

  log "Archiving $source_dir -> $archive_path"
  run_as_root tar -C "$source_dir" -czf "$archive_path" .
}

load_env_file_best_effort() {
  local env_file="$1"

  if [[ ! -f "$env_file" ]]; then
    return 0
  fi

  set +u
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
  set -u
}

capture_env_files() {
  local extra_env
  local extra_dest

  copy_file_if_exists "$PRIMARY_API_ENV" "$PRIMARY_ENV_OUT_DIR/api.env.production"
  copy_file_if_exists "$PRIMARY_WEB_ENV" "$PRIMARY_ENV_OUT_DIR/web.env.production"

  if [[ -f "$PRIMARY_API_ENV" ]]; then
    load_env_file_best_effort "$PRIMARY_API_ENV"
    write_report_line "PRIMARY_API_ENV=$PRIMARY_API_ENV"
  else
    warn "Primary API env not found: $PRIMARY_API_ENV"
    write_report_line "PRIMARY_API_ENV=<missing> $PRIMARY_API_ENV"
  fi

  if [[ -f "$PRIMARY_WEB_ENV" ]]; then
    load_env_file_best_effort "$PRIMARY_WEB_ENV"
    write_report_line "PRIMARY_WEB_ENV=$PRIMARY_WEB_ENV"
  else
    warn "Primary Web env not found: $PRIMARY_WEB_ENV"
    write_report_line "PRIMARY_WEB_ENV=<missing> $PRIMARY_WEB_ENV"
  fi

  for extra_env in $EXTRA_ENV_CANDIDATES_RAW; do
    [[ "$extra_env" = "$PRIMARY_API_ENV" ]] && continue
    [[ "$extra_env" = "$PRIMARY_WEB_ENV" ]] && continue

    extra_dest="$EXTRA_ENV_OUT_DIR/${extra_env#/}"
    if [[ -f "$extra_env" ]]; then
      copy_file_if_exists "$extra_env" "$extra_dest"
      write_report_line "EXTRA_ENV=$extra_env"
    else
      warn "Extra env file missing: $extra_env"
      write_report_line "EXTRA_ENV=<missing> $extra_env"
    fi
  done
}

capture_nginx_and_systemd() {
  local unit_name

  if [[ -d "$NGINX_CONF_DIR" ]]; then
    safe_tar_directory "$NGINX_CONF_DIR" "$NGINX_OUT_DIR/nginx-config.tar.gz"
    if command -v nginx >/dev/null 2>&1; then
      log "Capturing nginx -T output"
      run_as_root nginx -T >"$NGINX_OUT_DIR/nginx-T.txt" 2>&1 || warn "nginx -T failed"
    fi
  else
    warn "Nginx config directory not found: $NGINX_CONF_DIR"
  fi

  if [[ -d "$SYSTEMD_DIR" ]]; then
    safe_tar_directory "$SYSTEMD_DIR" "$SYSTEMD_OUT_DIR/systemd-system.tar.gz"
  else
    warn "Systemd directory not found: $SYSTEMD_DIR"
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    warn "systemctl not available; skipping unit export"
    return 0
  fi

  for unit_name in $SERVICE_UNIT_NAMES_RAW; do
    if systemctl cat "$unit_name" >/dev/null 2>&1; then
      log "Capturing systemd unit: $unit_name"
      run_as_root systemctl cat "$unit_name" >"$SYSTEMD_OUT_DIR/$unit_name" 2>&1 || warn "systemctl cat failed for $unit_name"
      run_as_root systemctl status "$unit_name" --no-pager >"$SYSTEMD_OUT_DIR/${unit_name}.status.txt" 2>&1 || warn "systemctl status failed for $unit_name"
    else
      warn "Systemd unit not found: $unit_name"
    fi
  done
}

build_pg_dump_command() {
  local extra_args=()

  if [[ -n "$DATABASE_EXTRA_ARGS" ]]; then
    # shellcheck disable=SC2206
    extra_args=($DATABASE_EXTRA_ARGS)
  fi

  case "$DATABASE_BACKUP_FORMAT" in
    custom)
      printf '%s\0' pg_dump --format=custom --file="$DATABASE_BACKUP_FILE" "${extra_args[@]}"
      ;;
    plain)
      printf '%s\0' pg_dump --format=plain --file="$DATABASE_BACKUP_FILE" "${extra_args[@]}"
      ;;
    *)
      fail "Unsupported DATABASE_BACKUP_FORMAT: $DATABASE_BACKUP_FORMAT"
      ;;
  esac
}

capture_database_backup() {
  local mode="$DATABASE_BACKUP_MODE"
  local -a dump_cmd=()

  case "$mode" in
    auto)
      if [[ -n "$DATABASE_URL" ]]; then
        mode="url"
      elif [[ -n "$DATABASE_NAME" ]]; then
        mode="named"
      else
        mode="skip"
      fi
      ;;
    url|named|skip)
      ;;
    *)
      fail "Unsupported DATABASE_BACKUP_MODE: $mode"
      ;;
  esac

  if [[ "$mode" = "skip" ]]; then
    warn "No database connection info available; skipping PostgreSQL export"
    write_report_line "DATABASE_BACKUP=<skipped>"
    return 0
  fi

  require_command pg_dump

  while IFS= read -r -d '' cmd_part; do
    dump_cmd+=("$cmd_part")
  done < <(build_pg_dump_command)

  log "Running PostgreSQL backup -> $DATABASE_BACKUP_FILE"
  case "$mode" in
    url)
      "${dump_cmd[@]}" "$DATABASE_URL"
      ;;
    named)
      if [[ -n "$DATABASE_USER" ]]; then
        export PGUSER="$DATABASE_USER"
      fi
      if [[ -n "$DATABASE_HOST" ]]; then
        export PGHOST="$DATABASE_HOST"
      fi
      if [[ -n "$DATABASE_PORT" ]]; then
        export PGPORT="$DATABASE_PORT"
      fi
      "${dump_cmd[@]}" "$DATABASE_NAME"
      ;;
  esac

  write_report_line "DATABASE_BACKUP=$DATABASE_BACKUP_FILE"
  write_report_line "DATABASE_BACKUP_MODE=$mode"
}

capture_object_storage() {
  local archive_path="$OBJECT_STORAGE_OUT_DIR/${APP_NAME}-object-storage.tar.gz"

  if [[ ! -d "$OBJECT_STORAGE_DIR" ]]; then
    warn "Object storage directory not found: $OBJECT_STORAGE_DIR"
    write_report_line "OBJECT_STORAGE=<missing> $OBJECT_STORAGE_DIR"
    return 0
  fi

  log "Archiving object storage directory -> $archive_path"
  run_as_root tar -C "$OBJECT_STORAGE_DIR" -czf "$archive_path" .
  write_report_line "OBJECT_STORAGE=$OBJECT_STORAGE_DIR"
}

package_backup_bundle() {
  log "Packing backup directory -> $PACKAGE_PATH"
  tar -C "$(dirname "$BACKUP_ROOT")" -czf "$PACKAGE_PATH" "$(basename "$BACKUP_ROOT")"
}

mkdir -p \
  "$NGINX_OUT_DIR" \
  "$SYSTEMD_OUT_DIR" \
  "$PRIMARY_ENV_OUT_DIR" \
  "$EXTRA_ENV_OUT_DIR" \
  "$DATABASE_OUT_DIR" \
  "$OBJECT_STORAGE_OUT_DIR"
: >"$REPORT_FILE"

require_command tar

log "Backup root: $BACKUP_ROOT"
write_report_line "APP_ROOT=$APP_ROOT"
write_report_line "OBJECT_STORAGE_DIR=$OBJECT_STORAGE_DIR"
write_report_line "NGINX_CONF_DIR=$NGINX_CONF_DIR"
write_report_line "SYSTEMD_DIR=$SYSTEMD_DIR"
write_report_line "SERVICE_UNIT_NAMES=$SERVICE_UNIT_NAMES_RAW"

capture_env_files
capture_nginx_and_systemd
capture_database_backup
capture_object_storage
package_backup_bundle

if [[ -n "${OBJECT_STORAGE_LOCAL_ROOT:-}" ]]; then
  write_report_line "ENV_OBJECT_STORAGE_LOCAL_ROOT=${OBJECT_STORAGE_LOCAL_ROOT}"
fi

log "Backup export completed."
log "Backup directory: $BACKUP_ROOT"
log "Backup package: $PACKAGE_PATH"
log "Review $REPORT_FILE for missing items and manual TODOs."
