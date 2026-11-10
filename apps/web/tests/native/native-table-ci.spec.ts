import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

type Account = { username: string; password: string; name?: string };
type State = { admin: Account; members: Account[]; baseId: string; colors: { id: string; name: string }[] };
type Fact = { id: string; colorId: string; month: string; quantity: string | null; revision: number };
type RecordRow = { id: string; objectId: string; objectCode: string; productionDate: string | null; revision: number; scores: { ordinal: number; values: (string | null)[] }[] };
const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
async function login(page: Page, account: Account) {
  await page.goto('/login');
  await page.locator('[name=username]').fill(account.username);
  await page.locator('[name=password]').fill(account.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function open(page: Page, route: string, base: string) {
  await page.goto(route);
  await expect(page.getByLabel('基地', { exact: true }).locator(`option[value="${base}"]`)).toBeAttached();
  await page.getByLabel('基地', { exact: true }).selectOption(base);
  await expect(page.locator('.table-scroll')).toHaveAttribute('aria-busy', 'false');
}
async function save(page: Page) {
  const write = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith('/batch'));
  await page.getByRole('button', { name: '保存', exact: true }).click();
  return write;
}
async function facts(page: Page, base: string): Promise<Fact[]> {
  const response = await page.request.get(`/api/production-facts?baseId=${base}&pageSize=50`);
  expect(response.status()).toBe(200);
  return (await response.json()).items;
}
async function records(page: Page, base: string): Promise<RecordRow[]> {
  const response = await page.request.get(`/api/inspections/visual-records?baseId=${base}&pageSize=50`);
  expect(response.status()).toBe(200);
  return (await response.json()).items;
}

test('native accounts preserve table edits, stable IDs and concurrent conflict input', async ({ browser }, info) => {
  test.setTimeout(180_000);
  expect(process.env.PLAYWRIGHT_NATIVE_TABLE).toBe('1');
  expect(process.env.CI).toBe('true');
  expect(['localhost', '127.0.0.1']).toContain(new URL(origin).hostname);
  const state: State = JSON.parse(await readFile(process.env.NATIVE_TABLE_CI_STATE!, 'utf8'));
  const ca = await browser.newContext({ baseURL: origin, timezoneId: 'America/Los_Angeles' });
  const cb = await browser.newContext({ baseURL: origin, timezoneId: 'Asia/Shanghai' });
  const admin = await ca.newPage(), a = await ca.newPage(), b = await cb.newPage();
  const errors: string[] = [], writes: { path: string; status: number; operationId: string }[] = [];
  for (const page of [a, b]) {
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    page.on('response', r => {
      if (r.request().method() === 'PATCH' && r.url().endsWith('/batch')) writes.push({ path: new URL(r.url()).pathname, status: r.status(), operationId: r.request().postDataJSON().operationId });
    });
  }
  await login(admin, state.admin);
  for (const member of state.members) {
    const registered = await admin.request.post('/api/auth/register', { headers: { Origin: origin }, data: member });
    expect(registered.status()).toBe(201);
  }
  const people = await admin.request.get('/api/people');
  expect(people.status()).toBe(200);
  const directory = (await people.json()).items;
  for (const member of state.members) {
    const person = directory.find((p: { username: string }) => p.username === member.username);
    expect(person).toBeTruthy();
    const approved = await admin.request.patch(`/api/people/${person.id}`, { headers: { Origin: origin }, data: {
      teamAccessApproved: true, roleCodes: ['quality_engineer'], expectedVersion: person.version, requestId: randomUUID(), reason: '合成CI双账号业务验收',
    } });
    expect(approved.status()).toBe(200);
  }
  expect((await admin.request.post('/api/auth/logout', { headers: { Origin: origin } })).status()).toBe(200);
  await admin.close();
  await login(a, state.members[0]!); await login(b, state.members[1]!);
  const session = await a.request.get('/api/auth/session');
  const identity = await session.json();
  expect(identity.user.authSource).toBe('local'); expect(identity.mockEnabled).toBe(false);
  expect((await a.request.post('/api/auth/mock-login', { headers: { Origin: origin }, data: {} })).status()).toBeGreaterThanOrEqual(400);
  await open(a, '/production', state.baseId); await open(b, '/production', state.baseId);
  await a.getByRole('button', { name: '粘贴导入', exact: true }).click();
  await a.getByLabel('待导入区域').fill('1\t0\t\n2\t\t3\n\t4\t0');
  await a.getByRole('button', { name: '预览区域', exact: true }).click();
  await a.getByRole('button', { name: '确认粘贴', exact: true }).click();
  expect((await save(a)).status()).toBe(200);
  await expect(a.locator('.tf-shell [role=status]')).toContainText('9格');
  await expect(a.locator('.tf-shell [role=status]')).toContainText('已读回');
  const expected = [['1', '0', null], ['2', null, '3'], [null, '4', '0']];
  const stored = await facts(a, state.baseId);
  expect(stored).toHaveLength(9);
  for (const [i, color] of state.colors.entries()) for (let j = 0; j < 3; j++) {
    const fact = stored.find(f => f.colorId === color.id && f.month === `2026-0${j + 1}`);
    expect(fact?.quantity).toBe(expected[i]![j]); expect(fact?.revision).toBe(1);
  }
  await a.reload(); await expect(a.getByLabel('合成CI颜色1 2月', { exact: true })).toHaveValue('0');
  await a.getByRole('link', { name: '工作台', exact: true }).click();
  await a.getByRole('link', { name: '月度产量', exact: true }).click();
  await expect(a.getByLabel('基地', { exact: true })).toHaveValue(state.baseId);
  await expect(a.getByLabel('合成CI颜色1 3月', { exact: true })).toHaveValue('');
  await b.reload(); await expect(b.getByLabel('合成CI颜色1 2月', { exact: true })).toHaveValue('0');
  await a.getByLabel('合成CI颜色1 1月', { exact: true }).fill('111');
  await b.getByLabel('合成CI颜色1 1月', { exact: true }).fill('222');
  expect((await save(b)).status()).toBe(200);
  await expect(b.locator('.tf-shell [role=status]')).toContainText('已读回');
  expect((await save(a)).status()).toBe(409);
  await expect(a.getByLabel('合成CI颜色1 1月', { exact: true })).toHaveValue('111');
  await a.reload(); await expect(a.getByLabel('合成CI颜色1 1月', { exact: true })).toHaveValue('111');
  expect((await facts(b, state.baseId)).find(f => f.id === stored.find(f => f.colorId === state.colors[0]!.id && f.month === '2026-01')!.id)?.quantity).toBe('222');
  await a.screenshot({ path: info.outputPath('native-production-conflict.png'), fullPage: true });

  // A separate route keeps the production conflict draft. Visual writes still
  // use normal account B and preserve four independent raw scoring lines.
  await open(b, '/inspections', state.baseId);
  const codes = ['SYN-CI-CAR-1', 'SYN-CI-CAR-2'];
  for (let i = 0; i < 2; i++) {
    await b.getByRole('button', { name: '＋ 增加记录', exact: true }).first().click();
    const id = await b.locator('tr.group-start').last().getAttribute('data-record-id');
    await b.getByLabel(`颜色 ${id}`, { exact: true }).selectOption(state.colors[i]!.id);
    await b.getByLabel(`评审日期 ${id}`, { exact: true }).fill('2026-11-10');
    await b.getByLabel(`生产日期 ${id}`, { exact: true }).fill('2026-11-09');
    await b.getByLabel(`车身号 ${id}`, { exact: true }).fill(codes[i]!);
    await b.getByLabel(`车型 ${id}`, { exact: true }).fill('合成CI车型');
    for (let n = 1; n <= 4; n++) await b.getByLabel(`${codes[i]} 第${n}条 驾驶室`, { exact: true }).fill(n === 4 ? 'B' : 'A');
  }
  expect((await save(b)).status()).toBe(200);
  await expect(b.locator('.tf-shell [role=status]')).toContainText('2辆');
  await expect(b.locator('.tf-shell [role=status]')).toContainText('已读回');
  const originals = await records(b, state.baseId);
  expect(originals).toHaveLength(2);
  for (const row of originals) { expect(row.productionDate).toBe('2026-11-09'); expect(row.scores.map(s => s.ordinal)).toEqual([1, 2, 3, 4]); }
  await b.getByLabel(`${codes[0]} 第1条 驾驶室`, { exact: true }).fill('C');
  expect((await save(b)).status()).toBe(200);
  await expect(b.locator('.tf-shell [role=status]')).toContainText('已读回');
  expect((await b.request.post('/api/auth/logout', { headers: { Origin: origin } })).status()).toBe(200);
  await login(b, state.members[1]!); await open(b, '/inspections', state.baseId);
  await expect(b.getByLabel(`${codes[0]} 第1条 驾驶室`, { exact: true })).toHaveValue('C');
  const after = await records(b, state.baseId);
  expect(after.map(r => r.id).sort()).toEqual(originals.map(r => r.id).sort());
  expect(after.map(r => r.objectId).sort()).toEqual(originals.map(r => r.objectId).sort());
  for (const width of [1440, 1024, 390]) {
    await b.setViewportSize({ width, height: 900 });
    expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(b.getByRole('button', { name: '下一页', exact: true })).toBeVisible();
    await b.screenshot({ path: info.outputPath(`native-review-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
  const evidencePath = info.outputPath('native-table-requests.json');
  await writeFile(evidencePath, JSON.stringify({ writes, stableRecordIds: after.map(r => r.id), factIds: stored.map(f => f.id) }), { mode: 0o600 });
  await info.attach('native-table-requests', { path: evidencePath, contentType: 'application/json' });
  await ca.close(); await cb.close();
});
