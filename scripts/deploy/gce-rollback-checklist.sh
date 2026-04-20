#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"

log() {
  printf '[INFO] %s\n' "$*"
}

ssh_gce() {
  gcloud compute ssh "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --command "$1"
}

log "Recent rollback backups on remote host"
ssh_gce "set -euo pipefail
echo '--- step6 backups ---'
sudo ls -1dt /var/backups/feishu-timeline-step6/* 2>/dev/null | head -n 5 || true
echo '--- step5 backups ---'
sudo ls -1dt /var/backups/feishu-timeline-step5/* 2>/dev/null | head -n 5 || true
echo '--- current remote revision ---'
git -C /opt/feishu_timeline_app rev-parse --short HEAD 2>/dev/null || true
git -C /opt/feishu_timeline_app log --oneline -n 5 2>/dev/null || true
"

cat <<'EOF'

Rollback priorities:
1. If timeline HTTPS or OAuth is broken, first restore the last known-good Nginx and env backups.
2. If only Feishu callback is wrong, restore apps/api/.env.production and restart feishu-timeline-api.
3. If only Cloudflare proxy mode causes issues, switch the affected record back to DNS only before changing origin config.

Remote rollback commands:
  sudo cp /var/backups/feishu-timeline-step6/<timestamp>/feishu-timeline.conf.bak /etc/nginx/sites-available/feishu-timeline
  sudo cp /var/backups/feishu-timeline-step6/<timestamp>/all-too-well-root.conf.bak /etc/nginx/sites-available/all-too-well-root
  sudo cp /var/backups/feishu-timeline-step6/<timestamp>/api.env.production.bak /opt/feishu_timeline_app/apps/api/.env.production
  sudo nginx -t && sudo systemctl reload nginx
  sudo systemctl restart feishu-timeline-api

Code rollback commands:
  cd /opt/feishu_timeline_app
  git fetch --all
  git reset --hard <known-good-commit>
  pnpm install --frozen-lockfile
  pnpm build
  sudo systemctl restart feishu-timeline-api
  sudo systemctl restart feishu-timeline-web
  bash scripts/deploy/gce-production-acceptance.sh

Quick diagnostics:
  systemctl status feishu-timeline-api --no-pager -l
  systemctl status feishu-timeline-web --no-pager -l
  sudo nginx -t
  journalctl -u feishu-timeline-api -n 120 --no-pager
  journalctl -u feishu-timeline-web -n 120 --no-pager
  curl -I https://timeline.all-too-well.com
  curl -I https://all-too-well.com
EOF
