#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=/dev/null
. "$ROOT_DIR/scripts/deploy/common.sh"

require_command docker
require_command curl

load_compose_env
load_release_state_if_present

trap 'compose ps || true; compose logs --tail=80 postgres redis api web nginx || true' ERR

wait_for_service_health postgres 180
wait_for_service_health redis 120
wait_for_service_health api 180
wait_for_service_health web 180
wait_for_service_health nginx 120

HTTP_PORT="${STAGING_HTTP_PORT:-8080}"
WEB_PORT="${STAGING_WEB_PORT:-3100}"
API_PORT="${STAGING_API_PORT:-3101}"

log "Compose status"
compose ps

log "Checking nginx root"
curl -fsS "http://127.0.0.1:${HTTP_PORT}/" >/dev/null

log "Checking web login page"
curl -fsS "http://127.0.0.1:${HTTP_PORT}/login" >/dev/null
curl -fsS "http://127.0.0.1:${WEB_PORT}/login" >/dev/null

log "Checking api health"
curl -fsS "http://127.0.0.1:${HTTP_PORT}/api/health" | grep -q '"status":"ok"'
curl -fsS "http://127.0.0.1:${API_PORT}/api/health" | grep -q '"status":"ok"'

log "Staging health checks passed"

