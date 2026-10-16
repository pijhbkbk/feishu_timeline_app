#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=scripts/deploy/gce-common.sh
. "$ROOT_DIR/scripts/deploy/gce-common.sh"

log "Recent rollback backups on remote host"
gce_ssh "set -euo pipefail
echo '--- step6 backups ---'
sudo ls -1dt /var/backups/feishu-timeline-step6/* 2>/dev/null | head -n 5 || true
echo '--- step5 backups ---'
sudo ls -1dt /var/backups/feishu-timeline-step5/* 2>/dev/null | head -n 5 || true
echo '--- current remote revision ---'
readlink -f /opt/feishu_timeline_app/current 2>/dev/null || true
git -C /var/lib/feishu-timeline-deploy/repository log --oneline -n 5 2>/dev/null || true
"

cat <<'EOF'

Rollback priorities:
1. If timeline HTTPS or OAuth is broken, first restore the last known-good Nginx and env backups.
2. If only Feishu callback is wrong, validate and atomically restore /etc/feishu-timeline/api.env, then restart feishu-timeline-api.
3. If only Cloudflare proxy mode causes issues, switch the affected record back to DNS only before changing origin config.

Remote rollback commands:
  sudo cp /var/backups/feishu-timeline-step6/<timestamp>/feishu-timeline.conf.bak /etc/nginx/sites-available/feishu-timeline
  sudo cp /var/backups/feishu-timeline-step6/<timestamp>/all-too-well-root.conf.bak /etc/nginx/sites-available/all-too-well-root
  sudo /usr/bin/python3 -I /usr/local/libexec/feishu-timeline/dotenv-data validate --profile api /var/backups/feishu-timeline-step6/<timestamp>/api.env.production.bak
  sudo /usr/bin/python3 -I /usr/local/libexec/feishu-timeline/dotenv-data rewrite --profile api --source /var/backups/feishu-timeline-step6/<timestamp>/api.env.production.bak --target /etc/feishu-timeline/api.env --uid 0 --gid "$(stat -c '%g' /etc/feishu-timeline/api.env)" --mode 0640 --require-secure-parent
  sudo nginx -t && sudo systemctl reload nginx
  sudo systemctl restart feishu-timeline-api

Code rollback commands:
  # Run the deployment script from a trusted checkout and pass an exact 40-character commit:
  GIT_REF=<known-good-40-char-commit> bash scripts/deploy/gce-sync-and-build.sh
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
