"""Version-independent public-schema inventory for the fixed PG14/PG16 release."""
import json
import native_backup_controller as backup

# Only catalog reads. Names and definitions are sorted in Python before hashing.
# No pg_dump headers, database names, OIDs, owner names, or server versions enter it.
QUERIES = {
    'columns': "SELECT json_build_array(c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid))::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped LIMIT 5001",
    'constraints': "SELECT json_build_array(c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid,false),k.convalidated,k.condeferrable,k.condeferred)::text FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' LIMIT 2001",
    'indexes': "SELECT json_build_array(c.relname,i.relname,pg_get_indexdef(x.indexrelid),x.indisvalid,x.indisready)::text FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' LIMIT 2001",
    'enums': "SELECT json_build_array(t.typname,e.enumsortorder,e.enumlabel)::text FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' LIMIT 1001",
    'routines': "SELECT json_build_array(p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid))::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') LIMIT 201",
    'triggers': "SELECT json_build_array(c.relname,t.tgname,pg_get_triggerdef(t.oid,false),t.tgenabled)::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal LIMIT 201",
    'policies': "SELECT json_build_array(tablename,policyname,permissive,roles,cmd,qual,with_check)::text FROM pg_policies WHERE schemaname='public' LIMIT 201",
    'tables': "SELECT json_build_array(c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') LIMIT 129",
    'sequences': "SELECT json_build_array(c.relname,s.seqtypid::regtype::text,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle)::text FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' LIMIT 129",
}
BOUNDS = dict(zip(QUERIES, (5000, 2000, 2000, 1000, 200, 200, 200, 128, 128)))


def inventory(query):
    result = {}
    for key, sql in QUERIES.items():
        raw = query(sql)
        backup.require(len(raw.encode()) <= 4 * 1024 * 1024, 'Schema definition bound exceeded')
        rows = [json.loads(line) for line in raw.splitlines()]
        backup.require(len(rows) <= BOUNDS[key], 'Schema inventory bound exceeded')
        result[key] = sorted(rows, key=lambda row: json.dumps(row, sort_keys=True))
    return result


def digest(value):
    return backup.sha(json.dumps(value, sort_keys=True, separators=(',', ':')).encode())
