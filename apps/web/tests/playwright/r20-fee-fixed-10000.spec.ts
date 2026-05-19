import { expect, test } from '@playwright/test';

import {
  advanceR20ToAfterCabReviewApproved,
  createR20ProjectByApi,
  fetchR20ApiStatus,
  loginAsR20Role,
  saveR20Screenshot,
  writeR20ApiSnapshot,
  writeR20CaseRecord,
} from './r20-fixtures';
import { fetchR16Workflow, transitionR16Task } from './r16-fixtures';

test.describe('R20 第13步固定收费金额 @r20', () => {
  test('R20-007 locks development fee at 10000 and keeps it non-blocking @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR20Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR20ProjectByApi(request, 'normal');
    await advanceR20ToAfterCabReviewApproved(request, project.id);

    await loginAsR20Role(page, 'finance');
    await page.goto(`/projects/${project.id}/fees`);
    await expect(page.getByRole('heading', { name: '收费记录表单' })).toBeVisible();
    await expect(page.getByText('固定金额为 10000 元')).toBeVisible();
    await expect(page.getByLabel('金额')).toHaveValue('10000');
    await expect(page.getByLabel('金额')).toBeDisabled();
    await expect(page.locator('body')).not.toContainText('8600');
    await saveR20Screenshot(page, testInfo, 'fee-fixed-10000.png');

    const tamperedFee = await fetchR20ApiStatus(request, `/projects/${project.id}/fees`, {
      method: 'POST',
      data: {
        feeType: 'PAINT_DEVELOPMENT',
        amount: 1,
        currency: 'CNY',
        payer: 'R20 自动化付款方',
        recordedAt: '2026-05-19T09:00:00.000Z',
        note: 'R20 金额篡改测试',
      },
    });
    expect(tamperedFee.status).toBe(400);

    const createdFee = await fetchR20ApiStatus(request, `/projects/${project.id}/fees`, {
      method: 'POST',
      data: {
        feeType: 'PAINT_DEVELOPMENT',
        amount: 10000,
        currency: 'CNY',
        payer: 'R20 自动化付款方',
        recordedAt: '2026-05-19T09:00:00.000Z',
        note: 'R20 收费凭证已通过附件平台留存。',
      },
    });
    expect(createdFee.status).toBe(201);

    await loginAsR20Role(page, 'projectManager');
    await transitionR16Task(request, project.id, 'COLOR_CONSISTENCY_REVIEW', 'approve');
    const workflow = await fetchR16Workflow(request, project.id);
    expect(workflow.workflowInstance.currentNodeCode).toBe('MASS_PRODUCTION_PLAN');
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'DEVELOPMENT_ACCEPTANCE')).toBe(true);
    await writeR20ApiSnapshot(testInfo, 'fee-nonblocking-workflow', workflow);

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-007',
      scenario: '第13步颜色开发收费固定10000元且不阻塞主线',
      role: '财务部',
      project,
      tamperedFeeStatus: tamperedFee.status,
      createdFeeStatus: createdFee.status,
      result: 'PASS',
    });
  });
});
