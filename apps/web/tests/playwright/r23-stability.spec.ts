import { expect, test } from '@playwright/test';

import { API_BASE_URL, apiJson } from './helpers';
import {
  createR23ProjectByApi,
  lockR23WorkflowTask,
  loginAsR23Role,
  logoutR23,
  requestR23,
  R23_PROJECT_NAMES,
  r23Pdf,
  setR23WorkflowTaskDueToday,
  writeR23Evidence,
} from './r23-fixtures';
import { fetchR16Workflow } from './r16-fixtures';
import {
  advanceR20ToCabReview,
  advanceR20ToMonthlyReviews,
  advanceR20ToStep4Branches,
} from './r20-fixtures';

test.describe('R23 稳定性、并发与数据一致性 @r23', () => {
  test('R23-001 creates the seven required UAT project scenarios @r23', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR23Role(page, 'projectManager');
    const request = page.context().request;
    const projects = [];

    for (const projectKey of Object.keys(R23_PROJECT_NAMES) as Array<keyof typeof R23_PROJECT_NAMES>) {
      projects.push(await createR23ProjectByApi(request, projectKey));
    }

    expect(projects).toHaveLength(7);
    expect(new Set(projects.map((project) => project.id)).size).toBe(7);
    await writeR23Evidence(testInfo, 'required-projects', projects);
  });

  test('R23-002 prevents a stale start from reviving a completed workflow task @r23', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR23Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR23ProjectByApi(request, 'concurrent');
    const before = await fetchR16Workflow(request, project.id);
    const step1 = before.activeTasks.find((task) => task.nodeCode === 'PROJECT_INITIATION');
    expect(step1).toBeTruthy();

    // Hold the row lock long enough for two requests to read the same READY snapshot.
    // The stale START request is deliberately queued behind SUBMIT.
    const rowLock = await lockR23WorkflowTask(step1!.id);
    const submitPromise = requestR23(request, `/workflows/tasks/${step1!.id}/submit`, {
      method: 'POST',
      data: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const staleStartPromise = requestR23(request, `/workflows/tasks/${step1!.id}/start`, {
      method: 'POST',
      data: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await rowLock.release();
    const [submitted, staleStart] = await Promise.all([submitPromise, staleStartPromise]);
    const statuses = [submitted.status, staleStart.status];
    expect(statuses).toEqual([201, 409]);

    const after = await fetchR16Workflow(request, project.id);
    expect(after.activeTasks.filter((task) => task.nodeCode === 'DEVELOPMENT_REPORT')).toHaveLength(1);
    expect(after.activeTasks.filter((task) => task.id === step1!.id)).toHaveLength(0);
    const completedStep1 = after.taskHistory.find((task) => task.id === step1!.id);
    expect(completedStep1?.status).toBe('COMPLETED');
    await writeR23Evidence(testInfo, 'simultaneous-transition', { project, statuses, after });
  });

  test('R23-003 keeps repeated progress submissions idempotent @r23', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await loginAsR23Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR23ProjectByApi(request, 'normal');
    const workflow = await fetchR16Workflow(request, project.id);
    const task = workflow.activeTasks.find((item) => item.nodeCode === 'PROJECT_INITIATION');
    expect(task).toBeTruthy();

    const payload = {
      completedContent: 'R23 并发幂等测试进展。',
      nextPlan: '继续准备客户样板。',
      completionPercent: 10,
      isBlocked: false,
      idempotencyKey: `r23-progress-${Date.now()}`,
    };
    const attempts = await Promise.all(
      [1, 2].map(() => requestR23(request, `/tasks/${task!.id}/progress`, {
        method: 'POST',
        data: payload,
      })),
    );
    expect(attempts.map((attempt) => attempt.status)).toEqual([201, 201]);
    const createdIds = attempts.map((attempt) => JSON.parse(attempt.body).id as string);
    expect(new Set(createdIds).size).toBe(1);

    const progress = await apiJson<{ items: Array<{ id: string; idempotencyKey?: string }> }>(
      request,
      `/tasks/${task!.id}/progress`,
    );
    expect(progress.items.filter((item) => item.id === createdIds[0])).toHaveLength(1);
    await writeR23Evidence(testInfo, 'progress-idempotency', { project, createdIds, progress });
  });

  test('R23-004 preserves concurrent same-name attachments without overwriting @r23', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await loginAsR23Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR23ProjectByApi(request, 'materials');
    const fileName = 'R23-同名并发材料.pdf';

    const attempts = await Promise.all(
      [1, 2].map((sequence) => requestR23(request, `/projects/${project.id}/attachments/upload`, {
        method: 'POST',
        multipart: {
          file: r23Pdf(fileName),
          entityType: 'PROJECT',
          entityId: project.id,
          materialType: `R23 同名材料 ${sequence}`,
        },
      })),
    );
    expect(attempts.map((attempt) => attempt.status)).toEqual([201, 201]);
    const attachments = attempts.map((attempt) => JSON.parse(attempt.body) as {
      id: string;
      storageKey: string;
      originalFileName: string;
    });
    expect(new Set(attachments.map((attachment) => attachment.id)).size).toBe(2);
    expect(new Set(attachments.map((attachment) => attachment.storageKey)).size).toBe(2);
    expect(attachments.every((attachment) => attachment.originalFileName === fileName)).toBe(true);
    await writeR23Evidence(testInfo, 'same-name-attachments', { project, attachments });
  });

  test('R23-005 rejects stale actions after logout and after another tab completes @r23', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR23Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR23ProjectByApi(request, 'concurrent');
    const workflow = await fetchR16Workflow(request, project.id);
    const task = workflow.activeTasks.find((item) => item.nodeCode === 'PROJECT_INITIATION');
    expect(task).toBeTruthy();

    const first = await requestR23(request, `/workflows/tasks/${task!.id}/submit`, {
      method: 'POST',
      data: {},
    });
    const stale = await requestR23(request, `/workflows/tasks/${task!.id}/submit`, {
      method: 'POST',
      data: {},
    });
    expect(first.status).toBe(201);
    expect(stale.status).toBe(409);

    await logoutR23(page);
    const expiredSession = await requestR23(request, '/projects', { method: 'GET' });
    expect(expiredSession.status).toBe(401);
    await writeR23Evidence(testInfo, 'stale-and-expired-session', {
      project,
      firstStatus: first.status,
      staleStatus: stale.status,
      expiredSessionStatus: expiredSession.status,
    });
  });

  test('R23-006 restores primary pages after refresh and browser history navigation @r23', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await loginAsR23Role(page, 'projectManager');
    const project = await createR23ProjectByApi(page.context().request, 'normal');

    await page.goto(`/projects/${project.id}`);
    await expect(page.getByTestId('project-workspace-page')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('project-workspace-page')).toBeVisible();
    await page.goto('/projects');
    await expect(page.getByTestId('project-list-page')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('project-workspace-page')).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath('refresh-history-restored.png'),
      fullPage: true,
    });
  });

  test('R23-007 returns controlled errors for 401 and injected 500 responses @r23', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await loginAsR23Role(page, 'projectManager');
    const project = await createR23ProjectByApi(page.context().request, 'normal');

    await page.route(`${API_BASE_URL}/projects/${project.id}/flow-map`, async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"R23 injected failure"}' });
    });
    await page.goto(`/projects/${project.id}`);
    await expect(page.locator('body')).toContainText(/加载失败|稍后重试|R23 injected failure/);
    await expect(page.getByText(/正在加载/)).toHaveCount(0);

    await logoutR23(page);
    await page.goto('/dashboard');
    await expect(page.getByText('请先登录')).toBeVisible();
    await writeR23Evidence(testInfo, 'controlled-errors', { project, injectedStatus: 500, sessionStatus: 401 });
  });

  test('R23-008 blocks completion until required materials are attached @r23', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR23Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR23ProjectByApi(request, 'nonBlocking');
    await advanceR20ToStep4Branches(request, project.id);
    const workflow = await fetchR16Workflow(request, project.id);
    const task = workflow.activeTasks.find((item) => item.nodeCode === 'COLOR_NUMBERING');
    expect(task).toBeTruthy();

    const missingMaterial = await requestR23(request, `/workflows/tasks/${task!.id}/submit`, {
      method: 'POST',
      data: {},
    });
    expect(missingMaterial.status).toBe(400);
    expect(missingMaterial.body).toContain('颜色编号确认单');

    const upload = await requestR23(request, `/projects/${project.id}/attachments/upload`, {
      method: 'POST',
      multipart: {
        file: r23Pdf('R23-颜色编号确认单.pdf'),
        entityType: 'WORKFLOW_TASK',
        entityId: task!.id,
        materialType: '颜色编号确认单',
      },
    });
    expect(upload.status).toBe(201);
    const completed = await requestR23(request, `/workflows/tasks/${task!.id}/submit`, {
      method: 'POST',
      data: {},
    });
    expect(completed.status).toBe(201);
    await writeR23Evidence(testInfo, 'required-material-gate', {
      project,
      missingMaterial,
      upload: JSON.parse(upload.body),
      completedStatus: completed.status,
    });
  });

  test('R23-009 keeps attachment replacement history across refresh @r23', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR23Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR23ProjectByApi(request, 'materials');
    await loginAsR23Role(page, 'procurement');
    const upload = async (name: string, replacesAttachmentId?: string) => requestR23(
      request,
      `/projects/${project.id}/attachments/upload`,
      {
        method: 'POST',
        multipart: {
          file: r23Pdf(name),
          entityType: 'PROJECT',
          entityId: project.id,
          materialType: 'R23 采购材料版本',
          ...(replacesAttachmentId ? { replacesAttachmentId } : {}),
        },
      },
    );

    const firstAttempt = await upload('R23-采购材料-V1.pdf');
    expect(firstAttempt.status).toBe(201);
    const first = JSON.parse(firstAttempt.body) as { id: string; versionNo: number };
    const secondAttempt = await upload('R23-采购材料-V2.pdf', first.id);
    expect(secondAttempt.status, secondAttempt.body).toBe(201);
    const second = JSON.parse(secondAttempt.body) as {
      id: string;
      versionNo: number;
      replacesAttachmentId: string;
    };
    expect(second.versionNo).toBe(2);
    expect(second.replacesAttachmentId).toBe(first.id);

    const workspace = await apiJson<{
      statistics: { activeCount: number; deletedCount: number };
      items: Array<{ id: string; isDeleted: boolean; versionNo: number }>;
    }>(request, `/projects/${project.id}/attachments?includeDeleted=true`);
    expect(workspace.items.find((item) => item.id === first.id)?.isDeleted).toBe(true);
    expect(workspace.items.find((item) => item.id === second.id)?.isDeleted).toBe(false);
    expect(workspace.statistics.deletedCount).toBeGreaterThanOrEqual(1);

    await page.goto(`/projects/${project.id}/materials`);
    await expect(page.getByTestId('materials-page')).toContainText('R23-采购材料-V2.pdf');
    await page.reload();
    await expect(page.getByTestId('materials-page')).toContainText('R23-采购材料-V2.pdf');
    await writeR23Evidence(testInfo, 'attachment-version-history', { project, first, second, workspace });
  });

  test('R23-010 persists retrospective drafts after refresh and re-login @r23', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR23Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR23ProjectByApi(request, 'normal');
    const marker = `R23 复盘持久化 ${Date.now()}`;
    const saved = await requestR23(request, `/projects/${project.id}/retrospective`, {
      method: 'PUT',
      data: {
        conclusion: marker,
        strengths: '并发提交保持了事务一致性。',
        problems: '上传文件名需要保留原始编码。',
        reusableExperience: '对状态迁移使用条件更新。',
        workflowRuleUpdates: '无。',
        improvementMeasures: [],
      },
    });
    expect(saved.status).toBe(200);

    const conclusion = page.getByLabel('复盘结论');
    await page.goto(`/projects/${project.id}/retrospective`);
    await expect(page.getByTestId('retrospective-page')).toBeVisible();
    await expect(conclusion).toHaveValue(marker);
    await page.reload();
    await expect(conclusion).toHaveValue(marker);
    await logoutR23(page);
    await loginAsR23Role(page, 'projectManager');
    await page.goto(`/projects/${project.id}/retrospective`);
    await expect(conclusion).toHaveValue(marker);
    await writeR23Evidence(testInfo, 'retrospective-persistence', { project, marker });
  });

  test('R23-011 does not duplicate monthly instances after a repeated completion @r23', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await loginAsR23Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR23ProjectByApi(request, 'monthly');
    await advanceR20ToMonthlyReviews(request, project.id);
    const workflow = await fetchR16Workflow(request, project.id);
    const massProduction = workflow.taskHistory.find((item) => item.nodeCode === 'MASS_PRODUCTION');
    expect(massProduction).toBeTruthy();

    const repeated = await requestR23(request, `/workflows/tasks/${massProduction!.id}/submit`, {
      method: 'POST',
      data: {},
    });
    expect(repeated.status).toBe(409);
    const monthly = await apiJson<{
      recurringPlan: { id: string } | null;
      recurringTasks: Array<{ id: string; periodIndex: number }>;
    }>(request, `/workflows/projects/${project.id}/monthly-reviews`);
    expect(monthly.recurringPlan).toBeTruthy();
    expect(monthly.recurringTasks).toHaveLength(12);
    expect(new Set(monthly.recurringTasks.map((item) => item.periodIndex)).size).toBe(12);
    await writeR23Evidence(testInfo, 'monthly-idempotency', { project, repeated, monthly });
  });

  test('R23-012 preserves two consecutive review rework rounds @r23', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await loginAsR23Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR23ProjectByApi(request, 'rework');
    await advanceR20ToCabReview(request, project.id);

    for (const round of [1, 2]) {
      let workflow = await fetchR16Workflow(request, project.id);
      const review = workflow.activeTasks.find((item) => item.nodeCode === 'CAB_REVIEW');
      expect(review?.taskRound).toBe(round);
      const rejected = await requestR23(request, `/workflows/tasks/${review!.id}/reject`, {
        method: 'POST',
        data: { comment: `R23 第 ${round} 轮驾驶室评审退回。` },
      });
      expect(rejected.status).toBe(201);
      workflow = await fetchR16Workflow(request, project.id);
      const trial = workflow.activeTasks.find((item) => item.nodeCode === 'TRIAL_PRODUCTION');
      expect(trial?.taskRound).toBe(round + 1);
      if (round === 1) {
        const completedTrial = await requestR23(request, `/workflows/tasks/${trial!.id}/submit`, {
          method: 'POST',
          data: {},
        });
        expect(completedTrial.status).toBe(201);
      }
    }

    const after = await fetchR16Workflow(request, project.id);
    expect(after.activeTasks.filter((item) => item.nodeCode === 'TRIAL_PRODUCTION')).toHaveLength(1);
    expect(after.activeTasks.find((item) => item.nodeCode === 'TRIAL_PRODUCTION')?.taskRound).toBe(3);
    expect(after.taskHistory.filter((item) => item.nodeCode === 'CAB_REVIEW' && item.status === 'REJECTED')).toHaveLength(2);
    await writeR23Evidence(testInfo, 'two-rework-rounds', { project, after });
  });

  test('R23-013 recovers from an interrupted upload without a partial record @r23', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR23Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR23ProjectByApi(request, 'materials');
    const uploadUrl = `${API_BASE_URL}/projects/${project.id}/attachments/upload`;
    await page.route(uploadUrl, async (route) => route.abort('internetdisconnected'), { times: 1 });
    await page.goto(`/projects/${project.id}/materials`);
    await expect(page.getByTestId('materials-page')).toBeVisible();
    await page.getByTestId('material-file-input').setInputFiles({
      name: 'R23-中断恢复材料.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% R23 interrupted upload\n'),
    });
    await page.getByTestId('material-upload-button').click();
    await expect(page.getByText('网络连接失败，请稍后重试。')).toBeVisible();

    const afterFailure = await apiJson<{ statistics: { activeCount: number } }>(
      request,
      `/projects/${project.id}/attachments`,
    );
    expect(afterFailure.statistics.activeCount).toBe(0);
    await page.getByTestId('material-upload-button').click();
    await expect(page.getByText('材料已上传。')).toBeVisible();
    const afterRetry = await apiJson<{ statistics: { activeCount: number } }>(
      request,
      `/projects/${project.id}/attachments`,
    );
    expect(afterRetry.statistics.activeCount).toBe(1);
    await writeR23Evidence(testInfo, 'interrupted-upload-recovery', { project, afterFailure, afterRetry });
  });

  test('R23-014 deduplicates repeated due-reminder scheduler runs @r23', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR23Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR23ProjectByApi(request, 'overdue');
    const workflow = await fetchR16Workflow(request, project.id);
    const task = workflow.activeTasks.find((item) => item.nodeCode === 'PROJECT_INITIATION');
    expect(task).toBeTruthy();
    await setR23WorkflowTaskDueToday(task!.id);
    await loginAsR23Role(page, 'admin');

    const firstAttempt = await requestR23(request, '/internal/notifications/process-due-reminder-scan', {
      method: 'POST',
      data: {},
    });
    expect(firstAttempt.status).toBe(201);
    const first = JSON.parse(firstAttempt.body) as { scanned: number; enqueued: number };
    expect(first.scanned).toBeGreaterThanOrEqual(1);
    expect(first.enqueued).toBeGreaterThanOrEqual(1);
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const secondAttempt = await requestR23(request, '/internal/notifications/process-due-reminder-scan', {
      method: 'POST',
      data: {},
    });
    expect(secondAttempt.status).toBe(201);
    const second = JSON.parse(secondAttempt.body) as { scanned: number; enqueued: number };
    expect(second.scanned).toBeGreaterThanOrEqual(1);
    expect(second.enqueued).toBe(0);
    await writeR23Evidence(testInfo, 'scheduler-deduplication', { project, taskId: task!.id, first, second });
  });
});
