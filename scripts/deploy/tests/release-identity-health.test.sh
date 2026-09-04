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
API_DIGEST="registry.example.test/feishu/api@sha256:$(printf '%064d' 0 | tr '0' a)"
API_OPS_DIGEST="registry.example.test/feishu/api-ops@sha256:$(printf '%064d' 0 | tr '0' b)"
WEB_DIGEST="registry.example.test/feishu/web@sha256:$(printf '%064d' 0 | tr '0' c)"
POSTGRES_DIGEST="registry.example.test/feishu/postgres@sha256:$(printf '%064d' 0 | tr '0' d)"
TEST_API_IMAGE_ID="sha256:$(printf '%064d' 0 | tr '0' 4)"
TEST_API_OPS_IMAGE_ID="sha256:$(printf '%064d' 0 | tr '0' 5)"
TEST_WEB_IMAGE_ID="sha256:$(printf '%064d' 0 | tr '0' 6)"
export TEST_API_IMAGE_ID TEST_API_OPS_IMAGE_ID TEST_WEB_IMAGE_ID

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
{"schemaVersion":1,"identity":{"sourceCommit":"$SOURCE_COMMIT","sourceTree":"$SOURCE_TREE","release":"$RELEASE","buildTime":"$BUILD_TIME"},"images":{"api":{"imageId":"$TEST_API_IMAGE_ID","repositoryDigest":"$API_DIGEST"},"apiOps":{"imageId":"$TEST_API_OPS_IMAGE_ID","repositoryDigest":"$API_OPS_DIGEST"},"web":{"imageId":"$TEST_WEB_IMAGE_ID","repositoryDigest":"$WEB_DIGEST"}}}
EOF
  cat >"$ENV_FILE" <<EOF
DEPLOYMENT_ENV=staging
APPROVED_RELEASE_MANIFEST=$MANIFEST
APPROVED_API_IMAGE=$API_DIGEST
APPROVED_API_OPS_IMAGE=$API_OPS_DIGEST
APPROVED_WEB_IMAGE=$WEB_DIGEST
APPROVED_POSTGRES_IMAGE=$POSTGRES_DIGEST
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
    "$APPROVED_API_IMAGE") image_id="$TEST_API_IMAGE_ID" ;;
    "$APPROVED_API_OPS_IMAGE") image_id="$TEST_API_OPS_IMAGE_ID" ;;
    "$APPROVED_WEB_IMAGE") image_id="$TEST_WEB_IMAGE_ID" ;;
    *) exit 92 ;;
  esac
  printf '[{"Id":"%s","RepoDigests":["%s"],"Config":{"Labels":%s}}]\n' \
    "$image_id" "${3:-}" "$(labels_json)"
  exit 0
fi

if [ "${1:-}" = inspect ]; then
  case "${2:-}" in
    api-container)
      printf '[{"Image":"%s","Config":{"Image":"%s"}}]\n' "$TEST_API_IMAGE_ID" "$APPROVED_API_IMAGE"
      ;;
    web-container)
      printf '[{"Image":"%s","Config":{"Image":"%s"}}]\n' "$TEST_WEB_IMAGE_ID" "$APPROVED_WEB_IMAGE"
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
    [ "${TEST_WEB_MISMATCH:-no}" = no ] || web_release=r27rc1.mismatched
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
  local mismatch="$1"
  COMPOSE_ENV_FILE="$ENV_FILE" \
    COMPOSE_ENV_EXAMPLE="$ROOT_DIR/deploy/env/staging.env.example" \
    PATH="$FAKE_BIN:$PATH" \
    TEST_WEB_MISMATCH="$mismatch" \
    bash "$HEALTH_CHECK" SHOW_COMPOSE_STATUS=no
}

test_health_chain() {
  write_manifest_and_env
  write_fake_runtime
  run_fake_health no >"$TMP_DIR/health-pass.out" 2>"$TMP_DIR/health-pass.err" \
    || fail 'complete immutable health evidence should pass'
  if run_fake_health yes >"$TMP_DIR/health-fail.out" 2>"$TMP_DIR/health-fail.err"; then
    fail 'Web identity mismatch did not fail the health check'
  fi
  grep -F 'Immutable release identity evidence is missing, malformed or inconsistent.' \
    "$TMP_DIR/health-fail.err" >/dev/null \
    || fail 'health mismatch did not produce the canonical failure summary'
}

test_compose_contract() {
  local compose_file="$ROOT_DIR/deploy/compose.staging.yml"
  local dockerfile
  local required
  [ "$(grep -c '^[[:space:]]*build:' "$compose_file" || true)" -eq 0 ] \
    || fail 'staging compose still permits repository-local image builds'
  for required in \
    APPROVED_API_IMAGE APPROVED_API_OPS_IMAGE APPROVED_WEB_IMAGE \
    EXPECTED_SOURCE_COMMIT EXPECTED_SOURCE_TREE EXPECTED_RELEASE EXPECTED_BUILD_TIME; do
    grep -F '${'"$required"':?' "$compose_file" >/dev/null \
      || fail "compose does not require $required"
  done
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

  if docker compose version >/dev/null 2>&1; then
    (
      export APPROVED_API_IMAGE="$API_DIGEST"
      export APPROVED_API_OPS_IMAGE="$API_OPS_DIGEST"
      export APPROVED_WEB_IMAGE="$WEB_DIGEST"
      export APPROVED_POSTGRES_IMAGE="$POSTGRES_DIGEST"
      export EXPECTED_SOURCE_COMMIT="$SOURCE_COMMIT"
      export EXPECTED_SOURCE_TREE="$SOURCE_TREE"
      export EXPECTED_RELEASE="$RELEASE"
      export EXPECTED_BUILD_TIME="$BUILD_TIME"
      export POSTGRES_PASSWORD=StrongPostgresPassword123
      export DATABASE_URL=postgresql://postgres:StrongPostgresPassword123@postgres:5432/feishu_timeline
      export REDIS_PASSWORD=StrongRedisPassword12345
      export REDIS_URL=redis://:StrongRedisPassword12345@redis:6379
      export MALWARE_SCANNER_PROVIDER=clamav
      export CLAMAV_HOST=clamav
      export CLAMAV_PORT=3310
      export CLAMAV_TIMEOUT_MS=15000
      docker compose -f "$compose_file" config >"$TMP_DIR/compose-config.yml"
    ) || fail 'docker compose rejected the complete immutable configuration'
    grep -F "image: $API_DIGEST" "$TMP_DIR/compose-config.yml" >/dev/null \
      || fail 'rendered compose lost the approved API digest'
    grep -F 'EXPECTED_SOURCE_COMMIT:' "$TMP_DIR/compose-config.yml" >/dev/null \
      || fail 'rendered compose lost the expected source commit key'
    grep -F "$SOURCE_COMMIT" "$TMP_DIR/compose-config.yml" >/dev/null \
      || fail 'rendered compose lost the expected source commit value'
  else
    printf 'SKIP: docker compose is unavailable; static compose contract checks passed\n'
  fi
}

test_source_free_parser
test_disabled_entrypoints
test_health_chain
test_compose_contract

for executable in \
  "$HEALTH_CHECK" \
  "$ROOT_DIR/scripts/deploy/staging-up.sh" \
  "$ROOT_DIR/scripts/deploy/rollback-check.sh" \
  "$ROOT_DIR/scripts/deploy/staging-rollback.sh"; do
  [ -x "$executable" ] || fail "$executable must retain executable mode"
done

printf 'PASS: immutable release identity, health and compose controls\n'
