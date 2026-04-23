#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
APP_HOST="${APP_HOST:-timeline.all-too-well.com}"
ROOT_DOMAIN="${ROOT_DOMAIN:-all-too-well.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.${ROOT_DOMAIN}}"
APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"

log() {
  printf '[INFO] %s\n' "$*"
}

ssh_gce() {
  gcloud compute ssh "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --command "$1"
}

query_dns() {
  local domain="$1"
  for resolver in 1.1.1.1 8.8.8.8; do
    printf 'resolver=%s domain=%s\n' "$resolver" "$domain"
    dig @"$resolver" +short "$domain" A || true
  done
}

PUBLIC_IP="$(gcloud compute instances describe "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"

log "Public IP: $PUBLIC_IP"
for domain in "$ROOT_DOMAIN" "$WWW_DOMAIN" "$APP_HOST"; do
  echo "--- dns $domain ---"
  query_dns "$domain"
done

for url in \
  "http://${ROOT_DOMAIN}" \
  "https://${ROOT_DOMAIN}" \
  "http://${WWW_DOMAIN}" \
  "https://${WWW_DOMAIN}" \
  "http://${APP_HOST}" \
  "https://${APP_HOST}"
do
  echo "--- curl ${url} ---"
  curl -k -I -L --max-redirs 5 --max-time 15 -o /dev/null -s \
    -w 'code=%{http_code} url=%{url_effective}\n' "$url" || true
done

for domain in "$ROOT_DOMAIN" "$APP_HOST"; do
  echo "--- cert ${domain} ---"
  openssl s_client -connect "${domain}:443" -servername "$domain" </dev/null 2>/dev/null | \
    openssl x509 -noout -subject -issuer -ext subjectAltName || true
done

log "Remote verification"
ssh_gce "set -euo pipefail
echo '--- systemd ---'
systemctl is-active feishu-timeline-api
systemctl is-active feishu-timeline-web
systemctl is-active nginx
systemctl is-active postgresql || true
systemctl is-active redis-server || true
echo '--- nginx ---'
sudo nginx -t
echo '--- postgres ---'
pg_isready -h localhost -p 5432 || true
echo '--- redis ---'
redis-cli ping || true
echo '--- local backend ---'
curl -I --max-time 5 http://127.0.0.1:3000 || true
echo '---'
curl -I --max-time 5 http://127.0.0.1:3001/api/health || true
echo '---'
curl --max-time 5 http://127.0.0.1:3001/api/auth/session || true
echo '---'
curl --max-time 5 http://127.0.0.1:3001/api/auth/feishu/login-url || true
echo '--- origin https probes ---'
curl -k -I --max-time 10 --resolve '$ROOT_DOMAIN:443:127.0.0.1' https://$ROOT_DOMAIN/ || true
echo '---'
curl -k -I --max-time 10 --resolve '$WWW_DOMAIN:443:127.0.0.1' https://$WWW_DOMAIN/ || true
echo '---'
curl -k -I --max-time 10 --resolve '$APP_HOST:443:127.0.0.1' https://$APP_HOST/ || true
echo '--- env ---'
python3 - <<'PY'
from pathlib import Path
import shlex
keys = {
    Path('$APP_ROOT/apps/api/.env.production'): [
        'FRONTEND_URL',
        'FEISHU_REDIRECT_URI',
        'FEISHU_AUTHORIZATION_ENDPOINT',
        'AUTH_MOCK_ENABLED',
        'FEISHU_APP_ID',
        'FEISHU_APP_SECRET',
        'DATABASE_URL',
        'REDIS_URL',
    ],
    Path('$APP_ROOT/apps/web/.env.production'): ['NEXT_PUBLIC_API_BASE_URL', 'NEXT_PUBLIC_FEISHU_APP_ID', 'NEXT_PUBLIC_ENABLE_MOCK_LOGIN'],
}
for path, names in keys.items():
    print(f'[{path}]')
    if not path.exists():
      print('missing')
      continue
    data = {}
    for line in path.read_text().splitlines():
      s = line.strip()
      if not s or s.startswith('#') or '=' not in s:
        continue
      k, v = s.split('=', 1)
      try:
        parsed = shlex.split(v)
        data[k] = parsed[0] if parsed else ''
      except ValueError:
        data[k] = v
    for name in names:
      value = data.get(name, '')
      if value:
        if name in {'FRONTEND_URL', 'FEISHU_REDIRECT_URI', 'FEISHU_AUTHORIZATION_ENDPOINT', 'AUTH_MOCK_ENABLED', 'NEXT_PUBLIC_API_BASE_URL', 'NEXT_PUBLIC_ENABLE_MOCK_LOGIN'}:
          print(f'{name}=<set:{value}>')
        elif name in {'FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'NEXT_PUBLIC_FEISHU_APP_ID'} and value in {'your_feishu_app_id', 'your_feishu_app_secret'}:
          print(f'{name}=<placeholder>')
        else:
          print(f'{name}=<set>')
      else:
        print(f'{name}=<missing>')
    print()
PY
echo '--- certbot ---'
sudo certbot certificates | sed -n '1,120p'
echo '--- recent api log warnings ---'
journalctl -u feishu-timeline-api -n 120 --no-pager | grep -E 'ECONNREFUSED|WARN|ERROR' || true
"
