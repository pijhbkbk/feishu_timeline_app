#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SESSION_FILE="${R24B_SESSION_FILE:?Set R24B_SESSION_FILE to the repository-external temporary session JSON}"
REPORT_DIR="${R24B_REPORT_DIR:-$ROOT_DIR/reports/security/r24b/zap}"
PLAN_FILE="$ROOT_DIR/scripts/security/r24b-zap-authenticated.yaml"
ORCHESTRATOR="$ROOT_DIR/scripts/security/r24b-zap-orchestrator.mjs"
EVALUATOR="$ROOT_DIR/scripts/security/evaluate-zap-report.mjs"
ZAP_IMAGE='ghcr.io/zaproxy/zaproxy:stable@sha256:8d387b1a63e3425beef4846e39719f5af2a787753af2d8b6558c6257d7a577a2'
NGINX_IMAGE='nginx:stable-alpine@sha256:ec664813a30459a8e7176315268a623f6b31abc370eeac51c7de81cd4ec4d451'
TARGET_URL='https://r24b-staging.local'
ZAP_API_URL='http://127.0.0.1:18090'
RUNTIME_DIR="$(mktemp -d /tmp/r24b-zap-runtime.XXXXXX)"
RUN_SUFFIX="$(date +%s)-$$"
PROXY_NAME="r24b-staging-tls-$RUN_SUFFIX"
ZAP_NAME="r24b-zap-$RUN_SUFFIX"
SESSION_CLEANED=no
PROXY_STARTED=no
ZAP_STARTED=no

chmod 700 "$RUNTIME_DIR"
mkdir -p "$REPORT_DIR"
chmod 700 "$REPORT_DIR"

case "$(cd "$(dirname "$SESSION_FILE")" 2>/dev/null && pwd -P)/$(basename "$SESSION_FILE")" in
  /tmp/r24b-zap-auth.*/*|/private/tmp/r24b-zap-auth.*/*) ;;
  *) printf '[BLOCKED] Authentication file must be under /tmp/r24b-zap-auth.*.\n' >&2; exit 2 ;;
esac

if [ ! -f "$SESSION_FILE" ]; then
  printf '[BLOCKED] Authentication file does not exist.\n' >&2
  exit 2
fi

permissions="$(stat -f '%Lp' "$SESSION_FILE")"
if [ "$permissions" != "600" ]; then
  printf '[BLOCKED] Authentication file permissions must be 600.\n' >&2
  exit 2
fi

if ! docker network inspect feishu-timeline-staging_default >/dev/null 2>&1; then
  printf '[BLOCKED] The isolated staging Docker network is unavailable.\n' >&2
  exit 2
fi

if [ "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/health)" != "200" ]; then
  printf '[BLOCKED] Staging health check failed.\n' >&2
  exit 2
fi

for stale in zap-authenticated.json zap-authenticated.html execution-summary.json zap-evaluation.txt zap-version.json session-cleanup.json plan.sha256; do
  if [ -e "$REPORT_DIR/$stale" ]; then unlink "$REPORT_DIR/$stale"; fi
done

cleanup_session() {
  if [ "$SESSION_CLEANED" = "yes" ]; then return; fi
  if [ -f "$SESSION_FILE" ]; then
    K6_SESSION_FILE="$SESSION_FILE" node "$ROOT_DIR/scripts/load/r23-destroy-session.mjs"
  fi
  SESSION_CLEANED=yes
}

cleanup() {
  cleanup_session || true
  if [ "$ZAP_STARTED" = "yes" ]; then
    docker stop "$ZAP_NAME" >/dev/null 2>&1 || true
    docker rm "$ZAP_NAME" >/dev/null 2>&1 || true
  fi
  if [ "$PROXY_STARTED" = "yes" ]; then
    docker stop "$PROXY_NAME" >/dev/null 2>&1 || true
    docker rm "$PROXY_NAME" >/dev/null 2>&1 || true
  fi
  if [ -d "$RUNTIME_DIR" ]; then
    find "$RUNTIME_DIR" -depth -type f -delete 2>/dev/null || true
    find "$RUNTIME_DIR" -depth -type d -empty -delete 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 1 \
  -keyout "$RUNTIME_DIR/tls.key" \
  -out "$RUNTIME_DIR/tls.crt" \
  -subj '/CN=r24b-staging.local' \
  -addext 'subjectAltName=DNS:r24b-staging.local' >/dev/null 2>&1
chmod 600 "$RUNTIME_DIR/tls.key" "$RUNTIME_DIR/tls.crt"

printf '%s\n' \
  'server {' \
  '  listen 443 ssl;' \
  '  server_name r24b-staging.local;' \
  '  ssl_certificate /etc/nginx/tls.crt;' \
  '  ssl_certificate_key /etc/nginx/tls.key;' \
  '  location / {' \
  '    proxy_pass http://feishu-timeline-staging-nginx;' \
  '    proxy_set_header Host r24b-staging.local;' \
  '    proxy_set_header X-Forwarded-Proto https;' \
  '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' \
  '  }' \
  '}' >"$RUNTIME_DIR/nginx.conf"

printf '%s\n' \
  '<?xml version="1.0" encoding="UTF-8"?>' \
  '<Configuration status="ERROR">' \
  '  <Appenders>' \
  '    <Console name="Console" target="SYSTEM_OUT">' \
  '      <PatternLayout pattern="%d{ISO8601} %-5p %c - %m%n"/>' \
  '    </Console>' \
  '  </Appenders>' \
  '  <Loggers>' \
  '    <Logger name="org.zaproxy.zap.extension.httpsessions.HttpSessionsSite" level="error" additivity="false">' \
  '      <AppenderRef ref="Console"/>' \
  '    </Logger>' \
  '    <Root level="warn">' \
  '      <AppenderRef ref="Console"/>' \
  '    </Root>' \
  '  </Loggers>' \
  '</Configuration>' >"$RUNTIME_DIR/log4j2.xml"

docker run -d \
  --name "$PROXY_NAME" \
  --network feishu-timeline-staging_default \
  --network-alias r24b-staging.local \
  -p 127.0.0.1:18443:443 \
  -v "$RUNTIME_DIR/tls.crt:/etc/nginx/tls.crt:ro" \
  -v "$RUNTIME_DIR/tls.key:/etc/nginx/tls.key:ro" \
  -v "$RUNTIME_DIR/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  "$NGINX_IMAGE" >/dev/null
PROXY_STARTED=yes

tls_ready=no
for _ in $(seq 1 30); do
  if curl -ksS -o /dev/null https://127.0.0.1:18443/api/health; then tls_ready=yes; break; fi
  sleep 1
done
if [ "$tls_ready" != "yes" ]; then
  printf '[ERROR] Isolated staging HTTPS front door did not become healthy.\n' >&2
  exit 2
fi

docker run -d \
  --name "$ZAP_NAME" \
  --network feishu-timeline-staging_default \
  -p 127.0.0.1:18090:8080 \
  -e 'JAVA_TOOL_OPTIONS=-Dlog4j2.configurationFile=/zap/wrk/log4j2.xml' \
  -v "$RUNTIME_DIR:/zap/wrk:rw" \
  "$ZAP_IMAGE" \
  zap.sh -daemon -silent -host 0.0.0.0 -port 8080 \
    -config api.disablekey=true \
    -config 'api.addrs.addr.name=.*' \
    -config api.addrs.addr.regex=true \
    -config autoupdate.checkOnStart=false \
    -config autoupdate.downloadNewRelease=false \
    -config autoupdate.installAddonUpdates=false >/dev/null
ZAP_STARTED=yes

zap_ready=no
for _ in $(seq 1 180); do
  if curl -fsS --max-time 2 -H 'Host: zap' "$ZAP_API_URL/JSON/core/view/version/" >/dev/null 2>&1; then
    zap_ready=yes
    break
  fi
  sleep 1
done
if [ "$zap_ready" != "yes" ]; then
  printf '[ERROR] Pinned ZAP daemon did not become ready.\n' >&2
  exit 2
fi

curl -fsS -H 'Host: zap' "$ZAP_API_URL/JSON/core/view/version/" \
  | jq '{version}' >"$REPORT_DIR/zap-version.json"
chmod 600 "$REPORT_DIR/zap-version.json"
shasum -a 256 "$PLAN_FILE" | awk '{print $1}' >"$REPORT_DIR/plan.sha256"
chmod 600 "$REPORT_DIR/plan.sha256"

application_commit="$(git -C "$ROOT_DIR" rev-parse HEAD)"
R24B_SESSION_FILE="$SESSION_FILE" \
R24B_REPORT_DIR="$REPORT_DIR" \
R24B_RUNTIME_DIR="$RUNTIME_DIR" \
R24B_TARGET_URL="$TARGET_URL" \
R24B_ZAP_API_URL="$ZAP_API_URL" \
R24B_APPLICATION_COMMIT="$application_commit" \
  node "$ORCHESTRATOR"

evaluation_rc=0
node "$EVALUATOR" "$REPORT_DIR/zap-authenticated.json" \
  >"$REPORT_DIR/zap-evaluation.txt" 2>&1 || evaluation_rc=$?
chmod 600 "$REPORT_DIR/zap-evaluation.txt"

cleanup_session
printf '%s\n' \
  '{' \
  '  "authMaterialUsed": true,' \
  '  "authMaterialDestroyed": true,' \
  '  "serverSessionInvalidated": true' \
  '}' >"$REPORT_DIR/session-cleanup.json"
chmod 600 "$REPORT_DIR/session-cleanup.json"

case "$evaluation_rc" in
  0)
    printf '[PASS] Authenticated staging ZAP completed; temporary authentication was invalidated and destroyed.\n'
    ;;
  1)
    printf '[FAIL] Authenticated ZAP found a Critical, High, or Medium alert.\n' >&2
    exit 1
    ;;
  *)
    printf '[ERROR] ZAP report evaluation failed closed.\n' >&2
    exit 2
    ;;
esac
