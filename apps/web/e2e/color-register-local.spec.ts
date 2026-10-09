import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Explicit isolated native-account runtime. No DB writes, auth fixtures, or positive-path API mocks.
test.use({ trace: 'off', video: 'off' });
test.describe.configure({ mode: 'serial' });
const runtime = process.env.COLOR_REGISTER_RUNTIME_ROOT;
const origin = 'http://127.0.0.1:3360';
const expectedCommit = process.env.COLOR_REGISTER_EXPECTED_COMMIT;
type Account = { username: string; password: string; id: string };
type Base = { id: string; name: string };
type Row = { id: string; name: string; base: Base | null; note: string | null; revision: number; formalCode: string | null; registerMonth: string | null; sourceSummary: string | null; registerStatus: string; productionApprovalStatus: string; currentStandardVersionId: string | null };
type List = { items: Row[]; total: number; totalPages: number; facets: { bases: Base[] }; importSummary: { sheetCount: number; rowCount: number; colorCount: number; sha256: string } | null };
type Version = { id: string; versionNo: number; measurements: Array<{ angle: string | number | null; l: string | number | null; a: string | number | null; b: string | number | null }>; [key: string]: unknown };
type Detail = Row & { hueStandard: { id: string; name: string } | null; versions: Version[]; versionsTotal: number; projects: Array<{ id: string }>; production: unknown[] };
type Network = { method: string; path: string; status: number; source: 'browser' | 'request' };
const evidenceByPage = new WeakMap<Page, ReturnType<typeof monitor>>();
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 300]/Contents 4 0 R>>endobj\n4 0 obj<</Length 0>>stream\n\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

async function accounts() {
  expect(runtime, 'Explicit isolated runtime directory is required').toBeTruthy();
  return JSON.parse(await readFile(path.join(runtime!, 'accounts.json'), 'utf8')) as Record<string, Account>;
}
async function login(page: Page, account: Account, destination: RegExp = /\/dashboard$/) {
  await page.goto('/login');
  await page.getByLabel('工号', { exact: false }).fill(account.username);
  await page.getByLabel('密码', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(destination);
}
async function get<T = any>(page: Page, url: string, network: Network[]): Promise<T> {
  const response = await page.request.get(`/api${url}`, { headers: { 'Cache-Control': 'no-cache' } });
  network.push({ method: 'GET', path: `/api${url.split('?')[0]}`, status: response.status(), source: 'request' });
  expect(response.status(), `GET ${url}: ${await response.text()}`).toBe(200);
  return response.json() as Promise<T>;
}
async function post<T = any>(page: Page, url: string, data: unknown, network: Network[], key?: string): Promise<T> {
  const response = await page.request.post(`/api${url}`, { headers: { Origin: origin, ...(key ? { 'Idempotency-Key': key } : {}) }, ...(data === undefined ? {} : { data }) });
  network.push({ method: 'POST', path: `/api${url.split('?')[0]}`, status: response.status(), source: 'request' });
  expect([200, 201], `POST ${url}: ${await response.text()}`).toContain(response.status());
  return response.json() as Promise<T>;
}
function monitor(page: Page) {
  const network: Network[] = []; const errors: string[] = []; const consoleErrors: string[] = []; const resources = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/')) network.push({ method: response.request().method(), path: url.pathname, status: response.status(), source: 'browser' });
    if (url.pathname.startsWith('/_next/static/')) resources.add(url.pathname);
  });
  const collected = { network, errors, consoleErrors, resources };
  evidenceByPage.set(page, collected);
  return collected;
}
test.afterEach(async ({ page }, info) => {
  const collected = evidenceByPage.get(page);
  if (!runtime || !collected) return;
  await writeFile(info.outputPath('sanitized-browser-events.json'), JSON.stringify({ expectedCommit, origin, title: info.title, status: info.status, network: collected.network, pageErrors: collected.errors, consoleErrors: collected.consoleErrors, staticResources: [...collected.resources] }, null, 2), { mode: 0o600 });
});
async function identify(page: Page, info: TestInfo) {
  expect(info.project.use.baseURL).toBe(origin);
  expect(expectedCommit, 'Must bind acceptance to a full immutable runtime commit').toMatch(/^[a-f0-9]{40}$/);
  for (const url of ['/api/health', '/build-info']) {
    const response = await page.request.get(url, { headers: { 'Cache-Control': 'no-cache' } });
    expect(response.status()).toBe(200);
    expect((await response.json()).runtimeCommit).toBe(expectedCommit);
  }
  const session = await get(page, '/auth/session', []);
  expect(session.mockEnabled).toBe(false); expect(session.feishuEnabled).toBe(false);
  expect(session.user.teamAccessApproved).toBe(true); expect(session.user.isSystemAdmin).toBe(false);
  expect(session.user.roleCodes).toEqual([]);
}
async function persist(name: string, value: unknown, info: TestInfo) {
  const body = JSON.stringify(value, null, 2);
  await writeFile(path.join(runtime!, name), body, { mode: 0o600 });
  await info.attach(name, { body, contentType: 'application/json' });
}
async function filter(page: Page, search = '', baseId = '') {
  await page.getByLabel('颜色或色板', { exact: true }).fill(search);
  await page.getByRole('combobox', { name: '生产基地', exact: true }).selectOption(baseId);
  const loaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/color-register' && response.status() === 200);
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await loaded;
  await expect(page.getByText('正在读取清单…', { exact: true })).toHaveCount(0);
}
async function screenshot(page: Page, info: TestInfo, label: string, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await page.screenshot({ path: info.outputPath(`${label}-${width}.png`), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label} viewport ${width} must not overflow the page`).toBe(true);
}

test('Color register: real source base isolation, hue identity, explicit notes and source rows', async ({ page, browserName }, info) => {
  test.setTimeout(240000);
  const a = await accounts(); const evidence = monitor(page);
  await login(page, a.memberA!); await identify(page, info);
  const initial = await get<List>(page, '/color-register?page=1&pageSize=50', evidence.network);
  expect(initial.importSummary).toMatchObject({ sheetCount: 11, rowCount: 1166, colorCount: 89 });
  const sourceCounts: Record<string, number> = {};
  const expectedCounts: Record<string, number> = { '新港本部': 23, '安徽阜阳': 14, '山东青州': 16, '四川遂宁': 21, '同大涂装': 15 };
  await page.goto('/admin/color-database');
  await expect(page.getByTestId('color-register-page')).toHaveAttribute('data-source', 'database');
  await expect(page.locator('.cr-table thead').getByRole('columnheader', { name: '生产基地', exact: true })).toBeVisible();
  await expect(page.locator('.cr-table thead').getByRole('columnheader', { name: '备注', exact: true })).toBeVisible();
  for (const base of initial.facets.bases) {
    const sourceRows: Row[] = [];
    let pageNumber = 1; let totalPages = 1;
    do {
      const result = await get<List>(page, `/color-register?baseId=${base.id}&page=${pageNumber}&pageSize=50`, evidence.network);
      expect(result.items.every(row => row.base?.id === base.id)).toBe(true);
      sourceRows.push(...result.items.filter(row => row.sourceSummary !== null)); totalPages = result.totalPages; pageNumber += 1;
    } while (pageNumber <= totalPages);
    sourceCounts[base.name] = sourceRows.length;
    expect(sourceRows.length, base.name).toBe(expectedCounts[base.name]);
    await filter(page, '', base.id);
    expect(await page.locator('.cr-table tbody tr').count()).toBeGreaterThan(0);
    const visibleBases = await page.locator('.cr-table tbody tr td:nth-child(2)').allTextContents();
    expect(visibleBases.every(value => value === base.name)).toBe(true);
  }
  const whiteRows = (await get<List>(page, `/color-register?search=${encodeURIComponent('新汉玉白')}&pageSize=50`, evidence.network)).items.filter(row => row.sourceSummary !== null);
  expect(whiteRows).toHaveLength(3); expect(whiteRows.every(row => row.name === '新汉玉白')).toBe(true);
  const whites: Detail[] = [];
  for (const row of whiteRows) whites.push(await get<Detail>(page, `/color-register/${row.id}`, evidence.network));
  expect(new Set(whites.map(row => row.id)).size).toBe(3);
  expect(new Set(whites.map(row => row.base!.id)).size).toBe(3);
  expect(new Set(whites.map(row => row.hueStandard!.id)).size).toBe(1);
  expect(new Set(whites.map(row => row.currentStandardVersionId)).size).toBe(3);
  expect(whites.every(row => row.projects.length === 0)).toBe(true);
  const blueRows = (await get<List>(page, `/color-register?search=${encodeURIComponent('尊贵蓝')}&pageSize=50`, evidence.network)).items.filter(row => row.sourceSummary !== null);
  const shandong = blueRows.find(row => row.base?.name === '山东青州' && /SD/i.test(row.name));
  const xingang = blueRows.find(row => row.base?.name === '新港本部' && !/SD/i.test(row.name));
  expect(shandong).toBeTruthy(); expect(xingang).toBeTruthy();
  const sd = await get<Detail>(page, `/color-register/${shandong!.id}`, evidence.network);
  const xg = await get<Detail>(page, `/color-register/${xingang!.id}`, evidence.network);
  expect(sd.id).not.toBe(xg.id); expect(sd.hueStandard!.id).not.toBe(xg.hueStandard!.id);
  await filter(page, '尊贵蓝', shandong!.base!.id);
  await expect(page.locator('.cr-table tbody')).toContainText(shandong!.name);
  await screenshot(page, info, 'source-shandong-blue', 1440);

  const target = whites.find(row => row.base?.name === '新港本部')!;
  const originalNote = target.note;
  const note = `隔离验收备注 ${Date.now()}：保留基地独立资料。`;
  await filter(page, '新汉玉白', target.base!.id);
  await page.locator(`#cr-note-${target.id}`).fill(note);
  const noteRequest = page.waitForRequest(request => request.method() === 'PATCH' && new URL(request.url()).pathname === '/api/color-register/notes');
  await page.getByRole('button', { name: '保存备注', exact: true }).click();
  const submitted = (await noteRequest).postDataJSON();
  await expect(page.locator('.m1-notice[role=status]')).toContainText('并已重新读取确认');
  const afterNote = await get<Detail>(page, `/color-register/${target.id}`, evidence.network);
  expect(afterNote.note).toBe(note); expect(afterNote.revision).toBe(target.revision + 1);
  expect(afterNote.hueStandard).toEqual(target.hueStandard);
  expect(afterNote.versions).toEqual(target.versions);
  const replay = await page.request.patch('/api/color-register/notes', { headers: { Origin: origin, 'Idempotency-Key': submitted.operationId }, data: submitted });
  evidence.network.push({ method: 'PATCH', path: '/api/color-register/notes', status: replay.status(), source: 'request' });
  expect(replay.status()).toBe(200);
  expect((await get<Detail>(page, `/color-register/${target.id}`, evidence.network)).revision).toBe(afterNote.revision);
  await page.reload(); await filter(page, '新汉玉白', target.base!.id);
  await expect(page.locator(`#cr-note-${target.id}`)).toHaveValue(note);
  if (browserName === 'chromium') await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await page.getByRole('button', { name: '复制当前页', exact: true }).click();
  const fallback = page.locator('#cr-copy-text');
  const copied = await fallback.count() ? await fallback.inputValue() : await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('清单记录ID\t记录版本'); expect(copied).toContain(target.id); expect(copied).toContain('生产基地'); expect(copied).toContain(note);
  const pastedNote = `${note} 已通过复制粘贴核对。`;
  await page.getByRole('button', { name: '粘贴备注', exact: true }).click();
  await page.getByLabel('表格内容', { exact: true }).fill(`清单记录ID\t记录版本\t备注\n${target.id}\t${afterNote.revision}\t${pastedNote}`);
  await page.getByRole('button', { name: '预览变更', exact: true }).click();
  await page.getByRole('button', { name: '放入备注草稿', exact: true }).click();
  expect((await get<Detail>(page, `/color-register/${target.id}`, evidence.network)).note).toBe(note);
  await page.getByRole('button', { name: '保存备注', exact: true }).click();
  await expect(page.locator('.m1-notice[role=status]')).toContainText('并已重新读取确认');
  await page.reload(); await filter(page, '新汉玉白', target.base!.id);
  await expect(page.locator(`#cr-note-${target.id}`)).toHaveValue(pastedNote);
  // Leave the imported row's human note intact after proving both real writes. Audit history remains.
  await page.locator(`#cr-note-${target.id}`).fill(originalNote ?? '');
  await page.getByRole('button', { name: '保存备注', exact: true }).click();
  await expect(page.locator('.m1-notice[role=status]')).toContainText('并已重新读取确认');

  await page.getByRole('button', { name: '查看全部工作表与待核对记录', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '工作表', exact: true }).locator('option')).toHaveCount(12);
  const source = await get(page, '/color-register/sources?pageSize=1', evidence.network);
  expect(source.total).toBe(1166); expect(source.batches[0].metadata.sheetNames).toHaveLength(11);
  const sheets: Array<{ name: string; rows: number }> = [];
  for (const name of source.batches[0].metadata.sheetNames as string[]) {
    const records = await get(page, `/color-register/sources?sheetName=${encodeURIComponent(name)}&pageSize=1`, evidence.network);
    expect(records.total).toBeGreaterThan(0); expect(records.items[0].sheetName).toBe(name);
    expect(Array.isArray(records.items[0].rawCells)).toBe(true); sheets.push({ name, rows: records.total });
  }
  expect(sheets.reduce((sum, sheet) => sum + sheet.rows, 0)).toBe(1166);
  await page.getByLabel('仅看待核对', { exact: true }).check();
  await expect(page.getByText('正在读取来源…', { exact: true })).toHaveCount(0);
  const pending = await get(page, '/color-register/sources?status=PENDING_REVIEW&pageSize=1', evidence.network);
  expect(pending.total).toBeGreaterThan(0); expect(pending.items[0].status).toBe('PENDING_REVIEW');
  for (const width of [1440, 1024, 390]) {
    await screenshot(page, info, 'source-register', width, width === 390 ? 844 : 900);
    await page.getByRole('button', { name: '查看详情', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toContainText('统一色相标准');
    await screenshot(page, info, 'source-standard-detail', width, width === 390 ? 844 : 900);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
  }
  expect(evidence.errors).toEqual([]); expect(evidence.consoleErrors).toEqual([]);
  await persist('register-source-browser.json', { expectedCommit, origin, sourceCounts, sheets, pendingRows: pending.total, whiteIds: whites.map(row => row.id), sharedHueId: whites[0]!.hueStandard!.id, sdId: sd.id, xgId: xg.id, noteRestored: true, network: evidence.network, errors: evidence.errors, consoleErrors: evidence.consoleErrors, staticResources: [...evidence.resources] }, info);
});

async function createProject(page: Page, options: { name: string; baseId: string; existingId?: string; date: string }, network: Network[]) {
  await page.goto('/projects/new?from=dashboard');
  await page.getByRole('combobox', { name: '生产基地', exact: true }).selectOption(options.baseId);
  if (options.existingId) {
    await page.getByRole('combobox', { name: '建立方式', exact: true }).selectOption('EXISTING');
    await page.getByLabel('查找已有颜色', { exact: true }).fill(options.name);
    await expect(page.getByRole('radio')).toHaveCount(1);
    const exact = await get<List>(page, `/color-register?baseId=${options.baseId}&search=${encodeURIComponent(options.name)}&pageSize=20`, network);
    expect(exact.items.map(row => row.id)).toEqual([options.existingId]);
    await page.getByRole('radio').check();
  } else await page.getByLabel('颜色名称', { exact: true }).fill(options.name);
  await page.getByLabel('适用车型', { exact: true }).fill('合成轻卡 清单验收');
  await page.getByLabel('开发报告批准日期', { exact: true }).fill(options.date);
  await page.getByLabel('批准依据', { exact: true }).fill('隔离验收合成批准记录，不代表真实业务批准');
  await page.getByLabel('需求来源', { exact: true }).fill('颜色清单隔离验收合成需求');
  await page.getByLabel('已获批的新颜色开发报告', { exact: true }).setInputFiles({ name: '隔离验收合成已获批报告.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(page).toHaveURL(url => /^\/projects\/[^/]+$/.test(url.pathname) && url.pathname !== '/projects/new', { timeout: 90000 });
  const projectId = new URL(page.url()).pathname.split('/')[2]!;
  const project = await get(page, `/projects/${projectId}`, network);
  expect(project.approvedReportAttachmentId).toBeTruthy();
  const attachment = await get(page, `/projects/${projectId}/attachments/${project.approvedReportAttachmentId}`, network);
  expect(attachment.scanStatus).toBe('CLEAN');
  expect(project.productionBaseId).toBe(options.baseId);
  if (options.existingId) expect(project.primaryColorId).toBe(options.existingId);
  return project;
}

test('Color register: approved report to one atomic board standard, candidate identity, correction history and existing link', async ({ page }, info) => {
  test.setTimeout(420000);
  const a = await accounts(); const evidence = monitor(page);
  await login(page, a.memberA!); await identify(page, info);
  const initial = await get<List>(page, '/color-register?pageSize=1', evidence.network);
  const base = initial.facets.bases.find(value => value.name === '新港本部')!;
  expect(base).toBeTruthy();
  const run = Date.now(); const name = `合成清单灰绿-${run}`; const date = '2026-10-07';
  const project = await createProject(page, { name, baseId: base.id, date }, evidence.network);
  const projectId: string = project.id; const colorId: string = project.primaryColorId;
  const candidate = await get<Detail>(page, `/color-register/${colorId}`, evidence.network);
  expect(candidate.registerStatus).toBe('CANDIDATE'); expect(candidate.formalCode).toBeNull(); expect(candidate.registerMonth).toBeNull();
  expect(candidate.versions).toEqual([]); expect(candidate.productionApprovalStatus).toBe('NOT_APPROVED');
  // A correction cannot promote a candidate outside the existing node 07 state machine.
  const rejectedCorrection = await page.request.post(`/api/color-register/${colorId}/standards`, { headers: { Origin: origin }, data: { operationId: randomUUID(), expectedRevision: candidate.revision, boardCode: 'INVALID-CANDIDATE', technicalData: { measurements: [], changeSummary: '合成禁止绕过节点检查' } } });
  expect(rejectedCorrection.status()).toBe(400);
  expect((await get<Detail>(page, `/color-register/${colorId}`, evidence.network)).registerStatus).toBe('CANDIDATE');
  await page.goto(`/dashboard?project=${projectId}`);
  await page.locator('[data-node-code="PAINT_DEVELOPMENT"]').click();
  await page.getByLabel('实际制样日期', { exact: true }).fill(date);
  await page.getByLabel('样板编号', { exact: true }).fill(`CR-${run}`);
  await page.getByLabel('样板名称', { exact: true }).fill('隔离验收合成灰绿样板');
  await page.getByRole('textbox', { name: '制样记录', exact: true }).fill('隔离验收合成制样事实。');
  await page.getByRole('button', { name: '保存并返回', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard\\?project=${projectId}&taskId=`));
  await page.locator('[data-node-code="SAMPLE_COLOR_CONFIRMATION"]').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/tasks/[^/?]+`));
  const confirmTaskId = new URL(page.url()).pathname.split('/').at(-1)!;
  await page.getByLabel('实际确认日期', { exact: true }).fill(date);
  await page.getByLabel('确认方', { exact: true }).fill('合成客户技术方');
  await page.getByRole('textbox', { name: '意见', exact: true }).fill('隔离验收合成确认，与批准要求一致。');
  await page.getByLabel('选择确认单', { exact: true }).setInputFiles({ name: '隔离验收合成颜色确认单.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.getByRole('button', { name: '上传确认单', exact: true }).click();
  await expect(page.getByText('材料扫描通过，已保存。', { exact: true })).toBeVisible({ timeout: 90000 });
  const confirmation = await get(page, `/v2/tasks/${confirmTaskId}/progress-context`, evidence.network);
  const proof = await get(page, `/projects/${projectId}/attachments/${confirmation.materials.current[0].id}`, evidence.network);
  expect(proof.scanStatus).toBe('CLEAN');
  await page.getByRole('button', { name: '保存并返回', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard\\?project=${projectId}&taskId=`));
  // Node 05 remains a legitimate parallel task. This proves number/month absence stays absence.
  const supplierKey = randomUUID();
  const supplier = await post(page, '/suppliers', { supplierCode: `CR-${run}`, supplierName: `隔离验收合成供应商-${run}`, contactName: '', contactPhone: '', status: 'ACTIVE' }, evidence.network, supplierKey);
  let procurement = await post(page, `/projects/${projectId}/paint-procurements`, { supplierId: supplier.id, procurementCode: `CR-${run}`, materialName: '隔离验收合成涂料', batchNo: `CR-${run}`, quantity: 1, unit: 'kg', arrivalDate: date, note: '隔离验收合成采购到货事实' }, evidence.network);
  const procurementId = procurement.items.find((item: { procurementCode: string }) => item.procurementCode === `CR-${run}`).id;
  procurement = await post(page, `/projects/${projectId}/paint-procurements/${procurementId}/order`, undefined, evidence.network);
  expect(procurement.items.find((item: { id: string }) => item.id === procurementId).status).toBe('ORDERED');
  procurement = await post(page, `/projects/${projectId}/paint-procurements/${procurementId}/mark-arrived`, undefined, evidence.network);
  expect(procurement.items.find((item: { id: string }) => item.id === procurementId).status).toBe('ARRIVED');
  await post(page, `/projects/${projectId}/paint-procurements/complete-task`, undefined, evidence.network);
  const before = await get(page, `/projects/${projectId}/standard-boards`, evidence.network);
  expect(before.activeStandardBoardTask).toBeTruthy(); expect(before.procurementCompleted).toBe(true);
  expect(before.project.primaryColor.id).toBe(colorId); expect(before.items).toHaveLength(0);
  await page.goto(`/projects/${projectId}/standard-boards`);
  const form = page.locator('section.page-card').filter({ has: page.getByRole('heading', { name: '制板标定', exact: true }) });
  await expect(form.getByRole('button', { name: '保存并加入颜色清单', exact: true })).toBeEnabled();
  await form.getByLabel('色板编号', { exact: true }).fill(`合成灰绿/CR-${run}`);
  const sample = before.sampleOptions.find((item: { sampleNo: string }) => item.sampleNo === `CR-${run}`);
  expect(sample).toBeTruthy(); await form.getByRole('combobox', { name: '关联样板', exact: true }).selectOption(sample.id);
  await form.getByLabel('制作日期', { exact: true }).fill(date);
  await form.getByLabel('制作单位', { exact: true }).fill('隔离验收合成制作单位');
  await form.getByLabel('漆种', { exact: true }).fill('合成金属漆');
  await form.getByLabel('测量条件', { exact: true }).fill('合成条件 D65 / 10°');
  await form.getByLabel('原控制限', { exact: true }).fill('合成原控制限 ΔE ≤ 1.0；不替代来源控制限');
  await form.getByLabel('测量日期（原文）', { exact: true }).fill('2026-10-07');
  await form.getByLabel('第1行角度', { exact: true }).fill('15°');
  await form.getByLabel('第1行L', { exact: true }).fill('51.25');
  await form.getByLabel('第1行a', { exact: true }).fill('-0.6');
  // b and the second angle's a intentionally remain null.
  await form.getByRole('button', { name: '增加角度', exact: true }).click();
  await form.getByLabel('第2行角度', { exact: true }).fill('45°');
  await form.getByLabel('第2行L', { exact: true }).fill('43.10');
  await form.getByLabel('第2行b', { exact: true }).fill('2.05');
  await form.getByLabel('版本说明', { exact: true }).fill('隔离验收合成初始标准');
  await form.getByLabel('制板备注', { exact: true }).fill('入清单与量产许可分开核验。');
  for (const width of [1440, 1024, 390]) await screenshot(page, info, 'board-standard-draft', width, width === 390 ? 844 : 900);
  await page.setViewportSize({ width: 1440, height: 900 });
  const publicationRequest = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/standard-boards/save-and-publish'));
  await form.getByRole('button', { name: '保存并加入颜色清单', exact: true }).click();
  const publicationBody = (await publicationRequest).postDataJSON();
  await expect(form.getByRole('status')).toContainText('标准 V1 已保存并在颜色清单读回');
  const published = await get<Detail>(page, `/color-register/${colorId}`, evidence.network);
  const boards = await get(page, `/projects/${projectId}/standard-boards`, evidence.network);
  expect(published.id).toBe(candidate.id); expect(published.registerStatus).toBe('LISTED'); expect(published.productionApprovalStatus).toBe('NOT_APPROVED');
  expect(published.formalCode).toBeNull(); expect(published.registerMonth).toBeNull(); expect(published.versionsTotal).toBe(1);
  expect(published.versions[0]!.measurements).toMatchObject([{ angle: '15°', l: '51.25', a: '-0.6', b: null }, { angle: '45°', l: '43.10', a: null, b: '2.05' }]);
  expect(boards.items).toHaveLength(1); expect(boards.items[0]).toMatchObject({ colorId, colorVersionId: published.currentStandardVersionId, status: 'CREATED' });
  expect(boards.activeStandardBoardTask.id).toBe(before.activeStandardBoardTask.id);
  const replay = await post(page, `/projects/${projectId}/standard-boards/save-and-publish`, publicationBody, evidence.network);
  expect(replay.idempotentReplay).toBe(true); expect(replay.colorId).toBe(colorId); expect(replay.boardId).toBe(boards.items[0].id);
  expect((await get(page, `/projects/${projectId}/standard-boards`, evidence.network)).items).toHaveLength(1);
  expect((await get<Detail>(page, `/color-register/${colorId}`, evidence.network)).versionsTotal).toBe(1);
  const logs = await get(page, `/projects/${projectId}/logs?page=1&pageSize=50`, evidence.network);
  expect(JSON.stringify(logs)).toContain('STANDARD_BOARD_CREATED'); expect(JSON.stringify(logs)).toContain('COLOR_STANDARD_PUBLISHED');
  await page.goto('/admin/color-database'); await filter(page, name, base.id);
  await expect(page.locator('.cr-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.cr-table tbody')).toContainText('已入清单'); await expect(page.locator('.cr-table tbody')).toContainText('未获准量产');
  await page.reload(); await filter(page, name, base.id); await expect(page.locator('.cr-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '查看详情', exact: true }).click();
  await page.getByRole('button', { name: '更正标准并保留历史', exact: true }).click();
  await page.getByRole('dialog').getByLabel('第1行L', { exact: true }).fill('51.50');
  await page.getByRole('dialog').getByLabel('更正原因', { exact: true }).fill('隔离验收合成复测更正，原版本保留');
  const correctionRequest = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith(`/color-register/${colorId}/standards`));
  await page.getByRole('button', { name: '保存为新标准版本', exact: true }).click();
  const correctionBody = (await correctionRequest).postDataJSON();
  await expect(page.getByRole('dialog').getByText('版本 2', { exact: true })).toBeVisible();
  const corrected = await get<Detail>(page, `/color-register/${colorId}`, evidence.network);
  expect(corrected.versionsTotal).toBe(2); expect(corrected.versions.find(version => version.id === published.currentStandardVersionId)).toEqual(published.versions[0]);
  expect(corrected.versions[0]!.measurements[0]!.l).toBe('51.50'); expect(corrected.versions[0]!.measurements[0]!.b).toBeNull();
  expect(corrected.productionApprovalStatus).toBe('NOT_APPROVED'); expect(corrected.production).toEqual(published.production);
  const correctedReplay = await post(page, `/color-register/${colorId}/standards`, correctionBody, evidence.network);
  expect(correctedReplay.versionId).toBe(corrected.currentStandardVersionId);
  expect((await get<Detail>(page, `/color-register/${colorId}`, evidence.network)).versionsTotal).toBe(2);
  const unchangedBoard = await get(page, `/projects/${projectId}/standard-boards`, evidence.network);
  expect(unchangedBoard.items[0].colorVersionId).toBe(published.currentStandardVersionId);
  for (const width of [1440, 1024, 390]) await screenshot(page, info, 'register-correction-history', width, width === 390 ? 844 : 900);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const beforeExisting = await get<List>(page, `/color-register?search=${encodeURIComponent(name)}&pageSize=20`, evidence.network);
  const linked = await createProject(page, { name, baseId: base.id, existingId: colorId, date }, evidence.network);
  expect(linked.id).not.toBe(projectId); expect(linked.primaryColorId).toBe(colorId);
  const afterExisting = await get<List>(page, `/color-register?search=${encodeURIComponent(name)}&pageSize=20`, evidence.network);
  expect(afterExisting.total).toBe(beforeExisting.total); expect(afterExisting.items.map(row => row.id)).toEqual([colorId]);
  const linkedDetail = await get<Detail>(page, `/color-register/${colorId}`, evidence.network);
  expect(new Set(linkedDetail.projects.map(item => item.id))).toEqual(new Set([projectId, linked.id]));
  expect(linkedDetail.versions).toEqual(corrected.versions); expect(linkedDetail.registerMonth).toBeNull();
  const storedProject = await get(page, `/projects/${projectId}`, evidence.network);
  expect(storedProject.primaryColorId).toBe(colorId); expect(storedProject.ownerUserId).toBe(a.memberA!.id);
  expect(evidence.errors).toEqual([]); expect(evidence.consoleErrors).toEqual([]);
  await persist('register-project-browser.json', { expectedCommit, origin, projectId, linkedProjectId: linked.id, colorId, baseId: base.id, initialVersionId: published.currentStandardVersionId, correctedVersionId: corrected.currentStandardVersionId, boardId: boards.items[0].id, taskId: before.activeStandardBoardTask.id, candidateFormalCode: candidate.formalCode, registerMonth: linkedDetail.registerMonth, registerStatus: linkedDetail.registerStatus, productionApprovalStatus: linkedDetail.productionApprovalStatus, network: evidence.network, errors: evidence.errors, consoleErrors: evidence.consoleErrors, staticResources: [...evidence.resources] }, info);
});

test('Color register: unapproved account negative, empty query and explicitly injected read error', async ({ page, browser }, info) => {
  test.setTimeout(120000);
  const a = await accounts(); const evidence = monitor(page);
  await login(page, a.memberB!); await identify(page, info);
  const row = (await get<List>(page, '/color-register?pageSize=1', evidence.network)).items[0]!;
  const blockedContext = await browser.newContext({ baseURL: origin }); const blocked = await blockedContext.newPage();
  await login(blocked, a.unapproved!, /\/pending-access$/);
  const deniedRead = await blocked.request.get('/api/color-register'); expect(deniedRead.status()).toBe(403);
  const deniedWrite = await blocked.request.patch('/api/color-register/notes', { headers: { Origin: origin }, data: { operationId: randomUUID(), items: [{ id: row.id, expectedRevision: row.revision, note: '不得保存的合成越权备注' }] } });
  expect(deniedWrite.status()).toBe(403); await blockedContext.close();
  expect((await get<Detail>(page, `/color-register/${row.id}`, evidence.network)).revision).toBe(row.revision);
  await page.goto('/admin/color-database'); await filter(page, `不存在的合成检索-${Date.now()}`);
  await expect(page.getByRole('heading', { name: '没有符合条件的颜色记录', exact: true })).toBeVisible();
  for (const width of [1440, 1024, 390]) await screenshot(page, info, 'register-empty-real-query', width, width === 390 ? 844 : 900);
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await expect(page.locator('.cr-table tbody tr').first()).toBeVisible();
  expect(evidence.errors).toEqual([]); expect(evidence.consoleErrors).toEqual([]);
  // The following response is deliberately injected for the error-state screenshot only.
  const beforeError = evidence.consoleErrors.length;
  const pattern = /\/api\/color-register(?:\?|$)/;
  await page.route(pattern, route => route.fulfill({ status: 503, json: { message: '隔离验收注入：颜色清单暂时读取失败' } }));
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.locator('.cr-list-card [role=alert]')).toContainText('隔离验收注入');
  await screenshot(page, info, 'register-error-injected-503', 1440);
  await page.unroute(pattern);
  await page.getByRole('button', { name: '重新读取', exact: true }).click();
  await expect(page.locator('.cr-list-card [role=alert]')).toHaveCount(0);
  await expect(page.locator('.cr-table tbody tr').first()).toBeVisible();
  expect(evidence.errors).toEqual([]);
  await persist('register-boundary-browser.json', { expectedCommit, origin, deniedRead: deniedRead.status(), deniedWrite: deniedWrite.status(), emptyQuery: 'real API with no matching rows', errorInjection: { status: 503, purpose: 'error-state UX only', consoleErrors: evidence.consoleErrors.slice(beforeError) }, network: evidence.network, pageErrors: evidence.errors }, info);
});


test('Color register: history pagination protects an unsaved correction', async ({ page }, info) => {
  test.setTimeout(120000);
  const evidence = monitor(page); const a = await accounts();
  await login(page, a.memberB!); await identify(page, info);
  const previous = JSON.parse(await readFile(path.join(runtime!, 'pagination-fixture.json'), 'utf8'));
  let detail = await get<Detail>(page, `/color-register/${previous.colorId}`, evidence.network);
  while (detail.versionsTotal < 21) {
    const current = detail.versions[0]!;
    await post(page, `/color-register/${detail.id}/standards`, { operationId: randomUUID(), expectedRevision: detail.revision,
      boardCode: current.boardCode, technicalData: { measurements: current.measurements, conditions: current.conditions,
        originalControlLimits: current.originalControlLimits, manufacturer: current.manufacturer, paintType: current.paintType,
        measurementDate: current.measurementDate, issueDate: current.issueDate, expiryDate: current.expiryDate,
        changeSummary: `合成分页回归版本 ${detail.versionsTotal + 1}` } }, evidence.network);
    detail = await get<Detail>(page, `/color-register/${previous.colorId}`, evidence.network);
  }
  await page.goto(`/admin/color-database?colorId=${detail.id}`);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '更正标准并保留历史', exact: true }).click();
  await dialog.getByLabel('更正原因', { exact: true }).fill('合成未保存更正草稿，翻页不得丢失');
  await page.screenshot({ path: info.outputPath('history-unsaved-before-page.png'), fullPage: true });
  await expect(dialog.getByRole('button', { name: '下一页版本', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('更正原因', { exact: true })).toHaveValue('合成未保存更正草稿，翻页不得丢失');
  page.once('dialog', dialog => dialog.accept());
  await dialog.getByRole('button', { name: '取消更正', exact: true }).click();
  await dialog.getByRole('button', { name: '下一页版本', exact: true }).click();
  await expect(dialog).toContainText('版本第 2 / 2 页');
  await dialog.getByRole('button', { name: '上一页版本', exact: true }).click();
  await expect(dialog).toContainText('版本第 1 / 2 页');
  expect(evidence.errors).toEqual([]); expect(evidence.consoleErrors).toEqual([]);
  await persist('register-pagination-browser.json', { expectedCommit, origin, colorId: detail.id, versions: detail.versionsTotal, draftProtected: true, network: evidence.network, errors: evidence.errors }, info);
});


test('Color register: existing project explicitly links the exact identity and preserves its author', async ({ page }, info) => {
  const evidence = monitor(page); const a = await accounts();
  await login(page, a.memberB!); await identify(page, info);
  const fixture = JSON.parse(await readFile(path.join(runtime!, 'legacy-link-fixture.json'), 'utf8'));
  const prior = JSON.parse(await readFile(path.join(runtime!, 'register-project-browser.json'), 'utf8'));
  const color = await get<Detail>(page, `/color-register/${prior.colorId}`, evidence.network);
  const before = await get(page, `/projects/${fixture.projectId}`, evidence.network);
  expect(before.primaryColorId).toBeNull();
  await page.goto(`/projects/${fixture.projectId}/standard-boards`);
  const form = page.locator('section.page-card').filter({ has: page.getByRole('heading', { name: '核对现有项目的颜色身份', exact: true }) });
  await form.getByRole('combobox', { name: '生产基地', exact: true }).selectOption(color.base!.id);
  await form.getByLabel('查找已有颜色', { exact: true }).fill(color.name);
  await expect(form.getByRole('radio')).toHaveCount(1); await form.getByRole('radio').check();
  await form.getByRole('checkbox').check();
  const request = page.waitForRequest(req => req.method() === 'POST' && new URL(req.url()).pathname === `/api/projects/${fixture.projectId}/color-link`);
  await form.getByRole('button', { name: '保存颜色关联', exact: true }).click();
  const body = (await request).postDataJSON();
  await expect(page.getByRole('heading', { name: '核对现有项目的颜色身份', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(`关联颜色：${color.name} · ${color.base!.name}`, { exact: true })).toBeVisible();
  const after = await get(page, `/projects/${fixture.projectId}`, evidence.network);
  expect(after.id).toBe(before.id); expect(after.ownerUserId).toBe(before.ownerUserId); expect(after.name).toBe(before.name); expect(after.createdAt).toBe(before.createdAt); expect(after.primaryColorId).toBe(color.id);
  expect((await post(page, `/projects/${fixture.projectId}/color-link`, body, evidence.network)).idempotentReplay).toBe(true);
  const final = await get<Detail>(page, `/color-register/${color.id}`, evidence.network);
  expect(final.versions).toEqual(color.versions); expect(final.revision).toBe(color.revision);
  expect(final.projects.map(item => item.id)).toContain(fixture.projectId);
  await screenshot(page, info, 'existing-project-linked', 1440);
  await persist('register-existing-link-browser.json', { expectedCommit, origin, projectId: fixture.projectId, colorId: color.id, identityAndAuthorPreserved: true, network: evidence.network, errors: evidence.errors }, info);
});
