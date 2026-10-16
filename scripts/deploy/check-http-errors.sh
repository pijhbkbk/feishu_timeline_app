#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LINES="${LINES:-200}"
JOURNAL_SINCE="${JOURNAL_SINCE:-60 min ago}"
FAILURES=0

for arg in "$@"; do
  case "$arg" in
    LINES=*) LINES="${arg#*=}" ;;
    JOURNAL_SINCE=*) JOURNAL_SINCE="${arg#*=}" ;;
    INSTANCE=*) INSTANCE="${arg#*=}" ;;
    PROJECT=*) PROJECT="${arg#*=}" ;;
    ZONE=*) ZONE="${arg#*=}" ;;
    *)
      printf '[ERROR] Unsupported argument: %s\n' "$arg" >&2
      exit 1
      ;;
  esac
done

# shellcheck source=/dev/null
. "$ROOT_DIR/scripts/deploy/gce-common.sh"
: "$INSTANCE" "$PROJECT" "$ZONE"
validate_gce_connection_parameters

if [[ ! "$LINES" =~ ^[0-9]+$ ]] || [ "$LINES" -lt 1 ] || [ "$LINES" -gt 100000 ]; then
  fail 'LINES must be an integer from 1 through 100000.'
fi
journal_since_pattern='^[1-9][0-9]{0,5} (min|mins|minute|minutes|hour|hours|day|days|week|weeks) ago$'
if [ "${#JOURNAL_SINCE}" -gt 64 ] \
  || [[ ! "$JOURNAL_SINCE" =~ $journal_since_pattern ]]; then
  fail 'JOURNAL_SINCE must use a bounded relative form such as "60 min ago" or "24 hours ago".'
fi
require_gcloud

remote_script="$(mktemp)"
cleanup_remote_script() {
  rm -f -- "$remote_script"
}
trap cleanup_remote_script EXIT
cat >"$remote_script" <<'EOF'
set -euo pipefail
lines="${1:?missing line count}"
journal_since="${2:?missing journal window}"

access_log=""
error_log=""

for candidate in \
  /var/log/nginx/feishu-timeline.access.log \
  /var/log/nginx/timeline.all-too-well.com.access.log \
  /var/log/nginx/access.log
do
  if [ -f "$candidate" ]; then
    access_log="$candidate"
    break
  fi
done

for candidate in \
  /var/log/nginx/feishu-timeline.error.log \
  /var/log/nginx/timeline.all-too-well.com.error.log \
  /var/log/nginx/error.log
do
  if [ -f "$candidate" ]; then
    error_log="$candidate"
    break
  fi
done

printf '== Nginx 5xx (last %s lines) ==\n' "$lines"
if [ -n "$access_log" ] && [ -f "$access_log" ]; then
  printf 'access_log=%s\n' "$access_log"
  count="$(sudo tail -n "$lines" "$access_log" | awk '$9 ~ /^5/ {count++} END {print count+0}')"
  printf 'count=%s\n' "$count"
  sudo tail -n "$lines" "$access_log" | awk '$9 ~ /^5/' || true
else
  echo 'count=0'
  echo 'access_log_missing'
fi

printf '\n== Nginx error log tail ==\n'
if [ -n "$error_log" ] && [ -f "$error_log" ]; then
  printf 'error_log=%s\n' "$error_log"
  sudo tail -n "$lines" "$error_log" || true
else
  echo 'error_log_missing'
fi

printf '\n== API journal error scan ==\n'
journalctl -u feishu-timeline-api --since "$journal_since" --no-pager | grep -E 'ERROR|Error:|Exception|Unhandled|statusCode.:5[0-9]{2}' || true
EOF

output="$(gce_run_remote_script_with_args "$remote_script" "$LINES" "$JOURNAL_SINCE")"
cleanup_remote_script
trap - EXIT

printf '%s\n' "$output"

count="$(printf '%s\n' "$output" | awk -F= '/^count=/{print $2; exit}')"
count="${count:-0}"
if [ "$count" -gt 0 ]; then
  printf '[FAIL] Recent nginx 5xx count=%s\n' "$count" >&2
  FAILURES=$((FAILURES + 1))
else
  printf '[PASS] Recent nginx 5xx count=%s\n' "$count"
fi

if [ "$FAILURES" -gt 0 ]; then
  exit 1
fi
