import { spawn, type ChildProcess } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';

import { r26FlowEdges, r26FlowNodes } from '../src/features/v2/fixtures';

const webRoot = process.cwd();
const repoRoot = path.resolve(webRoot, '../..');
const evidenceRoot = path.join(repoRoot, 'test-results/r26-gate1');
const screenshotDir = path.join(evidenceRoot, 'screenshots');
const videoDir = path.join(evidenceRoot, 'videos');
const forbiddenProductCopy = /DEMO(?:\s*-\s*)?ACTIVE|DEMO(?:\s*-\s*)?COMPLETE|demo-r26\s*·\s*t006|Required|Upload|History|Executive summary|Stage comparison|Learning|Audit/;
const frozenNodeGeometry = [
  { step: 1, code: 'PROJECT_INITIATION', name: '反映市场需求', x: 625, y: 80, width: 190, height: 92, shape: 'rounded' },
  { step: 2, code: 'DEVELOPMENT_REPORT', name: '新颜色开发报告', x: 625, y: 190, width: 190, height: 92, shape: 'rounded' },
  { step: 3, code: 'PAINT_DEVELOPMENT', name: '涂料开发', x: 625, y: 300, width: 190, height: 92, shape: 'rounded' },
  { step: 4, code: 'SAMPLE_COLOR_CONFIRMATION', name: '样板颜色确认', x: 625, y: 410, width: 190, height: 92, shape: 'rounded' },
  { step: 5, code: 'COLOR_NUMBERING', name: '新颜色取号', x: 945, y: 410, width: 190, height: 92, shape: 'branch' },
  { step: 6, code: 'PAINT_PROCUREMENT', name: '涂料采购', x: 625, y: 540, width: 190, height: 92, shape: 'rounded' },
  { step: 7, code: 'STANDARD_BOARD_PRODUCTION', name: '标准板制作、下发', x: 945, y: 540, width: 190, height: 92, shape: 'branch' },
  { step: 8, code: 'BOARD_DETAIL_UPDATE', name: '色板明细更新', x: 1185, y: 540, width: 190, height: 92, shape: 'branch' },
  { step: 9, code: 'PERFORMANCE_TEST', name: '涂料性能试验', x: 305, y: 540, width: 190, height: 92, shape: 'branch' },
  { step: 10, code: 'FIRST_UNIT_PRODUCTION_PLAN', name: '首台生产计划', x: 625, y: 670, width: 190, height: 92, shape: 'rounded' },
  { step: 11, code: 'TRIAL_PRODUCTION', name: '样车试制', x: 625, y: 800, width: 190, height: 92, shape: 'rounded' },
  { step: 12, code: 'CAB_REVIEW', name: '样车驾驶室评审', x: 615, y: 940, width: 210, height: 130, shape: 'decision' },
  { step: 13, code: 'DEVELOPMENT_ACCEPTANCE', name: '颜色开发收费', x: 305, y: 1040, width: 190, height: 92, shape: 'branch' },
  { step: 14, code: 'COLOR_CONSISTENCY_REVIEW', name: '颜色一致性评审', x: 625, y: 1120, width: 190, height: 92, shape: 'rounded' },
  { step: 15, code: 'MASS_PRODUCTION_PLAN', name: '排产计划', x: 625, y: 1250, width: 190, height: 92, shape: 'rounded' },
  { step: 16, code: 'MASS_PRODUCTION', name: '批量生产', x: 625, y: 1380, width: 190, height: 92, shape: 'rounded' },
  { step: 17, code: 'VISUAL_COLOR_DIFFERENCE_REVIEW', name: '整车色差一致性评审', x: 605, y: 1510, width: 230, height: 100, shape: 'monthly' },
  { step: 18, code: 'PROJECT_CLOSED', name: '颜色退出', x: 625, y: 1640, width: 190, height: 84, shape: 'terminal' },
] as const;
const frozenEdgeGeometry = [
  { id: '01-02', path: 'M720 172 L720 190', type: 'mainline' },
  { id: '02-03', path: 'M720 282 L720 300', type: 'mainline' },
  { id: '03-04', path: 'M720 392 L720 410', type: 'mainline' },
  { id: '04-05', path: 'M815 456 L945 456', type: 'nonBlocking' },
  { id: '04-06', path: 'M720 502 L720 540', type: 'mainline' },
  { id: '06-09', path: 'M625 586 L495 586', type: 'nonBlocking' },
  { id: '06-07', path: 'M815 586 L945 586', type: 'parallel' },
  { id: '07-08', path: 'M1135 586 L1185 586', type: 'parallel' },
  { id: '06-10', path: 'M720 632 L720 670', type: 'mainline' },
  { id: '10-11', path: 'M720 762 L720 800', type: 'mainline' },
  { id: '11-12', path: 'M720 892 L720 940', type: 'mainline' },
  { id: '12-11', path: 'M825 1005 L940 1005 L940 846 L815 846', type: 'return' },
  { id: '12-13', path: 'M615 1005 L560 1005 L560 1086 L495 1086', type: 'nonBlocking' },
  { id: '12-14', path: 'M720 1070 L720 1120', type: 'mainline' },
  { id: '14-15', path: 'M720 1212 L720 1250', type: 'mainline' },
  { id: '15-16', path: 'M720 1342 L720 1380', type: 'mainline' },
  { id: '16-17', path: 'M720 1472 L720 1510', type: 'mainline' },
  { id: '17-18', path: 'M720 1610 L720 1640', type: 'mainline' },
] as const;

let featureOffServer: ChildProcess | null = null;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await Promise.all([
    mkdir(screenshotDir, { recursive: true }),
    mkdir(videoDir, { recursive: true }),
  ]);

  featureOffServer = spawn(
    'pnpm',
    ['exec', 'dotenv', '-e', '.env.example', '--', 'next', 'dev', '--port', '3101'],
    {
      cwd: webRoot,
      env: {
        ...process.env,
        NEXT_PUBLIC_R26_V2_PROTOTYPE: 'false',
        NEXT_DIST_DIR: '.next-r26-gate1-off',
      },
      stdio: 'ignore',
    },
  );
  await waitForServer('http://127.0.0.1:3101/v2/dashboard');
});

test.afterAll(async () => {
  featureOffServer?.kill('SIGTERM');
  featureOffServer = null;
});

test('R26-01 Feature Flag 关闭时 V2 不可用，开启时四页可访问且不请求 API', async ({
  page,
  request,
}) => {
  const offResponse = await request.get('http://127.0.0.1:3101/v2/dashboard', {
    failOnStatusCode: false,
  });
  expect(offResponse.status()).toBe(404);

  const apiRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  installPageGuards(page, apiRequests, consoleErrors, pageErrors);

  for (const route of [
    '/v2/dashboard',
    '/v2/projects',
    '/v2/projects/demo-r26',
    '/v2/progress?projectId=demo-r26&taskId=t006',
  ]) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator('[data-ui-version="r26-v2"]')).toBeVisible();
    await expect(page.locator('.r22-shell')).toHaveCount(0);
    await expect(page.locator('.r26-app')).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(forbiddenProductCopy);
  }

  expect(apiRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('R26-02 工作台主动作、项目筛选、卡片跳转与固定地图默认入口可用', async ({
  page,
}) => {
  await resetPrototype(page);
  await expect(page.getByTestId('dashboard-primary-action')).toHaveAttribute(
    'href',
    '/v2/progress?projectId=demo-r26&taskId=t006',
  );
  await page.getByTestId('dashboard-primary-action').click();
  await expect(page).toHaveURL(/\/v2\/progress\?projectId=demo-r26&taskId=t006$/);

  await page.goto('/v2/projects');
  await expect(page.locator('.r26-project-card')).toHaveCount(3);
  await expect(page.locator('.r26-filter-group button')).toHaveText([
    '全部',
    '正常',
    '有风险',
    '已逾期',
    '等待评审',
  ]);
  await page.getByRole('button', { name: '有风险' }).click();
  await expect(page.locator('.r26-project-card')).toHaveCount(1);
  await expect(page.getByText('缺少到货确认记录，采购工序无法形成完整交付证据。')).toBeVisible();
  await page.getByTestId('open-demo-r26-project').click();
  await expect(page).toHaveURL(/\/v2\/projects\/demo-r26$/);
  await expect(page.getByTestId('r26-flow-map-svg')).toBeVisible();
  await expect(page.getByTestId('r26-task-detail')).toContainText('涂料采购');
});

test('R26-03 18 节点坐标、尺寸、形状、四类连线、无重叠和无斜线符合冻结规范', async ({
  page,
}) => {
  await page.goto('/v2/projects/demo-r26');
  const svg = page.getByTestId('r26-flow-map-svg');
  await expect(svg).toHaveAttribute('viewBox', '0 0 1440 1740');
  await expect(svg.locator('[data-testid^="r26-node-"]')).toHaveCount(18);

  expect(
    r26FlowNodes.map(({ step, code, name, x, y, width, height, shape }) => ({
      step,
      code,
      name,
      x,
      y,
      width,
      height,
      shape,
    })),
  ).toEqual(frozenNodeGeometry);

  for (const node of frozenNodeGeometry) {
    const locator = page.getByTestId(`r26-node-${String(node.step).padStart(2, '0')}`);
    await expect(locator).toHaveAttribute('data-node-code', node.code);
    await expect(locator).toHaveAttribute('data-x', String(node.x));
    await expect(locator).toHaveAttribute('data-y', String(node.y));
    await expect(locator).toHaveAttribute('data-width', String(node.width));
    await expect(locator).toHaveAttribute('data-height', String(node.height));
    await expect(locator).toHaveAttribute('data-shape', node.shape);
  }

  await expect(page.getByTestId('r26-node-12').locator('polygon')).toHaveCount(1);
  await expect(page.getByTestId('r26-node-17').locator('circle')).toHaveCount(2);
  await expect(page.getByTestId('r26-node-18').locator('rect')).toHaveAttribute('rx', '42');

  expect(
    r26FlowEdges.map(({ id, path: edgePath, type }) => ({ id, path: edgePath, type })),
  ).toEqual(frozenEdgeGeometry);

  const edgeTypes = new Set<string>();
  for (const edge of frozenEdgeGeometry) {
    const locator = page.getByTestId(`r26-edge-${edge.id}`);
    await expect(locator).toHaveAttribute('d', edge.path);
    await expect(locator).toHaveAttribute('data-edge-type', edge.type);
    edgeTypes.add(edge.type);
    expect(isOrthogonalPath(edge.path), edge.id).toBe(true);
  }
  expect([...edgeTypes].sort()).toEqual(['mainline', 'nonBlocking', 'parallel', 'return']);
  expect(overlappingNodePairs(r26FlowNodes)).toEqual([]);

  await expect(svg.locator('marker').first()).toHaveAttribute('markerUnits', 'userSpaceOnUse');
  expect(
    await page.getByTestId('r26-edge-11-12').evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).strokeWidth),
    ),
  ).toBeLessThanOrEqual(2.5);

  const decisionCopy = await page.getByTestId('r26-node-12').evaluate((element) => {
    const polygon = element.querySelector('polygon') as SVGPolygonElement;
    const polygonBox = polygon.getBBox();
    const textBoxes = [...element.querySelectorAll('text')].map((text) => {
      const box = (text as SVGTextElement).getBBox();
      return { x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height };
    });
    return {
      polygon: {
        x: polygonBox.x,
        y: polygonBox.y,
        right: polygonBox.x + polygonBox.width,
        bottom: polygonBox.y + polygonBox.height,
      },
      textBoxes,
    };
  });
  for (const textBox of decisionCopy.textBoxes) {
    expect(textBox.x).toBeGreaterThanOrEqual(decisionCopy.polygon.x);
    expect(textBox.right).toBeLessThanOrEqual(decisionCopy.polygon.right);
    expect(textBox.y).toBeGreaterThanOrEqual(decisionCopy.polygon.y);
    expect(textBox.bottom).toBeLessThanOrEqual(decisionCopy.polygon.bottom);
  }
});

test('R26-04 节点点击更新详情、特殊节点正确、URL 恢复且关闭详情保留地图比例', async ({
  page,
}) => {
  await page.goto('/v2/projects/demo-r26');
  await page.getByTestId('r26-node-12').click();
  await expect(page).toHaveURL(/taskId=t012/);
  await expect(page.getByTestId('task-conclusion')).toContainText('等待评审结论');
  await expect(page.getByTestId('step12-special-detail')).toContainText('第 2 轮');
  await expect(page.getByTestId('step12-special-detail')).toContainText('喷涂均匀性');
  await page.reload();
  await expect(page.getByTestId('r26-node-12')).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: '放大流程地图' }).click();
  await expect(page.locator('.r26-map-toolbar__actions')).toContainText('125%');
  await page.getByRole('button', { name: '关闭工序详情' }).click();
  await expect(page).not.toHaveURL(/taskId=|nodeCode=/);
  await expect(page.locator('.r26-map-toolbar__actions')).toContainText('125%');

  await page.getByTestId('r26-node-17').click();
  await expect(page.getByTestId('step17-special-detail')).toContainText('3 / 12');
  await expect(page.getByTestId('step17-special-detail')).toContainText('8月15日');

  await page.getByTestId('r26-node-18').click();
  await expect(page).toHaveURL(/nodeCode=PROJECT_CLOSED/);
  await expect(page.getByTestId('step18-special-detail')).toContainText('4,800 台');
  await expect(page.getByTestId('step18-special-detail')).toContainText('人工决定');
  await page.reload();
  await expect(page.getByTestId('r26-node-18')).toHaveAttribute('aria-pressed', 'true');
});

test('R26-05 进展三步、条件阻塞字段与本地页面联动完整可用', async ({ page }) => {
  const apiRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  installPageGuards(page, apiRequests, consoleErrors, pageErrors);

  await resetPrototype(page);
  await page.getByTestId('dashboard-primary-action').click();
  await expect(page.getByTestId('progress-step-1')).toBeVisible();
  await page.getByTestId('progress-next').click();
  await expect(page.getByTestId('progress-step-2')).toBeVisible();

  await page.getByRole('radio', { name: /存在阻塞/ }).check();
  await expect(page.getByTestId('blocker-fields')).toBeVisible();
  await page.getByLabel('阻塞描述').fill('供应商需要补充盖章后的到货确认记录。');
  await page.getByRole('radio', { name: /没有阻塞/ }).check();
  await expect(page.getByTestId('blocker-fields')).toHaveCount(0);

  await page.getByTestId('progress-next').click();
  await expect(page.getByTestId('progress-step-3')).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: '到货确认记录.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% R26 static filename fixture\n'),
  });
  await expect(page.getByTestId('progress-dropzone')).toContainText('到货确认记录.pdf');
  await page.getByTestId('progress-submit').click();
  await expect(page.getByTestId('r26-progress-success')).toContainText('进展已提交（静态原型）');
  await expect(page.getByTestId('r26-progress-success')).toContainText(
    '系统已创建：标准板制作、涂料性能试验、首台生产计划',
  );

  await page.getByRole('link', { name: '返回工作台' }).click();
  await expect(page.getByTestId('r26-dashboard')).toContainText('本次进展已完成');
  await expect(page.getByTestId('r26-dashboard')).toContainText('首台生产计划已进入进行中');

  await page.getByTestId('dashboard-primary-action').click();
  await expect(page.getByTestId('r26-node-06')).toHaveAttribute('data-status', 'COMPLETED');
  await expect(page.getByTestId('r26-node-07')).toHaveAttribute('data-status', 'PENDING');
  await expect(page.getByTestId('r26-node-07')).toContainText('已创建');
  await expect(page.getByTestId('r26-node-09')).toHaveAttribute('data-status', 'PENDING');
  await expect(page.getByTestId('r26-node-09')).toContainText('已创建');
  await expect(page.getByTestId('r26-node-10')).toHaveAttribute('data-status', 'IN_PROGRESS');
  await expect(page.getByTestId('r26-node-10')).toContainText('已创建');
  await expect(page.getByTestId('r26-task-detail')).toContainText('3 / 3');
  await expect(page.getByTestId('r26-task-detail')).toContainText('必交材料已齐备');

  await page.reload();
  const submittedActivities = await page.evaluate(() => {
    const state = JSON.parse(window.sessionStorage.getItem('R26PrototypeStore') ?? '{}') as {
      recentActivities?: Array<{ text: string }>;
    };
    return (state.recentActivities ?? []).filter((activity) =>
      activity.text.includes('提交了涂料采购进展'),
    ).length;
  });
  expect(submittedActivities).toBe(1);

  expect(apiRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('R26-06 1440、1024、390 三视口无页面横向溢出并生成页面证据', async ({
  page,
}) => {
  const apiRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  installPageGuards(page, apiRequests, consoleErrors, pageErrors);

  await resetPrototype(page);

  const viewports = [
    { width: 1440, height: 900, suffix: '1440' },
    { width: 1024, height: 900, suffix: '1024' },
    { width: 390, height: 844, suffix: '390' },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.goto('/v2/dashboard');
    await assertNoPageOverflow(page);
    if (viewport.width === 390) {
      await assertMobileTaskContained(page);
    }
    await screenshot(page, `dashboard-${viewport.suffix}.png`);

    await page.goto('/v2/projects');
    await assertNoPageOverflow(page);
    await screenshot(page, `projects-${viewport.suffix}.png`);

    await page.goto('/v2/projects/demo-r26');
    await assertNoPageOverflow(page);
    if (viewport.width === 390) {
      await expect(page.getByTestId('r26-mobile-flow-list')).toBeVisible();
      await expect(page.getByTestId('r26-map-scroll')).toBeHidden();
      await expect(page.locator('[data-testid^="r26-mobile-node-"]')).toHaveCount(18);
    }
    if (viewport.width === 1024) {
      expect(
        await page.getByTestId('r26-flow-map-svg').evaluate(
          (element) => element.getBoundingClientRect().width,
        ),
      ).toBeGreaterThanOrEqual(1439);
      expect(
        await page.getByTestId('r26-task-detail').evaluate(
          (element) => element.getBoundingClientRect().width,
        ),
      ).toBeLessThanOrEqual(371);
    }
    await screenshot(page, `project-workspace-${viewport.suffix}.png`);

    if (viewport.width === 390) {
      await page.getByTestId('r26-mobile-node-12').click();
      await expect(page.getByTestId('r26-task-detail')).toBeVisible();
      await expect(page.getByTestId('r26-task-detail')).toContainText('第 2 轮正在等待评审结论');
      await screenshot(page, 'project-step12-sheet-390.png');
      await page.getByRole('button', { name: '关闭工序详情' }).click();
      await expect(page.getByTestId('r26-mobile-flow-list')).toBeVisible();
    }

    await page.goto('/v2/progress?projectId=demo-r26&taskId=t006');
    await assertNoPageOverflow(page);
    const progressName =
      viewport.width === 1440
        ? 'progress-step1-1440.png'
        : viewport.width === 390
          ? 'progress-390.png'
          : 'progress-step1-1024.png';
    await screenshot(page, progressName);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/v2/projects/demo-r26');
  await page.getByTestId('r26-node-12').click();
  await screenshot(page, 'project-step12-selected-1440.png');

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/v2/projects/demo-r26');
  await page.getByTestId('r26-node-12').click();
  await screenshot(page, 'project-step12-selected-1024.png');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/v2/progress?projectId=demo-r26&taskId=t006');
  await page.getByTestId('progress-next').click();
  await page.getByRole('radio', { name: /存在阻塞/ }).check();
  await screenshot(page, 'progress-blocker-1440.png');
  await page.getByRole('radio', { name: /没有阻塞/ }).check();
  await page.getByTestId('progress-next').click();
  await page.getByTestId('progress-submit').click();
  await screenshot(page, 'progress-success-1440.png');

  expect(apiRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('R26-07 生成 1440、1024、390 核心路径本地交互录像', async ({ browser }) => {
  await recordEmployeeFlow(browser);
  await recordManagerFlow(browser);
  await recordMapFlow(browser);
  await recordMobileFlow(browser);
});

async function resetPrototype(page: Page) {
  await page.goto('/v2/dashboard');
  await page.evaluate(() => window.sessionStorage.removeItem('R26PrototypeStore'));
  await page.reload();
  await expect(page.getByTestId('r26-dashboard')).toContainText('当前任务');
}

function installPageGuards(
  page: Page,
  apiRequests: string[],
  consoleErrors: string[],
  pageErrors: string[],
) {
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      apiRequests.push(request.url());
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
}

async function assertNoPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}

async function assertMobileTaskContained(page: Page) {
  const bounds = await page.evaluate(() => {
    const card = document.querySelector('.r26-current-task')!.getBoundingClientRect();
    const main = document.querySelector('.r26-current-task__main')!.getBoundingClientRect();
    const action = document.querySelector(
      '[data-testid="dashboard-primary-action"]',
    )!.getBoundingClientRect();
    return {
      card: { left: card.left, right: card.right },
      main: { left: main.left, right: main.right },
      action: { left: action.left, right: action.right, bottom: action.bottom },
      viewportHeight: window.innerHeight,
    };
  });
  expect(bounds.main.left).toBeGreaterThanOrEqual(bounds.card.left);
  expect(bounds.main.right).toBeLessThanOrEqual(bounds.card.right + 1);
  expect(bounds.action.left).toBeGreaterThanOrEqual(bounds.card.left);
  expect(bounds.action.right).toBeLessThanOrEqual(bounds.card.right + 1);
  expect(bounds.action.bottom).toBeLessThanOrEqual(bounds.viewportHeight - 74);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(screenshotDir, name),
    fullPage: false,
    animations: 'disabled',
  });
}

function overlappingNodePairs(nodes: typeof r26FlowNodes) {
  const pairs: string[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
      const node = nodes[index]!;
      const other = nodes[otherIndex]!;
      const overlaps =
        node.x < other.x + other.width &&
        node.x + node.width > other.x &&
        node.y < other.y + other.height &&
        node.y + node.height > other.y;
      if (overlaps) {
        pairs.push(`${node.step}-${other.step}`);
      }
    }
  }
  return pairs;
}

function isOrthogonalPath(pathValue: string) {
  const points = [...pathValue.matchAll(/[ML]\s*(\d+)\s+(\d+)/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
  return points.slice(1).every((point, index) => {
    const previous = points[index]!;
    return point.x === previous.x || point.y === previous.y;
  });
}

async function recordEmployeeFlow(browser: Browser) {
  const { page, context } = await createVideoPage(browser, 1440, 900);
  await page.goto('/v2/dashboard');
  await page.getByTestId('dashboard-primary-action').click();
  await pause(page);
  await page.getByTestId('progress-next').click();
  await pause(page);
  await page.getByTestId('progress-next').click();
  await page.locator('input[type="file"]').setInputFiles({
    name: '到货确认记录.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n'),
  });
  await pause(page);
  await page.getByTestId('progress-submit').click();
  await expect(page.getByTestId('r26-progress-success')).toBeVisible();
  await pause(page, 700);
  await saveVideo(page, context, 'employee-progress-flow-1440.webm');
}

async function recordManagerFlow(browser: Browser) {
  const { page, context } = await createVideoPage(browser, 1024, 900);
  await page.goto('/v2/projects');
  await page.getByRole('button', { name: '有风险' }).click();
  await pause(page);
  await page.getByTestId('open-demo-r26-project').click();
  await expect(page.getByTestId('r26-task-detail')).toContainText('张七巧');
  await expect(page.getByTestId('r26-task-detail')).toContainText('到货确认记录');
  await pause(page, 700);
  await saveVideo(page, context, 'manager-risk-flow-1024.webm');
}

async function recordMapFlow(browser: Browser) {
  const { page, context } = await createVideoPage(browser, 1440, 900);
  await page.goto('/v2/projects/demo-r26');
  for (const step of [6, 12, 17, 18]) {
    await page.getByTestId(`r26-node-${String(step).padStart(2, '0')}`).click();
    await pause(page);
  }
  await page.reload();
  await expect(page.getByTestId('r26-node-18')).toHaveAttribute('aria-pressed', 'true');
  await pause(page, 700);
  await saveVideo(page, context, 'flow-map-node-and-url-restore-1440.webm');
}

async function recordMobileFlow(browser: Browser) {
  const { page, context } = await createVideoPage(browser, 390, 844);
  await page.goto('/v2/projects/demo-r26');
  await expect(page.getByTestId('r26-mobile-flow-list')).toBeVisible();
  await page.getByTestId('r26-mobile-node-12').scrollIntoViewIfNeeded();
  await pause(page);
  await page.getByTestId('r26-mobile-node-12').click();
  await expect(page.getByTestId('r26-task-detail')).toBeVisible();
  await expect(page.getByTestId('task-conclusion')).toContainText('等待评审结论');
  await page.locator('.r26-task-detail__body').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await pause(page);
  await page.getByRole('button', { name: '关闭工序详情' }).click();
  await expect(page.getByTestId('r26-mobile-flow-list')).toBeVisible();
  await pause(page, 700);
  await saveVideo(page, context, 'mobile-flow-and-fullscreen-sheet-390.webm');
}

async function createVideoPage(browser: Browser, width: number, height: number) {
  const context = await browser.newContext({
    baseURL: 'http://localhost:3000',
    viewport: { width, height },
    recordVideo: { dir: videoDir, size: { width, height } },
  });
  const page = await context.newPage();
  return { page, context };
}

async function saveVideo(
  page: Page,
  context: Awaited<ReturnType<Browser['newContext']>>,
  name: string,
) {
  const video = page.video();
  expect(video).not.toBeNull();
  await context.close();
  const source = await video!.path();
  await copyFile(source, path.join(videoDir, name));
}

async function pause(page: Page, duration = 450) {
  await page.waitForTimeout(duration);
}

async function waitForServer(url: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status >= 200) {
        return;
      }
    } catch {
      // The isolated feature-off server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
