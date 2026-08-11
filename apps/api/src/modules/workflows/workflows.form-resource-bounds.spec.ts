import { WorkflowInstanceStatus, WorkflowNodeCode, WorkflowTaskStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { WorkflowsService } from './workflows.service';

const actor: AuthenticatedUser = {
  id: 'workflow-form-user',
  username: 'workflow-form-user',
  name: '表单负责人',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['project_manager'],
  permissionCodes: ['workflow.transition'],
};

const task = {
  id: 'workflow-task-1',
  workflowInstanceId: 'workflow-1',
  projectId: 'project-1',
  nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
  nodeName: '样板颜色确认',
  status: WorkflowTaskStatus.IN_PROGRESS,
  isActive: true,
  updatedAt: new Date('2026-08-11T08:00:00.000Z'),
  assigneeUserId: actor.id,
  payload: { formData: { color: 'before' }, draftComment: 'before' },
  workflowInstance: {
    id: 'workflow-1',
    status: WorkflowInstanceStatus.RUNNING,
    currentNodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
  },
  project: { id: 'project-1', ownerUserId: actor.id },
  assigneeUser: null,
  assigneeDepartment: null,
};

function createHarness(options: { recentAuditCount?: number } = {}) {
  const tx = {
    workflowTask: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: {
      count: vi.fn().mockResolvedValue(options.recentAuditCount ?? 0),
    },
  };
  const prisma = {
    $transaction: vi.fn(
      async <T>(callback: (executor: typeof tx) => Promise<T>) => callback(tx),
    ),
  };
  const activityLogsService = {
    createWithExecutor: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const projectAccessService = {
    assertProjectAccess: vi.fn().mockResolvedValue(undefined),
    assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined),
  };
  const service = new WorkflowsService(
    prisma as never,
    activityLogsService as never,
    { enqueueTaskNotification: vi.fn() } as never,
    { buildTaskSchedule: vi.fn() } as never,
    { ensureMonthlyReviewPlan: vi.fn() } as never,
    projectAccessService as never,
  );
  vi.spyOn(service as never, 'getTaskOrThrow').mockResolvedValue({ ...task } as never);
  vi.spyOn(service as never, 'buildTaskDetailResponse').mockResolvedValue({
    task: { id: task.id },
  } as never);

  return { service, prisma, tx, activityLogsService };
}

describe('WorkflowsService task form resource bounds', () => {
  it('rejects an oversized payload before opening a database transaction', async () => {
    const { service, prisma } = createHarness();

    await expect(
      service.saveTaskForm(task.id, actor, {
        payload: Object.fromEntries(
          Array.from({ length: 9 }, (_, index) => [
            `section-${index}`,
            'x'.repeat(1_900),
          ]),
        ),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'WORKFLOW_FORM_PAYLOAD_TOO_LARGE' }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects excessive nesting and field counts before opening a transaction', async () => {
    const { service, prisma } = createHarness();
    let nested: Record<string, unknown> = { value: 'end' };
    for (let index = 0; index < 10; index += 1) nested = { child: nested };

    await expect(
      service.saveTaskForm(task.id, actor, { payload: nested }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'WORKFLOW_FORM_PAYLOAD_INVALID' }),
    });
    await expect(
      service.saveTaskForm(task.id, actor, {
        payload: Object.fromEntries(
          Array.from({ length: 257 }, (_, index) => [`field-${index}`, index]),
        ),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'WORKFLOW_FORM_PAYLOAD_INVALID' }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a task form mutation at the persisted audit rate before task or audit writes', async () => {
    const { service, tx, activityLogsService } = createHarness({ recentAuditCount: 30 });

    await expect(
      service.saveTaskForm(task.id, actor, { payload: { color: 'next' } }),
    ).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({ code: 'WORKFLOW_FORM_RATE_EXCEEDED' }),
    });
    expect(tx.workflowTask.updateMany).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('skips identical form saves without appending a new audit record', async () => {
    const { service, tx, activityLogsService } = createHarness();

    await expect(
      service.saveTaskForm(task.id, actor, {
        payload: { color: 'before' },
        comment: 'before',
      }),
    ).resolves.toMatchObject({ task: { id: task.id } });
    expect(tx.workflowTask.updateMany).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('stores only bounded hashes and sizes in the immutable audit record', async () => {
    const { service, tx, activityLogsService } = createHarness();

    await service.saveTaskForm(task.id, actor, {
      payload: { color: 'after', details: 'y'.repeat(1_900) },
      comment: 'changed',
    });

    expect(tx.workflowTask.updateMany).toHaveBeenCalledTimes(1);
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledTimes(1);
    const auditInput = activityLogsService.createWithExecutor.mock.calls[0]?.[1];
    expect(auditInput).toMatchObject({
      beforeData: {
        payloadSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        payloadBytes: expect.any(Number),
        commentSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        commentBytes: expect.any(Number),
      },
      afterData: {
        payloadSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        payloadBytes: expect.any(Number),
        commentSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        commentBytes: expect.any(Number),
      },
    });
    expect(JSON.stringify(auditInput)).not.toContain('y'.repeat(100));
    expect(Buffer.byteLength(JSON.stringify(auditInput), 'utf8')).toBeLessThan(2_000);
  });

  it('makes a comment-only change visible in the bounded audit snapshot', async () => {
    const { service, tx, activityLogsService } = createHarness();

    await service.saveTaskForm(task.id, actor, {
      payload: { color: 'before' },
      comment: 'after',
    });

    expect(tx.workflowTask.updateMany).toHaveBeenCalledTimes(1);
    const auditInput = activityLogsService.createWithExecutor.mock.calls[0]?.[1] as {
      beforeData: { payloadSha256: string; commentSha256: string };
      afterData: { payloadSha256: string; commentSha256: string };
    };
    expect(auditInput.beforeData.payloadSha256).toBe(
      auditInput.afterData.payloadSha256,
    );
    expect(auditInput.beforeData.commentSha256).not.toBe(
      auditInput.afterData.commentSha256,
    );
    expect(Buffer.byteLength(JSON.stringify(auditInput), 'utf8')).toBeLessThan(2_000);
  });
});
