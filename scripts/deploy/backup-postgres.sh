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
    INSTANCE=*|PROJECT=*|ZONE=*) eval "$arg" ;;
    *)
      printf '[ERROR] Unsupported argument: %s\n' "$arg" >&2
      exit 1
      ;;
  esac
done

# shellcheck source=/dev/null
. "$ROOT_DIR/scripts/deploy/gce-common.sh"
require_gcloud

remote_script="$(mktemp)"
cat >"$remote_script" <<EOF
set -euo pipefail
umask 077

backup_root="${BACKUP_ROOT}"
run_restore_drill="${RUN_RESTORE_DRILL}"
keep_drill_artifacts="${KEEP_DRILL_ARTIFACTS}"

set -a
. /opt/feishu_timeline_app/apps/api/.env.production
set +a

base_db_url="\${DATABASE_URL%%\\?*}"
timestamp="\$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="\${backup_root}/\${timestamp}"
backup_file="\${backup_dir}/feishu-timeline.dump"
plain_sql="\${backup_dir}/feishu-timeline.sql"
rewritten_sql="\${backup_dir}/feishu-timeline.restore.sql"
report_file="\${backup_dir}/restore-drill-report.txt"
restore_schema="r12_restore_\$(date +%s)"

current_user="\$(id -un)"
current_group="\$(id -gn)"

if ! mkdir -p "\$backup_root" 2>/dev/null; then
  sudo install -d -m 0750 -o "\$current_user" -g "\$current_group" "\$backup_root"
fi

mkdir -p "\$backup_dir"

pg_dump --format=custom --no-owner --file "\$backup_file" "\$base_db_url"
sha256sum "\$backup_file" > "\${backup_file}.sha256"

printf 'backup_dir=%s\n' "\$backup_dir"
printf 'backup_file=%s\n' "\$backup_file"
printf 'backup_size=%s\n' "\$(du -h "\$backup_file" | awk '{print \$1}')"

if [ "\$run_restore_drill" != "yes" ]; then
  exit 0
fi

cleanup_restore_schema() {
  psql "\$base_db_url" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS \\"\$restore_schema\\" CASCADE" >/dev/null 2>&1 || true
}

trap cleanup_restore_schema EXIT

pg_restore --no-owner --file "\$plain_sql" "\$backup_file"

python3 - "\$plain_sql" "\$rewritten_sql" "\$restore_schema" <<'PY'
from pathlib import Path
import sys

source = Path(sys.argv[1]).read_text()
target = sys.argv[2]
schema = sys.argv[3]

replacements = [
    ('CREATE SCHEMA public;', f'CREATE SCHEMA "{schema}";'),
    ('ALTER SCHEMA public OWNER TO ', f'ALTER SCHEMA "{schema}" OWNER TO '),
    ('COMMENT ON SCHEMA public IS ', f'COMMENT ON SCHEMA "{schema}" IS '),
    ('SET search_path = public, pg_catalog;', f'SET search_path = "{schema}", pg_catalog;'),
    (' public.', f' "{schema}".'),
    ('public.', f'"{schema}".'),
    (' SCHEMA public', f' SCHEMA "{schema}"'),
]

for old, new in replacements:
    source = source.replace(old, new)

Path(target).write_text(source)
PY

psql "\$base_db_url" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS \\"\$restore_schema\\" CASCADE"
psql "\$base_db_url" -v ON_ERROR_STOP=1 -c "CREATE SCHEMA \\"\$restore_schema\\""
psql "\$base_db_url" -v ON_ERROR_STOP=1 -f "\$rewritten_sql" >/dev/null

public_tables="\$(psql "\$base_db_url" -Atqc "select count(*) from information_schema.tables where table_schema='public'")"
restore_tables="\$(psql "\$base_db_url" -Atqc "select count(*) from information_schema.tables where table_schema='\$restore_schema'")"
public_users="\$(psql "\$base_db_url" -Atqc "select count(*) from public.users")"
restore_users="\$(psql "\$base_db_url" -Atqc "select count(*) from \\"\$restore_schema\\".users")"
public_projects="\$(psql "\$base_db_url" -Atqc "select count(*) from public.projects")"
restore_projects="\$(psql "\$base_db_url" -Atqc "select count(*) from \\"\$restore_schema\\".projects")"
public_audit_logs="\$(psql "\$base_db_url" -Atqc "select count(*) from public.audit_logs")"
restore_audit_logs="\$(psql "\$base_db_url" -Atqc "select count(*) from \\"\$restore_schema\\".audit_logs")"

{
  printf 'restore_schema=%s\n' "\$restore_schema"
  printf 'public_tables=%s\n' "\$public_tables"
  printf 'restore_tables=%s\n' "\$restore_tables"
  printf 'public_users=%s\n' "\$public_users"
  printf 'restore_users=%s\n' "\$restore_users"
  printf 'public_projects=%s\n' "\$public_projects"
  printf 'restore_projects=%s\n' "\$restore_projects"
  printf 'public_audit_logs=%s\n' "\$public_audit_logs"
  printf 'restore_audit_logs=%s\n' "\$restore_audit_logs"
} | tee "\$report_file"

if [ "\$public_tables" != "\$restore_tables" ] || [ "\$public_users" != "\$restore_users" ] || [ "\$public_projects" != "\$restore_projects" ] || [ "\$public_audit_logs" != "\$restore_audit_logs" ]; then
  echo 'restore_status=mismatch' >&2
  exit 1
fi

echo 'restore_status=ok'

psql "\$base_db_url" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS \\"\$restore_schema\\" CASCADE" >/dev/null
trap - EXIT

if [ "\$keep_drill_artifacts" != "yes" ]; then
  rm -f "\$plain_sql" "\$rewritten_sql"
fi
EOF

gce_run_remote_script "$remote_script"
rm -f "$remote_script"
