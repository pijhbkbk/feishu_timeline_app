#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
APP_HOST="${APP_HOST:-timeline.all-too-well.com}"

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=scripts/deploy/gce-common.sh
. "$ROOT_DIR/scripts/deploy/gce-common.sh"

validate_gce_connection_parameters
if [ "${#APP_HOST}" -gt 253 ] \
  || [[ ! "$APP_HOST" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] \
  || [[ "$APP_HOST" != *.* ]]; then
  fail 'APP_HOST must be a valid DNS hostname.'
fi

REMOTE_SCRIPT="$(mktemp /tmp/r27a-gce-verify-remote.XXXXXX)"
trap 'rm -f -- "$REMOTE_SCRIPT"' EXIT
cat >"$REMOTE_SCRIPT" <<'REMOTESCRIPTEOF'
#!/usr/bin/env bash
set -euo pipefail

APP_HOST="$1"

sudo nginx -t
echo '--- api status ---'
systemctl status feishu-timeline-api --no-pager -l | sed -n '1,80p'
echo '--- web status ---'
systemctl status feishu-timeline-web --no-pager -l | sed -n '1,80p'
echo '--- api logs ---'
journalctl -u feishu-timeline-api -n 100 --no-pager
echo '--- web logs ---'
journalctl -u feishu-timeline-web -n 100 --no-pager
echo '--- sockets ---'
ss -tlnp | sed -n '1,80p'
echo '--- local curl web ---'
curl -I http://127.0.0.1:3000 || true
echo '--- local curl api ---'
curl -I http://127.0.0.1:3001/api/health || true
echo '--- nginx host web ---'
curl -I -H "Host: $APP_HOST" http://127.0.0.1/ || true
echo '--- nginx host api ---'
curl -I -H "Host: $APP_HOST" http://127.0.0.1/api/health || true
REMOTESCRIPTEOF

chmod 0700 "$REMOTE_SCRIPT"
gce_run_remote_script_with_args "$REMOTE_SCRIPT" "$APP_HOST"
