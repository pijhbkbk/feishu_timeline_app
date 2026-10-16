#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=/dev/null
. "$ROOT_DIR/scripts/deploy/common.sh"

require_command docker

load_compose_env

CURRENT_STATE="$STATE_DIR/current.env"
PREVIOUS_STATE="$STATE_DIR/previous.env"

[[ -f "$CURRENT_STATE" ]] || fail "No current release state recorded."
[[ -f "$PREVIOUS_STATE" ]] || fail "No previous release state recorded."

load_release_state_if_present "$PREVIOUS_STATE"

docker image inspect "${API_IMAGE_REPO}:${IMAGE_TAG}" >/dev/null 2>&1 || fail "Missing API image ${API_IMAGE_REPO}:${IMAGE_TAG}"
docker image inspect "${WEB_IMAGE_REPO}:${IMAGE_TAG}" >/dev/null 2>&1 || fail "Missing Web image ${WEB_IMAGE_REPO}:${IMAGE_TAG}"

export API_IMAGE_REPO WEB_IMAGE_REPO IMAGE_TAG

log "Rolling back to ${IMAGE_TAG}"
compose up -d api web nginx

"$ROOT_DIR/scripts/deploy/health-check.sh"

TMP_STATE="$(mktemp)"
python3 "$DOTENV_DATA_TOOL" rewrite \
  --profile release \
  --source "$CURRENT_STATE" \
  --target "$TMP_STATE" \
  --set "ROLLED_BACK_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --mode 0600

install -m 0600 "$PREVIOUS_STATE" "$CURRENT_STATE"
install -m 0600 "$TMP_STATE" "$PREVIOUS_STATE"
rm -f "$TMP_STATE"

log "Rollback complete"
