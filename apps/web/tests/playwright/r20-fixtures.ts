import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

import { API_BASE_URL, apiJson } from './helpers';
import {
  buildR16Timestamp,
  fetchR16Workflow,
  R16_FLOW_NODES,
  transitionR16Task,
  type R16ProjectSummary,
  type R16WorkflowNodeCode,
} from './r16-fixtures';

export const R20_PROJECT_NAMES = {
  normal: 'UAT-R20-正常流程-深海蓝',
  rework: 'UAT-R20-评审退回-星河银',
  nonBlocking: 'UAT-R20-非阻塞测试-极光白',
  overdue: 'UAT-R20-逾期测试-赤霞红',
  permissionMaterial: 'UAT-R20-权限材料-沙岩灰',
} as const;

export const R20_ROLE_MAP = {
  marketing: {
    label: '营销公司',
    roleCodes: ['project_manager'],
    displayName: 'R20 营销项目负责人',
  },
  coating: {
    label: '涂装工艺部',
    roleCodes: ['process_engineer'],
    displayName: 'R20 涂装工艺工程师',
  },
  procurement: {
    label: '采购部',
    roleCodes: ['purchaser'],
    displayName: 'R20 采购专员',
  },
  quality: {
    label: '质量管理部',
    roleCodes: ['quality_engineer'],
    displayName: 'R20 质量工程师',
  },
  production: {
    label: '生产部 / 涂装厂',
    roleCodes: ['process_engineer'],
    displayName: 'R20 生产工艺负责人',
  },
  finance: {
    label: '财务部',
    roleCodes: ['finance'],
    displayName: 'R20 财务专员',
  },
  projectManager: {
    label: '项目经理',
    roleCodes: ['project_manager'],
    displayName: 'R20 项目经理',
  },
  admin: {
    label: '系统管理员',
    roleCodes: ['admin'],
    displayName: 'R20 系统管理员',
  },
  viewer: {
    label: '普通查看者',
    roleCodes: ['viewer'],
    displayName: 'R20 普通查看者',
  },
} as const;

type R20RoleKey = keyof typeof R20_ROLE_MAP;

type WorkflowResponse = Awaited<ReturnType<typeof fetchR16Workflow>>;

type ApiResponseSnapshot = {
  status: number;
  body: string;
};

export function getR20RepoRoot() {
  const cwd = process.cwd();

  return cwd.endsWith(path.join('apps', 'web')) ? path.resolve(cwd, '../..') : cwd;
}

export function getR20ResultsPath(...segments: string[]) {
  return path.join(getR20RepoRoot(), 'test-results', 'r20', ...segments);
}

export async function ensureR20EvidenceDirs() {
  await Promise.all(
    ['screenshots', 'videos', 'traces', 'reports', 'api-snapshots', 'exported-test-records'].map(
      (dir) => mkdir(getR20ResultsPath(dir), { recursive: true }),
    ),
  );
}

export async function loginAsR20Role(page: Page, role: R20RoleKey) {
  const roleConfig = R20_ROLE_MAP[role];
  const username = `r20_${role}`;

  await page.goto('/login');
  await page.evaluate(
    async ({ apiBaseUrl, nextUsername, displayName, roleCodes }) => {
      const response = await fetch(`${apiBaseUrl}/auth/mock-login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          username: nextUsername,
          name: displayName,
          roleCodes,
        }),
      });

      if (!response.ok) {
        throw new Error(`mock login failed: ${response.status}`);
      }
    },
    {
      apiBaseUrl: API_BASE_URL,
      nextUsername: username,
      displayName: roleConfig.displayName,
      roleCodes: roleConfig.roleCodes,
    },
  );
}

export async function logoutR20(page: Page) {
  await page.evaluate(async ({ apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  }, { apiBaseUrl: API_BASE_URL });
}

export async function createR20ProjectByApi(
  request: APIRequestContext,
  projectKey: keyof typeof R20_PROJECT_NAMES,
): Promise<R16ProjectSummary> {
  const timestamp = buildR16Timestamp();
  const code = `R20-${timestamp}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
  const baseName = R20_PROJECT_NAMES[projectKey];

  return apiJson<R16ProjectSummary>(request, '/projects', {
    method: 'POST',
    data: {
      code,
      name: `${baseName}-${timestamp}`,
      description: `R20 真实业务场景自动化测试项目，可归档。基准项目：${baseName}`,
      priority: projectKey === 'overdue' ? 'HIGH' : 'MEDIUM',
      marketRegion: 'R20 自动化测试客户',
      vehicleModel: '轻卡 R20 测试车型',
      plannedStartDate:
        projectKey === 'overdue' ? '2025-01-02T00:00:00.000Z' : '2026-05-19T00:00:00.000Z',
      plannedEndDate:
        projectKey === 'overdue' ? '2025-01-31T00:00:00.000Z' : '2027-05-19T00:00:00.000Z',
    },
  });
}

export async function createR20ProjectViaUi(
  page: Page,
  projectKey: keyof typeof R20_PROJECT_NAMES,
) {
  const timestamp = buildR16Timestamp();
  const code = `R20-UI-${timestamp}`;
  const name = `${R20_PROJECT_NAMES[projectKey]}-${timestamp}`;

  await page.goto('/projects');
  await expect(page.getByTestId('project-list-page')).toBeVisible();
  await page.getByTestId('create-project-button').click();
  await page.getByTestId('project-code-input').fill(code);
  await page.getByTestId('project-name-input').fill(name);
  await page.getByTestId('project-priority-select').selectOption('HIGH');
  await page.getByTestId('project-market-input').fill('R20 自动化测试客户');
  await page.getByTestId('project-vehicle-model-input').fill('轻卡 R20 测试车型');
  await page.getByTestId('project-start-date-input').fill('2026-05-19');
  await page.getByTestId('project-end-date-input').fill('2027-05-19');
  await page.getByTestId('project-description-input').fill('R20 通过真实网页创建的测试项目。');
  await page.getByTestId('project-submit-button').click();
  await expect(page.getByRole('heading', { name: '项目详情同步状态' })).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();

  return { code, name };
}

export async function advanceR20ToStep4Branches(
  request: APIRequestContext,
  projectId: string,
) {
  await transitionR16Task(request, projectId, 'PROJECT_INITIATION', 'submit');
  await transitionR16Task(request, projectId, 'DEVELOPMENT_REPORT', 'submit');
  await transitionR16Task(request, projectId, 'PAINT_DEVELOPMENT', 'submit');

  return transitionR16Task(request, projectId, 'SAMPLE_COLOR_CONFIRMATION', 'approve');
}

export async function advanceR20ToStep6Branches(
  request: APIRequestContext,
  projectId: string,
) {
  await advanceR20ToStep4Branches(request, projectId);

  return transitionR16Task(request, projectId, 'PAINT_PROCUREMENT', 'submit');
}

export async function advanceR20ToCabReview(
  request: APIRequestContext,
  projectId: string,
) {
  await advanceR20ToStep6Branches(request, projectId);
  await transitionR16Task(request, projectId, 'FIRST_UNIT_PRODUCTION_PLAN', 'submit');
  await transitionR16Task(request, projectId, 'TRIAL_PRODUCTION', 'submit');

  return fetchR16Workflow(request, projectId);
}

export async function advanceR20ToAfterCabReviewApproved(
  request: APIRequestContext,
  projectId: string,
) {
  await advanceR20ToCabReview(request, projectId);

  return transitionR16Task(request, projectId, 'CAB_REVIEW', 'approve');
}

export async function advanceR20ToMonthlyReviews(
  request: APIRequestContext,
  projectId: string,
) {
  await advanceR20ToAfterCabReviewApproved(request, projectId);
  await transitionR16Task(request, projectId, 'COLOR_CONSISTENCY_REVIEW', 'approve');
  await transitionR16Task(request, projectId, 'MASS_PRODUCTION_PLAN', 'submit');
  await transitionR16Task(request, projectId, 'MASS_PRODUCTION', 'submit');

  return fetchR16Workflow(request, projectId);
}

export async function advanceR20ToColorExit(
  request: APIRequestContext,
  projectId: string,
) {
  await advanceR20ToMonthlyReviews(request, projectId);
  await transitionR16Task(request, projectId, 'VISUAL_COLOR_DIFFERENCE_REVIEW', 'approve');

  return fetchR16Workflow(request, projectId);
}

export async function uploadR20PdfMaterial(page: Page, projectId: string, fileName: string) {
  await page.goto(`/projects/${projectId}/materials`);
  await expect(page.getByTestId('materials-page')).toBeVisible();
  await page.getByTestId('material-file-input').setInputFiles({
    name: fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.from(`%PDF-1.4\n% R20 material ${fileName}\n`),
  });
  await page.getByTestId('material-upload-button').click();
  await expect(page.getByText(/材料已上传|附件已上传/)).toBeVisible();
}

export async function saveR20Screenshot(page: Page, testInfo: TestInfo, name: string) {
  await ensureR20EvidenceDirs();
  const screenshotPath = getR20ResultsPath('screenshots', `${testInfo.title.replace(/\W+/g, '-')}-${name}.png`);
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
  });
  await testInfo.attach(name, {
    path: screenshotPath,
    contentType: 'image/png',
  });

  return screenshotPath;
}

export async function writeR20ApiSnapshot(
  testInfo: TestInfo,
  name: string,
  data: unknown,
) {
  await ensureR20EvidenceDirs();
  const snapshotPath = getR20ResultsPath(
    'api-snapshots',
    `${testInfo.title.replace(/\W+/g, '-')}-${name}.json`,
  );
  await writeFile(snapshotPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  return snapshotPath;
}

export async function writeR20CaseRecord(
  testInfo: TestInfo,
  record: Record<string, unknown>,
) {
  await ensureR20EvidenceDirs();
  const recordPath = getR20ResultsPath(
    'exported-test-records',
    `${testInfo.title.replace(/\W+/g, '-')}.json`,
  );
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  return recordPath;
}

export function collectR20BrowserSignals(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();

    if (status >= 500 || (status >= 400 && !url.includes('/favicon'))) {
      failedRequests.push(`${status} ${url}`);
    }
  });

  return {
    consoleErrors,
    failedRequests,
    assertClean() {
      expect(consoleErrors, `console error: ${consoleErrors.join('\n')}`).toEqual([]);
      expect(failedRequests, `network failure: ${failedRequests.join('\n')}`).toEqual([]);
    },
  };
}

export async function expectR20PageReady(page: Page, testId: string) {
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/正在加载/)).toHaveCount(0, { timeout: 15_000 });
  const bodyText = await page.locator('body').innerText();
  expect(bodyText.trim().length).toBeGreaterThan(30);
  expect(bodyText).not.toMatch(/\b(MVP Skeleton|No data|Loading|workflow_tasks)\b/);
}

export function expectR20NodeCount(
  workflow: WorkflowResponse,
  nodeCode: R16WorkflowNodeCode,
  expected: number,
) {
  const actual = workflow.activeTasks.filter((task) => task.nodeCode === nodeCode).length;
  expect(actual, `${nodeCode} active task count`).toBe(expected);
}

export async function fetchR20ApiStatus(
  request: APIRequestContext,
  pathValue: string,
  options: {
    method?: string;
    data?: unknown;
    multipart?: Record<string, unknown>;
  } = {},
): Promise<ApiResponseSnapshot> {
  const response = await request.fetch(`${API_BASE_URL}${pathValue}`, {
    method: options.method ?? 'GET',
    data: options.data,
    multipart: options.multipart,
    failOnStatusCode: false,
  });

  return {
    status: response.status(),
    body: await response.text(),
  };
}

export async function expectR20AllWorkflowStepsVisible(page: Page, projectName: string) {
  await page.goto('/projects/timeline');
  await expectR20PageReady(page, 'project-timeline-board');
  await page.getByPlaceholder('搜索项目、颜色、当前节点').fill(projectName);
  const card = page.getByTestId('project-timeline-card').filter({ hasText: projectName });
  await expect(card).toBeVisible();

  for (const node of R16_FLOW_NODES) {
    await expect(card.getByTestId(`timeline-node-${String(node.step).padStart(2, '0')}`)).toBeVisible();
  }

  return card;
}
