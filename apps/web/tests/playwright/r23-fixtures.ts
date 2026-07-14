import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

import { API_BASE_URL, apiJson } from './helpers';
import {
  buildR16Timestamp,
  fetchR16Workflow,
  type R16ProjectSummary,
  type R16WorkflowNodeCode,
} from './r16-fixtures';

export const R23_PROJECT_NAMES = {
  normal: 'R23-UAT-正常主线-深海蓝',
  rework: 'R23-UAT-评审退回-星河银',
  nonBlocking: 'R23-UAT-非阻塞支线-极光白',
  overdue: 'R23-UAT-逾期停滞-赤霞红',
  materials: 'R23-UAT-材料版本-沙岩灰',
  monthly: 'R23-UAT-月度跟踪-冰川蓝',
  concurrent: 'R23-UAT-并发编辑-琥珀金',
} as const;

export const R23_ROLE_MAP = {
  marketing: ['project_manager'],
  coatingProcess: ['process_engineer'],
  procurement: ['purchaser'],
  quality: ['quality_engineer'],
  production: ['process_engineer'],
  finance: ['finance'],
  projectManager: ['project_manager'],
  admin: ['admin'],
  viewer: ['viewer'],
} as const;

type R23ProjectKey = keyof typeof R23_PROJECT_NAMES;
type R23RoleKey = keyof typeof R23_ROLE_MAP;

export function getR23RepoRoot() {
  const cwd = process.cwd();
  return cwd.endsWith(path.join('apps', 'web')) ? path.resolve(cwd, '../..') : cwd;
}

export function getR23ResultsPath(...segments: string[]) {
  return path.join(getR23RepoRoot(), 'test-results', 'r23', ...segments);
}

export async function ensureR23EvidenceDirs() {
  await Promise.all(
    ['screenshots', 'traces', 'videos', 'har', 'performance', 'logs', 'api-snapshots'].map(
      (directory) => mkdir(getR23ResultsPath(directory), { recursive: true }),
    ),
  );
}

export async function lockR23WorkflowTask(taskId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(taskId)) {
    throw new Error('R23 数据库锁测试收到非法任务标识。');
  }

  const child = spawn(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-X', '-q', '-U', 'postgres', '-d', 'feishu_timeline'],
    {
      cwd: getR23RepoRoot(),
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  let output = '';
  let errorOutput = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    errorOutput += chunk;
  });
  child.stdin.write(`BEGIN;\nSELECT id FROM workflow_tasks WHERE id = '${taskId}' FOR UPDATE;\n\\echo R23_LOCKED\n`);

  const deadline = Date.now() + 10_000;
  while (!output.includes('R23_LOCKED')) {
    if (child.exitCode !== null) {
      throw new Error(`R23 数据库锁进程提前退出：${errorOutput || output}`);
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`R23 数据库锁等待超时：${errorOutput || output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return {
    async release() {
      child.stdin.write('COMMIT;\n\\q\n');
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error('R23 数据库锁释放超时。'));
        }, 10_000);
        child.once('exit', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(`R23 数据库锁进程失败：${errorOutput || output}`));
        });
      });
    },
  };
}

export async function setR23WorkflowTaskDueToday(taskId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(taskId)) {
    throw new Error('R23 到期扫描测试收到非法任务标识。');
  }

  const child = spawn(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-X',
      '-q',
      '-U',
      'postgres',
      '-d',
      'feishu_timeline',
      '-c',
      `UPDATE workflow_tasks SET "dueAt" = now(), "effectiveDueAt" = now() WHERE id = '${taskId}';`,
    ],
    { cwd: getR23RepoRoot(), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let errorOutput = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    errorOutput += chunk;
  });

  await new Promise<void>((resolve, reject) => {
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`R23 设置任务到期时间失败：${errorOutput || code}`));
    });
  });
}

export async function loginAsR23Role(page: Page, role: R23RoleKey) {
  const username = `r23_${role}`;
  await page.goto('/login');
  await page.evaluate(
    async ({ apiBaseUrl, nextUsername, roleCodes }) => {
      const response = await fetch(`${apiBaseUrl}/auth/mock-login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: nextUsername,
          name: `R23 ${nextUsername}`,
          roleCodes,
        }),
      });
      if (!response.ok) throw new Error(`mock login failed: ${response.status}`);
    },
    { apiBaseUrl: API_BASE_URL, nextUsername: username, roleCodes: R23_ROLE_MAP[role] },
  );
}

export async function logoutR23(page: Page) {
  await page.evaluate(async ({ apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/auth/logout`, { method: 'POST', credentials: 'include' });
  }, { apiBaseUrl: API_BASE_URL });
}

export async function createR23ProjectByApi(
  request: APIRequestContext,
  projectKey: R23ProjectKey,
): Promise<R16ProjectSummary> {
  const timestamp = buildR16Timestamp();
  const code = `R23-${projectKey.toUpperCase()}-${timestamp}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
  const isOverdue = projectKey === 'overdue';

  return apiJson<R16ProjectSummary>(request, '/projects', {
    method: 'POST',
    data: {
      code,
      name: `${R23_PROJECT_NAMES[projectKey]}-${timestamp}`,
      description: `R23 真实使用稳定性测试项目，可在本轮结束后归档。基准：${R23_PROJECT_NAMES[projectKey]}`,
      priority: isOverdue ? 'HIGH' : 'MEDIUM',
      marketRegion: 'R23 独立预发布测试',
      vehicleModel: '轻卡 R23 稳定性测试车型',
      plannedStartDate: isOverdue ? '2025-01-02T00:00:00.000Z' : '2026-07-14T00:00:00.000Z',
      plannedEndDate: isOverdue ? '2025-01-31T00:00:00.000Z' : '2027-07-14T00:00:00.000Z',
    },
  });
}

export async function transitionR23Task(
  request: APIRequestContext,
  projectId: string,
  nodeCode: R16WorkflowNodeCode,
  action: 'start' | 'submit' | 'approve' | 'reject' | 'return' | 'complete',
) {
  const workflow = await fetchR16Workflow(request, projectId);
  const task = workflow.activeTasks.find((item) => item.nodeCode === nodeCode);
  if (!task) throw new Error(`未找到活跃节点 ${nodeCode}`);

  return request.fetch(`${API_BASE_URL}/workflows/tasks/${task.id}/${action}`, {
    method: 'POST',
    data: {},
    failOnStatusCode: false,
  });
}

export async function advanceR23ToStep4(
  request: APIRequestContext,
  projectId: string,
) {
  for (const nodeCode of ['PROJECT_INITIATION', 'DEVELOPMENT_REPORT', 'PAINT_DEVELOPMENT'] as const) {
    const response = await transitionR23Task(request, projectId, nodeCode, 'submit');
    expect(response.ok(), `${nodeCode} 应推进成功`).toBe(true);
  }
  return fetchR16Workflow(request, projectId);
}

export async function requestR23(
  request: APIRequestContext,
  pathValue: string,
  options: {
    method?: string;
    data?: unknown;
    multipart?: Record<string, unknown>;
  } = {},
) {
  const response = await request.fetch(`${API_BASE_URL}${pathValue}`, {
    method: options.method ?? 'GET',
    data: options.data,
    multipart: options.multipart,
    failOnStatusCode: false,
  });
  const body = await response.text();
  return { status: response.status(), body };
}

export async function writeR23Evidence(
  testInfo: TestInfo,
  name: string,
  data: unknown,
) {
  await ensureR23EvidenceDirs();
  const evidencePath = getR23ResultsPath(
    'api-snapshots',
    `${testInfo.title.replace(/\W+/g, '-')}-${name}.json`,
  );
  await writeFile(evidencePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return evidencePath;
}

export function r23Pdf(name: string) {
  return {
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(`%PDF-1.4\n% R23 ${name}\n`),
  };
}
