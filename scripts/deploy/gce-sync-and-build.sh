#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"
GIT_REF="${GIT_REF:-}"
REPO_URL="${REPO_URL:-$(git remote get-url origin)}"
APP_HOST="${APP_HOST:-timeline.all-too-well.com}"
PUBLIC_SCHEME="${PUBLIC_SCHEME:-https}"
PUBLIC_APP_URL="${PUBLIC_APP_URL:-${PUBLIC_SCHEME}://${APP_HOST}}"
FEISHU_CALLBACK_PATH="${FEISHU_CALLBACK_PATH:-/login/callback}"
OAUTH_PROVIDER="feishu-cn"
FEISHU_AUTHORIZATION_ENDPOINT="https://accounts.feishu.cn/open-apis/authen/v1/index"
RUN_PRISMA_MIGRATE_DEPLOY="${RUN_PRISMA_MIGRATE_DEPLOY:-no}"
FORCE_NGINX_TEMPLATE_SYNC="${FORCE_NGINX_TEMPLATE_SYNC:-no}"
GCE_TUNNEL_THROUGH_IAP="${GCE_TUNNEL_THROUGH_IAP:-no}"
API_RUNTIME_USER=feishu-timeline-api
API_RUNTIME_GROUP=feishu-timeline-api
WEB_RUNTIME_USER=feishu-timeline-web
WEB_RUNTIME_GROUP=feishu-timeline-web

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=scripts/deploy/gce-common.sh
. "$ROOT_DIR/scripts/deploy/gce-common.sh"

validate_sync_inputs() {
  validate_gce_connection_parameters

  if [ "${#APP_ROOT}" -gt 256 ] \
    || [[ ! "$APP_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] \
    || [[ "$APP_ROOT" =~ (^|/)\.\.?(/|$) ]]; then
    fail 'APP_ROOT must be an absolute normalized path containing only safe path characters.'
  fi
  [ "$APP_ROOT" = /opt/feishu_timeline_app ] \
    || fail 'APP_ROOT must use the approved production root /opt/feishu_timeline_app.'
  if [[ "$GIT_REF" =~ ^[0-9a-f]{40}$ ]]; then
    :
  else
    fail 'GIT_REF must be the exact lowercase 40-character runtime commit.'
  fi
  if [ "${#REPO_URL}" -gt 2048 ] \
    || [[ "$REPO_URL" =~ [[:space:]\'\;\`\$] ]] \
    || [[ ! "$REPO_URL" =~ ^(https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/[A-Za-z0-9._~/-]+|ssh://[A-Za-z0-9._-]+@[A-Za-z0-9.-]+(:[0-9]{1,5})?/[A-Za-z0-9._~/-]+|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._~/-]+)$ ]]; then
    fail 'REPO_URL must be a credential-free HTTPS or SSH Git URL using safe characters.'
  fi
  if [[ "$REPO_URL" =~ ^https://[^/]*@ ]]; then
    fail 'REPO_URL must not contain credentials.'
  fi
  if [ "${#APP_HOST}" -gt 253 ] \
    || [[ ! "$APP_HOST" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] \
    || [[ "$APP_HOST" != *.* ]]; then
    fail 'APP_HOST must be a valid DNS hostname.'
  fi
  if [ "$PUBLIC_SCHEME" != https ]; then
    fail 'PUBLIC_SCHEME must be https.'
  fi
  if [ "$PUBLIC_APP_URL" != "https://$APP_HOST" ]; then
    fail 'PUBLIC_APP_URL must be the HTTPS origin derived from APP_HOST.'
  fi
  if [ "${#FEISHU_CALLBACK_PATH}" -gt 512 ] \
    || [[ ! "$FEISHU_CALLBACK_PATH" =~ ^/[A-Za-z0-9._~/-]+$ ]] \
    || [[ "$FEISHU_CALLBACK_PATH" == //* ]] \
    || [[ "$FEISHU_CALLBACK_PATH" =~ (^|/)\.\.?(/|$) ]]; then
    fail 'FEISHU_CALLBACK_PATH must be a normalized absolute URL path.'
  fi
  case "$RUN_PRISMA_MIGRATE_DEPLOY" in yes|no) ;; *) fail 'RUN_PRISMA_MIGRATE_DEPLOY must be yes or no.' ;; esac
  case "$FORCE_NGINX_TEMPLATE_SYNC" in yes|no) ;; *) fail 'FORCE_NGINX_TEMPLATE_SYNC must be yes or no.' ;; esac
}

validate_sync_inputs
REMOTE_USER="$(gce_ssh 'id -un')"
if [[ ! "$REMOTE_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
  fail 'Remote user is not a safe POSIX account name.'
fi
[ "$REMOTE_USER" != root ] \
  || fail 'Deployment SSH must use a dedicated non-root sudo identity.'
log "Remote user: $REMOTE_USER"
log 'Repository URL accepted (credentials prohibited; value redacted).'

REMOTE_SCRIPT="$(mktemp /tmp/r27a-gce-sync-remote.XXXXXX)"
cleanup_remote_script() {
  case "$REMOTE_SCRIPT" in
    /tmp/r27a-gce-sync-remote.*) rm -f -- "$REMOTE_SCRIPT" ;;
    *) fail 'Refusing to remove an unexpected temporary path.' ;;
  esac
}
trap cleanup_remote_script EXIT

cat >"$REMOTE_SCRIPT" <<'REMOTE_SCRIPT_EOF'
#!/usr/bin/env bash
set -euo pipefail
unset NODE_OPTIONS NODE_PATH PYTHONHOME PYTHONPATH PYTHONSTARTUP

APP_ROOT="$1"
REPO_URL="$2"
GIT_REF="$3"
APP_HOST="$4"
PUBLIC_APP_URL="$5"
FEISHU_CALLBACK_PATH="$6"
OAUTH_PROVIDER="$7"
FEISHU_AUTHORIZATION_ENDPOINT="$8"
REMOTE_USER="$9"
RUN_PRISMA_MIGRATE_DEPLOY="${10}"
FORCE_NGINX_TEMPLATE_SYNC="${11}"
API_RUNTIME_USER=feishu-timeline-api
API_RUNTIME_GROUP=feishu-timeline-api
WEB_RUNTIME_USER=feishu-timeline-web
WEB_RUNTIME_GROUP=feishu-timeline-web
BUILD_USER=feishu-timeline-build
BUILD_GROUP=feishu-timeline-build
PYTHON_BIN=/usr/bin/python3
DEPLOYMENT_COMMITTED=no
SERVICES_QUIESCED=no
API_SERVICE_WAS_ACTIVE=no
WEB_SERVICE_WAS_ACTIVE=no
MIGRATION_APPLIED=no
API_ENV_ACTIVATED=no
WEB_ENV_ACTIVATED=no
CURRENT_ACTIVATED=no
API_UNIT_ACTIVATED=no
WEB_UNIT_ACTIVATED=no
NGINX_CONFIG_ACTIVATED=no
NGINX_SITE_LINK_CREATED=no
DOTENV_TOOL_ACTIVATED=no
API_ENV_WAS_PRESENT=no
WEB_ENV_WAS_PRESENT=no
CURRENT_WAS_PRESENT=no
API_UNIT_WAS_PRESENT=no
WEB_UNIT_WAS_PRESENT=no
NGINX_CONFIG_WAS_PRESENT=no
DOTENV_TOOL_WAS_PRESENT=no
API_SERVICE_WAS_ENABLED=no
WEB_SERVICE_WAS_ENABLED=no
SERVICE_ENABLE_ATTEMPTED=no
SERVICES_BOOT_DISABLED=no
RUNTIME_TRANSACTION_GUARD_ARMED=no
RUNTIME_TRANSACTION_GUARD_COMMITTED=no
RUNTIME_TRANSACTION_GUARD_UNIT=""
RUNTIME_TRANSACTION_GUARD_MARKER=""
COMMITTED_BOOT_STATE=not_attempted
API_ENV_CANDIDATE=""
WEB_ENV_CANDIDATE=""
PREVIOUS_API_ENV=""
PREVIOUS_WEB_ENV=""
PREVIOUS_CURRENT_TARGET=""
CURRENT_LINK_TEMP=""
RELEASE_DIR=""
RELEASE_STAGED=no
BUILD_TREE_FROZEN=no
OBJECT_STORAGE_PATH="$APP_ROOT/var/object-storage"
OBJECT_STORAGE_WAS_PRESENT=no
OBJECT_STORAGE_METADATA_ACTIVATED=no
OBJECT_STORAGE_CREATED=no
PREVIOUS_OBJECT_STORAGE_METADATA=""
PREVIOUS_OBJECT_STORAGE_UID=""
PREVIOUS_OBJECT_STORAGE_GID=""
PREVIOUS_OBJECT_STORAGE_MODE=""
PREVIOUS_OBJECT_STORAGE_IDENTITY=""
ACTIVE_OBJECT_STORAGE_IDENTITY=""
API_UNIT_TARGET=/etc/systemd/system/feishu-timeline-api.service
WEB_UNIT_TARGET=/etc/systemd/system/feishu-timeline-web.service
NGINX_CONFIG_TARGET=/etc/nginx/sites-available/feishu-timeline
NGINX_SITE_LINK=/etc/nginx/sites-enabled/feishu-timeline
API_UNIT_CANDIDATE=""
WEB_UNIT_CANDIDATE=""
NGINX_CONFIG_CANDIDATE=""
NGINX_SITE_LINK_TEMP=""
PREVIOUS_API_UNIT=""
PREVIOUS_WEB_UNIT=""
PREVIOUS_NGINX_CONFIG=""
INSTALL_NGINX_TEMPLATE=no
DOTENV_TOOL_CANDIDATE=""
PREVIOUS_DOTENV_TOOL=""
export APP_ROOT REPO_URL GIT_REF APP_HOST PUBLIC_APP_URL FEISHU_CALLBACK_PATH
export OAUTH_PROVIDER FEISHU_AUTHORIZATION_ENDPOINT REMOTE_USER
export RUN_PRISMA_MIGRATE_DEPLOY FORCE_NGINX_TEMPLATE_SYNC
export PATH=/usr/local/bin:/usr/bin:/bin
export HOME=/home/$REMOTE_USER
export COREPACK_HOME=/home/$REMOTE_USER/.cache/node/corepack
export GIT_NO_REPLACE_OBJECTS=1
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES

REMOTE_GROUP="$(id -gn "$REMOTE_USER")"
[[ "$REMOTE_GROUP" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] \
  || { echo 'Invalid runtime group.' >&2; exit 1; }

ensure_runtime_identity() {
  local runtime_user="$1"
  local runtime_group="$2"
  local actual_shell

  if ! getent group "$runtime_group" >/dev/null; then
    sudo groupadd --system "$runtime_group"
  fi
  if ! id "$runtime_user" >/dev/null 2>&1; then
    sudo useradd --system \
      --gid "$runtime_group" \
      --home-dir /nonexistent \
      --no-create-home \
      --shell /usr/sbin/nologin \
      "$runtime_user"
  fi
  actual_shell="$(getent passwd "$runtime_user" | awk -F: 'NR == 1 {print $7}')"
  [ "$actual_shell" = /usr/sbin/nologin ] \
    || { echo "Runtime identity must use /usr/sbin/nologin: $runtime_user" >&2; exit 1; }
  [ "$(id -gn "$runtime_user")" = "$runtime_group" ] \
    || { echo "Runtime identity has an unexpected primary group: $runtime_user" >&2; exit 1; }
  [ "$runtime_user" != "$REMOTE_USER" ] \
    || { echo 'Deploy SSH identity must not be a runtime identity.' >&2; exit 1; }
}

ensure_runtime_identity "$API_RUNTIME_USER" "$API_RUNTIME_GROUP"
ensure_runtime_identity "$WEB_RUNTIME_USER" "$WEB_RUNTIME_GROUP"
ensure_runtime_identity "$BUILD_USER" "$BUILD_GROUP"
[ "$API_RUNTIME_USER" != "$WEB_RUNTIME_USER" ] \
  || { echo 'API and Web runtime identities must be distinct.' >&2; exit 1; }
[ "$BUILD_USER" != "$API_RUNTIME_USER" ] \
  && [ "$BUILD_USER" != "$WEB_RUNTIME_USER" ] \
  && [ "$BUILD_USER" != "$REMOTE_USER" ] \
  || { echo 'Build, deploy, and runtime identities must be distinct.' >&2; exit 1; }

if sudo runuser -u "$BUILD_USER" -- /usr/bin/sudo -n true >/dev/null 2>&1; then
  echo 'Build identity must not have non-interactive sudo access.' >&2
  exit 1
fi
for unprivileged_user in "$API_RUNTIME_USER" "$WEB_RUNTIME_USER"; do
  if sudo runuser -u "$unprivileged_user" -- /usr/bin/sudo -n true >/dev/null 2>&1; then
    echo "Runtime identity must not have non-interactive sudo access: $unprivileged_user" >&2
    exit 1
  fi
done

API_RUNTIME_UID="$(id -u "$API_RUNTIME_USER")"
API_RUNTIME_GID="$(id -g "$API_RUNTIME_USER")"
WEB_RUNTIME_GID="$(id -g "$WEB_RUNTIME_USER")"
BUILD_GID="$(id -g "$BUILD_USER")"
if id -G "$API_RUNTIME_USER" | tr ' ' '\n' | grep -Fx "$WEB_RUNTIME_GID" >/dev/null; then
  echo 'API runtime identity belongs to the Web runtime group.' >&2
  exit 1
fi
if id -G "$WEB_RUNTIME_USER" | tr ' ' '\n' | grep -Fx "$API_RUNTIME_GID" >/dev/null; then
  echo 'Web runtime identity belongs to the API runtime group.' >&2
  exit 1
fi
for runtime_user in "$API_RUNTIME_USER" "$WEB_RUNTIME_USER"; do
  if id -G "$runtime_user" | tr ' ' '\n' | grep -Fx "$BUILD_GID" >/dev/null; then
    echo "Runtime identity belongs to the build group: $runtime_user" >&2
    exit 1
  fi
done
for runtime_gid in "$API_RUNTIME_GID" "$WEB_RUNTIME_GID"; do
  if id -G "$BUILD_USER" | tr ' ' '\n' | grep -Fx "$runtime_gid" >/dev/null; then
    echo 'Build identity belongs to an application runtime group.' >&2
    exit 1
  fi
done
sudo "$PYTHON_BIN" -I - "$APP_ROOT" <<'PY'
from pathlib import Path
import os
import re
import stat
import sys

app_root = Path(sys.argv[1])
releases = app_root / 'releases'
current = app_root / 'current'

def require_secure_directory(path: Path, *, allow_missing: bool) -> None:
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        if allow_missing:
            return
        raise SystemExit(f'managed directory is missing: {path}')
    if not stat.S_ISDIR(metadata.st_mode):
        raise SystemExit(f'managed path is not a non-symlink directory: {path}')
    if metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022:
        raise SystemExit(f'managed directory is not root-controlled: {path}')

require_secure_directory(Path('/opt'), allow_missing=False)
require_secure_directory(app_root, allow_missing=True)
require_secure_directory(releases, allow_missing=True)
require_secure_directory(app_root / 'var', allow_missing=True)
if current.exists() or current.is_symlink():
    metadata = current.lstat()
    if not stat.S_ISLNK(metadata.st_mode) or metadata.st_uid != 0:
        raise SystemExit(f'current pointer is not a root-owned symlink: {current}')
    target = Path(os.path.realpath(current))
    if target.parent != releases or not re.fullmatch(r'[0-9a-f]{40}', target.name):
        raise SystemExit(f'current pointer escapes the immutable release root: {current}')
    require_secure_directory(target, allow_missing=False)
PY

SOURCE_REPO=/var/lib/feishu-timeline-deploy/repository
for managed_root in "$APP_ROOT" "$APP_ROOT/releases" "$APP_ROOT/var"; do
  if ! sudo test -e "$managed_root" && ! sudo test -L "$managed_root"; then
    sudo install -d -o root -g root -m 0755 "$managed_root"
  fi
done
if sudo test -e "$OBJECT_STORAGE_PATH" || sudo test -L "$OBJECT_STORAGE_PATH"; then
  sudo test -d "$OBJECT_STORAGE_PATH" && ! sudo test -L "$OBJECT_STORAGE_PATH" \
    || { echo 'Object-storage target is not a non-symlink directory.' >&2; exit 1; }
  PREVIOUS_OBJECT_STORAGE_METADATA="$(sudo stat -c '%u:%g:%a' "$OBJECT_STORAGE_PATH")"
  PREVIOUS_OBJECT_STORAGE_IDENTITY="$(sudo stat -c '%d:%i' "$OBJECT_STORAGE_PATH")"
  IFS=: read -r PREVIOUS_OBJECT_STORAGE_UID PREVIOUS_OBJECT_STORAGE_GID PREVIOUS_OBJECT_STORAGE_MODE \
    <<<"$PREVIOUS_OBJECT_STORAGE_METADATA"
  [[ "$PREVIOUS_OBJECT_STORAGE_UID" =~ ^[0-9]+$ \
      && "$PREVIOUS_OBJECT_STORAGE_GID" =~ ^[0-9]+$ \
      && "$PREVIOUS_OBJECT_STORAGE_MODE" =~ ^[0-7]{3,4}$ \
      && "$PREVIOUS_OBJECT_STORAGE_IDENTITY" =~ ^[0-9]+:[0-9]+$ ]] \
    || { echo 'Cannot snapshot existing object-storage ownership metadata.' >&2; exit 1; }
  (( (8#$PREVIOUS_OBJECT_STORAGE_MODE & 0002) == 0 )) \
    || { echo 'Existing object-storage target is world-writable.' >&2; exit 1; }
  OBJECT_STORAGE_WAS_PRESENT=yes
fi
if sudo test -e /var/lib/feishu-timeline-deploy || sudo test -L /var/lib/feishu-timeline-deploy; then
  source_parent_uid="$(sudo stat -c '%u' /var/lib/feishu-timeline-deploy 2>/dev/null || true)"
  source_parent_mode="$(sudo stat -c '%a' /var/lib/feishu-timeline-deploy 2>/dev/null || true)"
  sudo test -d /var/lib/feishu-timeline-deploy \
    && ! sudo test -L /var/lib/feishu-timeline-deploy \
    && [ "$source_parent_uid" = 0 ] \
    && [[ "$source_parent_mode" =~ ^[0-7]{3,4}$ ]] \
    && (( (8#$source_parent_mode & 0022) == 0 )) \
    || { echo 'Deployment source parent is not a root-controlled directory.' >&2; exit 1; }
fi
sudo install -d -o root -g root -m 0755 /var/lib/feishu-timeline-deploy
if sudo test -L "$SOURCE_REPO"; then
  echo 'Deployment source repository must not be a symlink.' >&2
  exit 1
fi
if sudo test -e "$SOURCE_REPO"; then
  source_repo_mode="$(sudo stat -c '%a' "$SOURCE_REPO" 2>/dev/null || true)"
  sudo test -d "$SOURCE_REPO" \
    && ! sudo test -L "$SOURCE_REPO" \
    && [ "$(sudo stat -c '%u' "$SOURCE_REPO" 2>/dev/null || true)" = "$(id -u "$REMOTE_USER")" ] \
    && [[ "$source_repo_mode" =~ ^[0-7]{3,4}$ ]] \
    && (( (8#$source_repo_mode & 0022) == 0 )) \
    || { echo 'Existing deployment source is not a private deploy-owned directory.' >&2; exit 1; }
else
  sudo install -d -o "$REMOTE_USER" -g "$REMOTE_GROUP" -m 0750 "$SOURCE_REPO"
fi

if [ -L "$SOURCE_REPO/.git" ]; then
  echo 'Deployment Git metadata must not be a symlink.' >&2
  exit 1
fi
if [ ! -d "$SOURCE_REPO/.git" ]; then
  git -c core.hooksPath=/dev/null -C "$SOURCE_REPO" init
  git -c core.hooksPath=/dev/null -C "$SOURCE_REPO" remote add origin "$REPO_URL"
elif [ "$(git -C "$SOURCE_REPO" remote get-url origin)" != "$REPO_URL" ]; then
  echo 'Existing deployment source has an unexpected origin.' >&2
  exit 1
fi
git_metadata_mode="$(stat -c '%a' "$SOURCE_REPO/.git" 2>/dev/null || true)"
if [ -L "$SOURCE_REPO/.git" ] \
  || [ ! -d "$SOURCE_REPO/.git" ] \
  || [ "$(stat -c '%u' "$SOURCE_REPO/.git")" != "$(id -u "$REMOTE_USER")" ] \
  || [[ ! "$git_metadata_mode" =~ ^[0-7]{3,4}$ ]] \
  || (( (8#$git_metadata_mode & 0022) != 0 )); then
  echo 'Deployment Git metadata is not a deploy-owned non-symlink directory.' >&2
  exit 1
fi
command -v flock >/dev/null \
  || { echo 'Missing required deployment lock command: flock' >&2; exit 1; }
DEPLOY_LOCK_FILE="$SOURCE_REPO/.deployment.lock"
if [ -L "$DEPLOY_LOCK_FILE" ]; then
  echo 'Deployment lock file must not be a symlink.' >&2
  exit 1
fi
if [ ! -e "$DEPLOY_LOCK_FILE" ]; then
  (umask 077; : >"$DEPLOY_LOCK_FILE")
fi
[ -f "$DEPLOY_LOCK_FILE" ] \
  && [ ! -L "$DEPLOY_LOCK_FILE" ] \
  && [ "$(stat -c '%u' "$DEPLOY_LOCK_FILE")" = "$(id -u "$REMOTE_USER")" ] \
  || { echo 'Deployment lock file is not a deploy-owned regular file.' >&2; exit 1; }
chmod 0600 "$DEPLOY_LOCK_FILE"
exec 9>>"$DEPLOY_LOCK_FILE"
flock -n 9 \
  || { echo 'Another deployment transaction is already running.' >&2; exit 1; }
git -c core.hooksPath=/dev/null -C "$SOURCE_REPO" fetch --depth 1 origin "$GIT_REF"
runtime_commit="$(git -C "$SOURCE_REPO" rev-parse 'FETCH_HEAD^{commit}')"
[ "$runtime_commit" = "$GIT_REF" ] \
  || { echo 'Fetched runtime commit does not match the exact requested commit.' >&2; exit 1; }

BUILD_ROOT="$(mktemp -d /tmp/feishu-timeline-build.XXXXXX)"
BUILD_HOME="$(mktemp -d /tmp/feishu-timeline-builder-home.XXXXXX)"
BUILD_CONFIG_ROOT="$(sudo mktemp -d /tmp/feishu-timeline-build-config.XXXXXX)"
sudo chown "$BUILD_USER:$BUILD_GROUP" "$BUILD_ROOT" "$BUILD_HOME"
sudo chmod 0700 "$BUILD_ROOT" "$BUILD_HOME"
sudo chown "root:$BUILD_GROUP" "$BUILD_CONFIG_ROOT"
sudo chmod 0750 "$BUILD_CONFIG_ROOT"
BUILD_COREPACK_HOME="$BUILD_HOME/.cache/node/corepack"
BUILD_WEB_ENV="$BUILD_CONFIG_ROOT/web.env"
PRIVILEGED_SOURCE_ROOT="$BUILD_CONFIG_ROOT/privileged-source"
API_UNIT_STAGE_SOURCE="$PRIVILEGED_SOURCE_ROOT/feishu-timeline-api.service"
WEB_UNIT_STAGE_SOURCE="$PRIVILEGED_SOURCE_ROOT/feishu-timeline-web.service"
NGINX_STAGE_SOURCE="$PRIVILEGED_SOURCE_ROOT/feishu-timeline.conf"

cleanup_build_root() {
  local cleanup_path
  local cleanup_uid
  local cleanup_mode

  for cleanup_path in "$BUILD_ROOT" "$BUILD_HOME" "$BUILD_CONFIG_ROOT"; do
    case "$cleanup_path" in
      /tmp/feishu-timeline-build.*|/tmp/feishu-timeline-builder-home.*|/tmp/feishu-timeline-build-config.*)
        if ! sudo test -e "$cleanup_path" && ! sudo test -L "$cleanup_path"; then
          continue
        fi
        if sudo test -L "$cleanup_path" || ! sudo test -d "$cleanup_path"; then
          echo "Refusing to recursively clean an unsafe build path: $cleanup_path" >&2
          continue
        fi
        cleanup_uid="$(sudo stat -c '%u' "$cleanup_path" 2>/dev/null || true)"
        cleanup_mode="$(sudo stat -c '%a' "$cleanup_path" 2>/dev/null || true)"
        if [[ ! "$cleanup_uid" =~ ^[0-9]+$ \
            || ! "$cleanup_mode" =~ ^[0-7]{3,4}$ ]] \
          || (( (8#$cleanup_mode & 0022) != 0 )); then
          echo "Refusing to clean a build path that lost its private ownership boundary: $cleanup_path" >&2
          continue
        fi
        sudo find "$cleanup_path" -xdev -mindepth 1 -depth -delete \
          || echo "Build-path cleanup requires review: $cleanup_path" >&2
        sudo rmdir "$cleanup_path" \
          || echo "Build-path root cleanup requires review: $cleanup_path" >&2
        ;;
      *) echo "Refusing to clean unexpected build path: $cleanup_path" >&2 ;;
    esac
  done
  return 0
}

fsync_remote_directory() {
  sudo "$PYTHON_BIN" -I - "$1" <<'PY'
import os
import sys

descriptor = os.open(
    sys.argv[1],
    os.O_RDONLY
    | getattr(os, 'O_CLOEXEC', 0)
    | getattr(os, 'O_DIRECTORY', 0)
    | getattr(os, 'O_NOFOLLOW', 0),
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

  [ "$SERVICES_QUIESCED" = yes ] \
    || { echo 'Runtime transaction guard requires quiesced services.' >&2; exit 1; }
  [ -x /usr/bin/systemd-run ] \
    || { echo 'Runtime transaction guard requires /usr/bin/systemd-run.' >&2; exit 1; }
  require_root_controlled_directory /var
  require_root_controlled_directory /var/lib
  sudo install -d -o root -g root -m 0700 /var/lib/feishu-timeline-transactions
  require_root_controlled_directory /var/lib/feishu-timeline-transactions
  transaction_id="$(< /proc/sys/kernel/random/uuid)"
  [[ "$transaction_id" =~ ^[0-9a-f-]{36}$ ]] \
    || { echo 'Could not obtain a bounded runtime transaction identifier.' >&2; exit 1; }
  RUNTIME_TRANSACTION_GUARD_UNIT="feishu-timeline-deploy-guard-$transaction_id"
  RUNTIME_TRANSACTION_GUARD_MARKER="/var/lib/feishu-timeline-transactions/$transaction_id.committed"
  ! sudo test -e "$RUNTIME_TRANSACTION_GUARD_MARKER" \
    && ! sudo test -L "$RUNTIME_TRANSACTION_GUARD_MARKER" \
    || { echo 'Runtime transaction commit marker unexpectedly exists.' >&2; exit 1; }
  coordinator_identity="$(stat -c '%i' "/proc/$$")"
  [[ "$coordinator_identity" =~ ^[0-9]+$ ]] \
    || { echo 'Could not bind the runtime guard to the coordinator identity.' >&2; exit 1; }
  sudo /usr/bin/systemd-run \
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
  sudo systemctl is-active --quiet "$RUNTIME_TRANSACTION_GUARD_UNIT" \
    || { echo 'Runtime transaction guard did not remain active.' >&2; exit 1; }
  RUNTIME_TRANSACTION_GUARD_ARMED=yes
}

disarm_runtime_transaction_guard() {
  local guard_stopped=no

  if [ "$RUNTIME_TRANSACTION_GUARD_ARMED" = yes ] \
    && [ -n "$RUNTIME_TRANSACTION_GUARD_UNIT" ]; then
    if ! sudo systemctl is-active --quiet "$RUNTIME_TRANSACTION_GUARD_UNIT"; then
      guard_stopped=yes
    elif sudo systemctl stop "$RUNTIME_TRANSACTION_GUARD_UNIT" >/dev/null 2>&1; then
      for _ in 1 2 3 4 5; do
        if ! sudo systemctl is-active --quiet "$RUNTIME_TRANSACTION_GUARD_UNIT"; then
          guard_stopped=yes
          break
        fi
        sleep 1
      done
    fi
    if [ "$guard_stopped" != yes ]; then
      echo 'Runtime transaction guard is still active; retaining its commit marker.' >&2
      return 1
    fi
  fi
  if [ -n "$RUNTIME_TRANSACTION_GUARD_MARKER" ]; then
    sudo rm -f -- "$RUNTIME_TRANSACTION_GUARD_MARKER"
    fsync_remote_directory /var/lib/feishu-timeline-transactions
  fi
  RUNTIME_TRANSACTION_GUARD_ARMED=no
}

commit_runtime_transaction_guard() {
  [ "$RUNTIME_TRANSACTION_GUARD_ARMED" = yes ] \
    || { echo 'Runtime transaction guard is not armed.' >&2; exit 1; }
  sudo systemctl is-active --quiet "$RUNTIME_TRANSACTION_GUARD_UNIT" \
    || { echo 'Runtime transaction guard exited before commit.' >&2; exit 1; }
  sudo install -o root -g root -m 0600 /dev/null "$RUNTIME_TRANSACTION_GUARD_MARKER"
  fsync_remote_directory /var/lib/feishu-timeline-transactions
  RUNTIME_TRANSACTION_GUARD_COMMITTED=yes
  DEPLOYMENT_COMMITTED=yes
  SERVICE_ENABLE_ATTEMPTED=yes
  local enable_complete=yes
  if ! sudo systemctl enable feishu-timeline-api.service feishu-timeline-web.service; then
    enable_complete=no
  fi
  if ! fsync_remote_directory /etc/systemd/system; then
    enable_complete=no
  fi
  if sudo test -e /etc/systemd/system/multi-user.target.wants \
    || sudo test -L /etc/systemd/system/multi-user.target.wants; then
    if ! sudo test -d /etc/systemd/system/multi-user.target.wants \
      || sudo test -L /etc/systemd/system/multi-user.target.wants \
      || ! fsync_remote_directory /etc/systemd/system/multi-user.target.wants; then
      enable_complete=no
    fi
  fi
  if [ "$enable_complete" = yes ]; then
    COMMITTED_BOOT_STATE=enabled
  else
    echo 'Committed runtime boot enablement was incomplete; forcing both runtime units disabled.' >&2
    local disable_complete=yes
    if ! sudo systemctl disable feishu-timeline-api.service feishu-timeline-web.service; then
      disable_complete=no
    fi
    if ! fsync_remote_directory /etc/systemd/system; then
      disable_complete=no
    fi
    if sudo test -e /etc/systemd/system/multi-user.target.wants \
      || sudo test -L /etc/systemd/system/multi-user.target.wants; then
      if ! sudo test -d /etc/systemd/system/multi-user.target.wants \
        || sudo test -L /etc/systemd/system/multi-user.target.wants \
        || ! fsync_remote_directory /etc/systemd/system/multi-user.target.wants; then
        disable_complete=no
      fi
    fi
    if [ "$disable_complete" = yes ]; then
      COMMITTED_BOOT_STATE=disabled_pending_review
    else
      COMMITTED_BOOT_STATE=unknown_manual_review
    fi
  fi
  printf 'committed_boot_state=%s\n' "$COMMITTED_BOOT_STATE"
  disarm_runtime_transaction_guard \
    || echo 'Committed deployment retained its crash-guard marker for manual cleanup.' >&2
}

rollback_deployment() {
  local failed_object_storage="$APP_ROOT/var/.object-storage.failed.$runtime_commit.$$"
  local failed_release="$APP_ROOT/releases/.failed.$runtime_commit.$$"
  local rollback_link="$APP_ROOT/.current.rollback.$$"
  local cleanup_file

  [ "$DEPLOYMENT_COMMITTED" != yes ] || return 0
  set +e
  echo 'Deployment failed before commit; rolling back activated runtime state.' >&2
  if sudo pgrep -u "$BUILD_USER" >/dev/null 2>&1; then
    sudo pkill -STOP -u "$BUILD_USER" || true
    sudo pkill -KILL -u "$BUILD_USER" || true
  fi

  if [ "$SERVICES_QUIESCED" != no ]; then
    sudo systemctl stop feishu-timeline-api.service feishu-timeline-web.service || true
    sudo pkill -TERM -u "$API_RUNTIME_USER" || true
    sudo pkill -TERM -u "$WEB_RUNTIME_USER" || true
    for _ in 1 2 3 4 5; do
      if ! sudo pgrep -u "$API_RUNTIME_USER" >/dev/null 2>&1 \
        && ! sudo pgrep -u "$WEB_RUNTIME_USER" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    sudo pkill -KILL -u "$API_RUNTIME_USER" || true
    sudo pkill -KILL -u "$WEB_RUNTIME_USER" || true
  fi

  if [ "$OBJECT_STORAGE_METADATA_ACTIVATED" != no ]; then
    if [ "$OBJECT_STORAGE_WAS_PRESENT" = yes ] \
      && sudo test -d "$OBJECT_STORAGE_PATH" \
      && ! sudo test -L "$OBJECT_STORAGE_PATH" \
      && [ "$(sudo stat -c '%d:%i' "$OBJECT_STORAGE_PATH" 2>/dev/null)" = "$PREVIOUS_OBJECT_STORAGE_IDENTITY" ]; then
      sudo chown "$PREVIOUS_OBJECT_STORAGE_UID:$PREVIOUS_OBJECT_STORAGE_GID" "$OBJECT_STORAGE_PATH"
      sudo chmod "$PREVIOUS_OBJECT_STORAGE_MODE" "$OBJECT_STORAGE_PATH"
    elif [ "$OBJECT_STORAGE_CREATED" = yes ] \
      && sudo test -d "$OBJECT_STORAGE_PATH" \
      && ! sudo test -L "$OBJECT_STORAGE_PATH" \
      && [ "$(sudo stat -c '%d:%i' "$OBJECT_STORAGE_PATH" 2>/dev/null)" = "$ACTIVE_OBJECT_STORAGE_IDENTITY" ] \
      && ! sudo test -e "$failed_object_storage" \
      && ! sudo test -L "$failed_object_storage"; then
      sudo mv -T -- "$OBJECT_STORAGE_PATH" "$failed_object_storage"
      sudo chown root:root "$failed_object_storage"
      sudo chmod 0700 "$failed_object_storage"
      echo "Failed new object-storage root preserved root-only: $failed_object_storage" >&2
    else
      echo 'Object-storage metadata rollback requires manual review; services remain stopped.' >&2
    fi
    OBJECT_STORAGE_METADATA_ACTIVATED=no
  fi

  if [ "$CURRENT_ACTIVATED" != no ]; then
    if [ "$CURRENT_WAS_PRESENT" = yes ] && [ -n "$PREVIOUS_CURRENT_TARGET" ]; then
      if ! sudo test -e "$rollback_link" && ! sudo test -L "$rollback_link"; then
        sudo ln -s -- "$PREVIOUS_CURRENT_TARGET" "$rollback_link"
        sudo mv -Tf -- "$rollback_link" "$APP_ROOT/current"
      fi
    elif sudo test -L "$APP_ROOT/current" \
      && [ "$(sudo readlink "$APP_ROOT/current" 2>/dev/null)" = "$RELEASE_DIR" ]; then
      sudo rm -f -- "$APP_ROOT/current"
    fi
    CURRENT_ACTIVATED=no
  fi

  if [ "$WEB_ENV_ACTIVATED" != no ]; then
    if [ "$WEB_ENV_WAS_PRESENT" = yes ] && sudo test -f "$PREVIOUS_WEB_ENV"; then
      sudo mv -Tf -- "$PREVIOUS_WEB_ENV" /etc/feishu-timeline/web.env
    else
      sudo rm -f -- /etc/feishu-timeline/web.env
    fi
    WEB_ENV_ACTIVATED=no
  fi
  if [ "$API_ENV_ACTIVATED" != no ]; then
    if [ "$API_ENV_WAS_PRESENT" = yes ] && sudo test -f "$PREVIOUS_API_ENV"; then
      sudo mv -Tf -- "$PREVIOUS_API_ENV" /etc/feishu-timeline/api.env
    else
      sudo rm -f -- /etc/feishu-timeline/api.env
    fi
    API_ENV_ACTIVATED=no
  fi

  if [ "$NGINX_SITE_LINK_CREATED" != no ]; then
    if sudo test -L "$NGINX_SITE_LINK" \
      && [ "$(sudo readlink "$NGINX_SITE_LINK" 2>/dev/null)" = "$NGINX_CONFIG_TARGET" ]; then
      sudo rm -f -- "$NGINX_SITE_LINK"
    fi
    NGINX_SITE_LINK_CREATED=no
  fi
  if [ "$NGINX_CONFIG_ACTIVATED" != no ]; then
    if [ "$NGINX_CONFIG_WAS_PRESENT" = yes ] \
      && [ -n "$PREVIOUS_NGINX_CONFIG" ] \
      && sudo test -f "$PREVIOUS_NGINX_CONFIG" \
      && ! sudo test -L "$PREVIOUS_NGINX_CONFIG"; then
      sudo mv -Tf -- "$PREVIOUS_NGINX_CONFIG" "$NGINX_CONFIG_TARGET"
    else
      sudo rm -f -- "$NGINX_CONFIG_TARGET"
    fi
    NGINX_CONFIG_ACTIVATED=no
  fi
  if [ "$WEB_UNIT_ACTIVATED" != no ]; then
    if [ "$WEB_UNIT_WAS_PRESENT" = yes ] \
      && [ -n "$PREVIOUS_WEB_UNIT" ] \
      && sudo test -f "$PREVIOUS_WEB_UNIT" \
      && ! sudo test -L "$PREVIOUS_WEB_UNIT"; then
      sudo mv -Tf -- "$PREVIOUS_WEB_UNIT" "$WEB_UNIT_TARGET"
    else
      sudo rm -f -- "$WEB_UNIT_TARGET"
    fi
    WEB_UNIT_ACTIVATED=no
  fi
  if [ "$API_UNIT_ACTIVATED" != no ]; then
    if [ "$API_UNIT_WAS_PRESENT" = yes ] \
      && [ -n "$PREVIOUS_API_UNIT" ] \
      && sudo test -f "$PREVIOUS_API_UNIT" \
      && ! sudo test -L "$PREVIOUS_API_UNIT"; then
      sudo mv -Tf -- "$PREVIOUS_API_UNIT" "$API_UNIT_TARGET"
    else
      sudo rm -f -- "$API_UNIT_TARGET"
    fi
    API_UNIT_ACTIVATED=no
  fi
  if [ "$DOTENV_TOOL_ACTIVATED" != no ]; then
    if [ "$DOTENV_TOOL_WAS_PRESENT" = yes ] \
      && [ -n "$PREVIOUS_DOTENV_TOOL" ] \
      && sudo test -f "$PREVIOUS_DOTENV_TOOL" \
      && ! sudo test -L "$PREVIOUS_DOTENV_TOOL"; then
      sudo mv -Tf -- "$PREVIOUS_DOTENV_TOOL" /usr/local/libexec/feishu-timeline/dotenv-data
    else
      sudo rm -f -- /usr/local/libexec/feishu-timeline/dotenv-data
    fi
    DOTENV_TOOL_ACTIVATED=no
  fi

  for cleanup_file in \
    "$API_ENV_CANDIDATE" "$WEB_ENV_CANDIDATE" \
    "$API_UNIT_CANDIDATE" "$WEB_UNIT_CANDIDATE" "$NGINX_CONFIG_CANDIDATE" \
    "$DOTENV_TOOL_CANDIDATE" \
    "$NGINX_SITE_LINK_TEMP" "$CURRENT_LINK_TEMP" \
    "$PREVIOUS_API_ENV" "$PREVIOUS_WEB_ENV" \
    "$PREVIOUS_API_UNIT" "$PREVIOUS_WEB_UNIT" "$PREVIOUS_NGINX_CONFIG" \
    "$PREVIOUS_DOTENV_TOOL" \
    "$rollback_link"; do
    [ -n "$cleanup_file" ] && sudo rm -f -- "$cleanup_file"
  done
  fsync_remote_directory /etc/feishu-timeline || true
  fsync_remote_directory "$APP_ROOT" || true
  fsync_remote_directory /etc/systemd/system || true
  if sudo test -d /usr/local/libexec/feishu-timeline \
    && ! sudo test -L /usr/local/libexec/feishu-timeline; then
    fsync_remote_directory /usr/local/libexec/feishu-timeline || true
  fi
  if sudo test -d /etc/nginx/sites-available && ! sudo test -L /etc/nginx/sites-available; then
    fsync_remote_directory /etc/nginx/sites-available || true
  fi
  if sudo test -d /etc/nginx/sites-enabled && ! sudo test -L /etc/nginx/sites-enabled; then
    fsync_remote_directory /etc/nginx/sites-enabled || true
  fi

  if [ "$RELEASE_STAGED" != no ] \
    && sudo test -d "$RELEASE_DIR" \
    && ! sudo test -L "$RELEASE_DIR" \
    && ! sudo test -e "$failed_release" \
    && ! sudo test -L "$failed_release"; then
    sudo mv -T -- "$RELEASE_DIR" "$failed_release"
    sudo chmod 0700 "$failed_release"
    echo "Failed immutable release preserved root-only: $failed_release" >&2
  fi

  if [ "$SERVICES_QUIESCED" != no ]; then
    if [ "$SERVICES_BOOT_DISABLED" != no ] || [ "$SERVICE_ENABLE_ATTEMPTED" = yes ]; then
      if [ "$MIGRATION_APPLIED" != no ]; then
        sudo systemctl disable feishu-timeline-api.service feishu-timeline-web.service || true
      else
        if [ "$API_SERVICE_WAS_ENABLED" = yes ]; then
          sudo systemctl enable feishu-timeline-api.service || true
        else
          sudo systemctl disable feishu-timeline-api.service || true
        fi
        if [ "$WEB_SERVICE_WAS_ENABLED" = yes ]; then
          sudo systemctl enable feishu-timeline-web.service || true
        else
          sudo systemctl disable feishu-timeline-web.service || true
        fi
      fi
    fi
    sudo systemctl daemon-reload || true
    if sudo test -x /usr/sbin/nginx && sudo /usr/sbin/nginx -t >/dev/null 2>&1; then
      sudo systemctl reload nginx.service || true
    fi
    if [ "$MIGRATION_APPLIED" != no ]; then
      echo 'Database migration was applied; runtime services remain stopped pending compatibility review.' >&2
    else
      [ "$API_SERVICE_WAS_ACTIVE" = yes ] \
        && sudo systemctl restart feishu-timeline-api.service || true
      [ "$WEB_SERVICE_WAS_ACTIVE" = yes ] \
        && sudo systemctl restart feishu-timeline-web.service || true
    fi
  fi
  if [ "$MIGRATION_APPLIED" = no ]; then
    disarm_runtime_transaction_guard \
      || echo 'Rollback left the fail-closed runtime guard armed.' >&2
  fi
}

deployment_exit() {
  local exit_status="$?"

  trap - EXIT INT TERM HUP
  if [ "$exit_status" -ne 0 ]; then
    rollback_deployment
  fi
  cleanup_build_root
  exit "$exit_status"
}
trap deployment_exit EXIT

run_as_builder_in_dir() {
  local workdir="$1"
  shift

  sudo runuser -u "$BUILD_USER" -- env -i \
    "HOME=$BUILD_HOME" \
    "COREPACK_HOME=$BUILD_COREPACK_HOME" \
    "PATH=$PATH" \
    /bin/bash -c '
      set -euo pipefail
      workdir="$1"
      shift
      cd -- "$workdir"
      exec "$@"
    ' gce-build "$workdir" "$@"
}

run_as_builder_in_dir_with_web_env() {
  local workdir="$1"
  shift

  sudo runuser -u "$BUILD_USER" -- env -i \
    "HOME=$BUILD_HOME" \
    "COREPACK_HOME=$BUILD_COREPACK_HOME" \
    "PATH=$PATH" \
    "$PYTHON_BIN" -I "$DOTENV_TOOL_CANDIDATE" exec --profile web "$BUILD_WEB_ENV" -- \
    /bin/bash -c '
      set -euo pipefail
      workdir="$1"
      shift
      cd -- "$workdir"
      exec "$@"
    ' gce-web-build "$workdir" "$@"
}

quiesce_and_freeze_build_tree() {
  if sudo pgrep -u "$BUILD_USER" >/dev/null 2>&1; then
    sudo pkill -STOP -u "$BUILD_USER" || true
    sudo pkill -KILL -u "$BUILD_USER" || true
  fi
  for _ in 1 2 3 4 5; do
    sudo pgrep -u "$BUILD_USER" >/dev/null 2>&1 || break
    sleep 1
  done
  if sudo pgrep -u "$BUILD_USER" >/dev/null 2>&1; then
    echo 'Build identity still owns running processes after quiescence.' >&2
    exit 1
  fi
  sudo "$PYTHON_BIN" -I - "$BUILD_ROOT" "$(id -u "$BUILD_USER")" <<'PY'
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
  sudo find "$BUILD_ROOT" -xdev -type d -exec chown root:root -- {} +
  sudo find "$BUILD_ROOT" -xdev -type f -exec chown root:root -- {} +
  sudo find "$BUILD_ROOT" -xdev -type l -exec chown -h root:root -- {} +
  sudo find "$BUILD_ROOT" -xdev -type d -exec chmod 0755 -- {} +
  sudo find "$BUILD_ROOT" -xdev -type f -exec chmod u+rw,go+r,go-w -- {} +
  BUILD_TREE_FROZEN=yes
}

reopen_build_tree_for_builder() {
  [ "$BUILD_TREE_FROZEN" = yes ] \
    || { echo 'Build tree must be frozen before it can be reopened for the isolated builder.' >&2; exit 1; }
  sudo test -d "$BUILD_ROOT" && ! sudo test -L "$BUILD_ROOT" \
    && [ "$(sudo stat -c '%u' "$BUILD_ROOT")" = 0 ] \
    || { echo 'Frozen build tree lost its root ownership boundary.' >&2; exit 1; }
  sudo find "$BUILD_ROOT" -xdev -type d -exec chown "$BUILD_USER:$BUILD_GROUP" -- {} +
  sudo find "$BUILD_ROOT" -xdev -type f -exec chown "$BUILD_USER:$BUILD_GROUP" -- {} +
  sudo find "$BUILD_ROOT" -xdev -type l -exec chown -h "$BUILD_USER:$BUILD_GROUP" -- {} +
  BUILD_TREE_FROZEN=no
}

git -C "$SOURCE_REPO" archive "$runtime_commit" \
  | sudo runuser -u "$BUILD_USER" -- tar -x -C "$BUILD_ROOT"
[ ! -e "$BUILD_ROOT/.git" ] \
  || { echo 'Clean archive unexpectedly contains Git metadata.' >&2; exit 1; }

build_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
release="r26-admin-${runtime_commit:0:12}"

DOTENV_DATA_TOOL=/usr/local/libexec/feishu-timeline/dotenv-data
DOTENV_STAGE_TOOL="$BUILD_ROOT/scripts/deploy/dotenv-data.py"
API_ENV_FILE=/etc/feishu-timeline/api.env
WEB_ENV_FILE=/etc/feishu-timeline/web.env
DOTENV_TOOL_DIR="$(dirname "$DOTENV_DATA_TOOL")"
API_ENV_CANDIDATE="/etc/feishu-timeline/.api.env.candidate.$runtime_commit"
WEB_ENV_CANDIDATE="/etc/feishu-timeline/.web.env.candidate.$runtime_commit"
PREVIOUS_API_ENV="/etc/feishu-timeline/.api.env.previous.$$"
PREVIOUS_WEB_ENV="/etc/feishu-timeline/.web.env.previous.$$"
DOTENV_TOOL_CANDIDATE="$DOTENV_TOOL_DIR/.dotenv-data.candidate.$$"
PREVIOUS_DOTENV_TOOL="$DOTENV_TOOL_DIR/.dotenv-data.previous.$$"
API_UNIT_CANDIDATE="/etc/systemd/system/.feishu-timeline-api.service.candidate.$$"
WEB_UNIT_CANDIDATE="/etc/systemd/system/.feishu-timeline-web.service.candidate.$$"
PREVIOUS_API_UNIT="/etc/systemd/system/.feishu-timeline-api.service.previous.$$"
PREVIOUS_WEB_UNIT="/etc/systemd/system/.feishu-timeline-web.service.previous.$$"
NGINX_CONFIG_CANDIDATE="/etc/nginx/sites-available/.feishu-timeline.candidate.$$"
PREVIOUS_NGINX_CONFIG="/etc/nginx/sites-available/.feishu-timeline.previous.$$"
NGINX_SITE_LINK_TEMP="/etc/nginx/sites-enabled/.feishu-timeline.candidate.$$"
CURRENT_LINK_TEMP="$APP_ROOT/.current.$runtime_commit"

require_root_controlled_directory() {
  local directory="$1"
  local allow_missing="${2:-no}"

  sudo "$PYTHON_BIN" -I - "$directory" "$allow_missing" <<'PY'
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

ensure_root_controlled_directory() {
  local directory="$1"

  require_root_controlled_directory "$directory" yes
  if ! sudo test -e "$directory" && ! sudo test -L "$directory"; then
    sudo install -d -o root -g root -m 0755 "$directory"
  fi
  require_root_controlled_directory "$directory"
}

require_absent_transaction_path() {
  local path="$1"

  if sudo test -e "$path" || sudo test -L "$path"; then
    echo "Transaction staging or rollback path already exists: $path" >&2
    exit 1
  fi
}

validate_canonical_env_source() {
  local source="$1"
  local runtime_gid="$2"
  local source_mode

  if sudo test -L "$source"; then
    echo "Refusing symlink production env: $source" >&2
    exit 1
  fi
  if ! sudo test -f "$source"; then
    echo "Canonical production env is missing; restore an operator-reviewed file before deployment: $source" >&2
    exit 1
  fi
  [ "$(sudo stat -c '%u' "$source")" = 0 ] \
    || { echo "Production env is not root-owned: $source" >&2; exit 1; }
  [ "$(sudo stat -c '%g' "$source")" = "$runtime_gid" ] \
    || { echo "Production env has the wrong isolated runtime group: $source" >&2; exit 1; }
  source_mode="$(sudo stat -c '%a' "$source")"
  case "$source_mode" in
    440|640) ;;
    *) echo "Production env has unsafe mode: $source" >&2; exit 1 ;;
  esac
}

stage_privileged_dotenv_tool() {
  local destination
  local source
  local source_and_destination

  [ "$BUILD_TREE_FROZEN" = yes ] \
    || { echo 'Privileged helper intake requires a root-frozen build tree.' >&2; exit 1; }
  require_root_controlled_directory /usr
  for privileged_directory in /usr/local /usr/local/libexec "$DOTENV_TOOL_DIR"; do
    ensure_root_controlled_directory "$privileged_directory"
  done
  require_absent_transaction_path "$DOTENV_TOOL_CANDIDATE"
  sudo test -f "$DOTENV_STAGE_TOOL" && ! sudo test -L "$DOTENV_STAGE_TOOL" \
    && [ "$(sudo stat -c '%u' "$DOTENV_STAGE_TOOL")" = 0 ] \
    || { echo 'Frozen exact-commit dotenv parser is missing or unsafe.' >&2; exit 1; }
  sudo install -o root -g root -m 0755 "$DOTENV_STAGE_TOOL" "$DOTENV_TOOL_CANDIDATE"
  [ "$(sudo stat -c '%u:%g:%a' "$DOTENV_TOOL_CANDIDATE")" = '0:0:755' ] \
    || { echo 'Privileged dotenv candidate failed its ownership boundary.' >&2; exit 1; }

  sudo install -d -o root -g root -m 0700 "$PRIVILEGED_SOURCE_ROOT"
  for source_and_destination in \
    "$BUILD_ROOT/deploy/systemd/feishu-timeline-api.service|$API_UNIT_STAGE_SOURCE" \
    "$BUILD_ROOT/deploy/systemd/feishu-timeline-web.service|$WEB_UNIT_STAGE_SOURCE" \
    "$BUILD_ROOT/deploy/nginx/feishu-timeline.conf|$NGINX_STAGE_SOURCE"; do
    source="${source_and_destination%%|*}"
    destination="${source_and_destination#*|}"
    sudo test -f "$source" && ! sudo test -L "$source" \
      && [ "$(sudo stat -c '%u' "$source")" = 0 ] \
      || { echo "Frozen privileged template is missing or unsafe: $source" >&2; exit 1; }
    sudo install -o root -g root -m 0600 "$source" "$destination"
  done
}

stage_managed_env() {
  local profile="$1"
  local source="$2"
  local candidate="$3"
  local runtime_gid="$4"
  shift 4

  validate_canonical_env_source "$source" "$runtime_gid"
  require_absent_transaction_path "$candidate"
  sudo "$PYTHON_BIN" -I "$DOTENV_TOOL_CANDIDATE" validate --profile "$profile" "$source"
  sudo "$PYTHON_BIN" -I "$DOTENV_TOOL_CANDIDATE" rewrite \
    --profile "$profile" \
    --source "$source" \
    --target "$candidate" \
    --uid 0 \
    --gid "$runtime_gid" \
    --mode 0640 \
    --require-secure-parent \
    "$@"
  [ "$(sudo stat -c '%u:%g:%a' "$candidate")" = "0:$runtime_gid:640" ] \
    || { echo "Managed env candidate failed its owner/mode postcondition: $candidate" >&2; exit 1; }
  printf 'staged_managed_env=%s\n' "$candidate"
}

stage_runtime_environment() {
  local transaction_path

  require_root_controlled_directory /etc
  ensure_root_controlled_directory /etc/feishu-timeline
  require_root_controlled_directory /usr
  require_root_controlled_directory /usr/local
  require_root_controlled_directory /usr/local/libexec
  require_root_controlled_directory "$DOTENV_TOOL_DIR"

  for transaction_path in \
    "$PREVIOUS_DOTENV_TOOL" \
    "$PREVIOUS_API_ENV" "$PREVIOUS_WEB_ENV" \
    "$API_UNIT_CANDIDATE" "$WEB_UNIT_CANDIDATE" \
    "$PREVIOUS_API_UNIT" "$PREVIOUS_WEB_UNIT" \
    "$NGINX_CONFIG_CANDIDATE" "$PREVIOUS_NGINX_CONFIG" \
    "$NGINX_SITE_LINK_TEMP" "$CURRENT_LINK_TEMP"; do
    require_absent_transaction_path "$transaction_path"
  done
  sudo test -f "$DOTENV_TOOL_CANDIDATE" && ! sudo test -L "$DOTENV_TOOL_CANDIDATE" \
    && [ "$(sudo stat -c '%u:%g:%a' "$DOTENV_TOOL_CANDIDATE")" = '0:0:755' ] \
    || { echo 'Privileged dotenv candidate is missing or unsafe.' >&2; exit 1; }

  stage_managed_env api "$API_ENV_FILE" "$API_ENV_CANDIDATE" "$API_RUNTIME_GID" \
    --set "NODE_ENV=production" \
    --set "DEPLOYMENT_ENV=production" \
    --set "RUNTIME_COMMIT=$runtime_commit" \
    --set "BUILD_TIME=$build_time" \
    --set "RELEASE=$release" \
    --set "HOST=127.0.0.1" \
    --set "PORT=3001" \
    --set "FRONTEND_URL=$PUBLIC_APP_URL" \
    --set "FEISHU_REDIRECT_URI=${PUBLIC_APP_URL}${FEISHU_CALLBACK_PATH}" \
    --set "OAUTH_PROVIDER=$OAUTH_PROVIDER" \
    --set "FEISHU_AUTHORIZATION_ENDPOINT=$FEISHU_AUTHORIZATION_ENDPOINT" \
    --set "AUTH_MOCK_ENABLED=false" \
    --set "OBJECT_STORAGE_LOCAL_ROOT=/opt/feishu_timeline_app/var/object-storage" \
    --set "UI_VERSION=v2"
  stage_managed_env web "$WEB_ENV_FILE" "$WEB_ENV_CANDIDATE" "$WEB_RUNTIME_GID" \
    --set "NEXT_PUBLIC_API_BASE_URL=/api" \
    --set "RUNTIME_COMMIT=$runtime_commit" \
    --set "BUILD_TIME=$build_time" \
    --set "RELEASE=$release" \
    --set "NEXT_PUBLIC_ENABLE_MOCK_LOGIN=false" \
    --set "NEXT_PUBLIC_UI_VERSION=v2" \
    --set "NEXT_PUBLIC_UI_DATA_MODE=real" \
    --set "V1_FALLBACK_ENABLED=true" \
    --delete NEXT_PUBLIC_FEISHU_APP_ID \
    --delete NEXT_PUBLIC_R26_V2_PROTOTYPE \
    --delete NEXT_PUBLIC_R26_V2_DATA_MODE

  sudo "$PYTHON_BIN" -I "$DOTENV_TOOL_CANDIDATE" rewrite \
    --profile web \
    --source "$WEB_ENV_CANDIDATE" \
    --target "$BUILD_WEB_ENV" \
    --uid 0 \
    --gid "$BUILD_GID" \
    --mode 0640 \
    --require-secure-parent

  sudo -u "$WEB_RUNTIME_USER" test ! -r "$API_ENV_FILE" \
    || { echo 'Web runtime can read the API environment.' >&2; exit 1; }
  sudo -u "$API_RUNTIME_USER" test ! -r "$WEB_ENV_FILE" \
    || { echo 'API runtime can read the Web environment.' >&2; exit 1; }
  sudo -u "$WEB_RUNTIME_USER" test ! -r "$API_ENV_CANDIDATE" \
    || { echo 'Web runtime can read the staged API environment.' >&2; exit 1; }
  sudo -u "$API_RUNTIME_USER" test ! -r "$WEB_ENV_CANDIDATE" \
    || { echo 'API runtime can read the staged Web environment.' >&2; exit 1; }
  sudo -u "$BUILD_USER" test ! -r "$API_ENV_FILE" \
    && sudo -u "$BUILD_USER" test ! -r "$API_ENV_CANDIDATE" \
    || { echo 'Build identity can read the API environment.' >&2; exit 1; }
  sudo -u "$BUILD_USER" test ! -r "$WEB_ENV_FILE" \
    && sudo -u "$BUILD_USER" test ! -r "$WEB_ENV_CANDIDATE" \
    || { echo 'Build identity can read the canonical or runtime Web environment.' >&2; exit 1; }
  sudo -u "$BUILD_USER" test -r "$BUILD_WEB_ENV" \
    || { echo 'Build identity cannot read its isolated Web build environment.' >&2; exit 1; }
  sudo -u "$API_RUNTIME_USER" test ! -r "$BUILD_WEB_ENV" \
    && sudo -u "$WEB_RUNTIME_USER" test ! -r "$BUILD_WEB_ENV" \
    || { echo 'Runtime identity can read the isolated build environment.' >&2; exit 1; }

  storage_root="$(sudo "$PYTHON_BIN" -I "$DOTENV_TOOL_CANDIDATE" get \
    --profile api "$API_ENV_CANDIDATE" OBJECT_STORAGE_LOCAL_ROOT)"
  printf 'resolved_object_storage=%s\n' "$storage_root"
  [ "$storage_root" = "/opt/feishu_timeline_app/var/object-storage" ] \
    || { echo 'Object storage root escaped the controlled production path.' >&2; exit 1; }
  fsync_remote_directory /etc/feishu-timeline
  fsync_remote_directory "$DOTENV_TOOL_DIR"
}

build_application() {
  run_as_builder_in_dir "$BUILD_ROOT" rm -rf apps/api/dist apps/web/.next
  run_as_builder_in_dir "$BUILD_ROOT" mkdir -p "$BUILD_COREPACK_HOME"
  run_as_builder_in_dir "$BUILD_ROOT" corepack prepare pnpm@9.15.4 --activate
  run_as_builder_in_dir "$BUILD_ROOT" pnpm install --frozen-lockfile --package-import-method=copy
  run_as_builder_in_dir "$BUILD_ROOT" pnpm --filter @feishu-timeline/shared build
  run_as_builder_in_dir_with_web_env "$BUILD_ROOT/apps/web" pnpm exec next build
  run_as_builder_in_dir "$BUILD_ROOT/apps/api" env \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    pnpm exec prisma generate --schema prisma/schema.prisma
  run_as_builder_in_dir "$BUILD_ROOT/apps/api" pnpm exec tsc -p tsconfig.build.json
  run_as_builder_in_dir "$BUILD_ROOT/apps/api" env \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    pnpm exec prisma validate --schema prisma/schema.prisma
  quiesce_and_freeze_build_tree
}

stage_immutable_release() {
  [ "$BUILD_TREE_FROZEN" = yes ] \
    || { echo 'Build tree must be root-frozen before release staging.' >&2; exit 1; }
  RELEASE_DIR="$APP_ROOT/releases/$runtime_commit"
  if sudo test -e "$RELEASE_DIR" || sudo test -L "$RELEASE_DIR"; then
    echo "Immutable release already exists; refusing overwrite: $RELEASE_DIR" >&2
    exit 1
  fi
  require_absent_transaction_path "$CURRENT_LINK_TEMP"
  require_absent_transaction_path "$APP_ROOT/releases/.failed.$runtime_commit.$$"
  RELEASE_STAGED=committing
  sudo install -d -o root -g root -m 0755 "$RELEASE_DIR"
  RELEASE_STAGED=yes
  sudo cp -a "$BUILD_ROOT/." "$RELEASE_DIR/"
  sudo chown -R root:root "$RELEASE_DIR"
  sudo chmod -R a+rX,go-w "$RELEASE_DIR"
  sudo -u "$API_RUNTIME_USER" test -r "$RELEASE_DIR/apps/api/dist/main.js"
  sudo -u "$WEB_RUNTIME_USER" test -r "$RELEASE_DIR/apps/web/.next/BUILD_ID"
  sudo -u "$API_RUNTIME_USER" test ! -w "$RELEASE_DIR"
  sudo -u "$WEB_RUNTIME_USER" test ! -w "$RELEASE_DIR"
  sudo ln -s "$RELEASE_DIR" "$CURRENT_LINK_TEMP"
  fsync_remote_directory "$APP_ROOT/releases"
  fsync_remote_directory "$APP_ROOT"
}

validate_managed_config_target() {
  local target="$1"
  local target_mode

  if sudo test -e "$target" || sudo test -L "$target"; then
    sudo test -f "$target" && ! sudo test -L "$target" \
      || { echo "Managed configuration target is not a regular non-symlink file: $target" >&2; exit 1; }
    [ "$(sudo stat -c '%u' "$target")" = 0 ] \
      || { echo "Managed configuration target is not root-owned: $target" >&2; exit 1; }
    target_mode="$(sudo stat -c '%a' "$target")"
    [[ "$target_mode" =~ ^[0-7]{3,4}$ ]] \
      && (( (8#$target_mode & 0022) == 0 )) \
      || { echo "Managed configuration target is group/other writable: $target" >&2; exit 1; }
  fi
}

render_service_template() {
  local source="$1"
  local candidate="$2"
  local rendered

  rendered="$(mktemp /tmp/feishu-timeline-service.XXXXXX)"
  sed \
    -e "s/__API_RUNTIME_USER__/$API_RUNTIME_USER/g" \
    -e "s/__API_RUNTIME_GROUP__/$API_RUNTIME_GROUP/g" \
    -e "s/__WEB_RUNTIME_USER__/$WEB_RUNTIME_USER/g" \
    -e "s/__WEB_RUNTIME_GROUP__/$WEB_RUNTIME_GROUP/g" \
    "$source" >"$rendered"
  sudo install -o root -g root -m 0644 "$rendered" "$candidate"
  rm -f "$rendered"
}

validate_existing_nginx_privacy_config() {
  local config_path="$1"

  sudo "$PYTHON_BIN" -I - "$config_path" "$APP_HOST" <<'PY'
import os
from pathlib import Path
import re
import stat
import sys

path = Path(sys.argv[1])
host = sys.argv[2]
flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
descriptor = os.open(path, flags)
try:
    metadata = os.fstat(descriptor)
    if not stat.S_ISREG(metadata.st_mode):
        raise SystemExit("existing Nginx configuration is not a regular file")
    payload = os.read(descriptor, 1024 * 1024 + 1)
    if len(payload) > 1024 * 1024:
        raise SystemExit("existing Nginx configuration exceeds 1 MiB")
    if os.read(descriptor, 1):
        raise SystemExit("existing Nginx configuration changed size while reading")
finally:
    os.close(descriptor)
try:
    text = payload.decode("utf-8", errors="strict")
except UnicodeDecodeError as error:
    raise SystemExit("existing Nginx configuration is not valid UTF-8") from error
if "\x00" in text or "\r" in text:
    raise SystemExit("existing Nginx configuration contains prohibited control data")

def strip_comments(value: str) -> str:
    cleaned = []
    for line in value.splitlines():
        quote = None
        escaped = False
        output = []
        for character in line:
            if escaped:
                output.append(character)
                escaped = False
                continue
            if character == "\\":
                output.append(character)
                escaped = True
                continue
            if quote is not None:
                output.append(character)
                if character == quote:
                    quote = None
                continue
            if character in {"'", '"'}:
                quote = character
                output.append(character)
            elif character == "#":
                break
            else:
                output.append(character)
        cleaned.append("".join(output))
    return "\n".join(cleaned)

def blocks(value: str, pattern: str) -> list[str]:
    result = []
    for match in re.finditer(pattern, value, flags=re.IGNORECASE):
        opening = value.find("{", match.start(), match.end())
        if opening < 0:
            continue
        depth = 0
        for index in range(opening, len(value)):
            if value[index] == "{":
                depth += 1
            elif value[index] == "}":
                depth -= 1
                if depth == 0:
                    result.append(value[opening + 1:index])
                    break
        else:
            raise SystemExit("existing Nginx configuration has an unterminated block")
    return result

def direct_scope(value: str) -> str:
    """Return only directives at the current block depth."""
    output = []
    depth = 0
    quote = None
    escaped = False
    for character in value:
        if escaped:
            if depth == 0:
                output.append(character)
            escaped = False
            continue
        if character == "\\":
            if depth == 0:
                output.append(character)
            escaped = True
            continue
        if quote is not None:
            if depth == 0:
                output.append(character)
            if character == quote:
                quote = None
            continue
        if character in {"'", '"'}:
            quote = character
            if depth == 0:
                output.append(character)
        elif character == "{":
            depth += 1
            if depth == 1:
                output.append("\n")
        elif character == "}":
            if depth == 0:
                raise SystemExit("existing Nginx configuration has an unmatched closing brace")
            depth -= 1
            if depth == 0:
                output.append("\n")
        elif depth == 0:
            output.append(character)
    if depth != 0:
        raise SystemExit("existing Nginx configuration has an unterminated nested block")
    return "".join(output)

active = strip_comments(text)
if re.search(r"\binclude\s+[^;]+;", active):
    raise SystemExit(
        "existing Nginx configuration contains an unexpanded include outside the reviewed privacy boundary"
    )
dangerous = re.compile(
    r"\$(?:request|request_uri|args|is_args|query_string|http_referer|arg_[A-Za-z0-9_]*)(?![A-Za-z0-9_])"
)
safe_formats = set()
safe_log_variables = {
    "$remote_addr",
    "$remote_user",
    "$time_local",
    "$request_method",
    "$uri",
    "$server_protocol",
    "$status",
    "$body_bytes_sent",
    "$http_user_agent",
}
canonical_access_log = (
    '$remote_addr - $remote_user [$time_local] '
    '"$request_method $uri $server_protocol" $status $body_bytes_sent '
    '"$http_user_agent"'
)
for match in re.finditer(r"\blog_format\s+([A-Za-z_][A-Za-z0-9_]*)\s+([^;]+);", active, re.DOTALL):
    name, body = match.groups()
    variables = set(re.findall(r"\$[A-Za-z_][A-Za-z0-9_]*", body))
    rendered_body = re.sub(r"'\s*'", "", body.strip())
    if len(rendered_body) >= 2 and rendered_body[0] == rendered_body[-1] == "'":
        rendered_body = rendered_body[1:-1]
    else:
        rendered_body = ""
    if (
        rendered_body == canonical_access_log
        and variables <= safe_log_variables
        and not dangerous.search(body)
    ):
        safe_formats.add(name)
if not safe_formats:
    raise SystemExit("existing Nginx configuration has no query-free access-log format")

managed_servers = []
for server in blocks(active, r"\bserver\s*\{"):
    server_direct = direct_scope(server)
    server_names = []
    for name_statement in re.findall(r"\bserver_name\s+([^;]+);", server_direct):
        server_names.extend(name_statement.split())
    if host not in server_names:
        continue
    managed_servers.append(server)
    if re.search(r"\binclude\s+[^;]+;", server):
        raise SystemExit(
            "managed Nginx server contains an unexpanded include outside the reviewed privacy boundary"
        )
    access_logs = re.findall(r"\baccess_log\s+([^;]+);", server_direct)
    if not access_logs:
        raise SystemExit("managed Nginx server inherits an unreviewed access-log format")
    for arguments in access_logs:
        tokens = arguments.split()
        if tokens == ["off"]:
            continue
        if len(tokens) < 2 or tokens[-1] not in safe_formats:
            raise SystemExit("managed Nginx server uses a query-bearing or implicit access-log format")
    callbacks = blocks(server, r"\blocation\s*=\s*/login/callback\s*\{")
    if not callbacks:
        raise SystemExit("managed Nginx server does not isolate the OAuth callback")
    for callback in callbacks:
        if "{" in callback or "}" in callback:
            raise SystemExit("OAuth callback contains an unreviewed nested configuration block")
        callback_direct = direct_scope(callback)
        if re.search(r"\baccess_log\s+[^;]+;", callback_direct):
            raise SystemExit("OAuth callback overrides the reviewed server access-log format")
        callback_error_logs = re.findall(
            r"\berror_log\s+([^;]+);",
            callback_direct,
        )
        if len(callback_error_logs) != 1 \
                or callback_error_logs[0].split() != ["/dev/null", "crit"]:
            raise SystemExit("OAuth callback can expose code/state through the Nginx error log")
        if dangerous.search(callback_direct):
            raise SystemExit("OAuth callback propagates or records query credentials")
        callback_variables = set(
            re.findall(r"\$[A-Za-z_][A-Za-z0-9_]*", callback_direct)
        )
        safe_callback_variables = {
            "$host",
            "$remote_addr",
            "$proxy_add_x_forwarded_for",
            "$scheme",
            "$server_port",
        }
        if not callback_variables <= safe_callback_variables:
            raise SystemExit("OAuth callback uses an unapproved variable that can alias query credentials")
if not managed_servers:
    raise SystemExit("existing Nginx configuration has no managed application server")
PY
}

stage_runtime_configuration() {
  require_root_controlled_directory /etc/systemd
  require_root_controlled_directory /etc/systemd/system
  require_root_controlled_directory /etc/nginx
  require_root_controlled_directory /etc/nginx/sites-available
  require_root_controlled_directory /etc/nginx/sites-enabled
  validate_managed_config_target "$API_UNIT_TARGET"
  validate_managed_config_target "$WEB_UNIT_TARGET"
  validate_managed_config_target "$NGINX_CONFIG_TARGET"
  require_absent_transaction_path "$API_UNIT_CANDIDATE"
  require_absent_transaction_path "$WEB_UNIT_CANDIDATE"
  require_absent_transaction_path "$NGINX_CONFIG_CANDIDATE"
  require_absent_transaction_path "$NGINX_SITE_LINK_TEMP"

  render_service_template \
    "$API_UNIT_STAGE_SOURCE" \
    "$API_UNIT_CANDIDATE"
  render_service_template \
    "$WEB_UNIT_STAGE_SOURCE" \
    "$WEB_UNIT_CANDIDATE"

  INSTALL_NGINX_TEMPLATE=yes
  if sudo test -f "$NGINX_CONFIG_TARGET" \
    && sudo grep -q 'ssl_certificate .*timeline\.all-too-well\.com' "$NGINX_CONFIG_TARGET" \
    && [ "$FORCE_NGINX_TEMPLATE_SYNC" != yes ]; then
    validate_existing_nginx_privacy_config "$NGINX_CONFIG_TARGET"
    INSTALL_NGINX_TEMPLATE=no
    echo nginx_template_sync=skipped_existing_timeline_https
  else
    sudo install -o root -g root -m 0644 \
      "$NGINX_STAGE_SOURCE" \
      "$NGINX_CONFIG_CANDIDATE"
  fi

  if sudo test -e "$NGINX_SITE_LINK" || sudo test -L "$NGINX_SITE_LINK"; then
    sudo "$PYTHON_BIN" -I - "$NGINX_SITE_LINK" "$NGINX_CONFIG_TARGET" <<'PY'
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
  fi
  fsync_remote_directory /etc/systemd/system
  fsync_remote_directory /etc/nginx/sites-available
}

quiesce_runtime_services() {
  if sudo systemctl is-active --quiet feishu-timeline-api.service; then
    API_SERVICE_WAS_ACTIVE=yes
  fi
  if sudo systemctl is-active --quiet feishu-timeline-web.service; then
    WEB_SERVICE_WAS_ACTIVE=yes
  fi
  if sudo systemctl is-enabled --quiet feishu-timeline-api.service; then
    API_SERVICE_WAS_ENABLED=yes
  fi
  if sudo systemctl is-enabled --quiet feishu-timeline-web.service; then
    WEB_SERVICE_WAS_ENABLED=yes
  fi
  SERVICES_QUIESCED=committing
  SERVICES_BOOT_DISABLED=committing
  for runtime_unit in feishu-timeline-api.service feishu-timeline-web.service; do
    if sudo systemctl cat "$runtime_unit" >/dev/null 2>&1; then
      sudo systemctl disable "$runtime_unit"
    fi
  done
  SERVICES_BOOT_DISABLED=yes
  fsync_remote_directory /etc/systemd/system
  if sudo test -d /etc/systemd/system/multi-user.target.wants \
    && ! sudo test -L /etc/systemd/system/multi-user.target.wants; then
    fsync_remote_directory /etc/systemd/system/multi-user.target.wants
  fi
  sudo systemctl stop feishu-timeline-api.service feishu-timeline-web.service || true
  for _ in 1 2 3 4 5; do
    if ! sudo pgrep -u "$API_RUNTIME_USER" >/dev/null 2>&1 \
      && ! sudo pgrep -u "$WEB_RUNTIME_USER" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  ! sudo systemctl is-active --quiet feishu-timeline-api.service \
    && ! sudo systemctl is-active --quiet feishu-timeline-web.service \
    || { echo 'Runtime services remain active after quiescence.' >&2; exit 1; }
  ! sudo pgrep -u "$API_RUNTIME_USER" >/dev/null 2>&1 \
    && ! sudo pgrep -u "$WEB_RUNTIME_USER" >/dev/null 2>&1 \
    || { echo 'Runtime identities still own processes after quiescence.' >&2; exit 1; }
  SERVICES_QUIESCED=yes
}

run_database_migrations() {
  [ "$SERVICES_QUIESCED" = yes ] \
    || { echo 'Database migration requires quiesced runtime services.' >&2; exit 1; }
  if [ "$RUN_PRISMA_MIGRATE_DEPLOY" != yes ]; then
    echo prisma_migrate_deploy=skipped
    return 0
  fi

  MIGRATION_APPLIED=attempted
  sudo runuser -u "$API_RUNTIME_USER" -- env -i HOME=/nonexistent PATH="$PATH" \
    "$PYTHON_BIN" -I "$DOTENV_TOOL_CANDIDATE" exec --profile api "$API_ENV_CANDIDATE" -- \
    /bin/bash -c '
      set -euo pipefail
      api_dir="$1"
      cd -- "$api_dir"
      exec node "$api_dir/node_modules/prisma/build/index.js" \
        migrate deploy --schema prisma/schema.prisma
    ' gce-migrate "$RELEASE_DIR/apps/api"
  MIGRATION_APPLIED=yes
}

snapshot_managed_file() {
  local target="$1"
  local previous="$2"
  local presence_variable="$3"

  require_absent_transaction_path "$previous"
  if sudo test -e "$target" || sudo test -L "$target"; then
    validate_managed_config_target "$target"
    sudo ln -- "$target" "$previous"
    printf -v "$presence_variable" '%s' yes
  fi
}

activate_object_storage_access() {
  [ "$SERVICES_QUIESCED" = yes ] \
    || { echo 'Object-storage access activation requires quiesced runtime services.' >&2; exit 1; }

  OBJECT_STORAGE_METADATA_ACTIVATED=committing
  if [ "$OBJECT_STORAGE_WAS_PRESENT" = yes ]; then
    sudo test -d "$OBJECT_STORAGE_PATH" && ! sudo test -L "$OBJECT_STORAGE_PATH" \
      || { echo 'Object-storage target changed type before activation.' >&2; exit 1; }
    [ "$(sudo stat -c '%d:%i' "$OBJECT_STORAGE_PATH")" = "$PREVIOUS_OBJECT_STORAGE_IDENTITY" ] \
      || { echo 'Object-storage target identity changed before activation.' >&2; exit 1; }
    [ "$(sudo stat -c '%u:%g:%a' "$OBJECT_STORAGE_PATH")" = "$PREVIOUS_OBJECT_STORAGE_METADATA" ] \
      || { echo 'Object-storage ownership metadata changed before activation.' >&2; exit 1; }
    sudo chown "$API_RUNTIME_USER:$API_RUNTIME_GROUP" "$OBJECT_STORAGE_PATH"
    sudo chmod 0750 "$OBJECT_STORAGE_PATH"
    ACTIVE_OBJECT_STORAGE_IDENTITY="$PREVIOUS_OBJECT_STORAGE_IDENTITY"
  else
    ! sudo test -e "$OBJECT_STORAGE_PATH" && ! sudo test -L "$OBJECT_STORAGE_PATH" \
      || { echo 'Object-storage target appeared before activation.' >&2; exit 1; }
    sudo install -d -o "$API_RUNTIME_USER" -g "$API_RUNTIME_GROUP" -m 0750 "$OBJECT_STORAGE_PATH"
    OBJECT_STORAGE_CREATED=yes
    ACTIVE_OBJECT_STORAGE_IDENTITY="$(sudo stat -c '%d:%i' "$OBJECT_STORAGE_PATH")"
    [[ "$ACTIVE_OBJECT_STORAGE_IDENTITY" =~ ^[0-9]+:[0-9]+$ ]] \
      || { echo 'Cannot bind the newly activated object-storage identity.' >&2; exit 1; }
  fi
  [ "$(sudo stat -c '%u:%g:%a' "$OBJECT_STORAGE_PATH")" = "$API_RUNTIME_UID:$API_RUNTIME_GID:750" ] \
    || { echo 'Activated object-storage metadata failed its runtime boundary.' >&2; exit 1; }
  OBJECT_STORAGE_METADATA_ACTIVATED=yes
}

activate_deployment() {
  local resolved_previous_current

  [ "$SERVICES_QUIESCED" = yes ] \
    || { echo 'Deployment activation requires quiesced runtime services.' >&2; exit 1; }
  validate_canonical_env_source "$API_ENV_FILE" "$API_RUNTIME_GID"
  validate_canonical_env_source "$WEB_ENV_FILE" "$WEB_RUNTIME_GID"
  [ "$(sudo stat -c '%u:%g:%a' "$API_ENV_CANDIDATE")" = "0:$API_RUNTIME_GID:640" ]
  [ "$(sudo stat -c '%u:%g:%a' "$WEB_ENV_CANDIDATE")" = "0:$WEB_RUNTIME_GID:640" ]
  [ "$(sudo stat -c '%u:%g:%a' "$DOTENV_TOOL_CANDIDATE")" = '0:0:755' ]

  snapshot_managed_file "$DOTENV_DATA_TOOL" "$PREVIOUS_DOTENV_TOOL" DOTENV_TOOL_WAS_PRESENT
  snapshot_managed_file "$API_ENV_FILE" "$PREVIOUS_API_ENV" API_ENV_WAS_PRESENT
  snapshot_managed_file "$WEB_ENV_FILE" "$PREVIOUS_WEB_ENV" WEB_ENV_WAS_PRESENT
  snapshot_managed_file "$API_UNIT_TARGET" "$PREVIOUS_API_UNIT" API_UNIT_WAS_PRESENT
  snapshot_managed_file "$WEB_UNIT_TARGET" "$PREVIOUS_WEB_UNIT" WEB_UNIT_WAS_PRESENT
  if [ "$INSTALL_NGINX_TEMPLATE" = yes ]; then
    snapshot_managed_file \
      "$NGINX_CONFIG_TARGET" "$PREVIOUS_NGINX_CONFIG" NGINX_CONFIG_WAS_PRESENT
  fi
  if sudo test -L "$APP_ROOT/current"; then
    PREVIOUS_CURRENT_TARGET="$(sudo readlink "$APP_ROOT/current")"
    resolved_previous_current="$(sudo readlink -f "$APP_ROOT/current" 2>/dev/null || true)"
    [[ "$resolved_previous_current" =~ ^/opt/feishu_timeline_app/releases/[0-9a-f]{40}$ ]] \
      || { echo 'Current release pointer escaped the immutable release root during activation.' >&2; exit 1; }
    CURRENT_WAS_PRESENT=yes
  elif sudo test -e "$APP_ROOT/current"; then
    echo 'Current release pointer is not a symlink.' >&2
    exit 1
  fi
  fsync_remote_directory "$DOTENV_TOOL_DIR"
  fsync_remote_directory /etc/feishu-timeline
  fsync_remote_directory /etc/systemd/system
  fsync_remote_directory /etc/nginx/sites-available

  DOTENV_TOOL_ACTIVATED=committing
  sudo mv -Tf -- "$DOTENV_TOOL_CANDIDATE" "$DOTENV_DATA_TOOL"
  DOTENV_TOOL_ACTIVATED=yes
  API_ENV_ACTIVATED=committing
  sudo mv -Tf -- "$API_ENV_CANDIDATE" "$API_ENV_FILE"
  API_ENV_ACTIVATED=yes
  WEB_ENV_ACTIVATED=committing
  sudo mv -Tf -- "$WEB_ENV_CANDIDATE" "$WEB_ENV_FILE"
  WEB_ENV_ACTIVATED=yes
  CURRENT_ACTIVATED=committing
  sudo mv -Tf -- "$CURRENT_LINK_TEMP" "$APP_ROOT/current"
  CURRENT_ACTIVATED=yes
  API_UNIT_ACTIVATED=committing
  sudo mv -Tf -- "$API_UNIT_CANDIDATE" "$API_UNIT_TARGET"
  API_UNIT_ACTIVATED=yes
  WEB_UNIT_ACTIVATED=committing
  sudo mv -Tf -- "$WEB_UNIT_CANDIDATE" "$WEB_UNIT_TARGET"
  WEB_UNIT_ACTIVATED=yes
  if [ "$INSTALL_NGINX_TEMPLATE" = yes ]; then
    NGINX_CONFIG_ACTIVATED=committing
    sudo mv -Tf -- "$NGINX_CONFIG_CANDIDATE" "$NGINX_CONFIG_TARGET"
    NGINX_CONFIG_ACTIVATED=yes
  fi
  if ! sudo test -e "$NGINX_SITE_LINK" && ! sudo test -L "$NGINX_SITE_LINK"; then
    NGINX_SITE_LINK_CREATED=committing
    sudo ln -s "$NGINX_CONFIG_TARGET" "$NGINX_SITE_LINK_TEMP"
    sudo mv -Tf -- "$NGINX_SITE_LINK_TEMP" "$NGINX_SITE_LINK"
    NGINX_SITE_LINK_CREATED=yes
  fi

  fsync_remote_directory "$DOTENV_TOOL_DIR"
  fsync_remote_directory /etc/feishu-timeline
  fsync_remote_directory "$APP_ROOT"
  fsync_remote_directory /etc/systemd/system
  fsync_remote_directory /etc/nginx/sites-available
  fsync_remote_directory /etc/nginx/sites-enabled
  sudo "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" validate --profile api "$API_ENV_FILE"
  sudo "$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" validate --profile web "$WEB_ENV_FILE"
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-30}"
  local sleep_seconds="${4:-2}"

  for attempt in $(seq 1 "$attempts"); do
    if curl -fsSI --max-time 5 "$url" >/dev/null; then
      printf 'ready_%s=ok attempt=%s\n' "$label" "$attempt"
      return 0
    fi
    printf 'waiting_%s attempt=%s\n' "$label" "$attempt"
    sleep "$sleep_seconds"
  done

  printf 'ready_%s=timeout\n' "$label" >&2
  return 1
}

wait_for_host_http() {
  local url="$1"
  local host="$2"
  local label="$3"
  local attempts="${4:-30}"
  local sleep_seconds="${5:-2}"

  for attempt in $(seq 1 "$attempts"); do
    if curl -fsSI --max-time 5 -H "Host: $host" "$url" >/dev/null; then
      printf 'ready_%s=ok attempt=%s\n' "$label" "$attempt"
      return 0
    fi
    printf 'waiting_%s attempt=%s\n' "$label" "$attempt"
    sleep "$sleep_seconds"
  done

  printf 'ready_%s=timeout\n' "$label" >&2
  return 1
}

verify_runtime_metadata() {
  local url="$1"
  local expected_service="$2"
  local host_header="${3:-}"

  if [ -n "$host_header" ]; then
    curl -fsS --max-time 5 -H "Host: $host_header" "$url"
  else
    curl -fsS --max-time 5 "$url"
  fi | "$PYTHON_BIN" -I -c '
import json
import sys

payload_bytes = sys.stdin.buffer.read(65537)
if len(payload_bytes) > 65536:
    raise SystemExit("runtime metadata response exceeded 64 KiB")
try:
    payload = json.loads(payload_bytes)
except (UnicodeDecodeError, json.JSONDecodeError) as error:
    raise SystemExit("runtime metadata response was not valid JSON") from error
expected_commit, expected_build_time, expected_release, expected_service = sys.argv[1:]
expected = {
    "runtimeCommit": expected_commit,
    "buildTime": expected_build_time,
    "release": expected_release,
    "service": expected_service,
}
for key, value in expected.items():
    if payload.get(key) != value:
        raise SystemExit(f"runtime metadata mismatch: {key}")
' "$runtime_commit" "$build_time" "$release" "$expected_service"
}

start_and_verify_deployment() {
  [ "$CURRENT_ACTIVATED" = yes ] \
    || { echo 'Refusing to start services before runtime activation.' >&2; exit 1; }
  sudo systemctl daemon-reload
  sudo systemctl restart feishu-timeline-api
  sudo systemctl restart feishu-timeline-web

  wait_for_http http://127.0.0.1:3000 web_local
  wait_for_http http://127.0.0.1:3001/api/health api_local
  verify_runtime_metadata \
    http://127.0.0.1:3000/build-info feishu-timeline-web
  verify_runtime_metadata \
    http://127.0.0.1:3001/api/health feishu-timeline-api

  sudo /usr/sbin/nginx -t
  sudo systemctl restart nginx

  wait_for_host_http http://127.0.0.1/ "$APP_HOST" web_nginx
  wait_for_host_http http://127.0.0.1/api/health "$APP_HOST" api_nginx
  verify_runtime_metadata \
    http://127.0.0.1/build-info feishu-timeline-web "$APP_HOST"
  verify_runtime_metadata \
    http://127.0.0.1/api/health feishu-timeline-api "$APP_HOST"
  printf 'api_service_state=%s\n' "$(systemctl is-active feishu-timeline-api.service)"
  printf 'web_service_state=%s\n' "$(systemctl is-active feishu-timeline-web.service)"
  printf 'nginx_service_state=%s\n' "$(systemctl is-active nginx.service)"
}

finalize_deployment() {
  local rollback_file

  [ "$RUNTIME_TRANSACTION_GUARD_COMMITTED" = yes ] \
    || { echo 'Refusing to finalize before the runtime crash guard commit.' >&2; exit 1; }
  for rollback_file in \
    "$PREVIOUS_DOTENV_TOOL" "$PREVIOUS_API_ENV" "$PREVIOUS_WEB_ENV" \
    "$PREVIOUS_API_UNIT" "$PREVIOUS_WEB_UNIT" "$PREVIOUS_NGINX_CONFIG"; do
    [ -n "$rollback_file" ] \
      && sudo rm -f -- "$rollback_file" \
      || true
  done
  fsync_remote_directory "$DOTENV_TOOL_DIR" \
    || echo 'Committed deployment; dotenv tool directory fsync requires review.' >&2
  fsync_remote_directory /etc/feishu-timeline \
    || echo 'Committed deployment; canonical env directory fsync requires review.' >&2
  fsync_remote_directory /etc/systemd/system \
    || echo 'Committed deployment; systemd directory fsync requires review.' >&2
  fsync_remote_directory /etc/nginx/sites-available \
    || echo 'Committed deployment; Nginx directory fsync requires review.' >&2
  printf 'deployment_commit=complete runtime_commit=%s release=%s build_time=%s\n' \
    "$runtime_commit" "$release" "$build_time"
}

quiesce_and_freeze_build_tree
stage_privileged_dotenv_tool
reopen_build_tree_for_builder
stage_runtime_environment
build_application
stage_immutable_release
stage_runtime_configuration
quiesce_runtime_services
arm_runtime_transaction_guard
run_database_migrations
activate_object_storage_access
activate_deployment
start_and_verify_deployment
commit_runtime_transaction_guard
finalize_deployment
REMOTE_SCRIPT_EOF

chmod 0700 "$REMOTE_SCRIPT"
gce_run_remote_script_with_args \
  "$REMOTE_SCRIPT" \
  "$APP_ROOT" \
  "$REPO_URL" \
  "$GIT_REF" \
  "$APP_HOST" \
  "$PUBLIC_APP_URL" \
  "$FEISHU_CALLBACK_PATH" \
  "$OAUTH_PROVIDER" \
  "$FEISHU_AUTHORIZATION_ENDPOINT" \
  "$REMOTE_USER" \
  "$RUN_PRISMA_MIGRATE_DEPLOY" \
  "$FORCE_NGINX_TEMPLATE_SYNC"
