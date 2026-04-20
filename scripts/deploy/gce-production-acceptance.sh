#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
APP_HOST="${APP_HOST:-timeline.all-too-well.com}"
ROOT_DOMAIN="${ROOT_DOMAIN:-all-too-well.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.${ROOT_DOMAIN}}"
APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"

FAILURES=0
TMP_FILES=()

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

make_tmp() {
  local file
  file="$(mktemp)"
  TMP_FILES+=("$file")
  printf '%s\n' "$file"
}

cleanup() {
  if [ "${#TMP_FILES[@]}" -gt 0 ]; then
    rm -f "${TMP_FILES[@]}"
  fi
}

trap cleanup EXIT

ssh_gce() {
  gcloud compute ssh "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --command "$1"
}

add_result() {
  local check="$1"
  local expected="$2"
  local actual="$3"
  local status="$4"

  printf '| %s | %s | %s | %s |\n' "$check" "$expected" "$actual" "$status"

  if [ "$status" != "PASS" ]; then
    FAILURES=$((FAILURES + 1))
  fi
}

probe_http() {
  local url="$1"

  PROBE_HEAD="$(make_tmp)"
  PROBE_BODY="$(make_tmp)"

  /usr/bin/curl -k -sS --max-redirs 0 --max-time 20 -D "$PROBE_HEAD" -o "$PROBE_BODY" "$url" >/dev/null || true
  PROBE_DIRECT_CODE="$(awk 'NR == 1 { print $2 }' "$PROBE_HEAD")"
  PROBE_LOCATION="$(
    grep -i '^Location:' "$PROBE_HEAD" | head -n1 | cut -d' ' -f2- | tr -d '\r' || true
  )"

  local final_result
  final_result="$(
    /usr/bin/curl -k -sS -L --max-redirs 5 --max-time 20 -o /dev/null \
      -w '%{http_code}|%{url_effective}' "$url" || true
  )"
  PROBE_FINAL_CODE="${final_result%%|*}"
  PROBE_FINAL_URL="${final_result#*|}"
}

json_field() {
  local file="$1"
  local field="$2"
  python3 - "$file" "$field" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
field = sys.argv[2]

try:
    payload = json.loads(path.read_text())
except Exception:
    print("")
    raise SystemExit(0)

value = payload
for part in field.split("."):
    if isinstance(value, dict) and part in value:
        value = value[part]
    else:
        print("")
        raise SystemExit(0)

if isinstance(value, bool):
    print("true" if value else "false")
elif value is None:
    print("null")
else:
    print(str(value))
PY
}

header_field() {
  local file="$1"
  local field="$2"
  grep -i "^${field}:" "$file" | head -n1 | cut -d' ' -f2- | tr -d '\r' || true
}

print_section() {
  printf '\n## %s\n\n' "$1"
}

query_dns() {
  local domain="$1"
  if ! command -v dig >/dev/null 2>&1; then
    printf '\n'
    return
  fi

  {
    dig @1.1.1.1 +short "$domain" A
    dig @8.8.8.8 +short "$domain" A
  } | awk 'NF' | sort -u
}

PUBLIC_IP="$(gcloud compute instances describe "$INSTANCE" --project="$PROJECT" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"

print_section "正式入口验收矩阵"
printf '| Check | Expected | Actual | Result |\n'
printf '| --- | --- | --- | --- |\n'

for domain in "$ROOT_DOMAIN" "$WWW_DOMAIN" "$APP_HOST"; do
  answers="$(query_dns "$domain")"
  if printf '%s\n' "$answers" | grep -Fx "$PUBLIC_IP" >/dev/null 2>&1; then
    add_result "DNS ${domain}" "解析到 ${PUBLIC_IP}" "answers=${answers//$'\n'/,}" "PASS"
  else
    add_result "DNS ${domain}" "解析到 ${PUBLIC_IP}" "answers=${answers//$'\n'/,}" "FAIL"
  fi
done

probe_http "http://${ROOT_DOMAIN}/"
if [[ "${PROBE_DIRECT_CODE:-}" =~ ^30[18]$ ]] && [ "${PROBE_LOCATION:-}" = "https://${ROOT_DOMAIN}/" ]; then
  add_result "http://${ROOT_DOMAIN}/" "301/308 -> https://${ROOT_DOMAIN}/" "code=${PROBE_DIRECT_CODE} location=${PROBE_LOCATION}" "PASS"
else
  add_result "http://${ROOT_DOMAIN}/" "301/308 -> https://${ROOT_DOMAIN}/" "code=${PROBE_DIRECT_CODE:-<none>} location=${PROBE_LOCATION:-<none>}" "FAIL"
fi

probe_http "https://${ROOT_DOMAIN}/"
root_hsts="$(header_field "$PROBE_HEAD" "Strict-Transport-Security")"
if [ "${PROBE_FINAL_CODE:-}" = "200" ] && [ "${PROBE_FINAL_URL:-}" = "https://${ROOT_DOMAIN}/" ] && grep -F "timeline.all-too-well.com" "$PROBE_BODY" >/dev/null 2>&1; then
  add_result "https://${ROOT_DOMAIN}/" "200 placeholder" "code=${PROBE_FINAL_CODE} url=${PROBE_FINAL_URL}" "PASS"
else
  add_result "https://${ROOT_DOMAIN}/" "200 placeholder" "code=${PROBE_FINAL_CODE:-<none>} url=${PROBE_FINAL_URL:-<none>}" "FAIL"
fi
if [ -n "$root_hsts" ]; then
  add_result "https://${ROOT_DOMAIN}/ HSTS" "present" "$root_hsts" "PASS"
else
  add_result "https://${ROOT_DOMAIN}/ HSTS" "present" "<missing>" "FAIL"
fi

probe_http "http://${WWW_DOMAIN}/"
if [[ "${PROBE_DIRECT_CODE:-}" =~ ^30[18]$ ]] && [ "${PROBE_LOCATION:-}" = "https://${ROOT_DOMAIN}/" ]; then
  add_result "http://${WWW_DOMAIN}/" "301/308 -> https://${ROOT_DOMAIN}/" "code=${PROBE_DIRECT_CODE} location=${PROBE_LOCATION}" "PASS"
else
  add_result "http://${WWW_DOMAIN}/" "301/308 -> https://${ROOT_DOMAIN}/" "code=${PROBE_DIRECT_CODE:-<none>} location=${PROBE_LOCATION:-<none>}" "FAIL"
fi

probe_http "https://${WWW_DOMAIN}/"
if [[ "${PROBE_DIRECT_CODE:-}" =~ ^30[18]$ ]] && [ "${PROBE_LOCATION:-}" = "https://${ROOT_DOMAIN}/" ]; then
  add_result "https://${WWW_DOMAIN}/" "301/308 -> https://${ROOT_DOMAIN}/" "code=${PROBE_DIRECT_CODE} location=${PROBE_LOCATION}" "PASS"
else
  add_result "https://${WWW_DOMAIN}/" "301/308 -> https://${ROOT_DOMAIN}/" "code=${PROBE_DIRECT_CODE:-<none>} location=${PROBE_LOCATION:-<none>}" "FAIL"
fi

probe_http "http://${APP_HOST}/"
if [[ "${PROBE_DIRECT_CODE:-}" =~ ^30[18]$ ]] && [ "${PROBE_LOCATION:-}" = "https://${APP_HOST}/" ]; then
  add_result "http://${APP_HOST}/" "301/308 -> https://${APP_HOST}/" "code=${PROBE_DIRECT_CODE} location=${PROBE_LOCATION}" "PASS"
else
  add_result "http://${APP_HOST}/" "301/308 -> https://${APP_HOST}/" "code=${PROBE_DIRECT_CODE:-<none>} location=${PROBE_LOCATION:-<none>}" "FAIL"
fi

probe_http "https://${APP_HOST}/"
app_hsts="$(header_field "$PROBE_HEAD" "Strict-Transport-Security")"
if [ "${PROBE_DIRECT_CODE:-}" = "307" ] && [ "${PROBE_LOCATION:-}" = "/dashboard" ] && [ "${PROBE_FINAL_CODE:-}" = "200" ] && [ "${PROBE_FINAL_URL:-}" = "https://${APP_HOST}/dashboard" ]; then
  add_result "https://${APP_HOST}/" "307 -> /dashboard, final 200" "direct=${PROBE_DIRECT_CODE} final=${PROBE_FINAL_CODE} url=${PROBE_FINAL_URL}" "PASS"
else
  add_result "https://${APP_HOST}/" "307 -> /dashboard, final 200" "direct=${PROBE_DIRECT_CODE:-<none>} final=${PROBE_FINAL_CODE:-<none>} url=${PROBE_FINAL_URL:-<none>}" "FAIL"
fi
if [ -n "$app_hsts" ]; then
  add_result "https://${APP_HOST}/ HSTS" "present" "$app_hsts" "PASS"
else
  add_result "https://${APP_HOST}/ HSTS" "present" "<missing>" "FAIL"
fi

for path in /login /dashboard /projects; do
  probe_http "https://${APP_HOST}${path}"
  if [ "${PROBE_FINAL_CODE:-}" = "200" ] && [ "${PROBE_FINAL_URL:-}" = "https://${APP_HOST}${path}" ]; then
    add_result "https://${APP_HOST}${path}" "200" "code=${PROBE_FINAL_CODE} url=${PROBE_FINAL_URL}" "PASS"
  else
    add_result "https://${APP_HOST}${path}" "200" "code=${PROBE_FINAL_CODE:-<none>} url=${PROBE_FINAL_URL:-<none>}" "FAIL"
  fi
done

probe_http "https://${APP_HOST}/api/health"
health_status="$(json_field "$PROBE_BODY" status)"
if [ "${PROBE_FINAL_CODE:-}" = "200" ] && [ "$health_status" = "ok" ]; then
  add_result "https://${APP_HOST}/api/health" "200 status=ok" "code=${PROBE_FINAL_CODE} status=${health_status}" "PASS"
else
  add_result "https://${APP_HOST}/api/health" "200 status=ok" "code=${PROBE_FINAL_CODE:-<none>} status=${health_status:-<none>}" "FAIL"
fi

probe_http "https://${APP_HOST}/api/auth/session"
session_authenticated="$(json_field "$PROBE_BODY" authenticated)"
session_mock_enabled="$(json_field "$PROBE_BODY" mockEnabled)"
session_feishu_enabled="$(json_field "$PROBE_BODY" feishuEnabled)"
if [ "${PROBE_FINAL_CODE:-}" = "200" ] && [ "$session_authenticated" = "false" ] && [ "$session_mock_enabled" = "false" ] && [ "$session_feishu_enabled" = "true" ]; then
  add_result "https://${APP_HOST}/api/auth/session" "authenticated=false, mockEnabled=false, feishuEnabled=true" "code=${PROBE_FINAL_CODE} authenticated=${session_authenticated} mockEnabled=${session_mock_enabled} feishuEnabled=${session_feishu_enabled}" "PASS"
else
  add_result "https://${APP_HOST}/api/auth/session" "authenticated=false, mockEnabled=false, feishuEnabled=true" "code=${PROBE_FINAL_CODE:-<none>} authenticated=${session_authenticated:-<none>} mockEnabled=${session_mock_enabled:-<none>} feishuEnabled=${session_feishu_enabled:-<none>}" "FAIL"
fi

probe_http "https://${APP_HOST}/api/auth/feishu/login-url"
feishu_enabled="$(json_field "$PROBE_BODY" enabled)"
feishu_login_url="$(json_field "$PROBE_BODY" loginUrl)"
if [ "${PROBE_FINAL_CODE:-}" = "200" ] && [ "$feishu_enabled" = "true" ] && [ -n "$feishu_login_url" ] && [ "$feishu_login_url" != "null" ]; then
  add_result "https://${APP_HOST}/api/auth/feishu/login-url" "enabled=true" "code=${PROBE_FINAL_CODE} enabled=${feishu_enabled}" "PASS"
else
  add_result "https://${APP_HOST}/api/auth/feishu/login-url" "enabled=true" "code=${PROBE_FINAL_CODE:-<none>} enabled=${feishu_enabled:-<none>} loginUrl=${feishu_login_url:-<none>}" "FAIL"
fi

print_section "远端运行时检查"
printf '| Check | Expected | Actual | Result |\n'
printf '| --- | --- | --- | --- |\n'

REMOTE_CHECK_B64="$(
  cat <<'REMOTE' | base64 | tr -d '\n'
set -euo pipefail

printf 'service_api=%s\n' "$(systemctl is-active feishu-timeline-api)"
printf 'service_web=%s\n' "$(systemctl is-active feishu-timeline-web)"
printf 'service_nginx=%s\n' "$(systemctl is-active nginx)"
printf 'service_postgresql=%s\n' "$(systemctl is-active postgresql)"
printf 'service_redis=%s\n' "$(systemctl is-active redis-server)"
printf 'postgres_ready=%s\n' "$(pg_isready -h localhost -p 5432 >/dev/null 2>&1 && echo yes || echo no)"
printf 'redis_ping=%s\n' "$(redis-cli ping 2>/dev/null || true)"

if sudo nginx -t >/dev/null 2>&1; then
  echo 'nginx_test=ok'
else
  echo 'nginx_test=fail'
fi

python3 - <<'PY'
from pathlib import Path
import shlex

def load_env(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    if not path.exists():
        return data
    for line in path.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith('#') or '=' not in s:
            continue
        key, value = s.split('=', 1)
        try:
            parsed = shlex.split(value)
            data[key] = parsed[0] if parsed else ''
        except ValueError:
            data[key] = value
    return data

api_data = load_env(Path('/opt/feishu_timeline_app/apps/api/.env.production'))
web_data = load_env(Path('/opt/feishu_timeline_app/apps/web/.env.production'))

for key in ('FRONTEND_URL', 'FEISHU_REDIRECT_URI', 'FEISHU_AUTHORIZATION_ENDPOINT', 'AUTH_MOCK_ENABLED', 'REDIS_URL', 'DATABASE_URL'):
    print(f'env_{key}={"set" if api_data.get(key) else "missing"}')
    if key in {'FRONTEND_URL', 'FEISHU_REDIRECT_URI', 'AUTH_MOCK_ENABLED'} and api_data.get(key):
        print(f'value_{key}={api_data[key]}')

print(f'placeholder_FEISHU_APP_ID={"true" if api_data.get("FEISHU_APP_ID") == "your_feishu_app_id" else "false"}')
print(f'placeholder_FEISHU_APP_SECRET={"true" if api_data.get("FEISHU_APP_SECRET") == "your_feishu_app_secret" else "false"}')
print(f'placeholder_NEXT_PUBLIC_FEISHU_APP_ID={"true" if web_data.get("NEXT_PUBLIC_FEISHU_APP_ID") == "your_feishu_app_id" else "false"}')
PY
REMOTE
)"

REMOTE_SUMMARY="$(ssh_gce "printf '%s' '$REMOTE_CHECK_B64' | base64 -d | bash")"

remote_value() {
  local key="$1"
  printf '%s\n' "$REMOTE_SUMMARY" | awk -F= -v search="$key" '$1 == search { print substr($0, index($0, "=") + 1); exit }'
}

for key in service_api service_web service_nginx service_postgresql service_redis; do
  value="$(remote_value "$key")"
  if [ "$value" = "active" ]; then
    add_result "$key" "active" "$value" "PASS"
  else
    add_result "$key" "active" "${value:-<missing>}" "FAIL"
  fi
done

postgres_ready="$(remote_value postgres_ready)"
if [ "$postgres_ready" = "yes" ]; then
  add_result "postgres_ready" "yes" "$postgres_ready" "PASS"
else
  add_result "postgres_ready" "yes" "${postgres_ready:-<missing>}" "FAIL"
fi

redis_ping="$(remote_value redis_ping)"
if [ "$redis_ping" = "PONG" ]; then
  add_result "redis_ping" "PONG" "$redis_ping" "PASS"
else
  add_result "redis_ping" "PONG" "${redis_ping:-<missing>}" "FAIL"
fi

nginx_test="$(remote_value nginx_test)"
if [ "$nginx_test" = "ok" ]; then
  add_result "nginx_test" "ok" "$nginx_test" "PASS"
else
  add_result "nginx_test" "ok" "${nginx_test:-<missing>}" "FAIL"
fi

frontend_url="$(remote_value value_FRONTEND_URL)"
if [ "$frontend_url" = "https://${APP_HOST}" ]; then
  add_result "env_FRONTEND_URL" "https://${APP_HOST}" "$frontend_url" "PASS"
else
  add_result "env_FRONTEND_URL" "https://${APP_HOST}" "${frontend_url:-<missing>}" "FAIL"
fi

feishu_redirect_uri="$(remote_value value_FEISHU_REDIRECT_URI)"
if [ "$feishu_redirect_uri" = "https://${APP_HOST}/login/callback" ]; then
  add_result "env_FEISHU_REDIRECT_URI" "https://${APP_HOST}/login/callback" "$feishu_redirect_uri" "PASS"
else
  add_result "env_FEISHU_REDIRECT_URI" "https://${APP_HOST}/login/callback" "${feishu_redirect_uri:-<missing>}" "FAIL"
fi

auth_mock_enabled="$(remote_value value_AUTH_MOCK_ENABLED)"
if [ "$auth_mock_enabled" = "false" ]; then
  add_result "env_AUTH_MOCK_ENABLED" "false" "$auth_mock_enabled" "PASS"
else
  add_result "env_AUTH_MOCK_ENABLED" "false" "${auth_mock_enabled:-<missing>}" "FAIL"
fi

feishu_endpoint_state="$(remote_value env_FEISHU_AUTHORIZATION_ENDPOINT)"
if [ "$feishu_endpoint_state" = "set" ]; then
  add_result "env_FEISHU_AUTHORIZATION_ENDPOINT" "set" "$feishu_endpoint_state" "PASS"
else
  add_result "env_FEISHU_AUTHORIZATION_ENDPOINT" "set" "${feishu_endpoint_state:-<missing>}" "FAIL"
fi

redis_url_state="$(remote_value env_REDIS_URL)"
if [ "$redis_url_state" = "set" ]; then
  add_result "env_REDIS_URL" "set" "$redis_url_state" "PASS"
else
  add_result "env_REDIS_URL" "set" "${redis_url_state:-<missing>}" "FAIL"
fi

database_url_state="$(remote_value env_DATABASE_URL)"
if [ "$database_url_state" = "set" ]; then
  add_result "env_DATABASE_URL" "set" "$database_url_state" "PASS"
else
  add_result "env_DATABASE_URL" "set" "${database_url_state:-<missing>}" "FAIL"
fi

api_app_id_placeholder="$(remote_value placeholder_FEISHU_APP_ID)"
if [ "$api_app_id_placeholder" = "false" ]; then
  add_result "env_FEISHU_APP_ID" "not example placeholder" "$api_app_id_placeholder" "PASS"
else
  add_result "env_FEISHU_APP_ID" "not example placeholder" "${api_app_id_placeholder:-<missing>}" "FAIL"
fi

api_app_secret_placeholder="$(remote_value placeholder_FEISHU_APP_SECRET)"
if [ "$api_app_secret_placeholder" = "false" ]; then
  add_result "env_FEISHU_APP_SECRET" "not example placeholder" "$api_app_secret_placeholder" "PASS"
else
  add_result "env_FEISHU_APP_SECRET" "not example placeholder" "${api_app_secret_placeholder:-<missing>}" "FAIL"
fi

web_app_id_placeholder="$(remote_value placeholder_NEXT_PUBLIC_FEISHU_APP_ID)"
if [ "$web_app_id_placeholder" = "false" ]; then
  add_result "env_NEXT_PUBLIC_FEISHU_APP_ID" "not example placeholder" "$web_app_id_placeholder" "PASS"
else
  add_result "env_NEXT_PUBLIC_FEISHU_APP_ID" "not example placeholder" "${web_app_id_placeholder:-<missing>}" "FAIL"
fi

print_section "结论"
if [ "$FAILURES" -eq 0 ]; then
  log "正式验收通过。"
else
  warn "正式验收失败项数量: $FAILURES"
  exit 1
fi
