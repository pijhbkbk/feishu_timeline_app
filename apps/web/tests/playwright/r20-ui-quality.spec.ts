import { expect, test } from '@playwright/test';

import {
  advanceR20ToColorExit,
  createR20ProjectByApi,
  expectR20PageReady,
  loginAsR20Role,
  saveR20Screenshot,
  writeR20CaseRecord,
} from './r20-fixtures';

test.describe('R20 UI 中文化与交互质量 @r20', () => {
  test('R20-013 captures desktop and mobile UI quality evidence @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR20Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR20ProjectByApi(request, 'normal');
    await advanceR20ToColorExit(request, project.id);

    await page.setViewportSize({ width: 1440, height: 1000 });
    const desktopPages = [
      { path: '/dashboard', testId: 'dashboard-page', screenshot: 'dashboard-1440' },
      { path: '/projects', testId: 'project-list-page', screenshot: 'projects-1440' },
      { path: '/projects/timeline', testId: 'project-timeline-board', screenshot: 'timeline-1440' },
      { path: `/projects/${project.id}/overview`, testId: 'project-overview-page', screenshot: 'project-detail-1440' },
      { path: `/projects/${project.id}/workflow`, testId: 'project-workflow-page', screenshot: 'workflow-1440' },
      { path: `/projects/${project.id}/tasks`, testId: 'project-tasks-page', screenshot: 'tasks-1440' },
      { path: `/projects/${project.id}/materials`, testId: 'materials-page', screenshot: 'materials-1440' },
      { path: '/monthly-reviews', testId: 'monthly-review-board', screenshot: 'monthly-review-1440' },
      { path: '/analytics', testId: 'analytics-page', screenshot: 'analytics-1440' },
    ];

    for (const item of desktopPages) {
      await page.goto(item.path);
      await expectR20PageReady(page, item.testId);
      await expectNoHorizontalOverflow(page);
      await saveR20Screenshot(page, testInfo, `${item.screenshot}.png`);
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/projects/timeline');
    await expectR20PageReady(page, 'project-timeline-board');
    await page.getByPlaceholder('搜索项目、颜色、当前节点').fill(project.name);
    const card = page.getByTestId('project-timeline-card').filter({ hasText: project.name });
    await expect(card).toBeVisible();
    await card.getByTestId('timeline-node-12').click();
    await expect(page.getByTestId('task-detail-drawer')).toContainText('负责人');
    await expect(page.getByTestId('task-detail-drawer')).toContainText('责任部门');
    await expect(page.getByTestId('task-detail-drawer')).toContainText('流转记录');
    await saveR20Screenshot(page, testInfo, 'task-drawer-1920.png');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/projects/timeline');
    await expectR20PageReady(page, 'project-timeline-board');
    await expectNoHorizontalOverflow(page);
    await saveR20Screenshot(page, testInfo, 'timeline-mobile.png');

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-013',
      scenario: 'UI 中文化、状态颜色、抽屉交互、1440/1920/移动端基本可读性',
      role: '项目经理',
      project,
      result: 'PASS',
    });
  });
});

async function expectNoHorizontalOverflow(page: { evaluate: <T>(callback: () => T) => Promise<T> }) {
  const hasOverflow = await page.evaluate(() => {
    const root = document.documentElement;

    return root.scrollWidth > root.clientWidth + 8;
  });

  expect(hasOverflow).toBe(false);
}
