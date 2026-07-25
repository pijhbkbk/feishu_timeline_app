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
POSTGRES_IMAGE_REPO="${POSTGRES_IMAGE_REPO:-feishu-timeline-postgres}"
NODE_IMAGE="${NODE_IMAGE:-node:24-alpine}"
POSTGRES_BASE_IMAGE="${POSTGRES_BASE_IMAGE:-postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777}"
REDIS_IMAGE="${REDIS_IMAGE:-redis:7-alpine@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99}"
NGINX_IMAGE="${NGINX_IMAGE:-nginx:stable-alpine@sha256:ec664813a30459a8e7176315268a623f6b31abc370eeac51c7de81cd4ec4d451}"
IMAGE_TAG="${IMAGE_TAG:-}"
if [[ -z "$IMAGE_TAG" ]]; then
  IMAGE_TAG="${GIT_SHA:0:12}"
fi
RUN_SEED="${RUN_SEED:-no}"
OCI_CREATED="${OCI_CREATED:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
OCI_SOURCE="${OCI_SOURCE:-$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null || true)}"
OCI_SOURCE="${OCI_SOURCE%.git}"
OCI_VERSION="${OCI_VERSION:-$IMAGE_TAG}"

[[ -n "$OCI_SOURCE" ]] || fail "Unable to resolve the OCI source repository URL."
[[ "$OCI_CREATED" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] \
  || fail "OCI_CREATED must be a UTC RFC 3339 timestamp."
[[ "$OCI_VERSION" =~ ^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$ ]] \
  || fail "OCI_VERSION contains unsupported characters."

export API_IMAGE_REPO WEB_IMAGE_REPO POSTGRES_IMAGE_REPO IMAGE_TAG NODE_IMAGE
export POSTGRES_BASE_IMAGE REDIS_IMAGE NGINX_IMAGE

PENDING_STATE="$STATE_DIR/pending.env"
CURRENT_STATE="$STATE_DIR/current.env"
PREVIOUS_STATE="$STATE_DIR/previous.env"
mkdir -p "$STATE_DIR"

build_release_image() {
  local image_ref="$1"
  local dockerfile_path="$2"
  shift 2

  log "Building image ${image_ref}"
  docker build --pull \
    --build-arg "NODE_IMAGE=${NODE_IMAGE}" \
    "$@" \
    --label "org.opencontainers.image.revision=${GIT_SHA}" \
    --label "org.opencontainers.image.created=${OCI_CREATED}" \
    --label "org.opencontainers.image.source=${OCI_SOURCE}" \
    --label "org.opencontainers.image.version=${OCI_VERSION}" \
    -t "$image_ref" -f "$dockerfile_path" "$ROOT_DIR"
}

build_release_image "${API_IMAGE_REPO}:${IMAGE_TAG}" "$ROOT_DIR/apps/api/Dockerfile"
build_release_image \
  "${WEB_IMAGE_REPO}:${IMAGE_TAG}" \
  "$ROOT_DIR/apps/web/Dockerfile" \
  --build-arg "NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME:-轻卡新颜色开发项目管理系统}" \
  --build-arg "NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL:-/api}" \
  --build-arg "NEXT_PUBLIC_ENABLE_MOCK_LOGIN=${NEXT_PUBLIC_ENABLE_MOCK_LOGIN:-false}" \
  --build-arg "NEXT_PUBLIC_UI_VERSION=${NEXT_PUBLIC_UI_VERSION:-v1}" \
  --build-arg "NEXT_PUBLIC_UI_DATA_MODE=${NEXT_PUBLIC_UI_DATA_MODE:-real}" \
  --build-arg "V1_FALLBACK_ENABLED=${V1_FALLBACK_ENABLED:-true}" \
  --build-arg "NEXT_PUBLIC_R26_V2_PROTOTYPE=${NEXT_PUBLIC_R26_V2_PROTOTYPE:-false}" \
  --build-arg "NEXT_PUBLIC_R26_V2_DATA_MODE=${NEXT_PUBLIC_R26_V2_DATA_MODE:-prototype}"

log "Building hardened PostgreSQL image ${POSTGRES_IMAGE_REPO}:${IMAGE_TAG}"
docker build --pull \
  --build-arg "POSTGRES_BASE_IMAGE=${POSTGRES_BASE_IMAGE}" \
  --label "org.opencontainers.image.revision=${GIT_SHA}" \
  --label "org.opencontainers.image.created=${OCI_CREATED}" \
  --label "org.opencontainers.image.source=${OCI_SOURCE}" \
  --label "org.opencontainers.image.version=${OCI_VERSION}" \
  -t "${POSTGRES_IMAGE_REPO}:${IMAGE_TAG}" \
  -f "$ROOT_DIR/deploy/images/postgres/Dockerfile" "$ROOT_DIR"

log "Scanning the exact application and infrastructure images"
"$ROOT_DIR/scripts/security/scan-production-images.sh" \
  "${API_IMAGE_REPO}:${IMAGE_TAG}" \
  "${WEB_IMAGE_REPO}:${IMAGE_TAG}" \
  "${POSTGRES_IMAGE_REPO}:${IMAGE_TAG}" \
  "$REDIS_IMAGE" \
  "$NGINX_IMAGE"

API_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "${API_IMAGE_REPO}:${IMAGE_TAG}")"
WEB_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "${WEB_IMAGE_REPO}:${IMAGE_TAG}")"
POSTGRES_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "${POSTGRES_IMAGE_REPO}:${IMAGE_TAG}")"
REDIS_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$REDIS_IMAGE")"
NGINX_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$NGINX_IMAGE")"

cat >"$PENDING_STATE" <<EOF
API_IMAGE_REPO=${API_IMAGE_REPO}
WEB_IMAGE_REPO=${WEB_IMAGE_REPO}
POSTGRES_IMAGE_REPO=${POSTGRES_IMAGE_REPO}
IMAGE_TAG=${IMAGE_TAG}
RELEASED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
GIT_SHA=${GIT_SHA}
GIT_DIRTY=${GIT_DIRTY}
OCI_CREATED=${OCI_CREATED}
OCI_SOURCE=${OCI_SOURCE}
OCI_VERSION=${OCI_VERSION}
API_IMAGE_ID=${API_IMAGE_ID}
WEB_IMAGE_ID=${WEB_IMAGE_ID}
POSTGRES_IMAGE_ID=${POSTGRES_IMAGE_ID}
REDIS_IMAGE=${REDIS_IMAGE}
REDIS_IMAGE_ID=${REDIS_IMAGE_ID}
NGINX_IMAGE=${NGINX_IMAGE}
NGINX_IMAGE_ID=${NGINX_IMAGE_ID}
EOF

log "Starting postgres and redis"
compose up -d postgres redis
wait_for_service_health postgres 180
wait_for_service_health redis 120

log "Applying Prisma migrations"
compose run --rm api-migrate

log "Starting api, web and nginx"
compose up -d --force-recreate api web nginx

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
