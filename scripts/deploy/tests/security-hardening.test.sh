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
      printf 'count=0\nerror_count=0\njournal_error_count=0\n'
      ;;
    http_error_counts)
      printf 'count=0\nerror_count=1\njournal_error_count=1\n'
      ;;
    http_unavailable)
      printf 'count=0\nerror_count=0\njournal_error_count=unavailable\n'
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
grep -F 'sudo install -d -m 0700 -o "$current_user" -g "$current_group" "$backup_root"' \
  "$ROOT_DIR/scripts/deploy/backup-postgres.sh" >/dev/null \
  || fail 'backup-postgres does not create its sensitive backup root with mode 0700'
grep -F 'Backup root must be a private non-symlink directory owned by the invoking identity.' \
  "$ROOT_DIR/scripts/deploy/backup-postgres.sh" >/dev/null \
  || fail 'backup-postgres does not fail closed on an unsafe existing backup root'
grep -F 'Canonical API env is not a root-owned regular file.' \
  "$ROOT_DIR/scripts/deploy/backup-postgres.sh" >/dev/null \
  || fail 'backup-postgres does not establish a root-owned canonical API env boundary before parsing secrets'
grep -F 'Strict dotenv tool is not a root-owned regular file.' \
  "$ROOT_DIR/scripts/deploy/backup-postgres.sh" >/dev/null \
  || fail 'backup-postgres can execute a non-root-owned credential helper as root'
if grep -F 'source = source.replace(old, new)' \
  "$ROOT_DIR/scripts/deploy/backup-postgres.sh" >/dev/null; then
  fail 'backup-postgres restore drill corrupts SQL literals through global schema-name replacement'
fi
grep -F 'postgres_exec_database "$restore_database" /usr/bin/pg_restore --exit-on-error --no-owner "$backup_file"' \
  "$ROOT_DIR/scripts/deploy/backup-postgres.sh" >/dev/null \
  || fail 'backup-postgres restore drill does not restore the custom archive into an isolated database'
grep -F 'sudo -u postgres /usr/bin/dropdb --if-exists -- "$restore_database"' \
  "$ROOT_DIR/scripts/deploy/backup-postgres.sh" >/dev/null \
  || fail 'backup-postgres restore drill does not clean up its isolated database'
grep -F 'secrets.token_hex(16)' \
  "$ROOT_DIR/scripts/deploy/backup-postgres.sh" >/dev/null \
  || fail 'backup-postgres restore drill uses a predictable privileged database name'
grep -F 'if [[ "$RESTORE_DATABASE_CREATED" = yes ]]; then' \
  "$ROOT_DIR/scripts/deploy/backup-postgres.sh" >/dev/null \
  || fail 'backup-postgres can drop a pre-existing database after createdb fails'
BACKUP_DRILL_CREATEDB_LINE="$(grep -n -F 'sudo -u postgres /usr/bin/createdb' \
  "$ROOT_DIR/scripts/deploy/backup-postgres.sh" | tail -1 | cut -d: -f1)"
BACKUP_DRILL_CREATED_FLAG_LINE="$(grep -n -F 'RESTORE_DATABASE_CREATED=yes' \
  "$ROOT_DIR/scripts/deploy/backup-postgres.sh" | tail -1 | cut -d: -f1)"
[[ "$BACKUP_DRILL_CREATEDB_LINE" =~ ^[0-9]+$ \
    && "$BACKUP_DRILL_CREATED_FLAG_LINE" =~ ^[0-9]+$ \
    && "$BACKUP_DRILL_CREATEDB_LINE" -lt "$BACKUP_DRILL_CREATED_FLAG_LINE" ]] \
  || fail 'backup-postgres marks the isolated database as owned before createdb succeeds'
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

HTTP_ERROR_GATE_CASE="$TMP_DIR/http-error-count-gate"
mkdir -p "$HTTP_ERROR_GATE_CASE"
http_error_gate_rc=0
PATH="$FAKE_BIN:$PATH" \
  GCLOUD_TEST_MODE=http_error_counts \
  GCLOUD_TEST_LOG="$HTTP_ERROR_GATE_CASE/gcloud.log" \
  bash "$ROOT_DIR/scripts/deploy/check-http-errors.sh" INSTANCE=normal-instance \
  >"$HTTP_ERROR_GATE_CASE/stdout" 2>"$HTTP_ERROR_GATE_CASE/stderr" \
  || http_error_gate_rc=$?
[ "$http_error_gate_rc" -ne 0 ] \
  || fail 'check-http-errors returned PASS despite recent Nginx/API error counts'
grep -F '[FAIL] Recent nginx error-log count=1' "$HTTP_ERROR_GATE_CASE/stderr" >/dev/null \
  || fail 'check-http-errors did not fail the Nginx error-log count gate'
grep -F '[FAIL] Recent API journal error count=1' "$HTTP_ERROR_GATE_CASE/stderr" >/dev/null \
  || fail 'check-http-errors did not fail the API journal error count gate'

HTTP_UNAVAILABLE_CASE="$TMP_DIR/http-unavailable-gate"
mkdir -p "$HTTP_UNAVAILABLE_CASE"
http_unavailable_rc=0
PATH="$FAKE_BIN:$PATH" \
  GCLOUD_TEST_MODE=http_unavailable \
  GCLOUD_TEST_LOG="$HTTP_UNAVAILABLE_CASE/gcloud.log" \
  bash "$ROOT_DIR/scripts/deploy/check-http-errors.sh" INSTANCE=normal-instance \
  >"$HTTP_UNAVAILABLE_CASE/stdout" 2>"$HTTP_UNAVAILABLE_CASE/stderr" \
  || http_unavailable_rc=$?
[ "$http_unavailable_rc" -ne 0 ] \
  || fail 'check-http-errors returned PASS when a required journal metric was unavailable'

for script in \
  scripts/deploy/ops-check.sh \
  scripts/deploy/backup-postgres.sh \
  scripts/deploy/check-http-errors.sh; do
  if grep -En '(^|[^[:alnum:]_])eval([[:space:]]|$)' "$ROOT_DIR/$script" >/dev/null; then
    fail "$script still uses eval"
  fi
done

DOTENV_DATA_TOOL="$ROOT_DIR/scripts/deploy/dotenv-data.py"
DOTENV_CASE_DIR="$TMP_DIR/dotenv-data"
DOTENV_MARKER="$DOTENV_CASE_DIR/executed-marker"
DOTENV_CAPTURE="$DOTENV_CASE_DIR/captured.json"
mkdir -p "$DOTENV_CASE_DIR"

cat >"$DOTENV_CASE_DIR/literal-values.env" <<EOF
NODE_ENV=production
DEPLOYMENT_ENV=production
DATABASE_URL=postgresql://db:literal\$(touch $DOTENV_MARKER)@database/db
REDIS_URL=redis://literal\`touch $DOTENV_MARKER\`;still-data
OBJECT_STORAGE_LOCAL_ROOT=/opt/feishu_timeline_app/var/object-storage;touch $DOTENV_MARKER
EOF

python3 "$DOTENV_DATA_TOOL" validate --profile api "$DOTENV_CASE_DIR/literal-values.env" \
  || fail 'strict dotenv parser rejected syntactically valid literal shell metacharacters'
python3 "$DOTENV_DATA_TOOL" exec --profile api "$DOTENV_CASE_DIR/literal-values.env" -- \
  python3 -c 'import json, os, sys; json.dump({key: os.environ[key] for key in ("DATABASE_URL", "REDIS_URL", "OBJECT_STORAGE_LOCAL_ROOT")}, open(sys.argv[1], "w"))' \
  "$DOTENV_CAPTURE" \
  || fail 'strict dotenv parser could not pass literal values directly to execve'
[ ! -e "$DOTENV_MARKER" ] \
  || fail 'strict dotenv data parsing executed a shell payload'
python3 - "$DOTENV_CAPTURE" "$DOTENV_MARKER" <<'PY' \
  || fail 'strict dotenv parser did not preserve malicious-looking values as inert data'
import json
import sys

data = json.load(open(sys.argv[1]))
marker = sys.argv[2]
assert data['DATABASE_URL'] == f'postgresql://db:literal$(touch {marker})@database/db'
assert data['REDIS_URL'] == f'redis://literal`touch {marker}`;still-data'
assert data['OBJECT_STORAGE_LOCAL_ROOT'] == f'/opt/feishu_timeline_app/var/object-storage;touch {marker}'
PY

WEB_AMBIENT_CAPTURE="$DOTENV_CASE_DIR/web-ambient-captured.json"
cat >"$DOTENV_CASE_DIR/web-minimal.env" <<'EOF'
NEXT_PUBLIC_API_BASE_URL=/api
EOF
env \
  FEISHU_APP_SECRET=ambient-api-secret \
  DATABASE_URL=postgresql://ambient/secret \
  NODE_OPTIONS=--trace-warnings \
  python3 "$DOTENV_DATA_TOOL" exec --profile web "$DOTENV_CASE_DIR/web-minimal.env" -- \
    python3 -c 'import json, os, sys; json.dump({key: os.environ.get(key) for key in ("FEISHU_APP_SECRET", "DATABASE_URL", "NODE_OPTIONS", "NEXT_PUBLIC_API_BASE_URL")}, open(sys.argv[1], "w"))' \
    "$WEB_AMBIENT_CAPTURE" \
  || fail 'strict dotenv parser could not exec a Web command from a clear environment'
python3 - "$WEB_AMBIENT_CAPTURE" <<'PY' \
  || fail 'strict dotenv exec leaked ambient API secrets or runtime controls into the Web profile'
import json
import sys

data = json.load(open(sys.argv[1]))
assert data['FEISHU_APP_SECRET'] is None
assert data['DATABASE_URL'] is None
assert data['NODE_OPTIONS'] is None
assert data['NEXT_PUBLIC_API_BASE_URL'] == '/api'
PY

CREDENTIAL_EXEC_CASE="$DOTENV_CASE_DIR/credential-exec"
mkdir -p "$CREDENTIAL_EXEC_CASE/bin"
cat >"$CREDENTIAL_EXEC_CASE/bin/psql" <<'PY'
#!/usr/bin/env python3
import json
import os
from pathlib import Path
import stat
import sys

capture = Path(sys.argv[sys.argv.index('--capture') + 1])
pgpass = Path(os.environ['PGPASSFILE'])
capture.write_text(json.dumps({
    'argv': sys.argv[1:],
    'database_url': os.environ.get('DATABASE_URL'),
    'pgdatabase': os.environ.get('PGDATABASE'),
    'pghost': os.environ.get('PGHOST'),
    'pgpass': pgpass.read_text(),
    'pgpass_mode': stat.S_IMODE(pgpass.stat().st_mode),
    'pgpass_path': str(pgpass),
    'pgpassword': os.environ.get('PGPASSWORD'),
    'pgport': os.environ.get('PGPORT'),
    'pgsslmode': os.environ.get('PGSSLMODE'),
    'pguser': os.environ.get('PGUSER'),
}))
PY
cat >"$CREDENTIAL_EXEC_CASE/bin/redis-cli" <<'PY'
#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sys

capture = Path(sys.argv[sys.argv.index('--capture') + 1])
capture.write_text(json.dumps({
    'argv': sys.argv[1:],
    'auth': os.environ.get('REDISCLI_AUTH'),
    'redis_url': os.environ.get('REDIS_URL'),
}))
PY
chmod 0700 "$CREDENTIAL_EXEC_CASE/bin/psql" "$CREDENTIAL_EXEC_CASE/bin/redis-cli"
cat >"$CREDENTIAL_EXEC_CASE/api.env" <<'EOF'
DATABASE_URL=postgresql://dbuser:p%40ss%3Aword%5Ctail@db.internal:5433/appdb?schema=public&sslmode=require
REDIS_URL=rediss://worker:redis%3Asecret@redis.internal:6380/2
EOF
chmod 0600 "$CREDENTIAL_EXEC_CASE/api.env"
POSTGRES_CREDENTIAL_CAPTURE="$CREDENTIAL_EXEC_CASE/postgres.json"
DATABASE_URL='postgresql://ambient:must-not-leak@example/ambient' \
PGPASSWORD='ambient-must-not-leak' \
  python3 "$DOTENV_DATA_TOOL" postgres-exec \
    --profile api "$CREDENTIAL_EXEC_CASE/api.env" -- \
    "$CREDENTIAL_EXEC_CASE/bin/psql" --capture "$POSTGRES_CREDENTIAL_CAPTURE" \
  || fail 'credential-safe PostgreSQL exec rejected a valid private connection URL'
python3 - "$POSTGRES_CREDENTIAL_CAPTURE" <<'PY' \
  || fail 'credential-safe PostgreSQL exec leaked credentials through argv or ambient env'
import json
from pathlib import Path
import sys

data = json.load(open(sys.argv[1]))
assert all('p@ss' not in argument and 'secret' not in argument for argument in data['argv'])
assert data['database_url'] is None
assert data['pgdatabase'] == 'appdb'
assert data['pghost'] == 'db.internal'
assert data['pgpass'] == 'db.internal:5433:appdb:dbuser:p@ss\\:word\\\\tail\n'
assert data['pgpass_mode'] == 0o600
assert data['pgpassword'] is None
assert data['pgport'] == '5433'
assert data['pgsslmode'] == 'require'
assert data['pguser'] == 'dbuser'
assert not Path(data['pgpass_path']).exists()
PY
POSTGRES_SELECTOR_CAPTURE="$CREDENTIAL_EXEC_CASE/postgres-selector.json"
python3 "$DOTENV_DATA_TOOL" postgres-exec \
  --profile api \
  --database r27_restore_selector \
  "$CREDENTIAL_EXEC_CASE/api.env" -- \
  "$CREDENTIAL_EXEC_CASE/bin/psql" --capture "$POSTGRES_SELECTOR_CAPTURE" \
  || fail 'credential-safe PostgreSQL exec rejected a strict database selector'
python3 - "$POSTGRES_SELECTOR_CAPTURE" <<'PY' \
  || fail 'credential-safe PostgreSQL database selector did not rebind both libpq and pgpass'
import json
import sys

data = json.load(open(sys.argv[1]))
assert data['pgdatabase'] == 'r27_restore_selector'
assert data['pgpass'] == 'db.internal:5433:r27_restore_selector:dbuser:p@ss\\:word\\\\tail\n'
assert not any(argument.startswith(('-d', '--dbname')) for argument in data['argv'])
PY
if python3 "$DOTENV_DATA_TOOL" postgres-exec \
    --profile api \
    --database '../other' \
    "$CREDENTIAL_EXEC_CASE/api.env" -- \
    "$CREDENTIAL_EXEC_CASE/bin/psql" --capture "$CREDENTIAL_EXEC_CASE/unsafe-selector.json" \
    >/dev/null 2>&1; then
  fail 'credential-safe PostgreSQL exec accepted an unsafe database selector'
fi
[ ! -e "$CREDENTIAL_EXEC_CASE/unsafe-selector.json" ] \
  || fail 'credential-safe PostgreSQL exec reached the client after rejecting an unsafe database selector'
REDIS_CREDENTIAL_CAPTURE="$CREDENTIAL_EXEC_CASE/redis.json"
REDIS_URL='redis://ambient:must-not-leak@example/0' \
  python3 "$DOTENV_DATA_TOOL" redis-exec \
    --profile api "$CREDENTIAL_EXEC_CASE/api.env" -- \
    "$CREDENTIAL_EXEC_CASE/bin/redis-cli" --capture "$REDIS_CREDENTIAL_CAPTURE" --raw ping \
  || fail 'credential-safe Redis exec rejected a valid private connection URL'
python3 - "$REDIS_CREDENTIAL_CAPTURE" <<'PY' \
  || fail 'credential-safe Redis exec leaked credentials through argv or ambient env'
import json
import sys

data = json.load(open(sys.argv[1]))
assert all('redis:secret' not in argument for argument in data['argv'])
assert data['auth'] == 'redis:secret'
assert data['redis_url'] is None
assert data['argv'][:8] == ['-h', 'redis.internal', '-p', '6380', '-n', '2', '--user', 'worker']
assert '--tls' in data['argv']
PY
cat >"$CREDENTIAL_EXEC_CASE/unsafe-query.env" <<'EOF'
DATABASE_URL=postgresql://dbuser:secret@db.internal/appdb?sslpassword=must-not-pass
EOF
chmod 0600 "$CREDENTIAL_EXEC_CASE/unsafe-query.env"
if python3 "$DOTENV_DATA_TOOL" postgres-exec \
    --profile api "$CREDENTIAL_EXEC_CASE/unsafe-query.env" -- \
    "$CREDENTIAL_EXEC_CASE/bin/psql" --capture "$CREDENTIAL_EXEC_CASE/unsafe.json" \
    >/dev/null 2>&1; then
  fail 'credential-safe PostgreSQL exec accepted a password-bearing query override'
fi
[ ! -e "$CREDENTIAL_EXEC_CASE/unsafe.json" ] \
  || fail 'credential-safe PostgreSQL exec reached the client after rejecting an unsafe URL'

cat >"$DOTENV_CASE_DIR/duplicate.env" <<'EOF'
DATABASE_URL=one
DATABASE_URL=two
EOF
if python3 "$DOTENV_DATA_TOOL" validate --profile api "$DOTENV_CASE_DIR/duplicate.env" >/dev/null 2>&1; then
  fail 'strict dotenv parser accepted a duplicate key'
fi

cat >"$DOTENV_CASE_DIR/invalid-key.env" <<'EOF'
DATABASE_URL=one
UNAPPROVED_RUNTIME_KEY=two
EOF
if python3 "$DOTENV_DATA_TOOL" validate --profile api "$DOTENV_CASE_DIR/invalid-key.env" >/dev/null 2>&1; then
  fail 'strict dotenv parser accepted a key outside the API allowlist'
fi

cat >"$DOTENV_CASE_DIR/malformed.env" <<'EOF'
DATABASE_URL=one
touch /tmp/not-an-assignment
EOF
if python3 "$DOTENV_DATA_TOOL" validate --profile api "$DOTENV_CASE_DIR/malformed.env" >/dev/null 2>&1; then
  fail 'strict dotenv parser accepted a non-assignment line'
fi

printf 'DATABASE_URL=one\000two\n' >"$DOTENV_CASE_DIR/nul.env"
if python3 "$DOTENV_DATA_TOOL" validate --profile api "$DOTENV_CASE_DIR/nul.env" >/dev/null 2>&1; then
  fail 'strict dotenv parser accepted NUL data'
fi

printf 'DATABASE_URL=one\001two\n' >"$DOTENV_CASE_DIR/control.env"
if python3 "$DOTENV_DATA_TOOL" validate --profile api "$DOTENV_CASE_DIR/control.env" >/dev/null 2>&1; then
  fail 'strict dotenv parser accepted control data'
fi

printf '# comment with control\033data\nDATABASE_URL=one\n' >"$DOTENV_CASE_DIR/comment-control.env"
if python3 "$DOTENV_DATA_TOOL" validate --profile api "$DOTENV_CASE_DIR/comment-control.env" >/dev/null 2>&1; then
  fail 'strict dotenv parser accepted control data hidden in a comment'
fi

cat >"$DOTENV_CASE_DIR/newline-injection.env" <<EOF
DATABASE_URL=one
touch $DOTENV_MARKER
EOF
if python3 "$DOTENV_DATA_TOOL" validate --profile api "$DOTENV_CASE_DIR/newline-injection.env" >/dev/null 2>&1; then
  fail 'strict dotenv parser accepted a newline command injection'
fi
[ ! -e "$DOTENV_MARKER" ] \
  || fail 'strict dotenv validation executed a newline payload'

DOTENV_REWRITE_TARGET="$DOTENV_CASE_DIR/managed-api.env"
printf '%s' 'postgresql://updated:literal$(touch should-not-run)@database/db' | \
  python3 "$DOTENV_DATA_TOOL" rewrite \
    --profile api \
    --source "$DOTENV_CASE_DIR/literal-values.env" \
    --target "$DOTENV_REWRITE_TARGET" \
    --set-stdin DATABASE_URL \
    --delete REDIS_URL \
    --mode 0600 \
  || fail 'strict dotenv parser could not atomically rewrite validated data'
python3 "$DOTENV_DATA_TOOL" validate --profile api "$DOTENV_REWRITE_TARGET" \
  || fail 'atomic dotenv rewrite produced invalid data'
[ "$(stat -f '%Lp' "$DOTENV_REWRITE_TARGET" 2>/dev/null || stat -c '%a' "$DOTENV_REWRITE_TARGET")" = 600 ] \
  || fail 'atomic dotenv rewrite did not apply the requested private mode'
[ "$(python3 "$DOTENV_DATA_TOOL" get --profile api "$DOTENV_REWRITE_TARGET" DATABASE_URL)" = \
    'postgresql://updated:literal$(touch should-not-run)@database/db' ] \
  || fail 'atomic dotenv rewrite did not preserve stdin as literal data'
if python3 "$DOTENV_DATA_TOOL" get --profile api "$DOTENV_REWRITE_TARGET" REDIS_URL >/dev/null 2>&1; then
  fail 'atomic dotenv rewrite did not delete the requested key'
fi

ln -s "$DOTENV_CASE_DIR/literal-values.env" "$DOTENV_CASE_DIR/source-symlink.env"
if python3 "$DOTENV_DATA_TOOL" validate --profile api "$DOTENV_CASE_DIR/source-symlink.env" >/dev/null 2>&1; then
  fail 'strict dotenv parser followed a source symlink'
fi
printf 'unchanged\n' >"$DOTENV_CASE_DIR/symlink-target"
ln -s "$DOTENV_CASE_DIR/symlink-target" "$DOTENV_CASE_DIR/managed-symlink.env"
if python3 "$DOTENV_DATA_TOOL" rewrite \
  --profile api \
  --source "$DOTENV_CASE_DIR/literal-values.env" \
  --target "$DOTENV_CASE_DIR/managed-symlink.env" >/dev/null 2>&1; then
  fail 'atomic dotenv rewrite accepted a symlink target'
fi
grep -Fx unchanged "$DOTENV_CASE_DIR/symlink-target" >/dev/null \
  || fail 'atomic dotenv rewrite followed and overwrote a symlink target'

STAGING_DATA_MARKER="$DOTENV_CASE_DIR/staging-executed-marker"
STAGING_DATA_CAPTURE="$DOTENV_CASE_DIR/staging-captured.json"
cat >"$DOTENV_CASE_DIR/staging-literal-values.env" <<EOF
COMPOSE_PROJECT_NAME=literal\$(touch $STAGING_DATA_MARKER)
POSTGRES_PASSWORD=literal\`touch $STAGING_DATA_MARKER\`;still-data
DATABASE_URL=postgresql://postgres:literal;touch $STAGING_DATA_MARKER@postgres:5432/database
EOF
bash -c '
  set -euo pipefail
  export FEISHU_APP_SECRET=ambient-stale-secret
  . "$1"
  load_dotenv_data staging "$2"
  [ -z "${FEISHU_APP_SECRET+x}" ]
  python3 -c '\''import json, os, sys; json.dump({key: os.environ[key] for key in ("COMPOSE_PROJECT_NAME", "POSTGRES_PASSWORD", "DATABASE_URL")}, open(sys.argv[1], "w"))'\'' "$3"
' _ \
  "$ROOT_DIR/scripts/deploy/common.sh" \
  "$DOTENV_CASE_DIR/staging-literal-values.env" \
  "$STAGING_DATA_CAPTURE" \
  || fail 'staging dotenv data could not be loaded without shell evaluation'
[ ! -e "$STAGING_DATA_MARKER" ] \
  || fail 'staging dotenv loading executed a shell payload'
python3 - "$STAGING_DATA_CAPTURE" "$STAGING_DATA_MARKER" <<'PY' \
  || fail 'staging dotenv loading did not preserve malicious-looking values as inert data'
import json
import sys

data = json.load(open(sys.argv[1]))
marker = sys.argv[2]
assert data['COMPOSE_PROJECT_NAME'] == f'literal$(touch {marker})'
assert data['POSTGRES_PASSWORD'] == f'literal`touch {marker}`;still-data'
assert data['DATABASE_URL'] == f'postgresql://postgres:literal;touch {marker}@postgres:5432/database'
PY

RELEASE_DATA_MARKER="$DOTENV_CASE_DIR/release-executed-marker"
RELEASE_DATA_CAPTURE="$DOTENV_CASE_DIR/release-captured.json"
cat >"$DOTENV_CASE_DIR/release-literal-values.env" <<EOF
API_IMAGE_REPO=api\$(touch $RELEASE_DATA_MARKER)
WEB_IMAGE_REPO=web\`touch $RELEASE_DATA_MARKER\`
IMAGE_TAG=literal;touch $RELEASE_DATA_MARKER
EOF
bash -c '
  set -euo pipefail
  . "$1"
  load_release_state_if_present "$2"
  python3 -c '\''import json, os, sys; json.dump({key: os.environ[key] for key in ("API_IMAGE_REPO", "WEB_IMAGE_REPO", "IMAGE_TAG")}, open(sys.argv[1], "w"))'\'' "$3"
' _ \
  "$ROOT_DIR/scripts/deploy/common.sh" \
  "$DOTENV_CASE_DIR/release-literal-values.env" \
  "$RELEASE_DATA_CAPTURE" \
  || fail 'release state data could not be loaded without shell evaluation'
[ ! -e "$RELEASE_DATA_MARKER" ] \
  || fail 'release state loading executed a shell payload'
python3 - "$RELEASE_DATA_CAPTURE" "$RELEASE_DATA_MARKER" <<'PY' \
  || fail 'release state loading did not preserve malicious-looking values as inert data'
import json
import sys

data = json.load(open(sys.argv[1]))
marker = sys.argv[2]
assert data['API_IMAGE_REPO'] == f'api$(touch {marker})'
assert data['WEB_IMAGE_REPO'] == f'web`touch {marker}`'
assert data['IMAGE_TAG'] == f'literal;touch {marker}'
PY

if rg -n '(^[[:space:]]*|[;&(][[:space:]]*)(source|\.)[[:space:]]+[^#\n]*(COMPOSE_ENV_FILE|PREVIOUS_STATE|CURRENT_STATE|current\.env|previous\.env)' \
  "$ROOT_DIR/scripts/deploy" --glob '!tests/**' >/dev/null; then
  fail 'staging environment or release-state data is still executed as shell source'
fi

for canonical_unit in \
  deploy/systemd/feishu-timeline-api.service \
  deploy/systemd/feishu-timeline-web.service; do
  grep -F '/usr/local/libexec/feishu-timeline/dotenv-data exec --profile ' \
    "$ROOT_DIR/$canonical_unit" >/dev/null \
    || fail "$canonical_unit does not exec through the strict dotenv data parser"
  grep -F '/usr/bin/python3 -I /usr/local/libexec/feishu-timeline/dotenv-data' \
    "$ROOT_DIR/$canonical_unit" >/dev/null \
    || fail "$canonical_unit does not start the dotenv parser with an isolated interpreter"
  grep -Fx 'ProtectProc=invisible' "$ROOT_DIR/$canonical_unit" >/dev/null \
    || fail "$canonical_unit does not hide privileged maintenance processes from the runtime UID"
  if grep -F 'EnvironmentFile=' "$ROOT_DIR/$canonical_unit" >/dev/null; then
    fail "$canonical_unit still delegates canonical data to a second dotenv dialect"
  fi
done

python3 "$DOTENV_DATA_TOOL" validate --profile api "$ROOT_DIR/apps/api/.env.example" \
  || fail 'API env example drifted outside the strict API profile'
python3 "$DOTENV_DATA_TOOL" validate --profile web "$ROOT_DIR/apps/web/.env.example" \
  || fail 'Web env example drifted outside the strict Web profile'
python3 "$DOTENV_DATA_TOOL" validate --profile staging "$ROOT_DIR/deploy/env/staging.env.example" \
  || fail 'staging env example drifted outside the strict staging profile'

if rg -n '/opt/feishu_timeline_app/apps/(api|web)/\.env\.production|\$APP_ROOT/apps/(api|web)/\.env\.production|\$API_DIR/\.env\.production|\$WEB_DIR/\.env\.production' \
  "$ROOT_DIR/scripts/deploy" "$ROOT_DIR/scripts/migration/restore_to_gcp.sh" \
  "$ROOT_DIR/scripts/migration/post_restore_verify.sh" "$ROOT_DIR/scripts/migration/bootstrap_gcp.sh" \
  "$ROOT_DIR/deploy/systemd" >/dev/null; then
  fail 'runtime or backup automation still references an application-writable production env path'
fi

if rg -n '(^[[:space:]]*|[;&(][[:space:]]*)(source|\.)[[:space:]]+[^#\n]*(env\.production|API_ENV_FILE|WEB_ENV_FILE|ENV_TARGET)' \
  "$ROOT_DIR/scripts/deploy" "$ROOT_DIR/scripts/migration" >/dev/null; then
  fail 'runtime or backup automation still executes dotenv data as shell source'
fi

grep -F 'PRIMARY_API_ENV_TARGET="${PRIMARY_API_ENV_TARGET:-/etc/feishu-timeline/api.env}"' \
  "$ROOT_DIR/scripts/migration/restore_to_gcp.sh" >/dev/null \
  || fail 'restore_to_gcp does not install API runtime data at the canonical path'
grep -F 'PRIMARY_WEB_ENV_TARGET="${PRIMARY_WEB_ENV_TARGET:-/etc/feishu-timeline/web.env}"' \
  "$ROOT_DIR/scripts/migration/restore_to_gcp.sh" >/dev/null \
  || fail 'restore_to_gcp does not install Web runtime data at the canonical path'
grep -F 'install -d -o root -g root -m 0755 /etc/feishu-timeline' \
  "$ROOT_DIR/scripts/migration/restore_to_gcp.sh" >/dev/null \
  || fail 'restore_to_gcp does not establish a root-owned, non-group-writable canonical env parent'
grep -F '"$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" validate --profile api "$api_source"' \
  "$ROOT_DIR/scripts/migration/restore_to_gcp.sh" >/dev/null \
  || fail 'restore_to_gcp does not validate backup API env data before installation'
grep -F '"$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" validate --profile web "$web_source"' \
  "$ROOT_DIR/scripts/migration/restore_to_gcp.sh" >/dev/null \
  || fail 'restore_to_gcp does not validate backup Web env data before installation'
grep -F -- '--sha256 "$PRIMARY_API_ENV_SHA256" --max-bytes 1048576' \
  "$ROOT_DIR/scripts/migration/restore_to_gcp.sh" >/dev/null \
  || fail 'restore_to_gcp does not bind the API env source to an independently reviewed digest'
grep -F -- '--sha256 "$PRIMARY_WEB_ENV_SHA256" --max-bytes 1048576' \
  "$ROOT_DIR/scripts/migration/restore_to_gcp.sh" >/dev/null \
  || fail 'restore_to_gcp does not bind the Web env source to an independently reviewed digest'
# Assert literal source text, not the test environment.
# shellcheck disable=SC2016
if grep -F 'chown -R "$REMOTE_USER:$REMOTE_USER" "$APP_ROOT"' \
  "$ROOT_DIR/scripts/deploy/gce-sync-and-build.sh" >/dev/null; then
  fail 'gce-sync-and-build recursively transfers the application tree back to the runtime user'
fi

SYNC_SCRIPT="$ROOT_DIR/scripts/deploy/gce-sync-and-build.sh"
grep -F '[[ "$GIT_REF" =~ ^[0-9a-f]{40}$ ]]' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not require an exact 40-character runtime commit'
grep -F 'git -C "$SOURCE_REPO" archive "$runtime_commit"' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not build from a clean archive of the exact commit'
grep -F 'export GIT_NO_REPLACE_OBJECTS=1' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build lets persistent Git replace refs alter the exact requested object'
grep -F 'API_RUNTIME_USER=feishu-timeline-api' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not separate the API runtime identity from the deploy SSH identity'
grep -F 'WEB_RUNTIME_USER=feishu-timeline-web' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not separate the Web runtime identity from the deploy SSH identity'
grep -F 'BUILD_USER=feishu-timeline-build' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not use a dedicated build identity'
if [ "$(grep -Fc '/usr/sbin/nologin' "$SYNC_SCRIPT")" -lt 3 ]; then
  fail 'gce-sync-and-build does not provision runtime and build identities as no-login users'
fi
grep -F 'runuser -u "$BUILD_USER" -- /usr/bin/sudo -n true' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not fail closed when the build identity can use sudo'
grep -F 'run_as_builder_in_dir "$BUILD_ROOT" pnpm install --frozen-lockfile' \
  "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build still runs dependency lifecycle code as the sudo-capable SSH identity'
grep -F 'quiesce_and_freeze_build_tree' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not stop the build UID and revoke write access before privileged release installation'
grep -F 'stage_privileged_dotenv_tool' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not isolate privileged helper intake from the writable build UID'
grep -F 'reopen_build_tree_for_builder' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not explicitly separate frozen helper intake from the unprivileged build phase'
grep -F 'PRIVILEGED_SOURCE_ROOT="$BUILD_CONFIG_ROOT/privileged-source"' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not preserve privileged templates outside the writable build tree'
if awk '
  /^stage_runtime_configuration\(\)/ { capture = 1 }
  capture { print }
  capture && /^}/ { exit }
' "$SYNC_SCRIPT" | grep -E '\$BUILD_ROOT/deploy/(systemd|nginx)/' >/dev/null; then
  fail 'gce-sync-and-build promotes systemd/Nginx templates writable by dependency lifecycle code'
fi
if grep -F 'sudo -u "$REMOTE_USER" -g "$WEB_RUNTIME_GROUP"' "$SYNC_SCRIPT" >/dev/null; then
  fail 'gce-sync-and-build still runs Web compiler code under the sudo-capable SSH identity'
fi
grep -F 'sudo chown -R root:root "$RELEASE_DIR"' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not make the immutable release root-owned'
grep -F 'sudo -u "$WEB_RUNTIME_USER" test ! -r "$API_ENV_FILE"' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not prove the Web runtime cannot read the API env'
grep -F 'Canonical production env is missing; restore an operator-reviewed file before deployment' \
  "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build silently bootstraps a production env from an example instead of failing closed'
for sync_transaction_function in \
  stage_privileged_dotenv_tool \
  reopen_build_tree_for_builder \
  stage_runtime_environment \
  build_application \
  stage_immutable_release \
  stage_runtime_configuration \
  quiesce_runtime_services \
  arm_runtime_transaction_guard \
  run_database_migrations \
  activate_object_storage_access \
  activate_deployment \
  start_and_verify_deployment \
  commit_runtime_transaction_guard \
  finalize_deployment \
  rollback_deployment; do
  grep -F "$sync_transaction_function()" "$SYNC_SCRIPT" >/dev/null \
    || fail "gce-sync-and-build is missing transaction stage: $sync_transaction_function"
done

sync_transaction_call_line() {
  local function_name="$1"

  grep -nFx "$function_name" "$SYNC_SCRIPT" | tail -n 1 | cut -d: -f1
}

sync_freeze_intake_line="$(sync_transaction_call_line quiesce_and_freeze_build_tree)"
sync_stage_helper_line="$(sync_transaction_call_line stage_privileged_dotenv_tool)"
sync_reopen_build_line="$(sync_transaction_call_line reopen_build_tree_for_builder)"
sync_stage_env_line="$(sync_transaction_call_line stage_runtime_environment)"
sync_build_line="$(sync_transaction_call_line build_application)"
sync_stage_release_line="$(sync_transaction_call_line stage_immutable_release)"
sync_stage_config_line="$(sync_transaction_call_line stage_runtime_configuration)"
sync_quiesce_line="$(sync_transaction_call_line quiesce_runtime_services)"
sync_guard_line="$(sync_transaction_call_line arm_runtime_transaction_guard)"
sync_migration_line="$(sync_transaction_call_line run_database_migrations)"
sync_storage_access_line="$(sync_transaction_call_line activate_object_storage_access)"
sync_activate_line="$(sync_transaction_call_line activate_deployment)"
sync_start_line="$(sync_transaction_call_line start_and_verify_deployment)"
sync_guard_commit_line="$(sync_transaction_call_line commit_runtime_transaction_guard)"
sync_finalize_line="$(sync_transaction_call_line finalize_deployment)"
for sync_transaction_line in \
  "$sync_freeze_intake_line" "$sync_stage_helper_line" "$sync_reopen_build_line" \
  "$sync_stage_env_line" "$sync_build_line" "$sync_stage_release_line" \
  "$sync_stage_config_line" "$sync_quiesce_line" "$sync_guard_line" "$sync_migration_line" \
  "$sync_storage_access_line" "$sync_activate_line" "$sync_start_line" \
  "$sync_guard_commit_line" "$sync_finalize_line"; do
  [[ "$sync_transaction_line" =~ ^[0-9]+$ ]] \
    || fail 'gce-sync-and-build transaction call graph contains an undefined stage'
done
if ! (( sync_freeze_intake_line < sync_stage_helper_line \
    && sync_stage_helper_line < sync_reopen_build_line \
    && sync_reopen_build_line < sync_stage_env_line \
    && sync_stage_env_line < sync_build_line \
    && sync_build_line < sync_stage_release_line \
    && sync_stage_release_line < sync_stage_config_line \
    && sync_stage_config_line < sync_quiesce_line \
    && sync_quiesce_line < sync_guard_line \
    && sync_guard_line < sync_migration_line \
    && sync_migration_line < sync_storage_access_line \
    && sync_storage_access_line < sync_activate_line \
    && sync_activate_line < sync_start_line \
    && sync_start_line < sync_guard_commit_line \
    && sync_guard_commit_line < sync_finalize_line )); then
  fail 'gce-sync-and-build does not stage everything before quiescence and activation'
fi
grep -F '/usr/bin/systemctl stop feishu-timeline-api.service feishu-timeline-web.service nginx.service' \
  "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build has no independent fail-closed guard for coordinator SIGKILL'
grep -F 'RUNTIME_TRANSACTION_GUARD_MARKER="/var/lib/feishu-timeline-transactions/$transaction_id.committed"' \
  "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build crash guard commit is volatile across a power loss'
grep -F 'Runtime transaction guard is still active; retaining its commit marker.' \
  "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build can delete its guard marker while the guard remains active'
[ "$(grep -Fc '[ ! -e "$commit_marker" ] || exit 0' "$SYNC_SCRIPT")" -ge 2 ] \
  || fail 'gce-sync-and-build crash guard can stop a committed runtime after coordinator exit'
grep -F 'coordinator_state="${coordinator_stat##*) }"' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build crash guard treats an unreaped zombie coordinator as alive'
grep -F 'COMMITTED_BOOT_STATE=disabled_pending_review' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not report fail-closed boot state after post-commit enable failure'
grep -F 'trap deployment_exit EXIT' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not install an EXIT rollback for incomplete activation'
if grep -F 'sudo install -d -o "$API_RUNTIME_USER" -g "$API_RUNTIME_GROUP" -m 0750 "$APP_ROOT/var/object-storage"' \
  "$SYNC_SCRIPT" >/dev/null; then
  fail 'gce-sync-and-build mutates live object-storage metadata before the rollback transaction'
fi
grep -F 'PREVIOUS_OBJECT_STORAGE_METADATA=' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not snapshot object-storage ownership/mode for rollback'
grep -F 'sudo chown "$PREVIOUS_OBJECT_STORAGE_UID:$PREVIOUS_OBJECT_STORAGE_GID" "$OBJECT_STORAGE_PATH"' \
  "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build cannot restore object-storage metadata after failed activation'
grep -F 'MIGRATION_APPLIED=attempted' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build cannot fail closed after a partially applied database migration'
grep -F 'sudo systemctl disable "$runtime_unit"' \
  "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build can auto-start old runtime after a host crash at the database boundary'
grep -F 'SERVICES_BOOT_DISABLED=yes' "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build does not track its persistent boot quarantine for rollback'
grep -Fx 'User=__API_RUNTIME_USER__' "$ROOT_DIR/deploy/systemd/feishu-timeline-api.service" >/dev/null \
  || fail 'API systemd unit does not use the dedicated no-login runtime identity'
grep -Fx 'User=__WEB_RUNTIME_USER__' "$ROOT_DIR/deploy/systemd/feishu-timeline-web.service" >/dev/null \
  || fail 'Web systemd unit does not use the dedicated no-login runtime identity'
if grep -F '__APP_USER__' "$ROOT_DIR/deploy/systemd/feishu-timeline-"*.service >/dev/null; then
  fail 'systemd templates still couple runtime execution to the deploy SSH user'
fi

ARCHIVE_DATA_TOOL="$ROOT_DIR/scripts/migration/archive-data.py"
ARCHIVE_CASE="$TMP_DIR/archive-data"
mkdir -p "$ARCHIVE_CASE"
python3 - "$ARCHIVE_CASE" <<'PY'
from io import BytesIO
from pathlib import Path
import tarfile
import sys

root = Path(sys.argv[1])

def write(name, members):
    with tarfile.open(root / name, 'w:gz') as archive:
        for kind, member_name, payload in members:
            info = tarfile.TarInfo(member_name)
            if kind == 'dir':
                info.type = tarfile.DIRTYPE
                archive.addfile(info)
            elif kind == 'file':
                data = payload.encode()
                info.size = len(data)
                archive.addfile(info, BytesIO(data))
            elif kind == 'symlink':
                info.type = tarfile.SYMTYPE
                info.linkname = payload
                archive.addfile(info)
            elif kind == 'hardlink':
                info.type = tarfile.LNKTYPE
                info.linkname = payload
                archive.addfile(info)
            elif kind == 'fifo':
                info.type = tarfile.FIFOTYPE
                archive.addfile(info)

write('safe.tar.gz', [('dir', '.', ''), ('dir', './bucket', ''), ('file', './bucket/object.bin', 'safe')])
write('traversal.tar.gz', [('file', '../escaped', 'bad')])
write('absolute.tar.gz', [('file', '/absolute', 'bad')])
write('symlink.tar.gz', [('symlink', './link', '/etc')])
write('hardlink.tar.gz', [('file', './target', 'data'), ('hardlink', './hard', './target')])
write('fifo.tar.gz', [('fifo', './pipe', '')])
write('duplicate.tar.gz', [('file', './same', 'one'), ('file', './same', 'two')])
for archive in root.glob('*.tar.gz'):
    archive.chmod(0o600)
PY

python3 "$ARCHIVE_DATA_TOOL" validate-archive \
  --allowed-uid "$(id -u)" "$ARCHIVE_CASE/safe.tar.gz" \
  || fail 'archive validator rejected a private regular-only object-storage archive'
for invalid_archive in traversal absolute symlink hardlink fifo duplicate; do
  if python3 "$ARCHIVE_DATA_TOOL" validate-archive \
    --allowed-uid "$(id -u)" "$ARCHIVE_CASE/$invalid_archive.tar.gz" >/dev/null 2>&1; then
    fail "archive validator accepted unsafe object-storage member class: $invalid_archive"
  fi
done

mkdir -p "$ARCHIVE_CASE/tree/bucket"
printf 'safe\n' >"$ARCHIVE_CASE/tree/bucket/object.bin"
python3 "$ARCHIVE_DATA_TOOL" manifest-tree "$ARCHIVE_CASE/tree" \
  >"$ARCHIVE_CASE/manifest-one.jsonl" \
  || fail 'archive tree validator rejected a regular-only object-storage tree'
python3 "$ARCHIVE_DATA_TOOL" manifest-tree "$ARCHIVE_CASE/tree" \
  >"$ARCHIVE_CASE/manifest-two.jsonl" \
  || fail 'archive tree validator could not repeat a stable object-storage manifest'
cmp "$ARCHIVE_CASE/manifest-one.jsonl" "$ARCHIVE_CASE/manifest-two.jsonl" >/dev/null \
  || fail 'archive tree manifest is not deterministic'
mkdir "$ARCHIVE_CASE/tree-snapshot"
python3 "$ARCHIVE_DATA_TOOL" snapshot-tree \
  --uid "$(id -u)" --gid "$(id -g)" \
  "$ARCHIVE_CASE/tree" "$ARCHIVE_CASE/tree-snapshot" \
  >"$ARCHIVE_CASE/snapshot-manifest.jsonl" \
  || fail 'archive data tool could not create a no-follow regular-only tree snapshot'
python3 "$ARCHIVE_DATA_TOOL" manifest-tree "$ARCHIVE_CASE/tree-snapshot" \
  >"$ARCHIVE_CASE/snapshot-verify.jsonl"
cmp "$ARCHIVE_CASE/snapshot-manifest.jsonl" "$ARCHIVE_CASE/snapshot-verify.jsonl" >/dev/null \
  || fail 'archive tree snapshot does not match its source manifest'
ln -s /etc "$ARCHIVE_CASE/tree/bucket/unsafe-link"
if python3 "$ARCHIVE_DATA_TOOL" manifest-tree "$ARCHIVE_CASE/tree" >/dev/null 2>&1; then
  fail 'archive tree validator accepted a symlink'
fi
mkdir "$ARCHIVE_CASE/unsafe-snapshot"
if python3 "$ARCHIVE_DATA_TOOL" snapshot-tree \
  --uid "$(id -u)" --gid "$(id -g)" \
  "$ARCHIVE_CASE/tree" "$ARCHIVE_CASE/unsafe-snapshot" >/dev/null 2>&1; then
  fail 'archive tree snapshot followed or accepted a source symlink'
fi
rm "$ARCHIVE_CASE/tree/bucket/unsafe-link"

SNAPSHOT_FILE_SOURCE="$ARCHIVE_CASE/private.dump"
SNAPSHOT_FILE_TARGET="$ARCHIVE_CASE/private.snapshot.dump"
printf 'PGDMPstable-private-bytes\n' >"$SNAPSHOT_FILE_SOURCE"
chmod 0600 "$SNAPSHOT_FILE_SOURCE"
SNAPSHOT_FILE_SHA="$(python3 - "$SNAPSHOT_FILE_SOURCE" <<'PY'
import hashlib
import sys

with open(sys.argv[1], 'rb') as source:
    print(hashlib.sha256(source.read()).hexdigest())
PY
)"
python3 "$ARCHIVE_DATA_TOOL" snapshot-file \
  --allowed-uid "$(id -u)" \
  --sha256 "$SNAPSHOT_FILE_SHA" \
  --magic PGDMP \
  --uid "$(id -u)" --gid "$(id -g)" --mode 0600 \
  "$SNAPSHOT_FILE_SOURCE" "$SNAPSHOT_FILE_TARGET" >/dev/null \
  || fail 'archive data tool could not create a digest-bound private file snapshot'
cmp "$SNAPSHOT_FILE_SOURCE" "$SNAPSHOT_FILE_TARGET" >/dev/null \
  || fail 'archive data tool changed bytes while taking a private file snapshot'
[ "$(stat -f '%Lp' "$SNAPSHOT_FILE_TARGET" 2>/dev/null || stat -c '%a' "$SNAPSHOT_FILE_TARGET")" = 600 ] \
  || fail 'archive data tool did not keep the file snapshot private'
if python3 "$ARCHIVE_DATA_TOOL" snapshot-file \
    --allowed-uid "$(id -u)" \
    --sha256 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    "$SNAPSHOT_FILE_SOURCE" "$ARCHIVE_CASE/digest-mismatch.snapshot" >/dev/null 2>&1; then
  fail 'archive data tool accepted a file snapshot with the wrong reviewed digest'
fi
[ ! -e "$ARCHIVE_CASE/digest-mismatch.snapshot" ] \
  || fail 'archive data tool retained a failed digest-mismatch snapshot'
printf 'operator-owned-existing-target\n' >"$ARCHIVE_CASE/existing.snapshot"
chmod 0600 "$ARCHIVE_CASE/existing.snapshot"
if python3 "$ARCHIVE_DATA_TOOL" snapshot-file \
    --allowed-uid "$(id -u)" --sha256 "$SNAPSHOT_FILE_SHA" \
    "$SNAPSHOT_FILE_SOURCE" "$ARCHIVE_CASE/existing.snapshot" >/dev/null 2>&1; then
  fail 'archive data tool overwrote a pre-existing snapshot target'
fi
grep -Fx 'operator-owned-existing-target' "$ARCHIVE_CASE/existing.snapshot" >/dev/null \
  || fail 'archive data tool deleted or changed a pre-existing target after O_EXCL failed'
ln -s "$SNAPSHOT_FILE_SOURCE" "$ARCHIVE_CASE/private-link.dump"
if python3 "$ARCHIVE_DATA_TOOL" snapshot-file \
    --allowed-uid "$(id -u)" --sha256 "$SNAPSHOT_FILE_SHA" \
    "$ARCHIVE_CASE/private-link.dump" "$ARCHIVE_CASE/symlink.snapshot" >/dev/null 2>&1; then
  fail 'archive data tool followed a symlink while snapshotting reviewed input'
fi
[ ! -e "$ARCHIVE_CASE/symlink.snapshot" ] \
  || fail 'archive data tool retained a failed symlink-source snapshot'
chmod 0644 "$SNAPSHOT_FILE_SOURCE"
if python3 "$ARCHIVE_DATA_TOOL" snapshot-file \
    --allowed-uid "$(id -u)" --sha256 "$SNAPSHOT_FILE_SHA" \
    "$SNAPSHOT_FILE_SOURCE" "$ARCHIVE_CASE/public.snapshot" >/dev/null 2>&1; then
  fail 'archive data tool accepted a group/other-readable secret source'
fi
chmod 0600 "$SNAPSHOT_FILE_SOURCE"

TREE_IDENTITY="$(python3 "$ARCHIVE_DATA_TOOL" directory-identity "$ARCHIVE_CASE/tree")"
[ -n "$TREE_IDENTITY" ] \
  || fail 'archive data tool did not bind an object tree to its filesystem identity'
ln -s "$ARCHIVE_CASE/tree" "$ARCHIVE_CASE/tree-alias"
if python3 "$ARCHIVE_DATA_TOOL" directory-identity "$ARCHIVE_CASE/tree-alias" >/dev/null 2>&1; then
  fail 'archive data tool followed a user-controlled directory symlink while binding object identity'
fi
grep -F 'directory-identity "$OBJECT_STORAGE_DIR"' \
  "$ROOT_DIR/scripts/migration/backup_old_server.sh" >/dev/null \
  || fail 'backup_old_server does not bind object storage to its no-follow filesystem identity'

BACKUP_OLD_SCRIPT="$ROOT_DIR/scripts/migration/backup_old_server.sh"
if grep -F 'run_as_root tar -C "$source_dir" -czf "$archive_path" .' \
  "$BACKUP_OLD_SCRIPT" >/dev/null; then
  fail 'backup_old_server lets root open a path in the invoking-user-owned backup tree'
fi
grep -F 'capture_private_output "$archive_path" run_as_root tar -C "$source_dir" -czf - .' \
  "$BACKUP_OLD_SCRIPT" >/dev/null \
  || fail 'backup_old_server does not bind privileged tar output to an unprivileged pre-opened file descriptor'
if grep -F '"${copy_command[@]}" - "$source_path" "$dest_path"' \
  "$BACKUP_OLD_SCRIPT" >/dev/null; then
  fail 'backup_old_server passes an invoking-user-owned destination path to a privileged copy helper'
fi
grep -F 'snapshot_dir="$(run_as_root mktemp -d /var/tmp/feishu-timeline-object-snapshot.XXXXXX)"' \
  "$BACKUP_OLD_SCRIPT" >/dev/null \
  || fail 'backup_old_server stages privileged object data inside the invoking-user-owned backup tree'
grep -F 'capture_private_output "$archive_path" run_as_root tar --hard-dereference -C "$snapshot_dir" -czf - .' \
  "$BACKUP_OLD_SCRIPT" >/dev/null \
  || fail 'backup_old_server lets privileged object archiving reopen an invoking-user-owned output path'
grep -F 'approved_privileged_backup_source' "$BACKUP_OLD_SCRIPT" >/dev/null \
  || fail 'backup_old_server has no fixed authority boundary for privileged backup sources'
grep -F 'Privileged backup read is not approved for source:' "$BACKUP_OLD_SCRIPT" >/dev/null \
  || fail 'backup_old_server can elevate arbitrary caller-selected file reads'
grep -F 'pgrep -u "$API_RUNTIME_USER"' "$BACKUP_OLD_SCRIPT" >/dev/null \
  || fail 'backup_old_server can snapshot object storage while an orphan API writer remains alive'

grep -F 'RENAME_EXCHANGE' "$ARCHIVE_DATA_TOOL" >/dev/null \
  || fail 'archive data tool cannot atomically exchange a staged tree with live storage'
grep -F '"$PYTHON_BIN" -I "$ARCHIVE_DATA_TOOL" activate-tree' \
  "$ROOT_DIR/scripts/migration/restore_to_gcp.sh" >/dev/null \
  || fail 'restore_to_gcp still activates object storage through a two-rename gap'
grep -F 'require_quiesced_data_restore' \
  "$ROOT_DIR/scripts/migration/restore_to_gcp.sh" >/dev/null \
  || fail 'restore_to_gcp does not gate data replacement on a quiesced API runtime'

BACKUP_PERMISSION_CASE="$TMP_DIR/backup-permissions"
mkdir -p "$BACKUP_PERMISSION_CASE/fixtures"
cat >"$BACKUP_PERMISSION_CASE/fixtures/api.env" <<'EOF'
DATABASE_URL=postgresql://backup_user:backup_password@database/backup_db?schema=public
OBJECT_STORAGE_LOCAL_ROOT=/opt/feishu_timeline_app/var/object-storage
EOF
cat >"$BACKUP_PERMISSION_CASE/fixtures/web.env" <<'EOF'
NEXT_PUBLIC_API_BASE_URL=/api
EOF

(
  umask 022
  APP_ROOT="$BACKUP_PERMISSION_CASE/missing-app" \
    BACKUP_ROOT="$BACKUP_PERMISSION_CASE/export" \
    PACKAGE_PATH="$BACKUP_PERMISSION_CASE/export.tar.gz" \
    PRIMARY_API_ENV="$BACKUP_PERMISSION_CASE/fixtures/api.env" \
    PRIMARY_WEB_ENV="$BACKUP_PERMISSION_CASE/fixtures/web.env" \
    EXTRA_ENV_CANDIDATES_RAW='' \
    NGINX_CONF_DIR="$BACKUP_PERMISSION_CASE/missing-nginx" \
    SYSTEMD_DIR="$BACKUP_PERMISSION_CASE/missing-systemd" \
    OBJECT_STORAGE_DIR="$BACKUP_PERMISSION_CASE/missing-object-storage" \
    DATABASE_BACKUP_MODE=skip \
    bash "$ROOT_DIR/scripts/migration/backup_old_server.sh" \
    >"$BACKUP_PERMISSION_CASE/stdout" 2>"$BACKUP_PERMISSION_CASE/stderr"
) || fail 'backup_old_server could not create a private migration package fixture'

portable_mode() {
  stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"
}

[ "$(portable_mode "$BACKUP_PERMISSION_CASE/export")" = 700 ] \
  || fail 'backup_old_server did not force the backup root to mode 0700'
[ "$(portable_mode "$BACKUP_PERMISSION_CASE/export/backup-report.txt")" = 600 ] \
  || fail 'backup_old_server did not force the sensitive report to mode 0600'
[ "$(portable_mode "$BACKUP_PERMISSION_CASE/export/env/primary/api.env.production")" = 600 ] \
  || fail 'backup_old_server did not force the copied API env to mode 0600'
[ "$(portable_mode "$BACKUP_PERMISSION_CASE/export/env/primary/web.env.production")" = 600 ] \
  || fail 'backup_old_server did not force the copied Web env to mode 0600'
[ "$(portable_mode "$BACKUP_PERMISSION_CASE/export.tar.gz")" = 600 ] \
  || fail 'backup_old_server did not force the final migration package to mode 0600'
mkdir "$BACKUP_PERMISSION_CASE/unpacked"
tar -xzf "$BACKUP_PERMISSION_CASE/export.tar.gz" -C "$BACKUP_PERMISSION_CASE/unpacked"
cmp "$BACKUP_PERMISSION_CASE/export/backup-report.txt" \
  "$BACKUP_PERMISSION_CASE/unpacked/export/backup-report.txt" >/dev/null \
  || fail 'backup_old_server packaged a stale report before all sensitive metadata was recorded'
grep -Fx 'ENV_OBJECT_STORAGE_LOCAL_ROOT=/opt/feishu_timeline_app/var/object-storage' \
  "$BACKUP_PERMISSION_CASE/unpacked/export/backup-report.txt" >/dev/null \
  || fail 'backup_old_server omitted the validated object-storage source identity from the package'

BACKUP_SOURCE_AUTH_CASE="$TMP_DIR/backup-source-authority"
mkdir -p "$BACKUP_SOURCE_AUTH_CASE/bin"
printf 'root-only-fixture\n' >"$BACKUP_SOURCE_AUTH_CASE/unapproved-secret"
chmod 000 "$BACKUP_SOURCE_AUTH_CASE/unapproved-secret"
cat >"$BACKUP_SOURCE_AUTH_CASE/bin/sudo" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
touch "${UNAPPROVED_SUDO_READ:?}"
exec "$@"
SH
chmod 0755 "$BACKUP_SOURCE_AUTH_CASE/bin/sudo"
if PATH="$BACKUP_SOURCE_AUTH_CASE/bin:$PATH" \
  UNAPPROVED_SUDO_READ="$BACKUP_SOURCE_AUTH_CASE/sudo-read-attempted" \
  APP_ROOT="$BACKUP_SOURCE_AUTH_CASE/missing-app" \
  BACKUP_ROOT="$BACKUP_SOURCE_AUTH_CASE/export" \
  PACKAGE_PATH="$BACKUP_SOURCE_AUTH_CASE/export.tar.gz" \
  PRIMARY_API_ENV="$BACKUP_PERMISSION_CASE/fixtures/api.env" \
  PRIMARY_WEB_ENV="$BACKUP_PERMISSION_CASE/fixtures/web.env" \
  EXTRA_ENV_CANDIDATES_RAW="$BACKUP_SOURCE_AUTH_CASE/unapproved-secret" \
  NGINX_CONF_DIR="$BACKUP_SOURCE_AUTH_CASE/missing-nginx" \
  SYSTEMD_DIR="$BACKUP_SOURCE_AUTH_CASE/missing-systemd" \
  OBJECT_STORAGE_DIR="$BACKUP_SOURCE_AUTH_CASE/missing-object-storage" \
  DATABASE_BACKUP_MODE=skip \
  bash "$ROOT_DIR/scripts/migration/backup_old_server.sh" >/dev/null 2>&1; then
  fail 'backup_old_server accepted an unreadable caller-selected extra file'
fi
[ ! -e "$BACKUP_SOURCE_AUTH_CASE/sudo-read-attempted" ] \
  || fail 'backup_old_server used root as a confused deputy for an unapproved source'
chmod 0600 "$BACKUP_SOURCE_AUTH_CASE/unapproved-secret"

OBJECT_QUIESCE_CASE="$TMP_DIR/backup-object-quiesce"
mkdir -p "$OBJECT_QUIESCE_CASE/storage" "$OBJECT_QUIESCE_CASE/fixtures"
printf 'immutable-test-object\n' >"$OBJECT_QUIESCE_CASE/storage/object.bin"
cat >"$OBJECT_QUIESCE_CASE/fixtures/api.env" <<EOF
DATABASE_URL=postgresql://backup_user:backup_password@database/backup_db?schema=public
OBJECT_STORAGE_LOCAL_ROOT=$OBJECT_QUIESCE_CASE/storage
EOF
cp "$BACKUP_PERMISSION_CASE/fixtures/web.env" "$OBJECT_QUIESCE_CASE/fixtures/web.env"
chmod 0600 "$OBJECT_QUIESCE_CASE/fixtures/api.env" "$OBJECT_QUIESCE_CASE/fixtures/web.env"
if APP_ROOT="$OBJECT_QUIESCE_CASE/missing-app" \
  BACKUP_ROOT="$OBJECT_QUIESCE_CASE/export" \
  PACKAGE_PATH="$OBJECT_QUIESCE_CASE/export.tar.gz" \
  PRIMARY_API_ENV="$OBJECT_QUIESCE_CASE/fixtures/api.env" \
  PRIMARY_WEB_ENV="$OBJECT_QUIESCE_CASE/fixtures/web.env" \
  EXTRA_ENV_CANDIDATES_RAW='' \
  NGINX_CONF_DIR="$OBJECT_QUIESCE_CASE/missing-nginx" \
  SYSTEMD_DIR="$OBJECT_QUIESCE_CASE/missing-systemd" \
  OBJECT_STORAGE_DIR="$OBJECT_QUIESCE_CASE/storage" \
  DATABASE_BACKUP_MODE=skip \
  bash "$ROOT_DIR/scripts/migration/backup_old_server.sh" \
  >"$OBJECT_QUIESCE_CASE/stdout" 2>"$OBJECT_QUIESCE_CASE/stderr"; then
  fail 'backup_old_server captured a live writable object tree without a quiescence assertion'
fi
grep -F 'OBJECT_STORAGE_QUIESCED=yes' "$OBJECT_QUIESCE_CASE/stderr" >/dev/null \
  || fail 'backup_old_server did not fail closed at the object-storage consistency boundary'
grep -F 'run_as_root pgrep -u "$API_RUNTIME_USER"' \
  "$ROOT_DIR/scripts/migration/backup_old_server.sh" >/dev/null \
  || fail 'backup_old_server can miss an API writer hidden by cross-UID process visibility controls'

DEFAULT_LIST_CASE="$TMP_DIR/backup-default-list-splitting"
DEFAULT_LIST_APP="$DEFAULT_LIST_CASE/app"
DEFAULT_LIST_MARKER="$DEFAULT_LIST_CASE/env-executed"
mkdir -p \
  "$DEFAULT_LIST_CASE/bin" \
  "$DEFAULT_LIST_APP/apps/api" \
  "$DEFAULT_LIST_APP/apps/web" \
  "$DEFAULT_LIST_CASE/systemd"
printf 'MALICIOUS=$(touch %s)\n' "$DEFAULT_LIST_MARKER" >"$DEFAULT_LIST_APP/.env"
printf 'API_EXTRA=`touch %s`\n' "$DEFAULT_LIST_MARKER" >"$DEFAULT_LIST_APP/apps/api/.env"
printf 'WEB_EXTRA=literal;touch %s\n' "$DEFAULT_LIST_MARKER" >"$DEFAULT_LIST_APP/apps/web/.env"
cat >"$DEFAULT_LIST_CASE/bin/sudo" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
exec "$@"
SH
cat >"$DEFAULT_LIST_CASE/bin/systemctl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${SYSTEMCTL_TEST_LOG:?}"
case "${1:-}" in
  cat) printf '[Unit]\nDescription=%s\n' "${2:?}" ;;
  status) printf '%s active\n' "${2:?}" ;;
  *) exit 2 ;;
esac
SH
chmod 0755 "$DEFAULT_LIST_CASE/bin/sudo" "$DEFAULT_LIST_CASE/bin/systemctl"
PATH="$DEFAULT_LIST_CASE/bin:$PATH" \
  SYSTEMCTL_TEST_LOG="$DEFAULT_LIST_CASE/systemctl.log" \
  APP_ROOT="$DEFAULT_LIST_APP" \
  BACKUP_ROOT="$DEFAULT_LIST_CASE/export" \
  PACKAGE_PATH="$DEFAULT_LIST_CASE/export.tar.gz" \
  PRIMARY_API_ENV="$BACKUP_PERMISSION_CASE/fixtures/api.env" \
  PRIMARY_WEB_ENV="$BACKUP_PERMISSION_CASE/fixtures/web.env" \
  NGINX_CONF_DIR="$DEFAULT_LIST_CASE/missing-nginx" \
  SYSTEMD_DIR="$DEFAULT_LIST_CASE/systemd" \
  OBJECT_STORAGE_DIR="$DEFAULT_LIST_CASE/missing-object-storage" \
  DATABASE_BACKUP_MODE=skip \
  bash "$ROOT_DIR/scripts/migration/backup_old_server.sh" \
  >"$DEFAULT_LIST_CASE/stdout" 2>"$DEFAULT_LIST_CASE/stderr" \
  || fail 'backup_old_server could not process its newline-delimited default candidate lists'
[ ! -e "$DEFAULT_LIST_MARKER" ] \
  || fail 'backup_old_server executed shell syntax from an extra dotenv file'
for relative_env in .env apps/api/.env apps/web/.env; do
  cmp "$DEFAULT_LIST_APP/$relative_env" \
    "$DEFAULT_LIST_CASE/export/env/extra/${DEFAULT_LIST_APP#/}/$relative_env" >/dev/null \
    || fail "backup_old_server omitted or altered default extra env candidate: $relative_env"
done
for default_unit in feishu-timeline-api.service feishu-timeline-web.service; do
  [ -f "$DEFAULT_LIST_CASE/export/systemd/$default_unit" ] \
    || fail "backup_old_server omitted default systemd unit: $default_unit"
  grep -Fx "cat $default_unit" "$DEFAULT_LIST_CASE/systemctl.log" >/dev/null \
    || fail "backup_old_server did not request the default systemd unit separately: $default_unit"
done

DATABASE_BOUNDARY_CASE="$TMP_DIR/backup-database-boundary"
mkdir -p "$DATABASE_BOUNDARY_CASE/bin"
cat >"$DATABASE_BOUNDARY_CASE/bin/pg_dump" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
touch "${PG_DUMP_CALLED:?}"
exit 99
SH
chmod 0755 "$DATABASE_BOUNDARY_CASE/bin/pg_dump"
if PATH="$DATABASE_BOUNDARY_CASE/bin:$PATH" \
  PG_DUMP_CALLED="$DATABASE_BOUNDARY_CASE/pg-dump-called" \
  APP_ROOT="$DATABASE_BOUNDARY_CASE/missing-app" \
  BACKUP_ROOT="$DATABASE_BOUNDARY_CASE/external-output-export" \
  PACKAGE_PATH="$DATABASE_BOUNDARY_CASE/external-output-export.tar.gz" \
  PRIMARY_API_ENV="$BACKUP_PERMISSION_CASE/fixtures/api.env" \
  PRIMARY_WEB_ENV="$BACKUP_PERMISSION_CASE/fixtures/web.env" \
  EXTRA_ENV_CANDIDATES_RAW='' \
  NGINX_CONF_DIR="$DATABASE_BOUNDARY_CASE/missing-nginx" \
  SYSTEMD_DIR="$DATABASE_BOUNDARY_CASE/missing-systemd" \
  OBJECT_STORAGE_DIR="$DATABASE_BOUNDARY_CASE/missing-object-storage" \
  DATABASE_BACKUP_MODE=url \
  DATABASE_BACKUP_FILE="$DATABASE_BOUNDARY_CASE/escaped.dump" \
  bash "$ROOT_DIR/scripts/migration/backup_old_server.sh" >/dev/null 2>&1; then
  fail 'backup_old_server accepted a database output path outside its private database directory'
fi
[ ! -e "$DATABASE_BOUNDARY_CASE/pg-dump-called" ] \
  || fail 'backup_old_server invoked pg_dump before rejecting an external database output path'
if PATH="$DATABASE_BOUNDARY_CASE/bin:$PATH" \
  PG_DUMP_CALLED="$DATABASE_BOUNDARY_CASE/pg-dump-called" \
  APP_ROOT="$DATABASE_BOUNDARY_CASE/missing-app" \
  BACKUP_ROOT="$DATABASE_BOUNDARY_CASE/extra-output-export" \
  PACKAGE_PATH="$DATABASE_BOUNDARY_CASE/extra-output-export.tar.gz" \
  PRIMARY_API_ENV="$BACKUP_PERMISSION_CASE/fixtures/api.env" \
  PRIMARY_WEB_ENV="$BACKUP_PERMISSION_CASE/fixtures/web.env" \
  EXTRA_ENV_CANDIDATES_RAW='' \
  NGINX_CONF_DIR="$DATABASE_BOUNDARY_CASE/missing-nginx" \
  SYSTEMD_DIR="$DATABASE_BOUNDARY_CASE/missing-systemd" \
  OBJECT_STORAGE_DIR="$DATABASE_BOUNDARY_CASE/missing-object-storage" \
  DATABASE_BACKUP_MODE=url \
  DATABASE_EXTRA_ARGS="-f$DATABASE_BOUNDARY_CASE/escaped.dump" \
  bash "$ROOT_DIR/scripts/migration/backup_old_server.sh" \
  >"$DATABASE_BOUNDARY_CASE/stdout" 2>"$DATABASE_BOUNDARY_CASE/stderr"; then
  fail 'backup_old_server accepted a pg_dump output override in DATABASE_EXTRA_ARGS'
fi
[ ! -e "$DATABASE_BOUNDARY_CASE/pg-dump-called" ] \
  || fail 'backup_old_server invoked pg_dump after rejecting an output override'
grep -F 'option is not in the exact safe allowlist' \
  "$DATABASE_BOUNDARY_CASE/stderr" >/dev/null \
  || fail 'backup_old_server did not fail closed at the database argument boundary'
if PATH="$DATABASE_BOUNDARY_CASE/bin:$PATH" \
  PG_DUMP_CALLED="$DATABASE_BOUNDARY_CASE/pg-dump-called" \
  APP_ROOT="$DATABASE_BOUNDARY_CASE/missing-app" \
  BACKUP_ROOT="$DATABASE_BOUNDARY_CASE/abbreviated-option-export" \
  PACKAGE_PATH="$DATABASE_BOUNDARY_CASE/abbreviated-option-export.tar.gz" \
  PRIMARY_API_ENV="$BACKUP_PERMISSION_CASE/fixtures/api.env" \
  PRIMARY_WEB_ENV="$BACKUP_PERMISSION_CASE/fixtures/web.env" \
  EXTRA_ENV_CANDIDATES_RAW='' \
  NGINX_CONF_DIR="$DATABASE_BOUNDARY_CASE/missing-nginx" \
  SYSTEMD_DIR="$DATABASE_BOUNDARY_CASE/missing-systemd" \
  OBJECT_STORAGE_DIR="$DATABASE_BOUNDARY_CASE/missing-object-storage" \
  DATABASE_BACKUP_MODE=url \
  DATABASE_EXTRA_ARGS='--forma=plain' \
  bash "$ROOT_DIR/scripts/migration/backup_old_server.sh" >/dev/null 2>&1; then
  fail 'backup_old_server accepted a pg_dump long-option abbreviation outside the exact allowlist'
fi
[ ! -e "$DATABASE_BOUNDARY_CASE/pg-dump-called" ] \
  || fail 'backup_old_server invoked pg_dump after rejecting an abbreviated option'
if grep -F -- '--dbname="$DATABASE_URL"' \
  "$ROOT_DIR/scripts/migration/backup_old_server.sh" >/dev/null; then
  fail 'backup_old_server still exposes DATABASE_URL in pg_dump argv'
fi
grep -F '"$DOTENV_DATA_TOOL" postgres-exec' \
  "$ROOT_DIR/scripts/migration/backup_old_server.sh" >/dev/null \
  || fail 'backup_old_server does not use the credential-safe PostgreSQL client boundary'
grep -F '"${dump_cmd[@]}" --dbname="$DATABASE_NAME"' \
  "$ROOT_DIR/scripts/migration/backup_old_server.sh" >/dev/null \
  || fail 'backup_old_server can reinterpret a DATABASE_NAME beginning with a dash as a pg_dump option'
if PATH="$DATABASE_BOUNDARY_CASE/bin:$PATH" \
  PG_DUMP_CALLED="$DATABASE_BOUNDARY_CASE/pg-dump-called" \
  APP_ROOT="$DATABASE_BOUNDARY_CASE/missing-app" \
  BACKUP_ROOT="$DATABASE_BOUNDARY_CASE/plain-export" \
  PACKAGE_PATH="$DATABASE_BOUNDARY_CASE/plain-export.tar.gz" \
  PRIMARY_API_ENV="$BACKUP_PERMISSION_CASE/fixtures/api.env" \
  PRIMARY_WEB_ENV="$BACKUP_PERMISSION_CASE/fixtures/web.env" \
  EXTRA_ENV_CANDIDATES_RAW='' \
  NGINX_CONF_DIR="$DATABASE_BOUNDARY_CASE/missing-nginx" \
  SYSTEMD_DIR="$DATABASE_BOUNDARY_CASE/missing-systemd" \
  OBJECT_STORAGE_DIR="$DATABASE_BOUNDARY_CASE/missing-object-storage" \
  DATABASE_BACKUP_MODE=url \
  DATABASE_BACKUP_FORMAT=plain \
  bash "$ROOT_DIR/scripts/migration/backup_old_server.sh" \
  >"$DATABASE_BOUNDARY_CASE/plain-stdout" 2>"$DATABASE_BOUNDARY_CASE/plain-stderr"; then
  fail 'backup_old_server generated a plain SQL artifact that restore must never interpret'
fi
[ ! -e "$DATABASE_BOUNDARY_CASE/pg-dump-called" ] \
  || fail 'backup_old_server invoked pg_dump before rejecting plain SQL format'
grep -F 'Plain SQL backups are prohibited' "$DATABASE_BOUNDARY_CASE/plain-stderr" >/dev/null \
  || fail 'backup_old_server did not explain the fail-closed custom-format boundary'

LEGACY_BACKUP_CASE="$TMP_DIR/backup-legacy-env-migration"
mkdir -p "$LEGACY_BACKUP_CASE/app/apps/api" "$LEGACY_BACKUP_CASE/app/apps/web"
cp "$BACKUP_PERMISSION_CASE/fixtures/api.env" \
  "$LEGACY_BACKUP_CASE/app/apps/api/.env.production"
cp "$BACKUP_PERMISSION_CASE/fixtures/web.env" \
  "$LEGACY_BACKUP_CASE/app/apps/web/.env.production"
APP_ROOT="$LEGACY_BACKUP_CASE/app" \
  CANONICAL_API_ENV="$LEGACY_BACKUP_CASE/missing-canonical-api.env" \
  CANONICAL_WEB_ENV="$LEGACY_BACKUP_CASE/missing-canonical-web.env" \
  BACKUP_ROOT="$LEGACY_BACKUP_CASE/export" \
  PACKAGE_PATH="$LEGACY_BACKUP_CASE/export.tar.gz" \
  EXTRA_ENV_CANDIDATES_RAW='' \
  NGINX_CONF_DIR="$LEGACY_BACKUP_CASE/missing-nginx" \
  SYSTEMD_DIR="$LEGACY_BACKUP_CASE/missing-systemd" \
  OBJECT_STORAGE_DIR="$LEGACY_BACKUP_CASE/missing-object-storage" \
  DATABASE_BACKUP_MODE=skip \
  bash "$ROOT_DIR/scripts/migration/backup_old_server.sh" \
  >"$LEGACY_BACKUP_CASE/stdout" 2>"$LEGACY_BACKUP_CASE/stderr" \
  || fail 'backup_old_server could not preserve validated legacy env data for canonical migration'
cmp "$LEGACY_BACKUP_CASE/app/apps/api/.env.production" \
  "$LEGACY_BACKUP_CASE/export/env/primary/api.env.production" >/dev/null \
  || fail 'backup_old_server omitted the validated legacy API env migration input'
cmp "$LEGACY_BACKUP_CASE/app/apps/web/.env.production" \
  "$LEGACY_BACKUP_CASE/export/env/primary/web.env.production" >/dev/null \
  || fail 'backup_old_server omitted the validated legacy Web env migration input'

SYMLINK_CASE="$TMP_DIR/backup-symlink"
mkdir -p "$SYMLINK_CASE"
printf 'do-not-overwrite\n' >"$SYMLINK_CASE/target"
ln -s "$SYMLINK_CASE/target" "$SYMLINK_CASE/package.tar.gz"
if APP_ROOT="$SYMLINK_CASE/missing-app" \
  BACKUP_ROOT="$SYMLINK_CASE/export" \
  PACKAGE_PATH="$SYMLINK_CASE/package.tar.gz" \
  PRIMARY_API_ENV="$BACKUP_PERMISSION_CASE/fixtures/api.env" \
  PRIMARY_WEB_ENV="$BACKUP_PERMISSION_CASE/fixtures/web.env" \
  EXTRA_ENV_CANDIDATES_RAW='' \
  NGINX_CONF_DIR="$SYMLINK_CASE/missing-nginx" \
  SYSTEMD_DIR="$SYMLINK_CASE/missing-systemd" \
  OBJECT_STORAGE_DIR="$SYMLINK_CASE/missing-object-storage" \
  DATABASE_BACKUP_MODE=skip \
  bash "$ROOT_DIR/scripts/migration/backup_old_server.sh" >/dev/null 2>&1; then
  fail 'backup_old_server accepted a symlink package target'
fi
grep -Fx 'do-not-overwrite' "$SYMLINK_CASE/target" >/dev/null \
  || fail 'backup_old_server followed and overwrote a symlink package target'

UNTRUSTED_BACKUP_ROOT="$TMP_DIR/backup-untrusted-existing"
mkdir -m 0755 "$UNTRUSTED_BACKUP_ROOT"
if APP_ROOT="$TMP_DIR/missing-app" \
  BACKUP_ROOT="$UNTRUSTED_BACKUP_ROOT" \
  PACKAGE_PATH="$TMP_DIR/untrusted.tar.gz" \
  PRIMARY_API_ENV="$BACKUP_PERMISSION_CASE/fixtures/api.env" \
  PRIMARY_WEB_ENV="$BACKUP_PERMISSION_CASE/fixtures/web.env" \
  EXTRA_ENV_CANDIDATES_RAW='' \
  NGINX_CONF_DIR="$TMP_DIR/missing-nginx" \
  SYSTEMD_DIR="$TMP_DIR/missing-systemd" \
  OBJECT_STORAGE_DIR="$TMP_DIR/missing-object-storage" \
  DATABASE_BACKUP_MODE=skip \
  bash "$ROOT_DIR/scripts/migration/backup_old_server.sh" >/dev/null 2>&1; then
  fail 'backup_old_server accepted an existing world-accessible backup root'
fi

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
    GIT_REF=0123456789abcdef0123456789abcdef01234567 \
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
QUOTA_PROFILE_FIXTURE="$TMP_DIR/attachment-storage-quota.env"
for expected_quota_setting in \
  'ATTACHMENT_STORAGE_GLOBAL_MAX_BYTES=5368709120' \
  'ATTACHMENT_STORAGE_PROJECT_MAX_BYTES=1073741824' \
  'ATTACHMENT_STORAGE_ACTOR_MAX_BYTES=536870912' \
  'ATTACHMENT_STORAGE_GLOBAL_MAX_OBJECTS=5000' \
  'ATTACHMENT_STORAGE_PROJECT_MAX_OBJECTS=1000' \
  'ATTACHMENT_STORAGE_ACTOR_MAX_OBJECTS=500' \
  'ATTACHMENT_STORAGE_MIN_FREE_BYTES=1073741824' \
  'ATTACHMENT_STORAGE_RESERVATION_TTL_MS=7200000' \
  'ATTACHMENT_STORAGE_ACTOR_WINDOW_MS=2592000000' \
  'ATTACHMENT_STORAGE_RECONCILE_INTERVAL_MS=300000' \
  'ATTACHMENT_STORAGE_RECONCILE_BATCH_SIZE=100' \
  'ATTACHMENT_STORAGE_RECONCILIATION_LEASE_MS=300000' \
  'ATTACHMENT_STORAGE_RECONCILIATION_RETRY_MS=300000' \
  'ATTACHMENT_STORAGE_PURGED_METADATA_RETENTION_MS=7776000000'; do
  grep -Fx "$expected_quota_setting" "$PRODUCTION_ENV_TEMPLATE" >/dev/null \
    || fail "root production env template omits attachment storage quota: $expected_quota_setting"
  printf '%s\n' "$expected_quota_setting" >>"$QUOTA_PROFILE_FIXTURE"
done
python3 "$DOTENV_DATA_TOOL" validate --profile api "$QUOTA_PROFILE_FIXTURE" \
  || fail 'strict API dotenv profile rejects the attachment storage quota contract'
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

assert_query_free_nginx_access_log() {
  local relative_config="$1"
  local format_name="$2"
  local format_block="$TMP_DIR/${format_name}.log-format"
  local active_access_logs="$TMP_DIR/${format_name}.access-logs"

  awk -v format_name="$format_name" '
    $1 == "log_format" && $2 == format_name { capture = 1 }
    capture { print }
    capture && /;/ { exit }
  ' "$ROOT_DIR/$relative_config" >"$format_block"
  [ -s "$format_block" ] \
    || fail "$relative_config does not define the query-free $format_name log format"
  grep -F '$request_method $uri $server_protocol' "$format_block" >/dev/null \
    || fail "$relative_config does not log the request path without its query string"
  if grep -E '\$(request|request_uri|args|is_args|http_referer)([^A-Za-z0-9_]|$)' \
    "$format_block" >/dev/null; then
    fail "$relative_config query-free log format still records request arguments or a query-bearing referrer"
  fi

  awk '!/^[[:space:]]*#/ && /^[[:space:]]*access_log[[:space:]]/' \
    "$ROOT_DIR/$relative_config" >"$active_access_logs"
  [ -s "$active_access_logs" ] \
    || fail "$relative_config does not contain an active access log"
  if grep -Ev "[[:space:]]${format_name};[[:space:]]*$" "$active_access_logs" >/dev/null; then
    fail "$relative_config contains an access_log that can fall back to the query-bearing combined format"
  fi
}

assert_query_free_nginx_access_log \
  deploy/nginx/timeline.all-too-well.com.conf timeline_no_args
assert_query_free_nginx_access_log \
  deploy/nginx/feishu-timeline.conf feishu_timeline_no_args
assert_query_free_nginx_access_log \
  deploy/nginx/compose.staging.conf timeline_staging_no_args
assert_query_free_nginx_access_log \
  deploy/nginx/all-too-well.com.placeholder.conf all_too_well_placeholder_no_args
[ "$(grep -Fc 'access_log /var/log/nginx/all-too-well.com.access.log all_too_well_placeholder_no_args;' \
  "$ROOT_DIR/deploy/nginx/all-too-well.com.placeholder.conf")" -ge 2 ] \
  || fail 'root placeholder www redirect inherits a query-bearing default access log'
if awk '!/^[[:space:]]*#/' "$ROOT_DIR/deploy/nginx/all-too-well.com.placeholder.conf" \
  | grep -F '$request_uri' >/dev/null; then
  fail 'root placeholder redirect propagates query credentials across hostnames'
fi

assert_callback_error_log_suppressed() {
  local relative_config="$1"
  local callback_block="$TMP_DIR/$(basename "$relative_config").callback"

  awk '
    /^[[:space:]]*location = \/login\/callback[[:space:]]*\{/ { capture = 1 }
    capture { print }
    capture && /^[[:space:]]*}/ { exit }
  ' "$ROOT_DIR/$relative_config" >"$callback_block"
  [ -s "$callback_block" ] \
    || fail "$relative_config does not isolate the OAuth callback from query-bearing error logs"
  grep -F 'error_log /dev/null crit;' "$callback_block" >/dev/null \
    || fail "$relative_config can record OAuth code/state in an upstream error-log request field"
}

assert_callback_error_log_suppressed deploy/nginx/timeline.all-too-well.com.conf
assert_callback_error_log_suppressed deploy/nginx/feishu-timeline.conf
assert_callback_error_log_suppressed deploy/nginx/compose.staging.conf

POSTCUTOVER_SCRIPT="$ROOT_DIR/scripts/deploy/gce-postcutover-hardening.sh"
for generated_format in all_too_well_no_args feishu_timeline_no_args; do
  grep -F "log_format $generated_format" "$POSTCUTOVER_SCRIPT" >/dev/null \
    || fail "gce-postcutover does not render the query-free $generated_format access-log format"
done
grep -F 'access_log /var/log/nginx/${ROOT_DOMAIN}.access.log all_too_well_no_args;' \
  "$POSTCUTOVER_SCRIPT" >/dev/null \
  || fail 'gce-postcutover root vhost can use the query-bearing default access-log format'
grep -F 'access_log /var/log/nginx/feishu-timeline.access.log feishu_timeline_no_args;' \
  "$POSTCUTOVER_SCRIPT" >/dev/null \
  || fail 'gce-postcutover timeline vhost can use the query-bearing default access-log format'
[ "$(grep -Fc 'access_log /var/log/nginx/feishu-timeline.access.log feishu_timeline_no_args;' \
  "$POSTCUTOVER_SCRIPT")" -ge 2 ] \
  || fail 'gce-postcutover HTTP callback can inherit a query-bearing default access log'
[ "$(grep -Fc 'access_log /var/log/nginx/${ROOT_DOMAIN}.access.log all_too_well_no_args;' \
  "$POSTCUTOVER_SCRIPT")" -ge 4 ] \
  || fail 'gce-postcutover root redirect server can inherit a query-bearing default access log'

CALLBACK_HTTP_LOCATION="$TMP_DIR/postcutover-callback-http-location.conf"
awk '
  /location = \$\{FEISHU_CALLBACK_PATH\}/ { capture = 1 }
  capture { print }
  capture && /^[[:space:]]*}/ { exit }
' "$POSTCUTOVER_SCRIPT" >"$CALLBACK_HTTP_LOCATION"
[ -s "$CALLBACK_HTTP_LOCATION" ] \
  || fail 'gce-postcutover does not handle the OAuth callback separately on plaintext HTTP'
grep -F 'return 308 https://${APP_HOST}${FEISHU_CALLBACK_PATH};' \
  "$CALLBACK_HTTP_LOCATION" >/dev/null \
  || fail 'gce-postcutover does not drop OAuth code/state when redirecting an HTTP callback'
if grep -E '\$(request_uri|args|is_args)([^A-Za-z0-9_]|$)' \
  "$CALLBACK_HTTP_LOCATION" >/dev/null; then
  fail 'gce-postcutover propagates OAuth callback query data through its HTTPS redirect'
fi
[ "$(grep -Fc 'location = ${FEISHU_CALLBACK_PATH}' "$POSTCUTOVER_SCRIPT")" -eq 2 ] \
  || fail 'gce-postcutover does not isolate both HTTP and HTTPS OAuth callback handling'
[ "$(grep -Fc 'error_log /dev/null crit;' "$POSTCUTOVER_SCRIPT")" -ge 2 ] \
  || fail 'gce-postcutover can record OAuth code/state in a callback error-log request field'

SYNC_NGINX_VALIDATOR="$TMP_DIR/sync-existing-nginx-validator.sh"
awk '
  /^validate_existing_nginx_privacy_config\(\)/ { capture = 1 }
  capture && /^stage_runtime_configuration\(\)/ { exit }
  capture { print }
' "$SYNC_SCRIPT" >"$SYNC_NGINX_VALIDATOR"
[ -s "$SYNC_NGINX_VALIDATOR" ] \
  || fail 'gce-sync-and-build cannot validate privacy controls before retaining an existing TLS config'
grep -F 'validate_existing_nginx_privacy_config "$NGINX_CONFIG_TARGET"' \
  "$SYNC_SCRIPT" >/dev/null \
  || fail 'gce-sync-and-build skips an existing TLS config without validating callback log privacy'

SYNC_SAFE_NGINX="$TMP_DIR/sync-safe-existing-nginx.conf"
SYNC_UNSAFE_NGINX="$TMP_DIR/sync-unsafe-existing-nginx.conf"
SYNC_NESTED_LOG_NGINX="$TMP_DIR/sync-nested-log-existing-nginx.conf"
SYNC_QUERY_ALIAS_NGINX="$TMP_DIR/sync-query-alias-existing-nginx.conf"
SYNC_INDIRECT_ALIAS_NGINX="$TMP_DIR/sync-indirect-alias-existing-nginx.conf"
SYNC_INCLUDE_NGINX="$TMP_DIR/sync-include-existing-nginx.conf"
SYNC_CALLBACK_ACCESS_LOG_NGINX="$TMP_DIR/sync-callback-access-log-existing-nginx.conf"
SYNC_CALLBACK_EXTRA_ERROR_LOG_NGINX="$TMP_DIR/sync-callback-extra-error-log-existing-nginx.conf"
cat >"$SYNC_SAFE_NGINX" <<'EOF'
log_format feishu_timeline_no_args '$remote_addr - $remote_user [$time_local] '
                                   '"$request_method $uri $server_protocol" $status $body_bytes_sent '
                                   '"$http_user_agent"';
server {
    listen 80;
    server_name timeline.all-too-well.com;
    access_log /var/log/nginx/feishu-timeline.access.log feishu_timeline_no_args;
    location = /login/callback {
        error_log /dev/null crit;
        return 308 https://timeline.all-too-well.com/login/callback;
    }
}
server {
    listen 443 ssl;
    server_name timeline.all-too-well.com;
    ssl_certificate /etc/letsencrypt/live/timeline.all-too-well.com/fullchain.pem;
    access_log /var/log/nginx/feishu-timeline.access.log feishu_timeline_no_args;
    location = /login/callback {
        error_log /dev/null crit;
        proxy_pass http://127.0.0.1:3000;
    }
}
EOF
cat >"$SYNC_UNSAFE_NGINX" <<'EOF'
server {
    listen 443 ssl;
    server_name timeline.all-too-well.com;
    ssl_certificate /etc/letsencrypt/live/timeline.all-too-well.com/fullchain.pem;
    access_log /var/log/nginx/feishu-timeline.access.log combined;
    location = /login/callback {
        proxy_pass http://127.0.0.1:3000;
    }
}
EOF
cat >"$SYNC_NESTED_LOG_NGINX" <<'EOF'
log_format feishu_timeline_no_args '"$request_method $uri $server_protocol" $status';
server {
    listen 443 ssl;
    server_name timeline.all-too-well.com;
    ssl_certificate /etc/letsencrypt/live/timeline.all-too-well.com/fullchain.pem;
    location /health {
        access_log /var/log/nginx/health.access.log feishu_timeline_no_args;
        return 200;
    }
    location = /login/callback {
        error_log /dev/null crit;
        proxy_pass http://127.0.0.1:3000;
    }
}
EOF
cat >"$SYNC_QUERY_ALIAS_NGINX" <<'EOF'
log_format query_alias '"$request_method $uri $query_string" $status';
server {
    listen 443 ssl;
    server_name timeline.all-too-well.com;
    ssl_certificate /etc/letsencrypt/live/timeline.all-too-well.com/fullchain.pem;
    access_log /var/log/nginx/feishu-timeline.access.log query_alias;
    location = /login/callback {
        error_log /dev/null crit;
        set $copy_of_code $arg_code;
        proxy_pass http://127.0.0.1:3000;
    }
}
EOF
cat >"$SYNC_INDIRECT_ALIAS_NGINX" <<'EOF'
map $args $oauth_leak { default $args; }
log_format apparent_safe '"$request_method $uri $server_protocol" $oauth_leak';
server {
    listen 443 ssl;
    server_name timeline.all-too-well.com;
    ssl_certificate /etc/letsencrypt/live/timeline.all-too-well.com/fullchain.pem;
    access_log /var/log/nginx/feishu-timeline.access.log apparent_safe;
    location = /login/callback {
        error_log /dev/null crit;
        proxy_set_header X-Leaked-Query $oauth_leak;
        proxy_pass http://127.0.0.1:3000;
    }
}
EOF
cat >"$SYNC_INCLUDE_NGINX" <<'EOF'
include /etc/nginx/snippets/query-bearing-shadow-server.conf;
log_format feishu_timeline_no_args '$remote_addr - $remote_user [$time_local] '
                                   '"$request_method $uri $server_protocol" $status $body_bytes_sent '
                                   '"$http_user_agent"';
server {
    listen 443 ssl;
    server_name timeline.all-too-well.com;
    ssl_certificate /etc/letsencrypt/live/timeline.all-too-well.com/fullchain.pem;
    access_log /var/log/nginx/feishu-timeline.access.log feishu_timeline_no_args;
    location = /login/callback {
        error_log /dev/null crit;
        proxy_pass http://127.0.0.1:3000;
    }
}
EOF
cat >"$SYNC_CALLBACK_ACCESS_LOG_NGINX" <<'EOF'
log_format feishu_timeline_no_args '$remote_addr - $remote_user [$time_local] '
                                   '"$request_method $uri $server_protocol" $status $body_bytes_sent '
                                   '"$http_user_agent"';
server {
    listen 443 ssl;
    server_name timeline.all-too-well.com;
    ssl_certificate /etc/letsencrypt/live/timeline.all-too-well.com/fullchain.pem;
    access_log /var/log/nginx/feishu-timeline.access.log feishu_timeline_no_args;
    location = /login/callback {
        access_log /var/log/nginx/callback-access.log combined;
        error_log /dev/null crit;
        proxy_pass http://127.0.0.1:3000;
    }
}
EOF
cat >"$SYNC_CALLBACK_EXTRA_ERROR_LOG_NGINX" <<'EOF'
log_format feishu_timeline_no_args '$remote_addr - $remote_user [$time_local] '
                                   '"$request_method $uri $server_protocol" $status $body_bytes_sent '
                                   '"$http_user_agent"';
server {
    listen 443 ssl;
    server_name timeline.all-too-well.com;
    ssl_certificate /etc/letsencrypt/live/timeline.all-too-well.com/fullchain.pem;
    access_log /var/log/nginx/feishu-timeline.access.log feishu_timeline_no_args;
    location = /login/callback {
        error_log /dev/null crit;
        error_log /var/log/nginx/callback.error.log warn;
        proxy_pass http://127.0.0.1:3000;
    }
}
EOF
(
  PYTHON_BIN="$(command -v python3)"
  APP_HOST=timeline.all-too-well.com
  sudo() { "$@"; }
  # shellcheck source=/dev/null
  . "$SYNC_NGINX_VALIDATOR"
  validate_existing_nginx_privacy_config "$SYNC_SAFE_NGINX"
) || fail 'gce-sync-and-build rejected a query-free existing TLS config fixture'
if (
  PYTHON_BIN="$(command -v python3)"
  APP_HOST=timeline.all-too-well.com
  sudo() { "$@"; }
  # shellcheck source=/dev/null
  . "$SYNC_NGINX_VALIDATOR"
  validate_existing_nginx_privacy_config "$SYNC_UNSAFE_NGINX"
) >/dev/null 2>&1; then
  fail 'gce-sync-and-build retained an existing TLS config that can log OAuth code/state'
fi
for unsafe_existing_nginx in \
  "$SYNC_NESTED_LOG_NGINX" "$SYNC_QUERY_ALIAS_NGINX" "$SYNC_INDIRECT_ALIAS_NGINX" \
  "$SYNC_INCLUDE_NGINX" "$SYNC_CALLBACK_ACCESS_LOG_NGINX" \
  "$SYNC_CALLBACK_EXTRA_ERROR_LOG_NGINX"; do
  if (
    PYTHON_BIN="$(command -v python3)"
    APP_HOST=timeline.all-too-well.com
    sudo() { "$@"; }
    # shellcheck source=/dev/null
    . "$SYNC_NGINX_VALIDATOR"
    validate_existing_nginx_privacy_config "$unsafe_existing_nginx"
  ) >/dev/null 2>&1; then
    fail 'gce-sync-and-build existing-TLS validator accepted a callback query-log bypass'
  fi
done

CHECK_HTTP_REMOTE="$TMP_DIR/check-http-errors.remote.sh"
awk '
  /^cat >"\$remote_script" <<'\''EOF'\''$/ { capture = 1; next }
  capture && /^EOF$/ { exit }
  capture { print }
' "$ROOT_DIR/scripts/deploy/check-http-errors.sh" >"$CHECK_HTTP_REMOTE"
[ "$(grep -Fc 'sudo tail -n "$lines" "$access_log"' "$CHECK_HTTP_REMOTE")" -eq 1 ] \
  || fail 'check-http-errors can re-emit a legacy 5xx access-log line containing OAuth query data'

LEGACY_LOG_CASE="$TMP_DIR/legacy-nginx-query-logs"
mkdir -p "$LEGACY_LOG_CASE/bin"
cat >"$LEGACY_LOG_CASE/access.log" <<'EOF'
127.0.0.1 - - [11/Aug/2026:17:00:00 +0800] "GET /login/callback?code=legacy-access-secret&state=legacy-state HTTP/1.1" 502 166 "-" "fixture"
"GET /health HTTP/1.1" 503 0 "field-four-fixture"
EOF
cat >"$LEGACY_LOG_CASE/error.log" <<'EOF'
2026/08/11 17:00:00 [error] 42#42: *1 connect() failed, request: "GET /login/callback?code=legacy-error-secret&state=legacy-state HTTP/1.1", upstream: "http://127.0.0.1:3000/login/callback"
EOF
cat >"$LEGACY_LOG_CASE/bin/sudo" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
exec "$@"
SH
cat >"$LEGACY_LOG_CASE/bin/journalctl" <<'SH'
#!/usr/bin/env bash
printf '%s\n' 'ERROR callback failed uri=/login/callback?code=legacy-journal-secret&state=legacy-state'
SH
chmod 0700 "$LEGACY_LOG_CASE/bin/sudo" "$LEGACY_LOG_CASE/bin/journalctl"
sed \
  -e "s#/var/log/nginx/feishu-timeline.access.log#$LEGACY_LOG_CASE/access.log#g" \
  -e "s#/var/log/nginx/feishu-timeline.error.log#$LEGACY_LOG_CASE/error.log#g" \
  "$CHECK_HTTP_REMOTE" >"$LEGACY_LOG_CASE/check.sh"
PATH="$LEGACY_LOG_CASE/bin:$PATH" \
  bash "$LEGACY_LOG_CASE/check.sh" 200 '60 min ago' >"$LEGACY_LOG_CASE/output"
grep -Fx 'count=2' "$LEGACY_LOG_CASE/output" >/dev/null \
  || fail 'check-http-errors did not count 5xx status outside a legacy fixed field while suppressing request details'
grep -Fx 'error_count=1' "$LEGACY_LOG_CASE/output" >/dev/null \
  || fail 'check-http-errors did not retain the Nginx error count while suppressing request details'
grep -Fx 'journal_error_count=1' "$LEGACY_LOG_CASE/output" >/dev/null \
  || fail 'check-http-errors did not retain the API journal error count while suppressing details'
if grep -E 'legacy-(access|error|journal)-secret|legacy-state' "$LEGACY_LOG_CASE/output" >/dev/null; then
  fail 'check-http-errors re-emitted OAuth code/state from a legacy Nginx log'
fi

MISSING_LOG_CASE="$TMP_DIR/missing-nginx-logs"
mkdir -p "$MISSING_LOG_CASE/bin"
cat >"$MISSING_LOG_CASE/bin/sudo" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
exec "$@"
SH
cat >"$MISSING_LOG_CASE/bin/journalctl" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod 0700 "$MISSING_LOG_CASE/bin/sudo" "$MISSING_LOG_CASE/bin/journalctl"
sed \
  -e "s#/var/log/nginx/feishu-timeline.access.log#$MISSING_LOG_CASE/missing-app-access.log#g" \
  -e "s#/var/log/nginx/timeline.all-too-well.com.access.log#$MISSING_LOG_CASE/missing-host-access.log#g" \
  -e "s#/var/log/nginx/access.log#$MISSING_LOG_CASE/missing-default-access.log#g" \
  -e "s#/var/log/nginx/feishu-timeline.error.log#$MISSING_LOG_CASE/missing-app-error.log#g" \
  -e "s#/var/log/nginx/timeline.all-too-well.com.error.log#$MISSING_LOG_CASE/missing-host-error.log#g" \
  -e "s#/var/log/nginx/error.log#$MISSING_LOG_CASE/missing-default-error.log#g" \
  "$CHECK_HTTP_REMOTE" >"$MISSING_LOG_CASE/check.sh"
PATH="$MISSING_LOG_CASE/bin:$PATH" \
  bash "$MISSING_LOG_CASE/check.sh" 200 '60 min ago' >"$MISSING_LOG_CASE/output"
grep -Fx 'count=unavailable' "$MISSING_LOG_CASE/output" >/dev/null \
  || fail 'check-http-errors treats a missing Nginx access-log evidence source as a zero-error PASS'
grep -Fx 'error_count=unavailable' "$MISSING_LOG_CASE/output" >/dev/null \
  || fail 'check-http-errors treats a missing Nginx error-log evidence source as a zero-error PASS'

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
    GIT_REPO_URL='https://example.invalid/feishu-timeline.git' \
    GIT_REF=0123456789abcdef0123456789abcdef01234567 \
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

if RESTORE_VALIDATE_ONLY=yes \
  REPO_STAGE_DIR="$TMP_DIR/untrusted-restore-stage" \
  GIT_REPO_URL='https://example.invalid/feishu-timeline.git' \
  GIT_REF=0123456789abcdef0123456789abcdef01234567 \
  bash "$RESTORE_SCRIPT" >/dev/null 2>"$TMP_DIR/restore-stage-override-stderr"; then
  fail 'restore_to_gcp accepted a caller-selected root chown target for REPO_STAGE_DIR'
fi
grep -F 'REPO_STAGE_DIR overrides are prohibited' "$TMP_DIR/restore-stage-override-stderr" >/dev/null \
  || fail 'restore_to_gcp did not fail closed at the repository staging ownership boundary'
if RESTORE_VALIDATE_ONLY=yes \
  DOTENV_DATA_TOOL="$TMP_DIR/untrusted-dotenv-tool" \
  GIT_REPO_URL='https://example.invalid/feishu-timeline.git' \
  GIT_REF=0123456789abcdef0123456789abcdef01234567 \
  bash "$RESTORE_SCRIPT" >/dev/null 2>"$TMP_DIR/restore-tool-override-stderr"; then
  fail 'restore_to_gcp accepted a caller-selected privileged dotenv tool target'
fi
grep -F 'DOTENV_DATA_TOOL must use the canonical root-controlled target' \
  "$TMP_DIR/restore-tool-override-stderr" >/dev/null \
  || fail 'restore_to_gcp did not fix the privileged tool installation path'

PRIMARY_ENV_GATE_CASE="$TMP_DIR/restore-primary-env-integrity-gate"
mkdir -p "$PRIMARY_ENV_GATE_CASE"
printf 'DATABASE_URL=postgresql://example\n' >"$PRIMARY_ENV_GATE_CASE/api.env"
printf 'NEXT_PUBLIC_API_BASE_URL=/api\n' >"$PRIMARY_ENV_GATE_CASE/web.env"
chmod 0600 "$PRIMARY_ENV_GATE_CASE/api.env" "$PRIMARY_ENV_GATE_CASE/web.env"
if RESTORE_VALIDATE_ONLY=yes \
  RESTORE_PRIMARY_ENV=yes \
  REQUIRE_CONFIRM_RESTORE=yes \
  PRIMARY_API_ENV_SOURCE="$PRIMARY_ENV_GATE_CASE/api.env" \
  PRIMARY_WEB_ENV_SOURCE="$PRIMARY_ENV_GATE_CASE/web.env" \
  GIT_REPO_URL='https://example.invalid/feishu-timeline.git' \
  GIT_REF=0123456789abcdef0123456789abcdef01234567 \
  bash "$RESTORE_SCRIPT" >/dev/null 2>"$PRIMARY_ENV_GATE_CASE/missing-digests-stderr"; then
  fail 'restore_to_gcp accepted primary env data without independently reviewed API/Web digests'
fi
grep -F 'PRIMARY_API_ENV_SHA256 must be an independently reviewed' \
  "$PRIMARY_ENV_GATE_CASE/missing-digests-stderr" >/dev/null \
  || fail 'restore_to_gcp did not enforce independent primary-env provenance at preflight'
RESTORE_VALIDATE_ONLY=yes \
  RESTORE_PRIMARY_ENV=yes \
  REQUIRE_CONFIRM_RESTORE=yes \
  PRIMARY_API_ENV_SOURCE="$PRIMARY_ENV_GATE_CASE/api.env" \
  PRIMARY_WEB_ENV_SOURCE="$PRIMARY_ENV_GATE_CASE/web.env" \
  PRIMARY_API_ENV_SHA256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  PRIMARY_WEB_ENV_SHA256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  GIT_REPO_URL='https://example.invalid/feishu-timeline.git' \
  GIT_REF=0123456789abcdef0123456789abcdef01234567 \
  bash "$RESTORE_SCRIPT" >"$PRIMARY_ENV_GATE_CASE/validated-stdout" \
  || fail 'restore_to_gcp rejected syntactically valid primary-env integrity inputs at non-mutating preflight'
grep -F 'VALIDATION_ONLY=PASS' "$PRIMARY_ENV_GATE_CASE/validated-stdout" >/dev/null \
  || fail 'restore_to_gcp primary-env integrity preflight did not complete'

PLAIN_SQL_RESTORE_CASE="$TMP_DIR/restore-plain-sql"
PLAIN_SQL_MARKER="$PLAIN_SQL_RESTORE_CASE/psql-meta-command-executed"
mkdir -p "$PLAIN_SQL_RESTORE_CASE/repo-stage"
printf '\\! touch %s\nselect 1;\n' "$PLAIN_SQL_MARKER" >"$PLAIN_SQL_RESTORE_CASE/untrusted.sql"
if RESTORE_VALIDATE_ONLY=yes \
  RESTORE_DATABASE=yes \
  REQUIRE_CONFIRM_RESTORE=yes \
  DATABASE_RESTORE_FILE="$PLAIN_SQL_RESTORE_CASE/untrusted.sql" \
  GIT_REPO_URL='https://example.invalid/feishu-timeline.git' \
  GIT_REF=0123456789abcdef0123456789abcdef01234567 \
  bash "$RESTORE_SCRIPT" \
  >"$PLAIN_SQL_RESTORE_CASE/stdout" 2>"$PLAIN_SQL_RESTORE_CASE/stderr"; then
  fail 'restore_to_gcp accepted a plain SQL backup containing an OS-command meta-command'
fi
[ ! -e "$PLAIN_SQL_MARKER" ] \
  || fail 'restore_to_gcp executed a psql meta-command from an untrusted plain SQL backup'
grep -F 'Plain SQL database restores are prohibited' "$PLAIN_SQL_RESTORE_CASE/stderr" >/dev/null \
  || fail 'restore_to_gcp did not fail closed before the plain SQL interpreter boundary'
if rg -n 'psql[^\n]*<[[:space:]]*"?\$DATABASE_RESTORE_FILE' "$RESTORE_SCRIPT" >/dev/null; then
  fail 'restore_to_gcp still contains a root psql interpreter sink for migration input'
fi
printf 'PGDMPnot-a-real-archive\n' >"$PLAIN_SQL_RESTORE_CASE/custom.dump"
chmod 0600 "$PLAIN_SQL_RESTORE_CASE/custom.dump"
if RESTORE_VALIDATE_ONLY=yes \
  RESTORE_DATABASE=yes \
  REQUIRE_CONFIRM_RESTORE=yes \
  DATABASE_RESTORE_FILE="$PLAIN_SQL_RESTORE_CASE/custom.dump" \
  GIT_REPO_URL='https://example.invalid/feishu-timeline.git' \
  GIT_REF=0123456789abcdef0123456789abcdef01234567 \
  bash "$RESTORE_SCRIPT" >/dev/null 2>"$PLAIN_SQL_RESTORE_CASE/missing-digest-stderr"; then
  fail 'restore_to_gcp accepted a custom database archive without an independently reviewed digest'
fi
grep -F 'DATABASE_RESTORE_SHA256 must be an independently reviewed' \
  "$PLAIN_SQL_RESTORE_CASE/missing-digest-stderr" >/dev/null \
  || fail 'restore_to_gcp did not enforce the database provenance digest at preflight'
if RESTORE_VALIDATE_ONLY=yes \
  APPLY_SYSTEM_CONFIG=yes \
  ENABLE_SERVICES=yes \
  START_SERVICES=no \
  GIT_REPO_URL='https://example.invalid/feishu-timeline.git' \
  GIT_REF=0123456789abcdef0123456789abcdef01234567 \
  bash "$RESTORE_SCRIPT" >/dev/null 2>"$PLAIN_SQL_RESTORE_CASE/unverified-enable-stderr"; then
  fail 'restore_to_gcp accepted boot enablement without a verified runtime start'
fi
grep -F 'ENABLE_SERVICES=yes requires START_SERVICES=yes' \
  "$PLAIN_SQL_RESTORE_CASE/unverified-enable-stderr" >/dev/null \
  || fail 'restore_to_gcp did not explain the verified-start requirement for boot enablement'
grep -F '"$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" postgres-exec' \
  "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not keep DATABASE_URL credentials out of pg_restore argv'
if rg -n -- '--dbname="?\$(database_url|DATABASE_URL|BASE_DB_URL|base_db_url)' \
  "$ROOT_DIR/scripts/migration/restore_to_gcp.sh" \
  "$ROOT_DIR/scripts/migration/backup_old_server.sh" \
  "$ROOT_DIR/scripts/deploy/backup-postgres.sh" \
  "$ROOT_DIR/scripts/deploy/ops-check.sh" >/dev/null; then
  fail 'a PostgreSQL maintenance command still exposes a secret URL through process argv'
fi
if grep -F 'redis-cli -u "$REDIS_URL"' "$ROOT_DIR/scripts/deploy/ops-check.sh" >/dev/null; then
  fail 'ops-check still exposes Redis credentials through process argv'
fi
grep -F '"$DOTENV_DATA_TOOL" redis-exec' "$ROOT_DIR/scripts/deploy/ops-check.sh" >/dev/null \
  || fail 'ops-check does not use the credential-safe Redis client boundary'
if grep -F -- '-v db_password="$DB_PASSWORD"' \
  "$ROOT_DIR/scripts/deploy/gce-postgres-bootstrap.sh" >/dev/null; then
  fail 'gce-postgres-bootstrap still exposes the rotated database password through psql argv'
fi
if grep -E 'ALTER[[:space:]]+ROLE.*PASSWORD' \
  "$ROOT_DIR/scripts/deploy/gce-postgres-bootstrap.sh" >/dev/null; then
  fail 'gce-postgres-bootstrap can send the cleartext database password into PostgreSQL statement logs'
fi
grep -F 'printf '\''%s\n'\'' "\\password $DB_USER"' \
  "$ROOT_DIR/scripts/deploy/gce-postgres-bootstrap.sh" >/dev/null \
  || fail 'gce-postgres-bootstrap does not use psql client-side password encryption'
POSTGRES_BOOTSTRAP_SCRIPT="$ROOT_DIR/scripts/deploy/gce-postgres-bootstrap.sh"
grep -F 'Privileged dotenv tool is not a root-owned regular file.' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" >/dev/null \
  || fail 'gce-postgres-bootstrap executes the dotenv helper as root before establishing its trust boundary'
grep -F 'Canonical API env parent is not root-controlled.' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" >/dev/null \
  || fail 'gce-postgres-bootstrap does not gate the canonical env parent against symlink or ownership attacks'
grep -F 'API_ENV_CANDIDATE="$(sudo mktemp /etc/feishu-timeline/.api.env.candidate.XXXXXX)"' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" >/dev/null \
  || fail 'gce-postgres-bootstrap does not reserve a private collision-safe API env candidate'
grep -F 'DB_CREDENTIAL_APPLIED=attempted' "$POSTGRES_BOOTSTRAP_SCRIPT" >/dev/null \
  || fail 'gce-postgres-bootstrap cannot fail closed across an ambiguous database credential change'
grep -F 'sudo mv -Tf -- "$API_ENV_CANDIDATE" "$API_ENV"' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" >/dev/null \
  || fail 'gce-postgres-bootstrap does not atomically activate the staged API environment'
grep -F 'Database credentials crossed their commit boundary; API remains stopped.' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" >/dev/null \
  || fail 'gce-postgres-bootstrap can restart an API with ambiguous database credentials after failure'
grep -F 'API_SERVICE_BOOT_QUARANTINED=committing' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" >/dev/null \
  || fail 'gce-postgres-bootstrap does not track a persistent API boot quarantine'
grep -F 'sudo systemctl disable feishu-timeline-api.service' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" >/dev/null \
  || fail 'gce-postgres-bootstrap can cross the database boundary with an API enabled at boot'
grep -F 'sudo /bin/sync -f /etc/systemd/system' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" >/dev/null \
  || fail 'gce-postgres-bootstrap does not persist the API boot quarantine before database mutation'
POSTGRES_BOOTSTRAP_QUARANTINE_LINE="$(grep -n -F 'API_SERVICE_BOOT_QUARANTINED=yes' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" | tail -1 | cut -d: -f1)"
POSTGRES_BOOTSTRAP_GUARD_LINE="$(grep -nFx 'arm_runtime_transaction_guard' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" | tail -1 | cut -d: -f1)"
POSTGRES_BOOTSTRAP_CREDENTIAL_LINE="$(grep -n -F 'DB_CREDENTIAL_APPLIED=attempted' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" | tail -1 | cut -d: -f1)"
POSTGRES_BOOTSTRAP_CREATEUSER_LINE="$(grep -n -F 'sudo -u postgres createuser --login "$DB_USER"' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" | tail -1 | cut -d: -f1)"
POSTGRES_BOOTSTRAP_ENABLE_LINE="$(grep -n -F 'API_SERVICE_ENABLE_ATTEMPTED=yes' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" | tail -1 | cut -d: -f1)"
POSTGRES_BOOTSTRAP_ACTIVE_LINE="$(grep -n -F 'systemctl is-active feishu-timeline-api' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" | tail -1 | cut -d: -f1)"
POSTGRES_BOOTSTRAP_GUARD_COMMIT_LINE="$(grep -nFx 'commit_runtime_transaction_guard' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" | tail -1 | cut -d: -f1)"
[[ "$POSTGRES_BOOTSTRAP_QUARANTINE_LINE" =~ ^[0-9]+$ \
    && "$POSTGRES_BOOTSTRAP_GUARD_LINE" =~ ^[0-9]+$ \
    && "$POSTGRES_BOOTSTRAP_CREDENTIAL_LINE" =~ ^[0-9]+$ \
    && "$POSTGRES_BOOTSTRAP_CREATEUSER_LINE" =~ ^[0-9]+$ \
    && "$POSTGRES_BOOTSTRAP_ENABLE_LINE" =~ ^[0-9]+$ \
    && "$POSTGRES_BOOTSTRAP_ACTIVE_LINE" =~ ^[0-9]+$ \
    && "$POSTGRES_BOOTSTRAP_GUARD_COMMIT_LINE" =~ ^[0-9]+$ \
    && "$POSTGRES_BOOTSTRAP_QUARANTINE_LINE" -lt "$POSTGRES_BOOTSTRAP_CREDENTIAL_LINE" \
    && "$POSTGRES_BOOTSTRAP_QUARANTINE_LINE" -lt "$POSTGRES_BOOTSTRAP_GUARD_LINE" \
    && "$POSTGRES_BOOTSTRAP_GUARD_LINE" -lt "$POSTGRES_BOOTSTRAP_CREDENTIAL_LINE" \
    && "$POSTGRES_BOOTSTRAP_CREDENTIAL_LINE" -lt "$POSTGRES_BOOTSTRAP_CREATEUSER_LINE" \
    && "$POSTGRES_BOOTSTRAP_ACTIVE_LINE" -lt "$POSTGRES_BOOTSTRAP_ENABLE_LINE" \
    && "$POSTGRES_BOOTSTRAP_GUARD_COMMIT_LINE" -lt "$POSTGRES_BOOTSTRAP_ENABLE_LINE" ]] \
  || fail 'gce-postgres-bootstrap boot quarantine is outside the quiesce/credential/verify/commit transaction'
grep -F 'arm_runtime_transaction_guard' "$POSTGRES_BOOTSTRAP_SCRIPT" >/dev/null \
  || fail 'gce-postgres-bootstrap has no independent fail-closed guard for coordinator SIGKILL'
grep -F '/usr/bin/systemctl stop feishu-timeline-api.service nginx.service' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" >/dev/null \
  || fail 'gce-postgres-bootstrap crash guard does not make the API publicly unreachable'
grep -F 'RUNTIME_TRANSACTION_GUARD_MARKER="/var/lib/feishu-timeline-transactions/$transaction_id.committed"' \
  "$POSTGRES_BOOTSTRAP_SCRIPT" >/dev/null \
  || fail 'gce-postgres-bootstrap crash guard commit is volatile across a power loss'
[ "$(grep -Fc '[ ! -e "$commit_marker" ] || exit 0' "$POSTGRES_BOOTSTRAP_SCRIPT")" -ge 2 ] \
  || fail 'gce-postgres-bootstrap crash guard can stop a committed runtime after coordinator exit'
grep -F 'coordinator_state="${coordinator_stat##*) }"' "$POSTGRES_BOOTSTRAP_SCRIPT" >/dev/null \
  || fail 'gce-postgres-bootstrap crash guard treats an unreaped zombie coordinator as alive'
grep -F 'COMMITTED_BOOT_STATE=disabled_pending_review' "$POSTGRES_BOOTSTRAP_SCRIPT" >/dev/null \
  || fail 'gce-postgres-bootstrap does not report fail-closed boot state after post-commit enable failure'
POSTGRES_BOOTSTRAP_ROLLBACK="$TMP_DIR/gce-postgres-bootstrap.rollback.sh"
awk '
  /^rollback_bootstrap\(\)/ { capture = 1 }
  capture { print }
  capture && /^}/ { exit }
' "$POSTGRES_BOOTSTRAP_SCRIPT" >"$POSTGRES_BOOTSTRAP_ROLLBACK"
grep -F 'sudo systemctl stop feishu-timeline-api.service || true' \
  "$POSTGRES_BOOTSTRAP_ROLLBACK" >/dev/null \
  || fail 'gce-postgres-bootstrap does not actually stop the API after a post-credential failure'
grep -F 'sudo systemctl disable feishu-timeline-api.service || true' \
  "$POSTGRES_BOOTSTRAP_ROLLBACK" >/dev/null \
  || fail 'gce-postgres-bootstrap rollback can leave the API enabled after a database boundary failure'

OBJECT_RESTORE_GATE_CASE="$TMP_DIR/restore-object-integrity-gate"
mkdir -p "$OBJECT_RESTORE_GATE_CASE"
printf 'archive-placeholder\n' >"$OBJECT_RESTORE_GATE_CASE/object-storage.tar.gz"
printf '{"path":"object","sha256":"placeholder","size":1,"type":"file"}\n' \
  >"$OBJECT_RESTORE_GATE_CASE/object-storage-manifest.jsonl"
chmod 0600 \
  "$OBJECT_RESTORE_GATE_CASE/object-storage.tar.gz" \
  "$OBJECT_RESTORE_GATE_CASE/object-storage-manifest.jsonl"
if RESTORE_VALIDATE_ONLY=yes \
  RESTORE_OBJECT_STORAGE=yes \
  REQUIRE_CONFIRM_RESTORE=yes \
  OBJECT_STORAGE_ARCHIVE="$OBJECT_RESTORE_GATE_CASE/object-storage.tar.gz" \
  OBJECT_STORAGE_MANIFEST="$OBJECT_RESTORE_GATE_CASE/object-storage-manifest.jsonl" \
  GIT_REPO_URL='https://example.invalid/feishu-timeline.git' \
  GIT_REF=0123456789abcdef0123456789abcdef01234567 \
  bash "$RESTORE_SCRIPT" >/dev/null 2>"$OBJECT_RESTORE_GATE_CASE/missing-digests-stderr"; then
  fail 'restore_to_gcp accepted object data without independently reviewed archive and manifest digests'
fi
grep -F 'OBJECT_STORAGE_ARCHIVE_SHA256 must be an independently reviewed' \
  "$OBJECT_RESTORE_GATE_CASE/missing-digests-stderr" >/dev/null \
  || fail 'restore_to_gcp did not enforce independent object-archive provenance'
RESTORE_VALIDATE_ONLY=yes \
  RESTORE_OBJECT_STORAGE=yes \
  REQUIRE_CONFIRM_RESTORE=yes \
  OBJECT_STORAGE_ARCHIVE="$OBJECT_RESTORE_GATE_CASE/object-storage.tar.gz" \
  OBJECT_STORAGE_MANIFEST="$OBJECT_RESTORE_GATE_CASE/object-storage-manifest.jsonl" \
  OBJECT_STORAGE_ARCHIVE_SHA256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  OBJECT_STORAGE_MANIFEST_SHA256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  GIT_REPO_URL='https://example.invalid/feishu-timeline.git' \
  GIT_REF=0123456789abcdef0123456789abcdef01234567 \
  bash "$RESTORE_SCRIPT" >"$OBJECT_RESTORE_GATE_CASE/validated-stdout" \
  || fail 'restore_to_gcp rejected syntactically valid independent object integrity inputs at non-mutating preflight'
grep -F 'VALIDATION_ONLY=PASS' "$OBJECT_RESTORE_GATE_CASE/validated-stdout" >/dev/null \
  || fail 'restore_to_gcp object integrity preflight did not complete'
if grep -F 'manifest is unavailable' "$RESTORE_SCRIPT" >/dev/null; then
  fail 'restore_to_gcp can still downgrade a missing object manifest to a warning'
fi
grep -F 'OBJECT_STORAGE_ARCHIVE_SHA256=$(sha256_file "$archive_path")' \
  "$ROOT_DIR/scripts/migration/backup_old_server.sh" >/dev/null \
  || fail 'backup_old_server does not emit the object archive digest for independent review'
grep -F 'OBJECT_STORAGE_MANIFEST_SHA256=$(sha256_file "$OBJECT_STORAGE_MANIFEST")' \
  "$ROOT_DIR/scripts/migration/backup_old_server.sh" >/dev/null \
  || fail 'backup_old_server does not emit the object manifest digest for independent review'

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
grep -F 'run_as_app env -i' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp build runner still inherits ambient root/deploy environment data'
grep -F 'BUILD_USER=feishu-timeline-build' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not use a dedicated build identity'
grep -F 'runuser -u "$BUILD_USER" -- /usr/bin/sudo -n true' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not fail closed when the build identity can use sudo'
grep -F 'run_as_builder_in_dir "$BUILD_ROOT" pnpm install --frozen-lockfile' \
  "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp still runs dependency lifecycle code as the sudo-capable deploy identity'
grep -F 'quiesce_and_freeze_build_tree' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not stop the build UID and revoke write access before privileged release installation'
grep -F 'reopen_build_tree_for_builder' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not separate frozen privileged-tool intake from the writable build phase'
grep -F 'activate_data_tools' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp installs live privileged helpers before the transaction activation boundary'
grep -F 'DOTENV_TOOL_ACTIVATED=committing' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp cannot roll back a partial privileged-helper activation'
grep -F 'mv -Tf -- "$PREVIOUS_DOTENV_TOOL" "$DOTENV_DATA_TOOL_TARGET"' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not restore the previous privileged dotenv helper on rollback'
if grep -En 'run_as_app[[:space:]]+"[^"$]*\$[A-Z]' "$RESTORE_SCRIPT" >/dev/null; then
  fail 'restore_to_gcp still interpolates controlled values into Bash source text'
fi
grep -F '"$PYTHON_BIN" -I "$DOTENV_DATA_TOOL" exec --profile "$profile" "$env_file" -- "$@"' \
  "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not pass validated dotenv data directly to execve'
# Assert the literal source text, not the test environment.
# shellcheck disable=SC2016
if grep -F 'chown -R "$APP_USER:$APP_GROUP" "$APP_ROOT"' \
  "$RESTORE_SCRIPT" >/dev/null; then
  fail 'restore_to_gcp recursively changes ownership of trusted production env files'
fi
grep -F 'git -C "$source_repo" archive "$runtime_commit"' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not build from a clean archive of the exact commit'
grep -F '"GIT_NO_REPLACE_OBJECTS=1"' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp lets deploy-owned Git replace refs alter the exact approved commit'
grep -F 'chown -R root:root "$STAGED_RELEASE_DIR"' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not make the immutable release root-owned'
grep -F 'local review_root="$CONFIG_REVIEW_DIR/legacy-env"' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not quarantine legacy extra env data for operator review'
if grep -F 'target_path="/$relative_path"' "$RESTORE_SCRIPT" >/dev/null; then
  fail 'restore_to_gcp can reinstall untrusted legacy env data into the application tree'
fi

main_restore_call_line() {
  local call="$1"

  awk -v call="$call" '
    /^validate_restore_parameters$/ { in_main = 1 }
    in_main && $0 == call { print NR; exit }
  ' "$RESTORE_SCRIPT"
}

stage_database_line="$(main_restore_call_line stage_database_restore_if_requested)"
freeze_tool_source_line="$(main_restore_call_line quiesce_and_freeze_build_tree)"
stage_tools_line="$(main_restore_call_line install_dotenv_data_tool)"
reopen_build_line="$(main_restore_call_line reopen_build_tree_for_builder)"
build_restore_line="$(main_restore_call_line build_application)"
stage_object_line="$(main_restore_call_line stage_object_storage_if_requested)"
stage_release_line="$(main_restore_call_line stage_immutable_release)"
stage_config_line="$(main_restore_call_line stage_system_config_if_requested)"
review_config_line="$(main_restore_call_line copy_system_config_for_review_if_requested)"
quiesce_line="$(main_restore_call_line quiesce_runtime_services)"
restore_guard_line="$(main_restore_call_line arm_runtime_transaction_guard)"
activate_tools_line="$(main_restore_call_line activate_data_tools)"
commit_env_line="$(main_restore_call_line commit_primary_env_if_staged)"
activate_object_line="$(main_restore_call_line activate_object_storage_if_requested)"
activate_release_line="$(main_restore_call_line activate_immutable_release)"
activate_config_line="$(main_restore_call_line activate_system_config_if_staged)"
validate_config_line="$(main_restore_call_line validate_activated_system_config)"
restore_database_line="$(main_restore_call_line restore_database_if_requested)"
runtime_actions_line="$(main_restore_call_line apply_system_runtime_actions)"
verify_runtime_line="$(main_restore_call_line verify_started_runtime)"
commit_service_line="$(main_restore_call_line commit_service_enablement)"
restore_guard_commit_line="$(main_restore_call_line commit_runtime_transaction_guard)"
finalize_restore_line="$(main_restore_call_line finalize_restore_transaction)"
for transaction_line in \
  "$freeze_tool_source_line" "$stage_tools_line" "$reopen_build_line" "$build_restore_line" \
  "$stage_database_line" "$stage_object_line" "$stage_release_line" \
  "$stage_config_line" "$review_config_line" "$quiesce_line" "$restore_guard_line" "$activate_tools_line" \
  "$commit_env_line" "$activate_object_line" \
  "$activate_release_line" "$activate_config_line" "$validate_config_line" \
  "$restore_database_line" "$runtime_actions_line" "$verify_runtime_line" \
  "$commit_service_line" "$restore_guard_commit_line" "$finalize_restore_line"; do
  [[ "$transaction_line" =~ ^[0-9]+$ ]] \
    || fail 'restore_to_gcp transaction call graph contains an undefined or disconnected stage'
done
if ! (( freeze_tool_source_line < stage_tools_line \
    && stage_tools_line < reopen_build_line \
    && reopen_build_line < build_restore_line \
    && stage_database_line < quiesce_line \
    && stage_object_line < quiesce_line \
    && stage_release_line < quiesce_line \
    && stage_release_line < stage_config_line \
    && stage_config_line < quiesce_line \
    && review_config_line < quiesce_line \
    && quiesce_line < restore_guard_line \
    && restore_guard_line < activate_tools_line \
    && activate_tools_line < commit_env_line \
    && commit_env_line < activate_object_line \
    && activate_object_line < activate_release_line \
    && activate_release_line < activate_config_line \
    && activate_config_line < validate_config_line \
    && validate_config_line < restore_database_line \
    && restore_database_line < runtime_actions_line \
    && runtime_actions_line < verify_runtime_line \
    && verify_runtime_line < restore_guard_commit_line \
    && restore_guard_commit_line < commit_service_line \
    && commit_service_line < finalize_restore_line )); then
  fail 'restore_to_gcp mutates live env/release/data before all external inputs are staged and validated'
fi
grep -F 'systemctl is-active --quiet feishu-timeline-api.service' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp can commit after restart without proving the API service remains active'
grep -F 'systemctl is-active --quiet feishu-timeline-web.service' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp can commit after restart without proving the Web service remains active'
grep -F 'runtime metadata mismatch:' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp can discard rollback metadata without verifying the restored runtime identity'
grep -F 'arm_runtime_transaction_guard' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp has no independent fail-closed guard for coordinator SIGKILL'
grep -F '/usr/bin/systemctl stop feishu-timeline-api.service feishu-timeline-web.service nginx.service' \
  "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp crash guard does not make the restored runtime publicly unreachable'
grep -F 'RUNTIME_TRANSACTION_GUARD_MARKER="/var/lib/feishu-timeline-transactions/$transaction_id.committed"' \
  "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp crash guard commit is volatile across a power loss'
grep -F 'Runtime transaction guard is still active; retaining its commit marker.' \
  "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp can delete its guard marker while the guard remains active'
[ "$(grep -Fc '[ ! -e "$commit_marker" ] || exit 0' "$RESTORE_SCRIPT")" -ge 2 ] \
  || fail 'restore_to_gcp crash guard can stop a committed runtime after coordinator exit'
grep -F 'coordinator_state="${coordinator_stat##*) }"' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp crash guard treats an unreaped zombie coordinator as alive'
grep -F 'COMMITTED_BOOT_STATE=disabled_pending_review' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not report fail-closed boot state after post-commit enable failure'
grep -F 'local timeline_src="$STAGED_RELEASE_DIR/$TIMELINE_NGINX_SOURCE_REL"' \
  "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp review output is not prepared from the fully staged release before activation'
grep -F 'require_root_controlled_directory "$CONFIG_REVIEW_DIR/nginx" yes' \
  "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp can follow a pre-existing review-output subdirectory symlink during staging'
if ! awk '
  /^finalize_restore_transaction\(\)/ { in_finalize = 1 }
  in_finalize && /^}/ { exit found_cleanup ? 0 : 1 }
  in_finalize && /cleanup_repo_stage_dir \|\| warn/ { found_cleanup = 1 }
' "$RESTORE_SCRIPT"; then
  fail 'restore_to_gcp can report transactional failure after the live commit only because staging cleanup failed'
fi
if [ "$(grep -Fc 'fsync_directory "$RELEASES_DIR"' "$RESTORE_SCRIPT")" -lt 2 ] \
  || [ "$(grep -Fc 'fsync_directory "$APP_ROOT"' "$RESTORE_SCRIPT")" -lt 2 ]; then
  fail 'restore_to_gcp does not durably stage, activate, and roll back the immutable release pointer'
fi
if rg -n '^(restore_object_storage_if_requested|install_immutable_release)$' \
  "$RESTORE_SCRIPT" >/dev/null; then
  fail 'restore_to_gcp main still calls a removed pre-transaction restore function'
fi
grep -F 'trap '\''rollback_restore_transaction "$?"'\'' EXIT' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not install an EXIT rollback for incomplete activation'
grep -F 'RUNTIME_QUIESCED=committing' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not track a partially quiesced runtime for rollback'
grep -F 'systemctl disable "$runtime_unit"' \
  "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp can auto-start old runtime after a host crash at the database boundary'
grep -F 'SERVICES_BOOT_DISABLED=yes' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not track its persistent boot quarantine for rollback'
grep -F 'if [[ "$API_SERVICE_WAS_ACTIVE" = yes ]]' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not restore pre-transaction service state when rollback remains safe'
grep -F 'API_ENV_ACTIVATED=committing' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp cannot roll back a failure between the paired canonical env replacements'
grep -F 'fsync_directory /etc/feishu-timeline' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not durably commit or roll back canonical env metadata'
grep -F 'PRIMARY_API_SNAPSHOT_CREATED=yes' "$RESTORE_SCRIPT" >/dev/null \
  || fail 'restore_to_gcp does not track sensitive primary-env snapshots for failure cleanup'
if [ "$(grep -Fc -- '--set "RUNTIME_COMMIT=$RESTORED_RUNTIME_COMMIT"' "$RESTORE_SCRIPT")" -ne 2 ]; then
  fail 'restore_to_gcp does not bind API and Web runtime metadata to the same exact commit'
fi

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
