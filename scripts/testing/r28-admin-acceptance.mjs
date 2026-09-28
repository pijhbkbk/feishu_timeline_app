import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.resolve(process.env.R28_RUNTIME_ROOT ?? path.join(repo, '../r28-runtime'));
assert.equal(path.basename(root), 'r28-runtime');
const env = JSON.parse(await readFile(path.join(root, 'env.json'), 'utf8'));
assert.equal((await stat(path.join(root, 'env.json'))).mode & 0o077, 0);
const parsed = new URL(env.DATABASE_URL); assert.equal(parsed.hostname, '127.0.0.1'); assert.equal(parsed.port, '55449'); assert.equal(parsed.pathname, '/r28_http_v2');
assert.equal(env.HOST, '127.0.0.1'); assert.equal(env.AUTH_MOCK_ENABLED, 'false');
const base = 'http://127.0.0.1:3001/api', origin = 'http://127.0.0.1:3100';
const require = createRequire(path.join(repo, 'apps/api/package.json'));
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
const mode = process.argv[2]; assert.ok(['auth', 'projects', 'work', 'flow'].includes(mode));
let state; try { state = JSON.parse(await readFile(path.join(root, 'state.json'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; state = { syntheticOnly: true, accounts: {}, projects: {}, steps: {} }; }
assert.equal(state.syntheticOnly, true);
const evidence = { environment: 'local-development', api: base, browser: origin, syntheticOnly: true, sourceState: 'working-tree, not release candidate', scanner: env.MALWARE_SCANNER_PROVIDER, mode, startedAt: new Date().toISOString(), requests: [], checks: [] };
async function persist() { await writeFile(path.join(root, 'state.json'), JSON.stringify(state, null, 2), { mode: 0o600 }); await writeFile(path.join(root, `${mode}-result.json`), JSON.stringify(evidence, null, 2), { mode: 0o600 }); }
const admin = { username: 'r28-admin', password: (await readFile(path.join(root, 'admin.password'), 'utf8')).trim() };
const sessions = new Map();
async function request(url, { who = 'admin', method = 'GET', body, headers = {}, expect = 200, binary = false } = {}) {
  const outgoing = { Origin: origin, ...headers }; if (sessions.get(who)) outgoing.Cookie = sessions.get(who);
  if (body !== undefined && !(body instanceof FormData)) outgoing['Content-Type'] = 'application/json';
  const response = await fetch(base + url, { method, headers: outgoing, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const bytes = Buffer.from(await response.arrayBuffer()); let data;
  try { data = JSON.parse(bytes.toString()); } catch { data = null; }
  evidence.requests.push({ method, path: url, status: response.status });
  assert.equal(response.status, expect, `${method} ${url}: ${JSON.stringify(data?.message ?? data?.code ?? null)}`);
  return { data, response, bytes: binary ? bytes : undefined };
}
async function login(key) {
  const account = key === 'admin' ? admin : state.accounts[key];
  const result = await request('/auth/login', { who: null, method: 'POST', body: { username: account.username, password: account.password } });
  assert.equal(result.data.user.authSource, 'local'); assert.equal(result.data.mockEnabled, false); assert.equal(result.data.feishuEnabled, false);
  sessions.set(key, result.response.headers.get('set-cookie').split(';')[0]); account.id = result.data.user.id;
  return result.data.user;
}
async function step(name, operation) {
  if (state.steps[name]) { evidence.checks.push({ name, status: 'REUSED_SAME_SYNTHETIC_RUN', at: state.steps[name] }); return; }
  await operation(); state.steps[name] = new Date().toISOString(); evidence.checks.push({ name, status: 'PASS' }); await persist();
}
const roles = { pm: ['project_manager'], engineer: ['process_engineer'], purchaser: ['purchaser'], quality: ['quality_engineer', 'reviewer'], production: ['production_operator', 'finance'] };
async function task(projectId, nodeCode) {
  const { data } = await request(`/workflows/projects/${projectId}`);
  const row = data.activeTasks.find(item => item.nodeCode === nodeCode); assert.ok(row, `Missing active ${nodeCode}`); return row;
}
async function context(taskId, who) { return (await request(`/v2/tasks/${taskId}/progress-context`, { who })).data; }
async function uploadMaterial(taskId, who, version, materialType, fileName, contents, previous) {
  const key = randomUUID(); const form = new FormData(); form.set('taskVersion', version); form.set('idempotencyKey', key); form.set('materialType', materialType);
  if (previous) form.set('replacesAttachmentId', previous);
  form.set('file', new Blob([contents], { type: 'application/pdf' }), fileName);
  return (await request(`/v2/tasks/${taskId}/materials${previous ? `/${previous}/versions` : ''}`, { who, method: 'POST', body: form, headers: { 'Idempotency-Key': key }, expect: 201 })).data;
}
try {
  const health = await request('/health', { who: null }); evidence.runtimeCommit = health.data.runtimeCommit;
  await login('admin');
  if (mode === 'auth') {
    for (const [index, [key, codes]] of Object.entries(roles).entries()) {
      await step(`register-${key}`, async () => {
        const account = state.accounts[key] ?? { username: `02800${index + 1}`, name: `合成${key}人员`, password: randomBytes(24).toString('base64url') };
        state.accounts[key] = account; await persist();
        const registered = await request('/auth/register', { who: null, method: 'POST', body: account, expect: 201 });
        account.id = registered.data.user?.id ?? registered.data.id;
        const user = await login(key); assert.deepEqual(user.roleCodes, []); assert.equal(user.isSystemAdmin, false); assert.equal(user.username, account.username);
        await request('/projects', { who: key, expect: 403 });
      });
      await step(`grant-${key}`, async () => {
        const { data } = await request(`/people?q=${state.accounts[key].username}`); const row = data.items.find(item => item.id === state.accounts[key].id); assert.ok(row);
        const body = { expectedVersion: row.version, requestId: randomUUID(), roleCodes: codes, reason: '合成全流程验收角色' };
        await request(`/people/${row.id}`, { method: 'PATCH', body });
        const replay = await request(`/people/${row.id}`, { method: 'PATCH', body }); assert.equal(replay.data.replayed, true);
        const user = await login(key); assert.deepEqual([...user.roleCodes].sort(), [...codes].sort()); assert.ok(user.permissionCodes.includes('project.read')); assert.ok(user.permissionCodes.includes('workflow.transition'));
      });
    }
  } else {
    for (const key of Object.keys(roles)) await login(key);
    if (mode === 'projects') await step('two-projects-created-with-native-owner-and-idempotency', async () => {
      for (const name of ['A', 'B']) {
        const key = randomUUID(), body = { name: `合成 R28 ${name} 定制色`, vehicleModel: '合成轻卡', description: '独立合成业务验证，不是客户项目', priority: 'MEDIUM', plannedStartDate: '2026-09-28' };
        const { data } = await request('/projects', { who: 'pm', method: 'POST', body, headers: { 'Idempotency-Key': key }, expect: 201 });
        state.projects[name] = data.id; await persist();
        const replay = await request('/projects', { who: 'pm', method: 'POST', body, headers: { 'Idempotency-Key': key }, expect: 201 }); assert.equal(replay.data.id, data.id);
        const first = await task(data.id, 'PROJECT_INITIATION'); assert.equal(first.assigneeUserId, state.accounts.pm.id);
        await request(`/v2/tasks/${first.id}/completion-preview`, { who: 'admin', method: 'POST', body: { taskVersion: first.updatedAt }, expect: 201 });
        await request(`/workflows/tasks/${first.id}/start`, { who: 'purchaser', method: 'POST', body: {}, expect: 403 });
      }
      assert.equal(await db.project.count(), 2);
    });
    if (mode === 'work') {
      const first = await task(state.projects.A, 'PROJECT_INITIATION');
      await step('work-progress-idempotent-replay-and-independent-next-command', async () => {
        const ctx = await context(first.id, 'pm'); const key = randomUUID();
        const before = await db.taskProgressUpdate.count({ where: { workflowTaskId: first.id } });
        const body = { taskVersion: ctx.taskVersion, progressStatus: 'IN_PROGRESS', completedWork: '合成前期沟通已完成', nextPlan: '完成立项检查', idempotencyKey: key };
        await request(`/v2/tasks/${first.id}/progress-updates`, { who: 'pm', method: 'POST', body, headers: { 'Idempotency-Key': key }, expect: 201 });
        await request(`/v2/tasks/${first.id}/progress-updates`, { who: 'pm', method: 'POST', body, headers: { 'Idempotency-Key': key }, expect: 201 });
        assert.equal(await db.taskProgressUpdate.count({ where: { workflowTaskId: first.id } }), before + 1);
        const nextKey = randomUUID(); await request(`/v2/tasks/${first.id}/progress-updates`, { who: 'pm', method: 'POST', body: { ...body, idempotencyKey: nextKey }, headers: { 'Idempotency-Key': nextKey }, expect: 201 });
        assert.equal(await db.taskProgressUpdate.count({ where: { workflowTaskId: first.id } }), before + 2);
        const forbiddenKey = randomUUID(); await request(`/v2/tasks/${first.id}/progress-updates`, { who: 'purchaser', method: 'POST', body: { ...body, idempotencyKey: forbiddenKey }, headers: { 'Idempotency-Key': forbiddenKey }, expect: 403 });
      });
      await step('material-v1-v2-history-and-binary-readback', async () => {
        const ctx = await context(first.id, 'pm'); const type = ctx.materials.requirements[0]?.id ?? '其他工序材料';
        const one = await uploadMaterial(first.id, 'pm', ctx.taskVersion, type, '合成立项V1.pdf', '%PDF-1.4\nsynthetic version one\n%%EOF');
        const old = one.attachment.id;
        const current = await context(first.id, 'pm'); await uploadMaterial(first.id, 'pm', current.taskVersion, type, '合成立项V2.pdf', '%PDF-1.4\nsynthetic version two\n%%EOF', old);
        const latest = await context(first.id, 'pm'); assert.equal(latest.materials.current.length, 1); assert.equal(latest.materials.versions.length, 2);
        assert.equal(latest.materials.versions.find(row => row.id === old).isCurrent, false);
        for (const row of latest.materials.versions) { const file = await request(row.downloadUrl, { who: 'pm', binary: true }); assert.ok(file.bytes.length > 10); }
        const page = await request(`/v2/tasks/${first.id}/material-versions`, { who: 'pm' }); assert.equal(page.data.items.length, 2);
      });
    }
  }
  evidence.status = 'PASS'; await persist(); console.log(JSON.stringify({ mode, status: evidence.status, checks: evidence.checks, requests: evidence.requests.length }));
} catch (error) { evidence.status = 'FAIL'; evidence.failure = error.message; await persist(); console.error(JSON.stringify({ mode, status: 'FAIL', message: error.message })); process.exitCode = 1; }
finally { await db.$disconnect(); }
