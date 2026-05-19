import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  advanceToColorExit,
  createColorExitRecord,
  loginAsProjectManager,
} from '../tests/playwright/helpers';
import {
  createR16ProjectByApi,
  R16_PROJECT_PREFIXES,
} from '../tests/playwright/r16-fixtures';

test.describe('R17 时间线节点交互增强', () => {
  test('项目时间线节点打开工序详情抽屉并可通过 taskId 恢复', async ({ page }) => {
    test.setTimeout(180_000);
    await loginAsProjectManager(page);
    const request = page.context().request;
    const project = await createR16ProjectByApi(request, {
      prefix: R16_PROJECT_PREFIXES.galaxySilver,
      colorName: '星河银',
    });

    await advanceToColorExit(request, project.id);
    await createColorExitRecord(request, project.id);

    await page.goto('/projects/timeline');
    await expect(page.getByTestId('project-timeline-board')).toBeVisible();
    await page.getByPlaceholder('搜索项目、颜色、当前节点').fill(project.name);
    const card = page.getByTestId('project-timeline-card').filter({ hasText: project.name });
    await expect(card).toBeVisible();

    await openNodeAndExpect(card, page, '01', ['反映市场需求', '负责人', '责任部门', '截止时间']);
    await closeDrawer(page);

    await openNodeAndExpect(card, page, '06', ['涂料采购', '工序概况', '材料与附件']);
    await closeDrawer(page);

    await openNodeAndExpect(card, page, '12', ['样车驾驶室评审', '第 12 步样车驾驶室评审', '历史轮次']);
    await closeDrawer(page);

    await openNodeAndExpect(card, page, '13', ['颜色开发收费', '固定金额', '10000 元']);
    await closeDrawer(page);

    await openNodeAndExpect(card, page, '17', ['整车色差一致性评审', '12 个月', /已完成 \d+ \/ 12/]);
    await closeDrawer(page);

    await card.getByTestId('timeline-node-18').click();
    const drawer = page.getByTestId('task-detail-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('颜色退出');
    await expect(drawer).toContainText('年产量');
    await expect(drawer).toContainText('系统建议');
    await expect(page).toHaveURL(/taskId=/);

    await page.reload();
    await expect(page.getByTestId('task-detail-drawer')).toBeVisible();
    await expect(page.getByTestId('task-detail-drawer')).toContainText('颜色退出');

    await closeDrawer(page);
    await expect(page.getByTestId('project-timeline-card').filter({ hasText: project.name })).toBeVisible();
  });
});

async function openNodeAndExpect(
  card: Locator,
  page: Page,
  step: string,
  expectedTexts: Array<string | RegExp>,
) {
  await card.getByTestId(`timeline-node-${step}`).click();
  const drawer = page.getByTestId('task-detail-drawer');
  await expect(drawer).toBeVisible();

  for (const expectedText of expectedTexts) {
    await expect(drawer).toContainText(expectedText);
  }
}

async function closeDrawer(page: Page) {
  await page.getByLabel('关闭工序详情').click();
  await expect(page.getByTestId('task-detail-drawer')).toHaveCount(0);
}
