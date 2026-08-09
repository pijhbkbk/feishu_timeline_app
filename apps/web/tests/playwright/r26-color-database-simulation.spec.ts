import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';

import { API_BASE_URL } from './helpers';
import { fetchR16Workflow } from './r16-fixtures';
import {
  advanceR20ToStep4Branches,
  createR20ProjectByApi,
  getR20RepoRoot,
  loginAsR20Role,
} from './r20-fixtures';

const EVIDENCE_DIR = path.join(
  getR20RepoRoot(),
  'docs/product/evidence/R26_COLOR_DATABASE_SIMULATION_20260807',
);

type ColorDatabaseResponse = {
  total: number;
  summary: {
    archivedColors: number;
    materialCount: number;
    incompleteColors: number;
    newMaterialsThisMonth: number;
  };
  items: Array<{
    id: string;
    code: string;
    name: string;
    projects: Array<{ id: string; name: string }>;
  }>;
};

type TaskDetailResponse = {
  taskId: string;
  taskVersion: string;
  nodeCode: string;
};

type CompletionPreviewResponse = {
  canComplete: boolean;
  blockingReasons: string[];
  currentTask: {
    id: string;
    nodeCode: string;
  };
};

type CompletionResponse = {
  command: {
    completedTask: { id: string; nodeCode: string };
    colorNumbering?: {
      colorId: string;
      code: string;
      numberingTaskId: string;
      numberedBy: { id: string; name: string };
      numberedAt: string;
      confirmationAttachment: {
        id: string;
        fileName: string;
        materialType: string | null;
        uploadedAt: string;
      };
    } | null;
  };
};

async function readJson<T>(response: APIResponse): Promise<T> {
  const raw = await response.text();
  if (!response.ok()) {
    throw new Error(`${response.url()} 请求失败：${response.status()} ${raw}`);
  }
  return raw ? (JSON.parse(raw) as T) : (null as T);
}

async function fetchTaskDetail(request: APIRequestContext, taskId: string) {
  const response = await request.get(`${API_BASE_URL}/workflows/tasks/${taskId}/detail`, {
    failOnStatusCode: false,
  });
  return readJson<TaskDetailResponse>(response);
}

async function previewCompletion(
  request: APIRequestContext,
  taskId: string,
  taskVersion: string,
  colorNumber?: string,
) {
  const response = await request.post(`${API_BASE_URL}/v2/tasks/${taskId}/completion-preview`, {
    data: {
      taskVersion,
      ...(colorNumber === undefined ? {} : { colorNumber }),
    },
    failOnStatusCode: false,
  });
  return readJson<CompletionPreviewResponse>(response);
}

async function uploadColorNumberProof(
  request: APIRequestContext,
  projectId: string,
  taskId: string,
) {
  const response = await request.post(
    `${API_BASE_URL}/projects/${projectId}/attachments/upload`,
    {
      multipart: {
        file: {
          name: `第05步颜色编号确认单-${projectId}.pdf`,
          mimeType: 'application/pdf',
          buffer: Buffer.from('%PDF-1.4\n% R26 controlled color numbering proof\n'),
        },
        entityType: 'WORKFLOW_TASK',
        entityId: taskId,
        materialType: '颜色编号确认单',
      },
      failOnStatusCode: false,
    },
  );
  return readJson<{ id: string; entityId: string; materialType: string }>(response);
}

async function completeColorNumbering(
  request: APIRequestContext,
  taskId: string,
  taskVersion: string,
  colorNumber: string,
  idempotencyKey: string,
) {
  return request.post(`${API_BASE_URL}/v2/tasks/${taskId}/complete`, {
    headers: {
      'Idempotency-Key': idempotencyKey,
      'X-Request-Id': idempotencyKey,
    },
    data: {
      taskVersion,
      completionReason: 'R26 颜色数据库受控来源完整模拟测试。',
      acknowledgedConsequences: true,
      idempotencyKey,
      colorNumber,
    },
    failOnStatusCode: false,
  });
}

async function getColorDatabase(request: APIRequestContext, search?: string) {
  const response = await request.get(`${API_BASE_URL}/admin/color-database`, {
    params: search ? { search } : undefined,
    failOnStatusCode: false,
  });
  return readJson<ColorDatabaseResponse>(response);
}

async function createStep05Scenario(request: APIRequestContext, projectKey: 'normal' | 'nonBlocking') {
  const project = await createR20ProjectByApi(request, projectKey);
  await advanceR20ToStep4Branches(request, project.id);
  const workflow = await fetchR16Workflow(request, project.id);
  const task = workflow.activeTasks.find((item) => item.nodeCode === 'COLOR_NUMBERING');
  expect(task, '第 04 步完成后必须生成第 05 步新颜色取号').toBeTruthy();
  const detail = await fetchTaskDetail(request, task!.id);
  expect(detail.nodeCode).toBe('COLOR_NUMBERING');
  return { project, task: task!, detail };
}

test.describe('R26 颜色数据库受控编号完整模拟', () => {
  test('第 05 步唯一编号、材料、幂等和颜色数据库回读形成闭环', async ({ page }) => {
    test.setTimeout(240_000);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await loginAsR20Role(page, 'admin');
    const request = page.context().request;

    const baseline = await getColorDatabase(request);
    expect(baseline.total).toBeGreaterThanOrEqual(0);
    expect(baseline.summary.archivedColors).toBe(baseline.total);

    const positive = await createStep05Scenario(request, 'normal');
    const colorNumber = `R26-UAT-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;

    const missingNumber = await previewCompletion(
      request,
      positive.task.id,
      positive.detail.taskVersion,
    );
    expect(missingNumber.canComplete).toBe(false);
    expect(missingNumber.blockingReasons.join('\n')).toContain('颜色编号');
    expect(missingNumber.blockingReasons.join('\n')).toContain('颜色编号确认单');

    const invalidNumber = await previewCompletion(
      request,
      positive.task.id,
      positive.detail.taskVersion,
      'INVALID COLOR NUMBER',
    );
    expect(invalidNumber.canComplete).toBe(false);
    expect(invalidNumber.blockingReasons.join('\n')).toMatch(/格式|编号/);

    const missingMaterial = await previewCompletion(
      request,
      positive.task.id,
      positive.detail.taskVersion,
      colorNumber,
    );
    expect(missingMaterial.canComplete).toBe(false);
    expect(missingMaterial.blockingReasons.join('\n')).toContain('颜色编号确认单');

    const proof = await uploadColorNumberProof(
      request,
      positive.project.id,
      positive.task.id,
    );
    expect(proof.entityId).toBe(positive.task.id);

    const refreshedDetail = await fetchTaskDetail(request, positive.task.id);
    const ready = await previewCompletion(
      request,
      positive.task.id,
      refreshedDetail.taskVersion,
      colorNumber,
    );
    expect(ready.canComplete).toBe(true);
    expect(ready.blockingReasons).toEqual([]);

    const idempotencyKey = `r26-color-${randomUUID()}`;
    const firstCompletionResponse = await completeColorNumbering(
      request,
      positive.task.id,
      refreshedDetail.taskVersion,
      colorNumber,
      idempotencyKey,
    );
    expect(firstCompletionResponse.status()).toBe(201);
    const firstCompletion = await readJson<CompletionResponse>(firstCompletionResponse);
    expect(firstCompletion.command.completedTask.nodeCode).toBe('COLOR_NUMBERING');
    expect(firstCompletion.command.colorNumbering).toMatchObject({
      code: colorNumber,
      numberingTaskId: positive.task.id,
      confirmationAttachment: {
        id: proof.id,
        materialType: '颜色编号确认单',
      },
    });
    expect(firstCompletion.command.colorNumbering?.numberedBy.id).toBeTruthy();
    expect(firstCompletion.command.colorNumbering?.numberedAt).toBeTruthy();

    const replayResponse = await completeColorNumbering(
      request,
      positive.task.id,
      refreshedDetail.taskVersion,
      colorNumber,
      idempotencyKey,
    );
    expect(replayResponse.status()).toBe(201);
    const replay = await readJson<CompletionResponse>(replayResponse);
    expect(replay.command.colorNumbering).toEqual(firstCompletion.command.colorNumbering);

    const archive = await getColorDatabase(request);
    expect(archive.total).toBe(baseline.total + 1);
    expect(archive.summary.archivedColors).toBe(baseline.summary.archivedColors + 1);
    const numberedColor = archive.items.find((item) => item.code === colorNumber);
    expect(numberedColor).toBeTruthy();
    expect(numberedColor?.projects.some((project) => project.id === positive.project.id)).toBe(true);

    const searched = await getColorDatabase(request, colorNumber.toLocaleLowerCase('zh-CN'));
    expect(searched.total).toBe(1);
    expect(searched.items[0]?.code).toBe(colorNumber);
    const noMatch = await getColorDatabase(request, 'R26-NOT-FOUND-COLOR');
    expect(noMatch.total).toBe(0);

    const duplicate = await createStep05Scenario(request, 'nonBlocking');
    const duplicateProof = await uploadColorNumberProof(
      request,
      duplicate.project.id,
      duplicate.task.id,
    );
    expect(duplicateProof.id).toBeTruthy();
    const duplicateDetail = await fetchTaskDetail(request, duplicate.task.id);
    const duplicatePreview = await previewCompletion(
      request,
      duplicate.task.id,
      duplicateDetail.taskVersion,
      colorNumber.toLocaleLowerCase('zh-CN'),
    );
    expect(duplicatePreview.canComplete).toBe(false);
    expect(duplicatePreview.blockingReasons.join('\n')).toMatch(/已被.*使用|唯一|重复/);

    const afterDuplicate = await getColorDatabase(request);
    expect(afterDuplicate.total).toBe(baseline.total + 1);

    const evidence = {
      generatedAt: new Date().toISOString(),
      apiBaseUrl: API_BASE_URL,
      baseline,
      positive: {
        project: positive.project,
        taskId: positive.task.id,
        taskVersion: refreshedDetail.taskVersion,
        colorNumber,
        proof,
        missingNumber,
        invalidNumber,
        missingMaterial,
        ready,
        completion: firstCompletion.command,
        idempotentReplayMatched: true,
      },
      duplicate: {
        project: duplicate.project,
        taskId: duplicate.task.id,
        proof: duplicateProof,
        preview: duplicatePreview,
      },
      finalArchive: afterDuplicate,
      search: {
        matched: searched,
        empty: noMatch,
      },
    };
    await writeFile(
      path.join(EVIDENCE_DIR, '02-controlled-numbering-api-simulation.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8',
    );
  });
});
