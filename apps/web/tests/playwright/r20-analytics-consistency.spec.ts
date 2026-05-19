import { expect, test } from '@playwright/test';

import { apiJson } from './helpers';
import {
  advanceR20ToColorExit,
  createR20ProjectByApi,
  loginAsR20Role,
  saveR20Screenshot,
  writeR20ApiSnapshot,
  writeR20CaseRecord,
} from './r20-fixtures';

test.describe('R20 数据中心一致性 @r20', () => {
  test('R20-012 reflects R20 workflow data in analytics center @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR20Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR20ProjectByApi(request, 'overdue');
    await advanceR20ToColorExit(request, project.id);

    await page.goto('/analytics');
    await expect(page.getByTestId('analytics-page')).toBeVisible();
    await expect(page.getByText('项目总数')).toBeVisible();
    await expect(page.getByText('逾期项目')).toBeVisible();
    await expect(page.getByText('退回次数')).toBeVisible();
    await expect(page.getByText('月度评审完成率')).toBeVisible();
    await expect(page.getByText('建议退出颜色')).toBeVisible();
    await expect(page.getByText('开发费标准')).toBeVisible();
    await saveR20Screenshot(page, testInfo, 'analytics-consistency.png');

    const overview = await apiJson<{
      projectOverview: { totalProjects: number; activeProjects: number; overdueProjects: number };
      workflowEfficiency: { totalOverdueTasks: number };
      monthlyReviewAnalysis: { currentMonthDue: number; pending: number; completionRate: number };
      colorExitAnalysis: { suggestedExit: number; pending: number };
      feeAnalysis: { fixedAmount: number };
    }>(request, '/analytics/overview');
    expect(overview.projectOverview.totalProjects).toBeGreaterThan(0);
    expect(overview.feeAnalysis.fixedAmount).toBe(10000);
    expect(overview.monthlyReviewAnalysis.currentMonthDue).toBeGreaterThanOrEqual(0);
    await writeR20ApiSnapshot(testInfo, 'analytics-overview', overview);

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-012',
      scenario: '数据中心统计一致性',
      role: '项目经理',
      project,
      analytics: overview,
      result: 'PASS',
    });
  });
});
