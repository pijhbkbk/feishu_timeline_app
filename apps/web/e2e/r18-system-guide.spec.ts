import { expect, test } from '@playwright/test';

const workflowNames = [
  '反映市场需求',
  '新颜色开发报告',
  '涂料开发',
  '样板颜色确认',
  '新颜色取号',
  '涂料采购',
  '标准板制作、下发',
  '色板明细更新',
  '涂料性能试验',
  '首台生产计划',
  '样车试制',
  '样车驾驶室评审',
  '颜色开发收费',
  '颜色一致性评审',
  '排产计划',
  '批量生产',
  '整车色差一致性评审',
  '颜色退出',
];

test.describe('R18 系统导览介绍页', () => {
  test('系统导览页展示流程、操作、角色、常见问题和快速入口', async ({ page }) => {
    await page.goto('/guide');

    await expect(page.getByTestId('system-guide-page')).toBeVisible();
    await expect(page.getByRole('link', { name: '系统导览' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: '轻卡定制颜色开发项目管理系统' })).toBeVisible();

    for (const workflowName of workflowNames) {
      await expect(page.getByText(workflowName).first()).toBeVisible();
    }

    await expect(page.getByText('关键评审').first()).toBeVisible();
    await expect(page.getByText('12个月').first()).toBeVisible();
    await expect(page.getByText('退出治理').first()).toBeVisible();

    await expect(page.getByRole('heading', { name: '如何使用本系统' })).toBeVisible();
    for (const operation of [
      '进入工作台',
      '新建项目',
      '查看项目看板',
      '点击工序节点',
      '提交材料',
      '完成工序或提交评审',
      '处理月度评审',
      '查看数据中心',
    ]) {
      await expect(page.getByText(operation).first()).toBeVisible();
    }

    await expect(page.getByRole('heading', { name: '各角色怎么使用' })).toBeVisible();
    for (const role of ['营销公司', '涂装工艺部', '采购部', '质量管理部', '生产部 / 涂装厂', '财务部']) {
      await expect(page.getByText(role).first()).toBeVisible();
    }

    await expect(page.getByRole('heading', { name: '容易误解的流程点' })).toBeVisible();
    await expect(page.getByText('为什么完成第4步后出现两个任务？')).toBeVisible();
    await expect(page.getByText('颜色开发收费金额是多少？')).toBeVisible();

    const visibleText = await page.locator('body').innerText();
    expect(visibleText).not.toMatch(/\b(MVP Skeleton|Workspace|Dashboard|Projects|No data|Loading|Complete|Reject)\b/);

    await page.getByRole('link', { name: /查看项目看板/ }).first().click();
    await expect(page).toHaveURL(/\/projects\/timeline/);
  });
});
