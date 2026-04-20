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

[[ -f "$CURRENT_STATE" ]] || fail "No current release state found. Run scripts/deploy/staging-up.sh first."

log "Current release state:"
cat "$CURRENT_STATE"

if [[ ! -f "$PREVIOUS_STATE" ]]; then
  log "No previous release recorded yet. Rollback script exists, but an older release is not available in local state."
  exit 0
fi

log "Previous release state:"
cat "$PREVIOUS_STATE"

# shellcheck source=/dev/null
set -a && . "$PREVIOUS_STATE" && set +a

docker image inspect "${API_IMAGE_REPO}:${IMAGE_TAG}" >/dev/null 2>&1 || fail "Missing API rollback image ${API_IMAGE_REPO}:${IMAGE_TAG}"
docker image inspect "${WEB_IMAGE_REPO}:${IMAGE_TAG}" >/dev/null 2>&1 || fail "Missing Web rollback image ${WEB_IMAGE_REPO}:${IMAGE_TAG}"

log "Rollback prerequisites verified"

