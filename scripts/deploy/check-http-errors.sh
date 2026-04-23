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
    INSTANCE=*|PROJECT=*|ZONE=*) eval "$arg" ;;
    *)
      printf '[ERROR] Unsupported argument: %s\n' "$arg" >&2
      exit 1
      ;;
  esac
done

# shellcheck source=/dev/null
. "$ROOT_DIR/scripts/deploy/gce-common.sh"
require_gcloud

remote_script="$(mktemp)"
cat >"$remote_script" <<'EOF'
set -euo pipefail
lines="__LINES__"
journal_since="__JOURNAL_SINCE__"

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

python3 - "$remote_script" "$LINES" "$JOURNAL_SINCE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
content = path.read_text()
content = content.replace("__LINES__", sys.argv[2])
content = content.replace("__JOURNAL_SINCE__", sys.argv[3])
path.write_text(content)
PY

output="$(gce_run_remote_script "$remote_script")"
rm -f "$remote_script"

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
