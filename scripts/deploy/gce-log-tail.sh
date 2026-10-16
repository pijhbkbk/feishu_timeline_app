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

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=scripts/deploy/gce-common.sh
. "$ROOT_DIR/scripts/deploy/gce-common.sh"

validate_gce_connection_parameters
if [[ ! "$LINES" =~ ^[0-9]{1,6}$ ]] \
  || [ "$LINES" -lt 1 ] || [ "$LINES" -gt 100000 ]; then
  fail 'LINES must be an integer from 1 through 100000.'
fi
case "$FOLLOW" in
  yes|no) ;; *) fail 'FOLLOW must be yes or no.' ;; esac

case "$TARGET" in
  api|web|nginx|redis|all) ;;
  *) fail "Unsupported TARGET=$TARGET" ;;
esac

REMOTE_SCRIPT="$(mktemp /tmp/r27a-gce-log-tail-remote.XXXXXX)"
trap 'rm -f -- "$REMOTE_SCRIPT"' EXIT
cat >"$REMOTE_SCRIPT" <<'REMOTESCRIPTEOF'
#!/usr/bin/env bash
set -euo pipefail
TARGET="$1"
LINES="$2"
FOLLOW="$3"
journal_args=()
nginx_files=()
case "$TARGET" in
  api) journal_args=(-u feishu-timeline-api) ;;
  web) journal_args=(-u feishu-timeline-web) ;;
  nginx)
    journal_args=(-u nginx)
    nginx_files=(feishu-timeline.access.log feishu-timeline.error.log all-too-well.com.access.log all-too-well.com.error.log)
    ;;
  redis) journal_args=(-u redis-server) ;;
  all)
    journal_args=(-u feishu-timeline-api -u feishu-timeline-web -u nginx -u redis-server)
    nginx_files=(feishu-timeline.error.log all-too-well.com.error.log)
    ;;
  *) exit 64 ;;
esac
if [ "$FOLLOW" = yes ]; then
  sudo journalctl "${journal_args[@]}" -f
  exit 0
fi
echo '--- systemd journal ---'
sudo journalctl "${journal_args[@]}" -n "$LINES" --no-pager || true
if [ "${#nginx_files[@]}" -gt 0 ]; then
  echo '--- nginx files ---'
  for file in "${nginx_files[@]}"; do
    if [ -f "/var/log/nginx/$file" ]; then
      echo "### /var/log/nginx/$file"
      sudo tail -n "$LINES" "/var/log/nginx/$file"
    fi
  done
fi
REMOTESCRIPTEOF
chmod 0700 "$REMOTE_SCRIPT"
log "Reading $TARGET logs on $INSTANCE"
gce_run_remote_script_with_args "$REMOTE_SCRIPT" "$TARGET" "$LINES" "$FOLLOW"
