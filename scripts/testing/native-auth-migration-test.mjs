import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readdir, cp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';

const root = process.cwd();
const require = createRequire(path.join(root, 'apps/api/package.json'));
const { PrismaClient } = require('@prisma/client');
const container = 'timeline-native-auth-test-20260912';
const expectedPurpose = execFileSync('docker', ['inspect', '--format', '{{index .Config.Labels "purpose"}}', container], { encoding: 'utf8' }).trim();
assert.equal(expectedPurpose, 'timeline-native-auth-isolated-test');
const suffix = randomBytes(4).toString('hex');
const sourceDb = `native_migration_${suffix}`;
const restoreDb = `native_restore_${suffix}`;
const restoredNewDb = `native_restore_new_${suffix}`;
const temp = await mkdtemp(path.join(tmpdir(), 'timeline-native-migration-'));
const oldSchema = execFileSync('git', ['show', '12e75baab067b2d7188d524968259e0b8c427697:apps/api/prisma/schema.prisma'], { encoding: 'utf8' });
const schemaPath = path.join(temp, 'schema.prisma');
await writeFile(schemaPath, oldSchema);
await mkdir(path.join(temp, 'migrations'));
const migrationRoot = path.join(root, 'apps/api/prisma/migrations');
for (const entry of await readdir(migrationRoot)) {
  if (entry !== '20260912190000_native_accounts') await cp(path.join(migrationRoot, entry), path.join(temp, 'migrations', entry), { recursive: true });
}
const url = db => `postgresql://native_auth_test:native-auth-isolated-test-only@127.0.0.1:55439/${db}`;
function createDb(db) { execFileSync('docker', ['exec', container, 'createdb', '-U', 'native_auth_test', db]); }
function migrate(db, schema) {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--schema', schema], { cwd: path.join(root, 'apps/api'), env: { ...process.env, DATABASE_URL: url(db) }, stdio: 'pipe' });
}
function dump(db) { return execFileSync('docker', ['exec', container, 'pg_dump', '-U', 'native_auth_test', '--format=custom', db], { maxBuffer: 16 * 1024 * 1024 }); }
function restore(db, backup) { execFileSync('docker', ['exec', '-i', container, 'pg_restore', '-U', 'native_auth_test', '--no-owner', '--no-acl', '--exit-on-error', '-d', db], { input: backup }); }
function client(db) { return new PrismaClient({ datasources: { db: { url: url(db) } } }); }
async function snapshot(db) {
  const p = client(db);
  try {
    return JSON.stringify(await p.$queryRaw`SELECT u.id AS user_id, u.username, u."feishuOpenId", p.id AS project_id, p."ownerUserId", a.id AS attachment_id, a."uploadedById", a."objectKey", r.id AS review_id, r."reviewerId", r."attachmentId", r."workflowTaskId", w."initiatedById", t."assigneeUserId", t."workflowInstanceId", l.id AS audit_id, l."actorUserId", l.action FROM users u JOIN projects p ON p."ownerUserId"=u.id JOIN attachments a ON a."projectId"=p.id JOIN review_records r ON r."attachmentId"=a.id JOIN workflow_tasks t ON t.id=r."workflowTaskId" JOIN workflow_instances w ON w.id=t."workflowInstanceId" JOIN audit_logs l ON l."actorUserId"=u.id ORDER BY u.id`);
  } finally { await p.$disconnect(); }
}
createDb(sourceDb); migrate(sourceDb, schemaPath);
const p = client(sourceDb);
try {
  await p.$executeRaw`INSERT INTO users (id,username,name,"feishuOpenId","updatedAt") VALUES ('native-migration-user','legacy-migration-account','历史合成用户','ou-synthetic-migration',NOW())`;
  const project = await p.project.create({ data: { code: 'SYNTHETIC-MIGRATION', name: '迁移验证合成项目', ownerUserId: 'native-migration-user' } });
  const instance = await p.workflowInstance.create({ data: { projectId: project.id, instanceNo: 'SYNTHETIC-WORKFLOW', initiatedById: 'native-migration-user' } });
  const task = await p.workflowTask.create({ data: { projectId: project.id, workflowInstanceId: instance.id, taskNo: 'SYNTHETIC-TASK', nodeCode: 'CAB_REVIEW', nodeName: '合成评审', assigneeUserId: 'native-migration-user' } });
  const attachment = await p.attachment.create({ data: { projectId: project.id, entityType: 'PROJECT', entityId: project.id, bucket: 'synthetic', storageKey: 'synthetic/no-real-file.txt', fileName: 'synthetic.txt', mimeType: 'text/plain', fileSize: 0, uploadedById: 'native-migration-user' } });
  await p.reviewRecord.create({ data: { projectId: project.id, workflowTaskId: task.id, reviewerId: 'native-migration-user', attachmentId: attachment.id, reviewType: 'CAB_REVIEW' } });
  await p.auditLog.create({ data: { projectId: project.id, actorUserId: 'native-migration-user', targetType: 'USER', targetId: 'native-migration-user', action: 'SYNTHETIC_BEFORE_MIGRATION', summary: '合成迁移测试记录' } });
} finally { await p.$disconnect(); }
const before = await snapshot(sourceDb);
assert.notEqual(before, '[]');
const backup = dump(sourceDb);
await writeFile(path.join(temp, 'synthetic-before.dump'), backup, { mode: 0o600 });
createDb(restoreDb); restore(restoreDb, backup);
assert.equal(await snapshot(restoreDb), before, 'Pre-migration backup must restore exact historical relationships.');
migrate(sourceDb, path.join(root, 'apps/api/prisma/schema.prisma'));
assert.equal(await snapshot(sourceDb), before, 'Actual native migration must preserve user/project/review/attachment/audit relationships.');
const next = client(sourceDb);
try {
  assert.equal(await next.localCredential.count(), 0, 'Migration must not invent passwords or adopt legacy users.');
  const user = await next.user.findUniqueOrThrow({ where: { id: 'native-migration-user' } });
  assert.equal(user.authVersion, 0);
  assert.equal(user.onboardingCompleted, true);
  assert.equal(user.isSystemAdmin, false);
} finally { await next.$disconnect(); }
createDb(restoredNewDb); restore(restoredNewDb, dump(sourceDb));
assert.equal(await snapshot(restoredNewDb), before, 'Post-migration backup must preserve all historical relationships too.');
const result = { status: 'PASS', baselineCommit: '12e75baab067b2d7188d524968259e0b8c427697', migration: '20260912190000_native_accounts', syntheticOnly: true, historicalRelations: ['user identity', 'project owner', 'workflow actor', 'review author', 'attachment uploader', 'audit actor'], backupSha256: createHash('sha256').update(backup).digest('hex'), migrationSha256: createHash('sha256').update(await readFile(path.join(migrationRoot, '20260912190000_native_accounts/migration.sql'))).digest('hex') };
await writeFile(path.join(temp, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, evidence: path.join(temp, 'result.json') }));
