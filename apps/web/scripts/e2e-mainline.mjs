import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const API_BASE_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:3001/api';
const WEB_BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
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

  if (cookieHeader) {
    headers.set('cookie', cookieHeader);
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

async function transitionTask(jar, taskId, action, body = {}) {
  return requestJson(`/workflows/tasks/${taskId}/${action}`, jar, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
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
    const unauthorizedCreate = fetchWithCookies(`${API_BASE_URL}/projects`, financeSession.jar, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        code: `R08-FORBIDDEN-${Date.now()}`,
        name: 'R08 权限边界校验',
      }),
    });
    await expectStatus(unauthorizedCreate, 403, '财务角色不应具备项目创建权限');
    log('权限边界校验通过：finance 被禁止创建项目。');

    const managerSession = await loginAs(['project_manager'], `r08_manager_${Date.now()}`);
    const projectCode = `R08-E2E-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const project = await requestJson('/projects', managerSession.jar, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
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
      new Blob(['R08 e2e attachment'], { type: 'text/plain' }),
      'r08-e2e.txt',
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

    workflow = await transitionTask(
      managerSession.jar,
      getActiveTask(workflow, 'FIRST_UNIT_PRODUCTION_PLAN', true).id,
      'complete',
    );
    assert(
      workflow.workflowInstance.currentNodeCode === 'TRIAL_PRODUCTION',
      '并行任务不应阻塞主线推进到样车试制。',
    );
    log('并行任务不阻塞主线校验通过。');

    workflow = await transitionTask(
      managerSession.jar,
      getActiveTask(workflow, 'TRIAL_PRODUCTION', true).id,
      'complete',
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

    workflow = await transitionTask(managerSession.jar, roundTwoTrialTask.id, 'complete');
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
    assert(workflowPage.includes('<h1 class="topbar-title">流程</h1>'), '流程页未返回流程工作区壳。');
    assert(workflowPage.includes('正在加载流程视图'), '流程页未返回流程视图加载壳。');

    const reviewsPage = await requestHtml(`/projects/${project.id}/reviews`, managerSession.jar);
    assert(reviewsPage.includes('<h1 class="topbar-title">评审</h1>'), '评审页未返回评审工作区壳。');
    assert(reviewsPage.includes('驾驶室评审、一致性评审和色差评审占位'), '评审页未返回评审页面描述。');

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
