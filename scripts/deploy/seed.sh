#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=/dev/null
. "$ROOT_DIR/scripts/deploy/common.sh"

require_command docker

load_compose_env
load_release_state_if_present

API_OPS_IMAGE_REPO="${API_OPS_IMAGE_REPO:-feishu-timeline-api-ops}"
export API_OPS_IMAGE_REPO

log "Running Prisma seed"
compose run --rm api-seed
