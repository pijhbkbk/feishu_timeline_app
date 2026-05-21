import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  advanceToColorExit,
  createColorExitRecord,
  createProjectByApi,
  loginAsProjectManager,
} from '../tests/playwright/helpers';

const screenshotDir = path.resolve(process.cwd(), '../../test-results/r21c');

test('R21C flow map uses compact toolbar, fit view and orthogonal layout @r21c', async ({ page }) => {
  mkdirSync(screenshotDir, { recursive: true });

  await loginAsProjectManager(page);
  const request = page.context().request;
  const project = await createProjectByApi(request, 'R21C-FLOWMAP-UI');

  await advanceToColorExit(request, project.id);
  await createColorExitRecord(request, project.id);

  await page.goto('/projects/flow-map');
  await expect(page.getByRole('heading', { name: '项目实时流程地图' }).first()).toBeVisible();
  await expect(page.getByTestId('projects-flow-map-portal')).toBeVisible();
  await page.getByLabel('选择项目').selectOption(project.id);
  await expect(page.locator('[data-testid^="flow-map-node-"]')).toHaveCount(18);

  await page.goto(`/projects/${project.id}/flow-map`);
  await expect(page.getByRole('heading', { name: '项目实时流程地图', exact: true })).toBeVisible();
  await expect(page.getByTestId('flow-map-toolbar')).toBeVisible();
  await expect(page.locator('.flow-map-side-panel')).toHaveCount(0);
  await expect(page.locator('[data-testid^="flow-map-node-"]')).toHaveCount(18);

  await page.getByRole('button', { name: '图例 / 筛选' }).click();
  await expect(page.getByTestId('flow-map-filter-popover')).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDir, 'filter-popover.png'), fullPage: true });
  await page.getByRole('button', { name: '图例 / 筛选' }).click();
  await expect(page.getByTestId('flow-map-filter-popover')).toHaveCount(0);

  await expect(page.getByTestId('flow-map-node-12')).toContainText('样车驾驶室评审');
  await expect(page.getByTestId('flow-map-node-17')).toContainText(/\/ 12 月/);
  await expect(page.getByTestId('flow-map-node-18')).toContainText('颜色退出');

  await assertNoOverlap(page.getByTestId('flow-map-node-12'), page.getByTestId('flow-map-node-14'));
  await assertNoNodeOverlaps(page);
  await assertOrthogonalConnectors(page);
  await assertDesktopFit(page);
  await page.mouse.move(24, 24);

  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.mouse.move(24, 24);
  await page.screenshot({ path: path.join(screenshotDir, 'flow-map-1440.png'), fullPage: true });

  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.mouse.move(24, 24);
  await page.screenshot({ path: path.join(screenshotDir, 'flow-map-1920.png'), fullPage: true });

  await page.getByTestId('flow-map-node-06').click();
  await expect(page.getByTestId('task-detail-drawer')).toBeVisible();
  await expect(page).toHaveURL(/taskId=/);
  await page.screenshot({ path: path.join(screenshotDir, 'task-drawer.png'), fullPage: true });

  await page.reload();
  await expect(page.getByTestId('task-detail-drawer')).toBeVisible();
  await page.getByRole('button', { name: '关闭工序详情' }).click();

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.getByTestId('flow-map-toolbar')).toBeVisible();
  await expect(page.locator('[data-testid^="flow-map-node-"]')).toHaveCount(18);
  await page.screenshot({ path: path.join(screenshotDir, 'flow-map-mobile.png'), fullPage: true });
});

async function assertDesktopFit(page: Page) {
  const shell = await page.locator('.flow-map-scroll-shell').boundingBox();
  const viewport = await page.locator('.flow-map-viewport').boundingBox();

  expect(shell).not.toBeNull();
  expect(viewport).not.toBeNull();

  if (!shell || !viewport) {
    return;
  }

  expect(viewport.width).toBeLessThanOrEqual(shell.width + 2);
}

async function assertNoOverlap(first: Locator, second: Locator) {
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();

  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();

  if (!firstBox || !secondBox) {
    return;
  }

  expect(
    boxesOverlap(firstBox, secondBox),
    `overlap: ${JSON.stringify({ firstBox, secondBox })}`,
  ).toBe(false);
}

async function assertNoNodeOverlaps(page: Page) {
  const boxes = await page.locator('[data-testid^="flow-map-node-"]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        testId: node.getAttribute('data-testid'),
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    }),
  );

  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      const left = boxes[leftIndex];
      const right = boxes[rightIndex];

      expect(
        boxesOverlap(left, right),
        `${left.testId} overlaps ${right.testId}`,
      ).toBe(false);
    }
  }
}

async function assertOrthogonalConnectors(page: Page) {
  const paths = await page.locator('.flow-map-edge path').evaluateAll((items) =>
    items.map((item) => item.getAttribute('d') ?? ''),
  );

  for (const pathData of paths) {
    const points = pathData.match(/-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?/g) ?? [];
    const coordinates = points.map((point) => {
      const [x, y] = point.split(/\s+/).map(Number);
      return { x, y };
    });

    for (let index = 1; index < coordinates.length; index += 1) {
      const previous = coordinates[index - 1];
      const current = coordinates[index];
      const isOrthogonal = previous.x === current.x || previous.y === current.y;

      expect(isOrthogonal, `non-orthogonal connector: ${pathData}`).toBe(true);
    }
  }
}

function boxesOverlap(
  left: {
    x?: number;
    y?: number;
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
    width: number;
    height: number;
  },
  right: {
    x?: number;
    y?: number;
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
    width: number;
    height: number;
  },
) {
  const leftX = left.left ?? left.x ?? 0;
  const leftY = left.top ?? left.y ?? 0;
  const rightX = right.left ?? right.x ?? 0;
  const rightY = right.top ?? right.y ?? 0;
  const leftRight = left.right ?? leftX + left.width;
  const leftBottom = left.bottom ?? leftY + left.height;
  const rightRight = right.right ?? rightX + right.width;
  const rightBottom = right.bottom ?? rightY + right.height;

  return !(
    leftRight <= rightX ||
    rightRight <= leftX ||
    leftBottom <= rightY ||
    rightBottom <= leftY
  );
}
