import { expect, test } from '@playwright/test';

import { loginAsProjectManager } from './helpers';
import {
  buildR16Timestamp,
  expectPageReady,
  R16_PROJECT_PREFIXES,
} from './r16-fixtures';

test.describe('R16 新建项目与时间线看板验收', () => {
  test('R16 can create a UAT project through the real project form and find it on timeline board', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const requests: Array<{ method: string; url: string; status: number }> = [];
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('response', (response) => {
      if (new URL(response.url()).pathname.startsWith('/api/')) {
        requests.push({
          method: response.request().method(), url: response.url(), status: response.status(),
        });
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await loginAsProjectManager(page);

    const timestamp = buildR16Timestamp();
    const projectName = `${R16_PROJECT_PREFIXES.deepBlue}${timestamp}`;

    await page.goto('/projects');
    await expectPageReady(page, 'project-list-page');
    await page.getByTestId('create-project-button').click();

    await expect(page.getByRole('heading', { name: '新建项目' }).first()).toBeVisible();
    await page.getByTestId('project-name-input').fill(projectName);
    await page.getByTestId('project-priority-select').selectOption('HIGH');
    await page.getByTestId('project-color-marketing-unit-input').fill('自动化测试营销单位');
    await page.getByTestId('project-paint-supplier-select').selectOption('巴斯夫');
    await page.getByTestId('project-vehicle-model-input').fill('轻卡测试车型');
    await page.getByTestId('project-start-date-input').fill('2026-05-07');
    await page.getByTestId('project-end-date-input').fill('2027-05-07');
    await page.getByTestId('project-description-input').fill('自动化测试项目，可归档。颜色：深海蓝');
    const createdResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/projects',
    );
    await page.getByTestId('project-submit-button').click();
    const createdResponse = await createdResponsePromise;
    expect(createdResponse.status()).toBe(201);
    const createdProject = await createdResponse.json() as { id: string; name: string };
    expect(createdProject.name).toBe(projectName);
    expect(createdProject.id).toBeTruthy();

    // The official project route now renders the R22 workspace, backed by its flow-map API.
    await expect(page).toHaveURL(new RegExp(`/projects/${createdProject.id}$`));
    await expect(page.getByRole('heading', { name: projectName, exact: true })).toBeVisible();
    await expect(page.getByText(/当前工序：反映市场需求/)).toBeVisible();
    await expect(page.getByRole('list', { name: '18 步开发流程' }).getByRole('listitem')).toHaveCount(18);
    const rereadResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === `/api/projects/${createdProject.id}/flow-map`,
    );
    await page.reload();
    const rereadResponse = await rereadResponsePromise;
    expect(rereadResponse.status()).toBe(200);
    await expect(page.getByRole('heading', { name: projectName, exact: true })).toBeVisible();
    await expect(page.getByText(/当前工序：反映市场需求/)).toBeVisible();

    await page.goto('/projects');
    await page.getByRole('button', { name: '高级筛选' }).click();
    await page.getByTestId('project-search-input').fill(projectName);
    await page.getByRole('button', { name: '应用筛选' }).click();
    await expect(page.getByTestId('project-card').filter({ hasText: projectName })).toBeVisible();

    await page.goto('/projects/timeline');
    await expectPageReady(page, 'project-timeline-board');
    await page.getByPlaceholder('搜索项目、颜色、当前节点').fill(projectName);
    await expect(page.getByTestId('project-timeline-card').filter({ hasText: projectName })).toBeVisible();
    await expect(page.getByText('当前节点：反映市场需求')).toBeVisible();
    await expect(page.getByText(/进度/).first()).toBeVisible();
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(requests.filter((request) => request.status >= 400)).toEqual([]);
    await test.info().attach('project-create-network', {
      body: JSON.stringify({ url: page.url(), projectId: createdProject.id, requests, pageErrors, consoleErrors }, null, 2),
      contentType: 'application/json',
    });
    await test.info().attach('project-create-timeline', {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    });
  });
});
