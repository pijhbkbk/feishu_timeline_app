#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

HOSTS="${HOSTS:-timeline.all-too-well.com all-too-well.com www.all-too-well.com}"
MIN_DAYS="${MIN_DAYS:-21}"
FAILURES=0

for arg in "$@"; do
  case "$arg" in
    HOSTS=*) HOSTS="${arg#*=}" ;;
    MIN_DAYS=*) MIN_DAYS="${arg#*=}" ;;
    *)
      printf '[ERROR] Unsupported argument: %s\n' "$arg" >&2
      exit 1
      ;;
  esac
done

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '[ERROR] Missing required command: %s\n' "$1" >&2
    exit 1
  }
}

require_command openssl
require_command python3

printf '== SSL Expiry Check ==\n'

IFS=' ' read -r -a HOST_ARRAY <<<"$HOSTS"

for host in "${HOST_ARRAY[@]}"; do
  enddate="$(
    openssl s_client -connect "${host}:443" -servername "$host" </dev/null 2>/dev/null | \
      openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2-
  )"

  if [ -z "$enddate" ]; then
    printf '[FAIL] %s -> certificate lookup failed\n' "$host" >&2
    FAILURES=$((FAILURES + 1))
    continue
  fi

  days_left="$(
    python3 - "$enddate" <<'PY'
import datetime as dt
import sys

raw = sys.argv[1]
expiry = dt.datetime.strptime(raw, "%b %d %H:%M:%S %Y %Z")
expiry = expiry.replace(tzinfo=dt.timezone.utc)
now = dt.datetime.now(dt.timezone.utc)
delta = expiry - now
print(max(0, delta.days))
PY
  )"

  if [ "$days_left" -lt "$MIN_DAYS" ]; then
    printf '[FAIL] %s -> expires=%s days_left=%s threshold=%s\n' "$host" "$enddate" "$days_left" "$MIN_DAYS" >&2
    FAILURES=$((FAILURES + 1))
  else
    printf '[PASS] %s -> expires=%s days_left=%s\n' "$host" "$enddate" "$days_left"
  fi
done

if [ "$FAILURES" -gt 0 ]; then
  exit 1
fi
