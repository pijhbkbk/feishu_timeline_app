import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';

// Arbitrary destinations are forbidden. The two additional HTTPS origins are the
// specifically approved independent synthetic portable A/B instances.
const manifestPath = process.env.NATIVE_BUSINESS_TEST_MANIFEST ?? '/private/tmp/timeline-native-a2-state-20260917/manifest.json';
assert.ok((manifestPath.startsWith('/private/tmp/') || manifestPath.startsWith('/tmp/')) && path.normalize(manifestPath) === manifestPath);
const manifestInfo = await lstat(manifestPath);
assert.ok(manifestInfo.isFile() && manifestInfo.uid === process.getuid() && manifestInfo.nlink === 1);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const portable = manifest.purpose === 'timeline-portable-isolated';
const root = path.dirname(manifestPath);
const api = portable ? manifest.baseUrl : 'http://127.0.0.1:3351';
const origin = portable ? api : 'http://127.0.0.1:3350';
const container = portable ? manifest.apiContainer : 'timeline-native-a2-api-20260917';
const purpose = portable ? 'timeline-portable-isolated' : 'timeline-native-auth-isolated-test';
const database = portable ? 'timeline' : 'native_auth_test_http';
const mode = process.argv[2] ?? 'auth';
assert.ok(['auth', 'projects', 'workflow', 'attachments', 'readback', 'restore', 'rates', 'identity'].includes(mode));
assert.equal(process.env.NATIVE_BUSINESS_TEST_CONFIRM, 'synthetic-only-20260917');
assert.equal(manifestInfo.mode & 0o077, 0);
assert.equal(manifest.syntheticOnly, true);
assert.equal(manifest.purpose, purpose);
if (portable) {
  assert.equal(manifestInfo.mode & 0o077, 0);
  assert.ok(['https://localhost:3450', 'https://localhost:3452', 'https://localhost:9444'].includes(api));
  assert.match(manifest.instanceName, /^timeline-portable-[a-f0-9]{12}$/);
  assert.equal(container, `${manifest.instanceName}-api-1`);
  assert.equal(manifest.database, database);
  assert.equal(process.env.NODE_EXTRA_CA_CERTS, manifest.caFile, 'Start Node with the delivered CA; TLS verification must stay enabled.');
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0');
} else { assert.equal(manifest.api, api); assert.ok(manifest.adminUserId); }
const inspect = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
assert.equal(inspect.Config.Labels.purpose, purpose);
assert.equal(inspect.State.Running, true);
assert.equal(inspect.Image, manifest.apiImageId);
if (portable) {
  assert.equal(inspect.Config.Labels['com.timeline.portable.instance'], manifest.instanceName);
  assert.equal(inspect.Image, manifest.apiImageId);
} else { assert.deepEqual(inspect.HostConfig.PortBindings['3001/tcp'], [{ HostIp: '127.0.0.1', HostPort: '3351' }]); }
const env = Object.fromEntries(inspect.Config.Env.map(value => value.split(/=(.*)/s).slice(0, 2)));
assert.equal(env.AUTH_MOCK_ENABLED, 'false');
assert.equal(new URL(env.DATABASE_URL).pathname, `/${database}`);
if (!portable) assert.equal(new URL(env.DATABASE_URL).hostname, 'timeline-native-a2-pg-20260917');
assert.equal(env.MALWARE_SCANNER_PROVIDER, 'clamav');
assert.equal(env.CLAMAV_MAX_SIGNATURE_AGE_HOURS, '48');
for (const key of ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'GOOGLE_CLIENT_SECRET']) assert.ok(!env[key]);
const passwordFile = portable ? manifest.passwordFile : `${root}/admin.password`;
assert.ok(path.isAbsolute(passwordFile));
const passwordStat = await lstat(passwordFile);
assert.ok(passwordStat.isFile() && passwordStat.uid === process.getuid() && passwordStat.nlink === 1);
assert.equal(passwordStat.mode & 0o077, 0);
let state;
try {
  const info = await lstat(`${root}/business-state.json`);
  assert.ok(info.isFile() && info.uid === process.getuid() && info.nlink === 1);
  assert.equal(info.mode & 0o077, 0);
  state = JSON.parse(await readFile(`${root}/business-state.json`, 'utf8'));
}
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  state = { syntheticOnly: true, accounts: {}, steps: {}, projects: {}, findings: [] };
}
assert.equal(state.syntheticOnly, true);
const evidence = { syntheticOnly: true, mode, runtimeCommit: null, startedAt: new Date().toISOString(), requests: [], checks: [] };
const cookies = new Map();
if (portable) assert.equal(manifest.username, 'portable-admin');
const admin = { username: portable ? manifest.username : 'synthetic-a2-admin', id: manifest.adminUserId ?? state.adminId, password: (await readFile(passwordFile, 'utf8')).trim() };
async function persist() {
  await writeFile(`${root}/business-state.json`, JSON.stringify(state, null, 2), { mode: 0o600 });
  await writeFile(`${root}/business-${mode}-result.json`, JSON.stringify(evidence, null, 2), { mode: 0o600 });
}
function dbRead(expression) {
  const code = `const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{if(new URL(process.env.DATABASE_URL).pathname!==${JSON.stringify('/' + database)})throw Error('wrong database');const r=await (${expression});console.log(JSON.stringify(r));})().finally(()=>p.$disconnect()).catch(()=>{console.error('Synthetic evidence query failed');process.exitCode=1})`;
  return JSON.parse(execFileSync('docker', ['exec', '-i', container, 'node'], { input: code, encoding: 'utf8', timeout: 15000 }));
}
function representativeBusinessSnapshot() {
  const ids = JSON.stringify(Object.values(state.projects).map(project => project.id).sort());
  return dbRead(`Promise.all([
    p.project.findMany({where:{id:{in:${ids}}},select:{id:true,name:true,ownerUserId:true},orderBy:{id:'asc'}}),
    p.workflowTask.findMany({where:{projectId:{in:${ids}}},select:{id:true,projectId:true,nodeCode:true,taskRound:true,status:true,isActive:true,assigneeUserId:true},orderBy:{id:'asc'}}),
    p.sampleConfirmation.findMany({where:{projectId:{in:${ids}}},select:{id:true,projectId:true,sampleId:true,workflowTaskId:true,decision:true,confirmedById:true},orderBy:{id:'asc'}}),
    p.attachment.findMany({where:{projectId:{in:${ids}}},select:{id:true,projectId:true,entityId:true,checksum:true,scanStatus:true,uploadedById:true},orderBy:{id:'asc'}}),
    p.auditLog.findMany({where:{projectId:{in:${ids}}},select:{id:true,projectId:true,actorUserId:true,action:true,targetId:true},orderBy:{id:'asc'}})
  ]).then(([projects,tasks,confirmations,attachments,audit])=>({projects,tasks,confirmations,attachments,audit}))`);
}
async function request(path, { actor = 'admin', method = 'GET', body, cookie, suppliedOrigin = origin, headers = {}, binary = false } = {}) {
  assert.ok(path.startsWith('/') && !path.startsWith('//'));
  if (cookie === undefined && actor) cookie = cookies.get(actor);
  const outgoing = { Origin: suppliedOrigin, ...headers };
  if (cookie) outgoing.Cookie = cookie;
  if (body !== undefined && !(body instanceof FormData)) outgoing['Content-Type'] = 'application/json';
  const response = await fetch(`${api}/api${path}`, { method, headers: outgoing, redirect: 'manual',
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  const buffer = Buffer.from(await response.arrayBuffer());
  let data = null;
  if (!binary && buffer.length) { try { data = JSON.parse(buffer.toString()); } catch { data = null; } }
  evidence.requests.push({ method, path, status: response.status });
  return { status: response.status, data, response, buffer };
}
function expectStatus(result, expected, label) {
  assert.equal(result.status, expected, `${label}: unexpected HTTP status`);
  return result.data;
}
async function login(key) {
  const account = key === 'admin' ? admin : state.accounts[key];
  assert.ok(account);
  const result = await request('/auth/login', { actor: null, method: 'POST', body: { username: account.username, password: account.password } });
  const data = expectStatus(result, 200, `${key} password login`);
  assert.equal(data.user.authSource, 'local');
  assert.equal(data.mockEnabled, false);
  assert.equal(data.feishuEnabled, false);
  if (account.id) assert.equal(data.user.id, account.id);
  else { assert.equal(key, 'admin'); account.id = data.user.id; state.adminId = data.user.id; }
  const raw = result.response.headers.get('set-cookie');
  assert.match(raw, /HttpOnly/i); assert.match(raw, /SameSite=Lax/i); assert.match(raw, /Secure/i);
  cookies.set(key, raw.split(';')[0]);
  return data.user;
}
async function step(name, action) {
  if (mode === 'workflow') name = `return-path:${name}`;
  if (state.steps[name]?.status === 'PASS') {
    evidence.checks.push({ name, status: 'REUSED_SAME_SYNTHETIC_RUN', originalTime: state.steps[name].completedAt });
    return;
  }
  await action();
  const result = { name, status: 'PASS', completedAt: new Date().toISOString() };
  state.steps[name] = result; evidence.checks.push(result); await persist();
}
async function rowFor(key) {
  const user = key === 'admin' ? admin : state.accounts[key];
  const value = expectStatus(await request(`/admin/organization?tab=users&search=${encodeURIComponent(user.username)}`), 200, 'organization read');
  const row = value.items.find(row => row.id === user.id);
  assert.ok(row);
  return row;
}
async function configure(key, codes, overrides = {}) {
  const row = await rowFor(key);
  const roles = expectStatus(await request('/admin/permissions'), 200, 'permissions directory').roles;
  const roleIds = codes.map(code => { const role = roles.find(role => role.code === code); assert.ok(role); return role.id; });
  const idempotencyKey = randomUUID();
  const input = { expectedVersion: row.dataVersion, username: row.username, name: row.name,
    status: row.status, isSystemAdmin: false, roleIds, departmentId: null,
    reason: '独立合成账号验收', acknowledgedConsequences: true, idempotencyKey, ...overrides };
  const preview = expectStatus(await request(`/admin/organization/users/${row.id}/preview`, {
    method: 'POST', body: Object.fromEntries(Object.entries(input).filter(([key]) => !['acknowledgedConsequences', 'idempotencyKey'].includes(key))),
  }), 201, 'configuration preview');
  assert.equal(preview.canApply, true);
  const result = await request(`/admin/organization/users/${row.id}`, { method: 'POST', body: input, headers: { 'Idempotency-Key': idempotencyKey } });
  expectStatus(result, 201, 'configuration apply');
  return { input, result };
}
async function setStatus(key, status) {
  const row = await rowFor(key); const idempotencyKey = randomUUID();
  return request(`/admin/users/${row.id}/status-change`, { method: 'POST', body: {
    status, expectedVersion: row.dataVersion, reason: '独立合成停用与恢复验收', idempotencyKey,
  }, headers: { 'Idempotency-Key': idempotencyKey } });
}
async function workspace(projectId) { return expectStatus(await request(`/v2/projects/${projectId}/workspace`), 200, 'workspace'); }
async function version(projectId) {
  const data = await workspace(projectId);
  const candidate = data.workspace?.project?.memberAssignmentVersion ?? data.project?.memberAssignmentVersion ?? data.workspace?.memberAssignmentVersion;
  if (Number.isInteger(candidate)) return candidate;
  // Same controlled project row used only for evidence/version, never to change business state.
  return dbRead(`p.project.findUniqueOrThrow({where:{id:${JSON.stringify(projectId)}},select:{memberAssignmentVersion:true}})`).memberAssignmentVersion;
}
const samplePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
function harmlessEicarDocx() {
  const entries = [
    ['[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic antivirus test</w:t></w:r></w:p></w:body></w:document>'],
    ['word/eicar.txt', 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'],
  ];
  const locals = [], central = []; let offset = 0;
  for (const [name, text] of entries) {
    const filename = Buffer.from(name), bytes = Buffer.from(text); let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
    const row = Buffer.alloc(46); row.writeUInt32LE(0x02014b50); row.writeUInt16LE(20, 4); row.writeUInt16LE(20, 6);
    row.writeUInt32LE(crc, 16); row.writeUInt32LE(bytes.length, 20); row.writeUInt32LE(bytes.length, 24); row.writeUInt16LE(filename.length, 28); row.writeUInt32LE(offset, 42);
    const part = Buffer.concat([local, filename, bytes]); locals.push(part); central.push(Buffer.concat([row, filename])); offset += part.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
async function upload(projectId, name, bytes, mime, actor = 'purchaser') {
  const form = new FormData(); form.set('entityType', 'PROJECT'); form.set('entityId', projectId);
  form.set('file', new Blob([bytes], { type: mime }), name);
  return request(`/projects/${projectId}/attachments/upload`, { method: 'POST', actor, body: form });
}
async function activeTask(nodeCode) {
  const data = expectStatus(await request(`/workflows/projects/${state.workflowProjectId}`), 200, 'workflow read');
  const task = data.activeTasks.find(task => task.nodeCode === nodeCode);
  assert.ok(task, `active ${nodeCode} required`);
  return task;
}
async function assignTask(task, key) {
  if (task.assigneeUserId === (key === 'admin' ? admin.id : state.accounts[key].id)) return;
  const idempotencyKey = randomUUID();
  expectStatus(await request(`/v2/projects/${state.workflowProjectId}/tasks/${task.id}/assignment`, { method: 'PATCH', body: {
    expectedVersion: await version(state.workflowProjectId), newOwnerUserId: key === 'admin' ? admin.id : state.accounts[key].id,
    idempotencyKey, reason: '合成业务验收分工', confirmInProgress: true,
  }, headers: { 'Idempotency-Key': idempotencyKey } }), 200, 'task assignment');
}
async function completeOrdinary(nodeCode, actor) {
  let task = await activeTask(nodeCode); await assignTask(task, actor);
  const updated = dbRead(`p.workflowTask.findUniqueOrThrow({where:{id:${JSON.stringify(task.id)}},select:{updatedAt:true}})`);
  const preview = expectStatus(await request(`/v2/tasks/${task.id}/completion-preview`, { actor, method: 'POST', body: { taskVersion: updated.updatedAt } }), 201, 'ordinary completion preview');
  assert.equal(preview.canComplete, true, `completion blocked: ${JSON.stringify(preview.blockingReasons)}`);
  const idempotencyKey = randomUUID();
  const body = { taskVersion: updated.updatedAt, completionReason: '合成原生账号正式动作验收', acknowledgedConsequences: true, idempotencyKey };
  const result = expectStatus(await request(`/v2/tasks/${task.id}/complete`, { actor, method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }), 201, 'ordinary completion');
  assert.equal(result.command.completedTask.id, task.id);
  const replay = expectStatus(await request(`/v2/tasks/${task.id}/complete`, { actor, method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }), 201, 'completion replay');
  assert.equal(replay.command.idempotentReplay, true);
  return task;
}

try {
  const health = expectStatus(await request('/health', { actor: null }), 200, 'health');
  evidence.runtimeCommit = health.runtimeCommit;
  assert.equal(health.runtimeCommit, inspect.Config.Labels['org.opencontainers.image.revision']);
  if (portable) assert.equal(health.runtimeCommit, manifest.runtimeCommit);
  if (mode !== 'rates') await login('admin');
  if (mode === 'rates') {
    assert.equal(portable, false, 'Run rate-budget exhaustion only on the disposable A2 stack.');
    const before = dbRead('p.user.count()');
    expectStatus(await request('/auth/register', { actor: null, method: 'POST', body: { username: 'synthetic-a2-rate-denied', password: randomBytes(30).toString('base64url'), name: '合成限流负向' } }), 429, 'registration budget');
    assert.equal(dbRead('p.user.count()'), before);
    let refusals = 0;
    for (let n = 0; n < 31; n++) {
      const result = await request('/auth/login', { actor: null, method: 'POST', body: { username: 'synthetic-a2-unknown-account', password: 'Synthetic incorrect bounded phrase 2026' } });
      assert.ok([401, 429].includes(result.status)); if (result.status === 429) refusals++;
    }
    assert.ok(refusals > 0); evidence.checks.push({ name: 'real-HTTP-Redis-registration-login-rate-limits', status: 'PASS', loginRefusals: refusals });
  }
  if (mode === 'auth') {
    await step('registration-job-intent-no-grants', async () => {
      const accountsBefore = dbRead('p.user.findMany({select:{id:true,username:true}})');
      assert.equal(accountsBefore.length, 1); assert.equal(accountsBefore[0].id, admin.id);
      for (const [key, job] of [['purchaser', 'purchaser'], ['engineer', 'process_engineer'], ['outsider', 'purchaser']]) {
        const account = { username: `synthetic-a2-${key}`, password: randomBytes(30).toString('base64url') };
        state.accounts[key] = account; await persist();
        expectStatus(await request('/auth/register', { actor: null, method: 'POST', body: { ...account, name: `合成验收${key}` } }), 201, 'register');
        const result = await request('/auth/login', { actor: null, method: 'POST', body: account });
        const data = expectStatus(result, 200, 'initial password login'); account.id = data.user.id;
        cookies.set(key, result.response.headers.get('set-cookie').split(';')[0]);
        assert.deepEqual(data.user.roleCodes, []); assert.deepEqual(data.user.permissionCodes, []); assert.equal(data.user.isSystemAdmin, false);
        expectStatus(await request('/auth/job', { actor: key, method: 'POST', body: { job } }), 200, 'job intention');
        const me = expectStatus(await request('/auth/me', { actor: key }), 200, 'after job');
        assert.equal(me.requestedJob, job); assert.deepEqual(me.roleCodes, []);
        for (const path of ['/projects', '/v2/dashboard', '/admin/organization', '/admin/tasks/export', '/auth/accounts']) {
          expectStatus(await request(path, { actor: key }), 403, `ungranted ${path}`);
        }
        expectStatus(await request('/auth/accounts/another/recovery', { actor: key, method: 'POST' }), 403, 'ordinary recovery signer');
        await persist();
      }
    });
    await step('administrator-grants-exact-roles', async () => {
      for (const [key, role] of [['purchaser', 'purchaser'], ['engineer', 'process_engineer'], ['outsider', 'viewer']]) {
        const command = await configure(key, [role]);
        expectStatus(await request(`/admin/organization/users/${state.accounts[key].id}`, { method: 'POST', body: command.input, headers: { 'Idempotency-Key': command.input.idempotencyKey } }), 201, 'admin idempotent replay');
        const actor = await login(key); assert.deepEqual(actor.roleCodes, [role]); assert.equal(actor.isSystemAdmin, false);
        assert.equal(actor.permissionCodes.includes('system.manage'), false);
      }
    });
    await step('disable-enable-old-session-not-revived', async () => {
      await login('outsider'); const old = cookies.get('outsider');
      expectStatus(await setStatus('outsider', 'INACTIVE'), 201, 'disable');
      expectStatus(await request('/auth/me', { actor: null, cookie: old }), 401, 'disabled old session');
      expectStatus(await request('/auth/login', { actor: null, method: 'POST', body: { username: state.accounts.outsider.username, password: state.accounts.outsider.password } }), 401, 'disabled password');
      expectStatus(await setStatus('outsider', 'ACTIVE'), 201, 'enable');
      expectStatus(await request('/auth/me', { actor: null, cookie: old }), 401, 'enable must not revive old session');
      await login('outsider');
    });
    await step('password-change-and-one-use-admin-recovery', async () => {
      await login('outsider'); const oldCookie = cookies.get('outsider'); const oldPassword = state.accounts.outsider.password;
      const password = randomBytes(30).toString('base64url');
      expectStatus(await request('/auth/password', { actor: 'outsider', method: 'POST', body: { currentPassword: oldPassword, newPassword: password } }), 200, 'password change');
      state.accounts.outsider.password = password; await persist();
      expectStatus(await request('/auth/me', { actor: null, cookie: oldCookie }), 401, 'changed old session');
      expectStatus(await request('/auth/login', { actor: null, method: 'POST', body: { username: state.accounts.outsider.username, password: oldPassword } }), 401, 'changed old password');
      await login('outsider'); const beforeRecoveryCookie = cookies.get('outsider');
      const recovered = expectStatus(await request(`/auth/accounts/${state.accounts.outsider.id}/recovery`, { method: 'POST' }), 200, 'issue recovery');
      expectStatus(await request('/auth/me', { actor: null, cookie: beforeRecoveryCookie }), 401, 'recovery revocation');
      const next = randomBytes(30).toString('base64url');
      expectStatus(await request('/auth/recover', { actor: null, method: 'POST', body: { token: recovered.token, newPassword: next } }), 200, 'recover');
      state.accounts.outsider.password = next; await persist();
      expectStatus(await request('/auth/recover', { actor: null, method: 'POST', body: { token: recovered.token, newPassword: next } }), 401, 'recovery single use');
      await login('outsider');
      const facts = dbRead(`p.auditLog.findMany({where:{targetId:${JSON.stringify(state.accounts.outsider.id)}},select:{action:true,summary:true,beforeData:true,afterData:true,metadata:true}})`);
      const serialized = JSON.stringify(facts);
      for (const secret of [oldPassword, password, next, recovered.token]) assert.equal(serialized.includes(secret), false);
      state.authAuditActions = [...new Set(facts.map(row => row.action))];
    });
    await step('last-native-administrator-protected', async () => {
      expectStatus(await request(`/auth/accounts/${admin.id}/recovery`, { method: 'POST' }), 409, 'last admin recovery');
      const row = await rowFor('admin'); const idempotencyKey = randomUUID();
      const result = await request(`/admin/users/${admin.id}/status-change`, { method: 'POST', body: { status: 'INACTIVE', expectedVersion: row.dataVersion, reason: '合成最后管理员负向', idempotencyKey }, headers: { 'Idempotency-Key': idempotencyKey } });
      assert.ok([400, 403, 409].includes(result.status), 'last admin disable must reject');
      assert.equal((await rowFor('admin')).status, 'ACTIVE');
      const body = { username: row.username, name: row.name, roleIds: [], status: 'ACTIVE', isSystemAdmin: false,
        expectedVersion: row.dataVersion, reason: '合成最后管理员降权负向', idempotencyKey: randomUUID(), acknowledgedConsequences: true };
      const downgrade = await request(`/admin/organization/users/${admin.id}`, { method: 'POST', body, headers: { 'Idempotency-Key': body.idempotencyKey } });
      assert.ok([400, 403, 409].includes(downgrade.status));
      assert.equal((await rowFor('admin')).isSystemAdmin, true);
    });
  }
  if (['projects', 'workflow', 'attachments', 'readback', 'restore'].includes(mode)) {
    for (const key of ['purchaser', 'engineer', 'outsider']) await login(key);
  }
  if (mode === 'identity') {
    await step('canonical-username-rename-no-alias-or-id-claim', async () => {
      const account = state.accounts.outsider;
      const before = await login('outsider'); const oldCookie = cookies.get('outsider');
      const oldName = account.username; const renamed = `${oldName}-renamed`;
      const adminRow = await rowFor('admin');
      await configure('outsider', ['viewer'], { username: renamed, name: adminRow.name });
      account.username = renamed; await persist();
      expectStatus(await request('/auth/me', { actor: null, cookie: oldCookie }), 401, 'renamed previous session');
      expectStatus(await request('/auth/login', { actor: null, method: 'POST', body: { username: oldName, password: account.password } }), 401, 'old username is not a login alias');
      const canonical = expectStatus(await request('/auth/login', { actor: null, method: 'POST', body: { username: renamed.toUpperCase(), password: account.password } }), 200, 'case normalized canonical login');
      assert.equal(canonical.user.id, before.id); assert.deepEqual(canonical.user.roleCodes, ['viewer']); assert.equal(canonical.user.isSystemAdmin, false);
      await login('outsider');
      expectStatus(await request('/auth/login', { actor: null, method: 'POST', body: { username: admin.username, password: account.password } }), 401, 'same display name cannot claim administrator');
      for (const field of ['userId', 'feishuOpenId', 'authVersion']) {
        expectStatus(await request('/auth/register', { actor: null, method: 'POST', body: { username: 'synthetic-no-claim', password: account.password, name: adminRow.name, [field]: admin.id } }), 400, 'identity claim rejected before registration');
      }
      expectStatus(await request('/admin/organization', { actor: 'outsider' }), 403, 'same display name cannot manage users');
      expectStatus(await request(`/projects/${state.projects.B.id}`, { actor: 'outsider' }), 403, 'renamed account scope preserved');
      const rows = dbRead(`p.localCredential.findMany({where:{userId:${JSON.stringify(account.id)}},select:{userId:true,loginName:true}})`);
      assert.deepEqual(rows, [{ userId: before.id, loginName: renamed }]);
    });
  }
  if (mode === 'projects') {
    await step('synthetic-projects-and-idempotency', async () => {
      assert.equal(dbRead('p.project.count()'), 0);
      for (const name of ['A', 'B']) {
        const key = randomUUID(); const body = { name: `SYNTHETIC-A2-${name}`, ownerUserId: admin.id, members: [] };
        const created = expectStatus(await request('/projects', { method: 'POST', body, headers: { 'Idempotency-Key': key } }), 201, 'create');
        state.projects[name] = { id: created.id, createKey: key }; await persist();
        const replay = expectStatus(await request('/projects', { method: 'POST', body, headers: { 'Idempotency-Key': key } }), 201, 'create replay');
        assert.equal(replay.id, created.id); assert.equal(replay.idempotentReplay, true);
        const facts = dbRead(`Promise.all([p.workflowInstance.count({where:{projectId:${JSON.stringify(created.id)}}}),p.workflowTask.count({where:{projectId:${JSON.stringify(created.id)}}}),p.auditLog.findMany({where:{projectId:${JSON.stringify(created.id)}},select:{action:true}})])`);
        assert.equal(facts[0], 1); assert.equal(facts[1], 1); assert.deepEqual(facts[2].map(row => row.action).sort(), ['PROJECT_CREATED', 'WORKFLOW_INITIALIZED']);
      }
    });
    await step('member-command-and-cross-project-negative', async () => {
      const a = state.projects.A.id; const b = state.projects.B.id;
      for (const account of ['purchaser', 'engineer']) {
        const idempotencyKey = randomUUID();
        const body = { userId: state.accounts[account].id, memberTypes: ['MEMBER'], expectedVersion: await version(a), idempotencyKey, reason: '合成成员授权' };
        expectStatus(await request(`/v2/projects/${a}/members`, { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }), 201, 'member add');
        expectStatus(await request(`/v2/projects/${a}/members`, { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }), 201, 'member replay');
        expectStatus(await request(`/v2/projects/${a}/workspace`, { actor: account }), 200, 'member workspace');
      }
      const task = dbRead(`p.workflowTask.findFirstOrThrow({where:{projectId:${JSON.stringify(b)}},select:{id:true}})`);
      for (const key of ['purchaser', 'engineer', 'outsider']) {
        for (const path of [`/projects/${b}`, `/v2/projects/${b}/workspace`, `/workflows/projects/${b}`, `/tasks/${task.id}`, `/workflows/tasks/${task.id}/detail`, `/v2/tasks/${task.id}`, `/projects/${b}/attachments`, '/admin/tasks/export', '/admin/organization']) {
          expectStatus(await request(path, { actor: key }), 403, `cross scope ${path}`);
        }
        expectStatus(await request(`/workflows/tasks/${task.id}/start`, { actor: key, method: 'POST', body: { comment: '合成越权负向' } }), 403, 'cross-scope transition');
      }
      state.projects.B.taskId = task.id;
    });
    await step('member-removal-revokes-access', async () => {
      const a = state.projects.A.id; const userId = state.accounts.purchaser.id; const idempotencyKey = randomUUID();
      expectStatus(await request(`/v2/projects/${a}/members/${userId}`, { method: 'DELETE', body: { expectedVersion: await version(a), idempotencyKey, reason: '合成移除成员' }, headers: { 'Idempotency-Key': idempotencyKey } }), 200, 'member remove');
      expectStatus(await request(`/projects/${a}`, { actor: 'purchaser' }), 403, 'removed member scope');
      const addKey = randomUUID();
      expectStatus(await request(`/v2/projects/${a}/members`, { method: 'POST', body: { userId, memberTypes: ['MEMBER'], expectedVersion: await version(a), idempotencyKey: addKey, reason: '合成恢复成员供后续业务验收' }, headers: { 'Idempotency-Key': addKey } }), 201, 'member re-add');
      expectStatus(await request(`/projects/${a}`, { actor: 'purchaser' }), 200, 're-added scope');
    });
  }
  if (mode === 'attachments') {
    await step('actual-clam-scan-download-and-attachment-idor', async () => {
      const a = state.projects.A.id; const b = state.projects.B.id;
      const result = expectStatus(await upload(a, 'synthetic-a2.png', samplePng, 'image/png'), 201, 'real scanner upload');
      assert.equal(result.scanStatus, 'CLEAN');
      const sha256 = createHash('sha256').update(samplePng).digest('hex');
      state.attachment = { id: result.id, sha256, projectId: a, fileName: 'synthetic-a2.png' }; await persist();
      const content = await request(`/attachments/${result.id}/content`, { actor: 'purchaser', binary: true });
      assert.equal(content.status, 200); assert.equal(createHash('sha256').update(content.buffer).digest('hex'), sha256);
      expectStatus(await request(`/projects/${a}/attachments/${result.id}`, { actor: 'engineer' }), 200, 'member metadata');
      for (const path of [`/attachments/${result.id}/content`, `/projects/${a}/attachments/${result.id}`, `/projects/${a}/attachments/${result.id}/download`]) {
        expectStatus(await request(path, { actor: 'outsider' }), 403, 'attachment outsider');
      }
      expectStatus(await request(`/projects/${b}/attachments/${result.id}`, { actor: 'purchaser' }), 403, 'attachment foreign project');
      expectStatus(await request(`/projects/${b}/attachments/${result.id}/bind`, { actor: 'purchaser', method: 'POST', body: { entityType: 'PROJECT', entityId: b } }), 403, 'attachment foreign binding');
      const fact = dbRead(`p.attachment.findUniqueOrThrow({where:{id:${JSON.stringify(result.id)}},select:{uploadedById:true,scanStatus:true,scannerEngine:true,scannerSignatureVersion:true,checksum:true}})`);
      assert.equal(fact.uploadedById, state.accounts.purchaser.id); assert.equal(fact.scanStatus, 'CLEAN');
      assert.equal(fact.scannerEngine, 'clamav'); assert.equal(fact.checksum, sha256);
      state.attachment.scan = fact; evidence.checks.push({ name: 'actual-signature-version', status: 'OBSERVED', signatureVersion: fact.scannerSignatureVersion });
    });
    await step('real-clam-eicar-docx-rejected-with-persisted-verdict', async () => {
      const a = state.projects.A.id;
      const result = await upload(a, 'synthetic-eicar.docx', harmlessEicarDocx(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expectStatus(result, 422, 'actual ClamAV verdict must reject');
      const rows = dbRead(`p.attachment.findMany({where:{projectId:${JSON.stringify(a)},fileName:'synthetic-eicar.docx'},select:{id:true,scanStatus:true,scanResultSummary:true,scannerEngine:true}})`);
      assert.ok(rows.length > 0); assert.ok(rows.every(row => row.scanStatus === 'REJECTED' && row.scannerEngine === 'clamav' && row.scanResultSummary.startsWith('MALWARE_FOUND:')));
      for (const row of rows) assert.notEqual((await request(`/attachments/${row.id}/content`, { actor: 'purchaser' })).status, 200);
      evidence.checks.push({ name: 'malware-response', status: 'OBSERVED', httpStatus: result.status, persistedStatuses: rows.map(row => row.scanStatus) });
    });
    if (!portable) await step('scanner-unavailable-persists-error-and-blocks-download-login-survives', async () => {
      const scanner = 'timeline-native-a2-clamav-20260917';
      assert.equal(execFileSync('docker', ['inspect', '--format', '{{index .Config.Labels "purpose"}}', scanner], { encoding: 'utf8' }).trim(), purpose);
      execFileSync('docker', ['stop', '-t', '15', scanner], { stdio: 'pipe', timeout: 20000 });
      try {
        const result = await upload(state.projects.A.id, 'synthetic-unscanned.png', samplePng, 'image/png');
        expectStatus(result, 503, 'unavailable scanner must fail closed');
        const rows = dbRead(`p.attachment.findMany({where:{projectId:${JSON.stringify(state.projects.A.id)},fileName:'synthetic-unscanned.png'},select:{id:true,scanStatus:true,scanResultSummary:true}})`);
        assert.ok(rows.length > 0 && rows.every(row => row.scanStatus === 'SCAN_ERROR' && row.scanResultSummary === 'SCANNER_UNAVAILABLE'));
        for (const row of rows) assert.notEqual((await request(`/attachments/${row.id}/content`, { actor: 'purchaser' })).status, 200);
        expectStatus(await request('/auth/me'), 200, 'scanner outage authenticated access');
        await login('outsider');
        evidence.checks.push({ name: 'scanner-outage-response', status: 'OBSERVED', httpStatus: result.status });
      } finally { execFileSync('docker', ['start', scanner], { stdio: 'pipe', timeout: 10000 }); }
    });
  }
  if (mode === 'workflow') {
    if (!state.workflowProjectId) {
      const key = randomUUID();
      const created = expectStatus(await request('/projects', { method: 'POST', body: { name: 'SYNTHETIC-A2-RETURN-RESUBMIT', ownerUserId: admin.id, members: [] }, headers: { 'Idempotency-Key': key } }), 201, 'return-path project');
      state.projects.C = { id: created.id, createKey: key }; state.workflowProjectId = created.id; await persist();
      for (const key of ['engineer', 'purchaser']) {
        const idempotencyKey = randomUUID();
        expectStatus(await request(`/v2/projects/${created.id}/members`, { method: 'POST', body: { userId: state.accounts[key].id, memberTypes: ['MEMBER'], expectedVersion: await version(created.id), idempotencyKey, reason: '合成退回重提成员' } }), 201, 'return-path member');
      }
    }
    await step('workflow-initiation-native-admin', async () => { await completeOrdinary('PROJECT_INITIATION', 'admin'); });
    await step('workflow-report-native-engineer', async () => {
      const task = await activeTask('DEVELOPMENT_REPORT'); await assignTask(task, 'engineer');
      expectStatus(await request(`/workflows/tasks/${task.id}/start`, { actor: 'purchaser', method: 'POST', body: { comment: '合成岗位操作负向' } }), 403, 'purchaser cannot operate engineer assignment');
      await completeOrdinary('DEVELOPMENT_REPORT', 'engineer');
    });
    await step('workflow-paint-first-submission', async () => { await completeOrdinary('PAINT_DEVELOPMENT', 'engineer'); });
    await step('workflow-sample-return-retains-history', async () => {
      const task = await activeTask('SAMPLE_COLOR_CONFIRMATION'); await assignTask(task, 'engineer');
      const sample = expectStatus(await request(`/projects/${state.workflowProjectId}/samples`, { actor: 'engineer', method: 'POST', body: {
        sampleNo: 'SYNTHETIC-A2-PANEL', sampleName: '合成颜色样板', sampleType: 'PANEL', producedAt: new Date().toISOString(), remark: '纯合成验收材料',
      } }), 201, 'sample create');
      state.sampleId = sample.sample?.id ?? sample.id; assert.ok(state.sampleId); await persist();
      expectStatus(await request(`/projects/${state.workflowProjectId}/samples/confirm`, { actor: 'engineer', method: 'POST', body: {
        sampleId: state.sampleId, decision: 'RETURN', comment: '合成退回：颜色需调整', colorAssessment: '合成不通过',
      } }), 201, 'sample return');
      const first = dbRead(`p.sampleConfirmation.findUniqueOrThrow({where:{workflowTaskId:${JSON.stringify(task.id)}},select:{id:true,decision:true,confirmedById:true}})`);
      assert.equal(first.decision, 'RETURN'); assert.equal(first.confirmedById, state.accounts.engineer.id);
      state.returnedConfirmation = first;
      const rework = await activeTask('PAINT_DEVELOPMENT'); assert.equal(rework.taskRound, 2);
    });
    await step('workflow-paint-resubmission', async () => {
      const task = await activeTask('PAINT_DEVELOPMENT'); await assignTask(task, 'engineer');
      expectStatus(await request(`/workflows/tasks/${task.id}/form`, { actor: 'engineer', method: 'PUT', body: { payload: { syntheticAdjustment: '调整合成配方后重提' }, comment: '合成重新提交' } }), 200, 'rework form save');
      await completeOrdinary('PAINT_DEVELOPMENT', 'engineer');
    });
    await step('workflow-sample-approval-after-real-image-scan', async () => {
      const task = await activeTask('SAMPLE_COLOR_CONFIRMATION'); await assignTask(task, 'engineer'); assert.equal(task.taskRound, 2);
      const form = new FormData(); form.set('file', new Blob([samplePng], { type: 'image/png' }), 'synthetic-approved-panel.png');
      const uploadResult = expectStatus(await request(`/projects/${state.workflowProjectId}/samples/${state.sampleId}/images`, { actor: 'engineer', method: 'POST', body: form }), 201, 'sample image');
      assert.equal(uploadResult.attachment.scanStatus, 'CLEAN');
      expectStatus(await request(`/projects/${state.workflowProjectId}/samples/confirm`, { actor: 'purchaser', method: 'POST', body: { sampleId: state.sampleId, decision: 'APPROVE' } }), 403, 'purchaser cannot confirm sample');
      expectStatus(await request(`/projects/${state.workflowProjectId}/samples/confirm`, { actor: 'engineer', method: 'POST', body: { sampleId: state.sampleId, decision: 'APPROVE', comment: '合成复核通过' } }), 201, 'sample approve');
      const rows = dbRead(`p.sampleConfirmation.findMany({where:{projectId:${JSON.stringify(state.workflowProjectId)}},select:{id:true,decision:true,confirmedById:true},orderBy:{confirmedAt:'asc'}})`);
      assert.equal(rows.length, 2); assert.equal(rows[0].id, state.returnedConfirmation.id);
      assert.deepEqual(rows.map(row => row.decision), ['RETURN', 'APPROVE']);
      assert.ok(rows.every(row => row.confirmedById === state.accounts.engineer.id));
    });
    await step('workflow-procurement-native-purchaser', async () => {
      const task = await activeTask('PAINT_PROCUREMENT'); await assignTask(task, 'purchaser');
      expectStatus(await request(`/workflows/tasks/${task.id}/start`, { actor: 'engineer', method: 'POST', body: { comment: '合成工艺越岗位负向' } }), 403, 'engineer cannot operate purchaser assignment');
      await completeOrdinary('PAINT_PROCUREMENT', 'purchaser');
      await activeTask('FIRST_UNIT_PRODUCTION_PLAN');
    });
    await step('real-notifications-and-audit-readback', async () => {
      let notifications;
      for (let n = 0; n < 15; n++) {
        notifications = expectStatus(await request('/notifications/my?pageSize=50'), 200, 'notification read');
        if (notifications.items.some(item => item.projectId === state.workflowProjectId)) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      const item = notifications.items.find(item => item.projectId === state.workflowProjectId); assert.ok(item);
      expectStatus(await request(`/notifications/${item.id}/mark-read`, { actor: 'outsider', method: 'POST' }), 404, 'notification ownership');
      expectStatus(await request(`/notifications/${item.id}/mark-read`, { method: 'POST' }), 201, 'mark notification read');
      expectStatus(await request(`/notifications/${item.id}/mark-read`, { method: 'POST' }), 201, 'read replay');
      const row = dbRead(`p.notification.findUniqueOrThrow({where:{id:${JSON.stringify(item.id)}},select:{isRead:true,userId:true,sendChannel:true,readAt:true}})`);
      assert.equal(row.isRead, true); assert.equal(row.userId, admin.id); assert.equal(row.sendChannel, 'IN_APP'); assert.ok(row.readAt);
      assert.equal(dbRead(`p.auditLog.count({where:{targetId:${JSON.stringify(item.id)},action:'NOTIFICATION_MARKED_READ'}})`), 1);
      const logs = dbRead(`p.auditLog.findMany({where:{projectId:${JSON.stringify(state.workflowProjectId)}},select:{action:true,actorUserId:true,targetId:true}})`);
      for (const action of ['PROJECT_CREATED', 'WORKFLOW_INITIALIZED', 'WORKFLOW_RETURN', 'WORKFLOW_APPROVE', 'R26_ORDINARY_TASK_COMPLETED', 'SAMPLE_CONFIRMATION_SUBMITTED', 'WORKFLOW_FORM_SAVED']) assert.ok(logs.some(log => log.action === action), action);
      assert.ok(logs.some(log => log.action === 'WORKFLOW_RETURN' && log.actorUserId === state.accounts.engineer.id));
      expectStatus(await request(`/projects/${state.workflowProjectId}/logs`), 200, 'audit HTTP readback');
      state.workflowAuditActions = [...new Set(logs.map(row => row.action))];
    });
  }
  if (mode === 'restore') {
    assert.ok(['https://localhost:3452', 'https://localhost:9444'].includes(api));
    for (const key of ['purchaser', 'engineer', 'outsider']) {
      const actor = expectStatus(await request('/auth/me', { actor: key }), 200, 'restored identity');
      assert.equal(actor.id, state.accounts[key].id);
    }
    for (const project of Object.values(state.projects)) expectStatus(await request(`/projects/${project.id}`), 200, 'restored project');
    if (!state.attachment) throw new Error('Restoration must include the actually scanned source attachment.');
    const bytes = await request(`/attachments/${state.attachment.id}/content`, { actor: 'purchaser', binary: true });
    assert.equal(bytes.status, 200); assert.equal(createHash('sha256').update(bytes.buffer).digest('hex'), state.attachment.sha256);
    expectStatus(await request(`/projects/${state.projects.B.id}`, { actor: 'purchaser' }), 403, 'restored project scope');
    expectStatus(await request(`/attachments/${state.attachment.id}/content`, { actor: 'outsider' }), 403, 'restored attachment scope');
    assert.ok(state.sourceBusinessSnapshot, 'Run source readback before backup.');
    assert.deepEqual(representativeBusinessSnapshot(), state.sourceBusinessSnapshot, 'restored task states, identities, authors, attachment relations, and audit must match source');
    const key = randomUUID();
    const created = expectStatus(await request('/projects', { method: 'POST', body: { name: 'SYNTHETIC-A2-RESTORED-B', ownerUserId: admin.id, members: [] }, headers: { 'Idempotency-Key': key } }), 201, 'restored new project write');
    expectStatus(await request(`/projects/${created.id}`), 200, 'restored new project read');
    evidence.checks.push({ name: 'restored-native-users-projects-file-hash-negative-scope-new-write', status: 'PASS', newProjectId: created.id });
  }
  if (mode === 'readback') {
    for (const [name, project] of Object.entries(state.projects)) {
      expectStatus(await request(`/projects/${project.id}`), 200, `read project ${name}`);
    }
    state.finalDatabaseCounts = dbRead('Promise.all([p.user.count(),p.project.count(),p.workflowTask.count(),p.attachment.count(),p.notification.count(),p.auditLog.count()]).then(([users,projects,tasks,attachments,notifications,audit])=>({users,projects,tasks,attachments,notifications,audit}))');
    state.sourceBusinessSnapshot = representativeBusinessSnapshot();
    evidence.checks.push({ name: 'authenticated-readback', status: 'PASS', counts: state.finalDatabaseCounts, snapshotSha256: createHash('sha256').update(JSON.stringify(state.sourceBusinessSnapshot)).digest('hex') });
  }
  evidence.status = 'PASS'; evidence.completedAt = new Date().toISOString();
} catch (error) {
  evidence.status = 'FAIL'; evidence.failure = { type: error.name, message: String(error.message).slice(0, 300) };
  process.exitCode = 1;
} finally {
  for (const cookie of cookies.values()) {
    try { await request('/auth/logout', { actor: null, cookie, method: 'POST' }); } catch { /* Preserve original failure. */ }
  }
  await persist();
  console.log(JSON.stringify({ status: evidence.status, mode, requests: evidence.requests.length, checks: evidence.checks,
    failure: evidence.failure, evidence: `${root}/business-${mode}-result.json`, credentialsRecorded: false }));
}
