import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { API_BASE_URL, apiJson } from './helpers';

export const R16_PROJECT_PREFIXES = {
  deepBlue: 'UAT-自动化-深海蓝-',
  galaxySilver: 'UAT-自动化-星河银-',
  auroraWhite: 'UAT-自动化-极光白-',
} as const;

export const R16_FLOW_NODES = [
  {
    step: 1,
    code: 'PROJECT_INITIATION',
    name: '反映市场需求',
    dueRule: '指定开始时间，4个工作日',
    output: '客户提供的颜色样板',
    blocking: true,
  },
  {
    step: 2,
    code: 'DEVELOPMENT_REPORT',
    name: '新颜色开发报告',
    dueRule: '承1，5个工作日',
    output: '新颜色开发需求报告',
    blocking: true,
  },
  {
    step: 3,
    code: 'PAINT_DEVELOPMENT',
    name: '涂料开发',
    dueRule: '承2，5个工作日',
    output: '涂料厂家样板',
    blocking: true,
  },
  {
    step: 4,
    code: 'SAMPLE_COLOR_CONFIRMATION',
    name: '样板颜色确认',
    dueRule: '承3，2个工作日',
    output: '面漆颜色确认单',
    blocking: true,
  },
  {
    step: 5,
    code: 'COLOR_NUMBERING',
    name: '新颜色取号',
    dueRule: '承4，1个工作日',
    output: '色板编号',
    blocking: false,
  },
  {
    step: 6,
    code: 'PAINT_PROCUREMENT',
    name: '涂料采购',
    dueRule: '承4，10个工作日',
    output: '涂料采购记录',
    blocking: true,
  },
  {
    step: 7,
    code: 'STANDARD_BOARD_PRODUCTION',
    name: '标准板制作、下发',
    dueRule: '承6，5个工作日',
    output: '标准色板',
    blocking: false,
  },
  {
    step: 8,
    code: 'BOARD_DETAIL_UPDATE',
    name: '色板明细更新',
    dueRule: '承7，1个工作日',
    output: '颜色库清单明细',
    blocking: false,
  },
  {
    step: 9,
    code: 'PERFORMANCE_TEST',
    name: '涂料性能试验',
    dueRule: '承6，4个月',
    output: '性能试验报告',
    blocking: false,
  },
  {
    step: 10,
    code: 'FIRST_UNIT_PRODUCTION_PLAN',
    name: '首台生产计划',
    dueRule: '承6，当天',
    output: '试制计划',
    blocking: true,
  },
  {
    step: 11,
    code: 'TRIAL_PRODUCTION',
    name: '样车试制',
    dueRule: '承10，3个工作日',
    output: '样车',
    blocking: true,
  },
  {
    step: 12,
    code: 'CAB_REVIEW',
    name: '样车驾驶室评审',
    dueRule: '评审通过时间人工录入',
    output: '评审报告',
    blocking: true,
  },
  {
    step: 13,
    code: 'DEVELOPMENT_ACCEPTANCE',
    name: '颜色开发收费',
    dueRule: '承12，当月内',
    output: '固定金额10000元收费记录',
    blocking: false,
  },
  {
    step: 14,
    code: 'COLOR_CONSISTENCY_REVIEW',
    name: '颜色一致性评审',
    dueRule: '承12，1个工作日',
    output: '评审报告',
    blocking: true,
  },
  {
    step: 15,
    code: 'MASS_PRODUCTION_PLAN',
    name: '排产计划',
    dueRule: '承14，当天',
    output: '排产计划',
    blocking: true,
  },
  {
    step: 16,
    code: 'MASS_PRODUCTION',
    name: '批量生产',
    dueRule: '承15，5个工作日',
    output: '批量生产记录',
    blocking: true,
  },
  {
    step: 17,
    code: 'VISUAL_COLOR_DIFFERENCE_REVIEW',
    name: '整车色差一致性评审',
    dueRule: '每月一次，共12个月',
    output: '色差目视评审表',
    blocking: true,
  },
  {
    step: 18,
    code: 'PROJECT_CLOSED',
    name: '颜色退出',
    dueRule: '人工录入年产量',
    output: '颜色整合清单',
    blocking: true,
  },
] as const;

export type R16WorkflowNodeCode = (typeof R16_FLOW_NODES)[number]['code'];

export const R16_BANNED_VISIBLE_ENGLISH =
  /\b(MVP Skeleton|Workspace|Dashboard|Projects|Project List|Workflow|No data|Loading|Complete|Reject|Insufficient permissions|workflow_tasks)\b/;

type WorkflowResponse = {
  activeTasks: Array<{
    id: string;
    nodeCode: R16WorkflowNodeCode;
    nodeName: string;
    isPrimary: boolean;
    taskRound: number;
    status: string;
  }>;
  taskHistory: Array<{
    id: string;
    nodeCode: R16WorkflowNodeCode;
    nodeName: string;
    isPrimary: boolean;
    taskRound: number;
    status: string;
  }>;
  workflowInstance: {
    currentNodeCode: R16WorkflowNodeCode | null;
  };
};

export type R16ProjectSummary = {
  id: string;
  code: string;
  name: string;
};

export function buildR16Timestamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
}

export async function createR16ProjectByApi(
  request: APIRequestContext,
  input: {
    prefix: string;
    colorName: string;
  },
): Promise<R16ProjectSummary> {
  const timestamp = buildR16Timestamp();
  const code = `R16-${timestamp}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;

  return apiJson<R16ProjectSummary>(request, '/projects', {
    method: 'POST',
    data: {
      code,
      name: `${input.prefix}${timestamp}`,
      description: `自动化测试项目，可归档。颜色：${input.colorName}`,
      priority: 'HIGH',
      marketRegion: '自动化测试客户',
      vehicleModel: '轻卡测试车型',
      plannedStartDate: '2026-05-07T00:00:00.000Z',
      plannedEndDate: '2027-05-07T00:00:00.000Z',
    },
  });
}

export async function fetchR16Workflow(request: APIRequestContext, projectId: string) {
  return apiJson<WorkflowResponse>(request, `/workflows/projects/${projectId}`);
}

export async function transitionR16Task(
  request: APIRequestContext,
  projectId: string,
  nodeCode: R16WorkflowNodeCode,
  action: 'start' | 'submit' | 'approve' | 'reject' | 'return' | 'complete',
  options: {
    isPrimary?: boolean;
    body?: Record<string, unknown>;
  } = {},
) {
  const workflow = await fetchR16Workflow(request, projectId);
  const task = workflow.activeTasks.find(
    (item) =>
      item.nodeCode === nodeCode &&
      (options.isPrimary === undefined || item.isPrimary === options.isPrimary),
  );

  if (!task) {
    throw new Error(`未找到活跃节点 ${nodeCode}`);
  }

  return apiJson<WorkflowResponse>(request, `/workflows/tasks/${task.id}/${action}`, {
    method: 'POST',
    data: options.body ?? {},
  });
}

export async function uploadR16ProjectMaterialViaUi(
  page: Page,
  projectId: string,
  fileName: string,
  content: string,
) {
  await page.goto(`/projects/${projectId}/materials`);
  await expect(page.getByTestId('materials-page')).toBeVisible();
  await page.getByTestId('material-file-input').setInputFiles({
    name: fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from(content),
  });
  await page.getByTestId('material-upload-button').click();
  await expect(page.getByText(/材料已上传|附件已上传/)).toBeVisible();
}

export async function expectPageReady(page: Page, testId: string) {
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/正在加载/)).toHaveCount(0, { timeout: 10_000 });
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(R16_BANNED_VISIBLE_ENGLISH);
  expect(bodyText.trim().length).toBeGreaterThan(30);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const hasUnexpectedOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 8;
  });

  expect(hasUnexpectedOverflow).toBe(false);
}

export function collectSevereBrowserSignals(page: Page) {
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();

    if (status >= 500 || (status >= 400 && !url.includes('/favicon'))) {
      failedResponses.push(`${status} ${url}`);
    }
  });

  return {
    assertClean() {
      expect(consoleErrors, `console error: ${consoleErrors.join('\n')}`).toEqual([]);
      expect(failedResponses, `network failure: ${failedResponses.join('\n')}`).toEqual([]);
    },
  };
}

export async function saveR16Screenshot(page: Page, name: string) {
  const screenshotDir = path.resolve(process.cwd(), 'test-results/r16-screenshots');
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDir, name),
    fullPage: true,
  });
}

export function getR16Node(step: number) {
  const node = R16_FLOW_NODES.find((item) => item.step === step);

  if (!node) {
    throw new Error(`R16 流程节点缺失: ${step}`);
  }

  return node;
}

export { API_BASE_URL };
