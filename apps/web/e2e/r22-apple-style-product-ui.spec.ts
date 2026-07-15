import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { API_BASE_URL } from '../tests/playwright/helpers';

type PersonalOverview = {
  currentTask: { taskId: string; projectId: string; projectName: string } | null;
};

type WorkflowResponse = {
  activeTasks: Array<{
    id: string;
    nodeCode: string;
    isPrimary: boolean;
  }>;
};

const repoRoot = path.resolve(process.cwd(), '../..');
const evidenceDir = path.join(repoRoot, 'test-results', 'r22', process.env.R22_EVIDENCE_ENV ?? 'local');

test.describe.serial('R22 Apple 风产品 UI 全量验收', () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
  });

  test('1-7 工作台、项目看板、项目工作区和三步进展使用真实数据', async ({ page }) => {
    await login(page, 'mock_project_manager', '演示项目经理', ['project_manager']);
    const context = await currentTask(page);
    const expectedResolvedAt = new Date(Date.now() + 2 * 86_400_000).toISOString();

    await page.evaluate(async ({ apiBaseUrl, taskId, expected }) => {
      const response = await fetch(`${apiBaseUrl}/tasks/${taskId}/progress`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          completedContent: '已完成当前工序资料核对，等待供应商补充确认。',
          nextPlan: '收到确认后继续推进评审。',
          completionPercent: 55,
          isBlocked: true,
          blockerType: 'SUPPLIER',
          blockerDescription: '供应商颜色参数确认延迟。',
          expectedResolvedAt: expected,
          idempotencyKey: `r22-blocker-${Date.now()}`,
        }),
      });
      if (!response.ok) throw new Error(`progress blocker failed: ${response.status} ${await response.text()}`);
    }, { apiBaseUrl: API_BASE_URL, taskId: context.taskId, expected: expectedResolvedAt });

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: /演示项目经理/ })).toBeVisible();
    await expect(page.locator('.r22-task-card-primary')).toBeVisible();
    await expect(page.locator('.r22-task-card-primary .r22-button-primary')).toHaveCount(1);
    await expect(page.locator('.r22-task-card-primary').getByRole('link', { name: '提交工作进展' })).toHaveAttribute('href', new RegExp(context.taskId));

    await page.goto('/projects');
    await expect(page.getByTestId('project-list-page')).toBeVisible();
    const projectOverview = page.getByLabel('项目概览');
    for (const label of ['活跃项目', '风险项目', '本周到期', '等待评审']) {
      await expect(projectOverview.getByText(label, { exact: true })).toBeVisible();
    }
    await page.getByRole('tab', { name: '存在风险' }).click();
    await page.getByRole('button', { name: '高级筛选' }).click();
    await page.getByLabel('关键词').fill(context.projectName);
    await page.getByRole('button', { name: '应用筛选' }).click();
    const riskCard = page.getByTestId('project-card').filter({ hasText: '供应商颜色参数确认延迟' }).first();
    await expect(riskCard).toBeVisible();
    await expect(riskCard.getByText('责任人', { exact: true })).toBeVisible();
    await expect(riskCard.getByText('预计解决', { exact: true })).toBeVisible();

    await page.goto(`/projects/${context.projectId}?taskId=${context.taskId}`);
    await expect(page.getByTestId('project-workspace-page')).toBeVisible();
    await expect(page.getByText('开发流程', { exact: true })).toBeVisible();
    await expect(page.locator('.r22-current-stage-card')).toBeVisible();
    const nodes = page.locator('.r22-process-node');
    await expect(nodes).toHaveCount(18);
    await nodes.nth(1).click();
    await expect(nodes.nth(1)).toHaveAttribute('aria-pressed', 'true');

    await page.goto(`/progress?taskId=${context.taskId}&step=1`);
    await expect(page.getByTestId('progress-page')).toBeVisible();
    await expect(page.getByRole('button', { name: /1/ })).toBeVisible();
    await page.getByLabel(/本次完成内容/).fill('R22 浏览器验收进展。');
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await expect(page.getByRole('heading', { name: '当前是否被阻塞？' })).toBeVisible();
    await page.getByRole('button', { name: '存在阻塞' }).click();
    await expect(page.getByLabel(/阻塞类型/)).toBeVisible();
    await expect(page.getByLabel(/阻塞说明/)).toBeVisible();
    await page.getByLabel(/阻塞说明/).fill('等待供应商补充颜色参数确认。');
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await expect(page.getByRole('heading', { name: '上传材料并确认' })).toBeVisible();
  });

  test('8 必交材料缺失由后端门禁返回具体缺项', async ({ page }) => {
    await login(page, 'mock_project_manager', '演示项目经理', ['project_manager']);
    const request = page.context().request;
    const project = await apiJson<{ id: string }>(request, '/projects', {
      method: 'POST',
      data: {
        code: `R22-MATERIAL-${Date.now()}`,
        name: 'R22 必交材料门禁验证',
        priority: 'MEDIUM',
      },
    });
    let workflow = await apiJson<WorkflowResponse>(request, `/workflows/projects/${project.id}`);
    workflow = await transition(request, workflow, 'PROJECT_INITIATION', 'complete');
    workflow = await transition(request, workflow, 'DEVELOPMENT_REPORT', 'complete');
    workflow = await transition(request, workflow, 'PAINT_DEVELOPMENT', 'complete');
    workflow = await transition(request, workflow, 'SAMPLE_COLOR_CONFIRMATION', 'approve');
    const colorNumbering = workflow.activeTasks.find((task) => task.nodeCode === 'COLOR_NUMBERING');
    expect(colorNumbering).toBeTruthy();

    await page.goto(`/projects/${project.id}?taskId=${colorNumbering!.id}`);
    await page.getByTestId('r22-process-node-05').click();
    await expect(page.getByText(/完成工序前必须补齐/)).toBeVisible();

    const response = await request.post(`${API_BASE_URL}/workflows/tasks/${colorNumbering!.id}/complete`, { data: {} });
    expect(response.status()).toBe(400);
    expect(await response.text()).toContain('颜色编号确认单');
  });

  test('9-11 五种任务筛选、真实材料上传与生命周期复盘可用', async ({ page }) => {
    await login(page, 'mock_project_manager', '演示项目经理', ['project_manager']);
    const context = await currentTask(page);

    await page.goto('/tasks');
    await expect(page.getByTestId('tasks-page')).toBeVisible();
    for (const label of ['待处理', '待评审', '即将到期', '已逾期', '已完成']) {
      const tab = page.getByRole('tab', { name: label });
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    }

    await page.goto(`/materials/upload?taskId=${context.taskId}`);
    await expect(page.getByTestId('materials-upload-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: '本工序材料清单' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '添加新材料' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '已上传材料' })).toBeVisible();
    await page.locator('#r22-material-file').setInputFiles({
      name: `r22-material-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'),
    });
    await page.getByRole('button', { name: '上传材料', exact: true }).click();
    await expect(page.getByText(/材料已上传并绑定/)).toBeVisible();
    await expect(page.locator('.r22-material-row').filter({ hasText: 'V1' }).last()).toBeVisible();

    await page.goto(`/projects/${context.projectId}/retrospective`);
    await expect(page.getByTestId('retrospective-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: '阶段用时对比' })).toBeVisible();
    await expect(page.getByText('最大延期', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '经验与改进' })).toBeVisible();
  });

  test('12-15 所有已认证用户可访问后台，中文文案且无无限加载', async ({ page }) => {
    await login(page, `r22_viewer_${Date.now()}`, '普通查看者', ['viewer']);
    await page.goto('/dashboard');
    await page.getByLabel('打开个人菜单').click();
    await expect(page.getByRole('link', { name: '后台管理' })).toBeVisible();
    await page.goto('/admin');
    await expect(page.getByTestId('admin-page')).toBeVisible();
    for (const label of ['组织与用户', '角色与权限', '流程与参数', '审计与异常']) {
      await expect(page.getByRole('heading', { name: label })).toBeVisible();
    }
    const body = await page.locator('main').innerText();
    expect(body).not.toMatch(/PAGE DESIGN|DESIGN SYSTEM|INFORMATION ARCHITECTURE|Loading\.\.\./);
    await expect(page.locator('.r22-skeleton-card')).toHaveCount(0);
  });

  test('16 八个正式页面在 1440、1024、390 视口无横向异常并生成截图', async ({ page }) => {
    const qualityMetrics: Array<Record<string, string | number>> = [];
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await login(page, 'mock_project_manager', '演示项目经理', ['project_manager']);
    const context = await currentTask(page);
    const managerPages = [
      { name: 'dashboard', path: '/dashboard', testId: 'dashboard-page' },
      { name: 'projects', path: '/projects', testId: 'project-list-page' },
      { name: 'project-workspace', path: `/projects/${context.projectId}?taskId=${context.taskId}`, testId: 'project-workspace-page' },
      { name: 'progress-submit', path: `/progress?taskId=${context.taskId}`, testId: 'progress-page' },
      { name: 'tasks', path: '/tasks', testId: 'tasks-page' },
      { name: 'materials-upload', path: `/materials/upload?taskId=${context.taskId}`, testId: 'materials-upload-page' },
      { name: 'retrospective', path: `/projects/${context.projectId}/retrospective`, testId: 'retrospective-page' },
    ];

    for (const viewport of [
      { name: '1920', width: 1920, height: 1080 },
      { name: '1440', width: 1440, height: 900 },
      { name: '1024', width: 1024, height: 900 },
      { name: '390', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const item of managerPages) {
        await page.goto(item.path);
        await expect(page.getByTestId(item.testId)).toBeVisible();
        await waitForScreenshotReady(page, item.name);
        await assertNoHorizontalOverflow(page);
        await assertNoSeedBusinessCodes(page);
        qualityMetrics.push(await collectQualityMetric(page, item.name, viewport.name));
        await page.screenshot({
          path: path.join(evidenceDir, `${item.name}-${viewport.name}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      }
    }

    await login(page, 'admin', '系统管理员', ['admin']);
    for (const viewport of [
      { name: '1920', width: 1920, height: 1080 },
      { name: '1440', width: 1440, height: 900 },
      { name: '1024', width: 1024, height: 900 },
      { name: '390', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/admin');
      await expect(page.getByTestId('admin-page')).toBeVisible();
      await waitForScreenshotReady(page, 'admin');
      await assertNoHorizontalOverflow(page);
      await assertNoSeedBusinessCodes(page);
      qualityMetrics.push(await collectQualityMetric(page, 'admin', viewport.name));
      await page.screenshot({ path: path.join(evidenceDir, `admin-${viewport.name}.png`), fullPage: true, animations: 'disabled' });
    }
    await writeFile(path.join(evidenceDir, 'quality-metrics.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), qualityMetrics, pageErrors, consoleErrors }, null, 2)}\n`, 'utf8');
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

async function login(page: Page, username: string, name: string, roleCodes: string[]) {
  await page.goto('/login');
  await page.evaluate(async ({ apiBaseUrl, nextUsername, nextName, nextRoleCodes }) => {
    const response = await fetch(`${apiBaseUrl}/auth/mock-login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: nextUsername, name: nextName, roleCodes: nextRoleCodes }),
    });
    if (!response.ok) throw new Error(`mock login failed: ${response.status} ${await response.text()}`);
  }, { apiBaseUrl: API_BASE_URL, nextUsername: username, nextName: name, nextRoleCodes: roleCodes });
}

async function waitForScreenshotReady(page: Page, pageName: string) {
  const readiness: Record<string, () => Promise<void>> = {
    dashboard: async () => { await expect(page.locator('.r22-task-card-primary')).toBeVisible(); },
    projects: async () => { await expect(page.getByLabel('项目概览')).toBeVisible(); },
    'project-workspace': async () => { await expect(page.locator('.r22-current-stage-card')).toBeVisible(); },
    'progress-submit': async () => { await expect(page.getByRole('heading', { name: '这次具体做了什么？' })).toBeVisible(); },
    tasks: async () => { await expect(page.getByRole('tab', { name: '待处理' })).toBeVisible(); },
    'materials-upload': async () => { await expect(page.getByRole('heading', { name: '本工序材料清单' })).toBeVisible(); },
    retrospective: async () => { await expect(page.getByRole('heading', { name: '阶段用时对比' })).toBeVisible(); },
    admin: async () => { await expect(page.getByRole('heading', { name: '组织与用户' })).toBeVisible(); },
  };
  await readiness[pageName]?.();
  await expect(page.locator('.r22-skeleton-card')).toHaveCount(0);
}

async function collectQualityMetric(page: Page, pageName: string, viewport: string) {
  return page.evaluate(({ nextPageName, nextViewport }) => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return {
      page: nextPageName,
      viewport: nextViewport,
      domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd ?? 0),
      loadEventMs: Math.round(navigation?.loadEventEnd ?? 0),
      resourceCount: resources.length,
      apiRequestCount: resources.filter((entry) => entry.name.includes('/api/')).length,
      transferBytes: Math.round(resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0)),
    };
  }, { nextPageName: pageName, nextViewport: viewport });
}

async function currentTask(page: Page) {
  let overview = await page.evaluate(async ({ apiBaseUrl }) => {
    const response = await fetch(`${apiBaseUrl}/dashboard/personal-overview`, { credentials: 'include' });
    if (!response.ok) throw new Error(`dashboard API failed: ${response.status}`);
    return response.json() as Promise<PersonalOverview>;
  }, { apiBaseUrl: API_BASE_URL });

  if (!overview.currentTask) {
    const timestamp = Date.now();
    await page.evaluate(async ({ apiBaseUrl, code, name }) => {
      const response = await fetch(`${apiBaseUrl}/projects`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, name, priority: 'MEDIUM' }),
      });
      if (!response.ok) throw new Error(`test project creation failed: ${response.status} ${await response.text()}`);
    }, {
      apiBaseUrl: API_BASE_URL,
      code: `R22-ACTIVE-${timestamp}`,
      name: `R22 活跃任务夹具 ${timestamp}`,
    });
    overview = await page.evaluate(async ({ apiBaseUrl }) => {
      const response = await fetch(`${apiBaseUrl}/dashboard/personal-overview`, { credentials: 'include' });
      if (!response.ok) throw new Error(`dashboard API failed: ${response.status}`);
      return response.json() as Promise<PersonalOverview>;
    }, { apiBaseUrl: API_BASE_URL });
  }

  if (!overview.currentTask) throw new Error('测试账号没有活跃任务。');
  return overview.currentTask;
}

async function transition(
  request: APIRequestContext,
  workflow: WorkflowResponse,
  nodeCode: string,
  action: 'complete' | 'approve',
) {
  const task = workflow.activeTasks.find((item) => item.nodeCode === nodeCode && item.isPrimary);
  if (!task) throw new Error(`未找到活跃工序 ${nodeCode}`);
  return apiJson<WorkflowResponse>(request, `/workflows/tasks/${task.id}/${action}`, { method: 'POST', data: {} });
}

async function apiJson<T>(request: APIRequestContext, apiPath: string, options?: { method?: string; data?: unknown }) {
  const response = await request.fetch(`${API_BASE_URL}${apiPath}`, options);
  const text = await response.text();
  if (!response.ok()) throw new Error(`${apiPath} failed: ${response.status()} ${text}`);
  return JSON.parse(text) as T;
}

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function assertNoSeedBusinessCodes(page: Page) {
  const visibleText = await page.locator('body').innerText();
  expect(visibleText).not.toMatch(/\b(?:WF-|CLR-)?DEMO(?:[-_ ][A-Z0-9]+)+\b/i);
}
