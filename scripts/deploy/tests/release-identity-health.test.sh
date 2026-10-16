#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP_DIR="$(mktemp -d /tmp/release-identity-health-test.XXXXXX)"
COMMON="$ROOT_DIR/scripts/deploy/common.sh"
HELPER="$ROOT_DIR/scripts/deploy/release-identity.mjs"
HEALTH_CHECK="$ROOT_DIR/scripts/deploy/health-check.sh"

cleanup() {
  case "$TMP_DIR" in
    /tmp/release-identity-health-test.*)
      find "$TMP_DIR" -mindepth 1 -depth -delete
      rmdir "$TMP_DIR"
      ;;
    *)
      printf 'FAIL: refusing to remove unexpected temporary path\n' >&2
      exit 1
      ;;
  esac
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_fails() {
  if "$@" >/dev/null 2>&1; then
    fail 'command unexpectedly succeeded'
  fi
}

SOURCE_COMMIT=1111111111111111111111111111111111111111
SOURCE_TREE=2222222222222222222222222222222222222222
RELEASE=r27rc1.2026-09-04+approved
BUILD_TIME=2026-09-04T05:30:00Z
API_REPOSITORY=registry.example.test/feishu/api
API_DIGEST="$(printf '%064d' 0 | tr '0' a)"
API_REFERENCE="$API_REPOSITORY@sha256:$API_DIGEST"
API_OPS_REPOSITORY=registry.example.test:5443/feishu/api-ops
API_OPS_DIGEST="$(printf '%064d' 0 | tr '0' b)"
API_OPS_REFERENCE="$API_OPS_REPOSITORY@sha256:$API_OPS_DIGEST"
WEB_REPOSITORY=registry.example.test/feishu/web
WEB_DIGEST="$(printf '%064d' 0 | tr '0' c)"
WEB_REFERENCE="$WEB_REPOSITORY@sha256:$WEB_DIGEST"
POSTGRES_REPOSITORY=registry.example.test/feishu/postgres
POSTGRES_DIGEST="$(printf '%064d' 0 | tr '0' d)"
POSTGRES_REFERENCE="$POSTGRES_REPOSITORY@sha256:$POSTGRES_DIGEST"
REDIS_REPOSITORY=registry.example.test/feishu/redis
REDIS_DIGEST="$(printf '%064d' 0 | tr '0' e)"
REDIS_REFERENCE="$REDIS_REPOSITORY@sha256:$REDIS_DIGEST"
NGINX_REPOSITORY=registry.example.test/feishu/nginx
NGINX_DIGEST="$(printf '%064d' 0 | tr '0' f)"
NGINX_REFERENCE="$NGINX_REPOSITORY@sha256:$NGINX_DIGEST"
TEST_API_IMAGE_ID="sha256:$(printf '%064d' 0 | tr '0' 4)"
TEST_API_OPS_IMAGE_ID="sha256:$(printf '%064d' 0 | tr '0' 5)"
TEST_WEB_IMAGE_ID="sha256:$(printf '%064d' 0 | tr '0' 6)"
TEST_POSTGRES_IMAGE_ID="sha256:$(printf '%064d' 0 | tr '0' 7)"
TEST_REDIS_IMAGE_ID="sha256:$(printf '%064d' 0 | tr '0' 8)"
TEST_NGINX_IMAGE_ID="sha256:$(printf '%064d' 0 | tr '0' 9)"
export TEST_API_IMAGE_ID TEST_API_OPS_IMAGE_ID TEST_WEB_IMAGE_ID
export TEST_POSTGRES_IMAGE_ID TEST_REDIS_IMAGE_ID TEST_NGINX_IMAGE_ID

test_source_free_parser() {
  local marker="$TMP_DIR/parser-command-marker"
  local env_file="$TMP_DIR/parser.env"
  local output

  printf '%s\n' 'TEST_VALUE=$(touch '"$marker"')' >"$env_file"
  output="$(COMMON_PATH="$COMMON" FILE_PATH="$env_file" bash -c \
    '. "$COMMON_PATH"; source_free_load_env_file "$FILE_PATH" TEST_VALUE; printf "%s" "$TEST_VALUE"')"
  [ "$output" = '$(touch '"$marker"')' ] || fail 'parser changed a literal command payload'
  [ ! -e "$marker" ] || fail 'parser executed a command substitution payload'

  printf '%s\n' 'TEST_VALUE=`touch '"$marker"'`' >"$env_file"
  output="$(COMMON_PATH="$COMMON" FILE_PATH="$env_file" bash -c \
    '. "$COMMON_PATH"; source_free_load_env_file "$FILE_PATH" TEST_VALUE; printf "%s" "$TEST_VALUE"')"
  [ "$output" = '`touch '"$marker"'`' ] || fail 'parser changed a literal backtick payload'
  [ ! -e "$marker" ] || fail 'parser executed a backtick payload'

  printf '%s\n' 'UNKNOWN=value' >"$env_file"
  assert_fails env COMMON_PATH="$COMMON" FILE_PATH="$env_file" bash -c \
    '. "$COMMON_PATH"; source_free_load_env_file "$FILE_PATH" TEST_VALUE'
  printf '%s\n' 'TEST_VALUE=one' 'TEST_VALUE=two' >"$env_file"
  assert_fails env COMMON_PATH="$COMMON" FILE_PATH="$env_file" bash -c \
    '. "$COMMON_PATH"; source_free_load_env_file "$FILE_PATH" TEST_VALUE'
  printf 'TEST_VALUE=value\r\n' >"$env_file"
  assert_fails env COMMON_PATH="$COMMON" FILE_PATH="$env_file" bash -c \
    '. "$COMMON_PATH"; source_free_load_env_file "$FILE_PATH" TEST_VALUE'
  printf 'TEST_VALUE=value\000tail\n' >"$env_file"
  assert_fails env COMMON_PATH="$COMMON" FILE_PATH="$env_file" bash -c \
    '. "$COMMON_PATH"; source_free_load_env_file "$FILE_PATH" TEST_VALUE'

  printf '%s\n' 'TEST_VALUE=safe' >"$env_file"
  ln -s "$env_file" "$TMP_DIR/parser-link.env"
  assert_fails env COMMON_PATH="$COMMON" FILE_PATH="$TMP_DIR/parser-link.env" bash -c \
    '. "$COMMON_PATH"; source_free_load_env_file "$FILE_PATH" TEST_VALUE'

  if grep -F '. "$COMPOSE_ENV_FILE"' "$COMMON" >/dev/null \
    || grep -F '. "$file"' "$COMMON" >/dev/null \
    || grep -E '(^|[[:space:]])eval([[:space:]]|$)' "$COMMON" >/dev/null; then
    fail 'common.sh still interprets staging configuration as shell code'
  fi
}

test_release_call_graph_boundary() {
  local release_path
  local compose_file="$ROOT_DIR/deploy/compose.staging.yml"
  local release_paths=(
    scripts/deploy/staging-up.sh
    scripts/deploy/staging-rollback.sh
    scripts/deploy/migrate.sh
    scripts/deploy/seed.sh
    scripts/deploy/health-check.sh
    scripts/deploy/rollback-check.sh
    scripts/deploy/common.sh
    scripts/deploy/release-identity.mjs
    deploy/compose.staging.yml
    deploy/env/staging.env.example
  )

  for release_path in "${release_paths[@]}"; do
    if grep -E 'infra:up|docker-compose\.yml' \
      "$ROOT_DIR/$release_path" >/dev/null; then
      fail "$release_path reaches a local-development entrypoint or root Compose file"
    fi
  done
  if grep -E '^[[:space:]]*(include|extends):' "$compose_file" >/dev/null; then
    fail 'staging Compose includes or extends another Compose topology'
  fi
  grep -F 'RELEASE_COMPOSE_FILE="$ROOT_DIR/deploy/compose.staging.yml"' "$COMMON" >/dev/null \
    || fail 'common.sh does not freeze the staging Compose path'
  grep -F '[ "$COMPOSE_FILE" = "$RELEASE_COMPOSE_FILE" ]' "$COMMON" >/dev/null \
    || fail 'common.sh does not reject a Compose path override'
  grep -F -- '--project-name "$STAGING_COMPOSE_PROJECT_NAME"' "$COMMON" >/dev/null \
    || fail 'common.sh does not select the explicit staging project'
  grep -F -- '-f "$RELEASE_COMPOSE_FILE"' "$COMMON" >/dev/null \
    || fail 'common.sh does not pass the exact staging Compose file'
}

test_disabled_entrypoints() {
  local script
  local rc
  for script in staging-up.sh rollback-check.sh staging-rollback.sh; do
    rc=0
    bash "$ROOT_DIR/scripts/deploy/$script" >"$TMP_DIR/$script.out" 2>"$TMP_DIR/$script.err" || rc=$?
    [ "$rc" -eq 78 ] || fail "$script must return the fixed fail-closed exit code"
    [ ! -s "$TMP_DIR/$script.out" ] || fail "$script emitted stdout"
    grep -F 'RC3' "$TMP_DIR/$script.err" >/dev/null \
      || fail "$script did not explain the RC3 controller dependency"
    [ "$(wc -l <"$ROOT_DIR/scripts/deploy/$script" | tr -d ' ')" -le 12 ] \
      || fail "$script retained a legacy deployment body"
  done

  rc=0
  DEPLOY_TARGET=production bash "$HEALTH_CHECK" >"$TMP_DIR/production.out" 2>"$TMP_DIR/production.err" || rc=$?
  [ "$rc" -ne 0 ] || fail 'production health check must remain disabled until RC3'
}

write_manifest_and_env() {
  MANIFEST="$TMP_DIR/release-manifest.json"
  ENV_FILE="$TMP_DIR/staging.env"
  cat >"$MANIFEST" <<EOF
{"schemaVersion":1,"identity":{"sourceCommit":"$SOURCE_COMMIT","sourceTree":"$SOURCE_TREE","release":"$RELEASE","buildTime":"$BUILD_TIME"},"images":{"api":{"imageId":"$TEST_API_IMAGE_ID","repositoryDigest":"$API_REFERENCE"},"apiOps":{"imageId":"$TEST_API_OPS_IMAGE_ID","repositoryDigest":"$API_OPS_REFERENCE"},"web":{"imageId":"$TEST_WEB_IMAGE_ID","repositoryDigest":"$WEB_REFERENCE"},"postgres":{"imageId":"$TEST_POSTGRES_IMAGE_ID","repositoryDigest":"$POSTGRES_REFERENCE"},"redis":{"imageId":"$TEST_REDIS_IMAGE_ID","repositoryDigest":"$REDIS_REFERENCE"},"nginx":{"imageId":"$TEST_NGINX_IMAGE_ID","repositoryDigest":"$NGINX_REFERENCE"}}}
EOF
  cat >"$ENV_FILE" <<EOF
COMPOSE_PROJECT_NAME=feishu-timeline-staging
DEPLOYMENT_ENV=staging
APPROVED_RELEASE_MANIFEST=$MANIFEST
APPROVED_API_IMAGE_REPOSITORY=$API_REPOSITORY
APPROVED_API_IMAGE_DIGEST=$API_DIGEST
APPROVED_API_OPS_IMAGE_REPOSITORY=$API_OPS_REPOSITORY
APPROVED_API_OPS_IMAGE_DIGEST=$API_OPS_DIGEST
APPROVED_WEB_IMAGE_REPOSITORY=$WEB_REPOSITORY
APPROVED_WEB_IMAGE_DIGEST=$WEB_DIGEST
APPROVED_POSTGRES_IMAGE_REPOSITORY=$POSTGRES_REPOSITORY
APPROVED_POSTGRES_IMAGE_DIGEST=$POSTGRES_DIGEST
APPROVED_REDIS_IMAGE_REPOSITORY=$REDIS_REPOSITORY
APPROVED_REDIS_IMAGE_DIGEST=$REDIS_DIGEST
APPROVED_NGINX_IMAGE_REPOSITORY=$NGINX_REPOSITORY
APPROVED_NGINX_IMAGE_DIGEST=$NGINX_DIGEST
EXPECTED_SOURCE_COMMIT=$SOURCE_COMMIT
EXPECTED_SOURCE_TREE=$SOURCE_TREE
EXPECTED_RELEASE=$RELEASE
EXPECTED_BUILD_TIME=$BUILD_TIME
POSTGRES_USER=postgres
POSTGRES_PASSWORD=StrongPostgresPassword123
DATABASE_URL=postgresql://postgres:StrongPostgresPassword123@postgres:5432/feishu_timeline?schema=public
REDIS_PASSWORD=StrongRedisPassword12345
REDIS_URL=redis://:StrongRedisPassword12345@redis:6379
AUTH_MOCK_ENABLED=false
NEXT_PUBLIC_ENABLE_MOCK_LOGIN=false
MALWARE_SCANNER_PROVIDER=clamav
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_MS=15000
UPLOAD_ADMISSION_GLOBAL_LIMIT=4
UPLOAD_ADMISSION_PER_ACTOR_LIMIT=2
UPLOAD_ADMISSION_PER_TARGET_LIMIT=3
UPLOAD_ADMISSION_RATE_MAX_REQUESTS=6
UPLOAD_ADMISSION_RATE_WINDOW_MS=60000
DOWNLOAD_ADMISSION_GLOBAL_LIMIT=8
DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT=2
DOWNLOAD_ADMISSION_PER_TARGET_LIMIT=2
DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS=12
DOWNLOAD_ADMISSION_RATE_WINDOW_MS=60000
API_MEM_LIMIT=768m
API_PIDS_LIMIT=256
EOF
  chmod 600 "$ENV_FILE"
}

write_fake_runtime() {
  FAKE_BIN="$TMP_DIR/fake-bin"
  mkdir -p "$FAKE_BIN"
  cat >"$FAKE_BIN/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

labels_json() {
  printf '{"org.opencontainers.image.revision":"%s","org.opencontainers.image.version":"%s","org.opencontainers.image.created":"%s","com.feishu-timeline.source-tree":"%s"}' \
    "$EXPECTED_SOURCE_COMMIT" "$EXPECTED_RELEASE" "$EXPECTED_BUILD_TIME" "$EXPECTED_SOURCE_TREE"
}

if [ "${1:-}" = compose ]; then
  case " $* " in
    *' ps -q postgres '*) printf 'postgres-container\n' ;;
    *' ps -q redis '*) printf 'redis-container\n' ;;
    *' ps -q api '*) printf 'api-container\n' ;;
    *' ps -q web '*) printf 'web-container\n' ;;
    *' ps -q nginx '*) printf 'nginx-container\n' ;;
    *' ps '*) : ;;
    *) exit 91 ;;
  esac
  exit 0
fi

if [ "${1:-}" = inspect ] && [ "${2:-}" = --format ]; then
  printf 'healthy\n'
  exit 0
fi

if [ "${1:-}" = image ] && [ "${2:-}" = inspect ]; then
  case "${3:-}" in
    "$RELEASE_API_IMAGE") image_id="$TEST_API_IMAGE_ID" ;;
    "$RELEASE_API_OPS_IMAGE") image_id="$TEST_API_OPS_IMAGE_ID" ;;
    "$RELEASE_WEB_IMAGE") image_id="$TEST_WEB_IMAGE_ID" ;;
    "$RELEASE_POSTGRES_IMAGE") image_id="$TEST_POSTGRES_IMAGE_ID" ;;
    "$RELEASE_REDIS_IMAGE") image_id="$TEST_REDIS_IMAGE_ID" ;;
    "$RELEASE_NGINX_IMAGE") image_id="$TEST_NGINX_IMAGE_ID" ;;
    *) exit 92 ;;
  esac
  case "${TEST_HEALTH_MODE:-pass}:${3:-}" in
    "missing-redis-image:$RELEASE_REDIS_IMAGE"|"missing-nginx-image:$RELEASE_NGINX_IMAGE")
      exit 92
      ;;
  esac
  printf '[{"Id":"%s","RepoDigests":["%s"],"Config":{"Labels":%s}}]\n' \
    "$image_id" "${3:-}" "$(labels_json)"
  exit 0
fi

if [ "${1:-}" = inspect ]; then
  case "${2:-}" in
    api-container)
      printf '[{"Image":"%s","Config":{"Image":"%s"}}]\n' "$TEST_API_IMAGE_ID" "$RELEASE_API_IMAGE"
      ;;
    web-container)
      printf '[{"Image":"%s","Config":{"Image":"%s"}}]\n' "$TEST_WEB_IMAGE_ID" "$RELEASE_WEB_IMAGE"
      ;;
    postgres-container)
      printf '[{"Image":"%s","Config":{"Image":"%s"}}]\n' "$TEST_POSTGRES_IMAGE_ID" "$RELEASE_POSTGRES_IMAGE"
      ;;
    redis-container)
      printf '[{"Image":"%s","Config":{"Image":"%s"}}]\n' "$TEST_REDIS_IMAGE_ID" "$RELEASE_REDIS_IMAGE"
      ;;
    nginx-container)
      nginx_reference="$RELEASE_NGINX_IMAGE"
      if [ "${TEST_HEALTH_MODE:-pass}" = nginx-tag-only ]; then
        nginx_reference="$APPROVED_NGINX_IMAGE_REPOSITORY:latest"
      fi
      printf '[{"Image":"%s","Config":{"Image":"%s"}}]\n' "$TEST_NGINX_IMAGE_ID" "$nginx_reference"
      ;;
    *) exit 93 ;;
  esac
  exit 0
fi

exit 94
EOF
  cat >"$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

body_file=''
header_file=''
url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) shift; body_file="${1:?}" ;;
    -D) shift; header_file="${1:?}" ;;
  esac
  url="$1"
  shift
done
[ -n "$body_file" ] || exit 95
printf 'HTTP/1.1 200 OK\n' >"$header_file"
case "$url" in
  */api/health)
    printf '{"status":"ok","sourceCommit":"%s","sourceTree":"%s","runtimeCommit":"%s","release":"%s","buildTime":"%s"}\n' \
      "$EXPECTED_SOURCE_COMMIT" "$EXPECTED_SOURCE_TREE" "$EXPECTED_SOURCE_COMMIT" "$EXPECTED_RELEASE" "$EXPECTED_BUILD_TIME" >"$body_file"
    ;;
  */build-info)
    web_release="$EXPECTED_RELEASE"
    [ "${TEST_HEALTH_MODE:-pass}" != web-mismatch ] || web_release=r27rc1.mismatched
    printf '{"sourceCommit":"%s","sourceTree":"%s","runtimeCommit":"%s","release":"%s","buildTime":"%s"}\n' \
      "$EXPECTED_SOURCE_COMMIT" "$EXPECTED_SOURCE_TREE" "$EXPECTED_SOURCE_COMMIT" "$web_release" "$EXPECTED_BUILD_TIME" >"$body_file"
    ;;
  */_next/static/*)
    printf 'asset\n' >"$body_file"
    ;;
  *)
    printf '<html><script src="/_next/static/test.js"></script></html>\n' >"$body_file"
    ;;
esac
printf '200|%s' "$url"
EOF
  chmod 755 "$FAKE_BIN/docker" "$FAKE_BIN/curl"
}

run_fake_health() {
  local mode="$1"
  COMPOSE_ENV_FILE="$ENV_FILE" \
    COMPOSE_ENV_EXAMPLE="$ROOT_DIR/deploy/env/staging.env.example" \
    PATH="$FAKE_BIN:$PATH" \
    TEST_HEALTH_MODE="$mode" \
    bash "$HEALTH_CHECK" SHOW_COMPOSE_STATUS=no
}

test_health_chain() {
  write_manifest_and_env
  write_fake_runtime
  run_fake_health pass >"$TMP_DIR/health-pass.out" 2>"$TMP_DIR/health-pass.err" \
    || fail 'complete immutable health evidence should pass'
  local mode
  for mode in web-mismatch missing-redis-image missing-nginx-image nginx-tag-only; do
    if run_fake_health "$mode" >"$TMP_DIR/health-$mode.out" 2>"$TMP_DIR/health-$mode.err"; then
      fail "health evidence accepted an invalid six-image chain: $mode"
    fi
    grep -E 'complete immutable image/container evidence|Immutable release identity evidence is missing' \
      "$TMP_DIR/health-$mode.err" >/dev/null \
      || fail "health mismatch did not produce the canonical failure summary: $mode"
  done
}

test_compose_contract() {
  local compose_file="$ROOT_DIR/deploy/compose.staging.yml"
  local dockerfile
  local image
  local required
  local default_images="$TMP_DIR/compose-default-images.txt"
  local ops_images="$TMP_DIR/compose-ops-images.txt"
  local legacy_images="$TMP_DIR/compose-legacy-images.txt"
  local legacy_images_sorted="$TMP_DIR/compose-legacy-images.sorted.txt"
  local ops_images_sorted="$TMP_DIR/compose-ops-images.sorted.txt"
  local missing_env="$TMP_DIR/compose-missing.env"

  write_manifest_and_env
  [ "$(grep -c '^[[:space:]]*build:' "$compose_file" || true)" -eq 0 ] \
    || fail 'staging compose still permits repository-local image builds'
  [ "$(grep -c '^[[:space:]]*image:' "$compose_file" || true)" -eq 7 ] \
    || fail 'staging compose must define exactly seven product image entries'
  for required in \
    APPROVED_API_IMAGE_REPOSITORY APPROVED_API_IMAGE_DIGEST \
    APPROVED_API_OPS_IMAGE_REPOSITORY APPROVED_API_OPS_IMAGE_DIGEST \
    APPROVED_WEB_IMAGE_REPOSITORY APPROVED_WEB_IMAGE_DIGEST \
    APPROVED_POSTGRES_IMAGE_REPOSITORY APPROVED_POSTGRES_IMAGE_DIGEST \
    APPROVED_REDIS_IMAGE_REPOSITORY APPROVED_REDIS_IMAGE_DIGEST \
    APPROVED_NGINX_IMAGE_REPOSITORY APPROVED_NGINX_IMAGE_DIGEST \
    EXPECTED_SOURCE_COMMIT EXPECTED_SOURCE_TREE EXPECTED_RELEASE EXPECTED_BUILD_TIME; do
    grep -F '${'"$required"':?' "$compose_file" >/dev/null \
      || fail "compose does not require $required"
  done
  if grep -E '^[[:space:]]*image:.*\$\{(APPROVED_API_IMAGE|APPROVED_API_OPS_IMAGE|APPROVED_WEB_IMAGE|APPROVED_POSTGRES_IMAGE|REDIS_IMAGE|NGINX_IMAGE)(:|})' \
    "$compose_file" >/dev/null; then
    fail 'staging compose still accepts a legacy full-reference image variable'
  fi
  if grep -E '^[[:space:]]*image:.*:-' "$compose_file" >/dev/null; then
    fail 'staging compose still contains a mutable image default'
  fi
  grep -F 'DEPLOYMENT_ENV: staging' "$compose_file" >/dev/null \
    || fail 'Web runtime is not fixed to staging'
  grep -F "http://127.0.0.1:3000/build-info" "$compose_file" >/dev/null \
    || fail 'Web health check does not use build-info'

  for dockerfile in "$ROOT_DIR/apps/api/Dockerfile" "$ROOT_DIR/apps/web/Dockerfile"; do
    for required in BUILD_SOURCE_COMMIT BUILD_SOURCE_TREE BUILD_RELEASE BUILD_TIME; do
      grep -F "ARG $required" "$dockerfile" >/dev/null \
        || fail "$dockerfile does not declare $required"
    done
    grep -F 'release-identity.mjs generate-ts' "$dockerfile" >/dev/null \
      || fail "$dockerfile does not generate immutable TypeScript identity"
    grep -F 'org.opencontainers.image.revision=' "$dockerfile" >/dev/null \
      || fail "$dockerfile lacks the OCI revision label"
    grep -F 'org.opencontainers.image.version=' "$dockerfile" >/dev/null \
      || fail "$dockerfile lacks the OCI version label"
    grep -F 'org.opencontainers.image.created=' "$dockerfile" >/dev/null \
      || fail "$dockerfile lacks the OCI created label"
    grep -F 'com.feishu-timeline.source-tree=' "$dockerfile" >/dev/null \
      || fail "$dockerfile lacks the source-tree label"
  done

  docker compose version >/dev/null 2>&1 \
    || fail 'docker compose is required for the release topology regression'
  docker compose --project-name feishu-timeline-staging \
    --env-file "$ENV_FILE" -f "$compose_file" config --images >"$default_images" \
    || fail 'docker compose rejected the default immutable profile'
  docker compose --project-name feishu-timeline-staging \
    --env-file "$ENV_FILE" -f "$compose_file" --profile ops config --images >"$ops_images" \
    || fail 'docker compose rejected the ops immutable profile'

  [ "$(wc -l <"$default_images" | tr -d ' ')" -eq 5 ] \
    || fail 'default profile did not render five running product images'
  [ "$(wc -l <"$ops_images" | tr -d ' ')" -eq 7 ] \
    || fail 'ops profile did not render seven image entries'
  [ "$(sort -u "$ops_images" | wc -l | tr -d ' ')" -eq 6 ] \
    || fail 'ops profile did not render exactly six logical product identities'
  [ "$(grep -Fxc "$API_OPS_REFERENCE" "$ops_images")" -eq 2 ] \
    || fail 'api-migrate and api-seed do not share the approved API Ops identity'
  for image in \
    "$API_REFERENCE" "$API_OPS_REFERENCE" "$WEB_REFERENCE" \
    "$POSTGRES_REFERENCE" "$REDIS_REFERENCE" "$NGINX_REFERENCE"; do
    grep -Fx "$image" "$ops_images" >/dev/null \
      || fail "ops profile omitted an approved image identity: $image"
  done
  while IFS= read -r image; do
    [[ "$image" =~ ^[a-z0-9][a-z0-9._/:_-]*[a-z0-9]@sha256:[a-f0-9]{64}$ ]] \
      || fail "rendered image is not canonical and digest-pinned: $image"
    [ "$(grep -o '@sha256:' <<<"$image" | wc -l | tr -d ' ')" -eq 1 ] \
      || fail "rendered image does not contain exactly one digest separator: $image"
  done <"$ops_images"

  env \
    APPROVED_API_IMAGE=registry.example.test/legacy/api:latest \
    APPROVED_API_OPS_IMAGE=registry.example.test/legacy/api-ops:latest \
    APPROVED_WEB_IMAGE=registry.example.test/legacy/web:latest \
    APPROVED_POSTGRES_IMAGE=registry.example.test/legacy/postgres:latest \
    REDIS_IMAGE=registry.example.test/legacy/redis:latest \
    NGINX_IMAGE=registry.example.test/legacy/nginx:latest \
    docker compose --project-name feishu-timeline-staging \
      --env-file "$ENV_FILE" -f "$compose_file" --profile ops config --images \
      >"$legacy_images" \
    || fail 'legacy variable attempt disrupted canonical Compose rendering'
  sort "$ops_images" >"$ops_images_sorted"
  sort "$legacy_images" >"$legacy_images_sorted"
  cmp -s "$ops_images_sorted" "$legacy_images_sorted" \
    || fail 'legacy image variables influenced the staging release topology'

  grep -v '^APPROVED_NGINX_IMAGE_DIGEST=' "$ENV_FILE" >"$missing_env"
  chmod 600 "$missing_env"
  assert_fails env \
    APPROVED_API_IMAGE=registry.example.test/legacy/api:latest \
    APPROVED_API_OPS_IMAGE=registry.example.test/legacy/api-ops:latest \
    APPROVED_WEB_IMAGE=registry.example.test/legacy/web:latest \
    APPROVED_POSTGRES_IMAGE=registry.example.test/legacy/postgres:latest \
    REDIS_IMAGE=registry.example.test/legacy/redis:latest \
    NGINX_IMAGE=registry.example.test/legacy/nginx:latest \
    docker compose --project-name feishu-timeline-staging \
      --env-file "$missing_env" -f "$compose_file" --profile ops config --images
}

test_lifecycle_ordering() {
  local lifecycle_bin="$TMP_DIR/lifecycle-bin"
  local docker_log="$TMP_DIR/lifecycle-docker.log"
  local invalid_env="$TMP_DIR/lifecycle-invalid.env"
  local dotenv_override_env="$TMP_DIR/lifecycle-dotenv-override.env"
  local root_compose="$ROOT_DIR/docker-compose.yml"
  local script
  local service
  local rc

  write_manifest_and_env
  mkdir -p "$lifecycle_bin"
  cat >"$lifecycle_bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${DOCKER_CALL_LOG:?}"
EOF
  chmod 755 "$lifecycle_bin/docker"
  grep -v '^APPROVED_REDIS_IMAGE_REPOSITORY=' "$ENV_FILE" >"$invalid_env"
  chmod 600 "$invalid_env"

  for script in staging-up.sh staging-rollback.sh rollback-check.sh; do
    : >"$docker_log"
    rc=0
    PATH="$lifecycle_bin:$PATH" DOCKER_CALL_LOG="$docker_log" \
      COMPOSE_ENV_FILE="$invalid_env" \
      bash "$ROOT_DIR/scripts/deploy/$script" >/dev/null 2>&1 || rc=$?
    [ "$rc" -eq 78 ] || fail "$script no longer fails closed at the RC3 boundary"
    [ ! -s "$docker_log" ] || fail "$script reached Docker while disabled"
  done

  for script in migrate.sh seed.sh; do
    : >"$docker_log"
    rc=0
    PATH="$lifecycle_bin:$PATH" DOCKER_CALL_LOG="$docker_log" \
      COMPOSE_ENV_FILE="$invalid_env" \
      bash "$ROOT_DIR/scripts/deploy/$script" >/dev/null 2>&1 || rc=$?
    [ "$rc" -ne 0 ] || fail "$script accepted incomplete six-image input"
    [ ! -s "$docker_log" ] || fail "$script reached Docker before six-image validation"
  done

  : >"$docker_log"
  rc=0
  PATH="$lifecycle_bin:$PATH" DOCKER_CALL_LOG="$docker_log" \
    COMPOSE_ENV_FILE="$invalid_env" \
    bash "$HEALTH_CHECK" SHOW_COMPOSE_STATUS=no >/dev/null 2>&1 || rc=$?
  [ "$rc" -ne 0 ] || fail 'health-check accepted incomplete six-image input'
  [ ! -s "$docker_log" ] || fail 'health-check reached Docker before six-image validation'

  for script in migrate.sh seed.sh; do
    case "$script" in
      migrate.sh) service=api-migrate ;;
      seed.sh) service=api-seed ;;
    esac
    : >"$docker_log"
    PATH="$lifecycle_bin:$PATH" DOCKER_CALL_LOG="$docker_log" \
      COMPOSE_ENV_FILE="$ENV_FILE" \
      bash "$ROOT_DIR/scripts/deploy/$script" >/dev/null \
      || fail "$script rejected valid six-image input"
    [ "$(wc -l <"$docker_log" | tr -d ' ')" -eq 1 ] \
      || fail "$script made more than one Docker call"
    grep -Fx "compose --project-name feishu-timeline-staging --env-file $ENV_FILE -f $ROOT_DIR/deploy/compose.staging.yml run --rm $service" \
      "$docker_log" >/dev/null \
      || fail "$script did not reach only the intended service through the exact staging Compose file"
  done

  for script in migrate.sh seed.sh; do
    : >"$docker_log"
    rc=0
    PATH="$lifecycle_bin:$PATH" DOCKER_CALL_LOG="$docker_log" \
      COMPOSE_FILE="$root_compose" COMPOSE_ENV_FILE="$ENV_FILE" \
      bash "$ROOT_DIR/scripts/deploy/$script" >/dev/null 2>&1 || rc=$?
    [ "$rc" -ne 0 ] || fail "$script accepted a root Compose redirection"
    [ ! -s "$docker_log" ] || fail "$script reached the root Compose topology"
  done

  : >"$docker_log"
  rc=0
  PATH="$lifecycle_bin:$PATH" DOCKER_CALL_LOG="$docker_log" \
    COMPOSE_FILE="$root_compose" COMPOSE_ENV_FILE="$ENV_FILE" \
    bash "$HEALTH_CHECK" SHOW_COMPOSE_STATUS=no >/dev/null 2>&1 || rc=$?
  [ "$rc" -ne 0 ] || fail 'health-check accepted a root Compose redirection'
  [ ! -s "$docker_log" ] || fail 'health-check reached the root Compose topology'

  cp "$ENV_FILE" "$dotenv_override_env"
  printf '%s\n' "COMPOSE_FILE=$root_compose" >>"$dotenv_override_env"
  chmod 600 "$dotenv_override_env"
  : >"$docker_log"
  rc=0
  PATH="$lifecycle_bin:$PATH" DOCKER_CALL_LOG="$docker_log" \
    COMPOSE_ENV_FILE="$dotenv_override_env" \
    bash "$ROOT_DIR/scripts/deploy/migrate.sh" >/dev/null 2>&1 || rc=$?
  [ "$rc" -ne 0 ] || fail 'application dotenv supplied COMPOSE_FILE to a release caller'
  [ ! -s "$docker_log" ] || fail 'dotenv COMPOSE_FILE injection reached Docker'
}

test_source_free_parser
test_release_call_graph_boundary
test_disabled_entrypoints
test_health_chain
test_compose_contract
test_lifecycle_ordering

for executable in \
  "$HEALTH_CHECK" \
  "$ROOT_DIR/scripts/deploy/staging-up.sh" \
  "$ROOT_DIR/scripts/deploy/rollback-check.sh" \
  "$ROOT_DIR/scripts/deploy/staging-rollback.sh"; do
  [ -x "$executable" ] || fail "$executable must retain executable mode"
done

printf 'PASS: immutable release identity, health and compose controls\n'
