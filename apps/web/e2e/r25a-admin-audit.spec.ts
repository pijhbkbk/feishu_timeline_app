import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const repoRoot = path.resolve(process.cwd(), '../..');
const evidenceDir = path.join(repoRoot, 'test-results', 'r25a');
const isRealOAuthRun = process.env.R25A_REAL_OAUTH === '1';

test.describe.serial('R25A 管理员审计工作区', () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
  });

  test('管理员列表、筛选、稳定排序、分页、详情、刷新和 390px 均可用', async ({ page }) => {
    test.setTimeout(240_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const audit404s: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() === 404 && response.url().includes('/admin/audit')) {
        audit404s.push(response.url());
      }
    });
    page.on('requestfailed', (request) => {
      if (request.url().includes('/api/admin/audit-logs')) {
        failedRequests.push(request.url());
      }
    });

    await ensureAdminSession(page);
    const marker = `R25A-AUDIT-${Date.now()}`;
    const project = await createAuditEvidenceProject(page, marker);

    await page.goto('/admin');
    await expect(page.getByTestId('admin-page')).toBeVisible();
    const auditNavLink = page.getByTestId('admin-audit-nav-link');
    await expect(auditNavLink).toBeVisible();
    await expect(auditNavLink).toHaveAttribute('href', '/admin/audit-logs');
    await expect(auditNavLink).toHaveAccessibleName('进入审计与异常');
    await auditNavLink.click();
    await expect(page).toHaveURL(/\/admin\/audit-logs/);
    await expect(page.getByTestId('admin-audit-page')).toBeVisible();
    await expect(page.getByText('已创建骨架')).toHaveCount(0);
    await expect(page.getByTestId('admin-audit-table')).toBeVisible();
    await expect(page.getByTestId('admin-audit-row').first()).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: path.join(evidenceDir, 'admin-audit-1440.png'),
      fullPage: true,
      animations: 'disabled',
    });

    await page.getByTestId('admin-audit-project-filter').fill(project.id);
    await page.getByTestId('admin-audit-apply-filters').click();
    await expect(page).toHaveURL(new RegExp(`projectId=${project.id}`));
    const projectRow = page.getByTestId('admin-audit-row').filter({ hasText: marker }).first();
    await expect(projectRow).toBeVisible();
    const projectAuditId = await projectRow.getAttribute('data-audit-log-id');
    expect(projectAuditId).toBeTruthy();
    await page.screenshot({
      path: path.join(evidenceDir, 'admin-audit-filter-1440.png'),
      fullPage: true,
      animations: 'disabled',
    });

    await page.getByTestId('admin-audit-sort').selectOption('createdAt:asc');
    await expect(page).toHaveURL(/sort=createdAt%3Aasc/);
    await page.reload();
    await expect(page.getByTestId('admin-audit-project-filter')).toHaveValue(project.id);
    await expect(page.getByTestId('admin-audit-row').first()).toBeVisible();

    await page.getByTestId(`admin-audit-detail-${projectAuditId}`).click();
    const detailDrawer = page.getByTestId('admin-audit-detail-drawer');
    await expect(detailDrawer).toBeVisible();
    await expect(detailDrawer).toHaveAttribute('data-audit-log-id', projectAuditId!);
    await expect(detailDrawer).not.toContainText(/Bearer\s+\S+|postgres(?:ql)?:\/\/|redis:\/\//i);
    await page.screenshot({
      path: path.join(evidenceDir, 'admin-audit-detail-1440.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: '关闭审计详情' }).click();

    await page.getByTestId('admin-audit-clear-filters').click();
    await expect(page.getByTestId('admin-audit-row').first()).toBeVisible();
    await page.getByTestId('admin-audit-page-size').selectOption('50');
    await expect(page).toHaveURL(/pageSize=50/);
    await expect(page.getByTestId('admin-audit-row')).toHaveCount(50);
    await page.getByTestId('admin-audit-page-size').selectOption('25');
    await page.getByTestId('admin-audit-next-page').click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId('admin-audit-previous-page')).toBeEnabled();

    await page.getByTestId('admin-audit-keyword-input').fill(marker);
    await page.getByTestId('admin-audit-apply-filters').click();
    const matchingRows = page.getByTestId('admin-audit-row').filter({ hasText: marker });
    await expect(matchingRows.first()).toBeVisible();
    expect(await matchingRows.count()).toBeGreaterThan(0);
    await page.getByTestId('admin-audit-clear-filters').click();

    await page.getByTestId('admin-audit-actor-filter').fill('R25A 系统管理员');
    await page.getByTestId('admin-audit-apply-filters').click();
    await expect(page.getByTestId('admin-audit-row').first()).toContainText('R25A 系统管理员');
    await page.getByTestId('admin-audit-clear-filters').click();

    await page.getByTestId('admin-audit-action-filter').fill('PROJECT_CREATED');
    await page.getByTestId('admin-audit-apply-filters').click();
    await expect(page.getByTestId('admin-audit-row').first()).toContainText(/Project Created/i);
    await page.getByTestId('admin-audit-clear-filters').click();

    await page.getByTestId('admin-audit-result-filter').fill('REJECTED');
    await page.getByTestId('admin-audit-apply-filters').click();
    await expect(page.getByTestId('admin-audit-row').first()).toContainText(/Rejected/i);
    await page.getByTestId('admin-audit-clear-filters').click();

    const today = new Date().toISOString().slice(0, 10);
    await page.getByTestId('admin-audit-date-range').fill(today);
    await page.getByTestId('admin-audit-apply-filters').click();
    await expect(page.getByTestId('admin-audit-row').first()).toBeVisible();

    const apiBaseUrl = getApiBaseUrl(page);
    const firstPage = await page.request.get(`${apiBaseUrl}/admin/audit-logs?page=1&pageSize=1`);
    const secondPage = await page.request.get(`${apiBaseUrl}/admin/audit-logs?page=2&pageSize=1`);
    expect(firstPage.status()).toBe(200);
    expect(secondPage.status()).toBe(200);
    const firstPayload = await firstPage.json() as { items: Array<{ id: string }>; pageSize: number };
    const secondPayload = await secondPage.json() as { items: Array<{ id: string }>; pageSize: number };
    expect(firstPayload.pageSize).toBe(1);
    expect(secondPayload.pageSize).toBe(1);
    expect(firstPayload.items[0]?.id).toBeTruthy();
    expect(secondPayload.items[0]?.id).toBeTruthy();
    expect(secondPayload.items[0]?.id).not.toBe(firstPayload.items[0]?.id);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByTestId('admin-audit-page')).toBeVisible();
    await expect(page.getByTestId('admin-audit-row').first()).toBeVisible();
    const widthMetrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(widthMetrics.scrollWidth).toBeLessThanOrEqual(widthMetrics.clientWidth + 1);
    await page.screenshot({
      path: path.join(evidenceDir, 'admin-audit-390.png'),
      fullPage: true,
      animations: 'disabled',
    });

    expect(audit404s).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('空态、API 错误态与重试控件均可用', async ({ page }) => {
    await ensureAdminSession(page);
    await page.goto('/admin/audit-logs');
    await expect(page.getByTestId('admin-audit-row').first()).toBeVisible();

    await page.getByTestId('admin-audit-keyword-input').fill(`R25A-NO-MATCH-${Date.now()}`);
    await page.getByTestId('admin-audit-apply-filters').click();
    await expect(page.getByTestId('admin-audit-empty-state')).toBeVisible();

    await page.getByTestId('admin-audit-clear-filters').click();
    await expect(page.getByTestId('admin-audit-row').first()).toBeVisible();
    await page.route('**/api/admin/audit-logs*', (route) => route.abort('failed'));
    await page.getByTestId('admin-audit-sort').selectOption('createdAt:asc');
    await expect(page.getByTestId('admin-audit-error-state')).toBeVisible();
    await expect(page.getByTestId('admin-audit-retry-button')).toBeVisible();
    await page.unroute('**/api/admin/audit-logs*');
    await page.getByTestId('admin-audit-retry-button').click();
    await expect(page.getByTestId('admin-audit-error-state')).toHaveCount(0);
    await expect(page.getByTestId('admin-audit-row').first()).toBeVisible();
  });

  test('确定性普通查看者的页面、列表和详情读取均被拒绝', async ({ page }) => {
    test.skip(isRealOAuthRun, '真实 OAuth 管理员会话不在浏览器内降权；staging 负向证据由独立确定性身份执行。');
    await mockLogin(page, `r25a_viewer_${Date.now()}`, 'R25A 普通查看者', ['viewer']);
    const apiBaseUrl = getApiBaseUrl(page);
    const listResponse = await page.request.get(`${apiBaseUrl}/admin/audit-logs`);
    const detailResponse = await page.request.get(`${apiBaseUrl}/admin/audit-logs/not-allowed`);
    expect(listResponse.status()).toBe(403);
    expect(detailResponse.status()).toBe(403);

    await page.goto('/admin/audit-logs');
    await expect(page.getByText('仅管理员可访问', { exact: true })).toBeVisible();
    await expect(page.getByTestId('admin-audit-page')).toHaveCount(0);
    await page.screenshot({
      path: path.join(evidenceDir, 'admin-audit-forbidden.png'),
      fullPage: true,
      animations: 'disabled',
    });
  });
});

async function ensureAdminSession(page: Page) {
  if (!isRealOAuthRun) {
    await mockLogin(page, `r25a_admin_${Date.now()}`, 'R25A 系统管理员', ['admin']);
  }
  const response = await page.request.get(`${getApiBaseUrl(page)}/auth/session`);
  expect(response.status()).toBe(200);
  const session = await response.json() as {
    authenticated: boolean;
    user: { authSource: string; roleCodes: string[]; isSystemAdmin: boolean } | null;
  };
  expect(session.authenticated).toBe(true);
  expect(session.user?.isSystemAdmin || session.user?.roleCodes.includes('admin')).toBe(true);
  if (isRealOAuthRun) expect(session.user?.authSource).toBe('feishu');
}

async function mockLogin(page: Page, username: string, name: string, roleCodes: string[]) {
  await page.goto('/login');
  const response = await page.request.post(`${getApiBaseUrl(page)}/auth/mock-login`, {
    data: { username, name, roleCodes },
  });
  expect(response.status()).toBe(201);
}

async function createAuditEvidenceProject(page: Page, marker: string) {
  const response = await page.request.post(`${getApiBaseUrl(page)}/projects`, {
    data: {
      code: marker,
      name: `${marker} 审计证据项目`,
      priority: 'MEDIUM',
    },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{ id: string; code: string; name: string }>;
}

function getApiBaseUrl(page: Page) {
  if (process.env.PLAYWRIGHT_API_URL) return process.env.PLAYWRIGHT_API_URL.replace(/\/$/, '');
  if (!isRealOAuthRun) return 'http://localhost:3001/api';
  const origin = new URL(page.url() === 'about:blank' ? (process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000') : page.url()).origin;
  return `${origin}/api`;
}
