import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const API_BASE_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:3001/api';
const WEB_BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
const MUTATION_ORIGIN = new URL(
  process.env.E2E_FRONTEND_ORIGIN ?? process.env.FRONTEND_URL ?? 'http://localhost:3000',
).origin;
const START_TIMEOUT_MS = Number(process.env.E2E_START_TIMEOUT_MS ?? '180000');

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  capture(response) {
    const setCookies = response.headers.getSetCookie?.() ?? [];

    for (const rawCookie of setCookies) {
      const [pair] = rawCookie.split(';');
      if (!pair) {
        continue;
      }

      const separatorIndex = pair.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }

      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();

      if (!name) {
        continue;
      }

      this.cookies.set(name, value);
    }
  }

  toHeader() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

function log(message) {
  console.log(`[R08:E2E] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function isUrlReady(url) {
  try {
    const response = await fetch(url, {
      redirect: 'manual',
    });

    return response.ok || response.status === 302 || response.status === 307;
  } catch {
    return false;
  }
}

async function waitForUrl(url, label) {
  const startAt = Date.now();

  while (Date.now() - startAt < START_TIMEOUT_MS) {
    if (await isUrlReady(url)) {
      return;
    }

    await delay(1000);
  }

  throw new Error(`${label} 未在 ${START_TIMEOUT_MS}ms 内启动完成: ${url}`);
}

function spawnPnpm(label, args) {
  const child = spawn('pnpm', args, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      AUTH_MOCK_ENABLED: process.env.AUTH_MOCK_ENABLED ?? 'true',
      NEXT_PUBLIC_ENABLE_MOCK_LOGIN: process.env.NEXT_PUBLIC_ENABLE_MOCK_LOGIN ?? 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    const line = chunk.toString().trim();
    if (line) {
      console.log(`[${label}] ${line}`);
    }
  });

  child.stderr.on('data', (chunk) => {
    const line = chunk.toString().trim();
    if (line) {
      console.error(`[${label}] ${line}`);
    }
  });

  return child;
}

async function runPnpm(args, label) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawnPnpm(label, args);

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`${label} 执行失败，退出码 ${code ?? 'null'}`));
    });
  });
}

async function ensureServer(label, readyUrl, args) {
  if (await isUrlReady(readyUrl)) {
    log(`${label} 已在运行，复用现有进程。`);
    return null;
  }

  log(`启动 ${label}...`);
  const child = spawnPnpm(label, args);
  await waitForUrl(readyUrl, label);
  log(`${label} 已就绪。`);
  return child;
}

async function fetchWithCookies(url, jar, init = {}) {
  const headers = new Headers(init.headers ?? {});
  const cookieHeader = jar?.toHeader();
  const method = (init.method ?? 'GET').toUpperCase();

  if (cookieHeader) {
    headers.set('cookie', cookieHeader);
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !headers.has('origin')) {
    headers.set('origin', MUTATION_ORIGIN);
  }

  const response = await fetch(url, {
    ...init,
    headers,
    redirect: 'manual',
  });

  jar?.capture(response);
  return response;
}

async function requestJson(path, jar, init = {}) {
  const response = await fetchWithCookies(`${API_BASE_URL}${path}`, jar, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${path} 请求失败: ${response.status} ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function requestHtml(path, jar) {
  const response = await fetchWithCookies(`${WEB_BASE_URL}${path}`, jar, {
    headers: {
      accept: 'text/html',
    },
  });
  const html = await response.text();

  if (!response.ok) {
    throw new Error(`${path} 页面请求失败: ${response.status}`);
  }

  return html;
}

async function loginAs(roleCodes, username) {
  const jar = new CookieJar();
  const response = await fetchWithCookies(`${API_BASE_URL}/auth/mock-login`, jar, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      username,
      roleCodes,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`mock-login 失败: ${response.status} ${text}`);
  }

  return {
    jar,
    session: JSON.parse(text),
  };
}

function getActiveTask(workflow, nodeCode, isPrimary) {
  return workflow.activeTasks.find(
    (task) =>
      task.nodeCode === nodeCode &&
      (isPrimary === undefined || task.isPrimary === isPrimary),
  );
}

async function postJson(path, jar, body, headers = {}) {
  return requestJson(path, jar, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function transitionTask(jar, taskId, action, body = {}) {
  const context = await requestJson(`/workflows/tasks/${taskId}`, jar);
  const projectId = context.project.id;
  const nodeCode = context.task.nodeCode;

  if (nodeCode === 'CAB_REVIEW' || nodeCode === 'COLOR_CONSISTENCY_REVIEW') {
    assert(['approve', 'reject'].includes(action), '评审必须明确通过或驳回。');
    const actor = await requestJson('/auth/me', jar);
    const kind = nodeCode === 'CAB_REVIEW' ? 'cabin' : 'consistency';
    const path = `/projects/${projectId}/reviews/${kind}`;
    const workspace = await postJson(path, jar, {
      reviewDate: new Date().toISOString(),
      reviewerId: actor.id,
      reviewConclusion: action === 'reject' ? 'REJECTED' : 'APPROVED',
      comment: body.comment ?? 'RC2 E2E 评审资料与试制结果已核对。',
      ...(action === 'reject' ? { rejectReason: body.comment } : {}),
    });
    const review = workspace.items.find(
      (item) => item.workflowTaskId === taskId && item.reviewerId === actor.id,
    );
    assert(review?.id, '评审创建后未返回本轮评审记录。');
    const attachment = new FormData();
    attachment.set('file', new Blob(['%PDF-1.4\n% RC2 local review fixture\n'], {
      type: 'application/pdf',
    }), 'rc2-review.pdf');
    await requestJson(`${path}/${review.id}/attachment`, jar, {
      method: 'POST', body: attachment,
    });
    await requestJson(`${path}/${review.id}/submit`, jar, { method: 'POST' });
    await requestJson(`${path}/${review.id}/${action}`, jar, { method: 'POST' });
    const reread = await requestJson(path, jar);
    const savedReview = reread.items.find((item) => item.id === review.id);
    assert(savedReview?.submittedAt, '提交后的评审记录必须可重新读取。');
    assert(savedReview.reviewConclusion === review.reviewConclusion, '评审结论未保存。');
  } else if (nodeCode === 'MASS_PRODUCTION_PLAN' || nodeCode === 'MASS_PRODUCTION') {
    assert(action === 'complete', '生产记录只支持完成动作。');
    const actor = await requestJson('/auth/me', jar);
    const isPlan = nodeCode === 'MASS_PRODUCTION_PLAN';
    const path = `/projects/${projectId}/${isPlan ? 'production-plans/schedule' : 'mass-production'}`;
    const workspace = await postJson(path, jar, {
      ...(isPlan
        ? { planDate: new Date().toISOString() }
        : { productionDate: new Date().toISOString(), actualQuantity: 1 }),
      plannedQuantity: 1,
      workshop: '总装一车间',
      lineName: 'RC2 E2E 量产线',
      ownerId: actor.id,
      batchNo: `RC2-${randomUUID()}`,
    });
    const recordId = workspace.items[0]?.id;
    assert(recordId, '生产记录创建后未返回 ID。');
    await requestJson(`${path}/${recordId}/${isPlan ? 'confirm' : 'start'}`, jar, {
      method: 'POST',
    });
    if (!isPlan) {
      await requestJson(`${path}/${recordId}/complete`, jar, { method: 'POST' });
    }
    await requestJson(`${path}/complete-task`, jar, { method: 'POST' });
  } else {
    assert(['complete', 'approve'].includes(action), '普通工序不能使用评审驳回动作。');
    // Keep the generic bypass closed; the supported command must enforce its preview/version contract.
    const denied = await fetchWithCookies(`${API_BASE_URL}/workflows/tasks/${taskId}/${action}`, jar, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    const denial = await denied.json();
    assert(denied.status === 400 && denial.code === 'GENERIC_TERMINAL_TRANSITION_DISABLED',
      '通用终态入口必须继续拒绝绕过业务门禁。');
    const unchanged = await requestJson(`/workflows/tasks/${taskId}`, jar);
    assert(unchanged.task.updatedAt === context.task.updatedAt &&
      unchanged.task.status === context.task.status, '被拒绝的通用动作不得改变任务。');
    const taskVersion = context.task.updatedAt;
    const preview = await postJson(`/v2/tasks/${taskId}/completion-preview`, jar, { taskVersion });
    assert(preview.canComplete, `工序完成预览被阻断: ${JSON.stringify(preview.blockingReasons)}`);
    const idempotencyKey = randomUUID();
    await postJson(`/v2/tasks/${taskId}/complete`, jar, {
      taskVersion,
      completionReason: 'RC2 E2E 已核对工序资料和后续影响。',
      acknowledgedConsequences: true,
      idempotencyKey,
    }, { 'Idempotency-Key': idempotencyKey });
  }

  return requestJson(`/workflows/projects/${projectId}`, jar);
}

async function completeFirstProductionPlan(jar, projectId) {
  const users = await requestJson(
    `/users/directory?projectId=${encodeURIComponent(projectId)}&take=50`,
    jar,
  );
  const ownerId = users[0]?.id;

  assert(ownerId, '首台计划 E2E 未找到可用责任人。');

  const marker = `${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const workspace = await requestJson(`/projects/${projectId}/first-production-plans`, jar, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      planDate: '2026-04-22',
      plannedQuantity: 1,
      workshop: '总装一车间',
      lineName: 'R08 E2E 试制线',
      ownerId,
      batchNo: `R08-PLAN-${marker}`,
      note: 'R08 E2E 首台生产计划',
    }),
  });
  const planId = workspace.items[0]?.id;

  assert(planId, '首台计划 E2E 创建后未返回记录 ID。');

  await requestJson(`/projects/${projectId}/first-production-plans/${planId}/confirm`, jar, {
    method: 'POST',
  });
  await requestJson(`/projects/${projectId}/first-production-plans/complete-task`, jar, {
    method: 'POST',
  });
  return planId;
}

async function completeTrialProduction(jar, projectId, productionPlanId, round) {
  const marker = `${round}-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const workspace = await requestJson(`/projects/${projectId}/trial-productions`, jar, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      productionPlanId,
      vehicleNo: `R08-TRIAL-${marker}`,
      workshop: '总装一车间',
      trialDate: '2026-04-23',
      paintBatchNo: `R08-PAINT-${marker}`,
      result: 'PASS',
      issueSummary: `R08 E2E 第 ${round} 轮试制记录已闭环。`,
      note: `R08 E2E 第 ${round} 轮试制记录`,
    }),
  });
  const trialId = workspace.items[0]?.id;

  assert(trialId, `第 ${round} 轮试制 E2E 创建后未返回记录 ID。`);

  await requestJson(`/projects/${projectId}/trial-productions/${trialId}/complete`, jar, {
    method: 'POST',
  });
  await requestJson(`/projects/${projectId}/trial-productions/complete-task`, jar, {
    method: 'POST',
  });
  return requestJson(`/workflows/projects/${projectId}`, jar);
}

async function expectStatus(responsePromise, expectedStatus, message) {
  const response = await responsePromise;
  const body = await response.text();

  if (response.status !== expectedStatus) {
    throw new Error(`${message}: 期望 ${expectedStatus}，实际 ${response.status}，响应 ${body}`);
  }
}

async function main() {
  const startedChildren = [];

  try {
    log('执行 Prisma seed，确保流程定义、系统参数和演示基础数据存在。');
    await runPnpm(['--filter', '@feishu-timeline/api', 'prisma:seed'], 'seed');

    const apiChild = await ensureServer('api', `${API_BASE_URL}/health`, [
      '--filter',
      '@feishu-timeline/api',
      'dev',
    ]);
    if (apiChild) {
      startedChildren.push(apiChild);
    }

    const webChild = await ensureServer('web', `${WEB_BASE_URL}/login`, [
      '--filter',
      '@feishu-timeline/web',
      'dev',
    ]);
    if (webChild) {
      startedChildren.push(webChild);
    }

    const financeSession = await loginAs(['finance'], `r08_finance_${Date.now()}`);
    const financeCreateIdempotencyKey = randomUUID();
    const financeCreate = fetchWithCookies(`${API_BASE_URL}/projects`, financeSession.jar, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': financeCreateIdempotencyKey,
      },
      body: JSON.stringify({
        code: `R08-LEAST-PRIVILEGE-${Date.now()}`,
        name: 'R08 最小权限拒绝校验',
      }),
    });
    await expectStatus(financeCreate, 403, '财务用户不应具备项目创建权限');

    const anonymousCreateIdempotencyKey = randomUUID();
    const anonymousCreate = fetchWithCookies(`${API_BASE_URL}/projects`, null, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': anonymousCreateIdempotencyKey,
      },
      body: JSON.stringify({
        code: `R08-ANONYMOUS-${Date.now()}`,
        name: 'R08 未登录访问边界校验',
      }),
    });
    await expectStatus(anonymousCreate, 401, '未登录用户仍不得创建项目');
    log('访问策略校验通过：财务角色不能创建项目，未登录用户仍被拒绝。');

    const managerSession = await loginAs(['project_manager'], `r08_manager_${Date.now()}`);
    const projectCode = `R08-E2E-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const managerCreateIdempotencyKey = randomUUID();
    assert(
      new Set([
        financeCreateIdempotencyKey,
        anonymousCreateIdempotencyKey,
        managerCreateIdempotencyKey,
      ]).size === 3,
      '独立项目创建操作必须使用不同的幂等键。',
    );
    const project = await requestJson('/projects', managerSession.jar, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': managerCreateIdempotencyKey,
      },
      body: JSON.stringify({
        code: projectCode,
        name: `R08 E2E 主链路 ${projectCode}`,
        marketRegion: 'CN',
        vehicleModel: 'LT-01',
        plannedStartDate: '2026-04-20T00:00:00.000Z',
        plannedEndDate: '2027-04-20T00:00:00.000Z',
      }),
    });
    log(`已创建项目 ${project.code} (${project.id})。`);

    const uploadPayload = new FormData();
    uploadPayload.set('entityType', 'PROJECT');
    uploadPayload.set('entityId', project.id);
    uploadPayload.set(
      'file',
      new Blob(['%PDF-1.4\n% R08 e2e attachment\n'], { type: 'application/pdf' }),
      'r08-e2e.pdf',
    );
    const uploadResult = await requestJson(
      `/projects/${project.id}/attachments/upload`,
      managerSession.jar,
      {
        method: 'POST',
        body: uploadPayload,
      },
    );
    assert(uploadResult.entityType === 'PROJECT', '附件上传未返回项目级元数据。');
    log('附件上传校验通过。');

    let workflow = await requestJson(`/workflows/projects/${project.id}`, managerSession.jar);
    assert(
      workflow.workflowInstance.currentNodeCode === 'PROJECT_INITIATION',
      '新建项目后未停留在项目立项节点。',
    );

    workflow = await transitionTask(
      managerSession.jar,
      getActiveTask(workflow, 'PROJECT_INITIATION', true).id,
      'complete',
    );
    workflow = await transitionTask(
      managerSession.jar,
      getActiveTask(workflow, 'DEVELOPMENT_REPORT', true).id,
      'complete',
    );
    workflow = await transitionTask(
      managerSession.jar,
      getActiveTask(workflow, 'PAINT_DEVELOPMENT', true).id,
      'complete',
    );
    workflow = await transitionTask(
      managerSession.jar,
      getActiveTask(workflow, 'SAMPLE_COLOR_CONFIRMATION', true).id,
      'approve',
    );
    assert(
      Boolean(getActiveTask(workflow, 'PAINT_PROCUREMENT', true)),
      '第 4 步通过后未创建主线涂料采购任务。',
    );
    assert(
      Boolean(getActiveTask(workflow, 'COLOR_NUMBERING', false)),
      '第 4 步通过后未并行创建新颜色取号任务。',
    );
    log('第 4 步并行创建校验通过。');

    workflow = await transitionTask(
      managerSession.jar,
      getActiveTask(workflow, 'PAINT_PROCUREMENT', true).id,
      'complete',
    );
    assert(
      Boolean(getActiveTask(workflow, 'FIRST_UNIT_PRODUCTION_PLAN', true)),
      '第 6 步完成后未创建首台生产计划。',
    );
    assert(
      Boolean(getActiveTask(workflow, 'PERFORMANCE_TEST', false)),
      '第 6 步完成后未并行创建性能试验。',
    );
    assert(
      Boolean(getActiveTask(workflow, 'STANDARD_BOARD_PRODUCTION', false)),
      '第 6 步完成后未并行创建标准板制作任务。',
    );
    log('第 6 步并行创建校验通过。');

    const firstProductionPlanId = await completeFirstProductionPlan(
      managerSession.jar,
      project.id,
    );
    workflow = await requestJson(`/workflows/projects/${project.id}`, managerSession.jar);
    assert(
      workflow.workflowInstance.currentNodeCode === 'TRIAL_PRODUCTION',
      '并行任务不应阻塞主线推进到样车试制。',
    );
    log('并行任务不阻塞主线校验通过。');

    workflow = await completeTrialProduction(
      managerSession.jar,
      project.id,
      firstProductionPlanId,
      1,
    );
    workflow = await transitionTask(
      managerSession.jar,
      getActiveTask(workflow, 'CAB_REVIEW', true).id,
      'reject',
      {
        comment: 'R08 E2E 验证退回并生成新轮次',
      },
    );

    const roundTwoTrialTask = getActiveTask(workflow, 'TRIAL_PRODUCTION', true);
    assert(roundTwoTrialTask?.taskRound === 2, '第 12 步退回后未生成第 11 步新轮次。');
    log('第 12 步退回与新轮次校验通过。');

    workflow = await completeTrialProduction(
      managerSession.jar,
      project.id,
      firstProductionPlanId,
      2,
    );
    workflow = await transitionTask(
      managerSession.jar,
      getActiveTask(workflow, 'CAB_REVIEW', true).id,
      'approve',
    );
    workflow = await transitionTask(
      managerSession.jar,
      getActiveTask(workflow, 'COLOR_CONSISTENCY_REVIEW', true).id,
      'approve',
    );
    workflow = await transitionTask(
      managerSession.jar,
      getActiveTask(workflow, 'MASS_PRODUCTION_PLAN', true).id,
      'complete',
    );
    workflow = await transitionTask(
      managerSession.jar,
      getActiveTask(workflow, 'MASS_PRODUCTION', true).id,
      'complete',
    );

    const monthlyWorkspace = await requestJson(
      `/workflows/projects/${project.id}/monthly-reviews`,
      managerSession.jar,
    );
    assert(monthlyWorkspace.recurringPlan?.generatedCount === 12, '第 17 步未生成 12 个按月实例。');
    assert(monthlyWorkspace.recurringTasks.length === 12, '月度评审台账数量不是 12。');
    log('第 17 步月度评审计划校验通过。');

    const workflowPage = await requestHtml(`/projects/${project.id}/workflow`, managerSession.jar);
    assert(
      workflowPage.includes('轻卡定制色') && workflowPage.includes('正在加载流程视图'),
      '流程页未返回流程时间线壳。',
    );

    const reviewsPage = await requestHtml(`/projects/${project.id}/reviews`, managerSession.jar);
    assert(
      reviewsPage.includes('正在加载驾驶室评审模块') &&
        reviewsPage.includes('正在加载一致性评审模块'),
      '评审页未返回评审工作区壳。',
    );

    log('Web 页面校验通过。');
    log(`E2E 主链路完成：${project.code}`);
  } finally {
    for (const child of startedChildren) {
      child.kill('SIGTERM');
    }

    if (startedChildren.length > 0) {
      await delay(1500);
    }
  }
}

main().catch((error) => {
  console.error(`[R08:E2E] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
