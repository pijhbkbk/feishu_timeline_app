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
NODE_PACKAGE_VERSION="${NODE_PACKAGE_VERSION:-24.19.0-1nodesource1}"
PNPM_VERSION="${PNPM_VERSION:-9.15.4}"
CREATE_APP_USER="${CREATE_APP_USER:-yes}"
INSTALL_NODE_IF_MISSING="${INSTALL_NODE_IF_MISSING:-yes}"
NODESOURCE_KEY_URL="https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key"
NODESOURCE_KEY_SHA256="b42e0321dabdc24e892115da705cf061167eac12a317f23d329862d0aa0a271d" # gitleaks:allow -- public integrity metadata
NODESOURCE_KEY_FINGERPRINT="6F71F525282841EEDAF851B42F59B5F99B1BE0B4" # gitleaks:allow -- public signing-key identity

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
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$@"
}

ensure_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    fail "Please run bootstrap_gcp.sh as root."
  fi
}

validate_bootstrap_parameters() {
  local path

  if [[ ! "$APP_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] \
    || [[ ! "$APP_GROUP" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
    fail 'APP_USER and APP_GROUP must be bounded Linux account names.'
  fi
  if [[ ! "$NODE_MAJOR" =~ ^[0-9]{1,2}$ ]] \
    || [[ ! "$NODE_PACKAGE_VERSION" =~ ^${NODE_MAJOR}\.[0-9]+\.[0-9]+-[0-9]+nodesource[0-9]+$ ]]; then
    fail 'NODE_PACKAGE_VERSION must be an exact NodeSource version matching NODE_MAJOR.'
  fi
  if [[ ! "$PNPM_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    fail 'PNPM_VERSION must be an exact semantic version.'
  fi
  if [[ ! "$NODESOURCE_KEY_SHA256" =~ ^[a-f0-9]{64}$ ]] \
    || [[ ! "$NODESOURCE_KEY_FINGERPRINT" =~ ^[A-F0-9]{40}$ ]]; then
    fail 'NodeSource key identity pins are malformed.'
  fi
  case "$CREATE_APP_USER:$INSTALL_NODE_IF_MISSING" in
    yes:yes|yes:no|no:yes|no:no)
      ;;
    *)
      fail 'CREATE_APP_USER and INSTALL_NODE_IF_MISSING must be yes or no.'
      ;;
  esac

  for path in \
    "$APP_HOME" \
    "$APP_ROOT" \
    "$OBJECT_STORAGE_DIR" \
    "$BACKUP_STAGING_DIR" \
    "$CONFIG_REVIEW_DIR" \
    "$PLACEHOLDER_ROOT"; do
    if [ "${#path}" -gt 255 ] \
      || [[ ! "$path" =~ ^/[A-Za-z0-9._/-]+$ ]] \
      || [[ "$path" =~ (^|/)\.\.?(/|$) ]]; then
      fail 'Bootstrap paths must be bounded absolute paths without whitespace or dot segments.'
    fi
  done
}

configure_nodesource_repository() {
  local architecture
  local key_file
  local actual_digest
  local actual_fingerprint

  architecture="$(dpkg --print-architecture)"
  case "$architecture" in
    amd64|arm64)
      ;;
    *)
      fail "Unsupported NodeSource architecture: $architecture"
      ;;
  esac

  key_file="$(mktemp /tmp/nodesource-repo-key.XXXXXX)"
  cleanup_nodesource_key() {
    rm -f -- "$key_file"
  }
  trap cleanup_nodesource_key EXIT

  curl --fail --show-error --silent --location \
    --proto '=https' --tlsv1.2 \
    "$NODESOURCE_KEY_URL" \
    --output "$key_file"

  actual_digest="$(sha256sum "$key_file" | awk '{print $1}')"
  [ "$actual_digest" = "$NODESOURCE_KEY_SHA256" ] \
    || fail 'Downloaded NodeSource signing key failed the pinned SHA-256 check.'

  actual_fingerprint="$(
    gpg --batch --show-keys --with-colons "$key_file" \
      | awk -F: '$1 == "fpr" { print $10; exit }'
  )"
  [ "$actual_fingerprint" = "$NODESOURCE_KEY_FINGERPRINT" ] \
    || fail 'Downloaded NodeSource signing key failed the pinned fingerprint check.'

  install -d -m 0755 /usr/share/keyrings
  gpg --batch --yes --dearmor \
    --output /usr/share/keyrings/nodesource.gpg \
    "$key_file"
  chmod 0644 /usr/share/keyrings/nodesource.gpg

  printf 'deb [arch=%s signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_%s.x nodistro main\n' \
    "$architecture" "$NODE_MAJOR" \
    >/etc/apt/sources.list.d/nodesource.list
  {
    printf 'Package: nodejs\n'
    printf 'Pin: version %s\n' "$NODE_PACKAGE_VERSION"
    printf 'Pin-Priority: 1001\n'
  } >/etc/apt/preferences.d/nodejs

  cleanup_nodesource_key
  trap - EXIT
}

ensure_node_runtime() {
  local node_ok="no"
  local installed_package_version=""
  local runtime_version=""
  local expected_runtime_version="${NODE_PACKAGE_VERSION%%-*}"

  if command -v node >/dev/null 2>&1 && command -v dpkg-query >/dev/null 2>&1; then
    runtime_version="$(node -p 'process.versions.node')"
    installed_package_version="$(dpkg-query -W -f='${Version}' nodejs 2>/dev/null || true)"
    if [ "$runtime_version" = "$expected_runtime_version" ] \
      && [ "$installed_package_version" = "$NODE_PACKAGE_VERSION" ]; then
      node_ok="yes"
    fi
  fi

  if [[ "$node_ok" != "yes" ]]; then
    if [[ "$INSTALL_NODE_IF_MISSING" != "yes" ]]; then
      fail "Node.js >= $NODE_MAJOR is required but INSTALL_NODE_IF_MISSING is disabled."
    fi

    log "Installing pinned Node.js $NODE_PACKAGE_VERSION from the signed NodeSource repository"
    configure_nodesource_repository
    apt-get update
    if ! apt-cache madison nodejs | awk '{print $3}' | grep -Fx "$NODE_PACKAGE_VERSION" >/dev/null; then
      fail "Pinned Node.js package is unavailable: $NODE_PACKAGE_VERSION"
    fi
    apt_install "nodejs=$NODE_PACKAGE_VERSION"
  else
    log "Pinned Node.js package is already installed: $NODE_PACKAGE_VERSION"
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
validate_bootstrap_parameters

log "Updating apt metadata"
apt-get update

log "Installing base packages"
apt_install ca-certificates curl git gnupg nginx build-essential postgresql-client rsync

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
