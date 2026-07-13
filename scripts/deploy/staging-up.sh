#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=/dev/null
. "$ROOT_DIR/scripts/deploy/common.sh"

require_command docker
require_command git
require_command node

load_compose_env

GIT_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)"
[[ -n "$GIT_SHA" ]] || fail "Unable to resolve the release Git revision."
worktree_status="$(git -C "$ROOT_DIR" status --porcelain --untracked-files=normal)"
GIT_DIRTY="false"
if [[ -n "$worktree_status" ]]; then
  GIT_DIRTY="true"
  if [[ "${ALLOW_DIRTY_DEPLOY:-no}" != "yes" ]]; then
    fail "Refusing to deploy a dirty worktree. Commit the release or set ALLOW_DIRTY_DEPLOY=yes for an explicitly audited exception."
  fi
fi

API_IMAGE_REPO="${API_IMAGE_REPO:-feishu-timeline-api}"
WEB_IMAGE_REPO="${WEB_IMAGE_REPO:-feishu-timeline-web}"
NODE_IMAGE="${NODE_IMAGE:-node:24-alpine}"
IMAGE_TAG="${IMAGE_TAG:-}"
if [[ -z "$IMAGE_TAG" ]]; then
  IMAGE_TAG="${GIT_SHA:0:12}"
fi
RUN_SEED="${RUN_SEED:-no}"

export API_IMAGE_REPO WEB_IMAGE_REPO IMAGE_TAG NODE_IMAGE

PENDING_STATE="$STATE_DIR/pending.env"
CURRENT_STATE="$STATE_DIR/current.env"
PREVIOUS_STATE="$STATE_DIR/previous.env"
mkdir -p "$STATE_DIR"

build_release_image() {
  local image_ref="$1"
  local dockerfile_path="$2"

  log "Building image ${image_ref}"
  docker build --pull \
    --build-arg "NODE_IMAGE=${NODE_IMAGE}" \
    --label "org.opencontainers.image.revision=${GIT_SHA}" \
    --label "org.opencontainers.image.source=feishu-timeline-app" \
    -t "$image_ref" -f "$dockerfile_path" "$ROOT_DIR"
}

build_release_image "${API_IMAGE_REPO}:${IMAGE_TAG}" "$ROOT_DIR/apps/api/Dockerfile"
build_release_image "${WEB_IMAGE_REPO}:${IMAGE_TAG}" "$ROOT_DIR/apps/web/Dockerfile"

log "Scanning the exact API and Web release images"
"$ROOT_DIR/scripts/security/scan-production-images.sh" \
  "${API_IMAGE_REPO}:${IMAGE_TAG}" \
  "${WEB_IMAGE_REPO}:${IMAGE_TAG}"

API_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "${API_IMAGE_REPO}:${IMAGE_TAG}")"
WEB_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "${WEB_IMAGE_REPO}:${IMAGE_TAG}")"

cat >"$PENDING_STATE" <<EOF
API_IMAGE_REPO=${API_IMAGE_REPO}
WEB_IMAGE_REPO=${WEB_IMAGE_REPO}
IMAGE_TAG=${IMAGE_TAG}
RELEASED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
GIT_SHA=${GIT_SHA}
GIT_DIRTY=${GIT_DIRTY}
API_IMAGE_ID=${API_IMAGE_ID}
WEB_IMAGE_ID=${WEB_IMAGE_ID}
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
