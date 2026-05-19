import { expect, test } from '@playwright/test';

import {
  advanceR20ToStep4Branches,
  createR20ProjectByApi,
  expectR20NodeCount,
  fetchR20ApiStatus,
  loginAsR20Role,
  saveR20Screenshot,
  writeR20ApiSnapshot,
  writeR20CaseRecord,
} from './r20-fixtures';
import { fetchR16Workflow, transitionR16Task } from './r16-fixtures';

test.describe('R20 第4/6步并行分支幂等 @r20', () => {
  test('R20-004 keeps step 4 and step 6 branch creation idempotent @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR20Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR20ProjectByApi(request, 'nonBlocking');

    let workflow = await advanceR20ToStep4Branches(request, project.id);
    expectR20NodeCount(workflow, 'COLOR_NUMBERING', 1);
    expectR20NodeCount(workflow, 'PAINT_PROCUREMENT', 1);

    const completedStep4 = workflow.taskHistory.find(
      (task) => task.nodeCode === 'SAMPLE_COLOR_CONFIRMATION',
    );
    expect(completedStep4).toBeTruthy();
    const duplicateStep4 = await fetchR20ApiStatus(
      request,
      `/workflows/tasks/${completedStep4!.id}/approve`,
      { method: 'POST', data: {} },
    );
    expect(duplicateStep4.status).toBeGreaterThanOrEqual(400);

    workflow = await fetchR16Workflow(request, project.id);
    expectR20NodeCount(workflow, 'COLOR_NUMBERING', 1);
    expectR20NodeCount(workflow, 'PAINT_PROCUREMENT', 1);

    await loginAsR20Role(page, 'procurement');
    workflow = await transitionR16Task(request, project.id, 'PAINT_PROCUREMENT', 'submit');
    expectR20NodeCount(workflow, 'STANDARD_BOARD_PRODUCTION', 1);
    expectR20NodeCount(workflow, 'PERFORMANCE_TEST', 1);
    expectR20NodeCount(workflow, 'FIRST_UNIT_PRODUCTION_PLAN', 1);

    const completedStep6 = workflow.taskHistory.find((task) => task.nodeCode === 'PAINT_PROCUREMENT');
    expect(completedStep6).toBeTruthy();
    const duplicateStep6 = await fetchR20ApiStatus(
      request,
      `/workflows/tasks/${completedStep6!.id}/submit`,
      { method: 'POST', data: {} },
    );
    expect(duplicateStep6.status).toBeGreaterThanOrEqual(400);

    workflow = await fetchR16Workflow(request, project.id);
    expectR20NodeCount(workflow, 'STANDARD_BOARD_PRODUCTION', 1);
    expectR20NodeCount(workflow, 'PERFORMANCE_TEST', 1);
    expectR20NodeCount(workflow, 'FIRST_UNIT_PRODUCTION_PLAN', 1);
    await writeR20ApiSnapshot(testInfo, 'workflow-after-step6', workflow);

    await page.goto(`/projects/${project.id}/workflow`);
    await expect(page.getByTestId('task-list-table')).toContainText('标准板制作、下发');
    await expect(page.getByTestId('task-list-table')).toContainText('涂料性能试验');
    await expect(page.getByTestId('task-list-table')).toContainText('首台生产计划');
    await saveR20Screenshot(page, testInfo, 'workflow-after-step6.png');

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-004',
      scenario: '第4步和第6步并行节点创建幂等',
      role: '采购部',
      project,
      duplicateStep4Status: duplicateStep4.status,
      duplicateStep6Status: duplicateStep6.status,
      result: 'PASS',
    });
  });
});
