#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP_DIR="$(mktemp -d /tmp/r27a-shell-security.XXXXXX)"

cleanup() {
  case "$TMP_DIR" in
    /tmp/r27a-shell-security.*)
      find "$TMP_DIR" -mindepth 1 -depth -delete
      rmdir "$TMP_DIR"
      ;;
    *)
      printf 'WARN: refusing to clean unexpected test path: %s\n' "$TMP_DIR" >&2
      ;;
  esac
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

FAKE_BIN="$TMP_DIR/fake-bin"
mkdir -p "$FAKE_BIN"

cat >"$FAKE_BIN/gcloud" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >>"${GCLOUD_TEST_LOG:?}"

if [ "${1:-}" = 'compute' ] && [ "${2:-}" = 'ssh' ]; then
  case "${GCLOUD_TEST_MODE:?}" in
    gce_injection)
      for argument in "$@"; do
        if [ "$argument" = '--command' ]; then
          previous_was_command=yes
          continue
        fi
        if [ "${previous_was_command:-no}" = yes ]; then
          if [ "$argument" = 'id -un' ]; then
            printf 'deployuser\n'
          fi
          break
        fi
      done
      ;;
    ops)
      cat <<'EOF'
service:feishu-timeline-api=active
service:feishu-timeline-web=active
service:nginx=active
service:postgresql=active
service:redis-server=active
disk_root_percent=20
memory_available_mb=4096
port:80=yes
port:443=yes
port:3000=yes
port:3001=yes
port:5432=yes
port:6379=yes
db_connectivity=ok
redis_connectivity=ok
EOF
      ;;
    http)
      printf 'count=0\n'
      ;;
    backup)
      :
      ;;
    *)
      exit 42
      ;;
  esac
fi

if [ "${1:-}" = 'compute' ] && [ "${2:-}" = 'scp' ] \
  && [ "${GCLOUD_TEST_MODE:?}" = gce_injection ]; then
  [ -n "${GCLOUD_CAPTURED_SCRIPT:-}" ] || exit 42
  cp -- "${3:?}" "$GCLOUD_CAPTURED_SCRIPT"
fi
SH
chmod 0755 "$FAKE_BIN/gcloud"

cat >"$FAKE_BIN/openssl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  s_client)
    exit 0
    ;;
  x509)
    printf 'notAfter=Jan 01 00:00:00 2099 GMT\n'
    ;;
  *)
    exit 42
    ;;
esac
SH
chmod 0755 "$FAKE_BIN/openssl"

case_counter=0
LAST_CASE_DIR=''

run_script() {
  local script="$1"
  local mode="$2"
  local argument="$3"
  local expected="$4"
  local marker="${5:-}"
  local case_dir
  local rc=0

  case_counter=$((case_counter + 1))
  case_dir="$TMP_DIR/case-$case_counter"
  LAST_CASE_DIR="$case_dir"
  mkdir -p "$case_dir"

  PATH="$FAKE_BIN:$PATH" \
    GCLOUD_TEST_MODE="$mode" \
    GCLOUD_TEST_LOG="$case_dir/gcloud.log" \
    bash "$ROOT_DIR/$script" "$argument" \
    >"$case_dir/stdout" 2>"$case_dir/stderr" || rc=$?

  case "$expected" in
    accepted)
      [ "$rc" -eq 0 ] || fail "$script rejected safe argument: $argument"
      [ -s "$case_dir/gcloud.log" ] \
        || fail "$script did not pass the safe argument through its normal command path"
      ;;
    rejected)
      [ "$rc" -ne 0 ] || fail "$script accepted unsafe argument: $argument"
      [ ! -e "$case_dir/gcloud.log" ] \
        || fail "$script reached gcloud after rejecting unsafe argument: $argument"
      if [ -n "$marker" ] && [ -e "$marker" ]; then
        fail "$script executed an injected command for argument: $argument"
      fi
      ;;
    *)
      fail "unknown test expectation: $expected"
      ;;
  esac
}

SCRIPTS=(
  'scripts/deploy/ops-check.sh:ops'
  'scripts/deploy/backup-postgres.sh:backup'
  'scripts/deploy/check-http-errors.sh:http'
)

for entry in "${SCRIPTS[@]}"; do
  script="${entry%%:*}"
  mode="${entry#*:}"
  run_script "$script" "$mode" 'INSTANCE=normal-instance' accepted

  marker="$TMP_DIR/semicolon-$mode"
  run_script "$script" "$mode" "INSTANCE=x;touch $marker" rejected "$marker"

  marker="$TMP_DIR/dollar-command-$mode"
  # The literal command substitution is the attack payload.
  # shellcheck disable=SC2016
  run_script "$script" "$mode" 'INSTANCE=$(touch '"$marker"')' rejected "$marker"

  marker="$TMP_DIR/backtick-command-$mode"
  run_script "$script" "$mode" 'INSTANCE=`touch '"$marker"'`' rejected "$marker"

  marker="$TMP_DIR/and-command-$mode"
  run_script "$script" "$mode" "INSTANCE=name && touch $marker" rejected "$marker"

  marker="$TMP_DIR/newline-command-$mode"
  run_script "$script" "$mode" $'INSTANCE=normal-instance\ntouch '"$marker" rejected "$marker"

  run_script "$script" "$mode" 'INSTANCE=-leading-dash' rejected
  run_script "$script" "$mode" "INSTANCE=$(printf 'a%.0s' {1..64})" rejected
  run_script "$script" "$mode" 'PROJECT=valid-project1' accepted
  run_script "$script" "$mode" 'PROJECT=Uppercase-project' rejected
  run_script "$script" "$mode" 'ZONE=us-west1-b' accepted
  run_script "$script" "$mode" 'ZONE=us west1-b' rejected
  run_script "$script" "$mode" 'GCE_TUNNEL_THROUGH_IAP=maybe' rejected
done

run_script 'scripts/deploy/ops-check.sh' ops 'APP_HOST=timeline.example.com' accepted
run_script 'scripts/deploy/ops-check.sh' ops 'APP_HOST=x;command' rejected
run_script 'scripts/deploy/ops-check.sh' ops 'DISK_WARN_PERCENT=0' rejected
run_script 'scripts/deploy/ops-check.sh' ops 'DISK_WARN_PERCENT=101' rejected
run_script 'scripts/deploy/ops-check.sh' ops 'MEMORY_WARN_MB=not-a-number' rejected

run_script 'scripts/deploy/backup-postgres.sh' backup \
  'BACKUP_ROOT=/var/backups/feishu-timeline-db' accepted
grep -F "'/var/backups/feishu-timeline-db'" "$LAST_CASE_DIR/gcloud.log" >/dev/null \
  || fail 'backup root was not transferred as a quoted remote positional argument'
run_script 'scripts/deploy/backup-postgres.sh' backup \
  'BACKUP_ROOT=/var/backups/../escape' rejected
run_script 'scripts/deploy/backup-postgres.sh' backup 'RUN_RESTORE_DRILL=maybe' rejected
run_script 'scripts/deploy/backup-postgres.sh' backup 'KEEP_DRILL_ARTIFACTS=maybe' rejected

run_script 'scripts/deploy/check-http-errors.sh' http 'LINES=200' accepted
run_script 'scripts/deploy/check-http-errors.sh' http 'LINES=0' rejected
run_script 'scripts/deploy/check-http-errors.sh' http 'LINES=100001' rejected
run_script 'scripts/deploy/check-http-errors.sh' http 'JOURNAL_SINCE=60 min ago' accepted
grep -F "'60 min ago'" "$LAST_CASE_DIR/gcloud.log" >/dev/null \
  || fail 'journal window was not transferred as a quoted remote positional argument'
run_script 'scripts/deploy/check-http-errors.sh' http 'JOURNAL_SINCE=now;command' rejected
run_script 'scripts/deploy/check-http-errors.sh' http $'JOURNAL_SINCE=60 min\nago' rejected

for script in \
  scripts/deploy/ops-check.sh \
  scripts/deploy/backup-postgres.sh \
  scripts/deploy/check-http-errors.sh; do
  if grep -En '(^|[^[:alnum:]_])eval([[:space:]]|$)' "$ROOT_DIR/$script" >/dev/null; then
    fail "$script still uses eval"
  fi
done

run_gce_remote_source_validation() {
  local script="$1"
  local expected="$2"
  local override="$3"
  local marker="${4:-}"
  local case_dir
  local rc=0

  case_counter=$((case_counter + 1))
  case_dir="$TMP_DIR/gce-source-case-$case_counter"
  mkdir -p "$case_dir"

  PATH="$FAKE_BIN:$PATH" \
    GCLOUD_TEST_MODE=gce_injection \
    GCLOUD_TEST_LOG="$case_dir/gcloud.log" \
    GCLOUD_CAPTURED_SCRIPT="$case_dir/remote-script.sh" \
    env "$override" bash "$ROOT_DIR/$script" \
    >"$case_dir/stdout" 2>"$case_dir/stderr" || rc=$?

  case "$expected" in
    accepted)
      [ "$rc" -eq 0 ] || fail "$script rejected safe configuration: $override"
      [ -s "$case_dir/remote-script.sh" ] \
        || fail "$script did not transfer a static remote script"
      bash -n "$case_dir/remote-script.sh" \
        || fail "$script transferred invalid remote Bash"
      if grep -F -- "${override#*=}" "$case_dir/remote-script.sh" >/dev/null; then
        fail "$script interpolated a controlled value into remote Bash source: $override"
      fi
      ;;
    rejected)
      [ "$rc" -ne 0 ] || fail "$script accepted unsafe configuration: $override"
      [ ! -e "$case_dir/gcloud.log" ] \
        || fail "$script reached gcloud before rejecting unsafe configuration: $override"
      if [ -n "$marker" ] && [ -e "$marker" ]; then
        fail "$script executed an injected command: $override"
      fi
      ;;
    *)
      fail "unknown GCE source validation expectation: $expected"
      ;;
  esac
}

run_gce_remote_source_validation \
  scripts/deploy/gce-sync-and-build.sh accepted \
  'REPO_URL=https://example.invalid/feishu-timeline.git'
run_gce_remote_source_validation \
  scripts/deploy/gce-postgres-bootstrap.sh accepted \
  'DB_HOST=database.internal'

sync_controlled_variables=(
  INSTANCE
  PROJECT
  ZONE
  GCE_TUNNEL_THROUGH_IAP
  APP_ROOT
  GIT_REF
  REPO_URL
  APP_HOST
  PUBLIC_SCHEME
  PUBLIC_APP_URL
  FEISHU_CALLBACK_PATH
  RUN_PRISMA_MIGRATE_DEPLOY
  FORCE_NGINX_TEMPLATE_SYNC
)
postgres_controlled_variables=(
  INSTANCE
  PROJECT
  ZONE
  GCE_TUNNEL_THROUGH_IAP
  APP_ROOT
  DB_HOST
  DB_PORT
  DB_NAME_DEFAULT
  DB_USER_DEFAULT
  DB_SCHEMA
  ROTATE_PLACEHOLDER_CREDENTIALS
  RUN_PRISMA_MIGRATE_DEPLOY
)

for variable in "${sync_controlled_variables[@]}"; do
  for payload_kind in single-quote semicolon dollar-command backtick-command newline; do
    marker="$TMP_DIR/gce-sync-${variable}-${payload_kind}-${case_counter}"
    # Literal command substitutions in this case are attack payloads.
    # shellcheck disable=SC2016
    case "$payload_kind" in
      single-quote) payload="safe';touch $marker;#" ;;
      semicolon) payload="safe;touch $marker" ;;
      dollar-command) payload='safe$(touch '"$marker"')' ;;
      backtick-command) payload='safe`touch '"$marker"'`' ;;
      newline) payload=$'safe\ntouch '"$marker" ;;
    esac
    run_gce_remote_source_validation \
      scripts/deploy/gce-sync-and-build.sh rejected \
      "$variable=$payload" "$marker"
  done
done

for variable in "${postgres_controlled_variables[@]}"; do
  for payload_kind in single-quote semicolon dollar-command backtick-command newline; do
    marker="$TMP_DIR/gce-postgres-${variable}-${payload_kind}-${case_counter}"
    # Literal command substitutions in this case are attack payloads.
    # shellcheck disable=SC2016
    case "$payload_kind" in
      single-quote) payload="safe';touch $marker;#" ;;
      semicolon) payload="safe;touch $marker" ;;
      dollar-command) payload='safe$(touch '"$marker"')' ;;
      backtick-command) payload='safe`touch '"$marker"'`' ;;
      newline) payload=$'safe\ntouch '"$marker" ;;
    esac
    run_gce_remote_source_validation \
      scripts/deploy/gce-postgres-bootstrap.sh rejected \
      "$variable=$payload" "$marker"
  done
done

for script in \
  scripts/deploy/gce-sync-and-build.sh \
  scripts/deploy/gce-postgres-bootstrap.sh; do
  grep -F 'gce_run_remote_script_with_args' "$ROOT_DIR/$script" >/dev/null \
    || fail "$script does not pass controlled values as remote positional arguments"
  # Assert literal source patterns rather than expanding a test variable.
  # shellcheck disable=SC2016
  if grep -En 'ssh_gce "|--command "\$1"' "$ROOT_DIR/$script" >/dev/null; then
    fail "$script still builds a remote Bash program through local interpolation"
  fi
done

for script in "$ROOT_DIR"/scripts/deploy/gce-*.sh; do
  case "$script" in
    */gce-common.sh) continue ;;
  esac
  # Assert literal wrapper/source patterns rather than expanding a test variable.
  # shellcheck disable=SC2016
  if grep -En '^ssh_gce\(\)|--command "\$1"|ssh_gce "' "$script" >/dev/null; then
    fail "${script#"$ROOT_DIR/"} retains a custom SSH wrapper or locally interpolated remote Bash source"
  fi
done

for script in "$ROOT_DIR"/scripts/deploy/gce-*.sh; do
  case "$script" in
    */gce-common.sh|*/gce-production-acceptance.sh) continue ;;
  esac
  # A single-quoted uppercase variable in these remote programs would become a
  # literal token after moving the program to a quoted static heredoc.
  # shellcheck disable=SC2016
  if grep -E "'\$[A-Z][A-Z0-9_]*'" "$script" >/dev/null; then
    fail "${script#"$ROOT_DIR/"} leaves a controlled remote variable single-quoted as a literal"
  fi
done

for script in "$ROOT_DIR"/scripts/deploy/gce-*.sh; do
  case "$script" in
    */gce-common.sh) continue ;;
  esac
  for payload_kind in single-quote semicolon dollar-command backtick-command newline; do
    case_counter=$((case_counter + 1))
    case_dir="$TMP_DIR/gce-full-audit-$case_counter"
    marker="$case_dir/injection-marker"
    mkdir -p "$case_dir"
    # Literal command substitutions in this case are attack payloads.
    # shellcheck disable=SC2016
    case "$payload_kind" in
      single-quote) payload="safe';touch $marker;#" ;;
      semicolon) payload="safe;touch $marker" ;;
      dollar-command) payload='safe$(touch '"$marker"')' ;;
      backtick-command) payload='safe`touch '"$marker"'`' ;;
      newline) payload=$'safe\ntouch '"$marker" ;;
    esac
    rc=0
    PATH="$FAKE_BIN:$PATH" \
      GCLOUD_TEST_MODE=gce_injection \
      GCLOUD_TEST_LOG="$case_dir/gcloud.log" \
      GCLOUD_CAPTURED_SCRIPT="$case_dir/remote-script.sh" \
      INSTANCE="$payload" \
      bash "$script" >"$case_dir/stdout" 2>"$case_dir/stderr" || rc=$?
    [ "$rc" -ne 0 ] \
      || fail "${script#"$ROOT_DIR/"} accepted an injected GCE instance name"
    [ ! -e "$case_dir/gcloud.log" ] \
      || fail "${script#"$ROOT_DIR/"} reached gcloud before rejecting an injected instance name"
    [ ! -e "$marker" ] \
      || fail "${script#"$ROOT_DIR/"} executed an injected instance-name command"
  done
done

PRODUCTION_ENV_TEMPLATE="$ROOT_DIR/.env.production.example"
grep -Fx 'DEPLOYMENT_ENV=production' "$PRODUCTION_ENV_TEMPLATE" >/dev/null \
  || fail 'root production env template does not declare DEPLOYMENT_ENV=production'
for expected_scanner_setting in \
  'MALWARE_SCANNER_PROVIDER=clamav' \
  'CLAMAV_HOST=replace-with-approved-clamav-host' \
  'CLAMAV_PORT=3310' \
  'CLAMAV_TIMEOUT_MS=15000'; do
  grep -Fx "$expected_scanner_setting" "$PRODUCTION_ENV_TEMPLATE" >/dev/null \
    || fail "root production env template omits scanner setting: $expected_scanner_setting"
done
grep -E '^DATABASE_URL=postgresql://[^:]+:[^@]+@[^/]+/[^?]+\?schema=[A-Za-z0-9_]+$' \
  "$PRODUCTION_ENV_TEMPLATE" >/dev/null \
  || fail 'root production env template does not use an authenticated PostgreSQL placeholder URL'
grep -E '^REDIS_URL=redis://:[^@]+@[^:/]+:[0-9]+$' \
  "$PRODUCTION_ENV_TEMPLATE" >/dev/null \
  || fail 'root production env template does not use an authenticated Redis placeholder URL'
grep -Fx 'FEISHU_AUTHORIZATION_ENDPOINT=https://accounts.feishu.cn/open-apis/authen/v1/index' \
  "$PRODUCTION_ENV_TEMPLATE" >/dev/null \
  || fail 'root production env template does not use the Feishu CN authorization endpoint'

for script in \
  scripts/deploy/ops-check.sh \
  scripts/deploy/backup-postgres.sh \
  scripts/deploy/check-http-errors.sh \
  scripts/deploy/gce-bootstrap.sh; do
  awk '
    /^cat >"\$remote_script" <<'\''EOF'\''$/ { in_remote = 1; next }
    in_remote && /^EOF$/ { exit }
    in_remote { print }
  ' "$ROOT_DIR/$script" | bash -n \
    || fail "$script contains an invalid quoted remote Bash program"
done

for script in \
  scripts/migration/bootstrap_gcp.sh \
  scripts/deploy/gce-bootstrap.sh; do
  if grep -En 'curl[^|]*\|[[:space:]]*(sudo[[:space:]]+-E[[:space:]]+)?(ba)?sh([[:space:]]|$)' \
    "$ROOT_DIR/$script" >/dev/null; then
    fail "$script still executes a remote setup script through a pipe"
  fi
  grep -F 'NODESOURCE_KEY_SHA256' "$ROOT_DIR/$script" >/dev/null \
    || fail "$script does not pin the NodeSource key digest"
  grep -F 'NODESOURCE_KEY_FINGERPRINT' "$ROOT_DIR/$script" >/dev/null \
    || fail "$script does not pin the NodeSource signing-key fingerprint"
  grep -F 'NODE_PACKAGE_VERSION' "$ROOT_DIR/$script" >/dev/null \
    || fail "$script does not pin the Node.js package version"
  grep -F 'signed-by=' "$ROOT_DIR/$script" >/dev/null \
    || fail "$script does not scope the NodeSource repository to a signing keyring"
  grep -E 'nodejs=\$\{?[A-Za-z_][A-Za-z0-9_]*\}?' "$ROOT_DIR/$script" >/dev/null \
    || fail "$script does not pass an exact package version to apt"
done

RESTORE_SCRIPT="$ROOT_DIR/scripts/migration/restore_to_gcp.sh"
restore_case_counter=0

run_restore_validation() {
  local expected="$1"
  local override="$2"
  local rejected_label="${3:-}"
  local marker="${4:-}"
  local case_dir
  local rc=0

  restore_case_counter=$((restore_case_counter + 1))
  case_dir="$TMP_DIR/restore-case-$restore_case_counter"
  mkdir -p "$case_dir"

  env \
    RESTORE_VALIDATE_ONLY=yes \
    REPO_STAGE_DIR="$case_dir/repo-stage" \
    GIT_REPO_URL='https://example.invalid/feishu-timeline.git' \
    "$override" \
    bash "$RESTORE_SCRIPT" >"$case_dir/stdout" 2>"$case_dir/stderr" || rc=$?

  case "$expected" in
    accepted)
      [ "$rc" -eq 0 ] || fail "restore validation rejected safe configuration: $override"
      grep -F 'VALIDATION_ONLY=PASS' "$case_dir/stdout" >/dev/null \
        || fail 'restore validation did not emit its non-mutating success marker'
      ;;
    rejected)
      [ "$rc" -ne 0 ] || fail "restore validation accepted unsafe configuration: $override"
      grep -F "[ERROR] Invalid controlled path: $rejected_label" "$case_dir/stderr" >/dev/null \
        || fail "restore validation did not reject $rejected_label before command execution: $override"
      if [ -n "$marker" ] && [ -e "$marker" ]; then
        fail "restore validation executed an injected command: $override"
      fi
      ;;
    *)
      fail "unknown restore validation expectation: $expected"
      ;;
  esac
}

run_restore_validation accepted 'APP_HOME=/home/feishu'

marker="$TMP_DIR/restore-single-quote"
run_restore_validation rejected "APP_HOME=/home/feishu';touch $marker;#" APP_HOME "$marker"

marker="$TMP_DIR/restore-semicolon"
run_restore_validation rejected "APP_HOME=/home/feishu;touch $marker" APP_HOME "$marker"

marker="$TMP_DIR/restore-dollar-command"
# The literal command substitution is the attack payload.
# shellcheck disable=SC2016
run_restore_validation rejected 'APP_HOME=/home/feishu/$(touch '"$marker"')' APP_HOME "$marker"

marker="$TMP_DIR/restore-backtick-command"
run_restore_validation rejected 'APP_HOME=/home/feishu/`touch '"$marker"'`' APP_HOME "$marker"

marker="$TMP_DIR/restore-newline-command"
run_restore_validation rejected $'APP_HOME=/home/feishu\ntouch '"$marker" APP_HOME "$marker"

for controlled_path_override in \
  'COREPACK_HOME=/home/feishu/.cache/node/corepack;command' \
  'APP_RUNTIME_PATH=/usr/local/bin:/usr/bin;command' \
  'APP_ROOT=/opt/feishu_timeline_app;command' \
  'API_DIR=/opt/feishu_timeline_app/apps/api;command' \
  'WEB_DIR=/opt/feishu_timeline_app/apps/web;command'; do
  controlled_path_label="${controlled_path_override%%=*}"
  run_restore_validation rejected "$controlled_path_override" "$controlled_path_label"
done

run_restore_validation rejected 'APP_HOME=-leading-dash' APP_HOME
overlong_restore_path="/$(printf 'a%.0s' {1..513})"
run_restore_validation rejected "APP_HOME=$overlong_restore_path" APP_HOME

if grep -En '\$\*|bash[[:space:]]+-lc' "$RESTORE_SCRIPT" >/dev/null; then
  fail 'restore_to_gcp still reparses a flattened command string'
fi
if grep -En 'run_as_app[[:space:]]+"' "$RESTORE_SCRIPT" >/dev/null; then
  fail 'restore_to_gcp still interpolates controlled values into Bash source text'
fi
grep -F "This file is an explicitly trusted, root-controlled shell configuration boundary." \
  "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not document the trusted .env.production execution boundary'
# Assert the literal source text, not the test environment.
# shellcheck disable=SC2016
if grep -F 'chown -R "$APP_USER:$APP_GROUP" "$APP_ROOT"' \
  "$RESTORE_SCRIPT" >/dev/null; then
  fail 'restore_to_gcp recursively changes ownership of trusted production env files'
fi
for trusted_env_exclusion in \
  "--exclude 'apps/api/.env.production'" \
  "--exclude 'apps/web/.env.production'"; do
  grep -F -- "$trusted_env_exclusion" "$RESTORE_SCRIPT" >/dev/null \
    || fail "restore_to_gcp does not preserve trusted env ownership: $trusted_env_exclusion"
done
# Assert the literal source text, not the test environment.
# shellcheck disable=SC2016
grep -F -- '--chown="$APP_USER:$APP_GROUP"' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not scope application ownership to transferred repository files'

# Assert the literal source text, not the test environment.
# shellcheck disable=SC2016
grep -F 'API_OPS_IMAGE_REPO="${API_OPS_IMAGE_REPO:-feishu-timeline-api-ops}"' \
  "$ROOT_DIR/scripts/deploy/staging-up.sh" >/dev/null \
  || fail 'staging-up does not define the separate API ops image repository'
grep -F 'export API_IMAGE_REPO API_OPS_IMAGE_REPO WEB_IMAGE_REPO POSTGRES_IMAGE_REPO' \
  "$ROOT_DIR/scripts/deploy/staging-up.sh" >/dev/null \
  || fail 'staging-up does not export the API ops image repository to Compose'
# Assert the literal source text, not the test environment.
# shellcheck disable=SC2016
grep -F '"${API_OPS_IMAGE_REPO}:${IMAGE_TAG}"' \
  "$ROOT_DIR/scripts/deploy/staging-up.sh" >/dev/null \
  || fail 'staging-up does not build or inspect the exact API ops tag'
grep -F -- '--target ops' "$ROOT_DIR/scripts/deploy/staging-up.sh" >/dev/null \
  || fail 'staging-up does not explicitly build the Dockerfile ops target'
# Assert the literal source text, not the test environment.
# shellcheck disable=SC2016
grep -F 'API_OPS_IMAGE_ID=${API_OPS_IMAGE_ID}' \
  "$ROOT_DIR/scripts/deploy/staging-up.sh" >/dev/null \
  || fail 'staging-up does not record the immutable API ops image id'
# Assert the literal Compose interpolation, not the test environment.
# shellcheck disable=SC2016
if [ "$(grep -Fc 'image: ${API_OPS_IMAGE_REPO:-feishu-timeline-api-ops}:${IMAGE_TAG:-local}' \
  "$ROOT_DIR/deploy/compose.staging.yml")" -ne 2 ]; then
  fail 'Compose does not assign the separate API ops image to migrate and seed exactly twice'
fi
if [ "$(grep -Fc '      target: ops' "$ROOT_DIR/deploy/compose.staging.yml")" -ne 2 ]; then
  fail 'Compose does not bind both short-lived operations to the Dockerfile ops target'
fi
if [ "$(grep -Fc '    working_dir: /app' "$ROOT_DIR/deploy/compose.staging.yml")" -ne 2 ]; then
  fail 'Compose operations do not share the expected minimal /app layout'
fi
grep -F '    command: ["/app/node_modules/.bin/prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]' \
  "$ROOT_DIR/deploy/compose.staging.yml" >/dev/null \
  || fail 'Compose migration command is not an explicit argv command in the ops image'
grep -F '    command: ["/app/node_modules/.bin/tsx", "prisma/seed.ts"]' \
  "$ROOT_DIR/deploy/compose.staging.yml" >/dev/null \
  || fail 'Compose seed command is not an explicit argv command in the ops image'
grep -Fx '  apps/api-ops' \
  "$ROOT_DIR/scripts/security/build-company-source-scan-package.sh" >/dev/null \
  || fail 'the immutable company source allowlist omits the API ops package'

for script in scripts/deploy/migrate.sh scripts/deploy/seed.sh; do
  # Assert the literal source text, not the test environment.
  # shellcheck disable=SC2016
  grep -F 'API_OPS_IMAGE_REPO="${API_OPS_IMAGE_REPO:-feishu-timeline-api-ops}"' \
    "$ROOT_DIR/$script" >/dev/null \
    || fail "$script does not restore the API ops repository default"
  grep -F 'export API_OPS_IMAGE_REPO' "$ROOT_DIR/$script" >/dev/null \
    || fail "$script does not export the API ops repository to Compose"
done

for variable in \
  MALWARE_SCANNER_PROVIDER \
  CLAMAV_HOST \
  CLAMAV_PORT \
  CLAMAV_TIMEOUT_MS; do
  grep -F "  ${variable}: \${${variable}:?" \
    "$ROOT_DIR/deploy/compose.staging.yml" >/dev/null \
    || fail "compose.staging.yml does not explicitly require and pass $variable"
  grep -E "^${variable}=" "$ROOT_DIR/deploy/env/staging.env.example" >/dev/null \
    || fail "staging.env.example omits $variable"
done

preflight_base=(
  'DEPLOYMENT_ENV=staging'
  'AUTH_MOCK_ENABLED=false'
  'NEXT_PUBLIC_ENABLE_MOCK_LOGIN=false'
  'POSTGRES_USER=postgres'
  'POSTGRES_PASSWORD=R27aPostgresPassword_2026'
  'DATABASE_URL=postgresql://postgres:R27aPostgresPassword_2026@postgres:5432/feishu_timeline?schema=public'
  'REDIS_PASSWORD=R27aRedisPassword_2026'
  'REDIS_URL=redis://:R27aRedisPassword_2026@redis:6379'
  'OBJECT_STORAGE_PROVIDER=local'
  'MALWARE_SCANNER_PROVIDER=clamav'
  'CLAMAV_HOST=clamav.security.internal'
  'CLAMAV_PORT=3310'
  'CLAMAV_TIMEOUT_MS=15000'
)

run_staging_preflight() {
  # This is a static Bash program using positional parameters.
  # shellcheck disable=SC2016
  env "${preflight_base[@]}" "$@" \
    bash -c '. "$1"; validate_staging_security_env' \
    _ "$ROOT_DIR/scripts/deploy/common.sh"
}

run_staging_preflight >/dev/null \
  || fail 'staging preflight rejected a complete protected configuration'

for invalid_override in \
  'DEPLOYMENT_ENV=production' \
  'DATABASE_URL=' \
  'DATABASE_URL=postgresql://postgres:R27aPostgresPassword_2026@localhost:5432/feishu_timeline' \
  'REDIS_URL=' \
  'MALWARE_SCANNER_PROVIDER=' \
  'MALWARE_SCANNER_PROVIDER=local-eicar' \
  'CLAMAV_HOST=replace-with-approved-clamav-host' \
  'CLAMAV_HOST=localhost' \
  'CLAMAV_PORT=0' \
  'CLAMAV_PORT=65536' \
  'CLAMAV_TIMEOUT_MS=999' \
  'CLAMAV_TIMEOUT_MS=60001'; do
  if run_staging_preflight "$invalid_override" >/dev/null 2>&1; then
    fail "staging preflight accepted unsafe protected configuration: $invalid_override"
  fi
done

PINNED_NODE_IMAGE='node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43'
grep -F "NODE_IMAGE=\"\${NODE_IMAGE:-$PINNED_NODE_IMAGE}\"" \
  "$ROOT_DIR/scripts/deploy/staging-up.sh" >/dev/null \
  || fail 'staging-up does not default NODE_IMAGE to the Dockerfile-pinned digest'
# Assert the literal source text, not the test environment.
# shellcheck disable=SC2016
grep -F 'validate_digest_pinned_image NODE_IMAGE "$NODE_IMAGE"' \
  "$ROOT_DIR/scripts/deploy/staging-up.sh" >/dev/null \
  || fail 'staging-up does not validate NODE_IMAGE before Docker builds'

run_pinned_image_validation() {
  local expected="$1"
  local label="$2"
  local image="$3"
  local rc=0

  bash -c '. "$1"; validate_digest_pinned_image "$2" "$3"' \
    _ "$ROOT_DIR/scripts/deploy/common.sh" "$label" "$image" >/dev/null 2>&1 || rc=$?
  case "$expected" in
    accepted)
      [ "$rc" -eq 0 ] || fail "$label validation rejected a digest-pinned reference: $image"
      ;;
    rejected)
      [ "$rc" -ne 0 ] || fail "$label validation accepted an unsafe or mutable reference: $image"
      ;;
    *)
      fail "unknown pinned image expectation: $expected"
      ;;
  esac
}

run_pinned_image_validation accepted NODE_IMAGE "$PINNED_NODE_IMAGE"
# The literal command substitution is an attack payload.
# shellcheck disable=SC2016
for unsafe_node_image in \
  'node:24-alpine' \
  'node:24-alpine@sha256:deadbeef' \
  'node:24-alpine@sha256:D32CDF619F63FE0471182D08996DD516C6275BB5FD31AE06E55A570BD9E1AD43' \
  'node:24-alpine;command@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43' \
  'node:$(command)@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43' \
  $'node:24-alpine\ncommand@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43'; do
  run_pinned_image_validation rejected NODE_IMAGE "$unsafe_node_image"
done

assert_staging_image_guard() {
  local label="$1"
  local pinned_image="$2"
  local mutable_image="${pinned_image%@sha256:*}"
  local malicious_image="${mutable_image};command@sha256:${pinned_image##*@sha256:}"

  # Assert the literal source text, not the test environment.
  grep -F "validate_digest_pinned_image $label \"\$$label\"" \
    "$ROOT_DIR/scripts/deploy/staging-up.sh" >/dev/null \
    || fail "staging-up does not validate $label before image use"
  run_pinned_image_validation accepted "$label" "$pinned_image"
  run_pinned_image_validation rejected "$label" "$mutable_image"
  run_pinned_image_validation rejected "$label" "$malicious_image"
}

assert_staging_image_guard \
  POSTGRES_BASE_IMAGE \
  'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777'
assert_staging_image_guard \
  REDIS_IMAGE \
  'redis:7-alpine@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99'
assert_staging_image_guard \
  NGINX_IMAGE \
  'nginx:stable-alpine@sha256:ec664813a30459a8e7176315268a623f6b31abc370eeac51c7de81cd4ec4d451'

scan_call="$TMP_DIR/staging-image-scan-call.txt"
awk '
  /scripts\/security\/scan-production-images\.sh/ { capture = 1 }
  capture { print }
  capture && $0 !~ /\\[[:space:]]*$/ { exit }
' "$ROOT_DIR/scripts/deploy/staging-up.sh" >"$scan_call"
# Assert the literal scan argument, not the test environment.
# shellcheck disable=SC2016
grep -F '"${API_OPS_IMAGE_REPO}:${IMAGE_TAG}"' "$scan_call" >/dev/null \
  || fail 'staging-up omits the production-reachable API ops image from the image scan'

printf 'PASS: deployment argument and bootstrap security tests\n'
