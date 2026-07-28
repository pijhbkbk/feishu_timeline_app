import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const repoRoot = path.resolve(process.cwd(), '../..');
const evidenceDir = path.join(
  repoRoot,
  'docs/product/evidence/R26_ADMIN_DASHBOARD_COLOR_DATABASE/playwright',
);
const apiBaseUrl = process.env.PLAYWRIGHT_API_URL?.replace(/\/$/, '') ?? 'http://localhost:3001/api';
const productionHost = 'timeline.all-too-well.com';

const viewports = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

test.describe.serial('R26 极简系统管理与颜色数据库', () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
  });

  test('真实数据、四条路由和三档响应式均可用', async ({ page }) => {
    test.setTimeout(240_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const notFoundResponses: string[] = [];
    const productionRequests: string[] = [];
    const businessRequests = new Set<string>();

    page.on('console', (message) => {
      if (message.type() === 'error') {
        const location = message.location();
        consoleErrors.push(`${message.text()}${location.url ? ` @ ${location.url}:${location.lineNumber}` : ''}`);
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      if (request.url().includes(productionHost)) productionRequests.push(request.url());
      if (request.url().includes('/api/admin/')) {
        businessRequests.add(`${request.method()} ${new URL(request.url()).pathname}`);
      }
    });
    page.on('response', (response) => {
      if (response.status() === 404) notFoundResponses.push(response.url());
    });

    await mockLogin(page, `r26_color_admin_${Date.now()}`, 'R26 颜色数据库管理员', ['admin']);

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto('/admin');
      await expect(page.getByTestId('admin-page')).toBeVisible();
      await expect(page.getByRole('heading', { name: '系统管理', exact: true })).toBeVisible();
      await expect(page.locator('.r26-admin-metric')).toHaveCount(6);
      await expect(page.getByRole('link', { name: /进入管理/ })).toHaveAttribute('href', '/admin/manage');
      await expect(page.getByRole('link', { name: /颜色数据库/ })).toHaveAttribute('href', '/admin/color-database');
      await expect(page.locator('.r26-admin-entry')).toHaveCount(2);
      await assertNoHorizontalOverflow(page);
      await screenshot(page, `admin-${viewport.name}.png`);

      await page.getByRole('link', { name: /进入管理/ }).click();
      await expect(page).toHaveURL(/\/admin\/manage$/);
      await expect(page.getByTestId('admin-manage-page')).toBeVisible();
      await expect(page.getByRole('link', { name: '返回', exact: true })).toHaveAttribute('href', '/admin');
      await expect(page.getByRole('heading', { name: '进入管理', exact: true })).toHaveCount(0);
      await expect(page.getByRole('navigation', { name: '管理模块' })).toHaveCount(0);
      for (const heading of ['项目与工序', '组织与成员', '分工与权限', '审计与异常']) {
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      }
      await expect(page.getByRole('heading', { name: '流程与参数', exact: true })).toHaveCount(0);
      await expect(page.locator('.r26-admin-manage__groups article')).toHaveCount(4);
      await assertNoHorizontalOverflow(page);
      await screenshot(page, `admin-manage-${viewport.name}.png`);

      await page.goto('/admin/color-database');
      await expect(page.getByTestId('admin-color-database-page')).toBeVisible();
      await expect(page.getByRole('heading', { name: '颜色数据库', exact: true })).toBeVisible();
      await expect(page.getByLabel('颜色资料统计').locator('article')).toHaveCount(4);
      await assertNoHorizontalOverflow(page);
      await screenshot(page, `color-database-${viewport.name}.png`);

      const archiveLink = page.getByRole('link', { name: /查看档案/ }).first();
      if (await archiveLink.count()) {
        await archiveLink.click();
        await expect(page).toHaveURL(/\/admin\/color-database\/[^/]+$/);
        await expect(page.getByTestId('admin-color-archive-page')).toBeVisible();
        await expect(page.getByRole('heading', { name: '生命周期材料' })).toBeVisible();
        await expect(page.locator('.r26-color-archive__materials details')).toHaveCount(7);
        await expect(page.locator('body')).not.toContainText(/DEMO[-_\s]?ACTIVE/i);
        await assertNoHorizontalOverflow(page);
        await screenshot(page, `color-archive-${viewport.name}.png`);
      }
    }

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(notFoundResponses).toEqual([]);
    expect(productionRequests).toEqual([]);
    expect([...businessRequests].every((item) => item.startsWith('GET '))).toBe(true);

    await writeFile(
      path.join(evidenceDir, 'network.json'),
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        businessRequests: [...businessRequests].sort(),
        productionRequests,
      }, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(evidenceDir, 'browser-errors.json'),
      `${JSON.stringify({ consoleErrors, pageErrors }, null, 2)}\n`,
      'utf8',
    );
  });

  test('检索、空态、错误态和恢复可用', async ({ page }) => {
    await mockLogin(page, `r26_color_filter_${Date.now()}`, 'R26 颜色数据库筛选管理员', ['admin']);
    await page.goto('/admin/color-database');
    await expect(page.getByTestId('admin-color-database-page')).toBeVisible();

    const search = page.getByPlaceholder('搜索颜色名称、颜色编号、车型或项目编号');
    await search.fill(`R26-NO-MATCH-${Date.now()}`);
    await page.getByRole('button', { name: '查询', exact: true }).click();
    await expect(page.getByText('没有找到符合条件的颜色档案')).toBeVisible();
    await screenshot(page, 'color-database-empty.png');

    await page.getByRole('button', { name: '清除筛选' }).click();
    await expect(page.getByText('没有找到符合条件的颜色档案')).toHaveCount(0);
    await page.route('**/api/admin/color-database*', (route) => route.abort('failed'));
    await page.getByRole('button', { name: '刷新数据' }).click();
    await expect(page.locator('.r26-admin-home__error')).toBeVisible();
    await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible();
    await screenshot(page, 'color-database-error.png');
    await page.unroute('**/api/admin/color-database*');
    await page.getByRole('button', { name: '重新加载' }).click();
    await expect(page.locator('.r26-admin-home__error')).toHaveCount(0);
  });

  test('匿名被拒绝，普通查看者只能读取授权项目颜色档案', async ({ page, request }) => {
    const anonymousList = await request.get(`${apiBaseUrl}/admin/color-database`);
    const anonymousDetail = await request.get(`${apiBaseUrl}/admin/color-database/not-allowed`);
    expect(anonymousList.status()).toBe(401);
    expect(anonymousDetail.status()).toBe(401);

    await mockLogin(page, `r26_color_viewer_${Date.now()}`, 'R26 普通查看者', ['viewer']);
    const viewerList = await page.request.get(`${apiBaseUrl}/admin/color-database`);
    const viewerDetail = await page.request.get(`${apiBaseUrl}/admin/color-database/not-allowed`);
    expect(viewerList.status()).toBe(200);
    const viewerPayload = await viewerList.json() as { items: Array<{ id: string }> };
    expect(viewerPayload.items).toEqual([]);
    expect(viewerDetail.status()).toBe(404);
    await page.goto('/admin/color-database');
    await expect(page.getByTestId('admin-color-database-page')).toBeVisible();
    await expect(page.getByText('没有找到符合条件的颜色档案')).toBeVisible();
    await expect(page.getByText('仅管理员可访问', { exact: true })).toHaveCount(0);
    await screenshot(page, 'color-database-viewer-scoped-empty.png');
  });
});

async function mockLogin(page: Page, username: string, name: string, roleCodes: string[]) {
  const response = await page.request.post(`${apiBaseUrl}/auth/mock-login`, {
    data: { username, name, roleCodes },
  });
  expect(response.status()).toBe(201);
}

async function assertNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(evidenceDir, name),
    fullPage: true,
    animations: 'disabled',
  });
}
