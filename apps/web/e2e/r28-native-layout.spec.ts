import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test.skip(!process.env.R28_RUNTIME_ROOT, 'Requires the explicit isolated native-auth runtime.');
test('native project detail preserves its role label and visible panel geometry', async ({ page, context }, info) => {
  expect(info.project.use.baseURL).toBe('http://127.0.0.1:3330');
  const state = JSON.parse(await readFile(path.join(process.env.R28_RUNTIME_ROOT!, 'state.json'), 'utf8'));
  const account = state.accounts.pm;
  const login = await context.request.post('http://127.0.0.1:3001/api/auth/login', {
    headers: { Origin: 'http://127.0.0.1:3100' }, data: { username: account.username, password: account.password },
  });
  expect(login.status()).toBe(200);
  await page.goto(`/projects/${state.projects.A}?nodeCode=FIRST_UNIT_PRODUCTION_PLAN`);
  const panel = page.getByTestId('r26-task-detail');
  await expect(panel.getByRole('heading', { name: '首台生产计划', exact: true })).toBeVisible();
  await expect(panel.getByText('生产', { exact: true })).toBeVisible();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const bounds = await page.locator('.r26-workspace-layout').evaluate(element => {
      const tasks = element.querySelector('.r28-current-tasks')!.getBoundingClientRect();
      const detail = element.querySelector('.r26-task-detail')!;
      const box = detail.getBoundingClientRect();
      const close = detail.querySelector('.r26-task-detail__header>button')!.getBoundingClientRect();
      return { tasks: { y: tasks.y, right: tasks.right, bottom: tasks.bottom },
        panel: { x: box.x, y: box.y, right: box.right }, closeRight: close.right,
        clientWidth: detail.clientWidth, scrollWidth: detail.scrollWidth };
    });
    expect(bounds.panel.x).toBeGreaterThanOrEqual(0);
    expect(bounds.panel.right).toBeLessThanOrEqual(width);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
    expect(bounds.closeRight).toBeLessThanOrEqual(bounds.panel.right);
    if (width > 800) {
      expect(bounds.panel.x).toBeGreaterThanOrEqual(bounds.tasks.right);
      expect(Math.abs(bounds.panel.y - bounds.tasks.y)).toBeLessThan(2);
    } else expect(bounds.panel.y).toBeGreaterThanOrEqual(bounds.tasks.bottom);
    await page.screenshot({ path: info.outputPath(`detail-${width}.png`), fullPage: true });
  }
  await panel.getByRole('button', { name: '关闭工序详情' }).click();
  await expect(panel).toHaveCount(0);
});
