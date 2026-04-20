#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=/dev/null
. "$ROOT_DIR/scripts/deploy/common.sh"

require_command docker
require_command git

load_compose_env

API_IMAGE_REPO="${API_IMAGE_REPO:-feishu-timeline-api}"
WEB_IMAGE_REPO="${WEB_IMAGE_REPO:-feishu-timeline-web}"
IMAGE_TAG="${IMAGE_TAG:-}"
if [[ -z "$IMAGE_TAG" ]]; then
  IMAGE_TAG="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || date -u +%Y%m%d%H%M%S)"
fi
RUN_SEED="${RUN_SEED:-no}"
FORCE_REBUILD="${FORCE_REBUILD:-no}"

export API_IMAGE_REPO WEB_IMAGE_REPO IMAGE_TAG

PENDING_STATE="$STATE_DIR/pending.env"
CURRENT_STATE="$STATE_DIR/current.env"
PREVIOUS_STATE="$STATE_DIR/previous.env"
mkdir -p "$STATE_DIR"

build_image_if_needed() {
  local image_ref="$1"
  local dockerfile_path="$2"

  if [[ "$FORCE_REBUILD" != "yes" ]] && docker image inspect "$image_ref" >/dev/null 2>&1; then
    log "Using existing image ${image_ref}"
    return
  fi

  log "Building image ${image_ref}"
  docker build -t "$image_ref" -f "$dockerfile_path" "$ROOT_DIR"
}

build_image_if_needed "${API_IMAGE_REPO}:${IMAGE_TAG}" "$ROOT_DIR/apps/api/Dockerfile"
build_image_if_needed "${WEB_IMAGE_REPO}:${IMAGE_TAG}" "$ROOT_DIR/apps/web/Dockerfile"

cat >"$PENDING_STATE" <<EOF
API_IMAGE_REPO=${API_IMAGE_REPO}
WEB_IMAGE_REPO=${WEB_IMAGE_REPO}
IMAGE_TAG=${IMAGE_TAG}
RELEASED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
GIT_SHA=$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || echo unknown)
EOF

log "Starting postgres and redis"
compose up -d postgres redis
wait_for_service_health postgres 180
wait_for_service_health redis 120

log "Applying Prisma migrations"
compose run --rm api-migrate

log "Starting api, web and nginx"
compose up -d api web nginx

wait_for_service_health api 180
wait_for_service_health web 180
wait_for_service_health nginx 120

if [[ "$RUN_SEED" == "yes" ]]; then
  log "Running seed data"
  compose run --rm api-seed
fi

"$ROOT_DIR/scripts/deploy/health-check.sh"

if [[ -f "$CURRENT_STATE" ]]; then
  cp "$CURRENT_STATE" "$PREVIOUS_STATE"
fi

mv "$PENDING_STATE" "$CURRENT_STATE"

log "Staging release is active with tag ${IMAGE_TAG}"
