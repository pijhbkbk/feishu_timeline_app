import { expect, test } from '@playwright/test';

import { loginAsProjectManager } from './helpers';
import {
  collectSevereBrowserSignals,
  createR16ProjectByApi,
  expectNoHorizontalOverflow,
  expectPageReady,
  R16_PROJECT_PREFIXES,
  saveR16Screenshot,
} from './r16-fixtures';

test.describe('R16 中文 UI 与页面质量验收', () => {
  test('R16 Chinese UI pages are accessible without temporary English placeholders', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAsProjectManager(page);

    const signals = collectSevereBrowserSignals(page);
    const pages = [
      { path: '/dashboard', title: '项目进度驾驶舱', testId: 'dashboard-page', screenshot: 'dashboard.png' },
      { path: '/projects', title: '项目列表', testId: 'project-list-page', screenshot: 'projects.png' },
      {
        path: '/projects/timeline',
        title: '项目时间线看板',
        testId: 'project-timeline-board',
        screenshot: 'timeline-board.png',
      },
      { path: '/materials', title: '材料提交平台', testId: 'materials-page', screenshot: 'materials.png' },
      {
        path: '/monthly-reviews',
        title: '整车色差一致性评审台账',
        testId: 'monthly-review-board',
        screenshot: 'monthly-reviews.png',
      },
      { path: '/analytics', title: '数据中心', testId: 'analytics-page', screenshot: 'analytics.png' },
    ];

    for (const item of pages) {
      await page.goto(item.path);
      await expect(page.locator('main').getByText(item.title, { exact: true }).first()).toBeVisible();
      await expectPageReady(page, item.testId);
      await expectNoHorizontalOverflow(page);
      await saveR16Screenshot(page, item.screenshot);
    }

    signals.assertClean();
  });

  test('R16 project detail, workflow, tasks and color exit pages keep readable layout', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAsProjectManager(page);
    const request = page.context().request;
    const project = await createR16ProjectByApi(request, {
      prefix: R16_PROJECT_PREFIXES.auroraWhite,
      colorName: '极光白',
    });

    const pages = [
      { path: `/projects/${project.id}/overview`, testId: 'project-overview-page', screenshot: 'project-detail.png' },
      { path: `/projects/${project.id}/workflow`, testId: 'project-workflow-page', screenshot: 'workflow.png' },
      { path: `/projects/${project.id}/tasks`, testId: 'project-tasks-page', screenshot: 'tasks.png' },
      { path: `/projects/${project.id}/materials`, testId: 'materials-page', screenshot: 'project-materials.png' },
      { path: `/projects/${project.id}/color-exit`, testId: 'color-exit-panel', screenshot: 'color-exit.png' },
    ];

    for (const item of pages) {
      await page.goto(item.path);
      await expectPageReady(page, item.testId);
      await expectNoHorizontalOverflow(page);
      await saveR16Screenshot(page, item.screenshot);
    }
  });
});
