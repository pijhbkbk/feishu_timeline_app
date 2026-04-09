#!/usr/bin/env bash
set -euo pipefail

# Conservative bootstrap helper for the new GCP Ubuntu VM.
# It prepares packages, users, and directories only. It does not deploy the app or cut traffic.

IFS=$'\n\t'

APP_NAME="${APP_NAME:-feishu_timeline_app}"
APP_USER="${APP_USER:-feishu}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
APP_HOME="${APP_HOME:-/home/${APP_USER}}"

APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"
OBJECT_STORAGE_DIR="${OBJECT_STORAGE_DIR:-$APP_ROOT/var/object-storage}"
BACKUP_STAGING_DIR="${BACKUP_STAGING_DIR:-$APP_ROOT/var/backups}"
CONFIG_REVIEW_DIR="${CONFIG_REVIEW_DIR:-$APP_ROOT/var/config-review}"
PLACEHOLDER_ROOT="${PLACEHOLDER_ROOT:-/var/www/all-too-well-placeholder}"

NODE_MAJOR="${NODE_MAJOR:-24}"
PNPM_VERSION="${PNPM_VERSION:-9.15.4}"
CREATE_APP_USER="${CREATE_APP_USER:-yes}"
INSTALL_NODE_IF_MISSING="${INSTALL_NODE_IF_MISSING:-yes}"

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

apt_install() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
}

ensure_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    fail "Please run bootstrap_gcp.sh as root."
  fi
}

ensure_node_runtime() {
  local node_ok="no"

  if command -v node >/dev/null 2>&1; then
    local current_major
    current_major="$(node -p 'process.versions.node.split(".")[0]')"
    if [[ "$current_major" -ge "$NODE_MAJOR" ]]; then
      node_ok="yes"
    fi
  fi

  if [[ "$node_ok" != "yes" ]]; then
    if [[ "$INSTALL_NODE_IF_MISSING" != "yes" ]]; then
      fail "Node.js >= $NODE_MAJOR is required but INSTALL_NODE_IF_MISSING is disabled."
    fi

    log "Installing Node.js ${NODE_MAJOR}.x from NodeSource"
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt_install nodejs
  else
    log "Node.js already satisfies >= $NODE_MAJOR"
  fi

  log "Enabling corepack and pinning pnpm@$PNPM_VERSION"
  corepack enable
  corepack prepare "pnpm@${PNPM_VERSION}" --activate
}

create_app_user_if_needed() {
  if [[ "$CREATE_APP_USER" != "yes" ]]; then
    warn "CREATE_APP_USER=no; assuming $APP_USER already exists"
    return 0
  fi

  if id "$APP_USER" >/dev/null 2>&1; then
    log "User already exists: $APP_USER"
    return 0
  fi

  log "Creating user $APP_USER with home $APP_HOME"
  useradd --create-home --home-dir "$APP_HOME" --shell /bin/bash "$APP_USER"
}

create_directories() {
  log "Creating deployment directories under $APP_ROOT"
  install -d -m 0755 "$APP_ROOT"
  install -d -m 0755 "$APP_ROOT/apps"
  install -d -m 0755 "$APP_ROOT/apps/api"
  install -d -m 0755 "$APP_ROOT/apps/web"
  install -d -m 0755 "$APP_ROOT/var"
  install -d -m 0750 -o "$APP_USER" -g "$APP_GROUP" "$OBJECT_STORAGE_DIR"
  install -d -m 0750 -o "$APP_USER" -g "$APP_GROUP" "$BACKUP_STAGING_DIR"
  install -d -m 0750 -o "$APP_USER" -g "$APP_GROUP" "$CONFIG_REVIEW_DIR"
  install -d -m 0755 "$PLACEHOLDER_ROOT"
}

create_placeholder_index() {
  if [[ -f "$PLACEHOLDER_ROOT/index.html" ]]; then
    log "Root placeholder index already exists: $PLACEHOLDER_ROOT/index.html"
    return 0
  fi

  log "Creating root placeholder page for all-too-well.com"
  cat >"$PLACEHOLDER_ROOT/index.html" <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>all-too-well.com</title>
  </head>
  <body>
    <main>
      <h1>all-too-well.com</h1>
      <p>Root portal placeholder. timeline.all-too-well.com is deployed as a separate site.</p>
    </main>
  </body>
</html>
EOF
}

ensure_root

log "Updating apt metadata"
apt-get update

log "Installing base packages"
apt_install ca-certificates curl git nginx build-essential postgresql-client rsync

ensure_node_runtime
create_app_user_if_needed
create_directories
create_placeholder_index

log "Bootstrap summary"
printf 'APP_NAME=%s\n' "$APP_NAME"
printf 'APP_USER=%s\n' "$APP_USER"
printf 'APP_ROOT=%s\n' "$APP_ROOT"
printf 'OBJECT_STORAGE_DIR=%s\n' "$OBJECT_STORAGE_DIR"
printf 'BACKUP_STAGING_DIR=%s\n' "$BACKUP_STAGING_DIR"
printf 'CONFIG_REVIEW_DIR=%s\n' "$CONFIG_REVIEW_DIR"
printf 'PLACEHOLDER_ROOT=%s\n' "$PLACEHOLDER_ROOT"
printf 'node=%s\n' "$(node -v)"
printf 'pnpm=%s\n' "$(pnpm -v)"
printf 'nginx=%s\n' "$(nginx -v 2>&1)"

log "Bootstrap completed. No systemd unit, nginx vhost, certificate, or DNS change has been applied."
