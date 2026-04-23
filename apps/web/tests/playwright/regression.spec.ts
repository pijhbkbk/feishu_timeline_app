import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import {
  advanceToCabinReview,
  advanceToColorExit,
  advanceToMonthlyReview,
  createColorExitRecord,
  createProjectByApi,
  loginAsProjectManager,
} from './helpers';

test('login page exposes feishu and mock auth entries', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: '登录系统' })).toBeVisible();
  await expect(page.getByTestId('feishu-login-button')).toBeVisible();
  await expect(page.getByTestId('mock-login-button')).toBeVisible();
});

test('can create a project and open workflow browser views', async ({ page }) => {
  await loginAsProjectManager(page);

  await page.goto('/projects/new');
  await page.getByTestId('project-code-input').fill(`UI-${Date.now()}-${randomUUID().slice(0, 4)}`);
  await page.getByTestId('project-name-input').fill('R13 浏览器创建项目');
  await page.getByLabel('计划开始日期').fill('2026-04-20');
  await page.getByLabel('计划结束日期').fill('2027-04-20');
  await page.getByTestId('project-submit-button').click();

  await page.waitForURL(/\/projects\/[^/]+\/overview/);
  await page.getByRole('link', { name: '查看流程页' }).click();

  await expect(page.getByRole('heading', { name: '流程图视图' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '任务状态看板' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '截止日历' })).toBeVisible();
  await expect(page.getByText('展示边界')).toBeVisible();
});

test('can reject cabin review, upload attachment and see a new round', async ({ page }) => {
  await loginAsProjectManager(page);
  const request = page.context().request;
  const project = await createProjectByApi(request, 'CABIN');

  await advanceToCabinReview(request, project.id);

  await page.goto(`/projects/${project.id}/reviews`);
  const cabinForm = page.locator('section.page-card').filter({ hasText: '驾驶室评审表单' }).first();

  await expect(cabinForm.getByRole('heading', { name: '驾驶室评审表单' })).toBeVisible();
  await cabinForm.getByTestId('cabin-review-date-input').fill('2026-04-23');
  await cabinForm.getByTestId('cabin-review-reviewer-select').selectOption({ index: 1 });
  await cabinForm.getByTestId('cabin-review-conclusion-select').selectOption('REJECTED');
  await cabinForm
    .getByTestId('cabin-review-comment-input')
    .fill('整改要求：重新打样并复核。整改责任人：项目经理。');
  await cabinForm.getByTestId('cabin-review-reject-reason-input').fill('驾驶室外观色差未通过。');
  await cabinForm.getByTestId('cabin-review-save-button').click();

  await expect(page.getByText('驾驶室评审记录已创建。')).toBeVisible();

  const historyTable = page.getByTestId('cabin-review-history-table');
  await historyTable.locator('input[type="file"]').first().setInputFiles({
    name: 'cabin-review.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('R13 attachment payload'),
  });
  await expect(page.getByText(/已上传附件/)).toBeVisible();

  await historyTable.getByRole('button', { name: '提交' }).first().click();
  await expect(page.getByText('驾驶室评审记录已提交。')).toBeVisible();

  await historyTable.getByRole('button', { name: '驳回' }).first().click();
  await expect(page.getByText('驾驶室评审已驳回，流程已退回样车试制。')).toBeVisible();

  await page.goto(`/projects/${project.id}/workflow`);
  await expect(page.getByText('第 2 轮').first()).toBeVisible();
});

test('shows 12 monthly review instances after mass production', async ({ page }) => {
  await loginAsProjectManager(page);
  const request = page.context().request;
  const project = await createProjectByApi(request, 'MONTHLY');

  await advanceToMonthlyReview(request, project.id);

  await page.goto(`/projects/${project.id}/reviews`);
  await expect(page.getByRole('heading', { name: '第 17 步月度评审台账' })).toBeVisible();
  await expect(page.locator('[data-testid="monthly-review-grid"] .monthly-review-card')).toHaveCount(
    12,
  );

  await page.locator('[data-testid="monthly-review-grid"] .monthly-review-card').first().click();
  await expect(page.getByTestId('monthly-review-detail')).toContainText('关联评审记录');
});

test('shows color exit threshold, suggestion and completion entry', async ({ page }) => {
  await loginAsProjectManager(page);
  const request = page.context().request;
  const project = await createProjectByApi(request, 'EXIT');

  await advanceToColorExit(request, project.id);
  await createColorExitRecord(request, project.id);

  await page.goto(`/projects/${project.id}/color-exit`);

  await expect(page.getByRole('heading', { name: '颜色退出表单' })).toBeVisible();
  await expect(page.getByTestId('color-exit-form')).toContainText('录入口径');
  await expect(page.getByTestId('color-exit-threshold-card')).toContainText('系统退出阈值');
  await expect(page.getByTestId('color-exit-suggestion-card')).toContainText('建议退出');
  await expect(page.getByRole('button', { name: '完成颜色退出' })).toBeVisible();
});
