import { expect, test } from '@playwright/test';

import {
  advanceR20ToColorExit,
  createR20ProjectByApi,
  loginAsR20Role,
  saveR20Screenshot,
  uploadR20PdfMaterial,
  writeR20CaseRecord,
} from './r20-fixtures';

test.describe('R20 第18步颜色退出治理 @r20', () => {
  test('R20-009 previews exit suggestions and requires manual final decision @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR20Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR20ProjectByApi(request, 'normal');
    await advanceR20ToColorExit(request, project.id);

    await page.goto(`/projects/${project.id}/color-exit`);
    await expect(page.getByTestId('color-exit-panel')).toBeVisible();
    await expect(page.getByTestId('color-exit-threshold-card')).toContainText('20 台');
    await expect(page.getByTestId('color-exit-form')).toContainText('人工结论');

    await page.getByLabel('年产量').fill('18');
    await expect(page.getByText('系统建议为建议退出')).toBeVisible();
    await page.getByLabel('年产量').fill('25');
    await expect(page.getByText('系统建议为建议保留')).toBeVisible();

    await page.getByLabel('年产量').fill('18');
    await page.getByLabel('退出日期').fill('2026-05-19');
    await page.getByLabel('统计年度').fill('2026');
    await page.getByLabel('退出原因').fill('年产量低于阈值');
    await page.getByLabel('人工结论').selectOption('EXIT');
    await page.getByLabel('生效日期').fill('2026-06-01');
    await page.getByLabel('退出说明').fill('R20 自动化记录：年产量低于阈值，业务人工确认退出。');
    await page.getByRole('button', { name: '新建退出记录' }).click();
    await expect(page.getByText('颜色退出记录已创建。')).toBeVisible();
    await expect(page.locator('table')).toContainText('建议退出');
    await expect(page.locator('table')).toContainText('退出');
    await saveR20Screenshot(page, testInfo, 'color-exit-created.png');

    await uploadR20PdfMaterial(page, project.id, 'r20-color-consolidation-list.pdf');
    await page.goto('/analytics');
    await expect(page.getByTestId('analytics-page')).toContainText('建议退出颜色');

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-009',
      scenario: '第18步颜色退出治理',
      role: '项目经理 / 管理层',
      project,
      expected: '系统根据年产量给建议，人工结论由用户选择后保存',
      result: 'PASS',
    });
  });
});
