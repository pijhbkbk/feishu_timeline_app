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
FEISHU_AUTHORIZATION_ENDPOINT="${FEISHU_AUTHORIZATION_ENDPOINT:-https://open.feishu.cn/open-apis/authen/v1/index}"
RUN_PRISMA_MIGRATE_DEPLOY="${RUN_PRISMA_MIGRATE_DEPLOY:-no}"
FORCE_NGINX_TEMPLATE_SYNC="${FORCE_NGINX_TEMPLATE_SYNC:-no}"

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
API_TEMPLATE="$ROOT_DIR/deploy/systemd/feishu-timeline-api.service"
WEB_TEMPLATE="$ROOT_DIR/deploy/systemd/feishu-timeline-web.service"
NGINX_TEMPLATE="$ROOT_DIR/deploy/nginx/feishu-timeline.conf"

log() {
  printf '[INFO] %s\n' "$*"
}

fail() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

ssh_gce() {
  gcloud compute ssh "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --command "$1"
}

render_b64() {
  local template="$1"
  local remote_user="$2"
  sed "s/__APP_USER__/${remote_user}/g" "$template" | base64 | tr -d '\n'
}

REMOTE_USER="$(ssh_gce 'whoami')"
API_SERVICE_B64="$(render_b64 "$API_TEMPLATE" "$REMOTE_USER")"
WEB_SERVICE_B64="$(render_b64 "$WEB_TEMPLATE" "$REMOTE_USER")"
NGINX_B64="$(base64 <"$NGINX_TEMPLATE" | tr -d '\n')"

log "Remote user: $REMOTE_USER"
log "Repo URL: $REPO_URL"

ssh_gce "set -euo pipefail
export APP_ROOT='$APP_ROOT'
export REPO_URL='$REPO_URL'
export GIT_REF='$GIT_REF'
export APP_HOST='$APP_HOST'
export PUBLIC_APP_URL='$PUBLIC_APP_URL'
export FEISHU_CALLBACK_PATH='$FEISHU_CALLBACK_PATH'
export FEISHU_AUTHORIZATION_ENDPOINT='$FEISHU_AUTHORIZATION_ENDPOINT'
export REMOTE_USER='$REMOTE_USER'
export RUN_PRISMA_MIGRATE_DEPLOY='$RUN_PRISMA_MIGRATE_DEPLOY'
export FORCE_NGINX_TEMPLATE_SYNC='$FORCE_NGINX_TEMPLATE_SYNC'
export PATH=/usr/local/bin:/usr/bin:/bin
export HOME=/home/$REMOTE_USER
export COREPACK_HOME=/home/$REMOTE_USER/.cache/node/corepack

mkdir -p \"\$HOME/.cache/node/corepack\"
corepack prepare pnpm@9.15.4 --activate >/dev/null 2>&1 || true

sudo mkdir -p \"\$APP_ROOT\"
sudo chown -R \"\$REMOTE_USER:\$REMOTE_USER\" \"\$APP_ROOT\"

if [ ! -d \"\$APP_ROOT/.git\" ]; then
  git -C \"\$APP_ROOT\" init
  if ! git -C \"\$APP_ROOT\" remote get-url origin >/dev/null 2>&1; then
    git -C \"\$APP_ROOT\" remote add origin \"\$REPO_URL\"
  fi
  git -C \"\$APP_ROOT\" fetch --depth 1 origin \"\$GIT_REF\"
  git -C \"\$APP_ROOT\" reset --hard FETCH_HEAD
else
  git -C \"\$APP_ROOT\" fetch --all
  git -C \"\$APP_ROOT\" reset --hard \"origin/\$GIT_REF\"
fi

cd \"\$APP_ROOT\"

ensure_env_file() {
  local file=\"\$1\"
  local example=\"\$2\"
  if [ -f \"\$file\" ]; then
    printf 'env_exists=%s\n' \"\$file\"
    grep -E '^[A-Z0-9_]+=' \"\$file\" | cut -d= -f1 | sed 's/^/env_key=/'
    return 0
  fi

  cp \"\$example\" \"\$file\"
  printf '# Generated on %s for Step 4 GCE bootstrap\n' \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" >>\"\$file\"
  printf '# TODO: replace placeholder DATABASE_URL/REDIS_URL/FEISHU_* values before production cutover.\n' >>\"\$file\"
}

upsert_env() {
  local file=\"\$1\"
  local key=\"\$2\"
  local value=\"\$3\"
  if grep -q \"^\${key}=\" \"\$file\"; then
    sed -i \"s#^\${key}=.*#\${key}=\${value}#\" \"\$file\"
  else
    printf '%s=%s\n' \"\$key\" \"\$value\" >>\"\$file\"
  fi
}

ensure_env_file apps/api/.env.production apps/api/.env.example
ensure_env_file apps/web/.env.production apps/web/.env.example

upsert_env apps/api/.env.production NODE_ENV production
upsert_env apps/api/.env.production HOST 127.0.0.1
upsert_env apps/api/.env.production PORT 3001
upsert_env apps/api/.env.production FRONTEND_URL \"\$PUBLIC_APP_URL\"
upsert_env apps/api/.env.production FEISHU_REDIRECT_URI \"\${PUBLIC_APP_URL}\${FEISHU_CALLBACK_PATH}\"
upsert_env apps/api/.env.production FEISHU_AUTHORIZATION_ENDPOINT \"\$FEISHU_AUTHORIZATION_ENDPOINT\"
upsert_env apps/api/.env.production AUTH_MOCK_ENABLED false
upsert_env apps/api/.env.production OBJECT_STORAGE_LOCAL_ROOT /opt/feishu_timeline_app/var/object-storage
upsert_env apps/web/.env.production NEXT_PUBLIC_API_BASE_URL /api
upsert_env apps/web/.env.production NEXT_PUBLIC_ENABLE_MOCK_LOGIN false

resolved_storage_path=\"\$(
  cd apps/api
  (
    set +u
    set -a
    . ./.env.production
    set +a
    set -u
    node -e 'const { resolve } = require(\"node:path\"); process.stdout.write(resolve(process.cwd(), process.env.OBJECT_STORAGE_LOCAL_ROOT || \"var/object-storage\"));'
  )
)\"
printf 'resolved_object_storage=%s\n' \"\$resolved_storage_path\"
[ \"\$resolved_storage_path\" = \"/opt/feishu_timeline_app/var/object-storage\" ]
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
cd \"\$APP_ROOT\"

if [ \"\$RUN_PRISMA_MIGRATE_DEPLOY\" = yes ]; then
  cd apps/api
  (
    set +u
    set -a
    . ./.env.production
    set +a
    set -u
    pnpm exec prisma migrate deploy --schema prisma/schema.prisma
  )
  cd \"\$APP_ROOT\"
else
  echo prisma_migrate_deploy=skipped
fi

printf '%s' '$API_SERVICE_B64' | base64 -d | sudo tee /etc/systemd/system/feishu-timeline-api.service >/dev/null
printf '%s' '$WEB_SERVICE_B64' | base64 -d | sudo tee /etc/systemd/system/feishu-timeline-web.service >/dev/null

install_nginx_template=yes
if [ -f /etc/nginx/sites-available/feishu-timeline ] && grep -q 'ssl_certificate .*timeline\\.all-too-well\\.com' /etc/nginx/sites-available/feishu-timeline; then
  if [ \"\$FORCE_NGINX_TEMPLATE_SYNC\" != yes ]; then
    install_nginx_template=no
    echo nginx_template_sync=skipped_existing_timeline_https
  fi
fi

if [ \"\$install_nginx_template\" = yes ]; then
  printf '%s' '$NGINX_B64' | base64 -d | sudo tee /etc/nginx/sites-available/feishu-timeline >/dev/null
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
  local url=\"\$1\"
  local label=\"\$2\"
  local attempts=\"\${3:-30}\"
  local sleep_seconds=\"\${4:-2}\"

  for attempt in \$(seq 1 \"\$attempts\"); do
    if curl -fsSI --max-time 5 \"\$url\" >/dev/null; then
      printf 'ready_%s=ok attempt=%s\n' \"\$label\" \"\$attempt\"
      return 0
    fi
    printf 'waiting_%s attempt=%s\n' \"\$label\" \"\$attempt\"
    sleep \"\$sleep_seconds\"
  done

  printf 'ready_%s=timeout\n' \"\$label\" >&2
  return 1
}

wait_for_host_http() {
  local url=\"\$1\"
  local host=\"\$2\"
  local label=\"\$3\"
  local attempts=\"\${4:-30}\"
  local sleep_seconds=\"\${5:-2}\"

  for attempt in \$(seq 1 \"\$attempts\"); do
    if curl -fsSI --max-time 5 -H \"Host: \$host\" \"\$url\" >/dev/null; then
      printf 'ready_%s=ok attempt=%s\n' \"\$label\" \"\$attempt\"
      return 0
    fi
    printf 'waiting_%s attempt=%s\n' \"\$label\" \"\$attempt\"
    sleep \"\$sleep_seconds\"
  done

  printf 'ready_%s=timeout\n' \"\$label\" >&2
  return 1
}

wait_for_http http://127.0.0.1:3000 web_local
wait_for_http http://127.0.0.1:3001/api/health api_local

sudo nginx -t
sudo systemctl restart nginx

wait_for_host_http http://127.0.0.1/ \"\$APP_HOST\" web_nginx
wait_for_host_http http://127.0.0.1/api/health \"\$APP_HOST\" api_nginx

systemctl status feishu-timeline-api --no-pager -l | sed -n '1,60p'
echo '---'
systemctl status feishu-timeline-web --no-pager -l | sed -n '1,60p'
echo '---'
curl -I http://127.0.0.1:3000 || true
echo '---'
curl -I http://127.0.0.1:3001/api/health || true
echo '---'
curl -I -H \"Host: \$APP_HOST\" http://127.0.0.1/ || true
echo '---'
curl -I -H \"Host: \$APP_HOST\" http://127.0.0.1/api/health || true
"
