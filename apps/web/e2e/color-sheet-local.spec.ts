import { test, expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import ExcelJS from 'exceljs';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Real loopback runtime only. No positive-path mocks or application-facade writes.
const ORIGIN = 'http://127.0.0.1:3370';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const expectedCommit = process.env.COLOR_SHEET_EXPECTED_COMMIT;
type Account = { username: string; password: string; id: string };
type FixtureRow = { id: string; name: string; baseId: string; baseName: string; status: 'LISTED'; boardCode?: string };
type Fixture = { runId: string; origin: string; sourceExpectedCount: number; search: string; rows: FixtureRow[]; candidateId?: string };
type Row = { id: string; name: string; base: { id: string; name: string } | null; revision: number; note: string | null; boardCode: string | null; manufacturer: string | null; paintType: string | null; formalCode: string | null; registerMonth: string | null; registerStatus: string; sourceSummary: string | null; currentStandardVersionId: string | null; productionApprovalStatus: string };
type Detail = Row & { versionsTotal: number; projects: Array<{ id: string }>; sources: unknown[] };
type SheetCommand = { operationId: string; reason?: string; items: Array<{ id: string; expectedRevision: number; changes: Record<string, unknown> }> };
type CanvasSample = { text: string; x: number; y: number; width: number; fontSize: number; at: number };
type CanvasTracked = CanvasSample & { canvas: HTMLCanvasElement; ratioX: number; ratioY: number };
type ProbeWindow = Window & { __colorSheetCanvasProbe?: Record<string, CanvasTracked> };
type Events = { network: Array<{ method: string; path: string; status: number }>; errors: string[]; consoleErrors: Array<{ text: string; url: string }>; resources: Set<string>; writeCommands: SheetCommand[]; guardErrors: string[] };
const tracked = new WeakMap<Page, Events>();
test.use({ trace: 'off', video: 'off' });
test.describe.configure({ mode: 'serial' });

async function fixture(): Promise<Fixture> {
  if (!process.env.COLOR_SHEET_FIXTURE_FILE) throw new Error('COLOR_SHEET_FIXTURE_FILE is required.');
  const data = JSON.parse(await readFile(process.env.COLOR_SHEET_FIXTURE_FILE, 'utf8')) as Fixture;
  expect(data.origin).toBe(ORIGIN); expect(data.runId).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(data.sourceExpectedCount).toBe(89); expect(data.rows).toHaveLength(2);
  expect(new Set(data.rows.map(row => row.id)).size).toBe(2);
  expect(new Set(data.rows.map(row => row.baseId)).size).toBe(2);
  expect(data.rows[0]!.name).toBe(data.rows[1]!.name);
  expect(data.rows.every(row => row.name.includes(data.search))).toBe(true);
  return data;
}
async function accounts(): Promise<Record<string, Account>> {
  if (!process.env.COLOR_SHEET_ACCOUNTS_FILE) throw new Error('COLOR_SHEET_ACCOUNTS_FILE is required.');
  // Never print, attach or persist credentials/session state.
  return JSON.parse(await readFile(process.env.COLOR_SHEET_ACCOUNTS_FILE, 'utf8')) as Record<string, Account>;
}
function observe(page: Page): Events {
  const events: Events = { network: [], errors: [], consoleErrors: [], resources: new Set(), writeCommands: [], guardErrors: [] };
  tracked.set(page, events);
  page.on('pageerror', error => events.errors.push(error.message));
  page.on('console', entry => { if (entry.type() === 'error') events.consoleErrors.push({ text: entry.text(), url: entry.location().url }); });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === ORIGIN && url.pathname.startsWith('/api/')) events.network.push({ method: response.request().method(), path: url.pathname, status: response.status() });
    if (url.pathname.startsWith('/_next/static/')) events.resources.add(url.pathname);
  });
  return events;
}
async function guardWrites(context: BrowserContext, data: Fixture, events: Events) {
  const allowed = new Set([...data.rows.map(row => row.id), ...(data.candidateId ? [data.candidateId] : [])]);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.protocol === 'blob:' || url.protocol === 'data:') { await route.continue(); return; }
    if (url.origin !== ORIGIN) { events.guardErrors.push(`Blocked unexpected origin: ${url.origin}`); await route.abort('blockedbyclient'); return; }
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method()) || ['/api/auth/login', '/api/auth/logout'].includes(url.pathname)) { await route.continue(); return; }
    if (request.method() === 'PATCH' && url.pathname === '/api/color-register/sheet') {
      const body = request.postDataJSON() as SheetCommand;
      if (Array.isArray(body.items) && body.items.length > 0 && body.items.every(item => allowed.has(item.id))) { events.writeCommands.push(body); await route.continue(); return; }
    }
    events.guardErrors.push(`Blocked non-fixture business write: ${request.method()} ${url.pathname}`);
    await route.abort('blockedbyclient');
  });
}
async function login(page: Page, account: Account, destination: RegExp = /\/dashboard$/) {
  expect(account).toBeTruthy();
  await page.goto('/login');
  await page.getByLabel('工号', { exact: false }).fill(account.username);
  await page.getByLabel('密码', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(destination);
}
async function get<T>(page: Page, pathname: string): Promise<T> {
  expect(pathname.startsWith('/api/')).toBe(true);
  const response = await page.request.get(ORIGIN + pathname, { headers: { 'Cache-Control': 'no-cache' } });
  expect(response.status(), `GET ${pathname}`).toBe(200);
  return response.json() as Promise<T>;
}
async function identify(page: Page, info: TestInfo) {
  expect(info.project.use.baseURL).toBe(ORIGIN);
  expect(expectedCommit).toMatch(/^[a-f0-9]{40}$/);
  for (const pathname of ['/api/health', '/build-info']) {
    const response = await page.request.get(ORIGIN + pathname, { headers: { 'Cache-Control': 'no-cache' } });
    expect(response.status()).toBe(200); expect((await response.json()).runtimeCommit).toBe(expectedCommit);
  }
  const session = await get<{ mockEnabled: boolean; feishuEnabled: boolean; user: { authSource: string; teamAccessApproved: boolean; isSystemAdmin: boolean } }>(page, '/api/auth/session');
  expect(session.mockEnabled).toBe(false); expect(session.feishuEnabled).toBe(false);
  expect(session.user).toMatchObject({ authSource: 'local', teamAccessApproved: true, isSystemAdmin: false });
}
async function allRows(page: Page) {
  const rows: Row[] = []; let totalPages = 1;
  for (let number = 1; number <= totalPages; number++) {
    const result = await get<{ items: Row[]; totalPages: number }>(page, `/api/color-register?page=${number}&pageSize=50`);
    expect(result.totalPages).toBeLessThanOrEqual(20); totalPages = result.totalPages; rows.push(...result.items);
  }
  expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
  return rows;
}
async function sourceFingerprint(page: Page, data: Fixture) {
  const rows = (await allRows(page)).filter(row => row.sourceSummary !== null).sort((a, b) => a.id.localeCompare(b.id));
  expect(rows).toHaveLength(data.sourceExpectedCount);
  expect(rows.some(row => data.rows.some(synthetic => synthetic.id === row.id))).toBe(false);
  return { count: rows.length, ids: rows.map(row => row.id), sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
}
async function detail(page: Page, id: string) { return get<Detail>(page, `/api/color-register/${encodeURIComponent(id)}`); }
async function safePatch(page: Page, data: Fixture, body: SheetCommand, expectedStatus: number) {
  const allowed = new Set([...data.rows.map(row => row.id), ...(data.candidateId ? [data.candidateId] : [])]);
  expect(body.items.every(item => allowed.has(item.id)), 'Never write an imported source record').toBe(true);
  const response = await page.request.patch(ORIGIN + '/api/color-register/sheet', { headers: { Origin: ORIGIN, 'Idempotency-Key': body.operationId }, data: body });
  tracked.get(page)?.network.push({ method: 'PATCH', path: '/api/color-register/sheet', status: response.status() });
  expect(response.status()).toBe(expectedStatus);
  return response;
}

/** Read-only canvas instrumentation supplies measured coordinates, not private editor commands. */
async function probeCanvas(page: Page) {
  await page.addInitScript(() => {
    const target = window as ProbeWindow;
    target.__colorSheetCanvasProbe = {};
    type Cached = { text: string; x: number; y: number; width: number; fontSize: number; at: number };
    const caches = new WeakMap<object, Map<string, Cached>>();
    const remember = (context: CanvasRenderingContext2D, value: Cached) => {
      let entries = caches.get(context.canvas); if (!entries) { entries = new Map(); caches.set(context.canvas, entries); }
      entries.set(value.text, value);
      if (context.canvas instanceof HTMLCanvasElement && context.canvas.closest('[data-testid="business-sheet"]')) {
        const rect = context.canvas.getBoundingClientRect();
        if (rect.width && rect.height) target.__colorSheetCanvasProbe![value.text] = { ...value, canvas: context.canvas, ratioX: value.x / context.canvas.width, ratioY: value.y / context.canvas.height };
      }
    };
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (text.length < 2000) {
        const point = this.getTransform().transformPoint({ x, y });
        remember(this, { text, x: point.x, y: point.y, width: this.measureText(text).width, fontSize: Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 13), at: performance.now() });
      }
      return maxWidth === undefined ? original.call(this, text, x, y) : original.call(this, text, x, y, maxWidth);
    };
    // Univer paints text into detached tile caches, then blits those tiles onto
    // the visible canvas. Follow only those actual draw operations.
    const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (source: CanvasImageSource, ...coords: number[]) {
      Reflect.apply(originalDraw, this, [source, ...coords]);
      const entries = caches.get(source); if (!entries || !(source instanceof HTMLCanvasElement)) return;
      const [sx, sy, sw, sh, dx, dy, dw, dh] = coords.length === 8 ? coords : [0, 0, source.width, source.height, coords[0]!, coords[1]!, coords[2] ?? source.width, coords[3] ?? source.height];
      for (const entry of [...entries.values()]) {
        if (entry.x < sx! || entry.x > sx! + sw! || entry.y < sy! || entry.y > sy! + sh!) continue;
        const point = this.getTransform().transformPoint({ x: dx! + (entry.x - sx!) * dw! / sw!, y: dy! + (entry.y - sy!) * dh! / sh! });
        remember(this, { ...entry, x: point.x, y: point.y });
      }
    };
  });
}
async function sample(page: Page, text: string): Promise<CanvasSample> {
  await expect.poll(() => page.evaluate(value => Boolean((window as ProbeWindow).__colorSheetCanvasProbe?.[value]?.canvas.isConnected), text)).toBe(true);
  return page.evaluate(value => {
    const { canvas, ratioX, ratioY, ...record } = (window as ProbeWindow).__colorSheetCanvasProbe![value]!;
    const rect = canvas.getBoundingClientRect();
    return { ...record, x: rect.x + ratioX * rect.width, y: rect.y + ratioY * rect.height };
  }, text);
}
async function canvasPoint(page: Page, row: FixtureRow, fieldLabel = '备注') {
  const header = await sample(page, fieldLabel), base = await sample(page, row.baseName);
  const point = { x: header.x + 24, y: base.y - Math.min(6, base.fontSize / 3) };
  const box = await page.getByTestId('business-sheet').boundingBox(); expect(box).not.toBeNull();
  expect(point.x).toBeGreaterThan(box!.x); expect(point.x).toBeLessThan(box!.x + box!.width);
  expect(point.y).toBeGreaterThan(box!.y); expect(point.y).toBeLessThan(box!.y + box!.height);
  return point;
}
async function openSheet(page: Page, data: Fixture) {
  await page.goto('/admin/color-database');
  await expect(page.getByTestId('color-register-page')).toHaveAttribute('data-source', 'database');
  await page.evaluate(() => { (window as ProbeWindow).__colorSheetCanvasProbe = {}; });
  await page.getByPlaceholder('搜索颜色、编号或色板', { exact: true }).fill(data.search);
  await page.getByRole('combobox', { name: '清单状态筛选', exact: true }).selectOption('LISTED');
  await expect(page.locator('.cs-engine-loading')).toHaveCount(0, { timeout: 60000 });
  await expect(page.locator('.cs-statusbar')).toContainText('2 条记录');
  for (const row of data.rows) await sample(page, row.baseName);
  const result = (await allRows(page)).filter(row => data.rows.some(item => item.id === row.id));
  expect(result).toHaveLength(2);
  expect(result.every(row => row.sourceSummary === null && row.registerStatus === 'LISTED')).toBe(true);
}
async function selectCanvas(page: Page, row: FixtureRow) {
  const current = await detail(page, row.id);
  const point = await canvasPoint(page, row);
  await page.mouse.click(point.x, point.y);
  await expect(page.getByLabel('当前单元格', { exact: true })).toHaveValue(current.note ?? '');
  return point;
}
async function editCanvas(page: Page, row: FixtureRow, value: string) {
  const point = await selectCanvas(page, row);
  await page.mouse.dblclick(point.x, point.y);
  await expect(page.locator('[id="__editor___INTERNAL_EDITOR__DOCS_NORMAL"][contenteditable="true"]')).toBeFocused();
  await page.keyboard.press(`${modifier}+A`);
  await page.keyboard.insertText(value);
  await page.keyboard.press('Enter');
  await expect(page.locator('.cs-save-bar')).toBeVisible();
  // Read back through the existing accessible editor; input is not used for the write.
  const after = await canvasPoint(page, row);
  await page.mouse.click(after.x, after.y);
  await expect(page.getByLabel('当前单元格', { exact: true })).toHaveValue(value);
  await expect(page.getByRole('button', { name: '保存修改', exact: true })).toBeEnabled();
}
async function save(page: Page, reason?: string) {
  if (reason) await page.getByLabel('标准更正原因', { exact: true }).fill(reason);
  const response = page.waitForResponse(result => result.request().method() === 'PATCH' && new URL(result.url()).pathname === '/api/color-register/sheet');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.locator('.cs-save-state')).toHaveText('已同步');
  await expect(page.locator('.cs-statusbar')).toContainText('服务器已确认');
}
async function screenshot(page: Page, info: TestInfo, name: string, width: number) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : width === 1280 ? 800 : 900 });
  await expect(page.locator('.cs-engine-loading')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: width === 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No outer-page overflow at ${width}`).toBe(true);
}
async function readDownloadedWorkbook(file: string) { const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(file); return workbook; }
async function downloadTemplate(page: Page, info: TestInfo, name: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 Excel', exact: true }).click();
  const file = info.outputPath(name); await (await download).saveAs(file); return file;
}
async function importPreview(page: Page, file: string) {
  await page.getByRole('button', { name: '导入 Excel', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '导入 Excel · 预览变更' });
  await dialog.getByLabel('选择 Excel 文件', { exact: true }).setInputFiles(file);
  await expect(dialog.getByRole('button', { name: '预览变更', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '预览变更', exact: true }).click();
  return dialog;
}
async function verifyNoSourceChanges(page: Page, data: Fixture, before: Awaited<ReturnType<typeof sourceFingerprint>>, info: TestInfo) {
  const after = await sourceFingerprint(page, data);
  expect(after).toEqual(before);
  await writeFile(info.outputPath('source-read-only-comparison.json'), JSON.stringify({ expectedCommit, origin: ORIGIN, sourceRecordCount: after.count, beforeSha256: before.sha256, afterSha256: after.sha256, unchanged: true }, null, 2), { mode: 0o600 });
}
test.afterEach(async ({ page }, info) => {
  const events = tracked.get(page); if (!events) return;
  await writeFile(info.outputPath('sanitized-browser-events.json'), JSON.stringify({ expectedCommit, origin: ORIGIN, test: info.title, status: info.status, network: events.network, pageErrors: events.errors, consoleErrors: events.consoleErrors, staticResources: [...events.resources], syntheticWriteCommands: events.writeCommands, guardErrors: events.guardErrors }, null, 2), { mode: 0o600 });
});

test('Synthetic color sheet: actual canvas, clipboard batch, undo, sorted ID, XLSX and responsive detail', async ({ page, context }, info) => {
  test.setTimeout(240000);
  const data = await fixture(), a = await accounts(), events = observe(page);
  const runLabel = `${data.runId}-${Date.now()}`;
  await guardWrites(context, data, events); await probeCanvas(page);
  await login(page, a.memberA!); await identify(page, info);
  const sourceBefore = await sourceFingerprint(page, data);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  await page.goto('/admin/color-database');
  await expect(page.getByTestId('business-sheet')).toBeVisible();
  await expect(page.locator('.cs-engine-loading')).toHaveCount(0, { timeout: 60000 });
  await expect(page.getByRole('complementary', { name: '记录详情' })).toContainText('来源行');
  await screenshot(page, info, 'source-records-main-and-detail', 1440);
  await page.getByPlaceholder('搜索颜色、编号或色板', { exact: true }).fill(`不存在的筛选_${runLabel}`);
  await expect(page.getByRole('heading', { name: '没有符合条件的颜色记录', exact: true })).toBeVisible();
  await screenshot(page, info, 'empty-filter-state', 1280);
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await expect(page.locator('.cs-engine-loading')).toHaveCount(0, { timeout: 60000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('link', { name: '新建颜色项目', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/new$/);
  await expect(page.getByRole('heading', { name: '新建颜色项目', exact: true })).toBeVisible();
  await openSheet(page, data);
  const originalDetails = await Promise.all(data.rows.map(row => detail(page, row.id)));
  const first = data.rows[0]!, original = await detail(page, first.id);
  const note = `合成画布编辑 ${runLabel} 中文 ΔE ≤ 1.0`;
  await editCanvas(page, first, note); await save(page);
  const saved = await detail(page, first.id);
  expect(saved.note).toBe(note); expect(saved.revision).toBe(original.revision + 1);
  expect(saved.projects).toEqual(original.projects); expect(saved.versionsTotal).toBe(original.versionsTotal);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); await save(page);
  const undone = await detail(page, first.id);
  expect(undone.note).toBe(original.note); expect(undone.revision).toBe(saved.revision + 1);

  // Native Delete must clear the business value, and saved undo must create a new revision.
  await selectCanvas(page, first);
  await page.keyboard.press('Delete');
  await expect(page.locator('.cs-save-bar')).toBeVisible();
  await save(page);
  const cleared = await detail(page, first.id);
  expect(cleared.note).toBeNull(); expect(cleared.revision).toBe(undone.revision + 1);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); await save(page);
  expect((await detail(page, first.id)).note).toBe(original.note);

  // Single-cell paste must honor the text column instead of coercing a date to an Excel serial.
  await selectCanvas(page, first);
  await page.evaluate(() => navigator.clipboard.writeText('2026-10'));
  await page.keyboard.press(`${modifier}+V`);
  await expect(page.getByRole('button', { name: '保存修改', exact: true })).toBeEnabled();
  await save(page); expect((await detail(page, first.id)).note).toBe('2026-10');
  await selectCanvas(page, first); await page.keyboard.press(`${modifier}+C`);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('2026-10');
  await page.getByRole('button', { name: '撤销', exact: true }).click(); await save(page);
  expect((await detail(page, first.id)).note).toBe(original.note);

  // Clear source-order assumptions: determine the two visible rows from real canvas text.
  const positions = await Promise.all(data.rows.map(async row => ({ row, position: await sample(page, row.baseName) })));
  positions.sort((left, right) => left.position.y - right.position.y);
  const top = positions[0]!.row, bottom = positions[1]!.row;
  await selectCanvas(page, top);
  const batchNotes = [`合成粘贴第一行 ${runLabel}`, `合成粘贴第二行 ${runLabel}`];
  const suffix = Date.now().toString().slice(-6);
  const codes = [`00012345678901${suffix}`, `00098765432109${suffix}`];
  await page.evaluate(text => navigator.clipboard.writeText(text), `${batchNotes[0]}\t${codes[0]}\n${batchNotes[1]}\t${codes[1]}`);
  await page.keyboard.press(`${modifier}+V`);
  await expect(page.locator('.cs-save-bar')).toContainText('2 条记录待保存');
  await save(page, `合成浏览器验收更正 ${runLabel}`);
  const topAfter = await detail(page, top.id), bottomAfter = await detail(page, bottom.id);
  expect(topAfter).toMatchObject({ note: batchNotes[0], boardCode: codes[0] });
  expect(bottomAfter).toMatchObject({ note: batchNotes[1], boardCode: codes[1] });
  const replay = events.writeCommands.at(-1)!;
  await safePatch(page, data, replay, 200);
  expect((await detail(page, top.id)).revision).toBe(topAfter.revision);
  expect((await detail(page, bottom.id)).revision).toBe(bottomAfter.revision);

  await page.evaluate(() => { (window as ProbeWindow).__colorSheetCanvasProbe = {}; });
  await page.getByRole('combobox', { name: '整行排序', exact: true }).selectOption('baseName:asc');
  await expect(page.locator('.cs-engine-loading')).toHaveCount(0);
  const sortedNote = `合成排序后正确记录 ${runLabel}`;
  await editCanvas(page, bottom, sortedNote); await save(page);
  expect((await detail(page, bottom.id)).note).toBe(sortedNote);
  expect((await detail(page, top.id)).note).toBe(batchNotes[0]);
  await openSheet(page, data); // Real reload and business readback, not a local snapshot.
  await selectCanvas(page, bottom);
  await page.getByRole('button', { name: '查看业务详情与历史', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(sortedNote);
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('.cs-engine-loading')).toHaveCount(0);
  await selectCanvas(page, bottom);
  for (const width of [1440, 1280, 1024, 390]) await screenshot(page, info, 'main-sheet-and-record-detail', width);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape'); await expect(page.getByRole('complementary', { name: '记录详情' })).toHaveCount(0);
  await page.getByRole('button', { name: '记录详情', exact: true }).click();

  const exported = await downloadTemplate(page, info, 'system-template-downloaded.xlsx');
  const workbook = await readDownloadedWorkbook(exported), sheet = workbook.getWorksheet('颜色清单')!;
  const headers = (sheet.getRow(1).values as unknown[]).map(String);
  const idCol = headers.indexOf('记录ID'), noteCol = headers.indexOf('备注'), codeCol = headers.indexOf('色板编号');
  expect(idCol).toBeGreaterThan(0); expect(sheet.getColumn(idCol).hidden).toBe(true);
  const target = [2, 3].find(index => sheet.getCell(index, idCol).value === top.id)!;
  expect(target).toBeTruthy(); expect(sheet.getCell(target, codeCol).value).toBe(codes[0]);
  const importNote = `合成模板导回 ${runLabel}`;
  sheet.getCell(target, noteCol).value = importNote;
  const edited = info.outputPath('system-template-edited.xlsx'); await workbook.xlsx.writeFile(edited);
  let dialog = await importPreview(page, edited);
  await expect(dialog.locator('.cs-import-counts')).toContainText('更新 1');
  await expect(dialog.locator('.cs-import-counts')).toContainText('错误 0');
  await screenshot(page, info, 'template-import-preview', 1440);
  await dialog.getByRole('button', { name: '应用到待保存内容', exact: true }).click();
  await save(page); expect((await detail(page, top.id)).note).toBe(importNote);
  await openSheet(page, data); await selectCanvas(page, top);
  await expect(page.getByLabel('当前单元格', { exact: true })).toHaveValue(importNote);

  const noOp = await downloadTemplate(page, info, 'system-template-no-op.xlsx');
  dialog = await importPreview(page, noOp);
  await expect(dialog.locator('.cs-import-counts')).toContainText('更新 0');
  await expect(dialog.locator('.cs-import-counts')).toContainText('不变 2');
  await expect(dialog.getByRole('button', { name: '应用到待保存内容', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  const invalid = await readDownloadedWorkbook(noOp), invalidSheet = invalid.getWorksheet('颜色清单')!;
  const invalidHeaders = (invalidSheet.getRow(1).values as unknown[]).map(String);
  invalidSheet.getCell(2, invalidHeaders.indexOf('颜色名称')).value = '合成受控字段非法更名';
  invalidSheet.getCell(3, invalidHeaders.indexOf('备注')).value = '同批合法修改也须等待错误修正';
  const invalidFile = info.outputPath('system-template-readonly-rejected.xlsx'); await invalid.xlsx.writeFile(invalidFile);
  dialog = await importPreview(page, invalidFile);
  await expect(dialog.getByRole('alert')).toContainText('只读');
  await expect(dialog.locator('.cs-import-counts')).toContainText('更新 1');
  await expect(dialog.locator('.cs-import-counts')).toContainText('错误 1');
  await expect(dialog.getByRole('button', { name: '应用到待保存内容', exact: true })).toBeDisabled();
  await screenshot(page, info, 'template-readonly-error', 1280);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  expect((await detail(page, top.id)).note).toBe(importNote);
  expect((await detail(page, bottom.id)).note).toBe(sortedNote);
  const ordinary = new ExcelJS.Workbook(), ordinarySheet = ordinary.addWorksheet('普通清单');
  ordinarySheet.addRow(['颜色名称', '生产基地', '色板编号']);
  ordinarySheet.addRow(['普通表格待处理颜色', top.baseName, '000000789']);
  const ordinaryFile = info.outputPath('ordinary-preview-only.xlsx'); await ordinary.xlsx.writeFile(ordinaryFile);
  dialog = await importPreview(page, ordinaryFile);
  await expect(dialog.locator('.cs-import-counts')).toContainText('待处理 1');
  await expect(dialog.locator('.cs-import-table')).toContainText('普通表格待处理颜色');
  await expect(dialog.locator('.cs-import-table')).toContainText('000000789');
  await expect(dialog.getByRole('button', { name: '应用到待保存内容', exact: true })).toBeDisabled();
  await screenshot(page, info, 'ordinary-mapping-preview-only', 1440);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  for (const originalDetail of originalDetails) {
    const finalDetail = await detail(page, originalDetail.id);
    expect(finalDetail).toMatchObject({ name: originalDetail.name, base: originalDetail.base, formalCode: originalDetail.formalCode, registerStatus: originalDetail.registerStatus, productionApprovalStatus: originalDetail.productionApprovalStatus, projects: originalDetail.projects, sources: originalDetail.sources });
  }
  await verifyNoSourceChanges(page, data, sourceBefore, info);
  expect(events.guardErrors).toEqual([]); expect(events.errors).toEqual([]); expect(events.consoleErrors).toEqual([]);
  expect(events.network.some(item => item.method === 'PATCH' && item.path === '/api/color-register/sheet' && item.status === 200)).toBe(true);
});

test('Synthetic color sheet: visible two-account conflict, controlled-field API rejection, denied account and snapshot boundary', async ({ page, context, browser }, info) => {
  test.setTimeout(150000);
  const data = await fixture(), a = await accounts(), events = observe(page);
  await guardWrites(context, data, events); await probeCanvas(page); await login(page, a.memberA!); await identify(page, info);
  const sourceBefore = await sourceFingerprint(page, data);
  await openSheet(page, data);
  const row = data.rows[0]!, initial = await detail(page, row.id), localNote = `本次未保存 ${data.runId}`, otherNote = `另一成员新值 ${data.runId}`;
  await editCanvas(page, row, localNote);
  const otherContext = await browser.newContext({ baseURL: ORIGIN }), otherPage = await otherContext.newPage();
  const otherEvents = observe(otherPage); await guardWrites(otherContext, data, otherEvents);
  try {
    await login(otherPage, a.memberB!);
    await safePatch(otherPage, data, { operationId: randomUUID(), items: [{ id: row.id, expectedRevision: initial.revision, changes: { note: otherNote } }] }, 200);
    const conflictResponse = page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === '/api/color-register/sheet');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    expect((await conflictResponse).status()).toBe(409);
    await expect(page.locator('.cs-conflicts')).toContainText(otherNote);
    await expect(page.locator('.cs-conflicts')).toContainText(localNote);
    expect((await detail(page, row.id)).note).toBe(otherNote);
    await screenshot(page, info, 'visible-version-conflict', 1440);
    await page.getByRole('button', { name: '采用服务器值', exact: true }).click();
    await expect(page.getByLabel('当前单元格', { exact: true })).toHaveValue(otherNote);
    const latest = await detail(page, row.id);
    await safePatch(page, data, { operationId: randomUUID(), items: [{ id: row.id, expectedRevision: latest.revision, changes: { formalCode: 'ILLEGAL-FORMAL-CODE' } }] }, 400);
    expect((await detail(page, row.id)).revision).toBe(latest.revision);
    await safePatch(page, data, { operationId: randomUUID(), items: [{ id: row.id, expectedRevision: initial.revision, changes: { note: '旧修订不能覆盖' } }] }, 409);
    expect((await detail(page, row.id)).note).toBe(otherNote);
    const originalOther = await detail(page, data.rows[1]!.id);
    await safePatch(page, data, { operationId: randomUUID(), reason: '合成非法批次验证', items: [
      { id: row.id, expectedRevision: latest.revision, changes: { note: '不应部分成功' } },
      { id: originalOther.id, expectedRevision: originalOther.revision, changes: { registerMonth: '2026-13' } },
    ] }, 400);
    expect((await detail(page, row.id)).note).toBe(otherNote);
    expect((await detail(page, originalOther.id)).revision).toBe(originalOther.revision);
    if (data.candidateId) {
      const candidate = await detail(page, data.candidateId);
      expect(candidate.registerStatus).toBe('CANDIDATE');
      await safePatch(page, data, { operationId: randomUUID(), reason: '合成候选越界验证', items: [{ id: candidate.id, expectedRevision: candidate.revision, changes: { boardCode: '不得绕过项目门禁' } }] }, 400);
      expect((await detail(page, candidate.id)).revision).toBe(candidate.revision);
    }
  } finally {
    await writeFile(info.outputPath('member-b-sanitized-events.json'), JSON.stringify({ network: otherEvents.network, errors: otherEvents.errors, guardErrors: otherEvents.guardErrors }, null, 2), { mode: 0o600 });
    await otherContext.close();
  }

  const blockedContext = await browser.newContext({ baseURL: ORIGIN }), blocked = await blockedContext.newPage();
  const blockedEvents = observe(blocked); await guardWrites(blockedContext, data, blockedEvents);
  try {
    await login(blocked, a.unapproved!, /\/pending-access$/);
    const deniedRead = await blocked.request.get(ORIGIN + '/api/color-register');
    expect(deniedRead.status()).toBe(403);
    blockedEvents.network.push({ method: 'GET', path: '/api/color-register', status: deniedRead.status() });
    const latest = await detail(page, row.id);
    await safePatch(blocked, data, { operationId: randomUUID(), items: [{ id: row.id, expectedRevision: latest.revision, changes: { note: '不得保存的越权值' } }] }, 403);
    expect((await detail(page, row.id)).revision).toBe(latest.revision);
  } finally {
    await writeFile(info.outputPath('unapproved-sanitized-events.json'), JSON.stringify({ network: blockedEvents.network, errors: blockedEvents.errors, guardErrors: blockedEvents.guardErrors }, null, 2), { mode: 0o600 });
    await blockedContext.close();
  }
  // The Personal Sheets generic snapshot/operations API is not a business write path.
  // Each probe is restricted to a synthetic ID and re-read through the real API.
  const snapshot = await page.request.get(ORIGIN + `/api/v1/workbooks/${encodeURIComponent(row.id)}/snapshot`);
  expect([404, 405]).toContain(snapshot.status());
  const beforeSnapshotProbe = await detail(page, row.id);
  const oldSnapshot = await page.request.put(ORIGIN + `/api/v1/workbooks/${encodeURIComponent(row.id)}/snapshot`, {
    headers: { Origin: ORIGIN }, data: { expectedRevision: initial.revision, requestId: randomUUID(), snapshot: { id: row.id, cellData: { 1: { 2: { v: '旧快照不得覆盖', t: 1 } } } } },
  });
  expect([404, 405]).toContain(oldSnapshot.status());
  const genericWrite = await page.request.post(ORIGIN + `/api/v1/workbooks/${encodeURIComponent(row.id)}/operations`, {
    headers: { Origin: ORIGIN }, data: { expectedRevision: initial.revision, requestId: randomUUID(), operations: [{ type: 'setCells', sheetId: 'business-records', cells: [{ row: 1, column: 2, input: { type: 'string', value: '通用区域写不得覆盖' } }] }] },
  });
  expect([404, 405]).toContain(genericWrite.status());
  events.network.push({ method: 'PUT', path: '/api/v1/workbooks/<synthetic-id>/snapshot', status: oldSnapshot.status() }, { method: 'POST', path: '/api/v1/workbooks/<synthetic-id>/operations', status: genericWrite.status() });
  const latest = await detail(page, row.id); expect(latest.note).toBe(otherNote); expect(latest.revision).toBe(beforeSnapshotProbe.revision);
  await verifyNoSourceChanges(page, data, sourceBefore, info);
  expect(events.guardErrors).toEqual([]); expect(events.errors).toEqual([]);
  // Keep expected failing API network messages in the evidence; reject unrelated errors.
  expect(events.consoleErrors.filter(entry => !(entry.url.startsWith(ORIGIN + '/api/color-register/sheet') && /Failed to load resource/.test(entry.text)))).toEqual([]);
});

test('Synthetic color sheet: lost save response preserves a later reversion and retries the same command', async ({ page, context }, info) => {
  const data = await fixture(), a = await accounts(), events = observe(page);
  await guardWrites(context, data, events); await probeCanvas(page); await login(page, a.memberA!); await identify(page, info); await openSheet(page, data);
  const row = data.rows[0]!, before = await detail(page, row.id);
  await editCanvas(page, row, `请求已落库但响应丢失 ${data.runId}`);
  let command: SheetCommand | undefined;
  await page.route('**/api/color-register/sheet', async route => {
    const body = route.request().postDataJSON() as SheetCommand;
    expect(body.items).toHaveLength(1); expect(body.items[0]!.id).toBe(row.id); command = body;
    const response = await route.fetch(); expect(response.status()).toBe(200);
    await route.abort('failed');
  }, { times: 1 });
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('button', { name: '核实上次保存结果', exact: true })).toBeEnabled();
  expect((await detail(page, row.id)).revision).toBe(before.revision + 1);
  await page.getByLabel('当前单元格', { exact: true }).fill(before.note ?? '');
  // Explicit negative-response injection: an auth rejection of the retry says
  // nothing about the already committed original command.
  for (const status of [401, 403]) {
    await page.route('**/api/color-register/sheet', async route => {
      expect(route.request().postDataJSON()).toEqual(command);
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ message: status === 401 ? 'Unauthorized' : 'Forbidden' }) });
    }, { times: 1 });
    await page.getByRole('button', { name: '核实上次保存结果', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('尚未确认上次保存');
    await expect(page.getByRole('button', { name: '核实上次保存结果', exact: true })).toBeEnabled();
    await expect(page.getByLabel('当前单元格', { exact: true })).toHaveValue(before.note ?? '');
    expect((await detail(page, row.id)).revision).toBe(before.revision + 1);
  }
  const replayResponse = page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === '/api/color-register/sheet');
  await page.getByRole('button', { name: '核实上次保存结果', exact: true }).click();
  expect((await replayResponse).status()).toBe(200);
  expect(events.writeCommands.at(-1)).toEqual(command);
  await expect(page.getByRole('button', { name: '保存修改', exact: true })).toBeEnabled();
  await expect(page.getByLabel('当前单元格', { exact: true })).toHaveValue(before.note ?? '');
  expect((await detail(page, row.id)).revision).toBe(before.revision + 1);
  await save(page);
  expect(await detail(page, row.id)).toMatchObject({ note: before.note, revision: before.revision + 2 });
  expect(events.guardErrors).toEqual([]); expect(events.errors).toEqual([]);
});

test('Spreadsheet styling keeps the existing nonce-only style policy', async ({ page }) => {
  const response = await page.goto('/login');
  expect(response?.headers()['content-security-policy']).toMatch(/style-src-elem 'self' 'nonce-/);
  const result = await page.evaluate(async () => {
    const node = document.createElement('div'); node.id = 'color-sheet-csp-negative'; document.body.appendChild(node);
    const original = getComputedStyle(node).color;
    const violation = new Promise<string>(resolve => document.addEventListener('securitypolicyviolation', event => resolve(event.effectiveDirective), { once: true }));
    const style = document.createElement('style'); style.textContent = '#color-sheet-csp-negative { color: rgb(1, 2, 3) !important; }'; document.head.appendChild(style);
    const directive = await violation, after = getComputedStyle(node).color;
    style.remove(); node.remove(); return { directive, original, after };
  });
  expect(result.directive).toBe('style-src-elem'); expect(result.after).toBe(result.original);
});
