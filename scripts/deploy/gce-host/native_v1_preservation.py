"""Read-only preservation contract for the fixed 41 to 54 migration sequence.

The caller supplies an explicit database-scoped query. No implicit production
target, role mutation, data restore or migration execution is exposed here.
Only column names, row counts and digests leave PostgreSQL.
"""
import json
import re
import native_backup_controller as backup
from native_migration_probe import identifier

require = backup.require
NEW_TABLES = {
    'production_bases', 'hue_standards', 'color_import_batches', 'color_import_rows',
    'color_production_facts', 'person_profiles', 'sheet_images', 'inspection_activities',
    'inspection_participants', 'inspection_objects', 'inspection_occurrences',
    'inspection_measurements', 'inspection_readings', 'inspection_defects',
    'free_workbooks', 'free_workbook_revisions', 'free_workbook_drafts', 'color_production_bases',
}


def projection(query, table, selected, old_migrations=None):
    require(0 < len(selected) <= 200 and len(set(selected)) == len(selected), 'Column scope differs')
    clause = ''
    if old_migrations is not None:
        require(table == '_prisma_migrations' and len(old_migrations) == 41 and
                len(set(old_migrations)) == 41 and
                all(re.fullmatch(r'[0-9]{14}_[a-z0-9_]+', name) for name in old_migrations),
                'Historical migration scope differs')
        clause = ' WHERE migration_name IN (' + ','.join("'" + name + "'" for name in old_migrations) + ')'
    inner = ('SELECT ' + ','.join(identifier(name) for name in selected) + ' FROM public.' +
             identifier(table) + clause + ' LIMIT 50001')
    raw = query("SELECT count(*)::text||':'||encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') "
                "FROM (SELECT encode(sha256(convert_to(row_to_json(r)::text,'UTF8')),'hex') AS h FROM (" + inner + ') AS r) AS hashes;')
    require(len(raw) <= 100, 'Projection response exceeds bound')
    count, digest = raw.split(':')
    require(count.isdigit() and int(count) <= 50000 and re.fullmatch(r'[a-f0-9]{64}', digest),
            'Projection exceeds bounds')
    return {'count': int(count), 'sha256': digest}


def tables(query, count):
    require(count in (54, 72), 'Unsupported table count')
    names = query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LIMIT 73;").splitlines()
    require(len(names) == count and len(set(names)) == count, 'Table inventory differs')
    for name in names:
        identifier(name)
    return names


def migration_rows(query, manifest):
    require(len(manifest) in (41, 54) and
            all(re.fullmatch(r'(?:[0-9]{12}|[0-9]{14})_[a-z0-9_]+', name) and
                re.fullmatch(r'[a-f0-9]{64}', digest) for name, digest in manifest.items()),
            'Fixed migration manifest differs')
    raw = query("SELECT coalesce(json_agg(r ORDER BY migration_name),'[]')::text FROM "
                '(SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back '
                'FROM public."_prisma_migrations" ORDER BY migration_name LIMIT 55) AS r;')
    require(len(raw.encode()) <= 32768, 'Migration state exceeds bound')
    rows = json.loads(raw)
    require(len(rows) == len(manifest) and
            {row['migration_name']: row['checksum'] for row in rows} == manifest and
            all(row['finished'] and not row['rolled_back'] for row in rows), 'Migration history differs')
    return rows


def capture_before(query, manifest):
    require(len(manifest) == 41, 'Expected 41-migration baseline')
    require(int(query('SELECT pg_database_size(current_database());')) <= backup.MAX_DUMP,
            'Baseline database exceeds existing backup bound')
    migration_rows(query, manifest)
    result = {}
    for table in tables(query, 54):
        names = query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='" +
                      table + "' ORDER BY ordinal_position LIMIT 201;").splitlines()
        result[table] = {'columns': names, 'projection': projection(query, table, names)}
    return {'migrations': manifest, 'tables': result}


def verify_after(query, before, manifest):
    require(len(before['tables']) == 54 and len(before['migrations']) == 41 and len(manifest) == 54 and
            all(manifest.get(name) == digest for name, digest in before['migrations'].items()),
            'Baseline migration binding differs')
    require(set(tables(query, 72)) == set(before['tables']) | NEW_TABLES, 'New table set differs')
    migration_rows(query, manifest)
    for table, info in before['tables'].items():
        historical = list(before['migrations']) if table == '_prisma_migrations' else None
        require(projection(query, table, info['columns'], historical) == info['projection'],
                'Historical rows or columns changed: ' + table)
    for table in sorted(NEW_TABLES - {'person_profiles'}):
        require(query('SELECT count(*) FROM public.' + identifier(table) + ';') == '0',
                'Unexpected rows in new table: ' + table)
    require(query('SELECT count(*) FROM public.users WHERE "teamAccessApproved" IS DISTINCT FROM false;') == '0',
            'Migration must not grant team admission')
    # Match every source field and identity, including inactive users and timestamps.
    invalid = query('''SELECT count(*) FROM public.users u FULL JOIN public.person_profiles p ON p.id=u.id
        WHERE u.id IS NULL OR p.id IS NULL OR p."userId" IS DISTINCT FROM u.id
        OR p.name IS DISTINCT FROM u.name OR p."departmentId" IS DISTINCT FROM u."departmentId"
        OR p.email IS DISTINCT FROM u.email OR p.mobile IS DISTINCT FROM u.mobile
        OR p."isActive" IS DISTINCT FROM (u.status='ACTIVE')
        OR p."createdAt" IS DISTINCT FROM u."createdAt" OR p."updatedAt" IS DISTINCT FROM u."updatedAt"
        OR p.revision<>1 OR p.position IS NOT NULL OR p.note IS NOT NULL
        OR p."importKey" IS NOT NULL OR p."archivedAt" IS NOT NULL;''')
    require(invalid == '0', 'Person profile backfill differs from exact source identity')
    return {'oldTables': 54, 'newTables': 18, 'migrations': 54,
            'oldColumnsUnchanged': True, 'personProfilesExact': True, 'implicitAdmissionGranted': False}
