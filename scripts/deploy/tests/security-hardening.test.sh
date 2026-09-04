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

LEGACY_DISABLED_EXIT=78
LEGACY_DISABLED_DIAGNOSTIC='[ERROR] RC3 external root-owned controller has not been provided.'
LEGACY_ENTRYPOINTS=(
  scripts/deploy/gce-sync-and-build.sh
  scripts/deploy/gce-redeploy.sh
  scripts/deploy/gce-postgres-bootstrap.sh
  scripts/deploy/backup-postgres.sh
  scripts/deploy/ops-check.sh
)
LEGACY_FAKE_BIN="$TMP_DIR/legacy-fake-bin"
mkdir -p "$LEGACY_FAKE_BIN"
for sink_command in \
  gcloud sudo systemctl docker git pnpm npm npx node curl \
  tee install chown chmod ln; do
  cat >"$LEGACY_FAKE_BIN/$sink_command" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf 'external_sink_called\n' >>"${LEGACY_SINK_LOG:?}"
exit 99
SH
  chmod 0755 "$LEGACY_FAKE_BIN/$sink_command"
done

legacy_guard_prefix="$TMP_DIR/legacy-guard-prefix"
cat >"$legacy_guard_prefix" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' '[ERROR] RC3 external root-owned controller has not been provided.' >&2
exit 78
EOF

for legacy_script in "${LEGACY_ENTRYPOINTS[@]}"; do
  cmp -s "$ROOT_DIR/$legacy_script" "$legacy_guard_prefix" \
    || fail "$legacy_script is not the exact approved fail-closed stub"
done

assert_legacy_entrypoint_disabled() {
  local script="$1"
  local payload_kind="$2"
  local case_dir
  local marker
  local dotenv_marker
  local payload
  local secret
  local stderr_content
  local rc=0

  case_counter=$((case_counter + 1))
  case_dir="$TMP_DIR/legacy-disabled-$case_counter"
  marker="$case_dir/command-marker"
  dotenv_marker="$case_dir/dotenv-marker"
  secret="S001_SECRET_SENTINEL_${case_counter}_DO_NOT_LOG"
  mkdir -p "$case_dir/app/apps/api" "$case_dir/app/apps/web"

  case "$payload_kind" in
    dollar-command) payload='$(touch '"$marker"')' ;;
    backtick-command) payload='`touch '"$marker"'`' ;;
    semicolon) payload="safe;touch $marker" ;;
    newline) payload=$'safe\ntouch '"$marker" ;;
    carriage-return) payload=$'safe\rtouch '"$marker" ;;
    leading-dash) payload='-leading-dash' ;;
    spaces) payload='value with spaces' ;;
    single-quote) payload="value'tail" ;;
    double-quote) payload='value"tail' ;;
    traversal) payload='../../etc/passwd' ;;
    absolute-path) payload='/etc/systemd/system/feishu-timeline.service' ;;
    metacharacters) payload='value|&<>*?[]{}!' ;;
    *) fail "unknown legacy payload kind: $payload_kind" ;;
  esac

  printf '%s\n' \
    "DATABASE_URL=postgresql://user:${secret}@database.invalid/app" \
    'S001_PAYLOAD=$(touch '"$dotenv_marker"')' \
    >"$case_dir/app/apps/api/.env.production"
  printf '%s\n' \
    "S001_SECRET=$secret" \
    'S001_PAYLOAD=$(touch '"$dotenv_marker"')' \
    >"$case_dir/app/apps/web/.env.production"
  : >"$case_dir/sink.log"

  PATH="$LEGACY_FAKE_BIN:$FAKE_BIN:$PATH" \
    LEGACY_SINK_LOG="$case_dir/sink.log" \
    INSTANCE="$payload" \
    APP_ROOT="$case_dir/app" \
    DATABASE_URL="postgresql://user:${secret}@database.invalid/app" \
    FEISHU_APP_SECRET="$secret" \
    bash "$ROOT_DIR/$script" "LEGACY_INPUT=$payload" \
    >"$case_dir/stdout" 2>"$case_dir/stderr" || rc=$?

  [ "$rc" -eq "$LEGACY_DISABLED_EXIT" ] \
    || fail "$script did not return the fixed disabled exit code for $payload_kind"
  [ ! -s "$case_dir/stdout" ] \
    || fail "$script emitted stdout while disabled for $payload_kind"
  stderr_content="$(<"$case_dir/stderr")"
  [ "$stderr_content" = "$LEGACY_DISABLED_DIAGNOSTIC" ] \
    || fail "$script emitted a non-canonical diagnostic for $payload_kind"
  [ ! -e "$marker" ] \
    || fail "$script executed the $payload_kind command payload"
  [ ! -e "$dotenv_marker" ] \
    || fail "$script interpreted application dotenv as shell syntax"
  [ ! -s "$case_dir/sink.log" ] \
    || fail "$script invoked an external privileged or deployment sink"
  if grep -F "$secret" "$case_dir/stdout" "$case_dir/stderr" >/dev/null; then
    fail "$script exposed a secret in its disabled diagnostic"
  fi
}

legacy_payload_kinds=(
  dollar-command
  backtick-command
  semicolon
  newline
  carriage-return
  leading-dash
  spaces
  single-quote
  double-quote
  traversal
  absolute-path
  metacharacters
)
for legacy_script in "${LEGACY_ENTRYPOINTS[@]}"; do
  for payload_kind in "${legacy_payload_kinds[@]}"; do
    assert_legacy_entrypoint_disabled "$legacy_script" "$payload_kind"
  done
done

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
for expected_upload_setting in \
  'UPLOAD_ADMISSION_GLOBAL_LIMIT=4' \
  'UPLOAD_ADMISSION_PER_ACTOR_LIMIT=2' \
  'UPLOAD_ADMISSION_PER_TARGET_LIMIT=3' \
  'UPLOAD_ADMISSION_RATE_MAX_REQUESTS=6' \
  'UPLOAD_ADMISSION_RATE_WINDOW_MS=60000'; do
  grep -Fx "$expected_upload_setting" "$PRODUCTION_ENV_TEMPLATE" >/dev/null \
    || fail "root production env template omits upload admission setting: $expected_upload_setting"
done
for expected_download_setting in \
  'DOWNLOAD_ADMISSION_GLOBAL_LIMIT=8' \
  'DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT=2' \
  'DOWNLOAD_ADMISSION_PER_TARGET_LIMIT=2' \
  'DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS=12' \
  'DOWNLOAD_ADMISSION_RATE_WINDOW_MS=60000'; do
  grep -Fx "$expected_download_setting" "$PRODUCTION_ENV_TEMPLATE" >/dev/null \
    || fail "root production env template omits download admission setting: $expected_download_setting"
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

# The RC1 deployment path consumes only the independently approved, digest-pinned
# operations image. Repository-local image construction is disabled until RC3.
# shellcheck disable=SC2016
if [ "$(grep -Fc 'image: ${APPROVED_API_OPS_IMAGE_REPOSITORY:?Set the approved API operations image repository}@sha256:${APPROVED_API_OPS_IMAGE_DIGEST:?Set the approved API operations image digest}' \
  "$ROOT_DIR/deploy/compose.staging.yml")" -ne 2 ]; then
  fail 'Compose does not assign the approved API ops digest to migrate and seed exactly twice'
fi
if grep -F '      target: ops' "$ROOT_DIR/deploy/compose.staging.yml" >/dev/null; then
  fail 'Compose still permits repository-local API ops image construction'
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
  grep -Fx 'load_compose_env' "$ROOT_DIR/$script" >/dev/null \
    || fail "$script does not run the shared six-image preflight"
  if grep -E 'API_OPS_IMAGE_REPO|load_release_state_if_present' "$ROOT_DIR/$script" >/dev/null; then
    fail "$script still permits legacy release-state image selection"
  fi
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
for setting in \
  'UPLOAD_ADMISSION_GLOBAL_LIMIT: ${UPLOAD_ADMISSION_GLOBAL_LIMIT:-4}' \
  'UPLOAD_ADMISSION_PER_ACTOR_LIMIT: ${UPLOAD_ADMISSION_PER_ACTOR_LIMIT:-2}' \
  'UPLOAD_ADMISSION_PER_TARGET_LIMIT: ${UPLOAD_ADMISSION_PER_TARGET_LIMIT:-3}' \
  'UPLOAD_ADMISSION_RATE_MAX_REQUESTS: ${UPLOAD_ADMISSION_RATE_MAX_REQUESTS:-6}' \
  'UPLOAD_ADMISSION_RATE_WINDOW_MS: ${UPLOAD_ADMISSION_RATE_WINDOW_MS:-60000}'; do
  grep -F "  $setting" "$ROOT_DIR/deploy/compose.staging.yml" >/dev/null \
    || fail "compose.staging.yml omits upload admission pass-through: $setting"
done
for setting in \
  'DOWNLOAD_ADMISSION_GLOBAL_LIMIT: ${DOWNLOAD_ADMISSION_GLOBAL_LIMIT:-8}' \
  'DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT: ${DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT:-2}' \
  'DOWNLOAD_ADMISSION_PER_TARGET_LIMIT: ${DOWNLOAD_ADMISSION_PER_TARGET_LIMIT:-2}' \
  'DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS: ${DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS:-12}' \
  'DOWNLOAD_ADMISSION_RATE_WINDOW_MS: ${DOWNLOAD_ADMISSION_RATE_WINDOW_MS:-60000}'; do
  grep -F "  $setting" "$ROOT_DIR/deploy/compose.staging.yml" >/dev/null \
    || fail "compose.staging.yml omits download admission pass-through: $setting"
done
grep -F '    mem_limit: ${API_MEM_LIMIT:-768m}' "$ROOT_DIR/deploy/compose.staging.yml" >/dev/null \
  || fail 'compose.staging.yml does not set an API memory limit'
grep -F '    pids_limit: ${API_PIDS_LIMIT:-256}' "$ROOT_DIR/deploy/compose.staging.yml" >/dev/null \
  || fail 'compose.staging.yml does not set an API PID limit'
grep -Fx 'MemoryMax=768M' "$ROOT_DIR/deploy/systemd/feishu-timeline-api.service" >/dev/null \
  || fail 'API systemd unit does not set MemoryMax'
grep -Fx 'TasksMax=256' "$ROOT_DIR/deploy/systemd/feishu-timeline-api.service" >/dev/null \
  || fail 'API systemd unit does not set TasksMax'
for nginx_config in \
  deploy/nginx/compose.staging.conf \
  deploy/nginx/feishu-timeline.conf \
  deploy/nginx/timeline.all-too-well.com.conf; do
  for directive in \
    'map $http_content_type' \
    '"~*^multipart/form-data(?:;|$)" $binary_remote_addr;' \
    'limit_conn_zone $' \
    '_upload_client zone=' \
    'limit_req_zone $' \
    'client_max_body_size 21m;' \
    'client_body_timeout 15s;' \
    'limit_conn_status 429;' \
    'limit_req_status 429;' \
    'proxy_request_buffering off;' \
    'add_header Retry-After "1" always;'; do
    grep -F "$directive" "$ROOT_DIR/$nginx_config" >/dev/null \
      || fail "$nginx_config omits upload ingress control: $directive"
  done
  for download_directive in \
    'location ~* ^/api/(?:attachments/[A-Za-z0-9_-]+/content|projects/[A-Za-z0-9_-]+/attachments/[A-Za-z0-9_-]+/download|v2/tasks/[A-Za-z0-9_-]+/materials/[A-Za-z0-9_-]+/content)/?$ {' \
    'download_conn 4;' \
    'download_rate burst=8 nodelay;' \
    'proxy_buffering off;' \
    'send_timeout 30s;' \
    'proxy_ignore_client_abort off;'; do
    grep -F "$download_directive" "$ROOT_DIR/$nginx_config" >/dev/null \
      || fail "$nginx_config omits download ingress control: $download_directive"
  done
done
download_route_ere='^/api/(attachments/[A-Za-z0-9_-]+/content|projects/[A-Za-z0-9_-]+/attachments/[A-Za-z0-9_-]+/download|v2/tasks/[A-Za-z0-9_-]+/materials/[A-Za-z0-9_-]+/content)/?$'
for request_uri in \
  '/api/attachments/attachment-1/content' \
  '/api/projects/project-1/attachments/attachment-1/download/' \
  '/API/V2/TASKS/task-1/MATERIALS/attachment-1/CONTENT' \
  '/api/projects/project-1/attachments/attachment-1/download?disposition=inline'; do
  location_uri="${request_uri%%\?*}"
  printf '%s\n' "$location_uri" | grep -Eiq "$download_route_ere" \
    || fail "download ingress route pattern misses: $request_uri"
done
for request_uri in \
  '/api/projects/project-1/attachments' \
  '/api/projects/project-1/attachments/upload' \
  '/api/v2/tasks/task-1/materials' \
  '/api/health'; do
  if printf '%s\n' "$request_uri" | grep -Eiq "$download_route_ere"; then
    fail "download ingress route pattern overmatches: $request_uri"
  fi
done
for directive in \
  'map \$http_content_type \$feishu_timeline_upload_client' \
  '"~*^multipart/form-data(?:;|\$)" \$binary_remote_addr;' \
  'limit_conn_zone \$feishu_timeline_upload_client' \
  'limit_req_zone \$feishu_timeline_upload_client' \
  'client_max_body_size 21m;' \
  'client_body_timeout 15s;' \
  'proxy_request_buffering off;' \
  'add_header Retry-After "1" always;'; do
  grep -F "$directive" "$ROOT_DIR/scripts/deploy/gce-postcutover-hardening.sh" >/dev/null \
    || fail "gce-postcutover-hardening.sh omits upload ingress control: $directive"
done
for directive in \
  'limit_conn_zone \$binary_remote_addr zone=feishu_timeline_download_conn:10m;' \
  'limit_req_zone \$binary_remote_addr zone=feishu_timeline_download_rate:10m rate=6r/s;' \
  'location ~* ^/api/(?:attachments/[A-Za-z0-9_-]+/content|projects/[A-Za-z0-9_-]+/attachments/[A-Za-z0-9_-]+/download|v2/tasks/[A-Za-z0-9_-]+/materials/[A-Za-z0-9_-]+/content)/?\$ {' \
  'limit_conn feishu_timeline_download_conn 4;' \
  'limit_req zone=feishu_timeline_download_rate burst=8 nodelay;' \
  'proxy_buffering off;' \
  'send_timeout 30s;' \
  'proxy_ignore_client_abort off;'; do
  grep -F "$directive" "$ROOT_DIR/scripts/deploy/gce-postcutover-hardening.sh" >/dev/null \
    || fail "gce-postcutover-hardening.sh omits download ingress control: $directive"
done

PREFLIGHT_SOURCE_COMMIT=1111111111111111111111111111111111111111
PREFLIGHT_SOURCE_TREE=2222222222222222222222222222222222222222
PREFLIGHT_RELEASE=r27rc1.security-test
PREFLIGHT_BUILD_TIME=2026-09-04T05:30:00Z
PREFLIGHT_API_REPOSITORY=registry.example.test/feishu/api
PREFLIGHT_API_DIGEST=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
PREFLIGHT_API_IMAGE="$PREFLIGHT_API_REPOSITORY@sha256:$PREFLIGHT_API_DIGEST"
PREFLIGHT_API_OPS_REPOSITORY=registry.example.test/feishu/api-ops
PREFLIGHT_API_OPS_DIGEST=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
PREFLIGHT_API_OPS_IMAGE="$PREFLIGHT_API_OPS_REPOSITORY@sha256:$PREFLIGHT_API_OPS_DIGEST"
PREFLIGHT_WEB_REPOSITORY=registry.example.test/feishu/web
PREFLIGHT_WEB_DIGEST=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
PREFLIGHT_WEB_IMAGE="$PREFLIGHT_WEB_REPOSITORY@sha256:$PREFLIGHT_WEB_DIGEST"
PREFLIGHT_POSTGRES_REPOSITORY=registry.example.test/feishu/postgres
PREFLIGHT_POSTGRES_DIGEST=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
PREFLIGHT_POSTGRES_IMAGE="$PREFLIGHT_POSTGRES_REPOSITORY@sha256:$PREFLIGHT_POSTGRES_DIGEST"
PREFLIGHT_REDIS_REPOSITORY=registry.example.test/feishu/redis
PREFLIGHT_REDIS_DIGEST=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
PREFLIGHT_REDIS_IMAGE="$PREFLIGHT_REDIS_REPOSITORY@sha256:$PREFLIGHT_REDIS_DIGEST"
PREFLIGHT_NGINX_REPOSITORY=registry.example.test/feishu/nginx
PREFLIGHT_NGINX_DIGEST=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
PREFLIGHT_NGINX_IMAGE="$PREFLIGHT_NGINX_REPOSITORY@sha256:$PREFLIGHT_NGINX_DIGEST"
PREFLIGHT_MANIFEST="$TMP_DIR/preflight-release-manifest.json"
printf '%s\n' \
  '{"schemaVersion":1,"identity":{"sourceCommit":"1111111111111111111111111111111111111111","sourceTree":"2222222222222222222222222222222222222222","release":"r27rc1.security-test","buildTime":"2026-09-04T05:30:00Z"},"images":{"api":{"imageId":"sha256:4444444444444444444444444444444444444444444444444444444444444444","repositoryDigest":"registry.example.test/feishu/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"apiOps":{"imageId":"sha256:5555555555555555555555555555555555555555555555555555555555555555","repositoryDigest":"registry.example.test/feishu/api-ops@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"web":{"imageId":"sha256:6666666666666666666666666666666666666666666666666666666666666666","repositoryDigest":"registry.example.test/feishu/web@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},"postgres":{"imageId":"sha256:7777777777777777777777777777777777777777777777777777777777777777","repositoryDigest":"registry.example.test/feishu/postgres@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},"redis":{"imageId":"sha256:8888888888888888888888888888888888888888888888888888888888888888","repositoryDigest":"registry.example.test/feishu/redis@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"},"nginx":{"imageId":"sha256:9999999999999999999999999999999999999999999999999999999999999999","repositoryDigest":"registry.example.test/feishu/nginx@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}}}' \
  >"$PREFLIGHT_MANIFEST"

preflight_base=(
  'DEPLOYMENT_ENV=staging'
  "APPROVED_RELEASE_MANIFEST=$PREFLIGHT_MANIFEST"
  "APPROVED_API_IMAGE_REPOSITORY=$PREFLIGHT_API_REPOSITORY"
  "APPROVED_API_IMAGE_DIGEST=$PREFLIGHT_API_DIGEST"
  "APPROVED_API_OPS_IMAGE_REPOSITORY=$PREFLIGHT_API_OPS_REPOSITORY"
  "APPROVED_API_OPS_IMAGE_DIGEST=$PREFLIGHT_API_OPS_DIGEST"
  "APPROVED_WEB_IMAGE_REPOSITORY=$PREFLIGHT_WEB_REPOSITORY"
  "APPROVED_WEB_IMAGE_DIGEST=$PREFLIGHT_WEB_DIGEST"
  "APPROVED_POSTGRES_IMAGE_REPOSITORY=$PREFLIGHT_POSTGRES_REPOSITORY"
  "APPROVED_POSTGRES_IMAGE_DIGEST=$PREFLIGHT_POSTGRES_DIGEST"
  "APPROVED_REDIS_IMAGE_REPOSITORY=$PREFLIGHT_REDIS_REPOSITORY"
  "APPROVED_REDIS_IMAGE_DIGEST=$PREFLIGHT_REDIS_DIGEST"
  "APPROVED_NGINX_IMAGE_REPOSITORY=$PREFLIGHT_NGINX_REPOSITORY"
  "APPROVED_NGINX_IMAGE_DIGEST=$PREFLIGHT_NGINX_DIGEST"
  "EXPECTED_SOURCE_COMMIT=$PREFLIGHT_SOURCE_COMMIT"
  "EXPECTED_SOURCE_TREE=$PREFLIGHT_SOURCE_TREE"
  "EXPECTED_RELEASE=$PREFLIGHT_RELEASE"
  "EXPECTED_BUILD_TIME=$PREFLIGHT_BUILD_TIME"
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
  'UPLOAD_ADMISSION_GLOBAL_LIMIT=4'
  'UPLOAD_ADMISSION_PER_ACTOR_LIMIT=2'
  'UPLOAD_ADMISSION_PER_TARGET_LIMIT=3'
  'UPLOAD_ADMISSION_RATE_MAX_REQUESTS=6'
  'UPLOAD_ADMISSION_RATE_WINDOW_MS=60000'
  'DOWNLOAD_ADMISSION_GLOBAL_LIMIT=8'
  'DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT=2'
  'DOWNLOAD_ADMISSION_PER_TARGET_LIMIT=2'
  'DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS=12'
  'DOWNLOAD_ADMISSION_RATE_WINDOW_MS=60000'
  'API_MEM_LIMIT=768m'
  'API_PIDS_LIMIT=256'
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

for invalid_override in \
  'UPLOAD_ADMISSION_GLOBAL_LIMIT=0' \
  'UPLOAD_ADMISSION_GLOBAL_LIMIT=5' \
  'UPLOAD_ADMISSION_PER_ACTOR_LIMIT=0' \
  'UPLOAD_ADMISSION_PER_ACTOR_LIMIT=5' \
  'UPLOAD_ADMISSION_PER_TARGET_LIMIT=0' \
  'UPLOAD_ADMISSION_PER_TARGET_LIMIT=5' \
  'UPLOAD_ADMISSION_RATE_MAX_REQUESTS=0' \
  'UPLOAD_ADMISSION_RATE_MAX_REQUESTS=61' \
  'UPLOAD_ADMISSION_RATE_WINDOW_MS=999' \
  'UPLOAD_ADMISSION_RATE_WINDOW_MS=300001' \
  'DOWNLOAD_ADMISSION_GLOBAL_LIMIT=0' \
  'DOWNLOAD_ADMISSION_GLOBAL_LIMIT=33' \
  'DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT=0' \
  'DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT=9' \
  'DOWNLOAD_ADMISSION_PER_TARGET_LIMIT=0' \
  'DOWNLOAD_ADMISSION_PER_TARGET_LIMIT=9' \
  'DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS=0' \
  'DOWNLOAD_ADMISSION_RATE_MAX_REQUESTS=121' \
  'DOWNLOAD_ADMISSION_RATE_WINDOW_MS=999' \
  'DOWNLOAD_ADMISSION_RATE_WINDOW_MS=300001' \
  'API_MEM_LIMIT=128m' \
  'API_MEM_LIMIT=5g' \
  'API_PIDS_LIMIT=63' \
  'API_PIDS_LIMIT=1025'; do
  if run_staging_preflight "$invalid_override" >/dev/null 2>&1; then
    fail "staging preflight accepted unsafe upload/resource configuration: $invalid_override"
  fi
done
if run_staging_preflight \
  'UPLOAD_ADMISSION_GLOBAL_LIMIT=2' \
  'UPLOAD_ADMISSION_PER_ACTOR_LIMIT=3' >/dev/null 2>&1; then
  fail 'staging preflight accepted a per-actor upload limit above the global limit'
fi
if run_staging_preflight \
  'DOWNLOAD_ADMISSION_GLOBAL_LIMIT=2' \
  'DOWNLOAD_ADMISSION_PER_ACTOR_LIMIT=3' >/dev/null 2>&1; then
  fail 'staging preflight accepted a per-actor download limit above the global limit'
fi
if run_staging_preflight \
  'DOWNLOAD_ADMISSION_GLOBAL_LIMIT=2' \
  'DOWNLOAD_ADMISSION_PER_TARGET_LIMIT=3' >/dev/null 2>&1; then
  fail 'staging preflight accepted a per-target download limit above the global limit'
fi

PINNED_NODE_IMAGE='node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43'

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

run_pinned_image_validation accepted RELEASE_IMAGE "$PREFLIGHT_API_IMAGE"
run_pinned_image_validation rejected RELEASE_IMAGE \
  'replace-with-approved-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
run_pinned_image_validation rejected RELEASE_IMAGE \
  'registry.example.test/feishu/api@sha256:0000000000000000000000000000000000000000000000000000000000000000'

printf 'PASS: deployment argument and bootstrap security tests\n'
