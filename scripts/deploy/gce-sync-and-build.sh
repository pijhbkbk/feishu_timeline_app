#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"
GIT_REF="${GIT_REF:-main}"
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

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
API_TEMPLATE="$ROOT_DIR/deploy/systemd/feishu-timeline-api.service"
WEB_TEMPLATE="$ROOT_DIR/deploy/systemd/feishu-timeline-web.service"
NGINX_TEMPLATE="$ROOT_DIR/deploy/nginx/feishu-timeline.conf"

# shellcheck source=scripts/deploy/gce-common.sh
. "$ROOT_DIR/scripts/deploy/gce-common.sh"

validate_sync_inputs() {
  validate_gce_connection_parameters

  if [ "${#APP_ROOT}" -gt 256 ] \
    || [[ ! "$APP_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] \
    || [[ "$APP_ROOT" =~ (^|/)\.\.?(/|$) ]]; then
    fail 'APP_ROOT must be an absolute normalized path containing only safe path characters.'
  fi
  if [ "${#GIT_REF}" -gt 255 ] \
    || [[ ! "$GIT_REF" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] \
    || [[ "$GIT_REF" =~ (^|/)\.\.?(/|$) ]] \
    || [[ "$GIT_REF" == *..* ]]; then
    fail 'GIT_REF must be a safe branch or tag name.'
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

render_b64() {
  local template="$1"
  local remote_user="$2"
  sed "s/__APP_USER__/${remote_user}/g" "$template" | base64 | tr -d '\n'
}

validate_sync_inputs
REMOTE_USER="$(gce_ssh 'id -un')"
if [[ ! "$REMOTE_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
  fail 'Remote user is not a safe POSIX account name.'
fi
API_SERVICE_B64="$(render_b64 "$API_TEMPLATE" "$REMOTE_USER")"
WEB_SERVICE_B64="$(render_b64 "$WEB_TEMPLATE" "$REMOTE_USER")"
NGINX_B64="$(base64 <"$NGINX_TEMPLATE" | tr -d '\n')"

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
API_SERVICE_B64="${12}"
WEB_SERVICE_B64="${13}"
NGINX_B64="${14}"
export APP_ROOT REPO_URL GIT_REF APP_HOST PUBLIC_APP_URL FEISHU_CALLBACK_PATH
export OAUTH_PROVIDER FEISHU_AUTHORIZATION_ENDPOINT REMOTE_USER
export RUN_PRISMA_MIGRATE_DEPLOY FORCE_NGINX_TEMPLATE_SYNC
export PATH=/usr/local/bin:/usr/bin:/bin
export HOME=/home/$REMOTE_USER
export COREPACK_HOME=/home/$REMOTE_USER/.cache/node/corepack

mkdir -p "$HOME/.cache/node/corepack"
corepack prepare pnpm@9.15.4 --activate >/dev/null 2>&1 || true

sudo mkdir -p "$APP_ROOT"
sudo chown -R "$REMOTE_USER:$REMOTE_USER" "$APP_ROOT"

if [ ! -d "$APP_ROOT/.git" ]; then
  git -C "$APP_ROOT" init
  if ! git -C "$APP_ROOT" remote get-url origin >/dev/null 2>&1; then
    git -C "$APP_ROOT" remote add origin "$REPO_URL"
  fi
  git -C "$APP_ROOT" fetch --depth 1 origin "$GIT_REF"
  git -C "$APP_ROOT" reset --hard FETCH_HEAD
else
  git -C "$APP_ROOT" fetch --all
  git -C "$APP_ROOT" reset --hard "origin/$GIT_REF"
fi

cd "$APP_ROOT"

runtime_commit="$(git rev-parse HEAD)"
build_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
release="r26-admin-${runtime_commit:0:12}"

ensure_env_file() {
  local file="$1"
  local example="$2"
  if [ -f "$file" ]; then
    printf 'env_exists=%s\n' "$file"
    grep -E '^[A-Z0-9_]+=' "$file" | cut -d= -f1 | sed 's/^/env_key=/'
    return 0
  fi

  cp "$example" "$file"
  printf '# Generated on %s for Step 4 GCE bootstrap\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$file"
  printf '# TODO: replace placeholder DATABASE_URL/REDIS_URL/FEISHU_* values before production cutover.\n' >>"$file"
}

upsert_env() {
  local file="$1"
  local key="$2"
  local value="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

ensure_env_file apps/api/.env.production apps/api/.env.example
ensure_env_file apps/web/.env.production apps/web/.env.example
chmod 600 apps/api/.env.production apps/web/.env.production

upsert_env apps/api/.env.production NODE_ENV production
upsert_env apps/api/.env.production DEPLOYMENT_ENV production
upsert_env apps/api/.env.production RUNTIME_COMMIT "$runtime_commit"
upsert_env apps/api/.env.production BUILD_TIME "$build_time"
upsert_env apps/api/.env.production RELEASE "$release"
upsert_env apps/api/.env.production HOST 127.0.0.1
upsert_env apps/api/.env.production PORT 3001
upsert_env apps/api/.env.production FRONTEND_URL "$PUBLIC_APP_URL"
upsert_env apps/api/.env.production FEISHU_REDIRECT_URI "${PUBLIC_APP_URL}${FEISHU_CALLBACK_PATH}"
upsert_env apps/api/.env.production OAUTH_PROVIDER "$OAUTH_PROVIDER"
upsert_env apps/api/.env.production FEISHU_AUTHORIZATION_ENDPOINT "$FEISHU_AUTHORIZATION_ENDPOINT"
upsert_env apps/api/.env.production AUTH_MOCK_ENABLED false
upsert_env apps/api/.env.production OBJECT_STORAGE_LOCAL_ROOT /opt/feishu_timeline_app/var/object-storage
upsert_env apps/api/.env.production UI_VERSION v2
upsert_env apps/web/.env.production NEXT_PUBLIC_API_BASE_URL /api
upsert_env apps/web/.env.production RUNTIME_COMMIT "$runtime_commit"
upsert_env apps/web/.env.production BUILD_TIME "$build_time"
upsert_env apps/web/.env.production RELEASE "$release"
upsert_env apps/web/.env.production NEXT_PUBLIC_ENABLE_MOCK_LOGIN false
upsert_env apps/web/.env.production NEXT_PUBLIC_UI_VERSION v2
upsert_env apps/web/.env.production NEXT_PUBLIC_UI_DATA_MODE real
upsert_env apps/web/.env.production V1_FALLBACK_ENABLED true
sed -i '/^NEXT_PUBLIC_FEISHU_APP_ID=/d' apps/web/.env.production
sed -i '/^NEXT_PUBLIC_R26_V2_PROTOTYPE=/d' apps/web/.env.production
sed -i '/^NEXT_PUBLIC_R26_V2_DATA_MODE=/d' apps/web/.env.production

resolved_storage_path="$(
  cd apps/api
  (
    set +u
    set -a
    . ./.env.production
    set +a
    set -u
    node -e 'const { resolve } = require("node:path"); process.stdout.write(resolve(process.cwd(), process.env.OBJECT_STORAGE_LOCAL_ROOT || "var/object-storage"));'
  )
)"
printf 'resolved_object_storage=%s\n' "$resolved_storage_path"
[ "$resolved_storage_path" = "/opt/feishu_timeline_app/var/object-storage" ]
mkdir -p /opt/feishu_timeline_app/var/object-storage

rm -rf apps/api/dist apps/web/.next

pnpm install --frozen-lockfile
pnpm build

cd apps/api
(
  set +u
  set -a
  . ./.env.production
  set +a
  set -u
  pnpm exec prisma validate --schema prisma/schema.prisma
)
cd "$APP_ROOT"

if [ "$RUN_PRISMA_MIGRATE_DEPLOY" = yes ]; then
  cd apps/api
  (
    set +u
    set -a
    . ./.env.production
    set +a
    set -u
    pnpm exec prisma migrate deploy --schema prisma/schema.prisma
  )
  cd "$APP_ROOT"
else
  echo prisma_migrate_deploy=skipped
fi

printf '%s' "$API_SERVICE_B64" | base64 -d | sudo tee /etc/systemd/system/feishu-timeline-api.service >/dev/null
printf '%s' "$WEB_SERVICE_B64" | base64 -d | sudo tee /etc/systemd/system/feishu-timeline-web.service >/dev/null

install_nginx_template=yes
if [ -f /etc/nginx/sites-available/feishu-timeline ] && grep -q 'ssl_certificate .*timeline\.all-too-well\.com' /etc/nginx/sites-available/feishu-timeline; then
  if [ "$FORCE_NGINX_TEMPLATE_SYNC" != yes ]; then
    install_nginx_template=no
    echo nginx_template_sync=skipped_existing_timeline_https
  fi
fi

if [ "$install_nginx_template" = yes ]; then
  printf '%s' "$NGINX_B64" | base64 -d | sudo tee /etc/nginx/sites-available/feishu-timeline >/dev/null
fi

if [ ! -L /etc/nginx/sites-enabled/feishu-timeline ]; then
  sudo ln -s /etc/nginx/sites-available/feishu-timeline /etc/nginx/sites-enabled/feishu-timeline
fi

sudo systemctl daemon-reload
sudo systemctl enable feishu-timeline-api
sudo systemctl enable feishu-timeline-web
sudo systemctl restart feishu-timeline-api
sudo systemctl restart feishu-timeline-web

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

wait_for_http http://127.0.0.1:3000 web_local
wait_for_http http://127.0.0.1:3001/api/health api_local

sudo nginx -t
sudo systemctl restart nginx

wait_for_host_http http://127.0.0.1/ "$APP_HOST" web_nginx
wait_for_host_http http://127.0.0.1/api/health "$APP_HOST" api_nginx

systemctl status feishu-timeline-api --no-pager -l | sed -n '1,60p'
echo '---'
systemctl status feishu-timeline-web --no-pager -l | sed -n '1,60p'
echo '---'
curl -I http://127.0.0.1:3000 || true
echo '---'
curl -I http://127.0.0.1:3001/api/health || true
echo '---'
curl -I -H "Host: $APP_HOST" http://127.0.0.1/ || true
echo '---'
curl -I -H "Host: $APP_HOST" http://127.0.0.1/api/health || true
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
  "$FORCE_NGINX_TEMPLATE_SYNC" \
  "$API_SERVICE_B64" \
  "$WEB_SERVICE_B64" \
  "$NGINX_B64"
