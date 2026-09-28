import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, stat, rename } from 'node:fs/promises';
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
const mode = process.argv[2]; assert.ok(['auth', 'projects', 'work', 'flow', 'monthly', 'rework'].includes(mode));
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
const samplePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
async function post(url, who, body) { return (await request(url, { who, method: 'POST', body, expect: 201 })).data; }
async function complete(projectId, nodeCode, who, extra = {}) {
  const active = await task(projectId, nodeCode); assert.equal(active.assigneeUserId, state.accounts[who].id);
  const ctx = await context(active.id, who);
  const preview = await post(`/v2/tasks/${active.id}/completion-preview`, who, { taskVersion: ctx.taskVersion, ...extra });
  assert.equal(preview.canComplete, true, JSON.stringify(preview.blockingReasons));
  const key = randomUUID(), body = { taskVersion: ctx.taskVersion, completionReason: '合成完整业务办理', acknowledgedConsequences: true, idempotencyKey: key, ...extra };
  const params = { who, method: 'POST', body, headers: { 'Idempotency-Key': key }, expect: 201 };
  const result = await request(`/v2/tasks/${active.id}/complete`, params); assert.equal(result.data.command.completedTask.id, active.id);
  const replay = await request(`/v2/tasks/${active.id}/complete`, params); assert.equal(replay.data.command.idempotentReplay, true);
  return active;
}
async function prepareSample(projectId, name, round) {
  const key = `${name}-sample-${round}`;
  await step(key, async () => {
    const sample = await post(`/projects/${projectId}/samples`, 'engineer', { sampleNo: `R28-${name}-${round}`, sampleName: '合成颜色样板', sampleType: 'PANEL', producedAt: new Date().toISOString(), remark: '合成流程证据' });
    state[key] = sample.sample?.id ?? sample.id; assert.ok(state[key]); await persist();
  });
  await step(`${key}-image`, async () => {
    const form = new FormData(); form.set('file', new Blob([samplePng], { type: 'image/png' }), `synthetic-${name}-${round}.png`);
    const uploaded = await post(`/projects/${projectId}/samples/${state[key]}/images`, 'engineer', form); assert.equal(uploaded.attachment.scanStatus, 'CLEAN');
  });
  return state[key];
}
async function firstSix(name, rework = false) {
  const projectId = state.projects[name];
  if (!rework) await step(`${name}-01`, () => complete(projectId, 'PROJECT_INITIATION', 'pm'));
  if (!rework) await step(`${name}-02`, () => post(`/projects/${projectId}/development-report/submit`, 'pm', { demandSource: '合成市场需求', targetColorName: `合成${name}定制色`, developmentReason: '合成项目验证完整研发主链路', targetVehicleModel: '合成轻卡' }));
  const rounds = name === 'B' ? 2 : 1;
  for (let round = 1; round <= rounds; round++) {
    const sampleId = await prepareSample(projectId, name, round);
    await step(`${name}-03-${round}`, () => complete(projectId, 'PAINT_DEVELOPMENT', 'engineer'));
    await step(`${name}-04-${round}`, async () => {
      const active = await task(projectId, 'SAMPLE_COLOR_CONFIRMATION'); assert.equal(active.assigneeUserId, state.accounts.quality.id);
      const decision = round < rounds ? 'RETURN' : 'APPROVE';
      await post(`/projects/${projectId}/samples/confirm`, 'quality', { sampleId, decision, comment: decision === 'RETURN' ? '合成退回：颜色需调整' : '合成复核通过', colorAssessment: '合成评估记录' });
      const stored = await db.sampleConfirmation.findUniqueOrThrow({ where: { workflowTaskId: active.id } }); assert.equal(stored.decision, decision); assert.equal(stored.confirmedById, state.accounts.quality.id);
    });
  }
  if (!rework) await step(`${name}-05-material`, async () => { const row = await task(projectId, 'COLOR_NUMBERING'); const ctx = await context(row.id, 'engineer'); await uploadMaterial(row.id, 'engineer', ctx.taskVersion, 'color-number-proof', `合成${name}取号确认.pdf`, '%PDF-1.4\nsynthetic color number proof\n%%EOF'); });
  if (!rework) await step(`${name}-05`, () => complete(projectId, 'COLOR_NUMBERING', 'engineer', { colorNumber: `R28-${name}-001` }));
  await step('synthetic-supplier', async () => { const key = randomUUID(); const created = await request('/suppliers', { who: 'purchaser', method: 'POST', body: { supplierCode: 'R28-SUPPLIER', supplierName: '合成涂料供应商', status: 'ACTIVE' }, headers: { 'Idempotency-Key': key }, expect: 201 }); state.supplierId = created.data.id ?? created.data.supplier?.id; assert.ok(state.supplierId); });
  await step(`${name}-06-draft`, async () => { const data = await post(`/projects/${projectId}/paint-procurements`, 'purchaser', { supplierId: state.supplierId, procurementCode: `R28-${name}-ORDER`, materialName: '合成涂料', batchNo: `R28-${name}-BATCH`, quantity: '10', unit: 'kg', arrivalDate: new Date().toISOString() }); state[`${name}-procurementId`] = data.items.find(item => item.procurementCode === `R28-${name}-ORDER`).id; });
  for (const action of ['order', 'mark-arrived']) await step(`${name}-06-${action}`, () => post(`/projects/${projectId}/paint-procurements/${state[`${name}-procurementId`]}/${action}`, 'purchaser'));
  await step(`${name}-06`, () => post(`/projects/${projectId}/paint-procurements/complete-task`, 'purchaser'));
  await step(`${name}-parallel-07-09-10`, async () => { for (const code of ['STANDARD_BOARD_PRODUCTION', 'PERFORMANCE_TEST', 'FIRST_UNIT_PRODUCTION_PLAN']) await task(projectId, code); });
}
async function requiredMaterials(projectId, node, who) {
  const row = await task(projectId, node), ctx = await context(row.id, who);
  for (const requirement of ctx.materials.requirements.filter(item => item.required && item.status !== 'SUBMITTED')) {
    await step(`material-${row.id}-${requirement.id}`, async () => {
      const current = await context(row.id, who);
      await uploadMaterial(row.id, who, current.taskVersion, requirement.id, `合成${requirement.name}.pdf`, '%PDF-1.4\nsynthetic process evidence\n%%EOF');
    });
  }
}
async function review(projectId, name, family, node, suffix, decision = 'APPROVED') {
  const key = `${name}-${family}-${suffix}`;
  await step(`${key}-create`, async () => {
    const row = await task(projectId, node);
    await requiredMaterials(projectId, node, 'quality');
    const date = new Date().toISOString();
    const data = await post(`/projects/${projectId}/reviews/${family}`, 'quality', { reviewerId: state.accounts.quality.id, reviewDate: date, reviewConclusion: decision, comment: '合成评审意见', ...(decision === 'REJECTED' ? { rejectReason: '合成工艺需整改' } : {}) });
    state[key] = data.items.find(item => item.workflowTaskId === row.id && item.reviewDate === date).id;
  });
  await step(`${key}-submit`, () => post(`/projects/${projectId}/reviews/${family}/${state[key]}/submit`, 'quality'));
  await step(`${key}-decision`, () => post(`/projects/${projectId}/reviews/${family}/${state[key]}/${decision === 'APPROVED' ? 'approve' : 'reject'}`, 'quality', decision === 'APPROVED' ? undefined : { comment: '合成退回修改工艺' }));
}
async function middleTen(name, options = {}) {
  const p = state.projects[name], base = `/projects/${p}`, now = () => new Date().toISOString();
  if (!options.skipParallel) {
  await step(`${name}-07-create`, async () => { const data = await post(`${base}/standard-boards`, 'engineer', { boardCode: `R28-SB-${name}`, versionNo: 1 }); state[`${name}-board`] = data.items.find(item => item.boardCode === `R28-SB-${name}`).id; });
  for (const action of ['mark-created', 'issue']) await step(`${name}-07-${action}`, () => post(`${base}/standard-boards/${state[`${name}-board`]}/${action}`, 'engineer', action === 'issue' ? { recipientName: '合成接收人' } : undefined));
  await step(`${name}-07`, async () => { await requiredMaterials(p, 'STANDARD_BOARD_PRODUCTION', 'engineer'); await post(`${base}/standard-boards/complete-task`, 'engineer'); });
  if (!options.stopAt14) {
  await step(`${name}-08-update`, () => post(`${base}/color-board-detail-update`, 'engineer', { standardBoardId: state[`${name}-board`], updateStatus: 'UPDATED', detailUpdatedAt: now() }));
  await step(`${name}-08`, async () => { await requiredMaterials(p, 'BOARD_DETAIL_UPDATE', 'engineer'); await post(`${base}/color-board-detail-update/complete-task`, 'engineer'); });
  await step(`${name}-09-create`, async () => { const data = await post(`${base}/performance-tests`, 'quality', { testCode: `R28-PT-${name}`, relatedObjectName: '合成样件', testItem: 'GLOSS', standardValue: '90', actualValue: '90', result: 'PASS', conclusion: '合成验证通过', testedById: state.accounts.quality.id, testedAt: now() }); state[`${name}-performance`] = data.items.find(item => item.testCode === `R28-PT-${name}`).id; });
  await step(`${name}-09-report`, async () => { const form = new FormData(); form.set('file', new Blob(['%PDF-1.4\nsynthetic performance report\n%%EOF'], { type: 'application/pdf' }), '合成性能报告.pdf'); await post(`${base}/performance-tests/${state[`${name}-performance`]}/report`, 'quality', form); });
  await step(`${name}-09-submit`, () => post(`${base}/performance-tests/${state[`${name}-performance`]}/submit`, 'quality'));
  await step(`${name}-09`, async () => { await requiredMaterials(p, 'PERFORMANCE_TEST', 'quality'); await post(`${base}/performance-tests/complete-task`, 'quality'); });
  }
  }
  await step(`${name}-10-create`, async () => { const data = await post(`${base}/first-production-plans`, 'production', { ownerId: state.accounts.production.id, workshop: '合成车间', lineName: '合成产线', batchNo: `R28-FIRST-${name}`, planDate: now(), plannedQuantity: 1 }); state[`${name}-first`] = data.items.find(item => item.batchNo === `R28-FIRST-${name}`).id; });
  await step(`${name}-10-confirm`, () => post(`${base}/first-production-plans/${state[`${name}-first`]}/confirm`, 'production'));
  await step(`${name}-10`, async () => { await requiredMaterials(p, 'FIRST_UNIT_PRODUCTION_PLAN', 'production'); await post(`${base}/first-production-plans/complete-task`, 'production'); });
  for (let round = 1; round <= (['B', 'E-R2', 'F-R2'].includes(name) ? 2 : 1); round++) {
    const key = `${name}-11-${round}`;
    await step(`${key}-create`, async () => { const data = await post(`${base}/trial-productions`, 'engineer', { productionPlanId: state[`${name}-first`], vehicleNo: `R28-TRIAL-${name}-${round}`, workshop: '合成车间', trialDate: now(), paintBatchNo: `R28-PAINT-${name}-${round}`, result: 'PASS', issueSummary: '合成验证无异常' }); state[key] = data.items.find(item => item.vehicleNo === `R28-TRIAL-${name}-${round}`).id; });
    await step(`${key}-record`, () => post(`${base}/trial-productions/${state[key]}/complete`, 'engineer'));
    if (['E-R2', 'F-R2'].includes(name) && round === 1) {
      await step(`${key}-wrong-plan-create`, async () => { const data = await post(`${base}/trial-productions`, 'engineer', { productionPlanId: state[`${name.split('-')[0]}-first`], vehicleNo: 'R28-WRONG-OLD-PLAN', workshop: '合成车间', trialDate: now(), paintBatchNo: 'R28-WRONG-BATCH', result: 'PASS', issueSummary: '合成错误关联对照记录' }); state[`${name}-wrong-trial`] = data.items.find(item => item.vehicleNo === 'R28-WRONG-OLD-PLAN').id; });
      await step(`${key}-wrong-plan-prepared`, () => request(`${base}/trial-productions/${state[`${name}-wrong-trial`]}`, { who: 'engineer', method: 'PATCH', body: { productionPlanId: state[`${name.split('-')[0]}-first`], vehicleNo: 'R28-WRONG-OLD-PLAN', workshop: '合成车间', trialDate: now(), paintBatchNo: 'R28-WRONG-BATCH', result: 'PASS', issueSummary: '合成错误关联对照记录' } }));
      await step(`${key}-wrong-plan-complete`, () => post(`${base}/trial-productions/${state[`${name}-wrong-trial`]}/complete`, 'engineer'));
    }
    await step(key, async () => { await requiredMaterials(p, 'TRIAL_PRODUCTION', 'engineer'); await post(`${base}/trial-productions/complete-task`, 'engineer'); });
    await review(p, name, 'cabin', 'CAB_REVIEW', String(round), ['B', 'E-R2', 'F-R2'].includes(name) && round === 1 ? 'REJECTED' : 'APPROVED');
    if (['E-R2', 'F-R2'].includes(name)) await step(`${key}-review-correct-trial`, async () => { const saved = await db.reviewRecord.findUniqueOrThrow({ where: { id: state[`${name}-cabin-${round}`] } }); assert.equal(saved.trialProductionId, state[key]); });
  }
  if (!options.reuseFee) await step(`${name}-13-create`, async () => { const fees = (await request(`${base}/fees`, { who: 'production' })).data; const data = await post(`${base}/fees`, 'production', { feeType: 'PAINT_DEVELOPMENT', amount: fees.fixedAmount, payer: `R28-PAYER-${name}`, recordedAt: now() }); state[`${name}-fee`] = data.items.find(item => item.payer === `R28-PAYER-${name}`).id; });
  if (options.stopAt14) return;
  await step(`${name}-13-paid`, () => post(`${base}/fees/${state[`${name}-fee`]}/mark-paid`, 'production'));
  await step(`${name}-13`, async () => { await requiredMaterials(p, 'DEVELOPMENT_ACCEPTANCE', 'production'); await post(`${base}/fees/complete-task`, 'production'); });
  await review(p, name, 'consistency', 'COLOR_CONSISTENCY_REVIEW', '1');
  await step(`${name}-15-create`, async () => { const data = await post(`${base}/production-plans/schedule`, 'production', { ownerId: state.accounts.production.id, workshop: '合成车间', lineName: '合成产线', batchNo: `R28-SCHEDULE-${name}`, planDate: now(), plannedQuantity: 1 }); state[`${name}-schedule`] = data.items.find(item => item.batchNo === `R28-SCHEDULE-${name}`).id; });
  await step(`${name}-15-confirm`, () => post(`${base}/production-plans/schedule/${state[`${name}-schedule`]}/confirm`, 'production'));
  await step(`${name}-15`, async () => { await requiredMaterials(p, 'MASS_PRODUCTION_PLAN', 'production'); await post(`${base}/production-plans/schedule/complete-task`, 'production'); });
  await step(`${name}-16-create`, async () => { const data = await post(`${base}/mass-production`, 'production', { ownerId: state.accounts.production.id, workshop: '合成车间', lineName: '合成产线', batchNo: `R28-MASS-${name}`, productionDate: now(), plannedQuantity: 1, actualQuantity: 1 }); state[`${name}-mass`] = data.items.find(item => item.batchNo === `R28-MASS-${name}`).id; });
  for (const action of ['start', 'complete']) await step(`${name}-16-${action}`, () => post(`${base}/mass-production/${state[`${name}-mass`]}/${action}`, 'production'));
  await step(`${name}-16`, async () => { await requiredMaterials(p, 'MASS_PRODUCTION', 'production'); await post(`${base}/mass-production/complete-task`, 'production'); });
  await step(`${name}-17-twelve-future-months`, async () => {
    const data = (await request(`${base}/reviews/visual-delta`, { who: 'quality' })).data; assert.equal(data.recurringTasks.length, 12);
    const rows = data.recurringTasks; assert.equal(new Set(rows.map(item => item.id)).size, 12); state[`${name}-months`] = rows.map(item => ({ id: item.id, plannedDate: item.plannedDate }));
    await request(`${base}/reviews/visual-delta`, { who: 'quality', method: 'POST', body: { reviewerId: state.accounts.quality.id, reviewDate: rows[0].plannedDate, reviewConclusion: 'APPROVED', comment: '未来月份必须拒绝' }, expect: 409 });
  });
}

async function setBusinessTime(value) {
  const pending = path.join(root, `business-time-${randomUUID()}.tmp`);
  await writeFile(pending, JSON.stringify({ syntheticOnly: true, businessNow: value }), { mode: 0o600 });
  await rename(pending, path.join(root, 'business-time.json'));
  const [{ time }] = await db.$queryRaw`SELECT clock_timestamp() AS time`;
  const Redis = require('ioredis'); const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
  try {
    const realNow = Date.now(), [seconds, microseconds] = await redis.time(); const redisNow = Number(seconds) * 1000 + Number(microseconds) / 1000;
    assert.ok(Math.abs(time.getTime() - realNow) < 10000); assert.ok(Math.abs(redisNow - realNow) < 10000);
    evidence.checks.push({ name: 'business-time-only', status: 'PASS', businessTime: value, nodeTime: new Date(realNow).toISOString(), postgresTime: time.toISOString(), redisTime: new Date(redisNow).toISOString() });
    // Existing sessions remain valid across calendar jumps without reauthentication.
    await request('/auth/me', { who: 'quality' });
  } finally { redis.disconnect(); }
}
async function monthlyReview(name, index, decision, label) {
  const p = state.projects[name], month = state[`${name}-months`][index], base = `/projects/${p}/reviews/visual-delta`, key = `${name}-monthly-${index + 1}-${label}`;
  await step(`${key}-create`, async () => {
    const stage = await task(p, 'VISUAL_COLOR_DIFFERENCE_REVIEW');
    await requiredMaterials(p, 'VISUAL_COLOR_DIFFERENCE_REVIEW', 'quality');
    const data = await post(base, 'quality', { reviewerId: state.accounts.quality.id, reviewDate: month.plannedDate, reviewConclusion: decision, comment: '合成逐月质量评审', ...(decision === 'REJECTED' ? { rejectReason: '合成质量异常，退回量产复核' } : {}) });
    const record = data.items.find(item => item.workflowTaskId === stage.id && item.reviewPeriod === month.plannedDate.slice(0, 7)); assert.ok(record); state[key] = record.id;
  });
  await step(`${key}-submit`, () => post(`${base}/${state[key]}/submit`, 'quality'));
  await step(`${key}-decision`, () => post(`${base}/${state[key]}/${decision === 'APPROVED' ? 'approve' : 'reject'}`, 'quality'));
}
async function monthsAndClose() {
  for (let index = 0; index < 12; index++) {
    if (['A', 'B'].every(name => state.steps[`${name}-month-${index + 1}-readback`])) continue;
    const due = state['A-months'][index].plannedDate;
    assert.equal(state['B-months'][index].plannedDate, due);
    await step(`month-${index + 1}-before-boundary`, async () => {
      await setBusinessTime(new Date(Date.parse(due) - 1).toISOString());
      for (const name of ['A', 'B']) {
        const p = state.projects[name];
        const result = await request(`/projects/${p}/reviews/visual-delta`, { who: 'quality', method: 'POST', body: { reviewerId: state.accounts.quality.id, reviewDate: due, reviewConclusion: 'APPROVED', comment: '提前一毫秒不能办理' }, expect: 409 });
        assert.ok(result.data.message.includes('尚未到期'));
        assert.equal(await db.recurringTask.count({ where: { projectId: p, status: 'COMPLETED' } }), index);
      }
    });
    await setBusinessTime(due);
    if (index === 0) {
      await monthlyReview('B', 0, 'REJECTED', 'return');
      await step('B-monthly-return-stage-gate', async () => {
        const p = state.projects.B;
        const rows = await db.recurringTask.findMany({ where: { projectId: p }, orderBy: { periodIndex: 'asc' }, select: { id: true, plannedDate: true } });
        assert.deepEqual(rows.map(item => ({ ...item, plannedDate: item.plannedDate.toISOString() })), state['B-months']);
        const visible = (await request(`/team-tasks/monthly?view=mine&projectId=${p}`, { who: 'quality' })).data;
        assert.equal(visible.items.length, 0);
        await request(`/projects/${p}/reviews/visual-delta`, { who: 'quality', method: 'POST', body: { reviewerId: state.accounts.quality.id, reviewDate: due, reviewConclusion: 'APPROVED', comment: '非月度阶段不能办理' }, expect: 400 });
      });
      await step('B-mass-rework-create', async () => { const data = await post(`/projects/${state.projects.B}/mass-production`, 'production', { ownerId: state.accounts.production.id, workshop: '合成车间', lineName: '合成产线', batchNo: 'R28-MASS-B-REWORK', productionDate: due, plannedQuantity: 1, actualQuantity: 1 }); state['B-mass-rework'] = data.items.find(item => item.batchNo === 'R28-MASS-B-REWORK').id; });
      for (const action of ['start', 'complete']) await step(`B-mass-rework-${action}`, () => post(`/projects/${state.projects.B}/mass-production/${state['B-mass-rework']}/${action}`, 'production'));
      await step('B-mass-rework-task', async () => { await requiredMaterials(state.projects.B, 'MASS_PRODUCTION', 'production'); await post(`/projects/${state.projects.B}/mass-production/complete-task`, 'production'); });
    }
    for (const name of ['A', 'B']) {
      await monthlyReview(name, index, 'APPROVED', 'approved');
      await step(`${name}-month-${index + 1}-readback`, async () => {
        const p = state.projects[name], data = (await request(`/projects/${p}/reviews/visual-delta`, { who: 'quality' })).data;
        assert.equal(data.recurringTasks.filter(item => item.status === 'COMPLETED').length, index + 1);
        assert.deepEqual(data.recurringTasks.map(item => ({ id: item.id, plannedDate: item.plannedDate })), state[`${name}-months`]);
        const workflow = (await request(`/workflows/projects/${p}`)).data;
        assert.equal(workflow.activeTasks.some(item => item.nodeCode === 'PROJECT_CLOSED'), index === 11);
      });
    }
  }
  for (const name of ['A', 'B']) {
    const p = state.projects[name], decision = name === 'A' ? 'EXIT' : 'RETAIN', date = state[`${name}-months`][11].plannedDate;
    await step(`${name}-18-create`, async () => {
      const active = await task(p, 'PROJECT_CLOSED'); const color = await db.color.findFirstOrThrow({ where: { projectId: p }, select: { id: true, status: true, exitFlag: true, exitDate: true } }); state[`${name}-color-before`] = color;
      const data = await post(`/projects/${p}/color-exit`, 'pm', { exitDate: date, exitReason: '合成完整生命周期判断', annualOutput: name === 'A' ? 0 : 1000, finalDecision: decision, effectiveDate: date }); state[`${name}-exit`] = data.items.find(item => item.workflowTaskId === active.id).id;
    });
    await step(`${name}-18-complete`, async () => { await requiredMaterials(p, 'PROJECT_CLOSED', 'pm'); await post(`/projects/${p}/color-exit/${state[`${name}-exit`]}/complete`, 'pm'); });
    await step(`${name}-closed-readback`, async () => {
      assert.equal((await db.project.findUniqueOrThrow({ where: { id: p } })).status, 'COMPLETED');
      const color = await db.color.findUniqueOrThrow({ where: { id: state[`${name}-color-before`].id }, select: { id: true, status: true, exitFlag: true, exitDate: true } });
      if (decision === 'EXIT') { assert.equal(color.status, 'EXITED'); assert.equal(color.exitFlag, true); }
      else assert.deepEqual(JSON.parse(JSON.stringify(color)), state[`${name}-color-before`]);
      assert.equal(await db.recurringTask.count({ where: { projectId: p } }), 12);
      const logs = await db.auditLog.findMany({ where: { projectId: p }, select: { action: true } });
      for (const action of ['PROJECT_CREATED', 'R26_ORDINARY_TASK_COMPLETED', 'SAMPLE_CONFIRMATION_SUBMITTED', 'COLOR_EXIT_COMPLETED']) assert.ok(logs.some(item => item.action === action));
      await request(`/projects/${p}/logs`, { who: 'admin' });
    });
  }
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
    if (mode === 'rework') {
      const caseName = process.env.R28_REWORK_CASE ?? 'C'; assert.ok(['C', 'D', 'E', 'F'].includes(caseName));
      await step(`${caseName}-rework-project`, async () => {
        const key = randomUUID(); const { data } = await request('/projects', { who: 'pm', method: 'POST', body: { name: `合成 R28 ${caseName} 返工核验`, priority: 'MEDIUM', vehicleModel: '合成轻卡' }, headers: { 'Idempotency-Key': key }, expect: 201 });
        state.projects[caseName] = data.id;
      });
      const p = state.projects[caseName];
      await firstSix(`${caseName}`); await middleTen(`${caseName}`, { stopAt14: true });
      await step(`${caseName}-preserved-matters`, async () => {
        state[`${caseName}-original-number`] = await db.workflowTask.findFirstOrThrow({ where: { projectId: p, nodeCode: 'COLOR_NUMBERING' } });
        state[`${caseName}-original-fee-task`] = await db.workflowTask.findFirstOrThrow({ where: { projectId: p, nodeCode: 'DEVELOPMENT_ACCEPTANCE' } });
        state[`${caseName}-original-fee`] = await db.developmentFee.findUniqueOrThrow({ where: { id: state[`${caseName}-fee`] } });
        state[`${caseName}-original-color`] = await db.color.findFirstOrThrow({ where: { projectId: p }, select: { id: true, code: true, numberingTaskId: true } });
      });
      for (let round = 1; round <= 2; round++) {
        const name = round === 1 ? `${caseName}` : `${caseName}-R${round}`;
        await review(p, name, 'consistency', 'COLOR_CONSISTENCY_REVIEW', 'return', 'REJECTED');
        await step(`${caseName}-return-${round}-readback`, async () => {
          const active = await db.workflowTask.findMany({ where: { projectId: p, isActive: true } });
          assert.deepEqual(active.map(t => t.nodeCode).sort(), ['DEVELOPMENT_ACCEPTANCE', 'PAINT_DEVELOPMENT']);
          for (const [nodeCode, stored] of [['COLOR_NUMBERING', `${caseName}-original-number`], ['DEVELOPMENT_ACCEPTANCE', `${caseName}-original-fee-task`]]) {
            const rows = await db.workflowTask.findMany({ where: { projectId: p, nodeCode } }); assert.equal(rows.length, 1);
            assert.deepEqual(JSON.parse(JSON.stringify(rows[0])), JSON.parse(JSON.stringify(state[stored])));
          }
          assert.deepEqual(JSON.parse(JSON.stringify(await db.developmentFee.findUniqueOrThrow({ where: { id: state[`${caseName}-fee`] } }))), JSON.parse(JSON.stringify(state[`${caseName}-original-fee`])));
        });
        const next = `${caseName}-R${round + 1}`; state.projects[next] = p; await persist();
        await firstSix(next, true); await middleTen(next, { stopAt14: true, skipParallel: true, reuseFee: true });
      }
      await review(p, `${caseName}-R3`, 'consistency', 'COLOR_CONSISTENCY_REVIEW', 'final');
      if (caseName !== 'C') {
        const key = `${caseName}-R3`, base = `/projects/${p}`;
        await step(`${key}-fresh-07-create`, async () => { const data = await post(`${base}/standard-boards`, 'engineer', { boardCode: `R28-SB-${key}`, versionNo: 1 }); state[`${key}-fresh-board`] = data.items.find(item => item.boardCode === `R28-SB-${key}`).id; });
        for (const action of ['mark-created', 'set-current', 'issue']) await step(`${key}-fresh-07-${action}`, () => post(`${base}/standard-boards/${state[`${key}-fresh-board`]}/${action}`, 'engineer', action === 'issue' ? { recipientName: '合成返工接收人' } : undefined));
        await step(`${key}-fresh-07`, async () => { await requiredMaterials(p, 'STANDARD_BOARD_PRODUCTION', 'engineer'); await post(`${base}/standard-boards/complete-task`, 'engineer'); });
        await step(`${key}-08-old-board-rejected`, () => request(`${base}/color-board-detail-update`, { who: 'engineer', method: 'POST', body: { standardBoardId: state[`${caseName}-board`], updateStatus: 'UPDATED', detailUpdatedAt: new Date().toISOString() }, expect: 400 }));
        await step(`${key}-fresh-08-create`, () => post(`${base}/color-board-detail-update`, 'engineer', { standardBoardId: state[`${key}-fresh-board`], updateStatus: 'UPDATED', detailUpdatedAt: new Date().toISOString() }));
        await step(`${key}-fresh-08`, async () => { await requiredMaterials(p, 'BOARD_DETAIL_UPDATE', 'engineer'); await post(`${base}/color-board-detail-update/complete-task`, 'engineer'); });
      }
      await step(`${caseName}-two-returns-final`, async () => {
        assert.equal(await db.workflowTask.count({ where: { projectId: p, nodeCode: 'COLOR_NUMBERING' } }), 1);
        assert.equal(await db.workflowTask.count({ where: { projectId: p, nodeCode: 'DEVELOPMENT_ACCEPTANCE' } }), 1);
        assert.equal(await db.developmentFee.count({ where: { projectId: p } }), 1);
        assert.deepEqual(await db.color.findFirstOrThrow({ where: { projectId: p }, select: { id: true, code: true, numberingTaskId: true } }), state[`${caseName}-original-color`]);
        await task(p, 'MASS_PRODUCTION_PLAN');
      });
    }
    if (mode === 'monthly') await monthsAndClose();
    if (mode === 'flow') { for (const name of ['A', 'B']) { await firstSix(name); await middleTen(name); } evidence.partial = '01–16 only; monthly time validation and closure pending'; }
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
  evidence.status = 'PASS'; await persist(); console.log(JSON.stringify({ mode, status: evidence.status, checks: evidence.checks, partial: evidence.partial, requests: evidence.requests.length }));
} catch (error) { evidence.status = 'FAIL'; evidence.failure = error.message; await persist(); console.error(JSON.stringify({ mode, status: 'FAIL', message: error.message })); process.exitCode = 1; }
finally { await db.$disconnect(); }
