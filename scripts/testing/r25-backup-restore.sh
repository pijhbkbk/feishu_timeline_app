#!/usr/bin/env bash
set -euo pipefail

IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=/dev/null
. "$ROOT_DIR/scripts/deploy/common.sh"

require_command docker
require_command sha256sum

load_compose_env

RUN_ID="${R25_BACKUP_RUN_ID:-R25-BACKUP-$(date -u +%Y%m%dT%H%M%SZ)}"
RESULT_ROOT="${R25_BACKUP_RESULT_ROOT:-$ROOT_DIR/test-results/r25/backup-restore}"
RESULT_DIR="$RESULT_ROOT/$RUN_ID"
BACKUP_FILE="$RESULT_DIR/feishu-timeline-staging.dump"
CHECKSUM_FILE="$BACKUP_FILE.sha256"
REPORT_FILE="$RESULT_DIR/report.txt"
SOURCE_DB="${POSTGRES_DB:-feishu_timeline}"
DB_USER="${POSTGRES_USER:-postgres}"
RESTORE_DB="r25_restore_$(date -u +%Y%m%d%H%M%S)_$RANDOM"
POSTGRES_CONTAINER="$(compose ps -q postgres)"

[[ "$RUN_ID" =~ ^[A-Za-z0-9._-]+$ ]] || fail "Invalid R25_BACKUP_RUN_ID."
[[ "$RESTORE_DB" =~ ^[a-z0-9_]+$ ]] || fail "Invalid generated restore database name."
[[ -n "$POSTGRES_CONTAINER" ]] || fail "Staging PostgreSQL container is not running."

umask 077
mkdir -p "$RESULT_DIR"
chmod 700 "$RESULT_DIR"

RESTORE_CREATED=no

cleanup() {
  if [[ "$RESTORE_CREATED" == "yes" ]]; then
    docker exec "$POSTGRES_CONTAINER" dropdb --if-exists --force -U "$DB_USER" "$RESTORE_DB" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

table_count() {
  local database="$1"
  local table="$2"
  docker exec "$POSTGRES_CONTAINER" psql -X -U "$DB_USER" -d "$database" -Atqc "select count(*) from \"$table\";"
}

printf 'Creating staging backup for run %s\n' "$RUN_ID"
docker exec "$POSTGRES_CONTAINER" pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --username="$DB_USER" \
  --dbname="$SOURCE_DB" >"$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"

(cd "$RESULT_DIR" && sha256sum "$(basename "$BACKUP_FILE")" >"$(basename "$CHECKSUM_FILE")")
chmod 600 "$CHECKSUM_FILE"
(cd "$RESULT_DIR" && sha256sum --check "$(basename "$CHECKSUM_FILE")") >/dev/null

docker exec -i "$POSTGRES_CONTAINER" pg_restore --list <"$BACKUP_FILE" >/dev/null

docker exec "$POSTGRES_CONTAINER" createdb -U "$DB_USER" "$RESTORE_DB"
RESTORE_CREATED=yes
docker exec -i "$POSTGRES_CONTAINER" pg_restore \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  --username="$DB_USER" \
  --dbname="$RESTORE_DB" <"$BACKUP_FILE"

tables=(
  _prisma_migrations
  projects
  workflow_tasks
  attachments
  review_records
  audit_logs
)

status=PASS
: >"$REPORT_FILE"
record() {
  printf '%s\n' "$1" | tee -a "$REPORT_FILE"
}

record "run_id=$RUN_ID"
record "source_database=$SOURCE_DB"
record 'restore_database=temporary_database_destroyed_after_validation'
record "backup_file=$BACKUP_FILE"
record "backup_bytes=$(wc -c <"$BACKUP_FILE" | tr -d ' ')"
record "backup_sha256=$(cut -d' ' -f1 "$CHECKSUM_FILE")"
record 'checksum_verified=true'
record 'catalog_readable=true'
for table in "${tables[@]}"; do
  source_count="$(table_count "$SOURCE_DB" "$table")"
  restore_count="$(table_count "$RESTORE_DB" "$table")"
  record "${table}_source=$source_count"
  record "${table}_restore=$restore_count"
  if [[ "$source_count" != "$restore_count" ]]; then
    status=FAIL
  fi
done
record "data_counts_match=$([[ "$status" == "PASS" ]] && printf true || printf false)"
record "result=$status"
chmod 600 "$REPORT_FILE"

docker exec "$POSTGRES_CONTAINER" dropdb --if-exists --force -U "$DB_USER" "$RESTORE_DB"
RESTORE_CREATED=no

remaining="$(docker exec "$POSTGRES_CONTAINER" psql -X -U "$DB_USER" -d "$SOURCE_DB" -Atqc "select count(*) from pg_database where datname = '$RESTORE_DB';")"
[[ "$remaining" == "0" ]] || fail "Temporary restore database still exists after cleanup."

[[ "$status" == "PASS" ]] || fail "Restored data counts do not match the staging source."
record 'temporary_restore_database_destroyed=true'
printf 'R25 backup/restore rehearsal passed: %s\n' "$RESULT_DIR"
