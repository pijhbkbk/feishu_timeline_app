#!/usr/bin/env bash
set -euo pipefail
unset NODE_OPTIONS NODE_PATH PYTHONHOME PYTHONPATH PYTHONSTARTUP

umask 077

# Conservative backup helper for the existing Tencent Cloud host.
# It exports data and configuration only. It never deletes or modifies live state.

IFS=$'\n\t'

APP_NAME="${APP_NAME:-feishu_timeline_app}"
API_RUNTIME_USER=feishu-timeline-api
TIMESTAMP="${TIMESTAMP:-$(date '+%Y%m%dT%H%M%S')}"
APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"
BACKUP_ROOT="${BACKUP_ROOT:-$PWD/backup-${APP_NAME}-${TIMESTAMP}}"
PACKAGE_PATH="${PACKAGE_PATH:-${BACKUP_ROOT}.tar.gz}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOTENV_DATA_TOOL="$SCRIPT_DIR/../deploy/dotenv-data.py"
ARCHIVE_DATA_TOOL="$SCRIPT_DIR/archive-data.py"
PYTHON_BIN=/usr/bin/python3

NGINX_CONF_DIR="${NGINX_CONF_DIR:-/etc/nginx}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
CANONICAL_API_ENV="${CANONICAL_API_ENV:-/etc/feishu-timeline/api.env}"
CANONICAL_WEB_ENV="${CANONICAL_WEB_ENV:-/etc/feishu-timeline/web.env}"
LEGACY_API_ENV="${LEGACY_API_ENV:-$APP_ROOT/apps/api/.env.production}"
LEGACY_WEB_ENV="${LEGACY_WEB_ENV:-$APP_ROOT/apps/web/.env.production}"
PRIMARY_API_ENV="${PRIMARY_API_ENV:-}"
PRIMARY_WEB_ENV="${PRIMARY_WEB_ENV:-}"
if [[ -z "${EXTRA_ENV_CANDIDATES_RAW+x}" ]]; then
  EXTRA_ENV_CANDIDATES_RAW="$APP_ROOT/.env
$APP_ROOT/apps/api/.env
$APP_ROOT/apps/web/.env"
fi
OBJECT_STORAGE_DIR="${OBJECT_STORAGE_DIR:-$APP_ROOT/var/object-storage}"
OBJECT_STORAGE_QUIESCED="${OBJECT_STORAGE_QUIESCED:-no}"
if [[ -z "${SERVICE_UNIT_NAMES_RAW+x}" ]]; then
  SERVICE_UNIT_NAMES_RAW="feishu-timeline-api.service
feishu-timeline-web.service"
fi

DATABASE_BACKUP_MODE="${DATABASE_BACKUP_MODE:-auto}"
DATABASE_BACKUP_FORMAT="${DATABASE_BACKUP_FORMAT:-custom}"
DATABASE_BACKUP_FILE="${DATABASE_BACKUP_FILE:-}"
DATABASE_URL="${DATABASE_URL:-}"
DATABASE_NAME="${DATABASE_NAME:-}"
DATABASE_USER="${DATABASE_USER:-}"
DATABASE_HOST="${DATABASE_HOST:-}"
DATABASE_PORT="${DATABASE_PORT:-}"
DATABASE_EXTRA_ARGS="${DATABASE_EXTRA_ARGS:-}"
PG_DUMP_COMMAND=()

NGINX_OUT_DIR="$BACKUP_ROOT/nginx"
SYSTEMD_OUT_DIR="$BACKUP_ROOT/systemd"
PRIMARY_ENV_OUT_DIR="$BACKUP_ROOT/env/primary"
EXTRA_ENV_OUT_DIR="$BACKUP_ROOT/env/extra"
DATABASE_OUT_DIR="$BACKUP_ROOT/database"
DATABASE_CONNECTION_ENV="$DATABASE_OUT_DIR/.database-connection.env"
DATABASE_CONNECTION_ENV_CREATED=no
OBJECT_STORAGE_OUT_DIR="$BACKUP_ROOT/object-storage"
REPORT_FILE="$BACKUP_ROOT/backup-report.txt"
OBJECT_STORAGE_MANIFEST="$OBJECT_STORAGE_OUT_DIR/object-storage-manifest.jsonl"
OBJECT_STORAGE_SNAPSHOT_DIR=""

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

cleanup_sensitive_temporary() {
  if [[ "$DATABASE_CONNECTION_ENV_CREATED" != no ]]; then
    rm -f -- "$DATABASE_CONNECTION_ENV"
  fi
  cleanup_root_object_snapshot
}
trap cleanup_sensitive_temporary EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

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

cleanup_root_object_snapshot() {
  local cleanup_mode
  local cleanup_uid
  local snapshot_dir="${OBJECT_STORAGE_SNAPSHOT_DIR:-}"

  [[ -n "$snapshot_dir" ]] || return 0
  case "$snapshot_dir" in
    /var/tmp/feishu-timeline-object-snapshot.??????) ;;
    *)
      warn "Refusing to clean unexpected privileged object snapshot: $snapshot_dir"
      return 0
      ;;
  esac
  if ! run_as_root test -d "$snapshot_dir" || run_as_root test -L "$snapshot_dir"; then
    warn "Privileged object snapshot is missing or unsafe: $snapshot_dir"
    return 0
  fi
  cleanup_uid="$(run_as_root stat -c '%u' "$snapshot_dir" 2>/dev/null || true)"
  cleanup_mode="$(run_as_root stat -c '%a' "$snapshot_dir" 2>/dev/null || true)"
  if [[ "$cleanup_uid" != 0 || "$cleanup_mode" != 700 ]]; then
    warn "Refusing to clean privileged object snapshot after its ownership boundary changed: $snapshot_dir"
    return 0
  fi
  run_as_root find "$snapshot_dir" -xdev -mindepth 1 -depth -delete \
    || { warn "Could not clean privileged object snapshot contents: $snapshot_dir"; return 0; }
  run_as_root rmdir "$snapshot_dir" \
    || { warn "Could not remove privileged object snapshot root: $snapshot_dir"; return 0; }
  OBJECT_STORAGE_SNAPSHOT_DIR=""
}

run_as_privileged() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -- "$@"
  else
    fail 'A root credential boundary is required, but sudo is unavailable.'
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Missing required command: $1"
  fi
}

portable_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

portable_uid() {
  stat -c '%u' "$1" 2>/dev/null || stat -f '%u' "$1"
}

validate_output_parameters() {
  case "$OBJECT_STORAGE_QUIESCED" in
    yes|no) ;;
    *) fail 'OBJECT_STORAGE_QUIESCED must be yes or no.' ;;
  esac
  "$PYTHON_BIN" -I - "$APP_NAME" "$BACKUP_ROOT" "$PACKAGE_PATH" "$(id -u)" <<'PY'
from pathlib import Path
import os
import re
import stat
import sys

app_name, backup_value, package_value, uid_value = sys.argv[1:]
current_uid = int(uid_value)
if not re.fullmatch(r'[a-z][a-z0-9_-]{0,63}', app_name):
    raise SystemExit('APP_NAME must match the restore-compatible lowercase application identifier')

backup = Path(backup_value)
package = Path(package_value)
for label, path in (('BACKUP_ROOT', backup), ('PACKAGE_PATH', package)):
    if not path.is_absolute() or os.path.normpath(path) != str(path):
        raise SystemExit(f'{label} must be an absolute normalized path')
    if any(ord(character) < 0x20 or ord(character) == 0x7f for character in str(path)):
        raise SystemExit(f'{label} contains control data')

try:
    package.relative_to(backup)
except ValueError:
    pass
else:
    raise SystemExit('PACKAGE_PATH must be outside BACKUP_ROOT')

def require_private_anchor(path: Path, label: str) -> None:
    # Reject user-controlled links in the lexical path first.  macOS system
    # aliases such as /tmp -> /private/tmp are allowed only when both the link
    # and its parent are root-controlled.
    lexical = Path('/')
    for component in path.parts[1:]:
        lexical /= component
        try:
            metadata = lexical.lstat()
        except FileNotFoundError:
            break
        if stat.S_ISLNK(metadata.st_mode):
            parent_metadata = lexical.parent.lstat()
            if (
                metadata.st_uid != 0
                or parent_metadata.st_uid != 0
                or stat.S_IMODE(parent_metadata.st_mode) & 0o022
            ):
                raise SystemExit(f'{label} contains an untrusted symlink ancestor: {lexical}')

    resolved = Path(os.path.realpath(path))
    current = Path('/')
    private_anchor_seen = False
    for component in resolved.parts[1:]:
        current /= component
        try:
            metadata = current.lstat()
        except FileNotFoundError:
            break
        if not stat.S_ISDIR(metadata.st_mode):
            raise SystemExit(f'{label} existing ancestor is not a directory: {current}')
        if metadata.st_uid not in {0, current_uid}:
            raise SystemExit(f'{label} existing ancestor has an untrusted owner: {current}')
        permissions = stat.S_IMODE(metadata.st_mode)
        if permissions & 0o022:
            root_sticky = metadata.st_uid == 0 and bool(permissions & stat.S_ISVTX)
            if not root_sticky:
                raise SystemExit(f'{label} existing ancestor is group/other writable: {current}')
        elif metadata.st_uid == current_uid:
            private_anchor_seen = True
    if current_uid != 0 and not private_anchor_seen:
        raise SystemExit(f'{label} has no invoking-user-owned private ancestor')

require_private_anchor(backup.parent, 'BACKUP_ROOT')
require_private_anchor(package.parent, 'PACKAGE_PATH')
PY
}

select_primary_env_sources() {
  if [[ -z "$PRIMARY_API_ENV" ]]; then
    if [[ -e "$CANONICAL_API_ENV" || -L "$CANONICAL_API_ENV" ]]; then
      [[ -f "$CANONICAL_API_ENV" && ! -L "$CANONICAL_API_ENV" ]] \
        || fail "Canonical API env exists but is not a regular non-symlink file: $CANONICAL_API_ENV"
      PRIMARY_API_ENV="$CANONICAL_API_ENV"
    else
      PRIMARY_API_ENV="$LEGACY_API_ENV"
    fi
  fi
  if [[ -z "$PRIMARY_WEB_ENV" ]]; then
    if [[ -e "$CANONICAL_WEB_ENV" || -L "$CANONICAL_WEB_ENV" ]]; then
      [[ -f "$CANONICAL_WEB_ENV" && ! -L "$CANONICAL_WEB_ENV" ]] \
        || fail "Canonical Web env exists but is not a regular non-symlink file: $CANONICAL_WEB_ENV"
      PRIMARY_WEB_ENV="$CANONICAL_WEB_ENV"
    else
      PRIMARY_WEB_ENV="$LEGACY_WEB_ENV"
    fi
  fi
}

configure_database_output() {
  local expected_file

  case "$DATABASE_BACKUP_FORMAT" in
    custom) expected_file="$DATABASE_OUT_DIR/${APP_NAME}.dump" ;;
    plain) fail 'Plain SQL backups are prohibited because they are unsafe restore inputs; use custom format.' ;;
    *) fail "Unsupported DATABASE_BACKUP_FORMAT: $DATABASE_BACKUP_FORMAT" ;;
  esac
  if [[ -n "$DATABASE_BACKUP_FILE" && "$DATABASE_BACKUP_FILE" != "$expected_file" ]]; then
    fail "DATABASE_BACKUP_FILE must use the private format-derived path: $expected_file"
  fi
  DATABASE_BACKUP_FILE="$expected_file"
  if [[ -e "$DATABASE_BACKUP_FILE" || -L "$DATABASE_BACKUP_FILE" ]]; then
    fail "Refusing to overwrite an existing database backup target: $DATABASE_BACKUP_FILE"
  fi
}

prepare_private_outputs() {
  local current_uid

  validate_output_parameters
  current_uid="$(id -u)"
  if [[ -L "$BACKUP_ROOT" ]]; then
    fail "Backup root must not be a symlink: $BACKUP_ROOT"
  fi
  if [[ -e "$BACKUP_ROOT" ]]; then
    [[ -d "$BACKUP_ROOT" ]] || fail "Backup root already exists and is not a directory: $BACKUP_ROOT"
    [[ "$(portable_uid "$BACKUP_ROOT")" = "$current_uid" ]] \
      || fail "Existing backup root is not owned by the invoking user: $BACKUP_ROOT"
    [[ "$(portable_mode "$BACKUP_ROOT")" = 700 ]] \
      || fail "Existing backup root must have mode 0700: $BACKUP_ROOT"
    if find "$BACKUP_ROOT" -mindepth 1 -print -quit | grep -q .; then
      fail "Existing backup root must be empty: $BACKUP_ROOT"
    fi
  else
    mkdir -m 0700 -p "$BACKUP_ROOT"
  fi
  chmod 0700 "$BACKUP_ROOT"

  if [[ -e "$PACKAGE_PATH" || -L "$PACKAGE_PATH" ]]; then
    fail "Refusing to overwrite an existing or symlink package path: $PACKAGE_PATH"
  fi
}

verify_private_outputs() {
  "$PYTHON_BIN" -I - "$BACKUP_ROOT" "$PACKAGE_PATH" "$(id -u)" <<'PY'
from pathlib import Path
import os
import stat
import sys

root = Path(sys.argv[1])
package = Path(sys.argv[2])
expected_uid = int(sys.argv[3])

for path in (root, *root.rglob('*'), package):
    metadata = path.lstat()
    if stat.S_ISLNK(metadata.st_mode):
        raise SystemExit(f'symlink in sensitive backup output: {path}')
    if metadata.st_uid != expected_uid:
        raise SystemExit(f'unexpected backup output owner: {path}')
    expected_mode = 0o700 if stat.S_ISDIR(metadata.st_mode) else 0o600
    if stat.S_IMODE(metadata.st_mode) != expected_mode:
        raise SystemExit(
            f'unsafe backup output mode {stat.S_IMODE(metadata.st_mode):o}: {path}'
        )
PY
}

write_report_line() {
  printf '%s\n' "$*" >>"$REPORT_FILE"
}

capture_private_output() {
  local target_path="$1"
  local target_mode
  local target_uid
  shift

  [[ ! -e "$target_path" && ! -L "$target_path" ]] \
    || fail "Refusing to overwrite an existing or symlink backup output: $target_path"
  # Redirection is deliberately performed by the invoking identity before a
  # privileged producer starts.  noclobber gives the open O_EXCL semantics, so
  # root only inherits an already-open descriptor and never resolves a path in
  # the invoking-user-owned backup tree.
  (
    umask 077
    set -o noclobber
    "$@" >"$target_path"
  )
  [[ -f "$target_path" && ! -L "$target_path" ]] \
    || fail "Backup output is not a regular non-symlink file: $target_path"
  target_uid="$(portable_uid "$target_path")"
  target_mode="$(portable_mode "$target_path")"
  [[ "$target_uid" = "$(id -u)" && "$target_mode" = 600 ]] \
    || fail "Backup output lost its invoking-user 0600 boundary: $target_path"
}

approved_privileged_backup_source() {
  case "$1" in
    /etc/feishu-timeline/api.env|/etc/feishu-timeline/web.env|\
    /opt/feishu_timeline_app/apps/api/.env.production|\
    /opt/feishu_timeline_app/apps/web/.env.production|\
    /etc/nginx|/etc/systemd/system|\
    /opt/feishu_timeline_app/var/object-storage)
      return 0
      ;;
    *) return 1 ;;
  esac
}

copy_file_if_exists() {
  local source_path="$1"
  local dest_path="$2"
  local permit_privileged_read="${3:-no}"
  local -a copy_command=("$PYTHON_BIN" -I)

  if [[ ! -e "$source_path" && ! -L "$source_path" ]]; then
    warn "File not found, skipping: $source_path"
    return 0
  fi

  log "Copying $source_path -> $dest_path"
  mkdir -p "$(dirname "$dest_path")"
  chmod 0700 "$(dirname "$dest_path")"
  if [[ ! -r "$source_path" ]]; then
    [[ "$permit_privileged_read" = yes ]] \
      && approved_privileged_backup_source "$source_path" \
      || fail "Privileged backup read is not approved for source: $source_path"
    copy_command=(run_as_root "$PYTHON_BIN" -I)
  fi
  capture_private_output "$dest_path" "${copy_command[@]}" - "$source_path" <<'PY'
import os
import stat
import sys

source = sys.argv[1]
source_flags = os.O_RDONLY | getattr(os, 'O_CLOEXEC', 0)
if hasattr(os, 'O_NOFOLLOW'):
    source_flags |= os.O_NOFOLLOW

source_fd = os.open(source, source_flags)
try:
    before = os.fstat(source_fd)
    if not stat.S_ISREG(before.st_mode):
        raise SystemExit(f'source is not a regular non-symlink file: {source}')
    copied = 0
    while True:
        chunk = os.read(source_fd, 1024 * 1024)
        if not chunk:
            break
        copied += len(chunk)
        view = memoryview(chunk)
        while view:
            written = os.write(sys.stdout.fileno(), view)
            if written <= 0:
                raise SystemExit(f'short write while copying: {source}')
            view = view[written:]
    after = os.fstat(source_fd)
    stable_fields = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
    if any(getattr(before, field) != getattr(after, field) for field in stable_fields):
        raise SystemExit(f'source changed while copying: {source}')
    if copied != after.st_size:
        raise SystemExit(f'source size changed while copying: {source}')
    os.fsync(sys.stdout.fileno())
finally:
    os.close(source_fd)
PY
}

safe_tar_directory() {
  local source_dir="$1"
  local archive_path="$2"

  if [[ ! -d "$source_dir" ]]; then
    warn "Directory not found, skipping: $source_dir"
    return 0
  fi

  log "Archiving $source_dir -> $archive_path"
  if approved_privileged_backup_source "$source_dir"; then
    capture_private_output "$archive_path" run_as_root tar -C "$source_dir" -czf - .
  else
    capture_private_output "$archive_path" tar -C "$source_dir" -czf - .
  fi
}

get_env_value() {
  local env_file="$1"
  local profile="$2"
  local key="$3"

  if [[ -r "$env_file" ]]; then
    "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" get --profile "$profile" "$env_file" "$key"
  else
    run_as_root "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" get --profile "$profile" "$env_file" "$key"
  fi
}

snapshot_env_file() {
  local source_file="$1"
  local snapshot_file="$2"
  local profile="$3"
  local current_uid
  mkdir -p "$(dirname "$snapshot_file")"
  chmod 0700 "$(dirname "$snapshot_file")"
  copy_file_if_exists "$source_file" "$snapshot_file" yes
  "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" validate --profile "$profile" "$snapshot_file"
}

sha256_file() {
  "$PYTHON_BIN" -I - "$1" <<'PY'
from pathlib import Path
import hashlib
import sys

digest = hashlib.sha256()
with Path(sys.argv[1]).open('rb') as source:
    for chunk in iter(lambda: source.read(1024 * 1024), b''):
        digest.update(chunk)
print(digest.hexdigest())
PY
}

capture_env_files() {
  local extra_env
  local extra_dest

  if [[ -e "$PRIMARY_API_ENV" || -L "$PRIMARY_API_ENV" ]]; then
    snapshot_env_file "$PRIMARY_API_ENV" "$PRIMARY_ENV_OUT_DIR/api.env.production" api
    if [[ -z "$DATABASE_URL" ]]; then
      DATABASE_URL="$(get_env_value "$PRIMARY_ENV_OUT_DIR/api.env.production" api DATABASE_URL)"
    fi
    if [[ -z "${OBJECT_STORAGE_LOCAL_ROOT:-}" ]]; then
      OBJECT_STORAGE_LOCAL_ROOT="$(get_env_value "$PRIMARY_ENV_OUT_DIR/api.env.production" api OBJECT_STORAGE_LOCAL_ROOT)"
    fi
    write_report_line "PRIMARY_API_ENV=$PRIMARY_API_ENV"
    write_report_line "PRIMARY_API_ENV_SHA256=$(sha256_file "$PRIMARY_ENV_OUT_DIR/api.env.production")"
  else
    warn "Primary API env not found: $PRIMARY_API_ENV"
    write_report_line "PRIMARY_API_ENV=<missing> $PRIMARY_API_ENV"
  fi

  if [[ -e "$PRIMARY_WEB_ENV" || -L "$PRIMARY_WEB_ENV" ]]; then
    snapshot_env_file "$PRIMARY_WEB_ENV" "$PRIMARY_ENV_OUT_DIR/web.env.production" web
    write_report_line "PRIMARY_WEB_ENV=$PRIMARY_WEB_ENV"
    write_report_line "PRIMARY_WEB_ENV_SHA256=$(sha256_file "$PRIMARY_ENV_OUT_DIR/web.env.production")"
  else
    warn "Primary Web env not found: $PRIMARY_WEB_ENV"
    write_report_line "PRIMARY_WEB_ENV=<missing> $PRIMARY_WEB_ENV"
  fi

  while IFS= read -r extra_env; do
    [[ -n "$extra_env" ]] || continue
    [[ "$extra_env" = /* && "$extra_env" != *'/../'* && "$extra_env" != */.. && "$extra_env" != *'/./'* ]] \
      || fail "Extra env candidate must be an absolute normalized path: $extra_env"
    [[ "$extra_env" = "$PRIMARY_API_ENV" ]] && continue
    [[ "$extra_env" = "$PRIMARY_WEB_ENV" ]] && continue

    extra_dest="$EXTRA_ENV_OUT_DIR/${extra_env#/}"
    if [[ -L "$extra_env" ]]; then
      fail "Extra env candidate must not be a symlink: $extra_env"
    elif [[ -f "$extra_env" ]]; then
      copy_file_if_exists "$extra_env" "$extra_dest"
      write_report_line "EXTRA_ENV=$extra_env"
    else
      warn "Extra env file missing: $extra_env"
      write_report_line "EXTRA_ENV=<missing> $extra_env"
    fi
  done <<<"$EXTRA_ENV_CANDIDATES_RAW"
}

capture_nginx_and_systemd() {
  local unit_name

  if [[ -d "$NGINX_CONF_DIR" ]]; then
    safe_tar_directory "$NGINX_CONF_DIR" "$NGINX_OUT_DIR/nginx-config.tar.gz"
    if approved_privileged_backup_source "$NGINX_CONF_DIR" \
      && command -v nginx >/dev/null 2>&1; then
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

  while IFS= read -r unit_name; do
    [[ -n "$unit_name" ]] || continue
    [[ "$unit_name" =~ ^[A-Za-z0-9_.@-]+\.service$ ]] \
      || fail "Unsafe systemd unit name: $unit_name"
    if systemctl cat "$unit_name" >/dev/null 2>&1; then
      log "Capturing systemd unit: $unit_name"
      systemctl cat "$unit_name" >"$SYSTEMD_OUT_DIR/$unit_name" 2>&1 || warn "systemctl cat failed for $unit_name"
      systemctl status "$unit_name" --no-pager >"$SYSTEMD_OUT_DIR/${unit_name}.status.txt" 2>&1 || warn "systemctl status failed for $unit_name"
    else
      warn "Systemd unit not found: $unit_name"
    fi
  done <<<"$SERVICE_UNIT_NAMES_RAW"
}

build_pg_dump_command() {
  local extra_args=()
  local extra_arg

  if [[ -n "$DATABASE_EXTRA_ARGS" ]]; then
    while IFS= read -r extra_arg; do
      [[ -n "$extra_arg" ]] || continue
      [[ "$extra_arg" = -* ]] \
        || fail 'DATABASE_EXTRA_ARGS accepts one option per line and no positional database names.'
      case "$extra_arg" in
        --no-owner|--no-acl|--no-privileges|--verbose|--clean|--if-exists|--create|--quote-all-identifiers|--no-comments|--no-publications|--no-security-labels|--no-subscriptions|--no-table-access-method|--no-tablespaces|--no-unlogged-table-data|--serializable-deferrable|--strict-names|--load-via-partition-root|--binary-upgrade)
          ;;
        --table=*|--exclude-table=*|--exclude-table-data=*|--exclude-table-data-and-children=*|--schema=*|--exclude-schema=*|--exclude-extension=*|--exclude-foreign-data=*|--lock-wait-timeout=*)
          [[ "$extra_arg" != *$'\n'* && "$extra_arg" != *$'\r'* ]] \
            || fail "DATABASE_EXTRA_ARGS contains control data: $extra_arg"
          ;;
        --compress=*)
          [[ "${extra_arg#*=}" =~ ^[0-9]$ ]] \
            || fail "DATABASE_EXTRA_ARGS has an invalid compression level: $extra_arg"
          ;;
        *)
          fail "DATABASE_EXTRA_ARGS option is not in the exact safe allowlist: $extra_arg"
          ;;
      esac
      extra_args+=("$extra_arg")
    done <<<"$DATABASE_EXTRA_ARGS"
  fi

  case "$DATABASE_BACKUP_FORMAT" in
    custom)
      PG_DUMP_COMMAND=(/usr/bin/pg_dump --format=custom "${extra_args[@]}")
      ;;
    *)
      fail "Unsupported DATABASE_BACKUP_FORMAT: $DATABASE_BACKUP_FORMAT"
      ;;
  esac
}

capture_database_backup() {
  local mode="$DATABASE_BACKUP_MODE"
  local -a dump_cmd=()
  local dump_status=0

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

  [[ ! -e "$DATABASE_BACKUP_FILE" && ! -L "$DATABASE_BACKUP_FILE" ]] \
    || fail "Refusing to overwrite an existing database backup target: $DATABASE_BACKUP_FILE"

  build_pg_dump_command
  dump_cmd=("${PG_DUMP_COMMAND[@]}")
  [ -x /usr/bin/pg_dump ] || fail 'Missing fixed PostgreSQL backup client: /usr/bin/pg_dump'

  log "Running PostgreSQL backup -> $DATABASE_BACKUP_FILE"
  case "$mode" in
    url)
      [[ ! -e "$DATABASE_CONNECTION_ENV" && ! -L "$DATABASE_CONNECTION_ENV" ]] \
        || fail 'Temporary database connection data target already exists.'
      DATABASE_CONNECTION_ENV_CREATED=committing
      (
        umask 077
        set -o noclobber
        printf 'DATABASE_URL=%s\n' "$DATABASE_URL" >"$DATABASE_CONNECTION_ENV"
      )
      DATABASE_CONNECTION_ENV_CREATED=yes
      if ! "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" validate \
          --profile api "$DATABASE_CONNECTION_ENV"; then
        rm -f -- "$DATABASE_CONNECTION_ENV"
        DATABASE_CONNECTION_ENV_CREATED=no
        unset DATABASE_URL
        fail 'DATABASE_URL is not valid strict API dotenv data.'
      fi
      (
        set -o noclobber
        run_as_privileged "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" postgres-exec \
          --profile api "$DATABASE_CONNECTION_ENV" -- "${dump_cmd[@]}" \
          >"$DATABASE_BACKUP_FILE"
      ) || dump_status=$?
      rm -f -- "$DATABASE_CONNECTION_ENV"
      DATABASE_CONNECTION_ENV_CREATED=no
      unset DATABASE_URL
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
      (
        set -o noclobber
        "${dump_cmd[@]}" --dbname="$DATABASE_NAME" >"$DATABASE_BACKUP_FILE"
      ) || dump_status=$?
      ;;
  esac
  if [[ "$dump_status" -ne 0 ]]; then
    rm -f -- "$DATABASE_BACKUP_FILE" "$DATABASE_CONNECTION_ENV"
    fail "pg_dump failed with status $dump_status."
  fi

  [[ -f "$DATABASE_BACKUP_FILE" && ! -L "$DATABASE_BACKUP_FILE" ]] \
    || fail "pg_dump did not produce a regular non-symlink backup: $DATABASE_BACKUP_FILE"
  chmod 0600 "$DATABASE_BACKUP_FILE"

  write_report_line "DATABASE_BACKUP=$DATABASE_BACKUP_FILE"
  write_report_line "DATABASE_BACKUP_MODE=$mode"
  write_report_line "DATABASE_BACKUP_FORMAT=$DATABASE_BACKUP_FORMAT"
  write_report_line "DATABASE_BACKUP_SHA256=$(sha256_file "$DATABASE_BACKUP_FILE")"
}

capture_object_storage() {
  local approved_storage_identity
  local archive_path="$OBJECT_STORAGE_OUT_DIR/${APP_NAME}-object-storage.tar.gz"
  local resolved_storage_identity
  local resolved_storage_path
  local snapshot_dir

  if [[ -L "$OBJECT_STORAGE_DIR" ]]; then
    fail "Object storage root must not be a symlink: $OBJECT_STORAGE_DIR"
  fi
  if [[ ! -d "$OBJECT_STORAGE_DIR" ]]; then
    warn "Object storage directory not found: $OBJECT_STORAGE_DIR"
    write_report_line "OBJECT_STORAGE=<missing> $OBJECT_STORAGE_DIR"
    return 0
  fi
  [[ "$OBJECT_STORAGE_QUIESCED" = yes ]] \
    || fail 'Object-storage backup requires OBJECT_STORAGE_QUIESCED=yes after writes have been stopped.'
  if command -v systemctl >/dev/null 2>&1 \
    && systemctl is-active --quiet feishu-timeline-api.service; then
    fail 'Object-storage backup refuses to run while feishu-timeline-api.service is active.'
  fi
  if id "$API_RUNTIME_USER" >/dev/null 2>&1; then
    command -v pgrep >/dev/null 2>&1 \
      || fail 'Cannot prove object-storage quiescence because pgrep is unavailable.'
    if run_as_root pgrep -u "$API_RUNTIME_USER" >/dev/null 2>&1; then
      fail 'Object-storage backup refuses to run while the API runtime identity owns a process.'
    fi
  fi
  approved_privileged_backup_source "$OBJECT_STORAGE_DIR" \
    || fail "Privileged backup read is not approved for source: $OBJECT_STORAGE_DIR"

  [[ -n "${OBJECT_STORAGE_LOCAL_ROOT:-}" ]] \
    || fail 'Cannot bind object-storage backup to the API env because OBJECT_STORAGE_LOCAL_ROOT is missing.'
  resolved_storage_path="$("$PYTHON_BIN" -I - "$APP_ROOT/apps/api" "$OBJECT_STORAGE_LOCAL_ROOT" <<'PY'
import os
import sys

print(os.path.abspath(os.path.join(sys.argv[1], sys.argv[2])))
PY
)"
  [[ "$resolved_storage_path" = "$OBJECT_STORAGE_DIR" ]] \
    || fail "API env resolves object storage to $resolved_storage_path, not the approved backup source $OBJECT_STORAGE_DIR"
  approved_storage_identity="$(run_as_root "$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" \
    directory-identity "$OBJECT_STORAGE_DIR")"
  resolved_storage_identity="$(run_as_root "$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" \
    directory-identity "$resolved_storage_path")"
  [[ "$approved_storage_identity" = "$resolved_storage_identity" ]] \
    || fail 'API env object-storage path does not identify the approved filesystem directory.'

  log "Archiving object storage directory -> $archive_path"
  snapshot_dir="$(run_as_root mktemp -d /var/tmp/feishu-timeline-object-snapshot.XXXXXX)"
  OBJECT_STORAGE_SNAPSHOT_DIR="$snapshot_dir"
  case "$snapshot_dir" in
    /var/tmp/feishu-timeline-object-snapshot.??????) ;;
    *) fail "Privileged object snapshot has an unexpected path: $snapshot_dir" ;;
  esac
  [[ "$(run_as_root stat -c '%u:%a' "$snapshot_dir")" = '0:700' ]] \
    && run_as_root test -d "$snapshot_dir" \
    && ! run_as_root test -L "$snapshot_dir" \
    || fail "Privileged object snapshot is not a root-owned 0700 directory: $snapshot_dir"
  capture_private_output "$OBJECT_STORAGE_MANIFEST" \
    run_as_root "$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" snapshot-tree \
      "$OBJECT_STORAGE_DIR" "$snapshot_dir"
  capture_private_output "$archive_path" run_as_root tar --hard-dereference -C "$snapshot_dir" -czf - .
  "$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" validate-archive --allowed-uid "$(id -u)" "$archive_path"
  cleanup_root_object_snapshot
  write_report_line "OBJECT_STORAGE=$OBJECT_STORAGE_DIR"
  write_report_line 'OBJECT_STORAGE_QUIESCED=yes'
  write_report_line "OBJECT_STORAGE_MANIFEST=$OBJECT_STORAGE_MANIFEST"
  write_report_line "OBJECT_STORAGE_ARCHIVE_SHA256=$(sha256_file "$archive_path")"
  write_report_line "OBJECT_STORAGE_MANIFEST_SHA256=$(sha256_file "$OBJECT_STORAGE_MANIFEST")"
}

package_backup_bundle() {
  local package_temp

  log "Packing backup directory -> $PACKAGE_PATH"
  package_temp="$(mktemp "$(dirname "$PACKAGE_PATH")/.${APP_NAME}-package.XXXXXX")"
  chmod 0600 "$package_temp"
  tar -C "$(dirname "$BACKUP_ROOT")" -czf "$package_temp" "$(basename "$BACKUP_ROOT")"
  chmod 0600 "$package_temp"
"$PYTHON_BIN" -I - "$package_temp" "$PACKAGE_PATH" <<'PY'
import os
import sys

temporary, target = sys.argv[1:]
with open(temporary, 'rb') as package:
    os.fsync(package.fileno())
try:
    os.link(temporary, target, follow_symlinks=False)
except FileExistsError as error:
    raise SystemExit(f'refusing to overwrite existing package path: {target}') from error
os.unlink(temporary)
directory_fd = os.open(os.path.dirname(target), os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
try:
    os.fsync(directory_fd)
finally:
    os.close(directory_fd)
PY
}

select_primary_env_sources
prepare_private_outputs
mkdir -p \
  "$NGINX_OUT_DIR" \
  "$SYSTEMD_OUT_DIR" \
  "$PRIMARY_ENV_OUT_DIR" \
  "$EXTRA_ENV_OUT_DIR" \
  "$DATABASE_OUT_DIR" \
  "$OBJECT_STORAGE_OUT_DIR"
chmod 0700 \
  "$NGINX_OUT_DIR" \
  "$SYSTEMD_OUT_DIR" \
  "$PRIMARY_ENV_OUT_DIR" \
  "$EXTRA_ENV_OUT_DIR" \
  "$DATABASE_OUT_DIR" \
  "$OBJECT_STORAGE_OUT_DIR"
install -m 0600 /dev/null "$REPORT_FILE"
configure_database_output

require_command tar
[ -x "$PYTHON_BIN" ] || fail "Missing isolated Python interpreter: $PYTHON_BIN"

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

if [[ -n "${OBJECT_STORAGE_LOCAL_ROOT:-}" ]]; then
  write_report_line "ENV_OBJECT_STORAGE_LOCAL_ROOT=${OBJECT_STORAGE_LOCAL_ROOT}"
fi

package_backup_bundle
verify_private_outputs

log "Backup export completed."
log "Backup directory: $BACKUP_ROOT"
log "Backup package: $PACKAGE_PATH"
log "Review $REPORT_FILE for missing items and manual TODOs."
