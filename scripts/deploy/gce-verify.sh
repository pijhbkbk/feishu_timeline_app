#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
APP_HOST="${APP_HOST:-timeline.all-too-well.com}"

ssh_gce() {
  gcloud compute ssh "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --command "$1"
}

ssh_gce "set -euo pipefail
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
curl -I -H 'Host: $APP_HOST' http://127.0.0.1/ || true
echo '--- nginx host api ---'
curl -I -H 'Host: $APP_HOST' http://127.0.0.1/api/health || true
"
