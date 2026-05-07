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
    await loginAsProjectManager(page);

    const timestamp = buildR16Timestamp();
    const projectCode = `R16-UI-${timestamp}`;
    const projectName = `${R16_PROJECT_PREFIXES.deepBlue}${timestamp}`;

    await page.goto('/projects');
    await expectPageReady(page, 'project-list-page');
    await page.getByTestId('create-project-button').click();

    await expect(page.getByRole('heading', { name: '新建项目' }).first()).toBeVisible();
    await page.getByTestId('project-code-input').fill(projectCode);
    await page.getByTestId('project-name-input').fill(projectName);
    await page.getByTestId('project-priority-select').selectOption('HIGH');
    await page.getByTestId('project-market-input').fill('自动化测试客户');
    await page.getByTestId('project-vehicle-model-input').fill('轻卡测试车型');
    await page.getByTestId('project-start-date-input').fill('2026-05-07');
    await page.getByTestId('project-end-date-input').fill('2027-05-07');
    await page.getByTestId('project-description-input').fill('自动化测试项目，可归档。颜色：深海蓝');
    await page.getByTestId('project-submit-button').click();

    await expect(page.getByRole('heading', { name: '项目详情同步状态' })).toBeVisible();
    await expect(page.getByText(projectName)).toBeVisible();
    await expect(page.getByText('当前节点', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('反映市场需求')).toBeVisible();

    await page.goto('/projects');
    await page.getByLabel('关键词').fill(projectName);
    await page.getByRole('button', { name: '应用筛选' }).click();
    await expect(page.getByTestId('project-table')).toContainText(projectName);

    await page.goto('/projects/timeline');
    await expectPageReady(page, 'project-timeline-board');
    await page.getByPlaceholder('搜索项目、颜色、当前节点').fill(projectName);
    await expect(page.getByTestId('project-timeline-card').filter({ hasText: projectName })).toBeVisible();
    await expect(page.getByText('当前节点：反映市场需求')).toBeVisible();
    await expect(page.getByText(/进度/).first()).toBeVisible();
  });
});
