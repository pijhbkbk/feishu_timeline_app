import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Explicit private local runtime only. No fixture bypasses, DB edits, or remote writes.
test.use({ trace: 'off', video: 'off' });
test.describe.configure({ mode: 'serial' });
test.skip(!process.env.M1_RUNTIME_ROOT, 'Requires a dedicated native-account local runtime.');
const runtime = process.env.M1_RUNTIME_ROOT!;
const origin = 'http://127.0.0.1:3350';
type Account = { username: string; password: string; id: string };
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 300]/Contents 4 0 R>>endobj\n4 0 obj<</Length 0>>stream\n\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
async function login(page: Page, account: Account) {
  await page.goto('/login');
  await page.getByLabel('工号', { exact: false }).fill(account.username);
  await page.getByLabel('密码', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
}
async function readJson(page: Page, url: string) {
  const response = await page.request.get(`/api${url}`);
  expect(response.status()).toBe(200);
  return response.json();
}
async function createProject(page: Page, name: string) {
  await page.goto('/projects/new?from=dashboard');
  await page.getByLabel('颜色名称', { exact: true }).fill(name);
  await page.getByLabel('适用车型', { exact: true }).fill('合成轻卡 M1');
  await page.getByLabel('开发报告批准日期', { exact: true }).fill('2026-10-07');
  await page.getByLabel('批准依据', { exact: true }).fill('合成批准记录 M1');
  await page.getByLabel('需求来源', { exact: true }).fill('隔离验收合成需求');
  await page.getByLabel('已获批的新颜色开发报告', { exact: true }).setInputFiles({ name: '合成已获批开发报告.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(page).toHaveURL(url => /^\/projects\/[^/]+$/.test(url.pathname) && url.pathname !== '/projects/new', { timeout: 90000 });
  return new URL(page.url()).pathname.split('/')[2]!;
}

test('M1 real native login, scanned reports, same-team confirmation and persistent return context', async ({ page, browser }, info) => {
  test.setTimeout(240000);
  expect(info.project.use.baseURL).toBe(origin);
  const accounts = JSON.parse(await readFile(path.join(runtime, 'accounts.json'), 'utf8')) as Record<string, Account>;
  const network: Array<{ method: string; path: string; status: number }> = [];
  const errors: string[] = [];
  const resources = new Set<string>();
  page.on('response', response => { const url = new URL(response.url()); if (url.pathname.startsWith('/_next/static/')) resources.add(url.pathname); });
  const expectedCommit = process.env.M1_EXPECTED_COMMIT;
  if (expectedCommit) {
    expect(expectedCommit).toMatch(/^[a-f0-9]{40}$/);
    for (const metadataPath of ['/api/health', '/build-info']) {
      const response = await page.request.get(metadataPath, { headers: { 'Cache-Control': 'no-cache' } });
      expect(response.status()).toBe(200);
      expect((await response.json()).runtimeCommit).toBe(expectedCommit);
    }
  }
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/')) network.push({ method: response.request().method(), path: url.pathname, status: response.status() });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await page.screenshot({ path: info.outputPath('02-login-1440.png'), fullPage: true });
  await login(page, accounts.memberA!);
  await expect(page).toHaveURL(/\/dashboard$/);
  const session = await readJson(page, '/auth/session');
  expect(session.mockEnabled).toBe(false);
  expect(session.feishuEnabled).toBe(false);
  expect(session.user.teamAccessApproved).toBe(true);
  expect(session.user.isSystemAdmin).toBe(false);
  expect(session.user.roleCodes).toEqual([]);
  const run = Date.now();
  const projectId = await createProject(page, `合成暖白 M1-${run}`);
  const otherProjectId = await createProject(page, `合成灰绿 M1-${run}`);
  await page.goto(`/dashboard?project=${projectId}`);
  await expect(page.getByLabel('选择颜色', { exact: true })).toHaveValue(projectId);
  await page.getByLabel('选择颜色', { exact: true }).selectOption(otherProjectId);
  await expect(page).toHaveURL(new RegExp(`project=${otherProjectId}`));
  await page.getByLabel('选择颜色', { exact: true }).selectOption(projectId);
  await expect(page).toHaveURL(new RegExp(`project=${projectId}`));
  await expect(page.locator('[data-node-code="PAINT_DEVELOPMENT"]')).toHaveAttribute('href', new RegExp(`/projects/${projectId}/tasks/`));
  await expect(page.locator('[data-node-code="PAINT_DEVELOPMENT"]')).toBeVisible();
  await page.locator('[data-node-code="PAINT_DEVELOPMENT"]').click();
  await page.getByLabel('实际制样日期', { exact: true }).fill('2026-10-07');
  await page.getByLabel('样板编号', { exact: true }).fill(`M1-${run}`);
  await page.getByLabel('样板名称', { exact: true }).fill('合成暖白样板');
  await page.getByRole('textbox', { name: '制样记录', exact: true }).fill('合成试验制样，已保留实际制作事实。');
  await page.getByRole('button', { name: '保存并返回', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard\\?project=${projectId}&taskId=`));
  await page.locator('[data-node-code="SAMPLE_COLOR_CONFIRMATION"]').click();
  await expect(page.getByRole('heading', { name: '样板颜色确认', exact: true })).toBeVisible();
  const nodeUrl = page.url();
  const taskId = new URL(nodeUrl).pathname.split('/').at(-1)!;
  await page.getByLabel('实际确认日期', { exact: true }).fill('2026-10-07');
  await page.getByLabel('确认方', { exact: true }).fill('合成客户技术方');
  await page.getByRole('textbox', { name: '意见', exact: true }).fill('合成色样与批准要求一致。');
  await page.getByLabel('选择确认单', { exact: true }).setInputFiles({ name: '合成样板颜色确认单_包含很长的中文文件名称_材料版本一.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.getByRole('button', { name: '上传确认单', exact: true }).click();
  await expect(page.getByText('材料扫描通过，已保存。', { exact: true })).toBeVisible({ timeout: 90000 });
  const material = await readJson(page, `/v2/tasks/${taskId}/progress-context`);
  expect(material.materials.current[0].materialType).toBe('sample-confirmation-proof');
  const materialId = material.materials.current[0].id;
  const attachment = await readJson(page, `/projects/${projectId}/attachments/${materialId}`);
  expect(attachment.scanStatus).toBe('CLEAN');
  await page.getByRole('button', { name: /^预览 / }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载材料', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('合成样板颜色确认单');
  await page.getByRole('button', { name: '关闭预览', exact: true }).click();
  await expect(page.getByLabel('确认方', { exact: true })).toHaveValue('合成客户技术方');
  await page.screenshot({ path: info.outputPath('06-confirmation-1440.png'), fullPage: true });

  // Another approved member changes the material through the same real UI.
  const bContext = await browser.newContext({ baseURL: origin });
  const b = await bContext.newPage();
  await login(b, accounts.memberB!);
  await expect(b).toHaveURL(/\/dashboard$/);
  await b.goto(nodeUrl);
  await b.getByLabel('选择确认单', { exact: true }).setInputFiles({ name: '合成确认单_成员乙补充版本.pdf', mimeType: 'application/pdf', buffer: pdf });
  await b.getByRole('button', { name: '上传确认单', exact: true }).click();
  await expect(b.getByText('材料扫描通过，已保存。', { exact: true })).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: '保存并返回', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toContainText(/版本|刷新|更新/);
  await expect(page.getByRole('textbox', { name: '意见', exact: true })).toHaveValue('合成色样与批准要求一致。');
  await page.screenshot({ path: info.outputPath('conflict-preserves-input.png'), fullPage: true });
  await page.getByRole('button', { name: '读取最新状态', exact: true }).click();
  await expect(page.getByText('已读取最新状态，未提交的输入已保留。', { exact: true })).toBeVisible();
  const confirmationRequest = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/samples/confirm'));
  await page.getByRole('button', { name: '保存并返回', exact: true }).click();
  const savedRequest = await confirmationRequest;
  const body = savedRequest.postDataJSON();
  await expect(page).toHaveURL(new RegExp(`/dashboard\\?project=${projectId}&taskId=${taskId}`));
  const replay = await page.request.post(`/api/projects/${projectId}/samples/confirm`, { headers: { Origin: origin, 'Idempotency-Key': body.idempotencyKey }, data: body });
  expect(replay.status()).toBe(201);
  const facts = await readJson(page, `/projects/${projectId}/samples?taskId=${taskId}`);
  expect(facts.taskFacts.confirmations).toHaveLength(1);
  expect(facts.taskFacts.confirmations[0].confirmationParty).toBe('合成客户技术方');
  expect(facts.taskFacts.confirmations[0].confirmedById).toBe(accounts.memberA!.id);
  const logs = await readJson(page, `/projects/${projectId}/logs?page=1&pageSize=50`);
  expect(JSON.stringify(logs)).toContain('SAMPLE_CONFIRM');
  await b.goto(nodeUrl);
  await expect(b.getByLabel('确认方', { exact: true })).toHaveValue('合成客户技术方');
  await expect(b.getByRole('button', { name: '保存并返回', exact: true })).toHaveCount(0);
  await bContext.close();
  await writeFile(path.join(runtime, 'browser-state.json'), JSON.stringify({ projectId, otherProjectId, taskId, nodeUrl, run, network, errors }, null, 2), { mode: 0o600 });

  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 800], [390, 844]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto(`/dashboard?project=${projectId}&taskId=${taskId}`);
    await expect(page.locator('[data-node-code="SAMPLE_COLOR_CONFIRMATION"]')).toBeVisible();
    expect(await page.locator('[data-node-code]').count()).toBe(18);
    if (width === 390) {
      const visible = await page.locator('[data-node-code="SAMPLE_COLOR_CONFIRMATION"]').evaluate(node => { const n=node.getBoundingClientRect(); const view=node.closest('.m1-map-scroll')!.getBoundingClientRect(); return n.left >= view.left && n.right <= view.right; });
      expect(visible).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`03-dashboard-${width}.png`), fullPage: true });
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: '颜色项目', exact: true })).toBeVisible();
    await expect(page.locator(`a[href^="/projects/${projectId}?"]`).first()).toBeVisible();
    await page.screenshot({ path: info.outputPath(`04-projects-${width}.png`), fullPage: true });
    await page.goto(`/projects/${projectId}`);
    await expect(page.locator('[data-node-code="SAMPLE_COLOR_CONFIRMATION"]')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`05-overview-${width}.png`), fullPage: true });
    await page.goto(nodeUrl);
    await expect(page.getByLabel('确认方', { exact: true })).toHaveValue('合成客户技术方');
    await expect(page.getByLabel('实际确认日期', { exact: true })).toHaveValue('2026-10-07');
    await page.screenshot({ path: info.outputPath(`06-saved-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.request.post('/api/auth/logout', { headers: { Origin: origin } });
  await login(page, accounts.memberA!);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(nodeUrl);
  await expect(page.getByLabel('确认方', { exact: true })).toHaveValue('合成客户技术方');
  expect(errors).toEqual([]);
  await writeFile(path.join(runtime, 'browser-state.json'), JSON.stringify({ projectId, otherProjectId, taskId, nodeUrl, run, network, errors }, null, 2), { mode: 0o600 });
  const font = await page.locator('body').evaluate(body => ({ family: getComputedStyle(body).fontFamily, status: document.fonts.status, pixelRatio: devicePixelRatio }));
  const receipt = { expectedCommit: expectedCommit ?? 'candidate-uncommitted', browser: browser.version(), network, errors, staticResources: [...resources], font };
  await writeFile(path.join(runtime, 'browser-receipt.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  await info.attach('sanitized-network', { body: JSON.stringify(receipt, null, 2), contentType: 'application/json' });
});

test('M1 admission, disabled login, browser navigation and explicit failure states', async ({ page }, info) => {
  test.setTimeout(120000);
  expect(info.project.use.baseURL).toBe(origin);
  const accounts = JSON.parse(await readFile(path.join(runtime, 'accounts.json'), 'utf8')) as Record<string, Account>;
  const state = JSON.parse(await readFile(path.join(runtime, 'browser-state.json'), 'utf8'));
  await login(page, { ...accounts.memberB!, password: 'incorrect-synthetic-password' });
  await expect(page.locator('main [role=alert]')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/login');
  await login(page, accounts.disabled!);
  await expect(page.locator('main [role=alert]')).toBeVisible();
  await login(page, accounts.unapproved!);
  await expect(page).toHaveURL(/\/pending-access$/);
  expect((await page.request.get(`/api/projects/${state.projectId}`)).status()).toBe(403);
  await page.request.post('/api/auth/logout', { headers: { Origin: origin } });
  await login(page, accounts.memberB!);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/projects?keyword=${encodeURIComponent('合成灰绿')}`);
  const projectLink = page.locator(`a[href^="/projects/${state.otherProjectId}?"]`).first();
  await projectLink.click();
  await expect(page).toHaveURL(/listKeyword=/);
  await page.locator('[data-node-code="PAINT_DEVELOPMENT"]').click();
  await expect(page.getByRole('heading', { name: '涂料开发记录', exact: true })).toBeVisible();
  const draftUrl = page.url();
  await page.getByLabel('样板编号', { exact: true }).fill('保留的未提交编号');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('link', { name: '取消', exact: true }).click();
  await expect(page).toHaveURL(draftUrl);
  await page.getByLabel('打开个人菜单').click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByLabel('样板编号', { exact: true })).toHaveValue('保留的未提交编号');
  expect((await readJson(page, '/auth/session')).authenticated).toBe(true);
  page.once('dialog', dialog => dialog.dismiss());
  await page.goBack();
  await expect(page).toHaveURL(draftUrl);
  await expect(page.getByLabel('样板编号', { exact: true })).toHaveValue('保留的未提交编号');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('link', { name: '取消', exact: true }).click();
  await expect(page).toHaveURL(/tab=flow.*listKeyword=/);
  await expect(page.locator('[data-node-code="PAINT_DEVELOPMENT"]')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(draftUrl);
  await expect(page.getByRole('heading', { name: '涂料开发记录', exact: true })).toBeVisible();
  await page.getByLabel('样板编号', { exact: true }).fill('向前取消也保留');
  page.once('dialog', dialog => dialog.dismiss());
  await page.goForward();
  await expect(page).toHaveURL(draftUrl);
  await expect(page.getByLabel('样板编号', { exact: true })).toHaveValue('向前取消也保留');
  page.once('dialog', dialog => dialog.accept());
  await page.goForward();
  await expect(page).toHaveURL(/tab=flow/);
  await expect(page.locator('[data-node-code="PAINT_DEVELOPMENT"]')).toBeVisible();
  await page.goto(draftUrl.split('?')[0]!);
  await page.getByRole('link', { name: '取消', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/projects/${state.otherProjectId}`);
  await page.goto('/admin/people');
  await expect(page.getByRole('heading', { name: '人员库', exact: true })).toBeVisible();
  const directory = await readJson(page, '/users/directory?take=50');
  expect(directory.some((person: {id:string}) => person.id === accounts.memberA!.id)).toBe(true);
  await expect(page.getByRole('cell', { name: '合成工艺部成员甲', exact: true })).toHaveCount(directory.filter((person: {name:string}) => person.name === '合成工艺部成员甲').length);
  await page.screenshot({ path: info.outputPath('14-people-directory.png'), fullPage: true });

  await page.goto(draftUrl);
  await page.getByLabel('选择材料', { exact: true }).setInputFiles({ name: '不合规.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('not a valid document') });
  await page.getByRole('button', { name: '上传材料', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toBeVisible();
  // A real Office archive containing the canonical benign EICAR file.
  // ClamAV must detect this exact runtime fixture before this application test.
  const rejectedDocument = await readFile(path.join(runtime, 'scanner-rejection.docx'));
  await page.getByLabel('选择材料', { exact: true }).setInputFiles({ name: '合成安全拒绝测试.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: rejectedDocument });
  const rejectedUpload = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/materials'));
  await page.getByRole('button', { name: '上传材料', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toContainText(/扫描|安全|拒绝|隔离/, { timeout: 60000 });
  expect((await rejectedUpload).status()).toBe(422); // Existing UnprocessableEntityException scan rejection contract.
  const scanLogs = await readJson(page, `/projects/${state.otherProjectId}/logs?page=1&pageSize=50`);
  expect(JSON.stringify(scanLogs)).toContain('ATTACHMENT_SCAN_REJECTED');
  await page.screenshot({ path: info.outputPath('real-scan-rejection.png'), fullPage: true });
  await expect(page.getByText('材料扫描通过，已保存。', { exact: true })).toHaveCount(0);
  await page.getByLabel('选择材料', { exact: true }).setInputFiles([]);
  await page.getByLabel('样板编号', { exact: true }).fill('会话失效时保留');
  await page.getByLabel('样板名称', { exact: true }).fill('合成样板');
  await page.getByRole('textbox', { name: '制样记录', exact: true }).fill('会话失效后不丢弃输入');
  await page.request.post('/api/auth/logout', { headers: { Origin: origin } });
  await page.getByRole('button', { name: '保存并返回', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toContainText(/登录|会话/);
  await expect(page.getByRole('textbox', { name: '制样记录', exact: true })).toHaveValue('会话失效后不丢弃输入');
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await page.getByRole('link', { name: '前往登录', exact: true }).click();
  await page.getByLabel('工号', { exact: false }).fill(accounts.memberB!.username);
  await page.getByLabel('密码', { exact: true }).fill(accounts.memberB!.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(draftUrl);

  // Explicit response fault injection checks UI only; it does not count as a real backend outage.
  await page.route('**/api/projects?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '本地服务暂时不可用，请稍后重试。' }) }));
  await page.goto('/dashboard');
  await expect(page.locator('main [role=alert]')).toContainText('暂时不可用');
  await expect(page.getByText('还没有颜色项目', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('injected-service-error.png'), fullPage: true });
  await page.unroute('**/api/projects?*');
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(page.locator('[data-node-code]').first()).toBeVisible();
  await page.getByRole('button', { name: '放大流程地图', exact: true }).click();
  await expect(page.getByRole('button', { name: '恢复流程地图比例', exact: true })).toHaveText('115%');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => { document.documentElement.style.zoom = '1.5'; });
  await page.screenshot({ path: info.outputPath('zoom-150-percent.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
