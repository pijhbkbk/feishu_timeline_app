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

# shellcheck source=/dev/null
set -a && . "$CURRENT_STATE" && set +a
CURRENT_API_IMAGE_REPO="$API_IMAGE_REPO"
CURRENT_WEB_IMAGE_REPO="$WEB_IMAGE_REPO"
CURRENT_IMAGE_TAG="$IMAGE_TAG"

# shellcheck source=/dev/null
set -a && . "$PREVIOUS_STATE" && set +a

docker image inspect "${API_IMAGE_REPO}:${IMAGE_TAG}" >/dev/null 2>&1 || fail "Missing API image ${API_IMAGE_REPO}:${IMAGE_TAG}"
docker image inspect "${WEB_IMAGE_REPO}:${IMAGE_TAG}" >/dev/null 2>&1 || fail "Missing Web image ${WEB_IMAGE_REPO}:${IMAGE_TAG}"

export API_IMAGE_REPO WEB_IMAGE_REPO IMAGE_TAG

log "Rolling back to ${IMAGE_TAG}"
compose up -d api web nginx

"$ROOT_DIR/scripts/deploy/health-check.sh"

TMP_STATE="$(mktemp)"
cat >"$TMP_STATE" <<EOF
API_IMAGE_REPO=${CURRENT_API_IMAGE_REPO}
WEB_IMAGE_REPO=${CURRENT_WEB_IMAGE_REPO}
IMAGE_TAG=${CURRENT_IMAGE_TAG}
ROLLED_BACK_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

cp "$PREVIOUS_STATE" "$CURRENT_STATE"
cp "$TMP_STATE" "$PREVIOUS_STATE"
rm -f "$TMP_STATE"

log "Rollback complete"

