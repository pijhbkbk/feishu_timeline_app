#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"
ROOT_DOMAIN="${ROOT_DOMAIN:-all-too-well.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.${ROOT_DOMAIN}}"
APP_HOST="${APP_HOST:-timeline.all-too-well.com}"
PUBLIC_APP_URL="${PUBLIC_APP_URL:-https://${APP_HOST}}"
FEISHU_CALLBACK_PATH="${FEISHU_CALLBACK_PATH:-/login/callback}"
EXPECTED_FEISHU_REDIRECT_URI="${EXPECTED_FEISHU_REDIRECT_URI:-${PUBLIC_APP_URL}${FEISHU_CALLBACK_PATH}}"
FEISHU_AUTHORIZATION_ENDPOINT="${FEISHU_AUTHORIZATION_ENDPOINT:-https://open.feishu.cn/open-apis/authen/v1/index}"
PLACEHOLDER_DIR="${PLACEHOLDER_DIR:-/var/www/all-too-well-placeholder}"
INSTALL_CERTBOT="${INSTALL_CERTBOT:-auto}"

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

ssh_gce() {
  gcloud compute ssh "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --command "$1"
}

query_public_dns() {
  local domain="$1"
  if ! command -v dig >/dev/null 2>&1; then
    return 0
  fi
  {
    dig @1.1.1.1 +short "$domain" A
    dig @8.8.8.8 +short "$domain" A
  } | awk 'NF' | sort -u
}

answers_include_ip() {
  local answers="$1"
  local ip="$2"
  printf '%s\n' "$answers" | awk 'NF' | grep -Fx "$ip" >/dev/null 2>&1
}

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TIMELINE_BOOTSTRAP_TEMPLATE="$ROOT_DIR/deploy/nginx/feishu-timeline.conf"
[ -f "$TIMELINE_BOOTSTRAP_TEMPLATE" ] || fail "Missing $TIMELINE_BOOTSTRAP_TEMPLATE"

PUBLIC_IP="$(gcloud compute instances describe "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"
ROOT_DNS="$(query_public_dns "$ROOT_DOMAIN")"
WWW_DNS="$(query_public_dns "$WWW_DOMAIN")"
APP_DNS="$(query_public_dns "$APP_HOST")"

log "Public IP: $PUBLIC_IP"
log "Root DNS answers:"
printf '%s\n' "${ROOT_DNS:-<none>}"
log "WWW DNS answers:"
printf '%s\n' "${WWW_DNS:-<none>}"
log "Timeline DNS answers:"
printf '%s\n' "${APP_DNS:-<none>}"

answers_include_ip "$ROOT_DNS" "$PUBLIC_IP" || fail "$ROOT_DOMAIN does not resolve directly to $PUBLIC_IP"
answers_include_ip "$WWW_DNS" "$PUBLIC_IP" || fail "$WWW_DOMAIN does not resolve directly to $PUBLIC_IP"
answers_include_ip "$APP_DNS" "$PUBLIC_IP" || fail "$APP_HOST does not resolve directly to $PUBLIC_IP"

FINAL_ROOT_CONF_B64="$(
  cat <<EOF | base64 | tr -d '\n'
server {
    listen 80;
    listen [::]:80;
    server_name ${WWW_DOMAIN};

    return 301 https://${ROOT_DOMAIN}\$request_uri;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${ROOT_DOMAIN};

    return 301 https://${ROOT_DOMAIN}\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${WWW_DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${ROOT_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${ROOT_DOMAIN}/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;

    return 301 https://${ROOT_DOMAIN}\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${ROOT_DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${ROOT_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${ROOT_DOMAIN}/privkey.pem;

    access_log /var/log/nginx/${ROOT_DOMAIN}.access.log;
    error_log /var/log/nginx/${ROOT_DOMAIN}.error.log warn;

    root ${PLACEHOLDER_DIR};
    index index.html;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    location / {
        try_files \$uri \$uri/ /index.html =404;
    }
}
EOF
)"

FINAL_TIMELINE_CONF_B64="$(
  cat <<EOF | base64 | tr -d '\n'
server {
    listen 80;
    listen [::]:80;
    server_name ${APP_HOST};

    return 301 https://${APP_HOST}\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${APP_HOST};

    ssl_certificate /etc/letsencrypt/live/${APP_HOST}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${APP_HOST}/privkey.pem;

    access_log /var/log/nginx/feishu-timeline.access.log;
    error_log /var/log/nginx/feishu-timeline.error.log warn;

    client_max_body_size 20m;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    proxy_hide_header X-Powered-By;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
EOF
)"

log "Applying post-cutover hardening on $INSTANCE"
ssh_gce "set -euo pipefail
backup_dir=\"/var/backups/feishu-timeline-step6/\$(date -u +%Y%m%dT%H%M%SZ)\"
sudo mkdir -p \"\$backup_dir\"

backup_if_exists() {
  local source=\"\$1\"
  local target=\"\$2\"
  if [ -e \"\$source\" ]; then
    sudo cp -a \"\$source\" \"\$backup_dir/\$target\"
  fi
}

backup_if_exists /etc/nginx/sites-available/feishu-timeline feishu-timeline.conf.bak
backup_if_exists /etc/nginx/sites-available/all-too-well-root all-too-well-root.conf.bak
backup_if_exists $APP_ROOT/apps/api/.env.production api.env.production.bak
backup_if_exists $APP_ROOT/apps/web/.env.production web.env.production.bak
backup_if_exists /etc/systemd/system/feishu-timeline-api.service feishu-timeline-api.service.bak
backup_if_exists /etc/systemd/system/feishu-timeline-web.service feishu-timeline-web.service.bak

upsert_env() {
  local file=\"\$1\"
  local key=\"\$2\"
  local value=\"\$3\"
  if grep -q \"^\${key}=\" \"\$file\"; then
    sudo sed -i \"s#^\${key}=.*#\${key}=\${value}#\" \"\$file\"
  else
    printf '%s=%s\n' \"\$key\" \"\$value\" | sudo tee -a \"\$file\" >/dev/null
  fi
}

sudo test -f $APP_ROOT/apps/api/.env.production
sudo test -f $APP_ROOT/apps/web/.env.production
sudo mkdir -p '$PLACEHOLDER_DIR'
upsert_env $APP_ROOT/apps/api/.env.production FRONTEND_URL '$PUBLIC_APP_URL'
upsert_env $APP_ROOT/apps/api/.env.production FEISHU_REDIRECT_URI '$EXPECTED_FEISHU_REDIRECT_URI'
upsert_env $APP_ROOT/apps/api/.env.production FEISHU_AUTHORIZATION_ENDPOINT '$FEISHU_AUTHORIZATION_ENDPOINT'
upsert_env $APP_ROOT/apps/api/.env.production AUTH_MOCK_ENABLED false
upsert_env $APP_ROOT/apps/web/.env.production NEXT_PUBLIC_API_BASE_URL /api
upsert_env $APP_ROOT/apps/web/.env.production NEXT_PUBLIC_ENABLE_MOCK_LOGIN false

if ! command -v certbot >/dev/null 2>&1; then
  if [ '$INSTALL_CERTBOT' = 'no' ]; then
    echo certbot_install=skipped
  else
    sudo apt-get update
    sudo apt-get install -y certbot python3-certbot-nginx
  fi
fi

if ! sudo certbot certificates >/dev/null 2>&1; then
  echo 'Existing certbot account not found and no non-interactive registration path is configured.' >&2
  exit 1
fi

if ! sudo certbot certificates 2>/dev/null | grep -F 'Domains: $APP_HOST' >/dev/null 2>&1; then
  sudo certbot --nginx --non-interactive --agree-tos --redirect -d '$APP_HOST'
else
  echo timeline_certificate=already_present
fi

sudo test -f /etc/letsencrypt/live/$APP_HOST/fullchain.pem
sudo test -f /etc/letsencrypt/live/$APP_HOST/privkey.pem
sudo test -f /etc/letsencrypt/live/$ROOT_DOMAIN/fullchain.pem
sudo test -f /etc/letsencrypt/live/$ROOT_DOMAIN/privkey.pem

sudo rm -f /etc/nginx/conf.d/10-security-hardening.conf
sudo python3 - <<'PY'
from pathlib import Path

path = Path('/etc/nginx/nginx.conf')
text = path.read_text()
lines = text.splitlines()
result = []
inserted_session_cache = False
inserted_session_timeout = False
inserted_session_tickets = False

for line in lines:
    stripped = line.strip()
    if stripped.startswith('# server_tokens') or stripped.startswith('server_tokens '):
        result.append('\tserver_tokens off;')
        continue
    if stripped.startswith('ssl_protocols '):
        result.append('\tssl_protocols TLSv1.2 TLSv1.3;')
        continue
    if stripped.startswith('ssl_prefer_server_ciphers '):
        result.append('\tssl_prefer_server_ciphers off;')
        result.append('\tssl_session_cache shared:SSL:10m;')
        result.append('\tssl_session_timeout 1d;')
        result.append('\tssl_session_tickets off;')
        inserted_session_cache = True
        inserted_session_timeout = True
        inserted_session_tickets = True
        continue
    if stripped.startswith('ssl_session_cache '):
        if not inserted_session_cache:
            result.append('\tssl_session_cache shared:SSL:10m;')
            inserted_session_cache = True
        continue
    if stripped.startswith('ssl_session_timeout '):
        if not inserted_session_timeout:
            result.append('\tssl_session_timeout 1d;')
            inserted_session_timeout = True
        continue
    if stripped.startswith('ssl_session_tickets '):
        if not inserted_session_tickets:
            result.append('\tssl_session_tickets off;')
            inserted_session_tickets = True
        continue
    result.append(line)

if not inserted_session_cache:
    for idx, line in enumerate(result):
        if line.strip().startswith('ssl_prefer_server_ciphers '):
            result[idx + 1:idx + 1] = ['\tssl_session_cache shared:SSL:10m;']
            inserted_session_cache = True
            break

if not inserted_session_timeout:
    for idx, line in enumerate(result):
        if line.strip().startswith('ssl_prefer_server_ciphers '):
            result[idx + 1:idx + 1] = ['\tssl_session_timeout 1d;']
            inserted_session_timeout = True
            break

if not inserted_session_tickets:
    for idx, line in enumerate(result):
        if line.strip().startswith('ssl_prefer_server_ciphers '):
            result[idx + 1:idx + 1] = ['\tssl_session_tickets off;']
            inserted_session_tickets = True
            break

path.write_text('\n'.join(result) + '\n')
PY

printf '%s' '$FINAL_TIMELINE_CONF_B64' | base64 -d | sudo tee /etc/nginx/sites-available/feishu-timeline >/dev/null
printf '%s' '$FINAL_ROOT_CONF_B64' | base64 -d | sudo tee /etc/nginx/sites-available/all-too-well-root >/dev/null

sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart feishu-timeline-api

curl -fsSI --max-time 10 --resolve '$ROOT_DOMAIN:443:127.0.0.1' https://$ROOT_DOMAIN/ >/dev/null
curl -fsSI --max-time 10 --resolve '$APP_HOST:443:127.0.0.1' https://$APP_HOST/ >/dev/null

echo backup_dir=\$backup_dir
sudo certbot certificates | sed -n '1,120p'
"
