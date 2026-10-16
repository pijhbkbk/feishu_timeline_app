// Explicit opt-in: creates only a new disposable, network-isolated PostgreSQL container.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { prepareRestoreSnapshot } from '../verify-restore-inputs.mjs';

const image = process.env.RESTORE_TEST_POSTGRES_IMAGE;
assert.match(image ?? '', /^sha256:[a-f0-9]{64}$/, 'Supply a cached, exact PostgreSQL image ID; tags and implicit downloads are forbidden');
const container = `restore-rehearsal-${randomUUID()}`;
const root = mkdtempSync(join(realpathSync(tmpdir()), 'restore-rehearsal-'));
const bundle = join(root, 'bundle'); const snapshots = join(root, 'snapshots');
mkdirSync(bundle); mkdirSync(snapshots); mkdirSync(join(bundle, 'objects'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function run(args, input, allowFailure = false) {
  const result = spawnSync('docker', args, { input, encoding: input instanceof Buffer ? undefined : 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
  if (!allowFailure) assert.equal(result.status, 0, `${args[0]} failed: ${String(result.stderr).slice(0, 1500)}`);
  return result;
}
const pg = (args, input, allowFailure = false) => run(['exec', '-i', container, ...args], input, allowFailure);
const sql = (database, query, allowFailure = false) => pg(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database, '-At'], query, allowFailure);
let owned = false;
let restoreCalls = 0;
const results = [];
function restore(snapshot, database) {
  // The target is created by this process; refuse any nonempty public schema.
  const count = sql(database, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public';");
  assert.equal(String(count.stdout).trim(), '0', 'Restore target must be empty');
  restoreCalls++;
  return pg(['pg_restore', '--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '-U', 'postgres', '-d', database], readFileSync(join(snapshot.snapshotRoot, 'database.dump')), true);
}
try {
  run(['image', 'inspect', image]);
  owned = true;
  run(['run', '-d', '--pull=never', '--name', container, '--network', 'none', '--read-only', '--user', 'postgres', '--cap-drop=ALL', '--security-opt', 'no-new-privileges', '--memory', '512m', '--pids-limit', '128', '--tmpfs', '/tmp:rw,nosuid,nodev,mode=1777,size=268435456', '--tmpfs', '/var/run/postgresql:rw,nosuid,nodev,mode=1777,size=4194304', '-e', 'PGDATA=/tmp/rehearsal-pgdata', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (pg(['pg_isready', '-U', 'postgres'], undefined, true).status === 0) { ready = true; break; }
    await delay(250);
  }
  assert.ok(ready, 'Isolated PostgreSQL did not become ready');
  for (const db of ['fixture', 'restored', 'corrupt_target']) pg(['createdb', '-U', 'postgres', db]);
  sql('fixture', `CREATE TABLE projects (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE audit_logs (id text PRIMARY KEY, project_id text REFERENCES projects(id), fact text NOT NULL);
CREATE TABLE attachments (id text PRIMARY KEY, project_id text REFERENCES projects(id), object_key text UNIQUE NOT NULL, checksum text NOT NULL);
INSERT INTO projects VALUES ('p1','synthetic project');
INSERT INTO audit_logs VALUES ('a1','p1','Created; original immutable fact');`);
  const object = Buffer.from('synthetic attachment version 1');
  sql('fixture', `INSERT INTO attachments VALUES ('f1','p1','objects/version-1.txt','${sha(object)}');`);
  const dumpResult = spawnSync('docker', ['exec', container, 'pg_dump', '--format=custom', '--no-owner', '--no-privileges', '-U', 'postgres', 'fixture'], { timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(dumpResult.status, 0);
  const dump = dumpResult.stdout;
  writeFileSync(join(bundle, 'database.dump'), dump);
  writeFileSync(join(bundle, 'objects/version-1.txt'), object);
  const manifest = { version: 1, database: { path: 'database.dump', size: dump.length, sha256: sha(dump) }, objects: [{path: 'objects/version-1.txt', size: object.length, sha256: sha(object)}] };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  writeFileSync(join(bundle, 'restore-manifest.json'), manifestBytes);
  const approvedHash = sha(manifestBytes);
  const snapshot = prepareRestoreSnapshot(bundle, approvedHash, snapshots);
  pg(['pg_restore', '--list'], readFileSync(join(snapshot.snapshotRoot, 'database.dump')));
  assert.equal(restore(snapshot, 'restored').status, 0);
  const dumpRows = (db) => ['projects', 'audit_logs', 'attachments'].map((table) => String(sql(db, `SELECT row_to_json(t)::text FROM ${table} t ORDER BY id;`).stdout));
  assert.deepEqual(dumpRows('restored'), dumpRows('fixture'));
  assert.equal(sha(readFileSync(join(snapshot.snapshotRoot, 'objects/version-1.txt'))), sha(object));
  assert.notEqual(sql('restored', "INSERT INTO audit_logs VALUES ('orphan','missing','should fail');", true).status, 0);
  results.push('custom dump restored; full project/audit/attachment rows and object bytes match; foreign key enforced');
  const beforeCalls = restoreCalls;
  assert.throws(() => restore(snapshot, 'restored'), /must be empty/);
  assert.equal(restoreCalls, beforeCalls);
  results.push('nonempty target rejected before pg_restore');
  for (const path of ['database.dump', 'objects/version-1.txt', 'restore-manifest.json']) {
    const original = readFileSync(join(bundle, path));
    writeFileSync(join(bundle, path), Buffer.concat([original, Buffer.from('tampered')]));
    assert.throws(() => { const bad = prepareRestoreSnapshot(bundle, approvedHash, snapshots); restore(bad, 'corrupt_target'); });
    assert.equal(restoreCalls, beforeCalls);
    writeFileSync(join(bundle, path), original);
  }
  assert.equal(String(sql('corrupt_target', "SELECT count(*) FROM pg_tables WHERE schemaname='public';").stdout).trim(), '0');
  results.push('dump/object/manifest tampering rejected before restore; target unchanged');
  // An approved magic header is not sufficient proof of a valid catalog or safe SQL.
  const broken = Buffer.from('PGDMP invalid catalog');
  writeFileSync(join(bundle, 'database.dump'), broken);
  Object.assign(manifest.database, { size: broken.length, sha256: sha(broken) });
  const brokenManifest = Buffer.from(JSON.stringify(manifest));
  writeFileSync(join(bundle, 'restore-manifest.json'), brokenManifest);
  const brokenSnapshot = prepareRestoreSnapshot(bundle, sha(brokenManifest), snapshots);
  assert.notEqual(pg(['pg_restore', '--list'], readFileSync(join(brokenSnapshot.snapshotRoot, 'database.dump')), true).status, 0);
  assert.equal(restoreCalls, beforeCalls);
  results.push('invalid catalog rejected; magic-header and hash checks are not SQL-safety claims');
  console.log(JSON.stringify({ status: 'PASS', image, network: 'none', syntheticDataOnly: true, restoreCalls, results }, null, 2));
} finally {
  try {
    if (owned) run(['rm', '-f', container]);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
