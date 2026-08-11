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
APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"
PLACEHOLDER_DIR="${PLACEHOLDER_DIR:-/var/www/all-too-well-placeholder}"
STATIC_IP_NAME="${STATIC_IP_NAME:-all-too-well-us-west1-ip}"
WEB_TAG="${WEB_TAG:-all-too-well-web}"
RESERVE_STATIC_IP="${RESERVE_STATIC_IP:-yes}"
INSTALL_CERTBOT="${INSTALL_CERTBOT:-auto}"
FORCE_CERTBOT="${FORCE_CERTBOT:-no}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TIMELINE_TEMPLATE="$ROOT_DIR/deploy/nginx/feishu-timeline.conf"
ROOT_TEMPLATE="$ROOT_DIR/deploy/nginx/all-too-well.com.placeholder.conf"

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
for path in "$APP_ROOT" "$PLACEHOLDER_DIR"; do
  if [ "${#path}" -gt 256 ] \
    || [[ ! "$path" =~ ^/[A-Za-z0-9._/-]+$ ]] \
    || [[ "$path" =~ (^|/)\.\.?(/|$) ]]; then
    fail 'Configured application paths must be absolute and normalized.'
  fi
done
for resource_name in "$STATIC_IP_NAME" "$WEB_TAG"; do
  if [ "${#resource_name}" -gt 63 ] \
    || [[ ! "$resource_name" =~ ^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    fail 'Google Cloud resource names must be safe lowercase RFC 1035 names.'
  fi
done
case "$RESERVE_STATIC_IP" in yes|no) ;; *) fail 'RESERVE_STATIC_IP must be yes or no.' ;; esac
case "$INSTALL_CERTBOT" in auto|yes|no) ;; *) fail 'INSTALL_CERTBOT must be auto, yes or no.' ;; esac
case "$FORCE_CERTBOT" in yes|no) ;; *) fail 'FORCE_CERTBOT must be yes or no.' ;; esac
if [ -n "$CERTBOT_EMAIL" ] \
  && { [ "${#CERTBOT_EMAIL}" -gt 254 ] \
    || [[ ! "$CERTBOT_EMAIL" =~ ^[A-Za-z0-9.!#$%\&\'*+/=?^_\`{|}~-]+@[A-Za-z0-9.-]+$ ]]; }; then
  fail 'CERTBOT_EMAIL contains invalid characters.'
fi

require_file() {
  local file="$1"
  [ -f "$file" ] || fail "Missing required file: $file"
}

contains_csv_value() {
  local csv="$1"
  local needle="$2"
  printf '%s\n' "$csv" | tr ',;' '\n' | awk 'NF' | grep -Fx "$needle" >/dev/null 2>&1
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

placeholder_html() {
  cat <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>all-too-well.com</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: linear-gradient(135deg, #f7f4ef, #efe7db);
        color: #1f2937;
      }
      main {
        max-width: 720px;
        padding: 32px;
        text-align: center;
      }
      h1 { margin-bottom: 12px; font-size: 42px; }
      p { margin: 8px 0; line-height: 1.6; }
      a { color: #1d4ed8; }
    </style>
  </head>
  <body>
    <main>
      <h1>all-too-well.com</h1>
      <p>This root domain is reserved for the future portal and navigation page.</p>
      <p>The current Feishu timeline project is deployed separately at <a href="https://timeline.all-too-well.com">timeline.all-too-well.com</a>.</p>
    </main>
  </body>
</html>
EOF
}

require_file "$TIMELINE_TEMPLATE"
require_file "$ROOT_TEMPLATE"

TIMELINE_B64="$(base64 <"$TIMELINE_TEMPLATE" | tr -d '\n')"
ROOT_B64="$(base64 <"$ROOT_TEMPLATE" | tr -d '\n')"
PLACEHOLDER_HTML_B64="$(placeholder_html | base64 | tr -d '\n')"

PUBLIC_IP="$(gcloud compute instances describe "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"
NETWORK_TIER="$(gcloud compute instances describe "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].networkTier)')"
NETWORK_URL="$(gcloud compute instances describe "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --format='get(networkInterfaces[0].network)')"
NETWORK="${NETWORK_URL##*/}"
[ "${#PUBLIC_IP}" -le 45 ] && [[ "$PUBLIC_IP" =~ ^[0-9A-Fa-f:.]+$ ]] \
  || fail 'gcloud returned an invalid public IP address.'
case "$NETWORK_TIER" in PREMIUM|STANDARD) ;; *) fail 'gcloud returned an invalid network tier.' ;; esac
if [ "${#NETWORK}" -gt 63 ] \
  || [[ ! "$NETWORK" =~ ^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  fail 'gcloud returned an invalid network name.'
fi
CURRENT_TAGS="$(gcloud compute instances describe "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --format='csv[no-heading](tags.items)' || true)"
STATIC_IP_BINDING="$(
  gcloud compute addresses list \
    --project="$PROJECT" \
    --format='csv[no-heading](name,address,region.basename())' | \
    awk -F, -v ip="$PUBLIC_IP" -v region="$REGION" '$2 == ip && $3 == region { print $1; exit }'
)"
if [ -n "$STATIC_IP_BINDING" ] \
  && { [ "${#STATIC_IP_BINDING}" -gt 63 ] \
    || [[ ! "$STATIC_IP_BINDING" =~ ^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; }; then
  fail 'gcloud returned an invalid static address binding name.'
fi

log "Instance: $INSTANCE"
log "Project: $PROJECT"
log "Zone: $ZONE"
log "Region: $REGION"
log "Public IP: $PUBLIC_IP"
log "Network: $NETWORK"
log "Network tier: $NETWORK_TIER"
log "Current tags: ${CURRENT_TAGS:-<none>}"

if [ -z "$STATIC_IP_BINDING" ]; then
  if [ "$RESERVE_STATIC_IP" = "yes" ]; then
    log "Reserving current external IP as static address: $STATIC_IP_NAME"
    gcloud compute addresses create "$STATIC_IP_NAME" \
      --project="$PROJECT" \
      --region="$REGION" \
      --network-tier="$NETWORK_TIER" \
      --addresses="$PUBLIC_IP"
    STATIC_IP_BINDING="$STATIC_IP_NAME"
  else
    warn "Current external IP is ephemeral and RESERVE_STATIC_IP is not enabled."
  fi
else
  log "Static IP binding already exists: $STATIC_IP_BINDING"
fi

MISSING_TAGS=()
for required_tag in http-server https-server; do
  if ! contains_csv_value "$CURRENT_TAGS" "$required_tag"; then
    MISSING_TAGS+=("$required_tag")
  fi
done

if [ "${#MISSING_TAGS[@]}" -gt 0 ]; then
  log "Adding missing instance tags: ${MISSING_TAGS[*]}"
  gcloud compute instances add-tags "$INSTANCE" \
    --project="$PROJECT" \
    --zone="$ZONE" \
    --tags="$(IFS=,; echo "${MISSING_TAGS[*]}")"
  CURRENT_TAGS="$(gcloud compute instances describe "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --format='csv[no-heading](tags.items)' || true)"
fi

FIREWALL_RULES="$(
  gcloud compute firewall-rules list \
    --project="$PROJECT" \
    --format='csv[no-heading](name,network.basename(),direction,targetTags.list(),allowed[].map().firewall_rule().list(),disabled)'
)"

if ! printf '%s\n' "$FIREWALL_RULES" | grep ",$NETWORK," | grep ',INGRESS,' | grep 'http-server' | grep 'tcp:80' | grep ',False$' >/dev/null 2>&1; then
  warn "No existing tcp:80 firewall rule found for tag http-server. Creating targeted rule on tag $WEB_TAG."
  if ! contains_csv_value "$CURRENT_TAGS" "$WEB_TAG"; then
    gcloud compute instances add-tags "$INSTANCE" \
      --project="$PROJECT" \
      --zone="$ZONE" \
      --tags="$WEB_TAG"
  fi
  gcloud compute firewall-rules describe "allow-$WEB_TAG-http" --project="$PROJECT" >/dev/null 2>&1 || \
    gcloud compute firewall-rules create "allow-$WEB_TAG-http" \
      --project="$PROJECT" \
      --network="$NETWORK" \
      --direction=INGRESS \
      --priority=1000 \
      --action=ALLOW \
      --rules=tcp:80 \
      --source-ranges=0.0.0.0/0 \
      --target-tags="$WEB_TAG"
fi

if ! printf '%s\n' "$FIREWALL_RULES" | grep ",$NETWORK," | grep ',INGRESS,' | grep 'https-server' | grep 'tcp:443' | grep ',False$' >/dev/null 2>&1; then
  warn "No existing tcp:443 firewall rule found for tag https-server. Creating targeted rule on tag $WEB_TAG."
  if ! contains_csv_value "$CURRENT_TAGS" "$WEB_TAG"; then
    gcloud compute instances add-tags "$INSTANCE" \
      --project="$PROJECT" \
      --zone="$ZONE" \
      --tags="$WEB_TAG"
  fi
  gcloud compute firewall-rules describe "allow-$WEB_TAG-https" --project="$PROJECT" >/dev/null 2>&1 || \
    gcloud compute firewall-rules create "allow-$WEB_TAG-https" \
      --project="$PROJECT" \
      --network="$NETWORK" \
      --direction=INGRESS \
      --priority=1000 \
      --action=ALLOW \
      --rules=tcp:443 \
      --source-ranges=0.0.0.0/0 \
      --target-tags="$WEB_TAG"
fi

ROOT_DNS_ANSWERS="$(query_public_dns "$ROOT_DOMAIN")"
WWW_DNS_ANSWERS="$(query_public_dns "$WWW_DOMAIN")"
APP_DNS_ANSWERS="$(query_public_dns "$APP_HOST")"

log "Public DNS A answers for $ROOT_DOMAIN:"
printf '%s\n' "${ROOT_DNS_ANSWERS:-<none>}"
log "Public DNS A answers for $WWW_DOMAIN:"
printf '%s\n' "${WWW_DNS_ANSWERS:-<none>}"
log "Public DNS A answers for $APP_HOST:"
printf '%s\n' "${APP_DNS_ANSWERS:-<none>}"

ROOT_DIRECT_TO_ORIGIN=no
WWW_DIRECT_TO_ORIGIN=no
if answers_include_ip "$ROOT_DNS_ANSWERS" "$PUBLIC_IP"; then
  ROOT_DIRECT_TO_ORIGIN=yes
fi
if answers_include_ip "$WWW_DNS_ANSWERS" "$PUBLIC_IP"; then
  WWW_DIRECT_TO_ORIGIN=yes
fi

REMOTE_CONFIGURE_SCRIPT="$(mktemp /tmp/r27a-gce-network-configure.XXXXXX)"
REMOTE_CERTBOT_SCRIPT="$(mktemp /tmp/r27a-gce-network-certbot.XXXXXX)"
cleanup_remote_scripts() {
  rm -f -- "$REMOTE_CONFIGURE_SCRIPT" "$REMOTE_CERTBOT_SCRIPT"
}
trap cleanup_remote_scripts EXIT

cat >"$REMOTE_CONFIGURE_SCRIPT" <<'REMOTE_CONFIGURE_EOF'
#!/usr/bin/env bash
set -euo pipefail
PLACEHOLDER_DIR="$1"
PLACEHOLDER_HTML_B64="$2"
TIMELINE_B64="$3"
ROOT_B64="$4"
ROOT_DOMAIN="$5"
WWW_DOMAIN="$6"
APP_HOST="$7"
backup_dir="/var/backups/feishu-timeline-step5/$(date -u +%Y%m%dT%H%M%SZ)"
sudo mkdir -p "$backup_dir"

if [ -f /etc/nginx/sites-available/feishu-timeline ]; then
  sudo cp /etc/nginx/sites-available/feishu-timeline "$backup_dir/feishu-timeline.conf.bak"
fi
if [ -f /etc/nginx/sites-available/all-too-well-root ]; then
  sudo cp /etc/nginx/sites-available/all-too-well-root "$backup_dir/all-too-well-root.conf.bak"
fi
if [ -f /etc/nginx/sites-available/default ]; then
  sudo cp /etc/nginx/sites-available/default "$backup_dir/default.conf.bak"
fi

sudo mkdir -p "$PLACEHOLDER_DIR"
if [ ! -f "$PLACEHOLDER_DIR/index.html" ]; then
  printf '%s' "$PLACEHOLDER_HTML_B64" | base64 -d | sudo tee "$PLACEHOLDER_DIR/index.html" >/dev/null
fi

printf '%s' "$TIMELINE_B64" | base64 -d | sudo tee /etc/nginx/sites-available/feishu-timeline >/dev/null
printf '%s' "$ROOT_B64" | base64 -d | sudo tee /etc/nginx/sites-available/all-too-well-root >/dev/null

if [ ! -L /etc/nginx/sites-enabled/feishu-timeline ]; then
  sudo ln -s /etc/nginx/sites-available/feishu-timeline /etc/nginx/sites-enabled/feishu-timeline
fi
if [ ! -L /etc/nginx/sites-enabled/all-too-well-root ]; then
  sudo ln -s /etc/nginx/sites-available/all-too-well-root /etc/nginx/sites-enabled/all-too-well-root
fi
if [ -L /etc/nginx/sites-enabled/default ]; then
  sudo rm /etc/nginx/sites-enabled/default
fi

sudo nginx -t
sudo systemctl reload nginx

printf 'backup_dir=%s\n' "$backup_dir"
printf '%s\n' '--- root host ---'
curl -I --max-time 5 -H "Host: $ROOT_DOMAIN" http://127.0.0.1 || true
printf '%s\n' '--- www host ---'
curl -I --max-time 5 -H "Host: $WWW_DOMAIN" http://127.0.0.1 || true
printf '%s\n' '--- timeline host ---'
curl -I --max-time 5 -H "Host: $APP_HOST" http://127.0.0.1 || true
REMOTE_CONFIGURE_EOF
chmod 0700 "$REMOTE_CONFIGURE_SCRIPT"
gce_run_remote_script_with_args \
  "$REMOTE_CONFIGURE_SCRIPT" \
  "$PLACEHOLDER_DIR" "$PLACEHOLDER_HTML_B64" "$TIMELINE_B64" "$ROOT_B64" \
  "$ROOT_DOMAIN" "$WWW_DOMAIN" "$APP_HOST"

cat >"$REMOTE_CERTBOT_SCRIPT" <<'REMOTE_CERTBOT_EOF'
#!/usr/bin/env bash
set -euo pipefail
ACTION="$1"
case "$ACTION" in
  install)
    export DEBIAN_FRONTEND=noninteractive
    sudo apt-get update
    sudo apt-get install -y certbot python3-certbot-nginx
    ;;
  issue)
    ROOT_DOMAIN="$2"
    WWW_DOMAIN="$3"
    CERTBOT_EMAIL="$4"
    args=(--nginx --non-interactive --agree-tos --redirect)
    if [ -n "$CERTBOT_EMAIL" ]; then
      args+=(-m "$CERTBOT_EMAIL")
    fi
    sudo certbot "${args[@]}" -d "$ROOT_DOMAIN" -d "$WWW_DOMAIN"
    ;;
  probe)
    ROOT_DOMAIN="$2"
    WWW_DOMAIN="$3"
    echo '--- https root local resolve ---'
    curl -kI --max-time 10 --resolve "$ROOT_DOMAIN:443:127.0.0.1" "https://$ROOT_DOMAIN" || true
    echo '--- https www local resolve ---'
    curl -kI --max-time 10 --resolve "$WWW_DOMAIN:443:127.0.0.1" "https://$WWW_DOMAIN" || true
    echo '--- certbot timer ---'
    systemctl status certbot.timer --no-pager -l || true
    systemctl list-timers --all | grep -i certbot || true
    ;;
  *) exit 64 ;;
esac
REMOTE_CERTBOT_EOF
chmod 0700 "$REMOTE_CERTBOT_SCRIPT"

HAS_CERTBOT="$(gce_ssh 'if command -v certbot >/dev/null 2>&1; then echo yes; else echo no; fi')"
HAS_LETSENCRYPT_DIR="$(gce_ssh 'if sudo test -d /etc/letsencrypt; then echo yes; else echo no; fi')"
HAS_ROOT_CERT="$(gce_ssh 'if sudo test -f /etc/letsencrypt/live/all-too-well.com/fullchain.pem; then echo yes; else echo no; fi')"

CERTBOT_READY=no
CERTBOT_BLOCKER="public DNS for $ROOT_DOMAIN / $WWW_DOMAIN does not directly resolve to $PUBLIC_IP"

if [ "$FORCE_CERTBOT" = "yes" ]; then
  CERTBOT_READY=yes
  CERTBOT_BLOCKER=""
elif [ "$ROOT_DIRECT_TO_ORIGIN" = "yes" ] && [ "$WWW_DIRECT_TO_ORIGIN" = "yes" ]; then
  CERTBOT_READY=yes
  CERTBOT_BLOCKER=""
fi

SHOULD_INSTALL_CERTBOT=no
case "$INSTALL_CERTBOT" in
  yes)
    SHOULD_INSTALL_CERTBOT=yes
    ;;
  auto)
    if [ "$CERTBOT_READY" = "yes" ] || [ "$HAS_CERTBOT" = "yes" ] || [ "$HAS_LETSENCRYPT_DIR" = "yes" ]; then
      SHOULD_INSTALL_CERTBOT=yes
    fi
    ;;
  no)
    SHOULD_INSTALL_CERTBOT=no
    ;;
  *)
    fail "INSTALL_CERTBOT must be one of: auto, yes, no"
    ;;
esac

if [ "$SHOULD_INSTALL_CERTBOT" = "yes" ] && [ "$HAS_CERTBOT" = "no" ]; then
  log "Installing certbot and nginx plugin on remote host"
  gce_run_remote_script_with_args "$REMOTE_CERTBOT_SCRIPT" install
  HAS_CERTBOT=yes
fi

if [ "$HAS_ROOT_CERT" = "yes" ]; then
  log "Existing certificate detected for $ROOT_DOMAIN"
elif [ "$CERTBOT_READY" = "yes" ]; then
  if [ "$HAS_LETSENCRYPT_DIR" = "yes" ]; then
    log "Attempting certificate issuance with existing certbot account"
    gce_run_remote_script_with_args \
      "$REMOTE_CERTBOT_SCRIPT" issue "$ROOT_DOMAIN" "$WWW_DOMAIN" ''
    HAS_ROOT_CERT=yes
  elif [ -n "$CERTBOT_EMAIL" ]; then
    log "Attempting certificate issuance for $ROOT_DOMAIN and $WWW_DOMAIN"
    gce_run_remote_script_with_args \
      "$REMOTE_CERTBOT_SCRIPT" issue "$ROOT_DOMAIN" "$WWW_DOMAIN" "$CERTBOT_EMAIL"
    HAS_ROOT_CERT=yes
  else
    warn "Certbot prerequisites are otherwise satisfied, but CERTBOT_EMAIL is missing."
  fi
else
  warn "Skipping certificate issuance: $CERTBOT_BLOCKER"
fi

if [ "$HAS_ROOT_CERT" = "yes" ]; then
  gce_run_remote_script_with_args \
    "$REMOTE_CERTBOT_SCRIPT" probe "$ROOT_DOMAIN" "$WWW_DOMAIN"
fi

log "Summary:"
log "  public_ip=$PUBLIC_IP"
log "  static_ip=${STATIC_IP_BINDING:-<ephemeral>}"
log "  current_tags=${CURRENT_TAGS:-<none>}"
log "  root_direct_to_origin=$ROOT_DIRECT_TO_ORIGIN"
log "  www_direct_to_origin=$WWW_DIRECT_TO_ORIGIN"
log "  certbot_ready=$CERTBOT_READY"
if [ -n "$CERTBOT_BLOCKER" ]; then
  warn "Certificate blocker: $CERTBOT_BLOCKER"
fi
