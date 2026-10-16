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

printf '== Nginx 5xx (last %s lines) ==\n' "$lines"
count=0
access_log_seen=no
access_log_available=yes
for access_log in \
  /var/log/nginx/feishu-timeline.access.log \
  /var/log/nginx/timeline.all-too-well.com.access.log \
  /var/log/nginx/access.log
do
  [ -f "$access_log" ] || continue
  access_log_seen=yes
  printf 'access_log=%s\n' "$access_log"
  if candidate_count="$(sudo tail -n "$lines" "$access_log" \
      | awk '$0 ~ /" 5[0-9][0-9] [0-9]+ "/ {count++} END {print count+0}')"; then
    count=$((count + candidate_count))
  else
    access_log_available=no
  fi
done
if [ "$access_log_available" = no ]; then
  echo 'count=unavailable'
elif [ "$access_log_seen" = yes ]; then
  printf 'count=%s\n' "$count"
  printf 'details=suppressed_to_avoid_request_query_disclosure\n'
else
  echo 'count=unavailable'
  echo 'access_log_missing'
fi

printf '\n== Nginx error log tail ==\n'
error_count=0
error_log_seen=no
error_log_available=yes
for error_log in \
  /var/log/nginx/feishu-timeline.error.log \
  /var/log/nginx/timeline.all-too-well.com.error.log \
  /var/log/nginx/error.log
do
  [ -f "$error_log" ] || continue
  error_log_seen=yes
  printf 'error_log=%s\n' "$error_log"
  if candidate_error_count="$(sudo tail -n "$lines" "$error_log" \
      | awk 'NF {count++} END {print count+0}')"; then
    error_count=$((error_count + candidate_error_count))
  else
    error_log_available=no
  fi
done
if [ "$error_log_available" = no ]; then
  echo 'error_count=unavailable'
elif [ "$error_log_seen" = yes ]; then
  printf 'error_count=%s\n' "$error_count"
  printf 'details=suppressed_to_avoid_request_query_disclosure\n'
else
  echo 'error_count=unavailable'
  echo 'error_log_missing'
fi

printf '\n== API journal error scan ==\n'
if journal_error_count="$(sudo journalctl -u feishu-timeline-api \
    --since "$journal_since" --no-pager 2>/dev/null \
    | awk '/ERROR|Error:|Exception|Unhandled|statusCode.:5[0-9][0-9]/ {count++} END {print count+0}')"; then
  printf 'journal_error_count=%s\n' "$journal_error_count"
else
  echo 'journal_error_count=unavailable'
fi
printf 'details=suppressed_to_avoid_application_secret_disclosure\n'
EOF

output="$(gce_run_remote_script_with_args "$remote_script" "$LINES" "$JOURNAL_SINCE")"
cleanup_remote_script
trap - EXIT

printf '%s\n' "$output"

count="$(printf '%s\n' "$output" | awk -F= '/^count=/{print $2; exit}')"
error_count="$(printf '%s\n' "$output" | awk -F= '/^error_count=/{print $2; exit}')"
journal_error_count="$(printf '%s\n' "$output" | awk -F= '/^journal_error_count=/{print $2; exit}')"
for metric_name in count error_count journal_error_count; do
  metric_value="${!metric_name:-}"
  if [[ ! "$metric_value" =~ ^[0-9]+$ ]]; then
    fail "Remote error metric is missing or invalid: $metric_name"
  fi
done
if [ "$count" -gt 0 ]; then
  printf '[FAIL] Recent nginx 5xx count=%s\n' "$count" >&2
  FAILURES=$((FAILURES + 1))
else
  printf '[PASS] Recent nginx 5xx count=%s\n' "$count"
fi
if [ "$error_count" -gt 0 ]; then
  printf '[FAIL] Recent nginx error-log count=%s\n' "$error_count" >&2
  FAILURES=$((FAILURES + 1))
else
  printf '[PASS] Recent nginx error-log count=%s\n' "$error_count"
fi
if [ "$journal_error_count" -gt 0 ]; then
  printf '[FAIL] Recent API journal error count=%s\n' "$journal_error_count" >&2
  FAILURES=$((FAILURES + 1))
else
  printf '[PASS] Recent API journal error count=%s\n' "$journal_error_count"
fi

if [ "$FAILURES" -gt 0 ]; then
  exit 1
fi
