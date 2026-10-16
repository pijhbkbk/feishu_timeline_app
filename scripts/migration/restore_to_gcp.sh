#!/usr/bin/env bash
set -euo pipefail

# Privileged migration code must not inherit language-runtime preload/search
# controls from the invoking shell.
unset NODE_OPTIONS NODE_PATH PYTHONHOME PYTHONPATH PYTHONSTARTUP

# Conservative restore helper for the new GCP Ubuntu VM.
# It restores into the legacy-compatible /opt layout and keeps risky steps behind explicit flags.

IFS=$'\n\t'

APP_NAME="${APP_NAME:-feishu_timeline_app}"
APP_USER="${APP_USER:-feishu}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
API_RUNTIME_USER=feishu-timeline-api
API_RUNTIME_GROUP=feishu-timeline-api
WEB_RUNTIME_USER=feishu-timeline-web
WEB_RUNTIME_GROUP=feishu-timeline-web
BUILD_USER=feishu-timeline-build
BUILD_GROUP=feishu-timeline-build
APP_HOME="${APP_HOME:-/home/${APP_USER}}"
APP_RUNTIME_PATH="${APP_RUNTIME_PATH:-/usr/local/bin:/usr/bin:/bin}"
COREPACK_HOME="${COREPACK_HOME:-$APP_HOME/.cache/node/corepack}"
PNPM_VERSION="${PNPM_VERSION:-9.15.4}"

APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"
RELEASES_DIR="${RELEASES_DIR:-$APP_ROOT/releases}"
CURRENT_LINK="${CURRENT_LINK:-$APP_ROOT/current}"
API_DIR="${API_DIR:-$CURRENT_LINK/apps/api}"
WEB_DIR="${WEB_DIR:-$CURRENT_LINK/apps/web}"
OBJECT_STORAGE_DIR="${OBJECT_STORAGE_DIR:-$APP_ROOT/var/object-storage}"
CONFIG_REVIEW_DIR="${CONFIG_REVIEW_DIR:-$APP_ROOT/var/config-review}"
DOTENV_DATA_TOOL="${DOTENV_DATA_TOOL:-/usr/local/libexec/feishu-timeline/dotenv-data}"
ARCHIVE_DATA_TOOL="${ARCHIVE_DATA_TOOL:-/usr/local/libexec/feishu-timeline/archive-data}"
DOTENV_DATA_TOOL_TARGET="$DOTENV_DATA_TOOL"
ARCHIVE_DATA_TOOL_TARGET="$ARCHIVE_DATA_TOOL"
DOTENV_DATA_TOOL_CANDIDATE="/usr/local/libexec/feishu-timeline/.dotenv-data.candidate.$$"
ARCHIVE_DATA_TOOL_CANDIDATE="/usr/local/libexec/feishu-timeline/.archive-data.candidate.$$"
PREVIOUS_DOTENV_TOOL="/usr/local/libexec/feishu-timeline/.dotenv-data.previous.$$"
PREVIOUS_ARCHIVE_TOOL="/usr/local/libexec/feishu-timeline/.archive-data.previous.$$"
PYTHON_BIN=/usr/bin/python3

BACKUP_ROOT="${BACKUP_ROOT:-}"
PRIMARY_API_ENV_SOURCE="${PRIMARY_API_ENV_SOURCE:-}"
PRIMARY_WEB_ENV_SOURCE="${PRIMARY_WEB_ENV_SOURCE:-}"
PRIMARY_API_ENV_SHA256="${PRIMARY_API_ENV_SHA256:-}"
PRIMARY_WEB_ENV_SHA256="${PRIMARY_WEB_ENV_SHA256:-}"
EXTRA_ENV_SOURCE_DIR="${EXTRA_ENV_SOURCE_DIR:-}"
DATABASE_RESTORE_FILE="${DATABASE_RESTORE_FILE:-}"
DATABASE_RESTORE_SHA256="${DATABASE_RESTORE_SHA256:-}"
OBJECT_STORAGE_ARCHIVE="${OBJECT_STORAGE_ARCHIVE:-}"
OBJECT_STORAGE_MANIFEST="${OBJECT_STORAGE_MANIFEST:-}"
OBJECT_STORAGE_ARCHIVE_SHA256="${OBJECT_STORAGE_ARCHIVE_SHA256:-}"
OBJECT_STORAGE_MANIFEST_SHA256="${OBJECT_STORAGE_MANIFEST_SHA256:-}"

PRIMARY_API_ENV_TARGET="${PRIMARY_API_ENV_TARGET:-/etc/feishu-timeline/api.env}"
PRIMARY_WEB_ENV_TARGET="${PRIMARY_WEB_ENV_TARGET:-/etc/feishu-timeline/web.env}"
GIT_REPO_URL="${GIT_REPO_URL:-}"
GIT_REF="${GIT_REF:-}"
REPO_STAGE_DIR="${REPO_STAGE_DIR:-}"
BUILD_API_ENV="$PRIMARY_API_ENV_TARGET"
BUILD_WEB_ENV_SOURCE="$PRIMARY_WEB_ENV_TARGET"
BUILD_WEB_ENV=""
BUILD_ROOT=""
BUILD_HOME=""
BUILD_COREPACK_HOME=""
BUILD_CONFIG_ROOT=""
PRIVILEGED_SOURCE_ROOT=""
PRIVILEGED_API_SERVICE_SOURCE=""
PRIVILEGED_WEB_SERVICE_SOURCE=""
PRIVILEGED_TIMELINE_NGINX_SOURCE=""
PRIVILEGED_ROOT_NGINX_SOURCE=""
STAGED_API_ENV=""
STAGED_WEB_ENV=""
RESTORE_BUILD_TIME=""
RESTORE_RELEASE=""
DATABASE_RESTORE_SNAPSHOT="$APP_ROOT/var/.database-restore.$$.dump"
OBJECT_STORAGE_ARCHIVE_SNAPSHOT="$APP_ROOT/var/.object-storage.archive.$$"
OBJECT_STORAGE_MANIFEST_SNAPSHOT="$APP_ROOT/var/.object-storage.manifest.$$"
OBJECT_STORAGE_PREVIOUS_DIR="$APP_ROOT/var/.object-storage.previous.$$"
OBJECT_STORAGE_STAGING_DIR="$APP_ROOT/var/.object-storage.restore.$$"
PRIMARY_API_ENV_SNAPSHOT="/etc/feishu-timeline/.api.env.source.$$"
PRIMARY_WEB_ENV_SNAPSHOT="/etc/feishu-timeline/.web.env.source.$$"
STAGED_RELEASE_DIR="$RELEASES_DIR/$GIT_REF"
STAGED_CURRENT_LINK="$APP_ROOT/.current.$GIT_REF"
PREVIOUS_API_ENV="/etc/feishu-timeline/.api.env.previous.$$"
PREVIOUS_WEB_ENV="/etc/feishu-timeline/.web.env.previous.$$"
FAILED_CURRENT_LINK="$APP_ROOT/.current.failed.$$"
ROLLBACK_CURRENT_LINK="$APP_ROOT/.current.rollback.$$"
FAILED_RELEASE_DIR="$RELEASES_DIR/.failed.$GIT_REF.$$"
FAILED_OBJECT_STORAGE_DIR="$APP_ROOT/var/.object-storage.failed.$$"
PREVIOUS_CURRENT_TARGET=""
API_ENV_WAS_PRESENT=no
WEB_ENV_WAS_PRESENT=no
API_ENV_ACTIVATED=no
WEB_ENV_ACTIVATED=no
API_ENV_STAGED=no
WEB_ENV_STAGED=no
PRIMARY_API_SNAPSHOT_CREATED=no
PRIMARY_WEB_SNAPSHOT_CREATED=no
DATABASE_SNAPSHOT_CREATED=no
OBJECT_ARCHIVE_SNAPSHOT_CREATED=no
OBJECT_MANIFEST_SNAPSHOT_CREATED=no
OBJECT_STORAGE_WAS_PRESENT=no
OBJECT_STORAGE_ACTIVATED=no
OBJECT_STORAGE_STAGED=no
OBJECT_STORAGE_STAGING_IDENTITY=""
OBJECT_STORAGE_LAYOUT_CREATED=no
RELEASE_STAGED=no
STAGED_CURRENT_CREATED=no
CURRENT_WAS_PRESENT=no
CURRENT_ACTIVATED=no
RESTORE_COMMIT_COMPLETE=no
BUILD_TREE_FROZEN=no
DATA_TOOLS_STAGED=no
DOTENV_TOOL_WAS_PRESENT=no
ARCHIVE_TOOL_WAS_PRESENT=no
DOTENV_TOOL_ACTIVATED=no
ARCHIVE_TOOL_ACTIVATED=no
DATABASE_RESTORE_APPLIED=no
RUNTIME_QUIESCED=no
API_SERVICE_WAS_ACTIVE=no
WEB_SERVICE_WAS_ACTIVE=no
SYSTEM_CONFIG_STAGED=no
SYSTEM_CONFIG_ACTIVATED=no
SYSTEM_RUNTIME_ACTIONS_STARTED=no
API_SERVICE_WAS_ENABLED=no
WEB_SERVICE_WAS_ENABLED=no
SERVICE_ENABLE_ATTEMPTED=no
SERVICES_BOOT_DISABLED=no
RUNTIME_TRANSACTION_GUARD_ARMED=no
RUNTIME_TRANSACTION_GUARD_COMMITTED=no
RUNTIME_TRANSACTION_GUARD_UNIT=""
RUNTIME_TRANSACTION_GUARD_MARKER=""
COMMITTED_BOOT_STATE=not_attempted
TIMELINE_SITE_LINK_CREATED=no
ROOT_SITE_LINK_CREATED=no
API_SERVICE_WAS_PRESENT=no
WEB_SERVICE_WAS_PRESENT=no
TIMELINE_NGINX_WAS_PRESENT=no
ROOT_NGINX_WAS_PRESENT=no
API_SERVICE_ACTIVATED=no
WEB_SERVICE_ACTIVATED=no
TIMELINE_NGINX_ACTIVATED=no
ROOT_NGINX_ACTIVATED=no
API_SERVICE_TARGET=/etc/systemd/system/feishu-timeline-api.service
WEB_SERVICE_TARGET=/etc/systemd/system/feishu-timeline-web.service
TIMELINE_NGINX_TARGET=/etc/nginx/sites-available/timeline.all-too-well.com.conf
ROOT_NGINX_TARGET=/etc/nginx/sites-available/all-too-well.com.placeholder.conf
TIMELINE_SITE_LINK=/etc/nginx/sites-enabled/timeline.all-too-well.com.conf
ROOT_SITE_LINK=/etc/nginx/sites-enabled/all-too-well.com.placeholder.conf
API_SERVICE_CANDIDATE=/etc/systemd/system/.feishu-timeline-api.service.candidate.$$
WEB_SERVICE_CANDIDATE=/etc/systemd/system/.feishu-timeline-web.service.candidate.$$
TIMELINE_NGINX_CANDIDATE=/etc/nginx/sites-available/.timeline.all-too-well.com.conf.candidate.$$
ROOT_NGINX_CANDIDATE=/etc/nginx/sites-available/.all-too-well.com.placeholder.conf.candidate.$$
PREVIOUS_API_SERVICE=/etc/systemd/system/.feishu-timeline-api.service.previous.$$
PREVIOUS_WEB_SERVICE=/etc/systemd/system/.feishu-timeline-web.service.previous.$$
PREVIOUS_TIMELINE_NGINX=/etc/nginx/sites-available/.timeline.all-too-well.com.conf.previous.$$
PREVIOUS_ROOT_NGINX=/etc/nginx/sites-available/.all-too-well.com.placeholder.conf.previous.$$
TIMELINE_SITE_LINK_TEMP=/etc/nginx/sites-enabled/.timeline.all-too-well.com.conf.candidate.$$
ROOT_SITE_LINK_TEMP=/etc/nginx/sites-enabled/.all-too-well.com.placeholder.conf.candidate.$$
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

fsync_directory() {
  local directory="$1"

  "$PYTHON_BIN" -I - "$directory" <<'PY'
import os
import sys

descriptor = os.open(
    sys.argv[1],
    os.O_RDONLY
    | getattr(os, "O_CLOEXEC", 0)
    | getattr(os, "O_DIRECTORY", 0)
    | getattr(os, "O_NOFOLLOW", 0),
)
try:
    os.fsync(descriptor)
finally:
    os.close(descriptor)
PY
}

arm_runtime_transaction_guard() {
  local coordinator_identity
  local transaction_id

  [[ "$RUNTIME_QUIESCED" = yes ]] \
    || fail 'Runtime transaction guard requires quiesced services.'
  [[ -x /usr/bin/systemd-run ]] \
    || fail 'Runtime transaction guard requires /usr/bin/systemd-run.'
  require_root_controlled_directory /var
  require_root_controlled_directory /var/lib
  install -d -o root -g root -m 0700 /var/lib/feishu-timeline-transactions
  require_root_controlled_directory /var/lib/feishu-timeline-transactions
  transaction_id="$(< /proc/sys/kernel/random/uuid)"
  [[ "$transaction_id" =~ ^[0-9a-f-]{36}$ ]] \
    || fail 'Could not obtain a bounded runtime transaction identifier.'
  RUNTIME_TRANSACTION_GUARD_UNIT="feishu-timeline-restore-guard-$transaction_id"
  RUNTIME_TRANSACTION_GUARD_MARKER="/var/lib/feishu-timeline-transactions/$transaction_id.committed"
  [[ ! -e "$RUNTIME_TRANSACTION_GUARD_MARKER" \
      && ! -L "$RUNTIME_TRANSACTION_GUARD_MARKER" ]] \
    || fail 'Runtime transaction commit marker unexpectedly exists.'
  coordinator_identity="$(stat -c '%i' "/proc/$$")"
  [[ "$coordinator_identity" =~ ^[0-9]+$ ]] \
    || fail 'Could not bind the runtime guard to the coordinator identity.'
  /usr/bin/systemd-run \
    --quiet \
    --collect \
    --property=Restart=no \
    --unit="$RUNTIME_TRANSACTION_GUARD_UNIT" \
    /usr/bin/bash -c '
      set -u
      coordinator_pid="$1"
      coordinator_identity="$2"
      commit_marker="$3"
      while :; do
        [ ! -e "$commit_marker" ] || exit 0
        [ -r "/proc/$coordinator_pid/stat" ] || break
        [ "$(/usr/bin/stat -c "%i" "/proc/$coordinator_pid" 2>/dev/null)" = "$coordinator_identity" ] \
          || break
        coordinator_stat="$(< "/proc/$coordinator_pid/stat")"
        coordinator_state="${coordinator_stat##*) }"
        coordinator_state="${coordinator_state%% *}"
        case "$coordinator_state" in
          Z|X|x) break ;;
        esac
        /usr/bin/sleep 1
      done
      [ ! -e "$commit_marker" ] || exit 0
      /usr/bin/systemctl disable \
        feishu-timeline-api.service feishu-timeline-web.service nginx.service || true
      /bin/sync -f /etc/systemd/system || true
      /bin/sync -f /etc/systemd/system/multi-user.target.wants || true
      /usr/bin/systemctl stop feishu-timeline-api.service feishu-timeline-web.service nginx.service || true
    ' r27-runtime-guard "$$" "$coordinator_identity" "$RUNTIME_TRANSACTION_GUARD_MARKER"
  systemctl is-active --quiet "$RUNTIME_TRANSACTION_GUARD_UNIT" \
    || fail 'Runtime transaction guard did not remain active.'
  RUNTIME_TRANSACTION_GUARD_ARMED=yes
}

disarm_runtime_transaction_guard() {
  local guard_stopped=no

  if [[ "$RUNTIME_TRANSACTION_GUARD_ARMED" = yes \
      && -n "$RUNTIME_TRANSACTION_GUARD_UNIT" ]]; then
    if ! systemctl is-active --quiet "$RUNTIME_TRANSACTION_GUARD_UNIT"; then
      guard_stopped=yes
    elif systemctl stop "$RUNTIME_TRANSACTION_GUARD_UNIT" >/dev/null 2>&1; then
      for _ in 1 2 3 4 5; do
        if ! systemctl is-active --quiet "$RUNTIME_TRANSACTION_GUARD_UNIT"; then
          guard_stopped=yes
          break
        fi
        sleep 1
      done
    fi
    if [[ "$guard_stopped" != yes ]]; then
      warn 'Runtime transaction guard is still active; retaining its commit marker.'
      return 1
    fi
  fi
  if [[ -n "$RUNTIME_TRANSACTION_GUARD_MARKER" ]]; then
    rm -f -- "$RUNTIME_TRANSACTION_GUARD_MARKER"
    fsync_directory /var/lib/feishu-timeline-transactions
  fi
  RUNTIME_TRANSACTION_GUARD_ARMED=no
}

commit_runtime_transaction_guard() {
  [[ "$RUNTIME_TRANSACTION_GUARD_ARMED" = yes ]] \
    || fail 'Runtime transaction guard is not armed.'
  systemctl is-active --quiet "$RUNTIME_TRANSACTION_GUARD_UNIT" \
    || fail 'Runtime transaction guard exited before commit.'
  install -o root -g root -m 0600 /dev/null "$RUNTIME_TRANSACTION_GUARD_MARKER"
  fsync_directory /var/lib/feishu-timeline-transactions
  RUNTIME_TRANSACTION_GUARD_COMMITTED=yes
  RESTORE_COMMIT_COMPLETE=yes
}

cleanup_repo_stage_dir() {
  local stage_mode
  local stage_uid

  [[ -n "$REPO_STAGE_DIR" ]] || return 0
  case "$REPO_STAGE_DIR" in
    "/tmp/${APP_NAME}-repo-stage-"*) ;;
    *)
      warn "Refusing to clean an unexpected restore staging path: $REPO_STAGE_DIR"
      return 1
      ;;
  esac
  if [[ ! -d "$REPO_STAGE_DIR" || -L "$REPO_STAGE_DIR" ]]; then
    warn "Restore staging root is missing or unsafe during cleanup: $REPO_STAGE_DIR"
    return 1
  fi
  stage_uid="$(stat -c '%u' "$REPO_STAGE_DIR" 2>/dev/null || true)"
  stage_mode="$(stat -c '%a' "$REPO_STAGE_DIR" 2>/dev/null || true)"
  if [[ "$stage_uid" != 0 || ! "$stage_mode" =~ ^[0-7]{3,4}$ ]] \
    || (( (8#$stage_mode & 0022) != 0 )); then
    warn "Restore staging root lost its root-controlled boundary: $REPO_STAGE_DIR"
    return 1
  fi
  find "$REPO_STAGE_DIR" -mindepth 1 -depth -delete
  rmdir "$REPO_STAGE_DIR"
  REPO_STAGE_DIR=""
  BUILD_ROOT=""
  BUILD_HOME=""
  BUILD_COREPACK_HOME=""
  BUILD_CONFIG_ROOT=""
  BUILD_WEB_ENV=""
}

rollback_restore_transaction() {
  local exit_status="$1"
  local rollback_current_link="$ROLLBACK_CURRENT_LINK"
  local api_uid=""
  local api_gid=""
  local current_object_identity=""

  trap - EXIT INT TERM HUP
  if [[ "$exit_status" -eq 0 || "$RESTORE_COMMIT_COMPLETE" = yes ]]; then
    exit "$exit_status"
  fi

  # Rollback is best effort, but all names are fixed, root-controlled paths
  # created by this invocation.  Never recursively follow or remove a path.
  set +e
  warn 'Restore failed before the transaction commit point; rolling back activated runtime state.'
  if id "$BUILD_USER" >/dev/null 2>&1 && pgrep -u "$BUILD_USER" >/dev/null 2>&1; then
    pkill -STOP -u "$BUILD_USER" || true
    pkill -KILL -u "$BUILD_USER" || true
  fi
  if [[ "$SYSTEM_RUNTIME_ACTIONS_STARTED" != no ]]; then
    systemctl stop feishu-timeline-api.service feishu-timeline-web.service || true
    pkill -TERM -u "$API_RUNTIME_USER" || true
    pkill -TERM -u "$WEB_RUNTIME_USER" || true
    for _ in 1 2 3 4 5; do
      if ! pgrep -u "$API_RUNTIME_USER" >/dev/null 2>&1 \
        && ! pgrep -u "$WEB_RUNTIME_USER" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    pkill -KILL -u "$API_RUNTIME_USER" || true
    pkill -KILL -u "$WEB_RUNTIME_USER" || true
  fi

  if [[ "$CURRENT_ACTIVATED" != no ]]; then
    if [[ -L "$CURRENT_LINK" && ! -e "$FAILED_CURRENT_LINK" && ! -L "$FAILED_CURRENT_LINK" ]]; then
      mv -Tf -- "$CURRENT_LINK" "$FAILED_CURRENT_LINK"
    fi
    if [[ "$CURRENT_WAS_PRESENT" = yes && -n "$PREVIOUS_CURRENT_TARGET" ]]; then
      if [[ ! -e "$rollback_current_link" && ! -L "$rollback_current_link" ]]; then
        ln -s -- "$PREVIOUS_CURRENT_TARGET" "$rollback_current_link"
        mv -Tf -- "$rollback_current_link" "$CURRENT_LINK"
      fi
    elif [[ -L "$CURRENT_LINK" \
        && "$(readlink "$CURRENT_LINK" 2>/dev/null)" = "$STAGED_RELEASE_DIR" ]]; then
      rm -f -- "$CURRENT_LINK"
    fi
    CURRENT_ACTIVATED=no
    fsync_directory "$APP_ROOT"
  fi

  if [[ "$OBJECT_STORAGE_ACTIVATED" != no ]] \
    || [[ -d "$OBJECT_STORAGE_PREVIOUS_DIR" ]]; then
    if [[ -d "$OBJECT_STORAGE_DIR" && ! -L "$OBJECT_STORAGE_DIR" ]]; then
      current_object_identity="$(stat -c '%d:%i' "$OBJECT_STORAGE_DIR" 2>/dev/null)"
    fi
    if [[ "$OBJECT_STORAGE_WAS_PRESENT" = yes \
        && ! -e "$OBJECT_STORAGE_PREVIOUS_DIR" && ! -L "$OBJECT_STORAGE_PREVIOUS_DIR" \
        && -d "$OBJECT_STORAGE_STAGING_DIR" && ! -L "$OBJECT_STORAGE_STAGING_DIR" \
        && -n "$OBJECT_STORAGE_STAGING_IDENTITY" \
        && "$current_object_identity" = "$OBJECT_STORAGE_STAGING_IDENTITY" ]]; then
      # Activation exchanged the names but was interrupted before preserving
      # the displaced live tree at the previous path.
      mv -T -- "$OBJECT_STORAGE_STAGING_DIR" "$OBJECT_STORAGE_PREVIOUS_DIR"
    fi
    if [[ "$OBJECT_STORAGE_WAS_PRESENT" = yes && -d "$OBJECT_STORAGE_PREVIOUS_DIR" ]]; then
      if [[ ! -e "$FAILED_OBJECT_STORAGE_DIR" && ! -L "$FAILED_OBJECT_STORAGE_DIR" ]]; then
        "$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" activate-tree \
          "$OBJECT_STORAGE_PREVIOUS_DIR" "$OBJECT_STORAGE_DIR" "$FAILED_OBJECT_STORAGE_DIR"
      fi
      api_uid="$(id -u "$API_RUNTIME_USER" 2>/dev/null)"
      api_gid="$(id -g "$API_RUNTIME_USER" 2>/dev/null)"
      if [[ "$api_uid" =~ ^[0-9]+$ && "$api_gid" =~ ^[0-9]+$ \
          && -d "$OBJECT_STORAGE_DIR" && ! -L "$OBJECT_STORAGE_DIR" ]]; then
        find "$OBJECT_STORAGE_DIR" -mindepth 1 -type d -exec chown "$api_uid:$api_gid" {} +
        find "$OBJECT_STORAGE_DIR" -mindepth 1 -type f -exec chown "$api_uid:$api_gid" {} +
        find "$OBJECT_STORAGE_DIR" -mindepth 1 -type d -exec chmod 0750 {} +
        find "$OBJECT_STORAGE_DIR" -mindepth 1 -type f -exec chmod 0640 {} +
        chown "$api_uid:$api_gid" "$OBJECT_STORAGE_DIR"
        chmod 0750 "$OBJECT_STORAGE_DIR"
      fi
    elif [[ "$OBJECT_STORAGE_WAS_PRESENT" = no \
        && -d "$OBJECT_STORAGE_DIR" && ! -L "$OBJECT_STORAGE_DIR" \
        && -n "$OBJECT_STORAGE_STAGING_IDENTITY" \
        && "$current_object_identity" = "$OBJECT_STORAGE_STAGING_IDENTITY" \
        && ! -e "$FAILED_OBJECT_STORAGE_DIR" && ! -L "$FAILED_OBJECT_STORAGE_DIR" ]]; then
      mv -T -- "$OBJECT_STORAGE_DIR" "$FAILED_OBJECT_STORAGE_DIR"
    fi
    if [[ -d "$FAILED_OBJECT_STORAGE_DIR" && ! -L "$FAILED_OBJECT_STORAGE_DIR" ]]; then
      chown root:root "$FAILED_OBJECT_STORAGE_DIR"
      chmod 0700 "$FAILED_OBJECT_STORAGE_DIR"
    fi
    OBJECT_STORAGE_ACTIVATED=no
  elif [[ "$OBJECT_STORAGE_STAGED" != no \
      && -d "$OBJECT_STORAGE_STAGING_DIR" && ! -L "$OBJECT_STORAGE_STAGING_DIR" \
      && ! -e "$FAILED_OBJECT_STORAGE_DIR" && ! -L "$FAILED_OBJECT_STORAGE_DIR" ]]; then
    mv -T -- "$OBJECT_STORAGE_STAGING_DIR" "$FAILED_OBJECT_STORAGE_DIR"
    chown root:root "$FAILED_OBJECT_STORAGE_DIR"
    chmod 0700 "$FAILED_OBJECT_STORAGE_DIR"
  elif [[ "$OBJECT_STORAGE_LAYOUT_CREATED" != no \
      && -d "$OBJECT_STORAGE_DIR" && ! -L "$OBJECT_STORAGE_DIR" \
      && ! -e "$FAILED_OBJECT_STORAGE_DIR" && ! -L "$FAILED_OBJECT_STORAGE_DIR" ]]; then
    mv -T -- "$OBJECT_STORAGE_DIR" "$FAILED_OBJECT_STORAGE_DIR"
    chown root:root "$FAILED_OBJECT_STORAGE_DIR"
    chmod 0700 "$FAILED_OBJECT_STORAGE_DIR"
  fi

  if [[ "$TIMELINE_SITE_LINK_CREATED" != no \
      && -L "$TIMELINE_SITE_LINK" \
      && "$(readlink "$TIMELINE_SITE_LINK" 2>/dev/null)" = "$TIMELINE_NGINX_TARGET" ]]; then
    rm -f -- "$TIMELINE_SITE_LINK"
  fi
  if [[ "$ROOT_SITE_LINK_CREATED" != no \
      && -L "$ROOT_SITE_LINK" \
      && "$(readlink "$ROOT_SITE_LINK" 2>/dev/null)" = "$ROOT_NGINX_TARGET" ]]; then
    rm -f -- "$ROOT_SITE_LINK"
  fi
  TIMELINE_SITE_LINK_CREATED=no
  ROOT_SITE_LINK_CREATED=no

  if [[ "$ROOT_NGINX_ACTIVATED" != no ]]; then
    if [[ "$ROOT_NGINX_WAS_PRESENT" = yes \
        && -f "$PREVIOUS_ROOT_NGINX" && ! -L "$PREVIOUS_ROOT_NGINX" ]]; then
      mv -Tf -- "$PREVIOUS_ROOT_NGINX" "$ROOT_NGINX_TARGET"
    else
      rm -f -- "$ROOT_NGINX_TARGET"
    fi
    ROOT_NGINX_ACTIVATED=no
  fi
  if [[ "$TIMELINE_NGINX_ACTIVATED" != no ]]; then
    if [[ "$TIMELINE_NGINX_WAS_PRESENT" = yes \
        && -f "$PREVIOUS_TIMELINE_NGINX" && ! -L "$PREVIOUS_TIMELINE_NGINX" ]]; then
      mv -Tf -- "$PREVIOUS_TIMELINE_NGINX" "$TIMELINE_NGINX_TARGET"
    else
      rm -f -- "$TIMELINE_NGINX_TARGET"
    fi
    TIMELINE_NGINX_ACTIVATED=no
  fi
  if [[ "$WEB_SERVICE_ACTIVATED" != no ]]; then
    if [[ "$WEB_SERVICE_WAS_PRESENT" = yes \
        && -f "$PREVIOUS_WEB_SERVICE" && ! -L "$PREVIOUS_WEB_SERVICE" ]]; then
      mv -Tf -- "$PREVIOUS_WEB_SERVICE" "$WEB_SERVICE_TARGET"
    else
      rm -f -- "$WEB_SERVICE_TARGET"
    fi
    WEB_SERVICE_ACTIVATED=no
  fi
  if [[ "$API_SERVICE_ACTIVATED" != no ]]; then
    if [[ "$API_SERVICE_WAS_PRESENT" = yes \
        && -f "$PREVIOUS_API_SERVICE" && ! -L "$PREVIOUS_API_SERVICE" ]]; then
      mv -Tf -- "$PREVIOUS_API_SERVICE" "$API_SERVICE_TARGET"
    else
      rm -f -- "$API_SERVICE_TARGET"
    fi
    API_SERVICE_ACTIVATED=no
  fi
  rm -f -- \
    "$API_SERVICE_CANDIDATE" "$WEB_SERVICE_CANDIDATE" \
    "$TIMELINE_NGINX_CANDIDATE" "$ROOT_NGINX_CANDIDATE" \
    "$PREVIOUS_API_SERVICE" "$PREVIOUS_WEB_SERVICE" \
    "$PREVIOUS_TIMELINE_NGINX" "$PREVIOUS_ROOT_NGINX" \
    "$TIMELINE_SITE_LINK_TEMP" "$ROOT_SITE_LINK_TEMP"
  if [[ -d /etc/systemd/system && ! -L /etc/systemd/system ]]; then
    fsync_directory /etc/systemd/system
  fi
  if [[ -d /etc/nginx/sites-available && ! -L /etc/nginx/sites-available ]]; then
    fsync_directory /etc/nginx/sites-available
  fi
  if [[ -d /etc/nginx/sites-enabled && ! -L /etc/nginx/sites-enabled ]]; then
    fsync_directory /etc/nginx/sites-enabled
  fi
  if [[ "$SERVICES_BOOT_DISABLED" != no || "$SERVICE_ENABLE_ATTEMPTED" = yes ]]; then
    if [[ "$DATABASE_RESTORE_APPLIED" != no ]]; then
      systemctl disable feishu-timeline-api.service feishu-timeline-web.service || true
    else
      if [[ "$API_SERVICE_WAS_ENABLED" = yes ]]; then
        systemctl enable feishu-timeline-api.service || true
      else
        systemctl disable feishu-timeline-api.service || true
      fi
      if [[ "$WEB_SERVICE_WAS_ENABLED" = yes ]]; then
        systemctl enable feishu-timeline-web.service || true
      else
        systemctl disable feishu-timeline-web.service || true
      fi
    fi
  fi
  if [[ "$SYSTEM_CONFIG_ACTIVATED" != no ]]; then
    systemctl daemon-reload || true
    if command -v nginx >/dev/null 2>&1 && nginx -t >/dev/null 2>&1; then
      systemctl reload nginx.service || true
    fi
    SYSTEM_CONFIG_ACTIVATED=no
  fi
  if [[ "$DATABASE_RESTORE_APPLIED" != no ]]; then
    warn 'Database restore crossed its commit boundary; runtime services remain stopped for compatibility review.'
  fi

  if [[ "$WEB_ENV_ACTIVATED" != no ]]; then
    if [[ "$WEB_ENV_WAS_PRESENT" = yes && -f "$PREVIOUS_WEB_ENV" && ! -L "$PREVIOUS_WEB_ENV" ]]; then
      mv -Tf -- "$PREVIOUS_WEB_ENV" "$PRIMARY_WEB_ENV_TARGET"
    else
      rm -f -- "$PRIMARY_WEB_ENV_TARGET"
    fi
    WEB_ENV_ACTIVATED=no
  fi
  if [[ "$API_ENV_ACTIVATED" != no ]]; then
    if [[ "$API_ENV_WAS_PRESENT" = yes && -f "$PREVIOUS_API_ENV" && ! -L "$PREVIOUS_API_ENV" ]]; then
      mv -Tf -- "$PREVIOUS_API_ENV" "$PRIMARY_API_ENV_TARGET"
    else
      rm -f -- "$PRIMARY_API_ENV_TARGET"
    fi
    API_ENV_ACTIVATED=no
  fi
  rm -f -- "$PREVIOUS_API_ENV" "$PREVIOUS_WEB_ENV"
  if [[ -d /etc/feishu-timeline && ! -L /etc/feishu-timeline ]]; then
    fsync_directory /etc/feishu-timeline
  fi

  if [[ "$ARCHIVE_TOOL_ACTIVATED" != no ]]; then
    if [[ "$ARCHIVE_TOOL_WAS_PRESENT" = yes \
        && -f "$PREVIOUS_ARCHIVE_TOOL" && ! -L "$PREVIOUS_ARCHIVE_TOOL" ]]; then
      mv -Tf -- "$PREVIOUS_ARCHIVE_TOOL" "$ARCHIVE_DATA_TOOL_TARGET"
    else
      rm -f -- "$ARCHIVE_DATA_TOOL_TARGET"
    fi
    ARCHIVE_DATA_TOOL="$ARCHIVE_DATA_TOOL_TARGET"
    ARCHIVE_TOOL_ACTIVATED=no
  fi
  if [[ "$DOTENV_TOOL_ACTIVATED" != no ]]; then
    if [[ "$DOTENV_TOOL_WAS_PRESENT" = yes \
        && -f "$PREVIOUS_DOTENV_TOOL" && ! -L "$PREVIOUS_DOTENV_TOOL" ]]; then
      mv -Tf -- "$PREVIOUS_DOTENV_TOOL" "$DOTENV_DATA_TOOL_TARGET"
    else
      rm -f -- "$DOTENV_DATA_TOOL_TARGET"
    fi
    DOTENV_DATA_TOOL="$DOTENV_DATA_TOOL_TARGET"
    DOTENV_TOOL_ACTIVATED=no
  fi
  rm -f -- \
    "$DOTENV_DATA_TOOL_CANDIDATE" "$ARCHIVE_DATA_TOOL_CANDIDATE" \
    "$PREVIOUS_DOTENV_TOOL" "$PREVIOUS_ARCHIVE_TOOL"
  if [[ -d /usr/local/libexec/feishu-timeline \
      && ! -L /usr/local/libexec/feishu-timeline ]]; then
    fsync_directory /usr/local/libexec/feishu-timeline
  fi

  [[ "$API_ENV_STAGED" != no && -n "$STAGED_API_ENV" ]] \
    && rm -f -- "$STAGED_API_ENV"
  [[ "$WEB_ENV_STAGED" != no && -n "$STAGED_WEB_ENV" ]] \
    && rm -f -- "$STAGED_WEB_ENV"
  [[ "$PRIMARY_API_SNAPSHOT_CREATED" != no ]] \
    && rm -f -- "$PRIMARY_API_ENV_SNAPSHOT"
  [[ "$PRIMARY_WEB_SNAPSHOT_CREATED" != no ]] \
    && rm -f -- "$PRIMARY_WEB_ENV_SNAPSHOT"
  [[ "$DATABASE_SNAPSHOT_CREATED" != no ]] \
    && rm -f -- "$DATABASE_RESTORE_SNAPSHOT"
  [[ "$OBJECT_ARCHIVE_SNAPSHOT_CREATED" != no ]] \
    && rm -f -- "$OBJECT_STORAGE_ARCHIVE_SNAPSHOT"
  [[ "$OBJECT_MANIFEST_SNAPSHOT_CREATED" != no ]] \
    && rm -f -- "$OBJECT_STORAGE_MANIFEST_SNAPSHOT"
  rm -f -- "$rollback_current_link"

  if [[ "$STAGED_CURRENT_CREATED" != no \
      && -L "$STAGED_CURRENT_LINK" \
      && ! -e "$FAILED_CURRENT_LINK" && ! -L "$FAILED_CURRENT_LINK" ]]; then
    mv -T -- "$STAGED_CURRENT_LINK" "$FAILED_CURRENT_LINK"
  fi
  if [[ "$RELEASE_STAGED" != no \
      && -d "$STAGED_RELEASE_DIR" && ! -L "$STAGED_RELEASE_DIR" \
      && ! -e "$FAILED_RELEASE_DIR" && ! -L "$FAILED_RELEASE_DIR" ]]; then
    mv -T -- "$STAGED_RELEASE_DIR" "$FAILED_RELEASE_DIR"
    chown root:root "$FAILED_RELEASE_DIR"
    chmod 0700 "$FAILED_RELEASE_DIR"
  fi
  if [[ -d "$RELEASES_DIR" && ! -L "$RELEASES_DIR" ]]; then
    fsync_directory "$RELEASES_DIR"
  fi
  if [[ -d "$APP_ROOT" && ! -L "$APP_ROOT" ]]; then
    fsync_directory "$APP_ROOT"
  fi

  if [[ "$RUNTIME_QUIESCED" != no && "$DATABASE_RESTORE_APPLIED" = no ]]; then
    if [[ "$API_SERVICE_WAS_ACTIVE" = yes ]]; then
      systemctl start feishu-timeline-api.service \
        || warn 'Could not restore the previously active API service.'
    fi
    if [[ "$WEB_SERVICE_WAS_ACTIVE" = yes ]]; then
      systemctl start feishu-timeline-web.service \
        || warn 'Could not restore the previously active Web service.'
    fi
  fi
  if [[ "$DATABASE_RESTORE_APPLIED" = no ]]; then
    disarm_runtime_transaction_guard \
      || warn 'Rollback left the fail-closed runtime guard armed.'
  fi

  warn 'Rollback completed on a best-effort basis; root-only failed artifacts are preserved for review.'
  cleanup_repo_stage_dir || warn 'Restore staging cleanup requires manual review.'
  exit "$exit_status"
}

finalize_restore_transaction() {
  # The live commit already passed validation/runtime actions.  From this
  # point on, rollback metadata cleanup is best effort: a cleanup failure must
  # not report that the committed deployment was rolled back when it was not.
  [[ "$RUNTIME_TRANSACTION_GUARD_COMMITTED" = yes ]] \
    || fail 'Refusing to finalize before the runtime crash guard commit.'
  disarm_runtime_transaction_guard \
    || warn 'Committed restore retained its crash-guard marker for manual cleanup.'
  rm -f -- \
      "$PREVIOUS_API_ENV" "$PREVIOUS_WEB_ENV" \
      "$PREVIOUS_DOTENV_TOOL" "$PREVIOUS_ARCHIVE_TOOL" \
      "$DOTENV_DATA_TOOL_CANDIDATE" "$ARCHIVE_DATA_TOOL_CANDIDATE" \
      "$PREVIOUS_API_SERVICE" "$PREVIOUS_WEB_SERVICE" \
      "$PREVIOUS_TIMELINE_NGINX" "$PREVIOUS_ROOT_NGINX" \
    || warn 'Committed restore left rollback metadata for manual cleanup.'
  fsync_directory /etc/feishu-timeline \
    || warn 'Could not fsync the committed canonical environment directory.'
  fsync_directory /usr/local/libexec/feishu-timeline \
    || warn 'Could not fsync the committed privileged data-tool directory.'
  fsync_directory "$RELEASES_DIR" \
    || warn 'Could not fsync the committed immutable release directory.'
  fsync_directory "$APP_ROOT" \
    || warn 'Could not fsync the committed release pointer directory.'
  if [[ "$APPLY_SYSTEM_CONFIG" = yes ]]; then
    fsync_directory /etc/systemd/system \
      || warn 'Could not fsync the committed systemd configuration directory.'
    fsync_directory /etc/nginx/sites-available \
      || warn 'Could not fsync the committed Nginx configuration directory.'
  fi
  cleanup_repo_stage_dir || warn 'Committed restore staging cleanup requires manual review.'
  return 0
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
  [[ "$APP_USER" != root && "$APP_GROUP" != root ]] \
    || fail 'APP_USER and APP_GROUP must identify a dedicated non-root deploy account.'
  if [[ ! "$PNPM_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    fail 'PNPM_VERSION must be an exact semantic version.'
  fi

  validate_controlled_path APP_HOME "$APP_HOME"
  validate_controlled_path COREPACK_HOME "$COREPACK_HOME"
  validate_runtime_path
  validate_controlled_path APP_ROOT "$APP_ROOT"
  validate_controlled_path RELEASES_DIR "$RELEASES_DIR"
  validate_controlled_path CURRENT_LINK "$CURRENT_LINK"
  validate_controlled_path API_DIR "$API_DIR"
  validate_controlled_path WEB_DIR "$WEB_DIR"
  validate_controlled_path OBJECT_STORAGE_DIR "$OBJECT_STORAGE_DIR"
  validate_controlled_path CONFIG_REVIEW_DIR "$CONFIG_REVIEW_DIR"
  validate_controlled_path PRIMARY_API_ENV_TARGET "$PRIMARY_API_ENV_TARGET"
  validate_controlled_path PRIMARY_WEB_ENV_TARGET "$PRIMARY_WEB_ENV_TARGET"
  validate_optional_controlled_path BACKUP_ROOT "$BACKUP_ROOT"
  [ -z "$REPO_STAGE_DIR" ] \
    || fail 'REPO_STAGE_DIR overrides are prohibited; restore always creates a private system temporary directory.'

  [ "$APP_ROOT" = "/opt/feishu_timeline_app" ] \
    || fail 'APP_ROOT must use the approved production root /opt/feishu_timeline_app.'
  [ "$APP_HOME" = "/home/$APP_USER" ] \
    || fail 'APP_HOME must be the dedicated deploy account home.'
  [ "$APP_RUNTIME_PATH" = '/usr/local/bin:/usr/bin:/bin' ] \
    || fail 'APP_RUNTIME_PATH must use the approved system executable path.'
  [ "$COREPACK_HOME" = "$APP_HOME/.cache/node/corepack" ] \
    || fail 'COREPACK_HOME must use the controlled application-home location.'
  [ "$RELEASES_DIR" = "$APP_ROOT/releases" ] \
    || fail 'RELEASES_DIR must use the controlled immutable release layout.'
  [ "$CURRENT_LINK" = "$APP_ROOT/current" ] \
    || fail 'CURRENT_LINK must use the controlled release pointer.'
  [ "$API_DIR" = "$CURRENT_LINK/apps/api" ] \
    || fail 'API_DIR must use the controlled application layout.'
  [ "$WEB_DIR" = "$CURRENT_LINK/apps/web" ] \
    || fail 'WEB_DIR must use the controlled application layout.'
  [ "$OBJECT_STORAGE_DIR" = "$APP_ROOT/var/object-storage" ] \
    || fail 'OBJECT_STORAGE_DIR must use the controlled application layout.'
  [ "$CONFIG_REVIEW_DIR" = "$APP_ROOT/var/config-review" ] \
    || fail 'CONFIG_REVIEW_DIR must use the controlled application layout.'
  [ "$PRIMARY_API_ENV_TARGET" = "/etc/feishu-timeline/api.env" ] \
    || fail 'PRIMARY_API_ENV_TARGET must be the canonical API production env path.'
  [ "$PRIMARY_WEB_ENV_TARGET" = "/etc/feishu-timeline/web.env" ] \
    || fail 'PRIMARY_WEB_ENV_TARGET must be the canonical Web production env path.'
  [ "$DOTENV_DATA_TOOL" = '/usr/local/libexec/feishu-timeline/dotenv-data' ] \
    || fail 'DOTENV_DATA_TOOL must use the canonical root-controlled target.'
  [ "$ARCHIVE_DATA_TOOL" = '/usr/local/libexec/feishu-timeline/archive-data' ] \
    || fail 'ARCHIVE_DATA_TOOL must use the canonical root-controlled target.'

  if [ -z "$GIT_REPO_URL" ] \
    || [ "${#GIT_REPO_URL}" -gt 2048 ] \
    || [[ "$GIT_REPO_URL" =~ [[:space:]\'\;\`\$] ]] \
    || [[ ! "$GIT_REPO_URL" =~ ^(https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/[A-Za-z0-9._~/-]+|ssh://[A-Za-z0-9._-]+@[A-Za-z0-9.-]+(:[0-9]{1,5})?/[A-Za-z0-9._~/-]+|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._~/-]+)$ ]]; then
    fail 'GIT_REPO_URL must be a bounded credential-free HTTPS or SSH Git URL using safe characters.'
  fi
  if [[ "$GIT_REPO_URL" =~ ^https://[^/]*@ ]]; then
    fail 'GIT_REPO_URL must not contain credentials.'
  fi
  if [[ ! "$GIT_REF" =~ ^[0-9a-f]{40}$ ]]; then
    fail 'GIT_REF must be the exact lowercase 40-character runtime commit.'
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
  if [[ "$ENABLE_SERVICES" = yes && "$START_SERVICES" != yes ]]; then
    fail 'ENABLE_SERVICES=yes requires START_SERVICES=yes so boot enablement follows runtime verification.'
  fi
}

validate_restore_source_paths() {
  validate_optional_controlled_path PRIMARY_API_ENV_SOURCE "$PRIMARY_API_ENV_SOURCE"
  validate_optional_controlled_path PRIMARY_WEB_ENV_SOURCE "$PRIMARY_WEB_ENV_SOURCE"
  validate_optional_controlled_path EXTRA_ENV_SOURCE_DIR "$EXTRA_ENV_SOURCE_DIR"
  validate_optional_controlled_path DATABASE_RESTORE_FILE "$DATABASE_RESTORE_FILE"
  validate_optional_controlled_path OBJECT_STORAGE_ARCHIVE "$OBJECT_STORAGE_ARCHIVE"
  validate_optional_controlled_path OBJECT_STORAGE_MANIFEST "$OBJECT_STORAGE_MANIFEST"
}

validate_database_restore_request() {
  if [[ "$RESTORE_DATABASE" != yes ]]; then
    return 0
  fi

  [[ "$REQUIRE_CONFIRM_RESTORE" = yes ]] \
    || fail 'RESTORE_DATABASE=yes requires REQUIRE_CONFIRM_RESTORE=yes.'
  case "$DATABASE_RESTORE_FILE" in
    *.dump)
      ;;
    *.sql)
      fail 'Plain SQL database restores are prohibited because psql meta-commands can execute operating-system commands.'
      ;;
    *)
      fail 'Database restore requires an explicit custom pg_dump .dump file.'
      ;;
  esac
  [[ "$DATABASE_RESTORE_SHA256" =~ ^[0-9a-f]{64}$ ]] \
    || fail 'DATABASE_RESTORE_SHA256 must be an independently reviewed lowercase SHA-256 digest.'
}

validate_primary_env_restore_request() {
  if [[ "$RESTORE_PRIMARY_ENV" != yes ]]; then
    return 0
  fi

  [[ "$REQUIRE_CONFIRM_RESTORE" = yes ]] \
    || fail 'RESTORE_PRIMARY_ENV=yes requires REQUIRE_CONFIRM_RESTORE=yes.'
  [[ "$PRIMARY_API_ENV_SHA256" =~ ^[0-9a-f]{64}$ ]] \
    || fail 'PRIMARY_API_ENV_SHA256 must be an independently reviewed lowercase SHA-256 digest.'
  [[ "$PRIMARY_WEB_ENV_SHA256" =~ ^[0-9a-f]{64}$ ]] \
    || fail 'PRIMARY_WEB_ENV_SHA256 must be an independently reviewed lowercase SHA-256 digest.'
}

validate_object_storage_restore_request() {
  if [[ "$RESTORE_OBJECT_STORAGE" != yes ]]; then
    return 0
  fi

  [[ "$REQUIRE_CONFIRM_RESTORE" = yes ]] \
    || fail 'RESTORE_OBJECT_STORAGE=yes requires REQUIRE_CONFIRM_RESTORE=yes.'
  [[ -n "$OBJECT_STORAGE_ARCHIVE" ]] \
    || fail 'RESTORE_OBJECT_STORAGE=yes requires an explicit object-storage archive.'
  [[ -n "$OBJECT_STORAGE_MANIFEST" ]] \
    || fail 'RESTORE_OBJECT_STORAGE=yes requires an explicit object-storage manifest.'
  [[ "$OBJECT_STORAGE_ARCHIVE_SHA256" =~ ^[0-9a-f]{64}$ ]] \
    || fail 'OBJECT_STORAGE_ARCHIVE_SHA256 must be an independently reviewed lowercase SHA-256 digest.'
  [[ "$OBJECT_STORAGE_MANIFEST_SHA256" =~ ^[0-9a-f]{64}$ ]] \
    || fail 'OBJECT_STORAGE_MANIFEST_SHA256 must be an independently reviewed lowercase SHA-256 digest.'
}

require_root_controlled_directory() {
  local directory="$1"
  local allow_missing="${2:-no}"

  "$PYTHON_BIN" -I - "$directory" "$allow_missing" <<'PY'
from pathlib import Path
import stat
import sys

path = Path(sys.argv[1])
allow_missing = sys.argv[2] == 'yes'
try:
    metadata = path.lstat()
except FileNotFoundError:
    if allow_missing:
        raise SystemExit(0)
    raise SystemExit(f'root-controlled directory is missing: {path}')
if not stat.S_ISDIR(metadata.st_mode):
    raise SystemExit(f'root-controlled path is not a non-symlink directory: {path}')
if metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022:
    raise SystemExit(f'directory is not root-controlled: {path}')
PY
}

prepare_canonical_env_layout() {
  require_root_controlled_directory /etc
  require_root_controlled_directory /etc/feishu-timeline yes
  if [[ ! -e /etc/feishu-timeline && ! -L /etc/feishu-timeline ]]; then
    install -d -o root -g root -m 0755 /etc/feishu-timeline
  fi
  require_root_controlled_directory /etc/feishu-timeline
}

prepare_privileged_tool_layout() {
  local directory

  require_root_controlled_directory /usr
  for directory in /usr/local /usr/local/libexec /usr/local/libexec/feishu-timeline; do
    require_root_controlled_directory "$directory" yes
    if [[ ! -e "$directory" && ! -L "$directory" ]]; then
      install -d -o root -g root -m 0755 "$directory"
    fi
    require_root_controlled_directory "$directory"
  done
}

prepare_root_controlled_layout() {
  "$PYTHON_BIN" -I - "$APP_ROOT" "$RELEASES_DIR" "$CURRENT_LINK" <<'PY'
from pathlib import Path
import os
import re
import stat
import sys

app_root, releases, current = map(Path, sys.argv[1:])

def require_secure_directory(path: Path, *, allow_missing: bool) -> None:
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        if allow_missing:
            return
        raise SystemExit(f'managed directory is missing: {path}')
    if not stat.S_ISDIR(metadata.st_mode):
        raise SystemExit(f'managed path is not a non-symlink directory: {path}')
    if metadata.st_uid != 0:
        raise SystemExit(f'managed directory is not root-owned: {path}')
    if stat.S_IMODE(metadata.st_mode) & 0o022:
        raise SystemExit(f'managed directory is group/other writable: {path}')

require_secure_directory(Path('/opt'), allow_missing=False)
require_secure_directory(app_root, allow_missing=True)
require_secure_directory(releases, allow_missing=True)
require_secure_directory(app_root / 'var', allow_missing=True)

if current.exists() or current.is_symlink():
    metadata = current.lstat()
    if not stat.S_ISLNK(metadata.st_mode) or metadata.st_uid != 0:
        raise SystemExit(f'current release pointer is not a root-owned symlink: {current}')
    target = Path(os.path.realpath(current))
    if target.parent != releases or not re.fullmatch(r'[0-9a-f]{40}', target.name):
        raise SystemExit(f'current release pointer escapes the immutable release root: {current}')
    require_secure_directory(target, allow_missing=False)
PY

  install -d -o root -g root -m 0755 "$APP_ROOT" "$RELEASES_DIR" "$APP_ROOT/var"
  "$PYTHON_BIN" -I - "$APP_ROOT" "$RELEASES_DIR" "$APP_ROOT/var" <<'PY'
from pathlib import Path
import stat
import sys

for value in sys.argv[1:]:
    path = Path(value)
    metadata = path.lstat()
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0:
        raise SystemExit(f'managed directory failed root ownership validation: {path}')
    if stat.S_IMODE(metadata.st_mode) & 0o022:
        raise SystemExit(f'managed directory remained group/other writable: {path}')
PY
}

initialize_repo_stage_dir() {
  REPO_STAGE_DIR="$(mktemp -d "/tmp/${APP_NAME}-repo-stage-XXXXXX")"
  validate_controlled_path REPO_STAGE_DIR "$REPO_STAGE_DIR"
  [ ! -L "$REPO_STAGE_DIR" ] \
    && [ "$(stat -c '%u:%a' "$REPO_STAGE_DIR")" = '0:700' ] \
    || fail "System temporary directory is not a private root-owned directory: $REPO_STAGE_DIR"
  chmod 0711 "$REPO_STAGE_DIR"

  BUILD_ROOT="$REPO_STAGE_DIR/build"
  BUILD_HOME="$REPO_STAGE_DIR/builder-home"
  BUILD_COREPACK_HOME="$BUILD_HOME/.cache/node/corepack"
  BUILD_CONFIG_ROOT="$REPO_STAGE_DIR/build-config"
  BUILD_WEB_ENV="$BUILD_CONFIG_ROOT/web.env"
  PRIVILEGED_SOURCE_ROOT="$BUILD_CONFIG_ROOT/privileged-source"
  PRIVILEGED_API_SERVICE_SOURCE="$PRIVILEGED_SOURCE_ROOT/feishu-timeline-api.service"
  PRIVILEGED_WEB_SERVICE_SOURCE="$PRIVILEGED_SOURCE_ROOT/feishu-timeline-web.service"
  PRIVILEGED_TIMELINE_NGINX_SOURCE="$PRIVILEGED_SOURCE_ROOT/timeline.all-too-well.com.conf"
  PRIVILEGED_ROOT_NGINX_SOURCE="$PRIVILEGED_SOURCE_ROOT/all-too-well.com.placeholder.conf"
  install -d -o "$APP_USER" -g "$APP_GROUP" -m 0700 "$REPO_STAGE_DIR/source"
  install -d -o "$BUILD_USER" -g "$BUILD_GROUP" -m 0700 "$BUILD_ROOT" "$BUILD_HOME"
  install -d -o root -g "$BUILD_GROUP" -m 0750 "$BUILD_CONFIG_ROOT"
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
  if [[ -n "${SSH_AUTH_SOCK:-}" ]]; then
    run_as_app env -i \
      "HOME=$APP_HOME" \
      "COREPACK_HOME=$COREPACK_HOME" \
      "PATH=$APP_RUNTIME_PATH" \
      "SSH_AUTH_SOCK=$SSH_AUTH_SOCK" \
      "GIT_NO_REPLACE_OBJECTS=1" \
      "GIT_CONFIG_NOSYSTEM=1" \
      "GIT_CONFIG_GLOBAL=/dev/null" \
      "$@"
  else
    run_as_app env -i \
      "HOME=$APP_HOME" \
      "COREPACK_HOME=$COREPACK_HOME" \
      "PATH=$APP_RUNTIME_PATH" \
      "GIT_NO_REPLACE_OBJECTS=1" \
      "GIT_CONFIG_NOSYSTEM=1" \
      "GIT_CONFIG_GLOBAL=/dev/null" \
      "$@"
  fi
}

run_as_builder_in_dir() {
  local workdir="$1"
  shift

  runuser -u "$BUILD_USER" -- env -i \
    "HOME=$BUILD_HOME" \
    "COREPACK_HOME=$BUILD_COREPACK_HOME" \
    "PATH=$APP_RUNTIME_PATH" \
    /bin/bash -c '
      set -euo pipefail
      workdir="$1"
      shift
      cd -- "$workdir"
      exec "$@"
    ' restore-build "$workdir" "$@"
}

quiesce_and_freeze_build_tree() {
  if pgrep -u "$BUILD_USER" >/dev/null 2>&1; then
    pkill -STOP -u "$BUILD_USER" || true
    pkill -KILL -u "$BUILD_USER" || true
  fi
  for _ in 1 2 3 4 5; do
    pgrep -u "$BUILD_USER" >/dev/null 2>&1 || break
    sleep 1
  done
  if pgrep -u "$BUILD_USER" >/dev/null 2>&1; then
    fail 'Build identity still owns running processes after quiescence.'
  fi
  "$PYTHON_BIN" -I - "$BUILD_ROOT" "$(id -u "$BUILD_USER")" <<'PY'
from pathlib import Path
import os
import stat
import sys

root = Path(sys.argv[1])
expected_uid = int(sys.argv[2])
root_metadata = root.lstat()
if not stat.S_ISDIR(root_metadata.st_mode) or root_metadata.st_uid != expected_uid:
    raise SystemExit('build root lost its isolated build ownership')
root_device = root_metadata.st_dev
for directory, directory_names, file_names in os.walk(root, followlinks=False):
    parent = Path(directory)
    for name in [*directory_names, *file_names]:
        if any(ord(character) < 0x20 or ord(character) == 0x7F for character in name):
            raise SystemExit(f'build tree contains a control character: {parent / name}')
        path = parent / name
        metadata = path.lstat()
        if metadata.st_uid != expected_uid:
            raise SystemExit(f'build entry has an unexpected owner: {path}')
        if metadata.st_dev != root_device:
            raise SystemExit(f'build entry crosses a filesystem boundary: {path}')
        if stat.S_ISREG(metadata.st_mode):
            if metadata.st_nlink != 1:
                raise SystemExit(f'build file has an external hard-link risk: {path}')
        elif stat.S_ISDIR(metadata.st_mode):
            continue
        elif stat.S_ISLNK(metadata.st_mode):
            target = os.readlink(path)
            if os.path.isabs(target) or any(
                ord(character) < 0x20 or ord(character) == 0x7F for character in target
            ):
                raise SystemExit(f'build symlink has an unsafe target: {path}')
            resolved = (path.parent / target).resolve(strict=False)
            try:
                resolved.relative_to(root)
            except ValueError as error:
                raise SystemExit(f'build symlink escapes the build root: {path}') from error
        else:
            raise SystemExit(f'build tree contains a special file: {path}')
PY
  find "$BUILD_ROOT" -xdev -type d -exec chown root:root -- {} +
  find "$BUILD_ROOT" -xdev -type f -exec chown root:root -- {} +
  find "$BUILD_ROOT" -xdev -type l -exec chown -h root:root -- {} +
  find "$BUILD_ROOT" -xdev -type d -exec chmod 0755 -- {} +
  find "$BUILD_ROOT" -xdev -type f -exec chmod u+rw,go+r,go-w -- {} +
  BUILD_TREE_FROZEN=yes
}

reopen_build_tree_for_builder() {
  [[ "$BUILD_TREE_FROZEN" = yes ]] \
    || fail 'Build tree must be root-frozen before reopening it for the isolated builder.'
  [[ -d "$BUILD_ROOT" && ! -L "$BUILD_ROOT" && "$(stat -c '%u' "$BUILD_ROOT")" = 0 ]] \
    || fail 'Frozen build tree lost its root ownership boundary.'
  find "$BUILD_ROOT" -xdev -type d -exec chown "$BUILD_USER:$BUILD_GROUP" -- {} +
  find "$BUILD_ROOT" -xdev -type f -exec chown "$BUILD_USER:$BUILD_GROUP" -- {} +
  find "$BUILD_ROOT" -xdev -type l -exec chown -h "$BUILD_USER:$BUILD_GROUP" -- {} +
  BUILD_TREE_FROZEN=no
}

ensure_app_user_exists() {
  local account_home
  local account_shell

  if ! id "$APP_USER" >/dev/null 2>&1; then
    fail "Application user does not exist: $APP_USER. Run bootstrap_gcp.sh first or create the account manually."
  fi
  account_home="$(getent passwd "$APP_USER" | awk -F: 'NR == 1 {print $6}')"
  account_shell="$(getent passwd "$APP_USER" | awk -F: 'NR == 1 {print $7}')"
  [ "$account_home" = "$APP_HOME" ] \
    || fail "Deploy account home does not match APP_HOME: $APP_USER"
  case "$account_shell" in
    */nologin|*/false|'') fail "Deploy SSH/sudo identity must have an interactive login shell: $APP_USER" ;;
  esac
}

ensure_runtime_identity() {
  local runtime_user="$1"
  local runtime_group="$2"
  local actual_shell

  if ! getent group "$runtime_group" >/dev/null; then
    groupadd --system "$runtime_group"
  fi
  if ! id "$runtime_user" >/dev/null 2>&1; then
    useradd --system \
      --gid "$runtime_group" \
      --home-dir /nonexistent \
      --no-create-home \
      --shell /usr/sbin/nologin \
      "$runtime_user"
  fi
  actual_shell="$(getent passwd "$runtime_user" | awk -F: 'NR == 1 {print $7}')"
  [ "$actual_shell" = /usr/sbin/nologin ] \
    || fail "Runtime identity must use /usr/sbin/nologin: $runtime_user"
  [ "$(id -gn "$runtime_user")" = "$runtime_group" ] \
    || fail "Runtime identity has an unexpected primary group: $runtime_user"
  [ "$runtime_user" != "$APP_USER" ] \
    || fail 'Deploy identity must not be a runtime identity.'
}

ensure_runtime_identities() {
  local api_group_id
  local build_group_id
  local runtime_group_id
  local runtime_user
  local web_group_id

  ensure_runtime_identity "$API_RUNTIME_USER" "$API_RUNTIME_GROUP"
  ensure_runtime_identity "$WEB_RUNTIME_USER" "$WEB_RUNTIME_GROUP"
  ensure_runtime_identity "$BUILD_USER" "$BUILD_GROUP"
  [ "$API_RUNTIME_USER" != "$WEB_RUNTIME_USER" ] \
    || fail 'API and Web runtime identities must be distinct.'
  [ "$BUILD_USER" != "$API_RUNTIME_USER" ] \
    && [ "$BUILD_USER" != "$WEB_RUNTIME_USER" ] \
    && [ "$BUILD_USER" != "$APP_USER" ] \
    || fail 'Build, deploy, and runtime identities must be distinct.'
  if runuser -u "$BUILD_USER" -- /usr/bin/sudo -n true >/dev/null 2>&1; then
    fail 'Build identity must not have non-interactive sudo access.'
  fi
  for runtime_user in "$API_RUNTIME_USER" "$WEB_RUNTIME_USER"; do
    if runuser -u "$runtime_user" -- /usr/bin/sudo -n true >/dev/null 2>&1; then
      fail "Runtime identity must not have non-interactive sudo access: $runtime_user"
    fi
  done
  api_group_id="$(id -g "$API_RUNTIME_USER")"
  web_group_id="$(id -g "$WEB_RUNTIME_USER")"
  build_group_id="$(id -g "$BUILD_USER")"
  if id -G "$API_RUNTIME_USER" | tr ' ' '\n' | grep -Fx "$web_group_id" >/dev/null; then
    fail 'API runtime identity belongs to the Web runtime group.'
  fi
  if id -G "$WEB_RUNTIME_USER" | tr ' ' '\n' | grep -Fx "$api_group_id" >/dev/null; then
    fail 'Web runtime identity belongs to the API runtime group.'
  fi
  for runtime_user in "$API_RUNTIME_USER" "$WEB_RUNTIME_USER"; do
    if id -G "$runtime_user" | tr ' ' '\n' | grep -Fx "$build_group_id" >/dev/null; then
      fail "Runtime identity belongs to the build group: $runtime_user"
    fi
  done
  for runtime_group_id in "$api_group_id" "$web_group_id"; do
    if id -G "$BUILD_USER" | tr ' ' '\n' | grep -Fx "$runtime_group_id" >/dev/null; then
      fail 'Build identity belongs to an application runtime group.'
    fi
  done
}

require_quiesced_data_restore() {
  if systemctl is-active --quiet feishu-timeline-api.service; then
    fail 'Stop feishu-timeline-api.service before activating the restore transaction.'
  fi
  if systemctl is-active --quiet feishu-timeline-web.service; then
    fail 'Stop feishu-timeline-web.service before activating the restore transaction.'
  fi
  if ps -u "$API_RUNTIME_USER" -o pid= 2>/dev/null | grep -Eq '[0-9]'; then
    fail 'API runtime processes are still present; restore activation requires a quiesced runtime identity.'
  fi
  if ps -u "$WEB_RUNTIME_USER" -o pid= 2>/dev/null | grep -Eq '[0-9]'; then
    fail 'Web runtime processes are still present; restore activation requires a quiesced runtime identity.'
  fi
}

quiesce_runtime_services() {
  RUNTIME_QUIESCED=committing
  if systemctl is-enabled --quiet feishu-timeline-api.service; then
    API_SERVICE_WAS_ENABLED=yes
  fi
  if systemctl is-enabled --quiet feishu-timeline-web.service; then
    WEB_SERVICE_WAS_ENABLED=yes
  fi
  if systemctl is-active --quiet feishu-timeline-api.service; then
    API_SERVICE_WAS_ACTIVE=yes
  fi
  if systemctl is-active --quiet feishu-timeline-web.service; then
    WEB_SERVICE_WAS_ACTIVE=yes
  fi
  SERVICES_BOOT_DISABLED=committing
  for runtime_unit in feishu-timeline-api.service feishu-timeline-web.service; do
    if systemctl cat "$runtime_unit" >/dev/null 2>&1; then
      systemctl disable "$runtime_unit"
    fi
  done
  SERVICES_BOOT_DISABLED=yes
  fsync_directory /etc/systemd/system
  if [[ -d /etc/systemd/system/multi-user.target.wants \
      && ! -L /etc/systemd/system/multi-user.target.wants ]]; then
    fsync_directory /etc/systemd/system/multi-user.target.wants
  fi
  systemctl stop feishu-timeline-api.service feishu-timeline-web.service || true
  require_quiesced_data_restore
  RUNTIME_QUIESCED=yes
}

ensure_app_home_exists() {
  local app_home_mode

  if [[ ! -d "$APP_HOME" || -L "$APP_HOME" ]]; then
    fail "Application home directory not found: $APP_HOME. Web service requires a real HOME for pnpm/corepack."
  fi
  [ "$(stat -c '%u' "$APP_HOME")" = "$(id -u "$APP_USER")" ] \
    || fail "Application home must be owned by the deploy identity: $APP_HOME"
  app_home_mode="$(stat -c '%a' "$APP_HOME")"
  [[ "$app_home_mode" =~ ^[0-7]{3,4}$ ]] \
    && (( (8#$app_home_mode & 0022) == 0 )) \
    || fail "Application home must not be group/other writable: $APP_HOME"
}

install_dotenv_data_tool() {
  local destination
  local source
  local source_and_destination
  local source_and_target
  local target

  [[ "$BUILD_TREE_FROZEN" = yes ]] \
    || fail 'Privileged data-tool staging requires a root-frozen source tree.'
  prepare_privileged_tool_layout
  [[ ! -e "$DOTENV_DATA_TOOL_CANDIDATE" && ! -L "$DOTENV_DATA_TOOL_CANDIDATE" \
      && ! -e "$ARCHIVE_DATA_TOOL_CANDIDATE" && ! -L "$ARCHIVE_DATA_TOOL_CANDIDATE" \
      && ! -e "$PREVIOUS_DOTENV_TOOL" && ! -L "$PREVIOUS_DOTENV_TOOL" \
      && ! -e "$PREVIOUS_ARCHIVE_TOOL" && ! -L "$PREVIOUS_ARCHIVE_TOOL" ]] \
    || fail 'Privileged data-tool transaction path already exists.'
  for source_and_target in \
    "$BUILD_ROOT/scripts/deploy/dotenv-data.py|$DOTENV_DATA_TOOL_CANDIDATE" \
    "$BUILD_ROOT/scripts/migration/archive-data.py|$ARCHIVE_DATA_TOOL_CANDIDATE"; do
    source="${source_and_target%%|*}"
    target="${source_and_target#*|}"
    [ -f "$source" ] && [ ! -L "$source" ] && [ "$(stat -c '%u' "$source")" = 0 ] \
      || fail "Exact-commit data tool is missing or unsafe: $source"
    install -o root -g root -m 0755 "$source" "$target"
    printf 'staged_data_tool=%s sha256=%s runtime_commit=%s\n' \
      "$target" "$(sha256sum "$target" | awk '{print $1}')" "$RESTORED_RUNTIME_COMMIT"
  done
  DATA_TOOLS_STAGED=yes
  DOTENV_DATA_TOOL="$DOTENV_DATA_TOOL_CANDIDATE"
  ARCHIVE_DATA_TOOL="$ARCHIVE_DATA_TOOL_CANDIDATE"

  install -d -o root -g root -m 0700 "$PRIVILEGED_SOURCE_ROOT"
  for source_and_destination in \
    "$BUILD_ROOT/$API_SERVICE_SOURCE_REL|$PRIVILEGED_API_SERVICE_SOURCE" \
    "$BUILD_ROOT/$WEB_SERVICE_SOURCE_REL|$PRIVILEGED_WEB_SERVICE_SOURCE" \
    "$BUILD_ROOT/$TIMELINE_NGINX_SOURCE_REL|$PRIVILEGED_TIMELINE_NGINX_SOURCE" \
    "$BUILD_ROOT/$ROOT_PLACEHOLDER_SOURCE_REL|$PRIVILEGED_ROOT_NGINX_SOURCE"; do
    source="${source_and_destination%%|*}"
    destination="${source_and_destination#*|}"
    [[ -f "$source" && ! -L "$source" && "$(stat -c '%u' "$source")" = 0 ]] \
      || fail "Frozen privileged configuration source is missing or unsafe: $source"
    install -o root -g root -m 0600 "$source" "$destination"
  done
}

validate_trusted_env_file() {
  local env_file="$1"
  local expected_group
  local expected_user
  local file_mode
  local file_owner
  local file_group

  case "$env_file" in
    "$PRIMARY_API_ENV_TARGET"|"$STAGED_API_ENV")
      expected_group="$API_RUNTIME_GROUP"
      expected_user="$API_RUNTIME_USER"
      ;;
    "$PRIMARY_WEB_ENV_TARGET"|"$STAGED_WEB_ENV")
      expected_group="$WEB_RUNTIME_GROUP"
      expected_user="$WEB_RUNTIME_USER"
      ;;
    *)
      fail 'Refusing to parse an env file outside the canonical production env paths.'
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
  [ "$file_group" = "$expected_group" ] \
    || fail "Trusted production env must use the application group: $env_file"
  case "$file_mode" in
    440|640)
      ;;
    *)
      fail "Trusted production env must have mode 440 or 640: $env_file"
      ;;
  esac
  runuser -u "$expected_user" -- test -r "$env_file" \
    || fail "Application user cannot read the trusted production env: $env_file"

  [ "$(stat -c '%U' /etc/feishu-timeline 2>/dev/null || true)" = root ] \
    || fail 'Canonical production env parent must be owned by root.'
  case "$(stat -c '%a' /etc/feishu-timeline 2>/dev/null || true)" in
    755|750|711|710|700)
      ;;
    *)
      fail 'Canonical production env parent must not be group/other writable.'
      ;;
  esac
}

validate_build_web_env_file() {
  local env_file="$1"
  local file_group
  local file_mode
  local file_owner

  [ "$env_file" = "$BUILD_WEB_ENV" ] \
    || fail 'Build Web env must use the fixed restore staging target.'
  [ -f "$env_file" ] && [ ! -L "$env_file" ] \
    || fail "Build Web env must be a regular non-symlink file: $env_file"
  file_owner="$(stat -c '%U' "$env_file" 2>/dev/null || true)"
  file_group="$(stat -c '%G' "$env_file" 2>/dev/null || true)"
  file_mode="$(stat -c '%a' "$env_file" 2>/dev/null || true)"
  [ "$file_owner" = root ] \
    && [ "$file_group" = "$BUILD_GROUP" ] \
    && [ "$file_mode" = 640 ] \
    || fail 'Build Web env must be root-owned, build-group-readable, and mode 0640.'
  [ -d "$BUILD_CONFIG_ROOT" ] && [ ! -L "$BUILD_CONFIG_ROOT" ] \
    && [ "$(stat -c '%U' "$BUILD_CONFIG_ROOT" 2>/dev/null || true)" = root ] \
    && [ "$(stat -c '%G' "$BUILD_CONFIG_ROOT" 2>/dev/null || true)" = "$BUILD_GROUP" ] \
    && [ "$(stat -c '%a' "$BUILD_CONFIG_ROOT" 2>/dev/null || true)" = 750 ] \
    || fail 'Build configuration parent lost its root-controlled boundary.'
  "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" validate --profile web "$env_file"
}

run_as_builder_in_dir_with_trusted_env() {
  local workdir="$1"
  local env_file="$2"
  local profile="$3"
  shift 3

  [ "$profile" = web ] || fail "Unsupported build dotenv profile: $profile"
  validate_build_web_env_file "$env_file"
  run_as_builder_in_dir "$workdir" \
    "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" exec --profile "$profile" "$env_file" -- "$@"
}

maybe_set_default_backup_paths() {
  if [[ -z "$BACKUP_ROOT" ]]; then
    return 0
  fi

  [[ -z "$PRIMARY_API_ENV_SOURCE" ]] && PRIMARY_API_ENV_SOURCE="$BACKUP_ROOT/env/primary/api.env.production"
  [[ -z "$PRIMARY_WEB_ENV_SOURCE" ]] && PRIMARY_WEB_ENV_SOURCE="$BACKUP_ROOT/env/primary/web.env.production"
  [[ -z "$EXTRA_ENV_SOURCE_DIR" ]] && EXTRA_ENV_SOURCE_DIR="$BACKUP_ROOT/env/extra"
  [[ -z "$OBJECT_STORAGE_ARCHIVE" ]] && OBJECT_STORAGE_ARCHIVE="$BACKUP_ROOT/object-storage/${APP_NAME}-object-storage.tar.gz"
  [[ -z "$OBJECT_STORAGE_MANIFEST" ]] && OBJECT_STORAGE_MANIFEST="$BACKUP_ROOT/object-storage/object-storage-manifest.jsonl"

  if [[ -z "$DATABASE_RESTORE_FILE" ]]; then
    if [[ -f "$BACKUP_ROOT/database/${APP_NAME}.dump" ]]; then
      DATABASE_RESTORE_FILE="$BACKUP_ROOT/database/${APP_NAME}.dump"
    fi
  fi
}

restore_primary_env_if_requested() {
  local api_group_id
  local api_source="$PRIMARY_API_ENV_SOURCE"
  local app_uid
  local web_group_id
  local web_source="$PRIMARY_WEB_ENV_SOURCE"

  if [[ "$RESTORE_PRIMARY_ENV" != "yes" ]]; then
    warn "RESTORE_PRIMARY_ENV=no; rebinding the existing canonical env metadata without importing backup env files."
    validate_trusted_env_file "$PRIMARY_API_ENV_TARGET"
    validate_trusted_env_file "$PRIMARY_WEB_ENV_TARGET"
    api_source="$PRIMARY_API_ENV_TARGET"
    web_source="$PRIMARY_WEB_ENV_TARGET"
  else
    [[ -f "$api_source" ]] || fail "Primary API env source not found: $api_source"
    [[ -f "$web_source" ]] || fail "Primary Web env source not found: $web_source"
    [[ ! -e "$PRIMARY_API_ENV_SNAPSHOT" && ! -L "$PRIMARY_API_ENV_SNAPSHOT" \
        && ! -e "$PRIMARY_WEB_ENV_SNAPSHOT" && ! -L "$PRIMARY_WEB_ENV_SNAPSHOT" ]] \
      || fail 'Primary env source snapshot path already exists.'
    install -d -o root -g root -m 0755 /etc/feishu-timeline
    app_uid="$(id -u "$APP_USER")"
    PRIMARY_API_SNAPSHOT_CREATED=committing
    "$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" snapshot-file \
      --allowed-uid 0 --allowed-uid "$app_uid" \
      --sha256 "$PRIMARY_API_ENV_SHA256" --max-bytes 1048576 \
      --uid 0 --gid 0 --mode 0600 \
      "$api_source" "$PRIMARY_API_ENV_SNAPSHOT" >/dev/null
    PRIMARY_API_SNAPSHOT_CREATED=yes
    PRIMARY_WEB_SNAPSHOT_CREATED=committing
    "$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" snapshot-file \
      --allowed-uid 0 --allowed-uid "$app_uid" \
      --sha256 "$PRIMARY_WEB_ENV_SHA256" --max-bytes 1048576 \
      --uid 0 --gid 0 --mode 0600 \
      "$web_source" "$PRIMARY_WEB_ENV_SNAPSHOT" >/dev/null
    PRIMARY_WEB_SNAPSHOT_CREATED=yes
    api_source="$PRIMARY_API_ENV_SNAPSHOT"
    web_source="$PRIMARY_WEB_ENV_SNAPSHOT"
  fi

  # Backup ownership is not evidence of trust. Validate the exact source bytes
  # before any privileged installation or ownership change.
  "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" validate --profile api "$api_source"
  "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" validate --profile web "$web_source"

  api_group_id="$(getent group "$API_RUNTIME_GROUP" | awk -F: 'NR == 1 {print $3}')"
  web_group_id="$(getent group "$WEB_RUNTIME_GROUP" | awk -F: 'NR == 1 {print $3}')"
  [[ "$api_group_id" =~ ^[0-9]+$ ]] || fail "Cannot resolve runtime group: $API_RUNTIME_GROUP"
  [[ "$web_group_id" =~ ^[0-9]+$ ]] || fail "Cannot resolve runtime group: $WEB_RUNTIME_GROUP"

  STAGED_API_ENV="/etc/feishu-timeline/.api.env.candidate.$GIT_REF"
  STAGED_WEB_ENV="/etc/feishu-timeline/.web.env.candidate.$GIT_REF"
  [[ ! -e "$STAGED_API_ENV" && ! -L "$STAGED_API_ENV" \
      && ! -e "$STAGED_WEB_ENV" && ! -L "$STAGED_WEB_ENV" ]] \
    || fail 'A canonical env candidate already exists; review it before retrying.'

  log "Staging primary env files in the canonical root-controlled directory"
  require_root_controlled_directory /etc/feishu-timeline
  API_ENV_STAGED=committing
  "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" rewrite \
    --profile api \
    --source "$api_source" \
    --target "$STAGED_API_ENV" \
    --set "RUNTIME_COMMIT=$RESTORED_RUNTIME_COMMIT" \
    --set "BUILD_TIME=$RESTORE_BUILD_TIME" \
    --set "RELEASE=$RESTORE_RELEASE" \
    --uid 0 \
    --gid "$api_group_id" \
    --mode 0640 \
    --require-secure-parent
  API_ENV_STAGED=yes
  WEB_ENV_STAGED=committing
  "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" rewrite \
    --profile web \
    --source "$web_source" \
    --target "$STAGED_WEB_ENV" \
    --set "RUNTIME_COMMIT=$RESTORED_RUNTIME_COMMIT" \
    --set "BUILD_TIME=$RESTORE_BUILD_TIME" \
    --set "RELEASE=$RESTORE_RELEASE" \
    --uid 0 \
    --gid "$web_group_id" \
    --mode 0640 \
    --require-secure-parent
  WEB_ENV_STAGED=yes
  BUILD_API_ENV="$STAGED_API_ENV"
  BUILD_WEB_ENV_SOURCE="$STAGED_WEB_ENV"
  rm -f -- "$PRIMARY_API_ENV_SNAPSHOT" "$PRIMARY_WEB_ENV_SNAPSHOT"
  PRIMARY_API_SNAPSHOT_CREATED=no
  PRIMARY_WEB_SNAPSHOT_CREATED=no
}

commit_primary_env_if_staged() {
  local current_and_previous
  local current_file
  local previous_file

  [[ -n "$STAGED_API_ENV" && -n "$STAGED_WEB_ENV" ]] || return 0
  validate_trusted_env_file "$STAGED_API_ENV"
  validate_trusted_env_file "$STAGED_WEB_ENV"
  [[ ! -e "$PREVIOUS_API_ENV" && ! -L "$PREVIOUS_API_ENV" \
      && ! -e "$PREVIOUS_WEB_ENV" && ! -L "$PREVIOUS_WEB_ENV" ]] \
    || fail 'A canonical env transaction rollback file already exists.'

  for current_and_previous in \
    "$PRIMARY_API_ENV_TARGET|$PREVIOUS_API_ENV" \
    "$PRIMARY_WEB_ENV_TARGET|$PREVIOUS_WEB_ENV"; do
    current_file="${current_and_previous%%|*}"
    previous_file="${current_and_previous#*|}"
    if [[ -e "$current_file" || -L "$current_file" ]]; then
      [[ -f "$current_file" && ! -L "$current_file" \
          && ! -e "$previous_file" && ! -L "$previous_file" ]] \
        || fail "Existing canonical env or rollback target is unsafe: $current_file"
      ln "$current_file" "$previous_file"
      if [[ "$current_file" = "$PRIMARY_API_ENV_TARGET" ]]; then
        API_ENV_WAS_PRESENT=yes
      else
        WEB_ENV_WAS_PRESENT=yes
      fi
    fi
  done
  fsync_directory /etc/feishu-timeline

  API_ENV_ACTIVATED=committing
  mv -T "$STAGED_API_ENV" "$PRIMARY_API_ENV_TARGET"
  API_ENV_ACTIVATED=yes
  API_ENV_STAGED=no
  WEB_ENV_ACTIVATED=committing
  mv -T "$STAGED_WEB_ENV" "$PRIMARY_WEB_ENV_TARGET"
  WEB_ENV_ACTIVATED=yes
  WEB_ENV_STAGED=no
  fsync_directory /etc/feishu-timeline
  STAGED_API_ENV=""
  STAGED_WEB_ENV=""
  BUILD_API_ENV="$PRIMARY_API_ENV_TARGET"
  BUILD_WEB_ENV_SOURCE="$PRIMARY_WEB_ENV_TARGET"
  require_runtime_env_files_for_build
}

restore_extra_env_if_requested() {
  local review_candidate="$CONFIG_REVIEW_DIR/.legacy-env.candidate.$$"
  local review_root="$CONFIG_REVIEW_DIR/legacy-env"
  local review_group_id
  local review_manifest
  local review_manifest_candidate="$CONFIG_REVIEW_DIR/.legacy-env-manifest.candidate.$$"
  local review_manifest_target="$CONFIG_REVIEW_DIR/legacy-env-manifest.jsonl"

  if [[ "$RESTORE_EXTRA_ENV" != "yes" ]]; then
    warn "RESTORE_EXTRA_ENV=no; skipping optional extra env files."
    return 0
  fi

  [[ -d "$EXTRA_ENV_SOURCE_DIR" && ! -L "$EXTRA_ENV_SOURCE_DIR" ]] \
    || fail "Extra env source must be a non-symlink directory: $EXTRA_ENV_SOURCE_DIR"
  [[ ! -L "$CONFIG_REVIEW_DIR" \
      && ! -e "$review_root" && ! -L "$review_root" \
      && ! -e "$review_candidate" && ! -L "$review_candidate" \
      && ! -e "$review_manifest_candidate" && ! -L "$review_manifest_candidate" \
      && ! -e "$review_manifest_target" && ! -L "$review_manifest_target" ]] \
    || fail "Legacy env review target already exists or is unsafe: $review_root"
  review_group_id="$(getent group "$APP_GROUP" | awk -F: 'NR == 1 {print $3}')"
  [[ "$review_group_id" =~ ^[0-9]+$ ]] || fail "Cannot resolve deploy review group: $APP_GROUP"
  install -d -o root -g "$APP_GROUP" -m 0750 "$CONFIG_REVIEW_DIR"

  log "Quarantining legacy env data for operator review at $review_root"
  install -d -o root -g root -m 0700 "$review_candidate"
  review_manifest="$(mktemp /tmp/feishu-timeline-legacy-env-manifest.XXXXXX)"
  chmod 0600 "$review_manifest"
  if ! "$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" snapshot-tree --uid 0 --gid 0 \
      "$EXTRA_ENV_SOURCE_DIR" "$review_candidate" >"$review_manifest"; then
    rm -f -- "$review_manifest"
    fail 'Cannot take a stable no-follow snapshot of legacy env data.'
  fi
  find "$review_candidate" -mindepth 1 -type d -exec chown "root:$review_group_id" {} +
  find "$review_candidate" -mindepth 1 -type f -exec chown "root:$review_group_id" {} +
  find "$review_candidate" -mindepth 1 -type d -exec chmod 0750 {} +
  find "$review_candidate" -mindepth 1 -type f -exec chmod 0640 {} +
  chown "root:$review_group_id" "$review_candidate"
  chmod 0750 "$review_candidate"
  install -o root -g "$review_group_id" -m 0640 \
    "$review_manifest" "$review_manifest_candidate"
  rm -f -- "$review_manifest"
  mv -T -- "$review_candidate" "$review_root"
  mv -T -- "$review_manifest_candidate" "$review_manifest_target"
  fsync_directory "$CONFIG_REVIEW_DIR"
}

sync_repo_into_app_root() {
  local source_repo="$REPO_STAGE_DIR/source"
  local runtime_commit

  [[ -n "$GIT_REPO_URL" ]] || fail "GIT_REPO_URL is required."

  log "Fetching exact commit into deploy-only source: $source_repo"
  run_as_app_with_runtime git clone --no-checkout -- "$GIT_REPO_URL" "$source_repo"
  run_as_app_with_runtime git -C "$source_repo" fetch --depth 1 origin "$GIT_REF"
  RESTORED_RUNTIME_COMMIT="$(run_as_app_with_runtime git -C "$source_repo" rev-parse 'FETCH_HEAD^{commit}')"
  [ "$RESTORED_RUNTIME_COMMIT" = "$GIT_REF" ] \
    || fail 'Fetched runtime commit does not match the exact requested commit.'
  RESTORE_BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  RESTORE_RELEASE="r27-security-${RESTORED_RUNTIME_COMMIT:0:12}"
  runtime_commit="$RESTORED_RUNTIME_COMMIT"
  run_as_app_with_runtime git -C "$source_repo" archive "$runtime_commit" \
    | run_as_builder_in_dir "$BUILD_ROOT" tar -x
  [ ! -e "$BUILD_ROOT/.git" ] \
    || fail 'Clean archive unexpectedly contains Git metadata.'
}

prepare_build_runtime() {
  log "Preparing node/pnpm runtime for isolated build identity $BUILD_USER"
  run_as_builder_in_dir "$BUILD_ROOT" mkdir -p "$BUILD_COREPACK_HOME"
  run_as_builder_in_dir "$BUILD_ROOT" node --version >/dev/null
  run_as_builder_in_dir "$BUILD_ROOT" corepack prepare "pnpm@$PNPM_VERSION" --activate
  run_as_builder_in_dir "$BUILD_ROOT" pnpm --version >/dev/null
}

clean_build_outputs() {
  log "Removing stale build outputs only inside the isolated clean archive"
  run_as_builder_in_dir "$BUILD_ROOT" rm -rf apps/api/dist apps/web/.next
}

stage_object_storage_if_requested() {
  local app_uid
  local staging_manifest

  if [[ "$RESTORE_OBJECT_STORAGE" != "yes" ]]; then
    warn "RESTORE_OBJECT_STORAGE=no; skipping object storage restore."
    return 0
  fi

  [[ -f "$OBJECT_STORAGE_ARCHIVE" && ! -L "$OBJECT_STORAGE_ARCHIVE" ]] \
    || fail "Object storage archive must be a regular non-symlink file: $OBJECT_STORAGE_ARCHIVE"
  [[ -f "$OBJECT_STORAGE_MANIFEST" && ! -L "$OBJECT_STORAGE_MANIFEST" ]] \
    || fail "Object storage manifest must be a regular non-symlink file: $OBJECT_STORAGE_MANIFEST"
  [[ ! -e "$OBJECT_STORAGE_ARCHIVE_SNAPSHOT" && ! -L "$OBJECT_STORAGE_ARCHIVE_SNAPSHOT" \
      && ! -e "$OBJECT_STORAGE_MANIFEST_SNAPSHOT" && ! -L "$OBJECT_STORAGE_MANIFEST_SNAPSHOT" \
      && ! -e "$OBJECT_STORAGE_STAGING_DIR" && ! -L "$OBJECT_STORAGE_STAGING_DIR" \
      && ! -e "$OBJECT_STORAGE_PREVIOUS_DIR" && ! -L "$OBJECT_STORAGE_PREVIOUS_DIR" \
      && ! -e "$FAILED_OBJECT_STORAGE_DIR" && ! -L "$FAILED_OBJECT_STORAGE_DIR" ]] \
    || fail 'Object-storage staging or previous path already exists.'
  if [[ -e "$OBJECT_STORAGE_DIR" || -L "$OBJECT_STORAGE_DIR" ]]; then
    [[ -d "$OBJECT_STORAGE_DIR" && ! -L "$OBJECT_STORAGE_DIR" ]] \
      || fail "Existing object storage target is not a non-symlink directory: $OBJECT_STORAGE_DIR"
    OBJECT_STORAGE_WAS_PRESENT=yes
  fi

  app_uid="$(id -u "$APP_USER")"
  OBJECT_ARCHIVE_SNAPSHOT_CREATED=committing
  "$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" snapshot-file \
    --allowed-uid 0 --allowed-uid "$app_uid" \
    --sha256 "$OBJECT_STORAGE_ARCHIVE_SHA256" --uid 0 --gid 0 --mode 0600 \
    "$OBJECT_STORAGE_ARCHIVE" "$OBJECT_STORAGE_ARCHIVE_SNAPSHOT" >/dev/null
  OBJECT_ARCHIVE_SNAPSHOT_CREATED=yes
  OBJECT_MANIFEST_SNAPSHOT_CREATED=committing
  "$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" snapshot-file \
    --allowed-uid 0 --allowed-uid "$app_uid" \
    --sha256 "$OBJECT_STORAGE_MANIFEST_SHA256" --uid 0 --gid 0 --mode 0600 \
    "$OBJECT_STORAGE_MANIFEST" "$OBJECT_STORAGE_MANIFEST_SNAPSHOT" >/dev/null
  OBJECT_MANIFEST_SNAPSHOT_CREATED=yes
  "$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" validate-archive \
    --allowed-uid 0 "$OBJECT_STORAGE_ARCHIVE_SNAPSHOT"

  log "Extracting validated object storage into isolated staging: $OBJECT_STORAGE_STAGING_DIR"
  OBJECT_STORAGE_STAGED=committing
  install -d -o root -g root -m 0700 "$OBJECT_STORAGE_STAGING_DIR"
  OBJECT_STORAGE_STAGED=yes
  tar --extract --gzip --file="$OBJECT_STORAGE_ARCHIVE_SNAPSHOT" \
    --directory="$OBJECT_STORAGE_STAGING_DIR" \
    --no-same-owner --no-same-permissions --delay-directory-restore
  staging_manifest="$(mktemp /tmp/feishu-timeline-object-manifest.XXXXXX)"
  chmod 0600 "$staging_manifest"
  if ! "$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" manifest-tree \
      "$OBJECT_STORAGE_STAGING_DIR" >"$staging_manifest"; then
    rm -f -- "$staging_manifest"
    fail 'Cannot generate a stable manifest for staged object-storage content.'
  fi
  if ! cmp "$OBJECT_STORAGE_MANIFEST_SNAPSHOT" "$staging_manifest" >/dev/null; then
    rm -f -- "$staging_manifest"
    fail 'Restored object-storage content does not match the independently bound backup manifest.'
  fi
  rm -f "$staging_manifest"
  rm -f "$OBJECT_STORAGE_ARCHIVE_SNAPSHOT" "$OBJECT_STORAGE_MANIFEST_SNAPSHOT"
  OBJECT_ARCHIVE_SNAPSHOT_CREATED=no
  OBJECT_MANIFEST_SNAPSHOT_CREATED=no
  OBJECT_STORAGE_STAGING_IDENTITY="$(stat -c '%d:%i' "$OBJECT_STORAGE_STAGING_DIR")"
  [[ "$OBJECT_STORAGE_STAGING_IDENTITY" =~ ^[0-9]+:[0-9]+$ ]] \
    || fail 'Cannot bind the staged object-storage directory identity.'
}

activate_object_storage_if_requested() {
  local api_uid
  local api_gid

  [[ "$RESTORE_OBJECT_STORAGE" = yes ]] || return 0
  require_quiesced_data_restore
  api_uid="$(id -u "$API_RUNTIME_USER")"
  api_gid="$(id -g "$API_RUNTIME_USER")"

  # Keep staging root-only through validation and namespace activation.  This
  # prevents the runtime identity from changing approved bytes before commit.
  OBJECT_STORAGE_ACTIVATED=committing
  "$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" activate-tree \
    "$OBJECT_STORAGE_STAGING_DIR" "$OBJECT_STORAGE_DIR" "$OBJECT_STORAGE_PREVIOUS_DIR"
  OBJECT_STORAGE_ACTIVATED=yes
  OBJECT_STORAGE_STAGED=no
  find "$OBJECT_STORAGE_DIR" -mindepth 1 -type d -exec chown "$api_uid:$api_gid" {} +
  find "$OBJECT_STORAGE_DIR" -mindepth 1 -type f -exec chown "$api_uid:$api_gid" {} +
  find "$OBJECT_STORAGE_DIR" -mindepth 1 -type d -exec chmod 0750 {} +
  find "$OBJECT_STORAGE_DIR" -mindepth 1 -type f -exec chmod 0640 {} +
  chown "$api_uid:$api_gid" "$OBJECT_STORAGE_DIR"
  chmod 0750 "$OBJECT_STORAGE_DIR"
  if [[ -d "$OBJECT_STORAGE_PREVIOUS_DIR" ]]; then
    chown root:root "$OBJECT_STORAGE_PREVIOUS_DIR"
    chmod 0700 "$OBJECT_STORAGE_PREVIOUS_DIR"
    warn "Previous object storage was preserved root-only for explicit rollback: $OBJECT_STORAGE_PREVIOUS_DIR"
  fi
}

require_runtime_env_files_for_build() {
  validate_trusted_env_file "$BUILD_API_ENV"
  validate_trusted_env_file "$BUILD_WEB_ENV_SOURCE"
  runuser -u "$WEB_RUNTIME_USER" -- test ! -r "$BUILD_API_ENV" \
    || fail 'Web runtime can read the API environment.'
  runuser -u "$API_RUNTIME_USER" -- test ! -r "$BUILD_WEB_ENV_SOURCE" \
    || fail 'API runtime can read the Web environment.'
  runuser -u "$BUILD_USER" -- test ! -r "$BUILD_API_ENV" \
    || fail 'Build identity can read the API environment.'
  runuser -u "$BUILD_USER" -- test ! -r "$BUILD_WEB_ENV_SOURCE" \
    || fail 'Build identity can read the canonical Web environment instead of its bounded copy.'
}

stage_build_web_env() {
  local build_group_id

  validate_trusted_env_file "$BUILD_WEB_ENV_SOURCE"
  [[ -n "$BUILD_WEB_ENV" && ! -e "$BUILD_WEB_ENV" && ! -L "$BUILD_WEB_ENV" ]] \
    || fail 'Build Web env target is missing or already exists.'
  build_group_id="$(id -g "$BUILD_USER")"
  [[ "$build_group_id" =~ ^[0-9]+$ ]] \
    || fail 'Cannot resolve the isolated build group.'
  "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" rewrite \
    --profile web \
    --source "$BUILD_WEB_ENV_SOURCE" \
    --target "$BUILD_WEB_ENV" \
    --uid 0 \
    --gid "$build_group_id" \
    --mode 0640 \
    --require-secure-parent
  validate_build_web_env_file "$BUILD_WEB_ENV"
  runuser -u "$API_RUNTIME_USER" -- test ! -r "$BUILD_WEB_ENV" \
    || fail 'API runtime can read the isolated Web build environment.'
  runuser -u "$WEB_RUNTIME_USER" -- test ! -r "$BUILD_WEB_ENV" \
    || fail 'Web runtime can read the isolated build identity environment.'
}

resolve_object_storage_path_from_api_env() {
  local env_file="$1"
  local workdir="$2"
  local storage_root

  validate_trusted_env_file "$env_file"
  storage_root="$("$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" get --profile api "$env_file" OBJECT_STORAGE_LOCAL_ROOT)"
  node -e 'const { resolve } = require("node:path"); process.stdout.write(resolve(process.argv[1], process.argv[2]));' \
    "$workdir" "$storage_root"
}

verify_object_storage_resolution() {
  local resolved_path

  resolved_path="$(resolve_object_storage_path_from_api_env "$BUILD_API_ENV" "$BUILD_ROOT/apps/api")"
  log "Resolved object-storage path from API env: $resolved_path"

  if [[ "$resolved_path" != "$OBJECT_STORAGE_DIR" ]]; then
    fail "Resolved object-storage path ($resolved_path) does not match expected migration path ($OBJECT_STORAGE_DIR). Review $PRIMARY_API_ENV_TARGET before continuing."
  fi
}

build_application() {
  require_runtime_env_files_for_build
  stage_build_web_env
  prepare_build_runtime
  clean_build_outputs
  verify_object_storage_resolution

  log "Installing dependencies"
  run_as_builder_in_dir "$BUILD_ROOT" pnpm install --frozen-lockfile --package-import-method=copy

  log "Building shared package"
  run_as_builder_in_dir "$BUILD_ROOT" pnpm --filter @feishu-timeline/shared build

  log "Generating Prisma client with a non-secret build-only URL"
  run_as_builder_in_dir "$BUILD_ROOT/apps/api" env \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    pnpm exec prisma generate --schema prisma/schema.prisma

  log "Building API without exposing the production API env"
  run_as_builder_in_dir "$BUILD_ROOT/apps/api" pnpm exec tsc -p tsconfig.build.json

  log "Validating Prisma schema with a non-secret build-only URL"
  run_as_builder_in_dir "$BUILD_ROOT/apps/api" env \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    pnpm exec prisma validate --schema prisma/schema.prisma

  log "Building Web with Web production env"
  run_as_builder_in_dir_with_trusted_env \
    "$BUILD_ROOT/apps/web" "$BUILD_WEB_ENV" web \
    pnpm exec next build

  quiesce_and_freeze_build_tree
}

stage_immutable_release() {
  [ "$BUILD_TREE_FROZEN" = yes ] \
    || fail 'Build tree must be quiesced and root-frozen before release staging.'
  [ ! -e "$STAGED_RELEASE_DIR" ] && [ ! -L "$STAGED_RELEASE_DIR" ] \
    || fail "Immutable release already exists; refusing overwrite: $STAGED_RELEASE_DIR"
  [ ! -e "$STAGED_CURRENT_LINK" ] && [ ! -L "$STAGED_CURRENT_LINK" ] \
    || fail "Temporary current pointer already exists: $STAGED_CURRENT_LINK"
  [[ ! -e "$FAILED_CURRENT_LINK" && ! -L "$FAILED_CURRENT_LINK" \
      && ! -e "$ROLLBACK_CURRENT_LINK" && ! -L "$ROLLBACK_CURRENT_LINK" \
      && ! -e "$FAILED_RELEASE_DIR" && ! -L "$FAILED_RELEASE_DIR" \
      && ! -e "$FAILED_OBJECT_STORAGE_DIR" && ! -L "$FAILED_OBJECT_STORAGE_DIR" ]] \
    || fail 'A restore rollback or failed-artifact path already exists.'
  if [[ -e "$OBJECT_STORAGE_DIR" || -L "$OBJECT_STORAGE_DIR" ]]; then
    [[ -d "$OBJECT_STORAGE_DIR" && ! -L "$OBJECT_STORAGE_DIR" ]] \
      || fail "Object storage target is not a non-symlink directory: $OBJECT_STORAGE_DIR"
  fi
  RELEASE_STAGED=committing
  install -d -o root -g root -m 0755 "$STAGED_RELEASE_DIR"
  RELEASE_STAGED=yes
  cp -a "$BUILD_ROOT/." "$STAGED_RELEASE_DIR/"
  chown -R root:root "$STAGED_RELEASE_DIR"
  chmod -R a+rX,go-w "$STAGED_RELEASE_DIR"
  cmp "$PRIVILEGED_API_SERVICE_SOURCE" "$STAGED_RELEASE_DIR/$API_SERVICE_SOURCE_REL" >/dev/null \
    || fail 'Build lifecycle changed the approved API systemd template.'
  cmp "$PRIVILEGED_WEB_SERVICE_SOURCE" "$STAGED_RELEASE_DIR/$WEB_SERVICE_SOURCE_REL" >/dev/null \
    || fail 'Build lifecycle changed the approved Web systemd template.'
  cmp "$PRIVILEGED_TIMELINE_NGINX_SOURCE" "$STAGED_RELEASE_DIR/$TIMELINE_NGINX_SOURCE_REL" >/dev/null \
    || fail 'Build lifecycle changed the approved timeline Nginx template.'
  cmp "$PRIVILEGED_ROOT_NGINX_SOURCE" "$STAGED_RELEASE_DIR/$ROOT_PLACEHOLDER_SOURCE_REL" >/dev/null \
    || fail 'Build lifecycle changed the approved root Nginx template.'
  runuser -u "$API_RUNTIME_USER" -- test -r "$STAGED_RELEASE_DIR/apps/api/dist/main.js" \
    || fail 'API runtime cannot read the immutable API release.'
  runuser -u "$WEB_RUNTIME_USER" -- test -r "$STAGED_RELEASE_DIR/apps/web/.next/BUILD_ID" \
    || fail 'Web runtime cannot read the immutable Web release.'
  runuser -u "$API_RUNTIME_USER" -- test ! -w "$STAGED_RELEASE_DIR" \
    || fail 'API runtime can write the immutable release.'
  runuser -u "$WEB_RUNTIME_USER" -- test ! -w "$STAGED_RELEASE_DIR" \
    || fail 'Web runtime can write the immutable release.'
  STAGED_CURRENT_CREATED=committing
  ln -s "$STAGED_RELEASE_DIR" "$STAGED_CURRENT_LINK"
  STAGED_CURRENT_CREATED=yes
  fsync_directory "$RELEASES_DIR"
  fsync_directory "$APP_ROOT"
}

snapshot_privileged_tool() {
  local presence_variable="$3"
  local previous="$2"
  local target="$1"
  local target_mode

  [[ ! -e "$previous" && ! -L "$previous" ]] \
    || fail "Privileged tool rollback path already exists: $previous"
  if [[ -e "$target" || -L "$target" ]]; then
    [[ -f "$target" && ! -L "$target" && "$(stat -c '%u:%g' "$target")" = '0:0' ]] \
      || fail "Existing privileged tool is not a root-owned regular file: $target"
    target_mode="$(stat -c '%a' "$target")"
    [[ "$target_mode" =~ ^[0-7]{3,4}$ ]] \
      && (( (8#$target_mode & 0022) == 0 )) \
      || fail "Existing privileged tool is group/other writable: $target"
    ln -- "$target" "$previous"
    printf -v "$presence_variable" '%s' yes
  fi
}

activate_data_tools() {
  [[ "$RUNTIME_QUIESCED" = yes ]] \
    || fail 'Privileged data-tool activation requires quiesced runtime services.'
  [[ "$DATA_TOOLS_STAGED" = yes \
      && -f "$DOTENV_DATA_TOOL_CANDIDATE" && ! -L "$DOTENV_DATA_TOOL_CANDIDATE" \
      && -f "$ARCHIVE_DATA_TOOL_CANDIDATE" && ! -L "$ARCHIVE_DATA_TOOL_CANDIDATE" \
      && "$(stat -c '%u:%g:%a' "$DOTENV_DATA_TOOL_CANDIDATE")" = '0:0:755' \
      && "$(stat -c '%u:%g:%a' "$ARCHIVE_DATA_TOOL_CANDIDATE")" = '0:0:755' ]] \
    || fail 'Privileged data-tool candidates are missing or unsafe.'

  snapshot_privileged_tool \
    "$DOTENV_DATA_TOOL_TARGET" "$PREVIOUS_DOTENV_TOOL" DOTENV_TOOL_WAS_PRESENT
  snapshot_privileged_tool \
    "$ARCHIVE_DATA_TOOL_TARGET" "$PREVIOUS_ARCHIVE_TOOL" ARCHIVE_TOOL_WAS_PRESENT
  DOTENV_TOOL_ACTIVATED=committing
  mv -Tf -- "$DOTENV_DATA_TOOL_CANDIDATE" "$DOTENV_DATA_TOOL_TARGET"
  DOTENV_DATA_TOOL="$DOTENV_DATA_TOOL_TARGET"
  DOTENV_TOOL_ACTIVATED=yes
  ARCHIVE_TOOL_ACTIVATED=committing
  mv -Tf -- "$ARCHIVE_DATA_TOOL_CANDIDATE" "$ARCHIVE_DATA_TOOL_TARGET"
  ARCHIVE_DATA_TOOL="$ARCHIVE_DATA_TOOL_TARGET"
  ARCHIVE_TOOL_ACTIVATED=yes
  DATA_TOOLS_STAGED=no
  fsync_directory /usr/local/libexec/feishu-timeline
}

activate_object_storage_layout_if_not_restored() {
  local api_gid
  local api_uid
  local storage_mode

  [[ "$RESTORE_OBJECT_STORAGE" != yes ]] || return 0
  api_uid="$(id -u "$API_RUNTIME_USER")"
  api_gid="$(id -g "$API_RUNTIME_USER")"
  if [[ -e "$OBJECT_STORAGE_DIR" || -L "$OBJECT_STORAGE_DIR" ]]; then
    [[ -d "$OBJECT_STORAGE_DIR" && ! -L "$OBJECT_STORAGE_DIR" ]] \
      || fail "Object storage target is not a non-symlink directory: $OBJECT_STORAGE_DIR"
    [[ "$(stat -c '%u:%g' "$OBJECT_STORAGE_DIR")" = "$api_uid:$api_gid" ]] \
      || fail 'Existing object-storage root must be owned by the API runtime identity.'
    storage_mode="$(stat -c '%a' "$OBJECT_STORAGE_DIR")"
    case "$storage_mode" in
      700|750) ;;
      *) fail 'Existing object-storage root must use mode 700 or 750.' ;;
    esac
    return 0
  fi

  OBJECT_STORAGE_LAYOUT_CREATED=committing
  install -d -o "$API_RUNTIME_USER" -g "$API_RUNTIME_GROUP" -m 0750 "$OBJECT_STORAGE_DIR"
  OBJECT_STORAGE_LAYOUT_CREATED=yes
}

activate_immutable_release() {
  if [[ -L "$CURRENT_LINK" ]]; then
    PREVIOUS_CURRENT_TARGET="$(readlink "$CURRENT_LINK")"
    CURRENT_WAS_PRESENT=yes
  elif [[ -e "$CURRENT_LINK" ]]; then
    fail "Current release pointer is not a symlink: $CURRENT_LINK"
  fi
  CURRENT_ACTIVATED=committing
  mv -Tf "$STAGED_CURRENT_LINK" "$CURRENT_LINK"
  CURRENT_ACTIVATED=yes
  STAGED_CURRENT_CREATED=no
  fsync_directory "$APP_ROOT"
}

stage_database_restore_if_requested() {

  if [[ "$RESTORE_DATABASE" != "yes" ]]; then
    warn "RESTORE_DATABASE=no; skipping database restore."
    return 0
  fi


  [[ -f "$DATABASE_RESTORE_FILE" && ! -L "$DATABASE_RESTORE_FILE" ]] \
    || fail "Database restore source must be a regular non-symlink file: $DATABASE_RESTORE_FILE"
  [[ ! -e "$DATABASE_RESTORE_SNAPSHOT" && ! -L "$DATABASE_RESTORE_SNAPSHOT" ]] \
    || fail "Database restore snapshot already exists: $DATABASE_RESTORE_SNAPSHOT"

  DATABASE_SNAPSHOT_CREATED=committing
  "$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" snapshot-file \
    --allowed-uid 0 --allowed-uid "$(id -u "$APP_USER")" \
    --sha256 "$DATABASE_RESTORE_SHA256" --magic PGDMP \
    --uid 0 --gid 0 --mode 0600 \
    "$DATABASE_RESTORE_FILE" "$DATABASE_RESTORE_SNAPSHOT" >/dev/null
  DATABASE_SNAPSHOT_CREATED=yes

  /usr/bin/pg_restore --list "$DATABASE_RESTORE_SNAPSHOT" >/dev/null \
    || { rm -f -- "$DATABASE_RESTORE_SNAPSHOT"; DATABASE_SNAPSHOT_CREATED=no; fail 'Database snapshot is not a valid custom pg_dump archive.'; }
}

restore_database_if_requested() {
  local restore_status=0

  [[ "$RESTORE_DATABASE" = yes ]] || return 0
  require_quiesced_data_restore
  validate_trusted_env_file "$PRIMARY_API_ENV_TARGET"

  log "Restoring PostgreSQL from an approved private custom-archive snapshot"
  DATABASE_RESTORE_APPLIED=attempted
  "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" postgres-exec \
    --profile api "$PRIMARY_API_ENV_TARGET" -- \
    /usr/bin/pg_restore --single-transaction --exit-on-error --clean --if-exists --no-owner \
      "$DATABASE_RESTORE_SNAPSHOT" || restore_status=$?
  rm -f -- "$DATABASE_RESTORE_SNAPSHOT"
  DATABASE_SNAPSHOT_CREATED=no
  [[ "$restore_status" -eq 0 ]] \
    || fail "pg_restore failed with status $restore_status."
  DATABASE_RESTORE_APPLIED=yes
}

validate_root_owned_config_target() {
  local target="$1"
  local target_mode

  if [[ -e "$target" || -L "$target" ]]; then
    [[ -f "$target" && ! -L "$target" ]] \
      || fail "Managed system configuration is not a regular non-symlink file: $target"
    [[ "$(stat -c '%u' "$target")" = 0 ]] \
      || fail "Managed system configuration is not root-owned: $target"
    target_mode="$(stat -c '%a' "$target")"
    [[ "$target_mode" =~ ^[0-7]{3,4}$ ]] \
      && (( (8#$target_mode & 0022) == 0 )) \
      || fail "Managed system configuration is group/other writable: $target"
  fi
}

validate_enabled_site_link() {
  local link="$1"
  local target="$2"

  [[ ! -e "$link" && ! -L "$link" ]] && return 0
  "$PYTHON_BIN" -I - "$link" "$target" <<'PY'
from pathlib import Path
import os
import stat
import sys

link = Path(sys.argv[1])
target = Path(sys.argv[2])
metadata = link.lstat()
if not stat.S_ISLNK(metadata.st_mode) or metadata.st_uid != 0:
    raise SystemExit(f'enabled Nginx site is not a root-owned symlink: {link}')
if Path(os.path.realpath(link)) != target:
    raise SystemExit(f'enabled Nginx site points outside the managed target: {link}')
PY
}

stage_system_config_if_requested() {
  local timeline_src="$STAGED_RELEASE_DIR/$TIMELINE_NGINX_SOURCE_REL"
  local root_src="$STAGED_RELEASE_DIR/$ROOT_PLACEHOLDER_SOURCE_REL"
  local api_service_src="$STAGED_RELEASE_DIR/$API_SERVICE_SOURCE_REL"
  local web_service_src="$STAGED_RELEASE_DIR/$WEB_SERVICE_SOURCE_REL"
  local api_service_rendered
  local transaction_path
  local web_service_rendered

  [[ "$APPLY_SYSTEM_CONFIG" = yes ]] || return 0
  for source in "$timeline_src" "$root_src" "$api_service_src" "$web_service_src"; do
    [[ -f "$source" && ! -L "$source" ]] \
      || fail "Exact-commit system configuration source is missing or unsafe: $source"
  done
  require_root_controlled_directory /etc
  require_root_controlled_directory /etc/systemd
  require_root_controlled_directory /etc/systemd/system
  require_root_controlled_directory /etc/nginx
  require_root_controlled_directory /etc/nginx/sites-available
  require_root_controlled_directory /etc/nginx/sites-enabled
  for target in \
    "$API_SERVICE_TARGET" "$WEB_SERVICE_TARGET" \
    "$TIMELINE_NGINX_TARGET" "$ROOT_NGINX_TARGET"; do
    validate_root_owned_config_target "$target"
  done
  for transaction_path in \
    "$API_SERVICE_CANDIDATE" "$WEB_SERVICE_CANDIDATE" \
    "$TIMELINE_NGINX_CANDIDATE" "$ROOT_NGINX_CANDIDATE" \
    "$PREVIOUS_API_SERVICE" "$PREVIOUS_WEB_SERVICE" \
    "$PREVIOUS_TIMELINE_NGINX" "$PREVIOUS_ROOT_NGINX" \
    "$TIMELINE_SITE_LINK_TEMP" "$ROOT_SITE_LINK_TEMP"; do
    [[ ! -e "$transaction_path" && ! -L "$transaction_path" ]] \
      || fail "System configuration transaction path already exists: $transaction_path"
  done
  [[ "$ENABLE_TIMELINE_SITE" != yes ]] \
    || validate_enabled_site_link "$TIMELINE_SITE_LINK" "$TIMELINE_NGINX_TARGET"
  [[ "$ENABLE_ROOT_PLACEHOLDER_SITE" != yes ]] \
    || validate_enabled_site_link "$ROOT_SITE_LINK" "$ROOT_NGINX_TARGET"

  api_service_rendered="$(mktemp /tmp/feishu-timeline-api-service.XXXXXX)"
  web_service_rendered="$(mktemp /tmp/feishu-timeline-web-service.XXXXXX)"
  chmod 0600 "$api_service_rendered" "$web_service_rendered"
  sed \
    -e "s/__API_RUNTIME_USER__/$API_RUNTIME_USER/g" \
    -e "s/__API_RUNTIME_GROUP__/$API_RUNTIME_GROUP/g" \
    -e "s/__WEB_RUNTIME_USER__/$WEB_RUNTIME_USER/g" \
    -e "s/__WEB_RUNTIME_GROUP__/$WEB_RUNTIME_GROUP/g" \
    "$api_service_src" >"$api_service_rendered"
  sed \
    -e "s/__API_RUNTIME_USER__/$API_RUNTIME_USER/g" \
    -e "s/__API_RUNTIME_GROUP__/$API_RUNTIME_GROUP/g" \
    -e "s/__WEB_RUNTIME_USER__/$WEB_RUNTIME_USER/g" \
    -e "s/__WEB_RUNTIME_GROUP__/$WEB_RUNTIME_GROUP/g" \
    "$web_service_src" >"$web_service_rendered"

  SYSTEM_CONFIG_STAGED=committing
  install -o root -g root -m 0644 "$api_service_rendered" "$API_SERVICE_CANDIDATE"
  install -o root -g root -m 0644 "$web_service_rendered" "$WEB_SERVICE_CANDIDATE"
  install -o root -g root -m 0644 "$timeline_src" "$TIMELINE_NGINX_CANDIDATE"
  install -o root -g root -m 0644 "$root_src" "$ROOT_NGINX_CANDIDATE"
  rm -f -- "$api_service_rendered" "$web_service_rendered"
  fsync_directory /etc/systemd/system
  fsync_directory /etc/nginx/sites-available
  SYSTEM_CONFIG_STAGED=yes
}

snapshot_system_config_file() {
  local target="$1"
  local previous="$2"
  local presence_variable="$3"

  [[ ! -e "$previous" && ! -L "$previous" ]] \
    || fail "System configuration rollback path already exists: $previous"
  if [[ -e "$target" || -L "$target" ]]; then
    validate_root_owned_config_target "$target"
    ln -- "$target" "$previous"
    printf -v "$presence_variable" '%s' yes
  fi
}

activate_system_config_if_staged() {
  [[ "$APPLY_SYSTEM_CONFIG" = yes ]] || return 0
  [[ "$SYSTEM_CONFIG_STAGED" = yes ]] \
    || fail 'System configuration was not fully staged before activation.'
  require_quiesced_data_restore

  snapshot_system_config_file \
    "$API_SERVICE_TARGET" "$PREVIOUS_API_SERVICE" API_SERVICE_WAS_PRESENT
  snapshot_system_config_file \
    "$WEB_SERVICE_TARGET" "$PREVIOUS_WEB_SERVICE" WEB_SERVICE_WAS_PRESENT
  snapshot_system_config_file \
    "$TIMELINE_NGINX_TARGET" "$PREVIOUS_TIMELINE_NGINX" TIMELINE_NGINX_WAS_PRESENT
  snapshot_system_config_file \
    "$ROOT_NGINX_TARGET" "$PREVIOUS_ROOT_NGINX" ROOT_NGINX_WAS_PRESENT
  fsync_directory /etc/systemd/system
  fsync_directory /etc/nginx/sites-available

  SYSTEM_CONFIG_ACTIVATED=committing
  API_SERVICE_ACTIVATED=committing
  mv -Tf -- "$API_SERVICE_CANDIDATE" "$API_SERVICE_TARGET"
  API_SERVICE_ACTIVATED=yes
  WEB_SERVICE_ACTIVATED=committing
  mv -Tf -- "$WEB_SERVICE_CANDIDATE" "$WEB_SERVICE_TARGET"
  WEB_SERVICE_ACTIVATED=yes
  TIMELINE_NGINX_ACTIVATED=committing
  mv -Tf -- "$TIMELINE_NGINX_CANDIDATE" "$TIMELINE_NGINX_TARGET"
  TIMELINE_NGINX_ACTIVATED=yes
  ROOT_NGINX_ACTIVATED=committing
  mv -Tf -- "$ROOT_NGINX_CANDIDATE" "$ROOT_NGINX_TARGET"
  ROOT_NGINX_ACTIVATED=yes

  if [[ "$ENABLE_TIMELINE_SITE" = yes \
      && ! -e "$TIMELINE_SITE_LINK" && ! -L "$TIMELINE_SITE_LINK" ]]; then
    TIMELINE_SITE_LINK_CREATED=committing
    ln -s "$TIMELINE_NGINX_TARGET" "$TIMELINE_SITE_LINK_TEMP"
    mv -Tf -- "$TIMELINE_SITE_LINK_TEMP" "$TIMELINE_SITE_LINK"
    TIMELINE_SITE_LINK_CREATED=yes
  fi
  if [[ "$ENABLE_ROOT_PLACEHOLDER_SITE" = yes \
      && ! -e "$ROOT_SITE_LINK" && ! -L "$ROOT_SITE_LINK" ]]; then
    ROOT_SITE_LINK_CREATED=committing
    ln -s "$ROOT_NGINX_TARGET" "$ROOT_SITE_LINK_TEMP"
    mv -Tf -- "$ROOT_SITE_LINK_TEMP" "$ROOT_SITE_LINK"
    ROOT_SITE_LINK_CREATED=yes
  fi
  fsync_directory /etc/systemd/system
  fsync_directory /etc/nginx/sites-available
  fsync_directory /etc/nginx/sites-enabled
  SYSTEM_CONFIG_ACTIVATED=yes
  SYSTEM_CONFIG_STAGED=no
}

validate_activated_system_config() {
  [[ "$APPLY_SYSTEM_CONFIG" = yes ]] || return 0
  [[ "$SYSTEM_CONFIG_ACTIVATED" = yes ]] \
    || fail 'System configuration is not active for validation.'
  systemctl daemon-reload
  nginx -t
}

apply_system_runtime_actions() {
  SYSTEM_RUNTIME_ACTIONS_STARTED=committing
  if [[ "$START_SERVICES" = yes ]]; then
    systemctl restart feishu-timeline-api.service feishu-timeline-web.service
  else
    warn 'START_SERVICES=no; services remain stopped.'
  fi
  if [[ "$APPLY_SYSTEM_CONFIG" = yes ]]; then
    if [[ "$RELOAD_NGINX" = yes ]]; then
      systemctl reload nginx.service
    else
      warn 'RELOAD_NGINX=no; Nginx was validated but not reloaded.'
    fi
  fi
  SYSTEM_RUNTIME_ACTIONS_STARTED=yes
}

verify_started_runtime_metadata() {
  local expected_service="$1"
  local url="$2"

  curl -fsS --max-time 5 "$url" | "$PYTHON_BIN" -I -c '
import json
import sys

payload = sys.stdin.buffer.read(65537)
if len(payload) > 65536:
    raise SystemExit("runtime metadata response exceeded 64 KiB")
try:
    data = json.loads(payload)
except (UnicodeDecodeError, json.JSONDecodeError) as error:
    raise SystemExit("runtime metadata response was not valid JSON") from error
expected_commit, expected_build_time, expected_release, expected_service = sys.argv[1:]
for key, expected in {
    "runtimeCommit": expected_commit,
    "buildTime": expected_build_time,
    "release": expected_release,
    "service": expected_service,
}.items():
    if data.get(key) != expected:
        raise SystemExit(f"runtime metadata mismatch: {key}")
' "$RESTORED_RUNTIME_COMMIT" "$RESTORE_BUILD_TIME" "$RESTORE_RELEASE" "$expected_service"
}

verify_started_runtime() {
  local api_ready=no
  local web_ready=no

  [[ "$START_SERVICES" = yes ]] || return 0
  for attempt in $(seq 1 30); do
    api_ready=no
    web_ready=no
    if systemctl is-active --quiet feishu-timeline-api.service \
      && verify_started_runtime_metadata feishu-timeline-api http://127.0.0.1:3001/api/health; then
      api_ready=yes
    fi
    if systemctl is-active --quiet feishu-timeline-web.service \
      && verify_started_runtime_metadata feishu-timeline-web http://127.0.0.1:3000/build-info; then
      web_ready=yes
    fi
    [[ "$api_ready" = yes && "$web_ready" = yes ]] && break
    sleep 2
  done
  [[ "$api_ready" = yes ]] \
    || fail 'Restored API did not remain active with the expected runtime metadata.'
  [[ "$web_ready" = yes ]] \
    || fail 'Restored Web did not remain active with the expected runtime metadata.'
  if [[ "$APPLY_SYSTEM_CONFIG" = yes && "$RELOAD_NGINX" = yes ]]; then
    systemctl is-active --quiet nginx.service \
      || fail 'Nginx did not remain active after the restored configuration reload.'
  fi
}

commit_service_enablement() {
  local enable_complete=yes

  if [[ "$APPLY_SYSTEM_CONFIG" = yes && "$ENABLE_SERVICES" = yes ]]; then
    SERVICE_ENABLE_ATTEMPTED=yes
    if ! systemctl enable feishu-timeline-api.service feishu-timeline-web.service; then
      enable_complete=no
    fi
    if ! fsync_directory /etc/systemd/system; then
      enable_complete=no
    fi
    if [[ -e /etc/systemd/system/multi-user.target.wants \
        || -L /etc/systemd/system/multi-user.target.wants ]]; then
      if [[ ! -d /etc/systemd/system/multi-user.target.wants \
          || -L /etc/systemd/system/multi-user.target.wants ]] \
        || ! fsync_directory /etc/systemd/system/multi-user.target.wants; then
        enable_complete=no
      fi
    fi
    if [[ "$enable_complete" = yes ]]; then
      COMMITTED_BOOT_STATE=enabled
    else
      warn 'Committed restore boot enablement was incomplete; forcing both runtime units disabled.'
      local disable_complete=yes
      if ! systemctl disable feishu-timeline-api.service feishu-timeline-web.service; then
        disable_complete=no
      fi
      if ! fsync_directory /etc/systemd/system; then
        disable_complete=no
      fi
      if [[ -e /etc/systemd/system/multi-user.target.wants \
          || -L /etc/systemd/system/multi-user.target.wants ]]; then
        if [[ ! -d /etc/systemd/system/multi-user.target.wants \
            || -L /etc/systemd/system/multi-user.target.wants ]] \
          || ! fsync_directory /etc/systemd/system/multi-user.target.wants; then
          disable_complete=no
        fi
      fi
      if [[ "$disable_complete" = yes ]]; then
        COMMITTED_BOOT_STATE=disabled_pending_review
      else
        COMMITTED_BOOT_STATE=unknown_manual_review
      fi
    fi
  else
    COMMITTED_BOOT_STATE=intentionally_disabled
    warn 'Runtime units remain disabled at boot by the explicit restore options.'
  fi
  log "committed_boot_state=$COMMITTED_BOOT_STATE"
}

copy_system_config_for_review_if_requested() {
  local timeline_src="$STAGED_RELEASE_DIR/$TIMELINE_NGINX_SOURCE_REL"
  local root_src="$STAGED_RELEASE_DIR/$ROOT_PLACEHOLDER_SOURCE_REL"
  local api_service_src="$STAGED_RELEASE_DIR/$API_SERVICE_SOURCE_REL"
  local web_service_src="$STAGED_RELEASE_DIR/$WEB_SERVICE_SOURCE_REL"
  local api_service_rendered
  local review_mode
  local web_service_rendered

  [[ "$APPLY_SYSTEM_CONFIG" != yes ]] || return 0
  for source in "$timeline_src" "$root_src" "$api_service_src" "$web_service_src"; do
    [[ -f "$source" && ! -L "$source" ]] \
      || fail "Staged system configuration source is missing or unsafe: $source"
  done
  if [[ -e "$CONFIG_REVIEW_DIR" || -L "$CONFIG_REVIEW_DIR" ]]; then
    [[ -d "$CONFIG_REVIEW_DIR" && ! -L "$CONFIG_REVIEW_DIR" \
        && "$(stat -c '%u' "$CONFIG_REVIEW_DIR")" = 0 ]] \
      || fail 'Configuration review root is not a root-owned non-symlink directory.'
    review_mode="$(stat -c '%a' "$CONFIG_REVIEW_DIR")"
    [[ "$review_mode" =~ ^[0-7]{3,4}$ ]] \
      && (( (8#$review_mode & 0022) == 0 )) \
      || fail 'Configuration review root is group/other writable.'
  fi
  require_root_controlled_directory "$CONFIG_REVIEW_DIR" yes
  require_root_controlled_directory "$CONFIG_REVIEW_DIR/nginx" yes
  require_root_controlled_directory "$CONFIG_REVIEW_DIR/systemd" yes
  install -d -o root -g "$APP_GROUP" -m 0750 \
    "$CONFIG_REVIEW_DIR" "$CONFIG_REVIEW_DIR/nginx" "$CONFIG_REVIEW_DIR/systemd"
  require_root_controlled_directory "$CONFIG_REVIEW_DIR"
  require_root_controlled_directory "$CONFIG_REVIEW_DIR/nginx"
  require_root_controlled_directory "$CONFIG_REVIEW_DIR/systemd"
  api_service_rendered="$(mktemp /tmp/feishu-timeline-api-review.XXXXXX)"
  web_service_rendered="$(mktemp /tmp/feishu-timeline-web-review.XXXXXX)"
  sed \
    -e "s/__API_RUNTIME_USER__/$API_RUNTIME_USER/g" \
    -e "s/__API_RUNTIME_GROUP__/$API_RUNTIME_GROUP/g" \
    -e "s/__WEB_RUNTIME_USER__/$WEB_RUNTIME_USER/g" \
    -e "s/__WEB_RUNTIME_GROUP__/$WEB_RUNTIME_GROUP/g" \
    "$api_service_src" >"$api_service_rendered"
  sed \
    -e "s/__API_RUNTIME_USER__/$API_RUNTIME_USER/g" \
    -e "s/__API_RUNTIME_GROUP__/$API_RUNTIME_GROUP/g" \
    -e "s/__WEB_RUNTIME_USER__/$WEB_RUNTIME_USER/g" \
    -e "s/__WEB_RUNTIME_GROUP__/$WEB_RUNTIME_GROUP/g" \
    "$web_service_src" >"$web_service_rendered"
  install -o root -g "$APP_GROUP" -m 0640 "$timeline_src" "$CONFIG_REVIEW_DIR/nginx/"
  install -o root -g "$APP_GROUP" -m 0640 "$root_src" "$CONFIG_REVIEW_DIR/nginx/"
  install -o root -g "$APP_GROUP" -m 0640 \
    "$api_service_rendered" "$CONFIG_REVIEW_DIR/systemd/feishu-timeline-api.service"
  install -o root -g "$APP_GROUP" -m 0640 \
    "$web_service_rendered" "$CONFIG_REVIEW_DIR/systemd/feishu-timeline-web.service"
  rm -f -- "$api_service_rendered" "$web_service_rendered"
  fsync_directory "$CONFIG_REVIEW_DIR/nginx"
  fsync_directory "$CONFIG_REVIEW_DIR/systemd"
  fsync_directory "$CONFIG_REVIEW_DIR"
}

validate_restore_parameters
maybe_set_default_backup_paths
validate_restore_source_paths
validate_primary_env_restore_request
validate_database_restore_request
validate_object_storage_restore_request

if [ "$RESTORE_VALIDATE_ONLY" = 'yes' ]; then
  printf 'VALIDATION_ONLY=PASS\n'
  exit 0
fi

require_root
ensure_app_user_exists
ensure_app_home_exists
ensure_runtime_identities
require_command git
require_command tar
require_command pnpm
require_command nginx
require_command node
require_command corepack
require_command cmp
require_command systemctl
require_command pgrep
require_command pkill
require_command runuser
if [[ "$START_SERVICES" = yes ]]; then
  require_command curl
fi
[ -x "$PYTHON_BIN" ] || fail "Missing isolated Python interpreter: $PYTHON_BIN"
require_command sha256sum
if [[ "$RESTORE_DATABASE" = yes ]]; then
  [ -x /usr/bin/pg_restore ] || fail 'Missing fixed PostgreSQL restore client: /usr/bin/pg_restore'
fi

trap 'rollback_restore_transaction "$?"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

prepare_root_controlled_layout
prepare_canonical_env_layout
initialize_repo_stage_dir
sync_repo_into_app_root
quiesce_and_freeze_build_tree
install_dotenv_data_tool
reopen_build_tree_for_builder
restore_primary_env_if_requested
build_application
restore_extra_env_if_requested
stage_database_restore_if_requested
stage_object_storage_if_requested
stage_immutable_release
stage_system_config_if_requested
copy_system_config_for_review_if_requested
quiesce_runtime_services
arm_runtime_transaction_guard
activate_data_tools
commit_primary_env_if_staged
activate_object_storage_layout_if_not_restored
activate_object_storage_if_requested
activate_immutable_release
activate_system_config_if_staged
validate_activated_system_config
restore_database_if_requested
apply_system_runtime_actions
verify_started_runtime
commit_runtime_transaction_guard
commit_service_enablement
finalize_restore_transaction

log "Restore flow completed."
log "Recommended next steps:"
log "  1. Review the root-controlled $PRIMARY_API_ENV_TARGET and $PRIMARY_WEB_ENV_TARGET"
log "  2. Review /etc/systemd/system/feishu-timeline-*.service"
log "  3. Review /etc/nginx/sites-available/*.conf"
log "  4. Run scripts/migration/post_restore_verify.sh"
log "TLS is intentionally not automated here. Example follow-up commands after HTTP validation:"
log "  certbot --nginx -d timeline.all-too-well.com"
log "  # Later, if the root placeholder also needs HTTPS:"
log "  certbot --nginx -d all-too-well.com"
