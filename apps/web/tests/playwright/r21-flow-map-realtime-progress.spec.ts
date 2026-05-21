import { expect, test } from '@playwright/test';

import {
  advanceToColorExit,
  createColorExitRecord,
  createProjectByApi,
  loginAsProjectManager,
} from './helpers';

test('R21 project realtime flow map shows topology, drawer details and refresh', async ({ page }) => {
  await loginAsProjectManager(page);
  const request = page.context().request;
  const project = await createProjectByApi(request, 'R21-FLOWMAP');

  await advanceToColorExit(request, project.id);
  await createColorExitRecord(request, project.id);

  await page.goto('/projects/flow-map');
  await expect(page.getByRole('link', { name: /流程地图/ }).first()).toBeVisible();
  await expect(page.getByTestId('projects-flow-map-portal')).toBeVisible();
  await expect(page.getByRole('heading', { name: '项目实时流程地图' }).first()).toBeVisible();
  await expect(page.getByLabel('选择项目')).toBeVisible();
  await page.getByLabel('选择项目').selectOption(project.id);
  await expect(page.getByTestId('projects-flow-map-portal')).toContainText(project.name);
  await expect(page.locator('[data-testid^="flow-map-node-"]')).toHaveCount(18);

  await page.goto(`/projects/${project.id}/flow-map`);

  await expect(page.getByRole('heading', { name: '项目实时流程地图', exact: true })).toBeVisible();
  await expect(page.getByText(project.name)).toBeVisible();
  await expect(page.locator('[data-testid^="flow-map-node-"]')).toHaveCount(18);
  await expect(page.getByText('自动并行').first()).toBeVisible();
  await expect(page.getByText('自动并行 / 非阻塞')).toBeVisible();
  await expect(page.getByText('N 退回至样车试制')).toBeVisible();
  await expect(page.getByTestId('flow-map-node-12')).toContainText('样车驾驶室评审');

  await page.getByTestId('flow-map-node-06').click();
  await expect(page.getByTestId('task-detail-drawer')).toBeVisible();
  await expect(page.getByTestId('task-detail-drawer')).toContainText('负责人');
  await expect(page.getByTestId('task-detail-drawer')).toContainText('责任部门');
  await expect(page.getByTestId('task-detail-drawer')).toContainText('截止时间');
  await expect(page.getByTestId('task-detail-drawer')).toContainText('材料与附件');
  await expect(page).toHaveURL(/taskId=/);

  await page.reload();
  await expect(page.getByTestId('task-detail-drawer')).toBeVisible();
  await page.getByRole('button', { name: '关闭工序详情' }).click();

  await page.getByTestId('flow-map-node-12').click();
  await expect(page.getByTestId('task-detail-drawer')).toContainText('第 12 步样车驾驶室评审');
  await expect(page.getByTestId('task-detail-drawer')).toContainText('不通过 / 退回');
  await page.getByRole('button', { name: '关闭工序详情' }).click();

  await page.getByTestId('flow-map-node-13').click();
  await expect(page.getByTestId('task-detail-drawer')).toContainText('固定金额');
  await expect(page.getByTestId('task-detail-drawer')).toContainText('10000 元');
  await page.getByRole('button', { name: '关闭工序详情' }).click();

  await page.getByTestId('flow-map-node-17').click();
  await expect(page.getByTestId('task-detail-drawer')).toContainText('12 个月');
  await page.getByRole('button', { name: '关闭工序详情' }).click();

  await page.getByTestId('flow-map-node-18').click();
  await expect(page.getByTestId('task-detail-drawer')).toContainText('年产量');
  await expect(page.getByTestId('task-detail-drawer')).toContainText('建议退出');
  await page.getByRole('button', { name: '关闭工序详情' }).click();

  await page.getByRole('button', { name: '只看风险节点' }).click();
  await page.getByRole('button', { name: '图例 / 筛选' }).click();
  await expect(page.getByTestId('flow-map-filter-popover')).toContainText(/当前显示 \d+ \/ 18 个节点/);
  await page.getByRole('button', { name: '图例 / 筛选' }).click();

  await page.getByRole('button', { name: '立即刷新' }).click();
  await expect(page.getByText(/^最近更新：/)).toBeVisible();

  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/Dashboard|Projects|Workflow|Complete|Reject|No data|MVP Skeleton|Workspace/);
});
