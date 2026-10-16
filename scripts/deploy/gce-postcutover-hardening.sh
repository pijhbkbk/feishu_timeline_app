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
OAUTH_PROVIDER="feishu-cn"
FEISHU_AUTHORIZATION_ENDPOINT="https://accounts.feishu.cn/open-apis/authen/v1/index"
PLACEHOLDER_DIR="${PLACEHOLDER_DIR:-/var/www/all-too-well-placeholder}"
INSTALL_CERTBOT="${INSTALL_CERTBOT:-auto}"

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
# shellcheck source=scripts/deploy/gce-common.sh
. "$ROOT_DIR/scripts/deploy/gce-common.sh"
validate_gce_connection_parameters
for domain in "$APP_HOST" "$ROOT_DOMAIN" "$WWW_DOMAIN"; do
  if [ "${#domain}" -gt 253 ] \
    || [[ ! "$domain" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] \
    || [[ "$domain" != *.* ]]; then
    fail 'All configured domains must be valid DNS hostnames.'
  fi
done
for path in "$APP_ROOT" "$PLACEHOLDER_DIR"; do
  if [ "${#path}" -gt 256 ] \
    || [[ ! "$path" =~ ^/[A-Za-z0-9._/-]+$ ]] \
    || [[ "$path" =~ (^|/)\.\.?(/|$) ]]; then
    fail 'Configured application paths must be absolute and normalized.'
  fi
done
if [ "$PUBLIC_APP_URL" != "https://$APP_HOST" ]; then
  fail 'PUBLIC_APP_URL must be the HTTPS origin derived from APP_HOST.'
fi
if [ "${#FEISHU_CALLBACK_PATH}" -gt 512 ] \
  || [[ ! "$FEISHU_CALLBACK_PATH" =~ ^/[A-Za-z0-9._~/-]+$ ]] \
  || [[ "$FEISHU_CALLBACK_PATH" == //* ]] \
  || [[ "$FEISHU_CALLBACK_PATH" =~ (^|/)\.\.?(/|$) ]]; then
  fail 'FEISHU_CALLBACK_PATH must be a normalized absolute URL path.'
fi
if [ "$EXPECTED_FEISHU_REDIRECT_URI" != "${PUBLIC_APP_URL}${FEISHU_CALLBACK_PATH}" ]; then
  fail 'EXPECTED_FEISHU_REDIRECT_URI must match the configured origin and callback path.'
fi
case "$INSTALL_CERTBOT" in auto|yes|no) ;; *) fail 'INSTALL_CERTBOT must be auto, yes or no.' ;; esac
TIMELINE_BOOTSTRAP_TEMPLATE="$ROOT_DIR/deploy/nginx/feishu-timeline.conf"
[ -f "$TIMELINE_BOOTSTRAP_TEMPLATE" ] || fail "Missing $TIMELINE_BOOTSTRAP_TEMPLATE"

PUBLIC_IP="$(gcloud compute instances describe "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"
[ "${#PUBLIC_IP}" -le 45 ] && [[ "$PUBLIC_IP" =~ ^[0-9A-Fa-f:.]+$ ]] \
  || fail 'gcloud returned an invalid public IP address.'
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
log_format all_too_well_no_args '\$remote_addr - \$remote_user [\$time_local] '
                                '"\$request_method \$uri \$server_protocol" \$status \$body_bytes_sent '
                                '"\$http_user_agent"';

server {
    listen 80;
    listen [::]:80;
    server_name ${WWW_DOMAIN};

    access_log /var/log/nginx/${ROOT_DOMAIN}.access.log all_too_well_no_args;
    return 301 https://${ROOT_DOMAIN}\$uri;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${ROOT_DOMAIN};

    access_log /var/log/nginx/${ROOT_DOMAIN}.access.log all_too_well_no_args;
    return 301 https://${ROOT_DOMAIN}\$uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${WWW_DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${ROOT_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${ROOT_DOMAIN}/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;

    access_log /var/log/nginx/${ROOT_DOMAIN}.access.log all_too_well_no_args;
    return 301 https://${ROOT_DOMAIN}\$uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${ROOT_DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${ROOT_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${ROOT_DOMAIN}/privkey.pem;

    access_log /var/log/nginx/${ROOT_DOMAIN}.access.log all_too_well_no_args;
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
log_format feishu_timeline_no_args '\$remote_addr - \$remote_user [\$time_local] '
                                   '"\$request_method \$uri \$server_protocol" \$status \$body_bytes_sent '
                                   '"\$http_user_agent"';

map \$http_content_type \$feishu_timeline_upload_client {
    default "";
    "~*^multipart/form-data(?:;|\$)" \$binary_remote_addr;
}
limit_conn_zone \$feishu_timeline_upload_client zone=feishu_timeline_api_conn:10m;
limit_req_zone \$feishu_timeline_upload_client zone=feishu_timeline_api_rate:10m rate=30r/s;
limit_conn_zone \$binary_remote_addr zone=feishu_timeline_download_conn:10m;
limit_req_zone \$binary_remote_addr zone=feishu_timeline_download_rate:10m rate=6r/s;

server {
    listen 80;
    listen [::]:80;
    server_name ${APP_HOST};

    access_log /var/log/nginx/feishu-timeline.access.log feishu_timeline_no_args;

    location = ${FEISHU_CALLBACK_PATH} {
        error_log /dev/null crit;
        return 308 https://${APP_HOST}${FEISHU_CALLBACK_PATH};
    }

    return 301 https://${APP_HOST}\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${APP_HOST};

    ssl_certificate /etc/letsencrypt/live/${APP_HOST}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${APP_HOST}/privkey.pem;

    access_log /var/log/nginx/feishu-timeline.access.log feishu_timeline_no_args;
    error_log /var/log/nginx/feishu-timeline.error.log warn;

    client_max_body_size 21m;
    client_body_timeout 15s;
    error_page 429 = @api_ingress_limited;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    proxy_hide_header X-Powered-By;

    location = ${FEISHU_CALLBACK_PATH} {
        error_log /dev/null crit;
        proxy_pass http://127.0.0.1:3000;
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

    location ~* ^/api/(?:attachments/[A-Za-z0-9_-]+/content|projects/[A-Za-z0-9_-]+/attachments/[A-Za-z0-9_-]+/download|v2/tasks/[A-Za-z0-9_-]+/materials/[A-Za-z0-9_-]+/content)/?\$ {
        limit_conn_status 429;
        limit_req_status 429;
        limit_conn feishu_timeline_download_conn 4;
        limit_req zone=feishu_timeline_download_rate burst=8 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_buffering off;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        send_timeout 30s;
        proxy_ignore_client_abort off;
    }

    location /api/ {
        limit_conn_status 429;
        limit_req_status 429;
        limit_conn feishu_timeline_api_conn 20;
        limit_req zone=feishu_timeline_api_rate burst=60 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_request_buffering off;
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

    location @api_ingress_limited {
        add_header Retry-After "1" always;
        return 429;
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
REMOTE_SCRIPT="$(mktemp /tmp/r27a-gce-postcutover-remote.XXXXXX)"
trap 'rm -f -- "$REMOTE_SCRIPT"' EXIT
cat >"$REMOTE_SCRIPT" <<'REMOTE_SCRIPT_EOF'
#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="$1"
ROOT_DOMAIN="$2"
WWW_DOMAIN="$3"
APP_HOST="$4"
PUBLIC_APP_URL="$5"
EXPECTED_FEISHU_REDIRECT_URI="$6"
OAUTH_PROVIDER="$7"
FEISHU_AUTHORIZATION_ENDPOINT="$8"
PLACEHOLDER_DIR="$9"
INSTALL_CERTBOT="${10}"
FINAL_TIMELINE_CONF_B64="${11}"
FINAL_ROOT_CONF_B64="${12}"
DOTENV_DATA_TOOL=/usr/local/libexec/feishu-timeline/dotenv-data
API_ENV_FILE=/etc/feishu-timeline/api.env
WEB_ENV_FILE=/etc/feishu-timeline/web.env
backup_dir="/var/backups/feishu-timeline-step6/$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -o root -g root -m 0700 "$backup_dir"

backup_if_exists() {
  local source="$1"
  local target="$2"
  if [ -e "$source" ]; then
    sudo test -f "$source"
    sudo test ! -L "$source"
    sudo test ! -e "$backup_dir/$target"
    sudo test ! -L "$backup_dir/$target"
    sudo install -o root -g root -m 0600 "$source" "$backup_dir/$target"
  fi
}

backup_if_exists /etc/nginx/sites-available/feishu-timeline feishu-timeline.conf.bak
backup_if_exists /etc/nginx/sites-available/all-too-well-root all-too-well-root.conf.bak
backup_if_exists "$API_ENV_FILE" api.env.production.bak
backup_if_exists "$WEB_ENV_FILE" web.env.production.bak
backup_if_exists /etc/systemd/system/feishu-timeline-api.service feishu-timeline-api.service.bak
backup_if_exists /etc/systemd/system/feishu-timeline-web.service feishu-timeline-web.service.bak

rewrite_managed_env() {
  local profile="$1"
  local file="$2"
  local file_gid
  shift 2

  sudo /usr/bin/python3 -I "$DOTENV_DATA_TOOL" validate --profile "$profile" "$file"
  [ "$(sudo stat -c '%u' "$file")" = 0 ] \
    || { echo "Managed env is not root-owned: $file" >&2; exit 1; }
  case "$(sudo stat -c '%a' "$file")" in
    440|640) ;;
    *) echo "Managed env has unsafe mode: $file" >&2; exit 1 ;;
  esac
  file_gid="$(sudo stat -c '%g' "$file")"
  sudo /usr/bin/python3 -I "$DOTENV_DATA_TOOL" rewrite \
    --profile "$profile" \
    --source "$file" \
    --target "$file" \
    --uid 0 \
    --gid "$file_gid" \
    --mode 0640 \
    --require-secure-parent \
    "$@"
}

sudo test -f "$API_ENV_FILE"
sudo test -f "$WEB_ENV_FILE"
sudo mkdir -p "$PLACEHOLDER_DIR"
rewrite_managed_env api "$API_ENV_FILE" \
  --set "FRONTEND_URL=$PUBLIC_APP_URL" \
  --set "DEPLOYMENT_ENV=production" \
  --set "FEISHU_REDIRECT_URI=$EXPECTED_FEISHU_REDIRECT_URI" \
  --set "OAUTH_PROVIDER=$OAUTH_PROVIDER" \
  --set "FEISHU_AUTHORIZATION_ENDPOINT=$FEISHU_AUTHORIZATION_ENDPOINT" \
  --set "AUTH_MOCK_ENABLED=false"
rewrite_managed_env web "$WEB_ENV_FILE" \
  --set "NEXT_PUBLIC_API_BASE_URL=/api" \
  --set "NEXT_PUBLIC_ENABLE_MOCK_LOGIN=false" \
  --delete NEXT_PUBLIC_FEISHU_APP_ID

if ! command -v certbot >/dev/null 2>&1; then
  if [ "$INSTALL_CERTBOT" = no ]; then
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

if ! sudo certbot certificates 2>/dev/null | grep -F "Domains: $APP_HOST" >/dev/null 2>&1; then
  sudo certbot --nginx --non-interactive --agree-tos --redirect -d "$APP_HOST"
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

printf '%s' "$FINAL_TIMELINE_CONF_B64" | base64 -d | sudo tee /etc/nginx/sites-available/feishu-timeline >/dev/null
printf '%s' "$FINAL_ROOT_CONF_B64" | base64 -d | sudo tee /etc/nginx/sites-available/all-too-well-root >/dev/null

sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart feishu-timeline-api

curl -fsSI --max-time 10 --resolve "$ROOT_DOMAIN:443:127.0.0.1" "https://$ROOT_DOMAIN/" >/dev/null
curl -fsSI --max-time 10 --resolve "$APP_HOST:443:127.0.0.1" "https://$APP_HOST/" >/dev/null

echo backup_dir=$backup_dir
sudo certbot certificates | sed -n '1,120p'
REMOTE_SCRIPT_EOF
chmod 0700 "$REMOTE_SCRIPT"
gce_run_remote_script_with_args \
  "$REMOTE_SCRIPT" \
  "$APP_ROOT" "$ROOT_DOMAIN" "$WWW_DOMAIN" "$APP_HOST" "$PUBLIC_APP_URL" \
  "$EXPECTED_FEISHU_REDIRECT_URI" "$OAUTH_PROVIDER" "$FEISHU_AUTHORIZATION_ENDPOINT" \
  "$PLACEHOLDER_DIR" "$INSTALL_CERTBOT" "$FINAL_TIMELINE_CONF_B64" "$FINAL_ROOT_CONF_B64"
