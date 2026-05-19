import { expect, test } from '@playwright/test';

import {
  advanceR20ToMonthlyReviews,
  createR20ProjectByApi,
  loginAsR20Role,
  saveR20Screenshot,
  writeR20ApiSnapshot,
  writeR20CaseRecord,
} from './r20-fixtures';
import { apiJson } from './helpers';

test.describe('R20 第16步后生成12个月度评审 @r20', () => {
  test('R20-008 creates 12 monthly review instances after mass production @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR20Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR20ProjectByApi(request, 'normal');
    await advanceR20ToMonthlyReviews(request, project.id);

    const monthly = await apiJson<{
      summary: { totalPeriods: number; completedPeriods: number };
      recurringTasks: Array<{ id: string; periodLabel: string; status: string }>;
    }>(request, `/workflows/projects/${project.id}/monthly-reviews`);
    expect(monthly.summary.totalPeriods).toBe(12);
    expect(monthly.recurringTasks).toHaveLength(12);
    await writeR20ApiSnapshot(testInfo, 'monthly-review-workspace', monthly);

    await page.goto(`/projects/${project.id}/reviews`);
    await expect(page.getByTestId('monthly-review-grid').locator('.monthly-review-card')).toHaveCount(12);
    await expect(page.getByText(/已完成 \d+ \/ 12/)).toBeVisible();
    await page.getByTestId('monthly-review-grid').locator('.monthly-review-card').first().click();
    await expect(page.getByTestId('monthly-review-detail')).toContainText('关联评审记录');
    await saveR20Screenshot(page, testInfo, 'project-monthly-review-grid.png');

    await page.goto('/monthly-reviews');
    await expect(page.getByTestId('monthly-review-board')).toBeVisible();
    const projectLedgerSection = page.locator('section.page-card').filter({ hasText: project.name });
    await expect(projectLedgerSection).toBeVisible();
    await expect(projectLedgerSection.locator('.monthly-review-card')).toHaveCount(12);
    await saveR20Screenshot(page, testInfo, 'monthly-review-ledger.png');

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-008',
      scenario: '第16步批量生产完成后生成第17步12个月度评审实例',
      role: '质量管理部 / 生产部',
      project,
      totalPeriods: monthly.summary.totalPeriods,
      completedPeriods: monthly.summary.completedPeriods,
      result: 'PASS',
    });
  });
});
