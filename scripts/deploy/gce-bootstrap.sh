#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
NODE_MAJOR="${NODE_MAJOR:-24}"
NODE_PACKAGE_VERSION="${NODE_PACKAGE_VERSION:-24.19.0-1nodesource1}"
PNPM_VERSION="${PNPM_VERSION:-9.15.4}"
APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"
NODESOURCE_KEY_URL="https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key"
NODESOURCE_KEY_SHA256="b42e0321dabdc24e892115da705cf061167eac12a317f23d329862d0aa0a271d" # gitleaks:allow -- public integrity metadata
NODESOURCE_KEY_FINGERPRINT="6F71F525282841EEDAF851B42F59B5F99B1BE0B4" # gitleaks:allow -- public signing-key identity

# shellcheck source=/dev/null
. "$ROOT_DIR/scripts/deploy/gce-common.sh"
validate_gce_connection_parameters

if [[ ! "$NODE_MAJOR" =~ ^[0-9]{1,2}$ ]] \
  || [ "$NODE_MAJOR" -lt 1 ] \
  || [[ ! "$NODE_PACKAGE_VERSION" =~ ^${NODE_MAJOR}\.[0-9]+\.[0-9]+-[0-9]+nodesource[0-9]+$ ]]; then
  fail 'NODE_PACKAGE_VERSION must be an exact NodeSource version matching NODE_MAJOR.'
fi
if [[ ! "$PNPM_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  fail 'PNPM_VERSION must be an exact semantic version.'
fi
if [ "${#APP_ROOT}" -gt 255 ] \
  || [[ ! "$APP_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] \
  || [[ "$APP_ROOT" =~ (^|/)\.\.?(/|$) ]]; then
  fail 'APP_ROOT must be a bounded absolute path without whitespace or dot segments.'
fi
if [[ ! "$NODESOURCE_KEY_SHA256" =~ ^[a-f0-9]{64}$ ]] \
  || [[ ! "$NODESOURCE_KEY_FINGERPRINT" =~ ^[A-F0-9]{40}$ ]]; then
  fail 'NodeSource key identity pins are malformed.'
fi

require_gcloud

REMOTE_USER="$(gce_ssh 'id -un')"
if [[ ! "$REMOTE_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
  fail 'The remote account name is not a bounded Linux user name.'
fi
log "Remote user: $REMOTE_USER"

remote_script="$(mktemp)"
cleanup_remote_script() {
  rm -f -- "$remote_script"
}
trap cleanup_remote_script EXIT

cat >"$remote_script" <<'EOF'
set -euo pipefail

node_major="${1:?missing Node.js major}"
node_package_version="${2:?missing Node.js package version}"
pnpm_version="${3:?missing pnpm version}"
app_root="${4:?missing application root}"
remote_user="${5:?missing remote user}"
nodesource_key_url="${6:?missing NodeSource key URL}"
nodesource_key_sha256="${7:?missing NodeSource key digest}"
nodesource_key_fingerprint="${8:?missing NodeSource key fingerprint}"

if [[ ! "$node_major" =~ ^[0-9]{1,2}$ ]] \
  || [[ ! "$node_package_version" =~ ^${node_major}\.[0-9]+\.[0-9]+-[0-9]+nodesource[0-9]+$ ]] \
  || [[ ! "$pnpm_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
  || [[ ! "$remote_user" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
  printf '[ERROR] Invalid bootstrap version or account parameter.\n' >&2
  exit 2
fi
if [ "${#app_root}" -gt 255 ] \
  || [[ ! "$app_root" =~ ^/[A-Za-z0-9._/-]+$ ]] \
  || [[ "$app_root" =~ (^|/)\.\.?(/|$) ]]; then
  printf '[ERROR] Invalid application root.\n' >&2
  exit 2
fi
if [[ ! "$nodesource_key_url" =~ ^https://deb\.nodesource\.com/[A-Za-z0-9._/-]+$ ]] \
  || [[ ! "$nodesource_key_sha256" =~ ^[a-f0-9]{64}$ ]] \
  || [[ ! "$nodesource_key_fingerprint" =~ ^[A-F0-9]{40}$ ]]; then
  printf '[ERROR] Invalid NodeSource trust pin.\n' >&2
  exit 2
fi

export DEBIAN_FRONTEND=noninteractive
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  ca-certificates curl git gnupg nginx build-essential postgresql-client

installed_package_version=""
runtime_version=""
expected_runtime_version="${node_package_version%%-*}"
if command -v node >/dev/null 2>&1 && command -v dpkg-query >/dev/null 2>&1; then
  runtime_version="$(node -p 'process.versions.node')"
  installed_package_version="$(dpkg-query -W -f='${Version}' nodejs 2>/dev/null || true)"
fi

if [ "$runtime_version" != "$expected_runtime_version" ] \
  || [ "$installed_package_version" != "$node_package_version" ]; then
  architecture="$(dpkg --print-architecture)"
  case "$architecture" in
    amd64|arm64)
      ;;
    *)
      printf '[ERROR] Unsupported NodeSource architecture: %s\n' "$architecture" >&2
      exit 2
      ;;
  esac

  key_file="$(mktemp /tmp/nodesource-repo-key.XXXXXX)"
  source_file="$(mktemp /tmp/nodesource-repo-source.XXXXXX)"
  preference_file="$(mktemp /tmp/nodesource-nodejs-pin.XXXXXX)"
  cleanup_bootstrap_files() {
    rm -f -- "$key_file" "$source_file" "$preference_file"
  }
  trap cleanup_bootstrap_files EXIT

  curl --fail --show-error --silent --location \
    --proto '=https' --tlsv1.2 \
    "$nodesource_key_url" \
    --output "$key_file"
  actual_digest="$(sha256sum "$key_file" | awk '{print $1}')"
  if [ "$actual_digest" != "$nodesource_key_sha256" ]; then
    printf '[ERROR] NodeSource key SHA-256 verification failed.\n' >&2
    exit 2
  fi

  actual_fingerprint="$(
    gpg --batch --show-keys --with-colons "$key_file" \
      | awk -F: '$1 == "fpr" { print $10; exit }'
  )"
  if [ "$actual_fingerprint" != "$nodesource_key_fingerprint" ]; then
    printf '[ERROR] NodeSource key fingerprint verification failed.\n' >&2
    exit 2
  fi

  sudo install -d -m 0755 /usr/share/keyrings
  sudo gpg --batch --yes --dearmor \
    --output /usr/share/keyrings/nodesource.gpg \
    "$key_file"
  sudo chmod 0644 /usr/share/keyrings/nodesource.gpg

  printf 'deb [arch=%s signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_%s.x nodistro main\n' \
    "$architecture" "$node_major" >"$source_file"
  {
    printf 'Package: nodejs\n'
    printf 'Pin: version %s\n' "$node_package_version"
    printf 'Pin-Priority: 1001\n'
  } >"$preference_file"
  sudo install -m 0644 "$source_file" /etc/apt/sources.list.d/nodesource.list
  sudo install -m 0644 "$preference_file" /etc/apt/preferences.d/nodejs

  sudo apt-get update
  if ! apt-cache madison nodejs | awk '{print $3}' \
    | grep -Fx "$node_package_version" >/dev/null; then
    printf '[ERROR] Pinned Node.js package is unavailable: %s\n' "$node_package_version" >&2
    exit 2
  fi
  sudo apt-get install -y --no-install-recommends "nodejs=$node_package_version"

  cleanup_bootstrap_files
  trap - EXIT
fi

sudo corepack enable
app_home="$(getent passwd "$remote_user" | awk -F: '{print $6}')"
if [ -z "$app_home" ] || [[ ! "$app_home" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  printf '[ERROR] Unable to resolve a safe home directory for the remote user.\n' >&2
  exit 2
fi
mkdir -p "$app_home/.cache/node/corepack"
env \
  HOME="$app_home" \
  COREPACK_HOME="$app_home/.cache/node/corepack" \
  PATH=/usr/local/bin:/usr/bin:/bin \
  corepack prepare "pnpm@$pnpm_version" --activate

sudo mkdir -p "$app_root"
sudo mkdir -p "$app_root/var/object-storage"
sudo chown -R "$remote_user:$remote_user" "$app_root"

printf 'remote_user=%s\n' "$remote_user"
printf 'node=%s\n' "$(node -v)"
printf 'pnpm=%s\n' "$(
  env \
    HOME="$app_home" \
    COREPACK_HOME="$app_home/.cache/node/corepack" \
    PATH=/usr/local/bin:/usr/bin:/bin \
    pnpm -v
)"
printf 'git=%s\n' "$(git --version)"
printf 'nginx=%s\n' "$(nginx -v 2>&1)"
ls -ld "$app_root" "$app_root/var/object-storage"
EOF

gce_run_remote_script_with_args \
  "$remote_script" \
  "$NODE_MAJOR" \
  "$NODE_PACKAGE_VERSION" \
  "$PNPM_VERSION" \
  "$APP_ROOT" \
  "$REMOTE_USER" \
  "$NODESOURCE_KEY_URL" \
  "$NODESOURCE_KEY_SHA256" \
  "$NODESOURCE_KEY_FINGERPRINT"

cleanup_remote_script
trap - EXIT
