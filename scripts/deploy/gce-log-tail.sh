#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
LINES="${LINES:-120}"
TARGET="${TARGET:-all}"
FOLLOW="${FOLLOW:-no}"

for arg in "$@"; do
  case "$arg" in
    INSTANCE=*) INSTANCE="${arg#*=}" ;;
    PROJECT=*) PROJECT="${arg#*=}" ;;
    ZONE=*) ZONE="${arg#*=}" ;;
    LINES=*) LINES="${arg#*=}" ;;
    TARGET=*) TARGET="${arg#*=}" ;;
    FOLLOW=*) FOLLOW="${arg#*=}" ;;
    *)
      printf '[ERROR] Unsupported argument: %s\n' "$arg" >&2
      exit 1
      ;;
  esac
done

log() {
  printf '[INFO] %s\n' "$*"
}

ssh_gce() {
  gcloud compute ssh "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --command "$1"
}

case "$TARGET" in
  api)
    JOURNAL_ARGS="-u feishu-timeline-api"
    NGINX_ARGS=""
    ;;
  web)
    JOURNAL_ARGS="-u feishu-timeline-web"
    NGINX_ARGS=""
    ;;
  nginx)
    JOURNAL_ARGS="-u nginx"
    NGINX_ARGS="feishu-timeline.access.log feishu-timeline.error.log all-too-well.com.access.log all-too-well.com.error.log"
    ;;
  redis)
    JOURNAL_ARGS="-u redis-server"
    NGINX_ARGS=""
    ;;
  all)
    JOURNAL_ARGS="-u feishu-timeline-api -u feishu-timeline-web -u nginx -u redis-server"
    NGINX_ARGS="feishu-timeline.error.log all-too-well.com.error.log"
    ;;
  *)
    printf '[ERROR] Unsupported TARGET=%s\n' "$TARGET" >&2
    exit 1
    ;;
esac

if [ "$FOLLOW" = "yes" ]; then
  log "Following $TARGET logs on $INSTANCE"
  ssh_gce "set -euo pipefail
sudo journalctl $JOURNAL_ARGS -f
"
  exit 0
fi

log "Showing the most recent $LINES lines for $TARGET on $INSTANCE"
ssh_gce "set -euo pipefail
echo '--- systemd journal ---'
sudo journalctl $JOURNAL_ARGS -n '$LINES' --no-pager || true
if [ -n '$NGINX_ARGS' ]; then
  echo '--- nginx files ---'
  for file in $NGINX_ARGS; do
    if [ -f \"/var/log/nginx/\$file\" ]; then
      echo \"### /var/log/nginx/\$file\"
      sudo tail -n '$LINES' \"/var/log/nginx/\$file\"
    fi
  done
fi
"
