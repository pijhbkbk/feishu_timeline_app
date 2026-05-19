import { Buffer } from 'node:buffer';

import { expect, test } from '@playwright/test';

import {
  advanceToCabinReview,
  advanceToColorExit,
  advanceToMonthlyReview,
  apiJson,
  createColorExitRecord,
  loginAsProjectManager,
} from './helpers';
import {
  createR16ProjectByApi,
  fetchR16Workflow,
  getR16Node,
  R16_FLOW_NODES,
  R16_PROJECT_PREFIXES,
  transitionR16Task,
  uploadR16ProjectMaterialViaUi,
} from './r16-fixtures';

test.describe('R16 18步业务规则网页验收', () => {
  test('R16 verifies steps 1-6, step 9 non-blocking and material upload through real pages', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await loginAsProjectManager(page);
    const request = page.context().request;
    const project = await createR16ProjectByApi(request, {
      prefix: R16_PROJECT_PREFIXES.galaxySilver,
      colorName: '星河银',
    });

    await uploadR16ProjectMaterialViaUi(
      page,
      project.id,
      'r16-step-1-color-sample.txt',
      '客户提供的颜色样板',
    );

    await page.goto(`/projects/${project.id}/workflow`);
    await expect(page.getByTestId('project-workflow-page')).toBeVisible();
    await expect(page.getByTestId('task-list-table')).toContainText(getR16Node(1).name);

    await transitionR16Task(request, project.id, 'PROJECT_INITIATION', 'submit');
    await page.goto(`/projects/${project.id}/workflow`);
    await expect(page.getByTestId('task-list-table')).toContainText(getR16Node(2).name);

    await transitionR16Task(request, project.id, 'DEVELOPMENT_REPORT', 'submit');
    await page.goto(`/projects/${project.id}/workflow`);
    await expect(page.getByTestId('task-list-table')).toContainText(getR16Node(3).name);

    await transitionR16Task(request, project.id, 'PAINT_DEVELOPMENT', 'submit');
    await page.goto(`/projects/${project.id}/workflow`);
    await expect(page.getByTestId('task-list-table')).toContainText(getR16Node(4).name);

    await transitionR16Task(request, project.id, 'SAMPLE_COLOR_CONFIRMATION', 'approve');
    await page.goto(`/projects/${project.id}/workflow`);
    await expect(page.getByTestId('task-list-table')).toContainText(getR16Node(5).name);
    await expect(page.getByTestId('task-list-table')).toContainText(getR16Node(6).name);

    let workflow = await fetchR16Workflow(request, project.id);
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'COLOR_NUMBERING' && !task.isPrimary)).toBe(true);
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'PAINT_PROCUREMENT' && task.isPrimary)).toBe(true);

    await transitionR16Task(request, project.id, 'PAINT_PROCUREMENT', 'submit');
    workflow = await fetchR16Workflow(request, project.id);
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'STANDARD_BOARD_PRODUCTION' && !task.isPrimary)).toBe(true);
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'PERFORMANCE_TEST' && !task.isPrimary)).toBe(true);
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'FIRST_UNIT_PRODUCTION_PLAN' && task.isPrimary)).toBe(true);

    await transitionR16Task(request, project.id, 'FIRST_UNIT_PRODUCTION_PLAN', 'submit');
    workflow = await fetchR16Workflow(request, project.id);
    expect(workflow.workflowInstance.currentNodeCode).toBe('TRIAL_PRODUCTION');
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'PERFORMANCE_TEST')).toBe(true);

    await transitionR16Task(request, project.id, 'TRIAL_PRODUCTION', 'submit');
    workflow = await fetchR16Workflow(request, project.id);
    expect(workflow.workflowInstance.currentNodeCode).toBe('CAB_REVIEW');

    await page.goto('/projects/timeline');
    await page.getByPlaceholder('搜索项目、颜色、当前节点').fill(project.name);
    const card = page.getByTestId('project-timeline-card').filter({ hasText: project.name });
    await expect(card).toContainText('样车驾驶室评审');
    await expect(card).toContainText('涂料性能试验');

    const timeline = await apiJson<{
      nodes: Array<{ stepNumber: number; nodeCode: string; nodeName: string }>;
    }>(request, `/projects/${project.id}/timeline`);
    expect(timeline.nodes.map((node) => `${node.stepNumber}:${node.nodeName}`)).toEqual(
      R16_FLOW_NODES.map((node) => `${node.step}:${node.name}`),
    );
  });

  test('R16 verifies step 12 reject creates round 2 and approval creates steps 13 and 14', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await loginAsProjectManager(page);
    const request = page.context().request;
    const project = await createR16ProjectByApi(request, {
      prefix: R16_PROJECT_PREFIXES.deepBlue,
      colorName: '深海蓝',
    });

    await advanceToCabinReview(request, project.id);
    await page.goto(`/projects/${project.id}/reviews`);
    await expect(page.getByTestId('sample-cab-review-panel')).toBeVisible();

    const cabinForm = page.locator('section.page-card').filter({ hasText: '驾驶室评审表单' }).first();
    await cabinForm.getByTestId('cabin-review-date-input').fill('2026-05-07');
    await cabinForm.getByTestId('cabin-review-reviewer-select').selectOption({ index: 1 });
    await cabinForm.getByTestId('cabin-review-comment-input').fill('整改要求：重新试制样车并复核驾驶室色差。整改责任人：自动化测试责任人。');
    await cabinForm.getByTestId('cabin-review-conclusion-select').selectOption('REJECTED');
    await cabinForm.getByTestId('cabin-review-save-button').click();
    await expect(page.getByText('驳回时必须填写原因。')).toBeVisible();

    await cabinForm.getByTestId('cabin-review-reject-reason-input').fill('颜色一致性不足');
    await cabinForm.getByTestId('cabin-review-save-button').click();
    await expect(page.getByText('驾驶室评审记录已创建。')).toBeVisible();

    const historyTable = page.getByTestId('cabin-review-history-table');
    await historyTable.locator('input[type="file"]').first().setInputFiles({
      name: 'r16-cab-review.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% 评审报告与样车照片\n'),
    });
    await expect(page.getByText(/已上传附件/)).toBeVisible();
    await historyTable.getByRole('button', { name: '提交' }).first().click();
    await expect(page.getByText('驾驶室评审记录已提交。')).toBeVisible();
    await historyTable.getByRole('button', { name: '驳回' }).first().click();
    await expect(page.getByText('驾驶室评审已驳回，流程已退回样车试制。')).toBeVisible();

    let workflow = await fetchR16Workflow(request, project.id);
    const roundTwoTrial = workflow.activeTasks.find(
      (task) => task.nodeCode === 'TRIAL_PRODUCTION' && task.taskRound === 2,
    );
    expect(roundTwoTrial).toBeTruthy();

    await transitionR16Task(request, project.id, 'TRIAL_PRODUCTION', 'submit');
    await transitionR16Task(request, project.id, 'CAB_REVIEW', 'approve');
    workflow = await fetchR16Workflow(request, project.id);
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'DEVELOPMENT_ACCEPTANCE' && !task.isPrimary)).toBe(true);
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'COLOR_CONSISTENCY_REVIEW' && task.isPrimary)).toBe(true);

    await page.goto(`/projects/${project.id}/tasks`);
    await expect(page.getByTestId('task-list-table')).toContainText('样车试制');
    await expect(page.getByTestId('task-list-table')).toContainText('第 2 轮');
  });

  test('R16 verifies fixed fee, monthly review generation, color exit and analytics pages', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await loginAsProjectManager(page);
    const request = page.context().request;

    const monthlyProject = await createR16ProjectByApi(request, {
      prefix: R16_PROJECT_PREFIXES.galaxySilver,
      colorName: '星河银',
    });
    await advanceToCabinReview(request, monthlyProject.id);
    await transitionR16Task(request, monthlyProject.id, 'CAB_REVIEW', 'approve');

    await page.goto(`/projects/${monthlyProject.id}/fees`);
    await expect(page.getByRole('heading', { name: '收费记录表单' })).toBeVisible();
    await expect(page.getByText('固定金额为 10000 元')).toBeVisible();
    await expect(page.getByLabel('金额')).toHaveValue('10000');
    await expect(page.getByLabel('金额')).toBeDisabled();
    await expect(page.locator('body')).not.toContainText('8600');

    await transitionR16Task(request, monthlyProject.id, 'COLOR_CONSISTENCY_REVIEW', 'approve');
    await transitionR16Task(request, monthlyProject.id, 'MASS_PRODUCTION_PLAN', 'submit');
    await transitionR16Task(request, monthlyProject.id, 'MASS_PRODUCTION', 'submit');

    await page.goto(`/projects/${monthlyProject.id}/reviews`);
    await expect(page.getByTestId('monthly-review-grid').locator('.monthly-review-card')).toHaveCount(12);
    await expect(page.getByText(/已完成 \d+ \/ 12/)).toBeVisible();

    await page.goto('/monthly-reviews');
    await expect(page.getByTestId('monthly-review-board')).toBeVisible();
    await expect(page.getByTestId('monthly-review-board-grid').locator('.monthly-review-card')).toHaveCount(12);

    const exitProject = await createR16ProjectByApi(request, {
      prefix: R16_PROJECT_PREFIXES.auroraWhite,
      colorName: '极光白',
    });
    await advanceToColorExit(request, exitProject.id);
    await createColorExitRecord(request, exitProject.id);

    await page.goto(`/projects/${exitProject.id}/color-exit`);
    await expect(page.getByTestId('color-exit-panel')).toBeVisible();
    await expect(page.getByTestId('color-exit-suggestion-card')).toContainText('建议退出');
    await expect(page.getByText('当前阈值 20 台')).toBeVisible();

    await page.getByLabel('年产量').fill('25');
    await expect(page.getByText('系统建议为建议保留')).toBeVisible();
    await page.getByLabel('年产量').fill('18');
    await expect(page.getByText('系统建议为建议退出')).toBeVisible();

    await uploadR16ProjectMaterialViaUi(
      page,
      exitProject.id,
      'r16-color-exit-list.txt',
      '颜色整合清单',
    );

    await page.goto('/analytics');
    await expect(page.getByTestId('analytics-page')).toBeVisible();
    await expect(page.getByText('项目总数')).toBeVisible();
    await expect(page.getByText('逾期项目')).toBeVisible();
    await expect(page.getByText('退回次数')).toBeVisible();
    await expect(page.getByText('月度评审完成率')).toBeVisible();
    await expect(page.getByText('建议退出颜色')).toBeVisible();
    await expect(page.getByText('开发费标准')).toBeVisible();
  });
});
