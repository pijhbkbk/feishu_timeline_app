import { Buffer } from 'node:buffer';

import { expect, test } from '@playwright/test';

import { advanceToCabinReview } from './helpers';
import {
  createR20ProjectByApi,
  loginAsR20Role,
  saveR20Screenshot,
  writeR20ApiSnapshot,
  writeR20CaseRecord,
} from './r20-fixtures';
import { fetchR16Workflow, transitionR16Task } from './r16-fixtures';

test.describe('R20 第12步评审退回与新轮次 @r20', () => {
  test('R20-006 rejects cabin review with required reason and creates round 2 @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    await loginAsR20Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR20ProjectByApi(request, 'rework');
    await advanceToCabinReview(request, project.id);

    await loginAsR20Role(page, 'quality');
    await page.goto(`/projects/${project.id}/reviews`);
    await expect(page.getByTestId('sample-cab-review-panel')).toBeVisible();

    const cabinForm = page.locator('section.page-card').filter({ hasText: '驾驶室评审表单' }).first();
    await cabinForm.getByTestId('cabin-review-date-input').fill('2026-05-19');
    await cabinForm.getByTestId('cabin-review-reviewer-select').selectOption({ index: 1 });
    await cabinForm.getByTestId('cabin-review-comment-input').fill('整改要求：重新试制样车并复核驾驶室色差。整改责任人：R20 质量责任人。');
    await cabinForm.getByTestId('cabin-review-conclusion-select').selectOption('REJECTED');
    await cabinForm.getByTestId('cabin-review-save-button').click();
    await expect(page.getByText('驳回时必须填写原因。')).toBeVisible();

    await cabinForm.getByTestId('cabin-review-reject-reason-input').fill('颜色一致性不足');
    await cabinForm.getByTestId('cabin-review-save-button').click();
    await expect(page.getByText('驾驶室评审记录已创建。')).toBeVisible();

    const historyTable = page.getByTestId('cabin-review-history-table');
    await historyTable.locator('input[type="file"]').first().setInputFiles({
      name: 'r20-cab-review-rework.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% R20 评审报告与样车照片\n'),
    });
    await expect(page.getByText(/已上传附件/)).toBeVisible();
    await historyTable.getByRole('button', { name: '提交' }).first().click();
    await expect(page.getByText('驾驶室评审记录已提交。')).toBeVisible();
    await historyTable.getByRole('button', { name: '驳回' }).first().click();
    await expect(page.getByText('驾驶室评审已驳回，流程已退回样车试制。')).toBeVisible();
    await saveR20Screenshot(page, testInfo, 'step12-rejected.png');

    let workflow = await fetchR16Workflow(request, project.id);
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'TRIAL_PRODUCTION' && task.taskRound === 2)).toBe(true);
    await writeR20ApiSnapshot(testInfo, 'workflow-after-step12-reject', workflow);

    await loginAsR20Role(page, 'production');
    await transitionR16Task(request, project.id, 'TRIAL_PRODUCTION', 'submit');
    await loginAsR20Role(page, 'quality');
    workflow = await transitionR16Task(request, project.id, 'CAB_REVIEW', 'approve');
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'DEVELOPMENT_ACCEPTANCE' && !task.isPrimary)).toBe(true);
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'COLOR_CONSISTENCY_REVIEW' && task.isPrimary)).toBe(true);

    await page.goto(`/projects/${project.id}/tasks`);
    await expect(page.getByTestId('task-list-table')).toContainText('第 2 轮');
    await saveR20Screenshot(page, testInfo, 'step12-round2-passed.png');

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-006',
      scenario: '第12步评审不通过退回第11步并生成新轮次',
      role: '质量管理部',
      project,
      expected: '不填写原因不能提交，填写后退回第11步第2轮；第12步通过后生成第13/14步',
      result: 'PASS',
    });
  });
});
