#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
APP_HOST="${APP_HOST:-timeline.all-too-well.com}"
ROOT_DOMAIN="${ROOT_DOMAIN:-all-too-well.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.${ROOT_DOMAIN}}"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-80}"
MEMORY_WARN_MB="${MEMORY_WARN_MB:-512}"
FAILURES=0

for arg in "$@"; do
  case "$arg" in
    APP_HOST=*) APP_HOST="${arg#*=}" ;;
    ROOT_DOMAIN=*) ROOT_DOMAIN="${arg#*=}" ;;
    WWW_DOMAIN=*) WWW_DOMAIN="${arg#*=}" ;;
    DISK_WARN_PERCENT=*) DISK_WARN_PERCENT="${arg#*=}" ;;
    MEMORY_WARN_MB=*) MEMORY_WARN_MB="${arg#*=}" ;;
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

pass() {
  printf '[PASS] %s\n' "$*"
}

record_failure() {
  printf '[FAIL] %s\n' "$*" >&2
  FAILURES=$((FAILURES + 1))
}

remote_script="$(mktemp)"
cat >"$remote_script" <<'EOF'
set -euo pipefail
set -a
. /opt/feishu_timeline_app/apps/api/.env.production
set +a
BASE_DB_URL="${DATABASE_URL%%\?*}"

printf 'service:feishu-timeline-api=%s\n' "$(systemctl is-active feishu-timeline-api || true)"
printf 'service:feishu-timeline-web=%s\n' "$(systemctl is-active feishu-timeline-web || true)"
printf 'service:nginx=%s\n' "$(systemctl is-active nginx || true)"
printf 'service:postgresql=%s\n' "$(systemctl is-active postgresql || true)"
printf 'service:redis-server=%s\n' "$(systemctl is-active redis-server || true)"

printf 'disk_root_percent=%s\n' "$(df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
printf 'memory_available_mb=%s\n' "$(awk '/MemAvailable:/ {printf "%d", $2/1024}' /proc/meminfo)"

for port in 80 443 3000 3001 5432 6379; do
  if ss -tlnp | grep -qE "127\\.0\\.0\\.1:$port|0\\.0\\.0\\.0:$port|\\[::\\]:$port|\\*:$port"; then
    printf 'port:%s=yes\n' "$port"
  else
    printf 'port:%s=no\n' "$port"
  fi
done

if psql "$BASE_DB_URL" -Atqc 'select 1' >/dev/null 2>&1; then
  echo 'db_connectivity=ok'
else
  echo 'db_connectivity=fail'
fi

if redis-cli -u "$REDIS_URL" --raw ping 2>/dev/null | grep -qx 'PONG'; then
  echo 'redis_connectivity=ok'
else
  echo 'redis_connectivity=fail'
fi
EOF

section() {
  printf '\n== %s ==\n' "$1"
}

output="$(gce_run_remote_script "$remote_script")"
rm -f "$remote_script"

section "Remote Runtime Snapshot"
printf '%s\n' "$output"

section "Evaluated Results"
for service in feishu-timeline-api feishu-timeline-web nginx postgresql redis-server; do
  status="$(printf '%s\n' "$output" | awk -F= -v key="service:${service}" '$1==key {print $2}')"
  if [ "$status" = "active" ]; then
    pass "${service} active"
  else
    record_failure "${service} expected active, actual=${status:-<none>}"
  fi
done

disk_percent="$(printf '%s\n' "$output" | awk -F= '$1=="disk_root_percent" {print $2}')"
if [ -n "$disk_percent" ] && [ "$disk_percent" -lt "$DISK_WARN_PERCENT" ]; then
  pass "root disk usage ${disk_percent}% < ${DISK_WARN_PERCENT}%"
else
  record_failure "root disk usage ${disk_percent:-<none>}% >= ${DISK_WARN_PERCENT}%"
fi

memory_available_mb="$(printf '%s\n' "$output" | awk -F= '$1=="memory_available_mb" {print $2}')"
if [ -n "$memory_available_mb" ] && [ "$memory_available_mb" -ge "$MEMORY_WARN_MB" ]; then
  pass "available memory ${memory_available_mb}MB >= ${MEMORY_WARN_MB}MB"
else
  record_failure "available memory ${memory_available_mb:-<none>}MB < ${MEMORY_WARN_MB}MB"
fi

for port in 80 443 3000 3001 5432 6379; do
  status="$(printf '%s\n' "$output" | awk -F= -v key="port:${port}" '$1==key {print $2}')"
  if [ "$status" = "yes" ]; then
    pass "port ${port} listening"
  else
    record_failure "port ${port} not listening"
  fi
done

db_status="$(printf '%s\n' "$output" | awk -F= '$1=="db_connectivity" {print $2}')"
if [ "$db_status" = "ok" ]; then
  pass "PostgreSQL connectivity ok"
else
  record_failure "PostgreSQL connectivity failed"
fi

redis_status="$(printf '%s\n' "$output" | awk -F= '$1=="redis_connectivity" {print $2}')"
if [ "$redis_status" = "ok" ]; then
  pass "Redis connectivity ok"
else
  record_failure "Redis connectivity failed"
fi

section "SSL Expiry"
if bash "$ROOT_DIR/scripts/deploy/check-ssl-expiry.sh" HOSTS="$APP_HOST $ROOT_DOMAIN $WWW_DOMAIN"; then
  :
else
  FAILURES=$((FAILURES + 1))
fi

if [ "$FAILURES" -gt 0 ]; then
  exit 1
fi
