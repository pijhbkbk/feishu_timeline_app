import { expect, test } from '@playwright/test';

import {
  collectR20BrowserSignals,
  expectR20PageReady,
  fetchR20ApiStatus,
  loginAsR20Role,
  saveR20Screenshot,
  writeR20CaseRecord,
} from './r20-fixtures';

test.describe('R20 首页与导览页可用性 @r20', () => {
  test('R20-001 validates core pages through real browser navigation @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    await loginAsR20Role(page, 'projectManager');
    const signals = collectR20BrowserSignals(page);

    const pages = [
      { path: '/guide', testId: 'guide-page', title: '轻卡定制颜色开发项目管理系统', screenshot: 'guide' },
      { path: '/dashboard', testId: 'dashboard-page', title: '项目进度驾驶舱', screenshot: 'dashboard' },
      { path: '/projects', testId: 'project-list-page', title: '项目列表', screenshot: 'projects' },
      {
        path: '/projects/timeline',
        testId: 'project-timeline-board',
        title: '项目时间线看板',
        screenshot: 'project-timeline',
      },
      { path: '/materials', testId: 'materials-page', title: '材料提交平台', screenshot: 'materials' },
      {
        path: '/monthly-reviews',
        testId: 'monthly-review-board',
        title: '整车色差一致性评审台账',
        screenshot: 'monthly-review',
      },
      { path: '/analytics', testId: 'analytics-page', title: '数据中心', screenshot: 'analytics' },
    ];

    for (const item of pages) {
      await page.goto(item.path);
      await expectR20PageReady(page, item.testId);
      await expect(page.locator('body')).toContainText(item.title);
      await saveR20Screenshot(page, testInfo, `${item.screenshot}.png`);
    }

    const health = await fetchR20ApiStatus(page.context().request, '/health');
    expect(health.status).toBe(200);
    signals.assertClean();

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-001',
      scenario: '首页、导览和核心页面可用性',
      role: '项目经理',
      pages: pages.map((item) => item.path),
      healthStatus: health.status,
      result: 'PASS',
    });
  });
});
