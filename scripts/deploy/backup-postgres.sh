#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/feishu-timeline-db}"
RUN_RESTORE_DRILL="${RUN_RESTORE_DRILL:-no}"
KEEP_DRILL_ARTIFACTS="${KEEP_DRILL_ARTIFACTS:-no}"

for arg in "$@"; do
  case "$arg" in
    BACKUP_ROOT=*) BACKUP_ROOT="${arg#*=}" ;;
    RUN_RESTORE_DRILL=*) RUN_RESTORE_DRILL="${arg#*=}" ;;
    KEEP_DRILL_ARTIFACTS=*) KEEP_DRILL_ARTIFACTS="${arg#*=}" ;;
    INSTANCE=*) INSTANCE="${arg#*=}" ;;
    PROJECT=*) PROJECT="${arg#*=}" ;;
    ZONE=*) ZONE="${arg#*=}" ;;
    *)
      printf '[ERROR] Unsupported argument: %s\n' "$arg" >&2
      exit 1
      ;;
  esac
done

# shellcheck source=/dev/null
. "$ROOT_DIR/scripts/deploy/gce-common.sh"
: "$INSTANCE" "$PROJECT" "$ZONE"
validate_gce_connection_parameters

if [ "${#BACKUP_ROOT}" -gt 255 ] \
  || [[ ! "$BACKUP_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] \
  || [[ "$BACKUP_ROOT" =~ (^|/)\.\.?(/|$) ]]; then
  fail 'BACKUP_ROOT must be an absolute path without whitespace, control characters, or dot segments.'
fi
case "$RUN_RESTORE_DRILL" in
  yes|no)
    ;;
  *)
    fail 'RUN_RESTORE_DRILL must be yes or no.'
    ;;
esac
case "$KEEP_DRILL_ARTIFACTS" in
  yes|no)
    ;;
  *)
    fail 'KEEP_DRILL_ARTIFACTS must be yes or no.'
    ;;
esac
require_gcloud

remote_script="$(mktemp)"
cleanup_remote_script() {
  rm -f -- "$remote_script"
}
trap cleanup_remote_script EXIT

cat >"$remote_script" <<'EOF'
set -euo pipefail
umask 077
unset NODE_OPTIONS NODE_PATH PYTHONHOME PYTHONPATH PYTHONSTARTUP
export PATH=/usr/local/bin:/usr/bin:/bin

backup_root="${1:?missing backup root}"
run_restore_drill="${2:?missing restore-drill mode}"
keep_drill_artifacts="${3:?missing artifact-retention mode}"

if [ "${#backup_root}" -gt 255 ] \
  || [[ ! "$backup_root" =~ ^/var/backups/[A-Za-z0-9._-]+$ ]]; then
  printf '[ERROR] Backup root must be a direct safe child of /var/backups.\n' >&2
  exit 2
fi
case "$run_restore_drill:$keep_drill_artifacts" in
  yes:yes|yes:no|no:yes|no:no)
    ;;
  *)
    printf '[ERROR] Invalid restore-drill mode.\n' >&2
    exit 2
    ;;
esac

dotenv_data_tool=/usr/local/libexec/feishu-timeline/dotenv-data
api_env_file=/etc/feishu-timeline/api.env
sudo /usr/bin/python3 -I - "$dotenv_data_tool" "$api_env_file" <<'PY'
from pathlib import Path
import grp
import stat
import sys

tool = Path(sys.argv[1])
env_file = Path(sys.argv[2])
for directory in (
    Path('/usr'),
    Path('/usr/local'),
    Path('/usr/local/libexec'),
    tool.parent,
    Path('/etc'),
    env_file.parent,
):
    metadata = directory.lstat()
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0:
        raise SystemExit(f'privileged parent is not a root-owned non-symlink directory: {directory}')
    if stat.S_IMODE(metadata.st_mode) & 0o022:
        raise SystemExit(f'privileged parent is group/other writable: {directory}')

tool_metadata = tool.lstat()
if not stat.S_ISREG(tool_metadata.st_mode) or tool_metadata.st_uid != 0:
    raise SystemExit('Strict dotenv tool is not a root-owned regular file.')
if stat.S_IMODE(tool_metadata.st_mode) & 0o022 or not stat.S_IMODE(tool_metadata.st_mode) & 0o100:
    raise SystemExit('Strict dotenv tool has unsafe permissions.')

env_metadata = env_file.lstat()
api_gid = grp.getgrnam('feishu-timeline-api').gr_gid
if not stat.S_ISREG(env_metadata.st_mode) or env_metadata.st_uid != 0:
    raise SystemExit('Canonical API env is not a root-owned regular file.')
if env_metadata.st_gid != api_gid or stat.S_IMODE(env_metadata.st_mode) not in {0o440, 0o640}:
    raise SystemExit('Canonical API env is not isolated to the API runtime group.')
PY
sudo /usr/bin/python3 -I "$dotenv_data_tool" validate --profile api "$api_env_file"
postgres_exec() {
  sudo /usr/bin/python3 -I "$dotenv_data_tool" postgres-exec \
    --profile api "$api_env_file" -- "$@"
}
postgres_exec_database() {
  local database="$1"
  shift

  sudo /usr/bin/python3 -I "$dotenv_data_tool" postgres-exec \
    --profile api --database "$database" "$api_env_file" -- "$@"
}
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${backup_root}/${timestamp}"
backup_file="${backup_dir}/feishu-timeline.dump"
archive_list="${backup_dir}/feishu-timeline.archive.list"
report_file="${backup_dir}/restore-drill-report.txt"
restore_database="r27_restore_$(/usr/bin/python3 -I -c 'import secrets; print(secrets.token_hex(16))')"
RESTORE_DATABASE_CREATED=no

current_user="$(id -un)"
current_group="$(id -gn)"
current_uid="$(id -u)"

sudo /usr/bin/python3 -I - /var /var/backups <<'PY'
from pathlib import Path
import stat
import sys

var, backups = map(Path, sys.argv[1:])
metadata = var.lstat()
if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022:
    raise SystemExit('/var is not a root-controlled non-symlink directory')
try:
    metadata = backups.lstat()
except FileNotFoundError:
    raise SystemExit(0)
if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022:
    raise SystemExit('/var/backups is not a root-controlled non-symlink directory')
PY
sudo install -d -o root -g root -m 0755 /var/backups
sudo /usr/bin/python3 -I - /var/backups <<'PY'
from pathlib import Path
import stat
import sys

path = Path(sys.argv[1])
metadata = path.lstat()
if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022:
    raise SystemExit('/var/backups failed its root-controlled postcondition')
PY
if sudo test -e "$backup_root" || sudo test -L "$backup_root"; then
  sudo /usr/bin/python3 -I - "$backup_root" "$current_uid" <<'PY'
from pathlib import Path
import stat
import sys

path = Path(sys.argv[1])
expected_uid = int(sys.argv[2])
metadata = path.lstat()
if (
    not stat.S_ISDIR(metadata.st_mode)
    or metadata.st_uid != expected_uid
    or stat.S_IMODE(metadata.st_mode) != 0o700
):
    raise SystemExit(
        'Backup root must be a private non-symlink directory owned by the invoking identity.'
    )
PY
else
  sudo install -d -m 0700 -o "$current_user" -g "$current_group" "$backup_root"
fi

mkdir -m 0700 "$backup_dir"

(
  set -o noclobber
  postgres_exec /usr/bin/pg_dump --format=custom --no-owner >"$backup_file"
)
sha256sum "$backup_file" >"${backup_file}.sha256"

printf 'backup_dir=%s\n' "$backup_dir"
printf 'backup_file=%s\n' "$backup_file"
printf 'backup_size=%s\n' "$(du -h "$backup_file" | awk '{print $1}')"

if [ "$run_restore_drill" != "yes" ]; then
  exit 0
fi

cleanup_restore_database() {
  if [[ "$RESTORE_DATABASE_CREATED" = yes ]]; then
    sudo -u postgres /usr/bin/dropdb --if-exists -- "$restore_database" >/dev/null 2>&1 || true
  fi
}

trap cleanup_restore_database EXIT

/usr/bin/pg_restore --list "$backup_file" >"$archive_list"
source_database="$(postgres_exec /usr/bin/psql -X -Atqc 'select current_database()')"
restore_database_owner="$(postgres_exec /usr/bin/psql -X -Atqc 'select current_user')"
[[ "$source_database" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]] \
  || { echo 'Source database name is outside the approved identifier profile.' >&2; exit 1; }
[[ "$restore_database_owner" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]] \
  || { echo 'Restore database owner is outside the approved identifier profile.' >&2; exit 1; }

sudo -u postgres /usr/bin/createdb \
  --owner="$restore_database_owner" \
  --template=template0 \
  -- "$restore_database"
RESTORE_DATABASE_CREATED=yes
postgres_exec_database "$restore_database" /usr/bin/pg_restore --exit-on-error --no-owner "$backup_file"

table_digest() {
  local database="$1"
  local table="$2"

  [[ "$database" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ \
      && "$table" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]] \
    || { echo 'Restore-drill digest identifiers are unsafe.' >&2; return 1; }
  if [[ "$database" = "$source_database" ]]; then
    postgres_exec /usr/bin/psql -X -q -v ON_ERROR_STOP=1 \
      -c "COPY (SELECT row_to_json(t)::text FROM public.\"$table\" AS t ORDER BY row_to_json(t)::text) TO STDOUT"
  elif [[ "$database" = "$restore_database" ]]; then
    postgres_exec_database "$restore_database" /usr/bin/psql -X -q -v ON_ERROR_STOP=1 \
      -c "COPY (SELECT row_to_json(t)::text FROM public.\"$table\" AS t ORDER BY row_to_json(t)::text) TO STDOUT"
  else
    echo 'Restore-drill digest database is outside the transaction.' >&2
    return 1
  fi | sha256sum | awk '{print $1}'
}

source_tables="$(postgres_exec /usr/bin/psql -X -Atqc \
  "select count(*) from information_schema.tables where table_schema='public'")"
restore_tables="$(postgres_exec_database "$restore_database" /usr/bin/psql -X -Atqc \
  "select count(*) from information_schema.tables where table_schema='public'")"
source_constraints="$(postgres_exec /usr/bin/psql -X -Atqc \
  "select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'")"
restore_constraints="$(postgres_exec_database "$restore_database" /usr/bin/psql -X -Atqc \
  "select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'")"
source_indexes="$(postgres_exec /usr/bin/psql -X -Atqc \
  "select count(*) from pg_indexes where schemaname='public'")"
restore_indexes="$(postgres_exec_database "$restore_database" /usr/bin/psql -X -Atqc \
  "select count(*) from pg_indexes where schemaname='public'")"
source_users="$(postgres_exec /usr/bin/psql -X -Atqc "select count(*) from public.users")"
restore_users="$(postgres_exec_database "$restore_database" /usr/bin/psql -X -Atqc "select count(*) from public.users")"
source_projects="$(postgres_exec /usr/bin/psql -X -Atqc "select count(*) from public.projects")"
restore_projects="$(postgres_exec_database "$restore_database" /usr/bin/psql -X -Atqc "select count(*) from public.projects")"
source_audit_logs="$(postgres_exec /usr/bin/psql -X -Atqc "select count(*) from public.audit_logs")"
restore_audit_logs="$(postgres_exec_database "$restore_database" /usr/bin/psql -X -Atqc "select count(*) from public.audit_logs")"
source_users_digest="$(table_digest "$source_database" users)"
restore_users_digest="$(table_digest "$restore_database" users)"
source_projects_digest="$(table_digest "$source_database" projects)"
restore_projects_digest="$(table_digest "$restore_database" projects)"
source_audit_logs_digest="$(table_digest "$source_database" audit_logs)"
restore_audit_logs_digest="$(table_digest "$restore_database" audit_logs)"

{
  printf 'restore_database=%s\n' "$restore_database"
  printf 'source_tables=%s\n' "$source_tables"
  printf 'restore_tables=%s\n' "$restore_tables"
  printf 'source_constraints=%s\n' "$source_constraints"
  printf 'restore_constraints=%s\n' "$restore_constraints"
  printf 'source_indexes=%s\n' "$source_indexes"
  printf 'restore_indexes=%s\n' "$restore_indexes"
  printf 'source_users=%s\n' "$source_users"
  printf 'restore_users=%s\n' "$restore_users"
  printf 'source_projects=%s\n' "$source_projects"
  printf 'restore_projects=%s\n' "$restore_projects"
  printf 'source_audit_logs=%s\n' "$source_audit_logs"
  printf 'restore_audit_logs=%s\n' "$restore_audit_logs"
  printf 'source_users_digest=%s\n' "$source_users_digest"
  printf 'restore_users_digest=%s\n' "$restore_users_digest"
  printf 'source_projects_digest=%s\n' "$source_projects_digest"
  printf 'restore_projects_digest=%s\n' "$restore_projects_digest"
  printf 'source_audit_logs_digest=%s\n' "$source_audit_logs_digest"
  printf 'restore_audit_logs_digest=%s\n' "$restore_audit_logs_digest"
} | tee "$report_file"

if [ "$source_tables" != "$restore_tables" ] \
  || [ "$source_constraints" != "$restore_constraints" ] \
  || [ "$source_indexes" != "$restore_indexes" ] \
  || [ "$source_users" != "$restore_users" ] \
  || [ "$source_projects" != "$restore_projects" ] \
  || [ "$source_audit_logs" != "$restore_audit_logs" ] \
  || [ "$source_users_digest" != "$restore_users_digest" ] \
  || [ "$source_projects_digest" != "$restore_projects_digest" ] \
  || [ "$source_audit_logs_digest" != "$restore_audit_logs_digest" ]; then
  echo 'restore_status=mismatch' >&2
  exit 1
fi

echo 'restore_status=ok'

sudo -u postgres /usr/bin/dropdb --if-exists -- "$restore_database"
RESTORE_DATABASE_CREATED=no
trap - EXIT

if [ "$keep_drill_artifacts" != "yes" ]; then
  rm -f -- "$archive_list"
fi
EOF

gce_run_remote_script_with_args \
  "$remote_script" \
  "$BACKUP_ROOT" \
  "$RUN_RESTORE_DRILL" \
  "$KEEP_DRILL_ARTIFACTS"
cleanup_remote_script
trap - EXIT
