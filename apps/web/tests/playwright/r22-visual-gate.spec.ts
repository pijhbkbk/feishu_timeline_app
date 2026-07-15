import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL } from './helpers';

type PersonalOverview = {
  currentTask: {
    taskId: string;
    projectId: string;
  } | null;
};

const repoRoot = path.resolve(process.cwd(), '../..');
const localEvidenceDir = path.join(repoRoot, 'test-results', 'r22', 'local');

test.describe.serial('R22 视觉闸门', () => {
  test.beforeAll(async () => {
    await mkdir(localEvidenceDir, { recursive: true });
  });

  test('工作台、项目工作区、进展提交在三种视口可用，并提交真实进展', async ({ page }) => {
    await loginAsSeedProjectManager(page);
    const context = await getCurrentTaskContext(page);

    for (const viewport of [
      { name: '1440', width: 1440, height: 900 },
      { name: '1024', width: 1024, height: 900 },
      { name: '390', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
      await expect(page.getByRole('heading', { name: /演示项目经理/ })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        path: path.join(localEvidenceDir, `dashboard-${viewport.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });

      await page.goto(`/projects/${context.projectId}?taskId=${context.taskId}`);
      await expect(page.getByTestId('project-workspace-page')).toBeVisible();
      await expect(page.getByText('开发流程', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: '提交工作进展' })).toBeVisible();
      await expect(page.locator('.r22-current-stage-description')).not.toContainText('正在同步');
      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        path: path.join(localEvidenceDir, `project-workspace-${viewport.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });

      await page.goto(`/progress?taskId=${context.taskId}&step=1`);
      await expect(page.getByTestId('progress-page')).toBeVisible();
      const completedContent = page.getByLabel(/本次完成内容/);
      await completedContent.fill('已完成样车驾驶室首轮颜色确认，并同步修订项给责任团队。');
      await page.getByLabel(/下一步计划/).fill('明日完成问题闭环并准备评审材料。');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        path: path.join(localEvidenceDir, `progress-${viewport.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });

      await page.getByRole('button', { name: '继续', exact: true }).click();
      await expect(page.getByRole('heading', { name: '当前是否被阻塞？' })).toBeVisible();
      if (viewport.name === '1440') {
        await page.screenshot({
          path: path.join(localEvidenceDir, 'progress-1440-step-2.png'),
          fullPage: false,
          animations: 'disabled',
        });
      }

      await page.getByRole('button', { name: '没有阻塞' }).click();
      await page.getByRole('button', { name: '继续', exact: true }).click();
      await expect(page.getByRole('heading', { name: '上传材料并确认' })).toBeVisible();
      if (viewport.name === '1440') {
        await page.screenshot({
          path: path.join(localEvidenceDir, 'progress-1440-step-3.png'),
          fullPage: false,
          animations: 'disabled',
        });
        await page.getByRole('button', { name: '确认提交工作进展' }).click();
        await expect(page.getByRole('heading', { name: '进展已写入项目历史' })).toBeVisible();
      }
    }
  });
});

async function loginAsSeedProjectManager(page: Page) {
  await page.goto('/login');
  await page.evaluate(
    async ({ apiBaseUrl }) => {
      const response = await fetch(`${apiBaseUrl}/auth/mock-login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'mock_project_manager',
          name: '演示项目经理',
          roleCodes: ['project_manager'],
        }),
      });
      if (!response.ok) throw new Error(`mock login failed: ${response.status}`);
    },
    { apiBaseUrl: API_BASE_URL },
  );
}

async function getCurrentTaskContext(page: Page) {
  let result = await page.evaluate(async ({ apiBaseUrl }) => {
    const response = await fetch(`${apiBaseUrl}/dashboard/personal-overview`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`personal dashboard failed: ${response.status}`);
    return response.json() as Promise<PersonalOverview>;
  }, { apiBaseUrl: API_BASE_URL });

  if (!result.currentTask) {
    const timestamp = Date.now();
    await page.evaluate(async ({ apiBaseUrl, code, name }) => {
      const response = await fetch(`${apiBaseUrl}/projects`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, name, priority: 'MEDIUM' }),
      });
      if (!response.ok) throw new Error(`test project creation failed: ${response.status} ${await response.text()}`);
    }, {
      apiBaseUrl: API_BASE_URL,
      code: `R22-VISUAL-${timestamp}`,
      name: `R22 视觉闸门夹具 ${timestamp}`,
    });
    result = await page.evaluate(async ({ apiBaseUrl }) => {
      const response = await fetch(`${apiBaseUrl}/dashboard/personal-overview`, { credentials: 'include' });
      if (!response.ok) throw new Error(`personal dashboard failed: ${response.status}`);
      return response.json() as Promise<PersonalOverview>;
    }, { apiBaseUrl: API_BASE_URL });
  }

  if (!result.currentTask) throw new Error('seed project manager has no active task');
  return result.currentTask;
}

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}
