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

  test('工作台和项目工作区在三种视口可用', async ({ page }) => {
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
      await expect(page.locator('.r22-current-stage-description')).not.toContainText('正在同步');
      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        path: path.join(localEvidenceDir, `project-workspace-${viewport.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });

    }
  });
});

async function loginAsSeedProjectManager(page: Page) {
  const response = await page.request.post(`${API_BASE_URL}/auth/mock-login`, {
    data: {
      username: 'mock_project_manager',
      name: '演示项目经理',
      roleCodes: ['project_manager'],
    },
  });
  if (!response.ok()) {
    throw new Error(`mock login failed: ${response.status()}`);
  }
  await page.goto('/dashboard');
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
