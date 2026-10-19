// Explicit integration entry: node scripts/portable/schema-roundtrip.test.mjs
//   --image sha256:<exact PG14.24 image> --output <new evidence directory>
// Creates a network-isolated, non-root PostgreSQL container and fresh volume.
// Stops only its own container; retains synthetic volume and evidence for review.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const args = process.argv.slice(2);
assert.equal(args.length, 4);
assert.equal(args[0], '--image');
assert.match(args[1], /^sha256:[a-f0-9]{64}$/);
assert.equal(args[2], '--output');
const image = args[1], output = path.resolve(args[3]);
fs.mkdirSync(output, {mode: 0o700}); // Existing evidence is never overwritten.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrations = path.join(root, 'apps/api/prisma/migrations');
const migrationName = '20261019190000_canonical_restore_checks';
const migration = fs.readFileSync(path.join(migrations, migrationName, 'migration.sql'), 'utf8');
const name = `timeline-schema-${crypto.randomBytes(6).toString('hex')}`;
const password = crypto.randomBytes(32).toString('hex');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const normalize = value => value.toString().replace(/^\\(un)?restrict [A-Za-z0-9]+$/gm, (_, un = '') => `\\${un}restrict FIXED_GUARD`);
const record = {startedAt: new Date().toISOString(), image, name, volume: `${name}-data`, migrationSha256: sha(migration), testSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))), checks: [], exitCode: 1};
let started = false;
function command(argv, input, options = {}) {
  const r = spawnSync('docker', argv, {input, encoding: 'utf8', timeout: 90_000, maxBuffer: 8 * 1024 * 1024, ...options});
  assert(!r.error, r.error?.code ?? 'command failed');
  assert(!`${r.stdout}${r.stderr}`.includes(password), 'generated password appeared in command output');
  return r;
}
function ok(argv, input, options) {
  const r = command(argv, input, options);
  assert.equal(r.status, 0, `Docker command failed: stderr SHA256=${sha(r.stderr)}`);
  return r.stdout;
}
function sql(db, text, expected = 0) {
  const r = command(['exec', '-i', '--user', 'postgres', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', db], text);
  assert.equal(r.status, expected, `SQL command status=${r.status}; stderr SHA256=${sha(r.stderr)}`);
  return r;
}
function dump(db, kind) {
  return normalize(ok(['exec', '--user', 'postgres', name, 'pg_dump', '--no-owner', '--no-privileges', kind, db]));
}
function save(file, data) { fs.writeFileSync(path.join(output, file), data, {flag: 'wx', mode: 0o600}); }
function passed(name, details = {}) { record.checks.push({name, ...details}); }
function oldCheck(file, name) {
  const text = fs.readFileSync(path.join(migrations, file, 'migration.sql'), 'utf8');
  const start = text.indexOf(`CONSTRAINT "${name}"`);
  assert(start >= 0);
  const offset = text.indexOf('CHECK (', start) + 6;
  assert(offset >= 6);
  let depth = 0;
  for (let i = offset; i < text.length; i++) {
    if (text[i] === '(') depth++;
    if (text[i] === ')') {
      depth--;
      if (depth === 0) return text.slice(offset + 1, i);
    }
  }
  throw new Error('CHECK expression not found');
}
const oldLayout = oldCheck('202610130002_sheet_images', 'sheet_images_layout_check');
const oldTrial = oldCheck('20260811230000_bound_production_execution_records', 'trial_production_issues_text_bounds_check');
const fixture = `CREATE TABLE sheet_images (mode varchar(16) NOT NULL, "offsetX" integer NOT NULL, "offsetY" integer NOT NULL, width integer NOT NULL, height integer NOT NULL, revision integer NOT NULL, CONSTRAINT sheet_images_layout_check CHECK (${oldLayout}));
CREATE TABLE trial_production_issues ("issueType" varchar(500) NOT NULL, description varchar(4000) NOT NULL, "responsibleDept" varchar(500) NOT NULL, CONSTRAINT trial_production_issues_text_bounds_check CHECK (${oldTrial}));
INSERT INTO sheet_images VALUES ('CELL', 0, 0, 16, 16, 1);
INSERT INTO trial_production_issues VALUES ('synthetic', 'retained fact', 'synthetic team');`;
const cases = [];
function layoutCase(changes, expected) {
  const values = {mode: "'CELL'", offsetX: '0', offsetY: '0', width: '16', height: '16', revision: '1', ...changes};
  cases.push([`INSERT INTO sheet_images VALUES (${Object.values(values).join(',')})`, expected]);
}
for (const mode of ["'CELL'", "'FLOATING'"]) layoutCase({mode}, 'ok');
for (const mode of ["''", "'cell'", "'OTHER'"]) layoutCase({mode}, '23514');
for (const field of ['offsetX', 'offsetY']) {
  for (const value of [-4096, 4096]) layoutCase({[field]: String(value)}, 'ok');
  for (const value of [-4097, 4097]) layoutCase({[field]: String(value)}, '23514');
}
for (const field of ['width', 'height']) {
  for (const value of [16, 4096]) layoutCase({[field]: String(value)}, 'ok');
  for (const value of [15, 4097]) layoutCase({[field]: String(value)}, '23514');
}
for (const revision of ['1', '2147483647']) layoutCase({revision}, 'ok');
for (const revision of ['0', '-1']) layoutCase({revision}, '23514');
for (const field of ['mode', 'offsetX', 'offsetY', 'width', 'height', 'revision']) layoutCase({[field]: 'NULL'}, '23502');
for (const [field, max] of [['issueType', 500], ['description', 4000], ['responsibleDept', 500]]) {
  for (const [value, expected] of [["'中'", 'ok'], [`repeat('中',${max})`, 'ok'], ["''", '23514'], [`repeat('中',${max + 1})`, '22001'], ['NULL', '23502']]) {
    const values = {issueType: "'x'", description: "'x'", responsibleDept: "'x'", [field]: value};
    cases.push([`INSERT INTO trial_production_issues VALUES (${Object.values(values).join(',')})`, expected]);
  }
}
function boundarySql() {
  return cases.map(([insert, expected]) => `DO $case$ BEGIN BEGIN ${insert};
    ${expected === 'ok' ? '' : "RAISE EXCEPTION 'unexpected acceptance';"}
    RAISE EXCEPTION USING ERRCODE='Z0001';
    EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
    WHEN OTHERS THEN ${expected === 'ok' ? 'RAISE;' : `IF SQLSTATE <> '${expected}' THEN RAISE; END IF;`} END; END $case$;`).join('\n');
}

try {
  assert.equal(ok(['image', 'inspect', image, '--format', '{{.Os}}/{{.Architecture}}|{{.Config.User}}']).trim(), 'linux/amd64|postgres');
  ok(['run', '--detach', '--pull', 'never', '--platform', 'linux/amd64', '--network', 'none', '--user', 'postgres',
    '--memory', '512m', '--pids-limit', '128', '--label', 'com.feishu-timeline.purpose=synthetic-schema-roundtrip', '--name', name,
    '--mount', `type=volume,source=${name}-data,target=/var/lib/postgresql/data`, '--env', 'POSTGRES_PASSWORD', image], undefined,
    {env: {...process.env, POSTGRES_PASSWORD: password}});
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    // The entrypoint's temporary init server is socket-only; wait for the final
    // TCP listener rather than racing its intentional shutdown/restart.
    if (command(['exec', '--user', 'postgres', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  assert(ready, 'PostgreSQL did not become ready');
  assert.equal(ok(['exec', '--user', 'postgres', name, 'id', '-u']).trim(), '70');
  assert.equal(sql('postgres', 'SHOW server_version;').stdout.trim().split(' ')[0], '14.24');
  passed('fresh PostgreSQL 14.24 uses non-root UID and no network');
  for (const db of ['bounds', 'rollback', 'full_source', 'full_restored']) sql('postgres', `CREATE DATABASE ${db};`);
  sql('bounds', fixture);
  const beforeData = dump('bounds', '--data-only');
  sql('bounds', boundarySql());
  passed('original constraints enforce valid/invalid boundaries and NOT NULL', {cases: cases.length});
  sql('bounds', migration);
  sql('bounds', boundarySql());
  assert.equal(dump('bounds', '--data-only'), beforeData);
  passed('canonical constraints retain all boundaries and original rows', {cases: cases.length, dataSha256: sha(beforeData)});

  sql('rollback', fixture + `
    ALTER TABLE trial_production_issues DROP CONSTRAINT trial_production_issues_text_bounds_check;
    INSERT INTO trial_production_issues VALUES ('', 'legacy invalid synthetic fact', 'synthetic');
    ALTER TABLE trial_production_issues ADD CONSTRAINT trial_production_issues_text_bounds_check CHECK (${oldTrial}) NOT VALID;`);
  const failedSchema = dump('rollback', '--schema-only'), failedData = dump('rollback', '--data-only');
  const rejected = sql('rollback', migration, 3);
  assert.match(rejected.stderr, /trial_production_issues_text_bounds_check/);
  assert.equal(dump('rollback', '--schema-only'), failedSchema);
  assert.equal(dump('rollback', '--data-only'), failedData);
  passed('invalid existing row rejects migration and rolls both CHECK changes back', {schemaSha256: sha(failedSchema), dataSha256: sha(failedData)});

  const names = fs.readdirSync(migrations).filter(n => fs.existsSync(path.join(migrations, n, 'migration.sql'))).sort();
  assert.equal(names.at(-1), migrationName);
  for (const n of names.filter(n => n !== migrationName)) sql('full_source', fs.readFileSync(path.join(migrations, n, 'migration.sql'), 'utf8'));
  const fullBeforeData = dump('full_source', '--data-only');
  sql('full_source', migration);
  assert.equal(dump('full_source', '--data-only'), fullBeforeData);
  const sourceSchema = dump('full_source', '--schema-only');
  save('source-schema.sql', sourceSchema);
  sql('full_restored', sourceSchema);
  const restoredSchema = dump('full_restored', '--schema-only');
  save('restored-schema.sql', restoredSchema);
  assert.equal(restoredSchema, sourceSchema, 'Full schema must match byte-for-byte after only the existing random guard normalization');
  passed('all repository migrations preserve data and exact full schema dump/restore bytes', {
    migrationCount: names.length, schemaBytes: Buffer.byteLength(sourceSchema), sourceSchemaSha256: sha(sourceSchema), restoredSchemaSha256: sha(restoredSchema), dataSha256: sha(fullBeforeData),
    normalization: 'Only pg_dump random restrict/unrestrict guard; no CHECK or SQL normalization',
    boundary: 'SQL migrations directly applied; Prisma bookkeeping and complete portable application backup/restore are verified separately',
  });
  record.exitCode = 0;
} catch (error) {
  record.error = String(error.message).slice(0, 1500);
  process.exitCode = 1;
} finally {
  if (started) {
    const stopped = command(['stop', '--time', '10', name]);
    record.stopExitCode = stopped.status;
    if (stopped.status !== 0) { record.exitCode = 1; process.exitCode = 1; }
  }
  record.finishedAt = new Date().toISOString();
  save('verification.json', JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record, null, 2));
}
