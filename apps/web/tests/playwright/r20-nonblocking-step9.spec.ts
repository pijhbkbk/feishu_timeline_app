import { expect, test } from '@playwright/test';

import {
  advanceR20ToStep6Branches,
  createR20ProjectByApi,
  expectR20AllWorkflowStepsVisible,
  loginAsR20Role,
  saveR20Screenshot,
  writeR20ApiSnapshot,
  writeR20CaseRecord,
} from './r20-fixtures';
import { fetchR16Workflow, transitionR16Task } from './r16-fixtures';

test.describe('R20 第9步非阻塞主线 @r20', () => {
  test('R20-005 allows the mainline to reach step 12 while step 9 is still active @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR20Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR20ProjectByApi(request, 'nonBlocking');

    let workflow = await advanceR20ToStep6Branches(request, project.id);
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'PERFORMANCE_TEST')).toBe(true);

    await loginAsR20Role(page, 'production');
    await transitionR16Task(request, project.id, 'FIRST_UNIT_PRODUCTION_PLAN', 'submit');
    await transitionR16Task(request, project.id, 'TRIAL_PRODUCTION', 'submit');

    workflow = await fetchR16Workflow(request, project.id);
    expect(workflow.workflowInstance.currentNodeCode).toBe('CAB_REVIEW');
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'PERFORMANCE_TEST')).toBe(true);
    await writeR20ApiSnapshot(testInfo, 'step9-nonblocking-workflow', workflow);

    await page.goto(`/projects/${project.id}/workflow`);
    await expect(page.getByTestId('task-list-table')).toContainText('涂料性能试验');
    await expect(page.getByTestId('task-list-table')).toContainText('样车驾驶室评审');
    await saveR20Screenshot(page, testInfo, 'step9-nonblocking-workflow.png');

    await loginAsR20Role(page, 'projectManager');
    const card = await expectR20AllWorkflowStepsVisible(page, project.name);
    await expect(card).toContainText('涂料性能试验');
    await expect(card).toContainText('样车驾驶室评审');

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-005',
      scenario: '第9步涂料性能试验不阻塞主线',
      role: '生产部 / 涂装厂',
      project,
      expected: '第9步未完成时第10、11、12步仍可推进',
      actualCurrentNode: workflow.workflowInstance.currentNodeCode,
      result: 'PASS',
    });
  });
});
