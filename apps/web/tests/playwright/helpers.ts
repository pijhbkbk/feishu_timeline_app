import { randomUUID } from 'node:crypto';

import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3001/api';

type WorkflowAction = 'complete' | 'approve' | 'reject';

type WorkflowResponse = {
  activeTasks: Array<{
    id: string;
    nodeCode: string;
    isPrimary: boolean;
    taskRound: number;
    status: string;
  }>;
  workflowInstance: {
    currentNodeCode: string | null;
  };
};

type TrialProductionWorkspaceResponse = {
  items: Array<{
    id: string;
  }>;
};

type FirstProductionPlanWorkspaceResponse = {
  items: Array<{
    id: string;
  }>;
};

type ProjectSummary = {
  id: string;
  code: string;
  name: string;
};

export async function loginAsProjectManager(page: Page) {
  const username = `r13_pm_${Date.now()}`;
  const response = await page.request.post(`${API_BASE_URL}/auth/mock-login`, {
    data: {
      username,
      name: 'R13 项目经理',
      roleCodes: ['project_manager'],
    },
  });
  if (!response.ok()) {
    throw new Error(`mock login failed: ${response.status()}`);
  }
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: '定制色开发项目' })).toBeVisible();
}

export async function createProjectByApi(
  request: APIRequestContext,
  suffix: string,
): Promise<ProjectSummary> {
  const code = `R13-${suffix}-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;

  return apiJson<ProjectSummary>(request, '/projects', {
    method: 'POST',
    data: {
      code,
      name: `R13 浏览器回归 ${suffix}`,
      marketRegion: 'CN',
      vehicleModel: 'LT-01',
      plannedStartDate: '2026-04-20T00:00:00.000Z',
      plannedEndDate: '2027-04-20T00:00:00.000Z',
    },
  });
}

export async function advanceToCabinReview(request: APIRequestContext, projectId: string) {
  let workflow = await fetchWorkflow(request, projectId);

  workflow = await transitionActiveTask(request, workflow, 'PROJECT_INITIATION', 'complete');
  workflow = await transitionActiveTask(request, workflow, 'DEVELOPMENT_REPORT', 'complete');
  workflow = await transitionActiveTask(request, workflow, 'PAINT_DEVELOPMENT', 'complete');
  workflow = await transitionActiveTask(request, workflow, 'SAMPLE_COLOR_CONFIRMATION', 'approve');
  workflow = await transitionActiveTask(request, workflow, 'PAINT_PROCUREMENT', 'complete');

  await completePilotProductionByApi(request, projectId, 'R13');

  workflow = await fetchWorkflow(request, projectId);

  return workflow;
}

export async function completePilotProductionByApi(
  request: APIRequestContext,
  projectId: string,
  marker = 'E2E',
) {
  const users = await apiJson<Array<{ id: string }>>(request, '/users/directory');
  const ownerId = users[0]?.id;

  if (!ownerId) {
    throw new Error('首台计划测试未找到可用责任人');
  }

  const uniqueMarker = `${marker}-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const planWorkspace = await apiJson<FirstProductionPlanWorkspaceResponse>(
    request,
    `/projects/${projectId}/first-production-plans`,
    {
      method: 'POST',
      data: {
        planDate: '2026-04-22',
        plannedQuantity: 1,
        workshop: '总装一车间',
        lineName: `${marker} 试制线`,
        ownerId,
        batchNo: `PLAN-${uniqueMarker}`,
        note: `${marker} 浏览器回归首台计划`,
      },
    },
  );
  const planId = planWorkspace.items[0]?.id;

  if (!planId) {
    throw new Error('首台计划创建失败，未返回记录 ID');
  }

  await apiJson(request, `/projects/${projectId}/first-production-plans/${planId}/confirm`, {
    method: 'POST',
    data: {},
  });
  await apiJson(request, `/projects/${projectId}/first-production-plans/complete-task`, {
    method: 'POST',
    data: {},
  });

  return completeTrialProductionByApi(request, projectId, marker, planId);
}

export async function completeTrialProductionByApi(
  request: APIRequestContext,
  projectId: string,
  marker = 'E2E',
  productionPlanId?: string,
) {
  let planId = productionPlanId;

  if (!planId) {
    const planWorkspace = await apiJson<FirstProductionPlanWorkspaceResponse>(
      request,
      `/projects/${projectId}/first-production-plans`,
    );
    planId = planWorkspace.items[0]?.id;
  }

  if (!planId) {
    throw new Error('试制记录测试未找到可关联的首台计划');
  }

  const uniqueMarker = `${marker}-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;

  const trialWorkspace = await apiJson<TrialProductionWorkspaceResponse>(
    request,
    `/projects/${projectId}/trial-productions`,
    {
      method: 'POST',
      data: {
        productionPlanId: planId,
        vehicleNo: `TRIAL-${uniqueMarker}`,
        workshop: '总装一车间',
        trialDate: '2026-04-23',
        paintBatchNo: `PAINT-${uniqueMarker}`,
        result: 'PASS',
        issueSummary: '首轮试制记录已闭环。',
        note: `${marker} 浏览器回归试制记录`,
      },
    },
  );

  const trialId = trialWorkspace.items[0]?.id;

  if (!trialId) {
    throw new Error('试制记录创建失败，未返回记录 ID');
  }

  await apiJson(request, `/projects/${projectId}/trial-productions/${trialId}/complete`, {
    method: 'POST',
    data: {},
  });
  await apiJson(request, `/projects/${projectId}/trial-productions/complete-task`, {
    method: 'POST',
    data: {},
  });

  return fetchWorkflow(request, projectId);
}

export async function advanceToMonthlyReview(request: APIRequestContext, projectId: string) {
  let workflow = await advanceToCabinReview(request, projectId);

  workflow = await transitionActiveTask(request, workflow, 'CAB_REVIEW', 'approve');
  workflow = await transitionActiveTask(request, workflow, 'COLOR_CONSISTENCY_REVIEW', 'approve');
  workflow = await transitionActiveTask(request, workflow, 'MASS_PRODUCTION_PLAN', 'complete');
  workflow = await transitionActiveTask(request, workflow, 'MASS_PRODUCTION', 'complete');

  return workflow;
}

export async function advanceToColorExit(request: APIRequestContext, projectId: string) {
  await advanceToMonthlyReview(request, projectId);
  return completeAllMonthlyReviewsByApi(request, projectId);
}

export async function completeAllMonthlyReviewsByApi(
  request: APIRequestContext,
  projectId: string,
) {
  const monthly = await apiJson<{
    recurringTasks: Array<{
      id: string;
      plannedDate: string;
      periodIndex: number;
      status: string;
    }>;
  }>(request, `/workflows/projects/${projectId}/monthly-reviews`);
  const users = await apiJson<Array<{ id: string }>>(request, '/users/directory');
  const reviewerId = users[0]?.id;

  if (!reviewerId) {
    throw new Error('月度评审测试未找到可用评审人');
  }

  for (const period of monthly.recurringTasks) {
    if (period.status === 'COMPLETED') {
      continue;
    }

    const workspace = await apiJson<{
      items: Array<{ id: string; reviewDate: string | null }>;
    }>(request, `/projects/${projectId}/reviews/visual-delta`, {
      method: 'POST',
      data: {
        reviewDate: period.plannedDate,
        reviewerId,
        reviewConclusion: 'APPROVED',
        comment: `第 ${period.periodIndex} 个月目视色差评审通过。`,
        conditionNote: null,
        rejectReason: null,
      },
    });
    const periodKey = period.plannedDate.slice(0, 7);
    const reviewId = workspace.items.find(
      (item) => item.reviewDate?.slice(0, 7) === periodKey,
    )?.id;

    if (!reviewId) {
      throw new Error(`第 ${period.periodIndex} 个月评审创建失败，未返回记录 ID`);
    }

    await apiJson(
      request,
      `/projects/${projectId}/reviews/visual-delta/${reviewId}/submit`,
      { method: 'POST', data: {} },
    );
    await apiJson(
      request,
      `/projects/${projectId}/reviews/visual-delta/${reviewId}/approve`,
      { method: 'POST', data: {} },
    );
  }

  return fetchWorkflow(request, projectId);
}

export async function createColorExitRecord(request: APIRequestContext, projectId: string) {
  return apiJson(request, `/projects/${projectId}/color-exit`, {
    method: 'POST',
    data: {
      exitDate: '2026-04-23',
      statisticYear: 2026,
      annualOutput: 0,
      finalDecision: 'EXIT',
      effectiveDate: '2026-05-01',
      exitReason: '产量低于阈值，建议退出。',
      description: 'R13 浏览器回归创建的颜色退出记录。',
      replacementColorId: null,
    },
  });
}

export async function apiJson<T>(
  request: APIRequestContext,
  path: string,
  options: {
    method?: string;
    data?: unknown;
    multipart?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const response = await request.fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: options.headers,
    data: options.data,
    multipart: options.multipart,
    failOnStatusCode: false,
  });
  const raw = await response.text();

  if (!response.ok()) {
    throw new Error(`${path} 请求失败: ${response.status()} ${raw}`);
  }

  return raw ? (JSON.parse(raw) as T) : (null as T);
}

async function fetchWorkflow(request: APIRequestContext, projectId: string) {
  return apiJson<WorkflowResponse>(request, `/workflows/projects/${projectId}`);
}

async function transitionActiveTask(
  request: APIRequestContext,
  workflow: WorkflowResponse,
  nodeCode: string,
  action: WorkflowAction,
) {
  const task = workflow.activeTasks.find(
    (item) => item.nodeCode === nodeCode && item.isPrimary,
  );

  if (!task) {
    throw new Error(`未找到活跃节点 ${nodeCode}`);
  }

  return apiJson<WorkflowResponse>(request, `/workflows/tasks/${task.id}/${action}`, {
    method: 'POST',
    data: {},
  });
}
