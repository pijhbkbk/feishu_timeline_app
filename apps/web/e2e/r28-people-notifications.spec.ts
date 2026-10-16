import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test.skip(!process.env.R28_RUNTIME_ROOT, 'Requires isolated R28 native accounts.');
test('personnel role persistence, pure production access and notification read state', async ({ page, browser }, info) => {
  expect(new URL(info.project.use.baseURL as string).origin).toBe('http://127.0.0.1:3100');
  const root = process.env.R28_RUNTIME_ROOT!;
  const state = JSON.parse(await readFile(path.join(root, 'state.json'), 'utf8'));
  const adminPassword = (await readFile(path.join(root, 'admin.password'), 'utf8')).trim();
  const network: Array<{ path: string; status: number }> = [], errors: string[] = [];
  page.on('response', r => { if (r.url().includes('/api/')) network.push({ path: new URL(r.url()).pathname, status: r.status() }); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/login');
  await page.getByLabel('工号', { exact: false }).fill('r28-admin');
  await page.getByLabel('密码', { exact: true }).fill(adminPassword);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/admin/people');
  await expect(page.getByRole('heading', { name: '人员', exact: true })).toBeVisible();
  await page.getByLabel('搜索姓名或工号').fill(state.accounts.production.username);
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: state.accounts.production.username });
  await expect(row).toContainText('生产'); await expect(row).toContainText('财务');
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: info.outputPath(`people-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await row.getByRole('button', { name: '编辑角色' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox', { name: /财务/ }).uncheck();
  await dialog.getByLabel('操作说明（选填）').fill('合成浏览器验证单一生产角色');
  await dialog.getByRole('button', { name: '保存角色' }).click();
  await expect(dialog).not.toBeVisible();
  const context = await browser.newContext({ baseURL: info.project.use.baseURL as string });
  try {
    await page.reload(); await expect(row).toContainText('生产'); await expect(row).not.toContainText('财务');
    const worker = await context.newPage();
    worker.on('pageerror', e => errors.push(e.message));
    worker.on('response', r => { if (r.url().includes('/api/')) network.push({ path: new URL(r.url()).pathname, status: r.status() }); });
    await worker.goto('/login');
    await worker.getByLabel('工号', { exact: false }).fill(state.accounts.production.username);
    await worker.getByLabel('密码', { exact: true }).fill(state.accounts.production.password);
    await worker.getByRole('button', { name: '登录', exact: true }).click();
    await expect(worker).toHaveURL(/\/dashboard$/);
    const me = await (await worker.request.get('/api/auth/me')).json(); expect(me.roleCodes).toEqual(['production_operator']);
    await worker.goto(`/projects/${state.projects.C}/production-plans`);
    await expect(worker.getByRole('button', { name: '新建排产计划', exact: true })).toBeEnabled();
    await worker.screenshot({ path: info.outputPath('pure-production-plan.png'), fullPage: true });
    await worker.goto('/notifications');
    await expect(worker.getByRole('heading', { name: '我的提醒' })).toBeVisible();
    const read = worker.getByRole('button', { name: '全部标为已读' });
    await expect(read).toBeEnabled(); await read.click();
    await expect(worker.getByText('0 条未读', { exact: true })).toBeVisible();
    await worker.reload(); await expect(worker.getByText('0 条未读', { exact: true })).toBeVisible();
    await worker.screenshot({ path: info.outputPath('notifications-read.png'), fullPage: true });
  } finally {
    await context.close();
    await row.getByRole('button', { name: '编辑角色' }).click();
    await dialog.getByRole('checkbox', { name: /财务/ }).check();
    await dialog.getByLabel('操作说明（选填）').fill('合成浏览器验证结束，恢复原角色');
    await dialog.getByRole('button', { name: '保存角色' }).click();
    await expect(dialog).not.toBeVisible(); await expect(row).toContainText('财务');
  }
  expect(errors).toEqual([]); expect(network.filter(r => r.status >= 500)).toEqual([]);
  await info.attach('native-network', { body: JSON.stringify({ network, errors }, null, 2), contentType: 'application/json' });
});
