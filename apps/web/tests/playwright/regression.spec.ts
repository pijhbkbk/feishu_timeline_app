import { Buffer } from 'node:buffer';

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
  const request = page.context().request;
  const project = await createProjectByApi(request, 'BROWSER');

  await page.goto(`/projects/${project.id}/workflow`);

  await expect(page.getByRole('heading', { name: '流程图视图' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '任务状态看板' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '截止日历' })).toBeVisible();
  await expect(page.getByText('展示边界')).toBeVisible();
});

test('shows Chinese project cockpit and timeline board', async ({ page }) => {
  await loginAsProjectManager(page);
  const request = page.context().request;
  const project = await createProjectByApi(request, 'R14-TIMELINE');

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: '项目进度驾驶舱' })).toBeVisible();
  await expect(page.getByText('项目总数')).toBeVisible();
  await expect(page.getByRole('button', { name: '立即刷新' }).first()).toBeVisible();
  await page.getByRole('button', { name: '立即刷新' }).first().click();
  await expect(page.getByText(/^最近更新：/).first()).toBeVisible();

  await page.goto('/projects/timeline');
  await expect(page.getByRole('heading', { name: '项目时间线看板', exact: true })).toBeVisible();
  await expect(page.getByText(project.name)).toBeVisible();
  await expect(page.getByText('当前节点').first()).toBeVisible();
  await expect(page.getByText('进度').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '立即刷新' })).toBeVisible();
  await page.getByRole('button', { name: '立即刷新' }).click();
  await expect(page.getByLabel(/进度/).first()).toBeVisible();

  const dashboardBody = await page.locator('body').innerText();
  expect(dashboardBody).not.toMatch(/Dashboard|Projects|Workflow|Complete|Reject|No data|MVP Skeleton|Workspace/);
});

test('shows PPT UI routes for projects, materials, tasks and analytics', async ({ page }) => {
  await loginAsProjectManager(page);
  const request = page.context().request;
  const project = await createProjectByApi(request, 'PPTUI');

  await page.goto('/projects');
  await expect(page.locator('h1', { hasText: '项目列表' })).toBeVisible();
  await expect(page.getByLabel('关键词')).toBeVisible();
  await expect(page.getByLabel('责任部门')).toBeVisible();
  await expect(page.getByText('颜色名称')).toBeVisible();

  await page.goto(`/projects/${project.id}/overview`);
  await expect(page.getByRole('heading', { name: '项目详情同步状态' })).toBeVisible();
  await expect(page.getByRole('button', { name: '立即刷新' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '项目概览', exact: true })).toBeVisible();

  await page.goto(`/projects/${project.id}/tasks`);
  await expect(page.getByRole('heading', { name: '工序清单与详情抽屉' })).toBeVisible();
  await expect(page.getByText('节点详情与轮次历史')).toBeVisible();

  await page.goto('/materials');
  await expect(page.getByRole('heading', { name: '材料提交平台', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '立即刷新' })).toBeVisible();

  await page.goto(`/projects/${project.id}/materials`);
  await expect(page.getByRole('heading', { name: '上传项目材料' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '项目材料列表' })).toBeVisible();

  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: '数据中心', exact: true })).toBeVisible();
  await expect(page.getByText('流程效率', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '立即刷新' })).toBeVisible();
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
    name: 'cabin-review.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% R13 attachment payload\n'),
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
  await expect(page.getByText(/已完成 \d+ \/ 12/)).toBeVisible();
  await expect(page.locator('[data-testid="monthly-review-grid"] .monthly-review-card')).toHaveCount(
    12,
  );

  await page.locator('[data-testid="monthly-review-grid"] .monthly-review-card').first().click();
  await expect(page.getByTestId('monthly-review-detail')).toContainText('关联评审记录');

  await page.goto('/monthly-reviews');
  await expect(
    page.getByRole('heading', { name: '整车色差一致性评审台账', exact: true }),
  ).toBeVisible();
  const monthlyProjectSection = page.locator('section.page-card').filter({ hasText: project.name });
  await expect(monthlyProjectSection).toBeVisible();
  await expect(monthlyProjectSection.locator('.monthly-review-card')).toHaveCount(12);
  await expect(page.getByText('本月任务').first()).toBeVisible();
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
