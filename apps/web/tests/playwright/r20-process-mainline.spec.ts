import { expect, test } from '@playwright/test';

import {
  advanceR20ToStep4Branches,
  createR20ProjectByApi,
  expectR20AllWorkflowStepsVisible,
  expectR20NodeCount,
  loginAsR20Role,
  saveR20Screenshot,
  uploadR20PdfMaterial,
  writeR20ApiSnapshot,
  writeR20CaseRecord,
} from './r20-fixtures';
import { fetchR16Workflow } from './r16-fixtures';

test.describe('R20 第1步到第4步主线推进 @r20', () => {
  test('R20-003 advances steps 1-4 and creates step 5 and 6 branches @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR20Role(page, 'marketing');
    const request = page.context().request;
    const project = await createR20ProjectByApi(request, 'normal');

    await uploadR20PdfMaterial(page, project.id, 'r20-step1-customer-color-sample.pdf');
    await advanceR20ToStep4Branches(request, project.id);

    const workflow = await fetchR16Workflow(request, project.id);
    expectR20NodeCount(workflow, 'COLOR_NUMBERING', 1);
    expectR20NodeCount(workflow, 'PAINT_PROCUREMENT', 1);
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'COLOR_NUMBERING' && !task.isPrimary)).toBe(true);
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'PAINT_PROCUREMENT' && task.isPrimary)).toBe(true);
    await writeR20ApiSnapshot(testInfo, 'workflow-after-step4', workflow);

    await page.goto(`/projects/${project.id}/workflow`);
    await expect(page.getByTestId('project-workflow-page')).toBeVisible();
    await expect(page.getByTestId('task-list-table')).toContainText('新颜色取号');
    await expect(page.getByTestId('task-list-table')).toContainText('涂料采购');
    await saveR20Screenshot(page, testInfo, 'workflow-after-step4.png');

    await expectR20AllWorkflowStepsVisible(page, project.name);

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-003',
      scenario: '第1步到第4步主线推进',
      role: '营销公司、涂装工艺部',
      project,
      expected: '第4步完成后自动并行生成第5步和第6步',
      actual: workflow.activeTasks.map((task) => ({
        nodeCode: task.nodeCode,
        nodeName: task.nodeName,
        isPrimary: task.isPrimary,
      })),
      result: 'PASS',
    });
  });
});
