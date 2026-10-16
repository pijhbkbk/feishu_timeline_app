#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

INSTANCE="${INSTANCE:-instance-20260408-091840}"
PROJECT="${PROJECT:-axial-acrobat-492709-r7}"
ZONE="${ZONE:-us-west1-b}"
APP_ROOT="${APP_ROOT:-/opt/feishu_timeline_app}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME_DEFAULT="${DB_NAME_DEFAULT:-feishu_timeline}"
DB_USER_DEFAULT="${DB_USER_DEFAULT:-feishu_timeline_app}"
DB_SCHEMA="${DB_SCHEMA:-public}"
ROTATE_PLACEHOLDER_CREDENTIALS="${ROTATE_PLACEHOLDER_CREDENTIALS:-yes}"
RUN_PRISMA_MIGRATE_DEPLOY="${RUN_PRISMA_MIGRATE_DEPLOY:-yes}"

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=scripts/deploy/gce-common.sh
. "$ROOT_DIR/scripts/deploy/gce-common.sh"

validate_postgres_inputs() {
  validate_gce_connection_parameters

  if [ "${#APP_ROOT}" -gt 256 ] \
    || [[ ! "$APP_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] \
    || [[ "$APP_ROOT" =~ (^|/)\.\.?(/|$) ]]; then
    fail 'APP_ROOT must be an absolute normalized path containing only safe path characters.'
  fi
  if [ "${#DB_HOST}" -gt 253 ] \
    || [[ ! "$DB_HOST" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then
    fail 'DB_HOST must be a valid hostname or address literal without shell metacharacters.'
  fi
  if [[ ! "$DB_PORT" =~ ^[0-9]{1,5}$ ]] \
    || [ "$DB_PORT" -lt 1 ] || [ "$DB_PORT" -gt 65535 ]; then
    fail 'DB_PORT must be an integer from 1 through 65535.'
  fi
  for identifier in "$DB_NAME_DEFAULT" "$DB_USER_DEFAULT" "$DB_SCHEMA"; do
    if [ "${#identifier}" -gt 63 ] \
      || [[ ! "$identifier" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      fail 'Database names, users and schemas must be safe PostgreSQL identifiers.'
    fi
  done
  case "$ROTATE_PLACEHOLDER_CREDENTIALS" in yes|no) ;; *) fail 'ROTATE_PLACEHOLDER_CREDENTIALS must be yes or no.' ;; esac
  case "$RUN_PRISMA_MIGRATE_DEPLOY" in yes|no) ;; *) fail 'RUN_PRISMA_MIGRATE_DEPLOY must be yes or no.' ;; esac
}

validate_postgres_inputs
log "Bootstrapping PostgreSQL on $INSTANCE"
REMOTE_SCRIPT="$(mktemp /tmp/r27a-gce-postgres-remote.XXXXXX)"
cleanup_remote_script() {
  case "$REMOTE_SCRIPT" in
    /tmp/r27a-gce-postgres-remote.*) rm -f -- "$REMOTE_SCRIPT" ;;
    *) fail 'Refusing to remove an unexpected temporary path.' ;;
  esac
}
trap cleanup_remote_script EXIT

cat >"$REMOTE_SCRIPT" <<'REMOTE_SCRIPT_EOF'
#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$1"
DB_HOST="$2"
DB_PORT="$3"
DB_NAME_DEFAULT="$4"
DB_USER_DEFAULT="$5"
DB_SCHEMA="$6"
ROTATE_PLACEHOLDER_CREDENTIALS="$7"
RUN_PRISMA_MIGRATE_DEPLOY="$8"
export APP_ROOT DB_HOST DB_PORT DB_NAME_DEFAULT DB_USER_DEFAULT DB_SCHEMA
export ROTATE_PLACEHOLDER_CREDENTIALS RUN_PRISMA_MIGRATE_DEPLOY
API_ENV=/etc/feishu-timeline/api.env
DOTENV_DATA_TOOL=/usr/local/libexec/feishu-timeline/dotenv-data
API_ENV_CANDIDATE=""
API_ENV_PREVIOUS=""
API_ENV_STAGED=no
API_ENV_PREVIOUS_CREATED=no
API_ENV_ACTIVATED=no
API_RUNTIME_QUIESCED=no
API_SERVICE_WAS_ACTIVE=no
API_SERVICE_WAS_ENABLED=no
API_SERVICE_BOOT_QUARANTINED=no
API_SERVICE_ENABLE_ATTEMPTED=no
RUNTIME_TRANSACTION_GUARD_ARMED=no
RUNTIME_TRANSACTION_GUARD_COMMITTED=no
RUNTIME_TRANSACTION_GUARD_UNIT=""
RUNTIME_TRANSACTION_GUARD_MARKER=""
COMMITTED_BOOT_STATE=not_attempted
DB_CREDENTIAL_APPLIED=no
MIGRATION_APPLIED=no
BOOTSTRAP_COMMIT_COMPLETE=no

require_root_controlled_directory() {
  local directory="$1"
  local directory_mode
  local directory_uid

  sudo test -d "$directory" && sudo test ! -L "$directory" \
    || return 1
  directory_uid="$(sudo stat -c '%u' "$directory")"
  directory_mode="$(sudo stat -c '%a' "$directory")"
  [ "$directory_uid" = 0 ] \
    && [[ "$directory_mode" =~ ^[0-7]{3,4}$ ]] \
    && (( (8#$directory_mode & 0022) == 0 )) \
    || return 1
}

sync_api_boot_state() {
  sudo /bin/sync -f /etc/systemd/system
  if sudo test -e /etc/systemd/system/multi-user.target.wants \
    || sudo test -L /etc/systemd/system/multi-user.target.wants; then
    sudo test -d /etc/systemd/system/multi-user.target.wants \
      && ! sudo test -L /etc/systemd/system/multi-user.target.wants \
      || return 1
    sudo /bin/sync -f /etc/systemd/system/multi-user.target.wants
  fi
}

arm_runtime_transaction_guard() {
  local coordinator_identity
  local transaction_id

  [[ "$API_RUNTIME_QUIESCED" = yes ]] \
    || { echo 'Runtime transaction guard requires a quiesced API.' >&2; exit 1; }
  [[ -x /usr/bin/systemd-run ]] \
    || { echo 'Runtime transaction guard requires /usr/bin/systemd-run.' >&2; exit 1; }
  require_root_controlled_directory /var \
    || { echo 'Runtime transaction guard requires a root-controlled /var.' >&2; exit 1; }
  require_root_controlled_directory /var/lib \
    || { echo 'Runtime transaction guard requires a root-controlled /var/lib.' >&2; exit 1; }
  sudo install -d -o root -g root -m 0700 /var/lib/feishu-timeline-transactions
  require_root_controlled_directory /var/lib/feishu-timeline-transactions \
    || { echo 'Runtime transaction guard directory is unsafe.' >&2; exit 1; }
  transaction_id="$(< /proc/sys/kernel/random/uuid)"
  [[ "$transaction_id" =~ ^[0-9a-f-]{36}$ ]] \
    || { echo 'Could not obtain a bounded runtime transaction identifier.' >&2; exit 1; }
  RUNTIME_TRANSACTION_GUARD_UNIT="feishu-timeline-postgres-guard-$transaction_id"
  RUNTIME_TRANSACTION_GUARD_MARKER="/var/lib/feishu-timeline-transactions/$transaction_id.committed"
  ! sudo test -e "$RUNTIME_TRANSACTION_GUARD_MARKER" \
    && ! sudo test -L "$RUNTIME_TRANSACTION_GUARD_MARKER" \
    || { echo 'Runtime transaction commit marker unexpectedly exists.' >&2; exit 1; }
  coordinator_identity="$(stat -c '%i' "/proc/$$")"
  [[ "$coordinator_identity" =~ ^[0-9]+$ ]] \
    || { echo 'Could not bind the runtime guard to the coordinator identity.' >&2; exit 1; }
  sudo /usr/bin/systemd-run \
    --quiet \
    --collect \
    --property=Restart=no \
    --unit="$RUNTIME_TRANSACTION_GUARD_UNIT" \
    /usr/bin/bash -c '
      set -u
      coordinator_pid="$1"
      coordinator_identity="$2"
      commit_marker="$3"
      while :; do
        [ ! -e "$commit_marker" ] || exit 0
        [ -r "/proc/$coordinator_pid/stat" ] || break
        [ "$(/usr/bin/stat -c "%i" "/proc/$coordinator_pid" 2>/dev/null)" = "$coordinator_identity" ] \
          || break
        coordinator_stat="$(< "/proc/$coordinator_pid/stat")"
        coordinator_state="${coordinator_stat##*) }"
        coordinator_state="${coordinator_state%% *}"
        case "$coordinator_state" in
          Z|X|x) break ;;
        esac
        /usr/bin/sleep 1
      done
      [ ! -e "$commit_marker" ] || exit 0
      /usr/bin/systemctl disable feishu-timeline-api.service nginx.service || true
      /bin/sync -f /etc/systemd/system || true
      /bin/sync -f /etc/systemd/system/multi-user.target.wants || true
      /usr/bin/systemctl stop feishu-timeline-api.service nginx.service || true
    ' r27-runtime-guard "$$" "$coordinator_identity" "$RUNTIME_TRANSACTION_GUARD_MARKER"
  sudo systemctl is-active --quiet "$RUNTIME_TRANSACTION_GUARD_UNIT" \
    || { echo 'Runtime transaction guard did not remain active.' >&2; exit 1; }
  RUNTIME_TRANSACTION_GUARD_ARMED=yes
}

disarm_runtime_transaction_guard() {
  local guard_stopped=no

  if [[ "$RUNTIME_TRANSACTION_GUARD_ARMED" = yes \
      && -n "$RUNTIME_TRANSACTION_GUARD_UNIT" ]]; then
    if ! sudo systemctl is-active --quiet "$RUNTIME_TRANSACTION_GUARD_UNIT"; then
      guard_stopped=yes
    elif sudo systemctl stop "$RUNTIME_TRANSACTION_GUARD_UNIT" >/dev/null 2>&1; then
      for _ in 1 2 3 4 5; do
        if ! sudo systemctl is-active --quiet "$RUNTIME_TRANSACTION_GUARD_UNIT"; then
          guard_stopped=yes
          break
        fi
        sleep 1
      done
    fi
    if [[ "$guard_stopped" != yes ]]; then
      echo 'Runtime transaction guard is still active; retaining its commit marker.' >&2
      return 1
    fi
  fi
  if [[ -n "$RUNTIME_TRANSACTION_GUARD_MARKER" ]]; then
    sudo rm -f -- "$RUNTIME_TRANSACTION_GUARD_MARKER"
    sudo /bin/sync -f /var/lib/feishu-timeline-transactions
  fi
  RUNTIME_TRANSACTION_GUARD_ARMED=no
}

commit_runtime_transaction_guard() {
  [[ "$RUNTIME_TRANSACTION_GUARD_ARMED" = yes ]] \
    || { echo 'Runtime transaction guard is not armed.' >&2; exit 1; }
  sudo systemctl is-active --quiet "$RUNTIME_TRANSACTION_GUARD_UNIT" \
    || { echo 'Runtime transaction guard exited before commit.' >&2; exit 1; }
  sudo install -o root -g root -m 0600 /dev/null "$RUNTIME_TRANSACTION_GUARD_MARKER"
  sudo /bin/sync -f /var/lib/feishu-timeline-transactions
  RUNTIME_TRANSACTION_GUARD_COMMITTED=yes
  BOOTSTRAP_COMMIT_COMPLETE=yes
}

rollback_bootstrap() {
  local exit_status="$?"

  trap - EXIT HUP INT TERM
  if [[ "$exit_status" -eq 0 || "$BOOTSTRAP_COMMIT_COMPLETE" = yes ]]; then
    exit "$exit_status"
  fi

  set +e
  if [[ "$DB_CREDENTIAL_APPLIED" != no ]]; then
    sudo systemctl stop feishu-timeline-api.service || true
    sudo pkill -TERM -u feishu-timeline-api || true
    for _ in 1 2 3 4 5; do
      sudo pgrep -u feishu-timeline-api >/dev/null 2>&1 || break
      sleep 1
    done
    sudo pkill -KILL -u feishu-timeline-api || true
    if [[ "$API_SERVICE_BOOT_QUARANTINED" != no \
        || "$API_SERVICE_ENABLE_ATTEMPTED" = yes ]]; then
      sudo systemctl disable feishu-timeline-api.service || true
      sync_api_boot_state || true
    fi
    if [[ "$API_ENV_STAGED" != no && -n "$API_ENV_CANDIDATE" \
        && -f "$API_ENV_CANDIDATE" && ! -L "$API_ENV_CANDIDATE" ]]; then
      API_ENV_ACTIVATED=committing
      sudo mv -Tf -- "$API_ENV_CANDIDATE" "$API_ENV"
      API_ENV_STAGED=no
      API_ENV_ACTIVATED=yes
      sudo /bin/sync -f /etc/feishu-timeline || true
    fi
    echo 'Database credentials crossed their commit boundary; API remains stopped.' >&2
    echo "Previous API env retained root-only for manual recovery: $API_ENV_PREVIOUS" >&2
  else
    if [[ "$API_ENV_STAGED" != no && -n "$API_ENV_CANDIDATE" ]]; then
      sudo rm -f -- "$API_ENV_CANDIDATE"
    fi
    if [[ "$API_ENV_PREVIOUS_CREATED" != no && -n "$API_ENV_PREVIOUS" ]]; then
      sudo rm -f -- "$API_ENV_PREVIOUS"
    fi
    if [[ "$API_SERVICE_BOOT_QUARANTINED" != no \
        || "$API_SERVICE_ENABLE_ATTEMPTED" = yes ]]; then
      if [[ "$API_SERVICE_WAS_ENABLED" = yes ]]; then
        sudo systemctl enable feishu-timeline-api.service || true
      else
        sudo systemctl disable feishu-timeline-api.service || true
      fi
      sync_api_boot_state || true
    fi
    if [[ "$API_RUNTIME_QUIESCED" != no && "$API_SERVICE_WAS_ACTIVE" = yes ]]; then
      sudo systemctl start feishu-timeline-api.service \
        || echo 'Could not restore the previously active API service.' >&2
    fi
    disarm_runtime_transaction_guard \
      || echo 'Rollback left the fail-closed runtime guard armed.' >&2
  fi
  exit "$exit_status"
}

trap rollback_bootstrap EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

for root_directory in \
  /usr /usr/local /usr/local/libexec /usr/local/libexec/feishu-timeline \
  /etc /etc/systemd /etc/systemd/system; do
  require_root_controlled_directory "$root_directory" \
    || { echo "Root-controlled directory is unsafe: $root_directory" >&2; exit 1; }
done
sudo test -f "$DOTENV_DATA_TOOL" && sudo test ! -L "$DOTENV_DATA_TOOL" \
  && sudo test -x "$DOTENV_DATA_TOOL" \
  && [ "$(sudo stat -c '%u' "$DOTENV_DATA_TOOL")" = 0 ] \
  || { echo 'Privileged dotenv tool is not a root-owned regular file.' >&2; exit 1; }
DOTENV_TOOL_MODE="$(sudo stat -c '%a' "$DOTENV_DATA_TOOL")"
[[ "$DOTENV_TOOL_MODE" =~ ^[0-7]{3,4}$ ]] \
  && (( (8#$DOTENV_TOOL_MODE & 0022) == 0 )) \
  || { echo 'Privileged dotenv tool is group/other writable.' >&2; exit 1; }
require_root_controlled_directory /etc/feishu-timeline \
  || { echo 'Canonical API env parent is not root-controlled.' >&2; exit 1; }
sudo test -f "$API_ENV" && sudo test ! -L "$API_ENV" \
  || { echo 'Canonical API env is not a root-owned regular file.' >&2; exit 1; }
sudo /usr/bin/python3 -I "$DOTENV_DATA_TOOL" validate --profile api "$API_ENV"
[ "$(sudo stat -c '%u' "$API_ENV")" = 0 ] \
  || { echo 'Canonical API env is not root-owned.' >&2; exit 1; }
case "$(sudo stat -c '%a' "$API_ENV")" in
  440|640) ;;
  *) echo 'Canonical API env mode must be 0440 or 0640.' >&2; exit 1 ;;
esac
API_ENV_GID="$(sudo stat -c '%g' "$API_ENV")"
API_RUNTIME_GID="$(getent group feishu-timeline-api | awk -F: 'NR == 1 {print $3}')"
[[ "$API_RUNTIME_GID" =~ ^[0-9]+$ && "$API_ENV_GID" = "$API_RUNTIME_GID" ]] \
  || { echo 'Canonical API env is not isolated to the API runtime group.' >&2; exit 1; }
DATABASE_URL_INPUT="$(sudo /usr/bin/python3 -I "$DOTENV_DATA_TOOL" get --profile api "$API_ENV" DATABASE_URL)"
export DATABASE_URL_INPUT

mapfile -t DATABASE_FIELDS < <(/usr/bin/python3 -I - <<'PY'
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse, urlunparse
import os
import re
import secrets

database_url = os.environ['DATABASE_URL_INPUT']
parsed = urlparse(database_url) if database_url else None
db_name = unquote((parsed.path or '/').lstrip('/')) if parsed else ''
db_name = db_name or os.environ['DB_NAME_DEFAULT']
db_user = unquote(parsed.username or '') if parsed else ''
db_user = db_user or os.environ['DB_USER_DEFAULT']
db_password = unquote(parsed.password or '') if parsed else ''
db_host = (parsed.hostname if parsed else '') or os.environ['DB_HOST']
db_port = str(parsed.port) if parsed and parsed.port else os.environ['DB_PORT']
query = parse_qs(parsed.query if parsed else '', keep_blank_values=True)
db_schema = query.get('schema', [os.environ['DB_SCHEMA']])[0] or os.environ['DB_SCHEMA']

identifier = re.compile(r'[A-Za-z_][A-Za-z0-9_]{0,62}\Z')
for label, value in (('database', db_name), ('user', db_user), ('schema', db_schema)):
    if not identifier.fullmatch(value):
        raise SystemExit(f'Unsafe PostgreSQL {label} identifier')
if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]{0,252}', db_host):
    raise SystemExit('Unsafe PostgreSQL host')
if not db_port.isdigit() or not (1 <= int(db_port) <= 65535):
    raise SystemExit('Unsafe PostgreSQL port')

rotated = False
if os.environ['ROTATE_PLACEHOLDER_CREDENTIALS'] == 'yes' and db_user == 'postgres':
    db_user = os.environ['DB_USER_DEFAULT']
if os.environ['ROTATE_PLACEHOLDER_CREDENTIALS'] == 'yes' and db_password in {'', 'postgres'}:
    db_password = secrets.token_urlsafe(24)
    rotated = True

query['schema'] = [db_schema]
new_url = urlunparse((
    'postgresql',
    f'{quote(db_user, safe="")}:{quote(db_password, safe="")}@{db_host}:{db_port}',
    '/' + quote(db_name, safe=''),
    '',
    urlencode(query, doseq=True),
    '',
))
for value in (new_url, db_name, db_user, db_password, db_host, db_port, db_schema, 'yes' if rotated else 'no'):
    print(value)
PY
)
[ "${#DATABASE_FIELDS[@]}" -eq 8 ] \
  || { echo 'Could not derive bounded PostgreSQL configuration.' >&2; exit 1; }
NEW_DATABASE_URL="${DATABASE_FIELDS[0]}"
DB_NAME="${DATABASE_FIELDS[1]}"
DB_USER="${DATABASE_FIELDS[2]}"
DB_PASSWORD="${DATABASE_FIELDS[3]}"
DB_EFFECTIVE_HOST="${DATABASE_FIELDS[4]}"
DB_EFFECTIVE_PORT="${DATABASE_FIELDS[5]}"
DB_EFFECTIVE_SCHEMA="${DATABASE_FIELDS[6]}"
DB_PASSWORD_ROTATED="${DATABASE_FIELDS[7]}"

API_ENV_CANDIDATE="$(sudo mktemp /etc/feishu-timeline/.api.env.candidate.XXXXXX)"
API_ENV_STAGED=reserved
printf '%s' "$NEW_DATABASE_URL" | sudo /usr/bin/python3 -I "$DOTENV_DATA_TOOL" rewrite \
  --profile api \
  --source "$API_ENV" \
  --target "$API_ENV_CANDIDATE" \
  --set-stdin DATABASE_URL \
  --uid 0 \
  --gid "$API_ENV_GID" \
  --mode 0640 \
  --require-secure-parent
API_ENV_STAGED=yes
sudo /usr/bin/python3 -I "$DOTENV_DATA_TOOL" validate --profile api "$API_ENV_CANDIDATE"
API_ENV_PREVIOUS="$(sudo mktemp /etc/feishu-timeline/.api.env.previous.XXXXXX)"
API_ENV_PREVIOUS_CREATED=reserved
sudo /usr/bin/install -o root -g root -m 0600 "$API_ENV" "$API_ENV_PREVIOUS"
API_ENV_PREVIOUS_CREATED=yes
sudo /bin/sync -f /etc/feishu-timeline
unset DATABASE_URL_INPUT NEW_DATABASE_URL

printf 'DB_NAME=%s\n' "$DB_NAME"
printf 'DB_USER=%s\n' "$DB_USER"
printf 'DB_HOST=%s\n' "$DB_EFFECTIVE_HOST"
printf 'DB_PORT=%s\n' "$DB_EFFECTIVE_PORT"
printf 'DB_SCHEMA=%s\n' "$DB_EFFECTIVE_SCHEMA"
printf 'DB_PASSWORD_ROTATED=%s\n' "$DB_PASSWORD_ROTATED"

sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib

cluster_version="$(pg_lsclusters --no-header | awk 'NR==1 {print $1}')"
cluster_name="$(pg_lsclusters --no-header | awk 'NR==1 {print $2}')"
[ -n "$cluster_version" ] || { echo 'No PostgreSQL cluster found.' >&2; exit 1; }
[ -n "$cluster_name" ] || { echo 'No PostgreSQL cluster name found.' >&2; exit 1; }

sudo systemctl enable postgresql
sudo systemctl restart postgresql

sudo sed -i "s/^#\?listen_addresses\s*=.*/listen_addresses = 'localhost'/" "/etc/postgresql/$cluster_version/$cluster_name/postgresql.conf"
sudo systemctl restart postgresql

sudo systemctl cat feishu-timeline-api.service >/dev/null 2>&1 \
  || { echo 'API runtime unit is not installed.' >&2; exit 1; }
if sudo systemctl is-enabled --quiet feishu-timeline-api.service; then
  API_SERVICE_WAS_ENABLED=yes
fi
if sudo systemctl is-active --quiet feishu-timeline-api.service; then
  API_SERVICE_WAS_ACTIVE=yes
fi
API_RUNTIME_QUIESCED=committing
API_SERVICE_BOOT_QUARANTINED=committing
sudo systemctl disable feishu-timeline-api.service
sync_api_boot_state
API_SERVICE_BOOT_QUARANTINED=yes
if [[ "$API_SERVICE_WAS_ACTIVE" = yes ]]; then
  sudo systemctl stop feishu-timeline-api.service
fi
if sudo pgrep -u feishu-timeline-api >/dev/null 2>&1; then
  echo 'API runtime processes remain after service quiescence.' >&2
  exit 1
fi
API_RUNTIME_QUIESCED=yes
arm_runtime_transaction_guard

cd /tmp

ROLE_EXISTS="$(sudo -u postgres psql -v db_user="$DB_USER" -tA <<'SQL'
SELECT 1 FROM pg_roles WHERE rolname = :'db_user';
SQL
)"
printf '%s\0%s\0' "$DB_USER" "$DB_PASSWORD" | \
  /usr/bin/python3 -I -c '
import re
import sys

raw = sys.stdin.buffer.read(65537)
parts = raw.split(b"\0")
if len(raw) > 65536 or len(parts) != 3 or parts[-1] != b"":
    raise SystemExit("invalid bounded role-password input")
user = parts[0].decode("utf-8", errors="strict")
password = parts[1].decode("utf-8", errors="strict")
if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}", user):
    raise SystemExit("invalid PostgreSQL role identifier")
if any(ord(character) < 0x20 or ord(character) == 0x7f for character in password):
    raise SystemExit("PostgreSQL role password contains control data")
'
DB_CREDENTIAL_APPLIED=attempted
if [ "$ROLE_EXISTS" != 1 ]; then
  sudo -u postgres createuser --login "$DB_USER"
fi
{
  printf '%s\n' "\\password $DB_USER"
  printf '%s\n%s\n' "$DB_PASSWORD" "$DB_PASSWORD"
} | sudo -u postgres /usr/bin/psql -X -v ON_ERROR_STOP=1 --dbname=postgres
DB_CREDENTIAL_APPLIED=yes
unset DB_PASSWORD

API_ENV_ACTIVATED=committing
sudo mv -Tf -- "$API_ENV_CANDIDATE" "$API_ENV"
API_ENV_STAGED=no
API_ENV_ACTIVATED=yes
sudo /bin/sync -f /etc/feishu-timeline

DB_EXISTS="$(sudo -u postgres psql -v db_name="$DB_NAME" -tA <<'SQL'
SELECT 1 FROM pg_database WHERE datname = :'db_name';
SQL
)"
if [ "$DB_EXISTS" != 1 ]; then
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
fi

pg_isready -h localhost -p 5432

if [ "$RUN_PRISMA_MIGRATE_DEPLOY" = yes ]; then
  cd "$APP_ROOT/current/apps/api"
  MIGRATION_APPLIED=attempted
  sudo -u feishu-timeline-api /usr/bin/python3 -I "$DOTENV_DATA_TOOL" exec --profile api "$API_ENV" -- \
    node "$APP_ROOT/current/apps/api/node_modules/prisma/build/index.js" \
      migrate deploy --schema prisma/schema.prisma
  MIGRATION_APPLIED=yes
fi

sudo systemctl restart feishu-timeline-api
sleep 3
systemctl is-active postgresql
systemctl is-active feishu-timeline-api

DATABASE_URL_FINAL="$(sudo /usr/bin/python3 -I "$DOTENV_DATA_TOOL" get --profile api "$API_ENV" DATABASE_URL)"
export DATABASE_URL_FINAL
/usr/bin/python3 -I - <<'PY'
from urllib.parse import urlparse
import os
parsed = urlparse(os.environ['DATABASE_URL_FINAL'])
print('DATABASE_URL_host=' + (parsed.hostname or '<none>'))
print('DATABASE_URL_port=' + (str(parsed.port) if parsed.port else '<none>'))
print('DATABASE_URL_name=' + ((parsed.path or '/').lstrip('/') or '<none>'))
print('DATABASE_URL_user_present=' + ('yes' if parsed.username else 'no'))
print('DATABASE_URL_password_present=' + ('yes' if parsed.password else 'no'))
PY
unset DATABASE_URL_FINAL DB_PASSWORD
commit_runtime_transaction_guard
API_SERVICE_ENABLE_ATTEMPTED=yes
boot_state_complete=yes
if [[ "$API_SERVICE_WAS_ENABLED" = yes ]]; then
  if ! sudo systemctl enable feishu-timeline-api.service; then
    boot_state_complete=no
  fi
else
  if ! sudo systemctl disable feishu-timeline-api.service; then
    boot_state_complete=no
  fi
fi
if ! sync_api_boot_state; then
  boot_state_complete=no
fi
if [[ "$boot_state_complete" = yes ]]; then
  if [[ "$API_SERVICE_WAS_ENABLED" = yes ]]; then
    COMMITTED_BOOT_STATE=restored_enabled
  else
    COMMITTED_BOOT_STATE=restored_disabled
  fi
else
  echo 'Committed bootstrap boot-state restoration was incomplete; forcing the API unit disabled.' >&2
  if sudo systemctl disable feishu-timeline-api.service && sync_api_boot_state; then
    COMMITTED_BOOT_STATE=disabled_pending_review
  else
    COMMITTED_BOOT_STATE=unknown_manual_review
  fi
fi
printf 'committed_boot_state=%s\n' "$COMMITTED_BOOT_STATE"
disarm_runtime_transaction_guard \
  || echo 'Committed bootstrap retained its crash-guard marker for manual cleanup.' >&2
sudo rm -f -- "$API_ENV_CANDIDATE" "$API_ENV_PREVIOUS" \
  || echo 'Bootstrap committed, but API env rollback metadata requires manual cleanup.' >&2
sudo /bin/sync -f /etc/feishu-timeline \
  || echo 'Bootstrap committed, but the canonical env directory could not be fsynced.' >&2
trap - EXIT HUP INT TERM
REMOTE_SCRIPT_EOF

chmod 0700 "$REMOTE_SCRIPT"
gce_run_remote_script_with_args \
  "$REMOTE_SCRIPT" \
  "$APP_ROOT" \
  "$DB_HOST" \
  "$DB_PORT" \
  "$DB_NAME_DEFAULT" \
  "$DB_USER_DEFAULT" \
  "$DB_SCHEMA" \
  "$ROTATE_PLACEHOLDER_CREDENTIALS" \
  "$RUN_PRISMA_MIGRATE_DEPLOY"
