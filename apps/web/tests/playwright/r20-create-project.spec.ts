import { expect, test } from '@playwright/test';

import {
  createR20ProjectViaUi,
  expectR20AllWorkflowStepsVisible,
  loginAsR20Role,
  saveR20Screenshot,
  writeR20CaseRecord,
} from './r20-fixtures';

test.describe('R20 新建颜色开发项目 @r20', () => {
  test('R20-002 creates a custom color project from the real project form @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    await loginAsR20Role(page, 'marketing');

    const project = await createR20ProjectViaUi(page, 'normal');
    await saveR20Screenshot(page, testInfo, 'project-created-detail.png');

    const projectId = page.url().match(/\/projects\/([^/]+)\//)?.[1];
    expect(projectId).toBeTruthy();

    await page.goto('/projects');
    await page.getByLabel('关键词').fill(project.name);
    await page.getByRole('button', { name: '应用筛选' }).click();
    const projectRow = page.getByTestId('project-card').filter({ hasText: project.name });
    await expect(projectRow).toBeVisible();
    await expect(projectRow).toContainText('反映市场需求');
    await saveR20Screenshot(page, testInfo, 'project-list-search.png');

    await page.goto(`/projects/${projectId}/overview`);
    await expect(page.getByTestId('project-overview-page')).toBeVisible();
    await expect(page.locator('body')).toContainText('反映市场需求');

    await expectR20AllWorkflowStepsVisible(page, project.name);
    await saveR20Screenshot(page, testInfo, 'timeline-18-steps.png');

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-002',
      scenario: '新建颜色开发项目',
      role: '营销公司 / 项目经理',
      project,
      expected: ['项目创建成功', '列表可搜索', '详情可见', '时间线展示18步节点'],
      result: 'PASS',
    });
  });
});
