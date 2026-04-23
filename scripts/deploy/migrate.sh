#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=/dev/null
. "$ROOT_DIR/scripts/deploy/common.sh"

require_command docker

load_compose_env
load_release_state_if_present

log "Running Prisma migrate deploy"
compose run --rm api-migrate

