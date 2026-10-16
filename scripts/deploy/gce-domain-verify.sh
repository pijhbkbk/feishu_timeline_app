#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
REGION="${REGION:-${ZONE%-*}}"
APP_HOST="${APP_HOST:-timeline.all-too-well.com}"
ROOT_DOMAIN="${ROOT_DOMAIN:-all-too-well.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.${ROOT_DOMAIN}}"

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=scripts/deploy/gce-common.sh
. "$ROOT_DIR/scripts/deploy/gce-common.sh"

validate_gce_connection_parameters
if [ "${#REGION}" -gt 63 ] \
  || [[ ! "$REGION" =~ ^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  fail 'REGION must be a safe lowercase Google Cloud region name.'
fi
for domain in "$APP_HOST" "$ROOT_DOMAIN" "$WWW_DOMAIN"; do
  if [ "${#domain}" -gt 253 ] \
    || [[ ! "$domain" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] \
    || [[ "$domain" != *.* ]]; then
    fail 'All configured domains must be valid DNS hostnames.'
  fi
done

query_public_dns() {
  local domain="$1"
  if ! command -v dig >/dev/null 2>&1; then
    return 0
  fi
  {
    printf 'resolver=1.1.1.1 domain=%s\n' "$domain"
    dig @1.1.1.1 +short "$domain" A
    printf 'resolver=8.8.8.8 domain=%s\n' "$domain"
    dig @8.8.8.8 +short "$domain" A
  } | awk 'NF'
}

PUBLIC_IP="$(gcloud compute instances describe "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"
[ "${#PUBLIC_IP}" -le 45 ] && [[ "$PUBLIC_IP" =~ ^[0-9A-Fa-f:.]+$ ]] \
  || fail 'gcloud returned an invalid public IP address.'
STATIC_IP_NAME="$(gcloud compute addresses list --project="$PROJECT" --regions="$REGION" --filter="address=$PUBLIC_IP" --format='value(name)' | head -n1)"
if [ -n "$STATIC_IP_NAME" ] \
  && { [ "${#STATIC_IP_NAME}" -gt 63 ] \
    || [[ ! "$STATIC_IP_NAME" =~ ^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; }; then
  fail 'gcloud returned an invalid static address name.'
fi

log "gcloud config"
gcloud config list --format='text(core.account,core.project)'
echo
log "instance"
gcloud compute instances describe "$INSTANCE" --project="$PROJECT" --zone="$ZONE" \
  --format='yaml(name,status,zone,tags,networkInterfaces)'
echo
log "static address"
if [ -n "$STATIC_IP_NAME" ]; then
  gcloud compute addresses describe "$STATIC_IP_NAME" --project="$PROJECT" --region="$REGION"
else
  echo "no static address binding found for $PUBLIC_IP"
fi
echo
log "firewall"
gcloud compute firewall-rules list --project="$PROJECT" \
  --format='table(name,network,direction,sourceRanges.list():label=SRC,targetTags.list():label=TAGS,allowed[].map().firewall_rule().list():label=ALLOW,disabled)' \
  | sed -n '1,120p'
echo
log "public dns"
for domain in "$ROOT_DOMAIN" "$WWW_DOMAIN" "$APP_HOST"; do
  echo "--- $domain ---"
  query_public_dns "$domain"
done
echo
log "nameservers"
if command -v dig >/dev/null 2>&1; then
  dig @1.1.1.1 +short NS "$ROOT_DOMAIN"
fi
echo
log "remote nginx and services"
REMOTE_SCRIPT="$(mktemp /tmp/r27a-gce-domain-verify-remote.XXXXXX)"
trap 'rm -f -- "$REMOTE_SCRIPT"' EXIT
cat >"$REMOTE_SCRIPT" <<'REMOTESCRIPTEOF'
#!/usr/bin/env bash
set -euo pipefail
ROOT_DOMAIN="$1"
WWW_DOMAIN="$2"
APP_HOST="$3"
echo '--- nginx test ---'
sudo nginx -t
echo '--- enabled sites ---'
ls -l /etc/nginx/sites-enabled
echo '--- services ---'
systemctl is-active feishu-timeline-api
systemctl is-active feishu-timeline-web
systemctl is-active nginx
echo '--- local host probes ---'
curl -I --max-time 5 -H "Host: $ROOT_DOMAIN" http://127.0.0.1 || true
echo '---'
curl -I --max-time 5 -H "Host: $WWW_DOMAIN" http://127.0.0.1 || true
echo '---'
curl -I --max-time 5 -H "Host: $APP_HOST" http://127.0.0.1 || true
echo '--- certbot ---'
command -v certbot || true
systemctl status certbot.timer --no-pager -l || true
systemctl list-timers --all | grep -i certbot || true
REMOTESCRIPTEOF
chmod 0700 "$REMOTE_SCRIPT"
gce_run_remote_script_with_args "$REMOTE_SCRIPT" "$ROOT_DOMAIN" "$WWW_DOMAIN" "$APP_HOST"
echo
log "direct origin probes"
python3 - "$PUBLIC_IP" "$ROOT_DOMAIN" "$WWW_DOMAIN" "$APP_HOST" <<'PY'
import socket
import sys
public_ip = sys.argv[1]
hosts = sys.argv[2:]
for host in hosts:
    print(f"--- direct http origin probe host={host} ip={public_ip} ---")
    try:
        sock = socket.create_connection((public_ip, 80), timeout=5)
        req = f"HEAD / HTTP/1.1\\r\\nHost: {host}\\r\\nConnection: close\\r\\n\\r\\n"
        sock.sendall(req.encode())
        data = b""
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
            if b"\\r\\n\\r\\n" in data:
                break
        sock.close()
        header = data.decode("iso-8859-1", "replace").split("\\r\\n\\r\\n")[0]
        print(header if header else "<empty response>")
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}")
PY
