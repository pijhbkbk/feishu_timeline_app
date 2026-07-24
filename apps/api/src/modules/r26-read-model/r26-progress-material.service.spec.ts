import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ProjectMemberType,
  UserStatus,
  WorkflowInstanceStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { R26ProgressMaterialService } from './r26-progress-material.service';

const actor: AuthenticatedUser = {
  id: 'user-owner',
  username: 'owner',
  name: '李晓晨',
  email: null,
  departmentId: 'dept-purchase',
  departmentName: '采购部',
  isSystemAdmin: false,
  authSource: 'feishu',
  roleCodes: ['purchaser'],
  permissionCodes: ['project.read'],
};

const taskUpdatedAt = new Date('2026-07-24T03:00:00.000Z');

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-6',
    projectId: 'project-1',
    workflowInstanceId: 'workflow-1',
    taskNo: 'TASK-006',
    nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
    stepCode: '06',
    nodeName: '涂料采购',
    taskRound: 1,
    status: WorkflowTaskStatus.IN_PROGRESS,
    isPrimary: true,
    isActive: true,
    assigneeUserId: actor.id,
    assigneeDepartmentId: 'dept-purchase',
    dueAt: new Date('2026-07-30T09:00:00.000Z'),
    manualDueAt: null,
    effectiveDueAt: new Date('2026-07-30T09:00:00.000Z'),
    reviewPassAt: null,
    overdueDays: 0,
    startedAt: new Date('2026-07-23T09:00:00.000Z'),
    completedAt: null,
    returnedAt: null,
    returnedFromTaskId: null,
    reworkReason: null,
    idempotencyKey: null,
    payload: null,
    createdAt: new Date('2026-07-23T09:00:00.000Z'),
    updatedAt: taskUpdatedAt,
    workflowInstance: {
      currentNodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
      status: WorkflowInstanceStatus.RUNNING,
    },
    assigneeUser: {
      id: actor.id,
      name: actor.name,
      status: UserStatus.ACTIVE,
      departmentId: 'dept-purchase',
      department: { id: 'dept-purchase', name: '采购部' },
    },
    project: {
      id: 'project-1',
      name: 'R26-G3B-UAT-进展提交',
      ownerUserId: 'project-manager',
      ownerUser: {
        id: 'project-manager',
        name: '项目经理',
        status: UserStatus.ACTIVE,
        departmentId: 'dept-pmo',
        department: { id: 'dept-pmo', name: '项目管理部' },
      },
      members: [
        {
          id: 'member-1',
          projectId: 'project-1',
          userId: actor.id,
          memberType: ProjectMemberType.MEMBER,
          title: '采购执行',
          isPrimary: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          user: {
            id: actor.id,
            name: actor.name,
            status: UserStatus.ACTIVE,
            departmentId: 'dept-purchase',
            department: { id: 'dept-purchase', name: '采购部' },
          },
        },
      ],
      nodeAssignments: [],
    },
    ...overrides,
  };
}

function progressRecord(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'progress-1',
    workflowTaskId: 'task-6',
    projectId: 'project-1',
    submittedById: actor.id,
    progressStatus: 'IN_PROGRESS',
    completionPercent: 50,
    completedContent: '已核对采购批次。',
    nextPlan: '补充到货确认记录。',
    materialAttachmentIds: [],
    idempotencyKey: 'r26-g3b:submit:00000001',
    requestId: 'request-1',
    taskVersion: taskUpdatedAt.toISOString(),
    createdAt: new Date('2026-07-24T03:05:00.000Z'),
    submittedBy: {
      id: actor.id,
      name: actor.name,
      department: { id: 'dept-purchase', name: '采购部' },
    },
    blocker: null,
    ...overrides,
  };
}

function createService(options: {
  loadedTask?: ReturnType<typeof task>;
  command?: unknown;
  transaction?: (tx: Record<string, unknown>) => Promise<unknown>;
  attachmentCreate?: ReturnType<typeof vi.fn>;
} = {}) {
  const loadedTask = options.loadedTask ?? task();
  const tx = {
    workflowTask: {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce({
          id: loadedTask.id,
          projectId: loadedTask.projectId,
          nodeCode: loadedTask.nodeCode,
          nodeName: loadedTask.nodeName,
          status: loadedTask.status,
          isActive: loadedTask.isActive,
          updatedAt: loadedTask.updatedAt,
          workflowInstance: {
            currentNodeCode:
              loadedTask.workflowInstance.currentNodeCode,
          },
        })
        .mockResolvedValueOnce({
          status: loadedTask.status,
          workflowInstance: {
            currentNodeCode:
              loadedTask.workflowInstance.currentNodeCode,
          },
        }),
      count: vi.fn().mockResolvedValue(18),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    taskProgressUpdate: {
      create: vi.fn().mockResolvedValue(progressRecord()),
    },
    taskBlocker: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    r26ProgressDraft: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    r26CommandRequest: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'command-1' }),
    },
  };
  const prisma = {
    workflowTask: {
      findUnique: vi.fn().mockResolvedValue(loadedTask),
    },
    workflowNodeDefinition: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    r26ProgressDraft: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    taskProgressUpdate: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    r26CommandRequest: {
      findUnique: vi.fn().mockResolvedValue(options.command ?? null),
      create: vi.fn().mockResolvedValue({ id: 'command-upload' }),
      update: vi.fn().mockResolvedValue({ id: 'command-upload' }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    department: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    attachment: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(
      options.transaction ??
        (async (executor: (client: typeof tx) => Promise<unknown>) =>
          executor(tx)),
    ),
  };
  const projectAccess = {
    assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({
      id: loadedTask.projectId,
    }),
  };
  const activityLogs = {
    createWithExecutor: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const attachmentCreate =
    options.attachmentCreate ??
    vi.fn().mockResolvedValue({
      id: 'attachment-1',
      fileName: '到货确认记录.pdf',
      versionNo: 1,
    });
  const attachments = {
    createStoredAttachment: attachmentCreate,
    getTaskMaterialVersionContent: vi.fn(),
  };
  const service = new R26ProgressMaterialService(
    prisma as never,
    projectAccess as never,
    activityLogs as never,
    attachments as never,
  );
  return {
    service,
    prisma,
    tx,
    projectAccess,
    activityLogs,
    attachmentCreate,
  };
}

const submitInput = {
  progressStatus: 'IN_PROGRESS' as const,
  completedWork: '已核对采购批次。',
  nextPlan: '补充到货确认记录。',
  assistanceUserIds: [],
  assistanceDepartmentIds: [],
  attachmentIds: [],
  taskVersion: taskUpdatedAt.toISOString(),
  idempotencyKey: 'r26-g3b:submit:00000001',
};

describe('R26 Gate 3B progress and material service', () => {
  it('submits immutable progress while preserving task, node and task count', async () => {
    const { service, tx, activityLogs } = createService();

    const result = await service.submitProgress(
      'task-6',
      submitInput,
      actor,
      'request-1',
    );

    expect(result).toMatchObject({
      progressSubmitted: true,
      taskStatusChanged: false,
      workflowTransitioned: false,
      invariants: {
        taskStatusBefore: WorkflowTaskStatus.IN_PROGRESS,
        taskStatusAfter: WorkflowTaskStatus.IN_PROGRESS,
        currentNodeBefore: WorkflowNodeCode.PAINT_PROCUREMENT,
        currentNodeAfter: WorkflowNodeCode.PAINT_PROCUREMENT,
        taskCountBefore: 18,
        taskCountAfter: 18,
      },
    });
    expect(tx.workflowTask.update).not.toHaveBeenCalled();
    expect(tx.workflowTask.updateMany).not.toHaveBeenCalled();
    expect(tx.workflowTask.create).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'R26_PROGRESS_SUBMITTED',
        metadata: expect.objectContaining({ gate: 'R26_GATE3B' }),
      }),
    );
  });

  it('records XSS-looking content as plain immutable text', async () => {
    const { service, tx } = createService();
    const completedWork = '<script>alert(1)</script>完成批次核对';

    await service.submitProgress(
      'task-6',
      { ...submitInput, completedWork },
      actor,
      'request-xss',
    );

    expect(tx.taskProgressUpdate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ completedContent: completedWork }),
      }),
    );
  });

  it('resolves the previous blocker before recording the new blocker summary', async () => {
    const { service, tx, activityLogs } = createService();
    tx.taskBlocker.findMany.mockResolvedValue([
      {
        id: 'blocker-old',
        blockerType: 'WAITING_MATERIAL',
        description: '旧的供应商阻塞',
        helperUserId: 'helper-1',
        assistanceUserIds: ['helper-1'],
        assistanceDepartmentIds: [],
        impactLevel: 'MEDIUM',
        expectedResolvedAt: new Date('2026-07-25T09:00:00.000Z'),
      },
    ]);
    tx.taskProgressUpdate.create.mockResolvedValue(
      progressRecord({
        progressStatus: 'BLOCKED',
        blocker: {
          id: 'blocker-new',
          blockerType: 'WAITING_MATERIAL',
          description: '新的到货阻塞',
          helperUserId: actor.id,
          assistanceUserIds: [actor.id],
          assistanceDepartmentIds: ['dept-purchase'],
          impactLevel: 'ALREADY_DELAYED',
          expectedResolvedAt: new Date('2026-07-26T09:00:00.000Z'),
          status: 'OPEN',
          helperUser: { id: actor.id, name: actor.name },
        },
      }),
    );

    await service.submitProgress(
      'task-6',
      {
        ...submitInput,
        progressStatus: 'BLOCKED',
        blockerType: 'WAITING_MATERIAL',
        blockerDescription: '新的到货阻塞',
        assistanceUserIds: [actor.id],
        assistanceDepartmentIds: [],
        expectedResolvedAt: '2026-07-26T09:00:00.000Z',
        impactLevel: 'ALREADY_DELAYED',
      },
      actor,
      'request-blocker-summary',
    );

    expect(tx.taskBlocker.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['blocker-old'] },
        status: 'OPEN',
      },
      data: {
        status: 'RESOLVED',
        resolvedAt: expect.any(Date),
      },
    });
    expect(activityLogs.createWithExecutor).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        beforeData: expect.objectContaining({
          blockers: [
            expect.objectContaining({
              id: 'blocker-old',
              status: 'OPEN',
            }),
          ],
        }),
        afterData: expect.objectContaining({
          blocker: expect.objectContaining({
            id: 'blocker-new',
            status: 'OPEN',
          }),
        }),
      }),
    );
  });

  it('rejects a formal blocker without assistance and resolution facts', async () => {
    const { service, tx } = createService();

    await expect(
      service.submitProgress(
        'task-6',
        {
          ...submitInput,
          progressStatus: 'BLOCKED',
          blockerType: 'WAITING_MATERIAL',
          blockerDescription: '供应商送货延迟',
        },
        actor,
        'request-blocked',
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(tx.taskProgressUpdate.create).not.toHaveBeenCalled();
  });

  it('returns 409 for a stale draft version', async () => {
    const { service, tx } = createService();
    tx.r26ProgressDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      draftVersion: 2,
    });

    await expect(
      service.saveDraft(
        'task-6',
        {
          draftVersion: 1,
          progressStatus: 'IN_PROGRESS',
          completedWork: '标签页 A',
          idempotencyKey: 'r26-g3b:draft:00000001',
        },
        actor,
        'request-draft',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'STALE_PROGRESS_DRAFT_VERSION',
        currentVersion: 2,
      },
    });
  });

  it('replays the same progress request without a second transaction', async () => {
    const { service: hashService } = createService();
    const requestHash = (
      hashService as unknown as {
        hashRequest(value: unknown): string;
      }
    ).hashRequest({
      action: 'R26_PROGRESS_SUBMITTED',
      taskId: 'task-6',
      actorUserId: actor.id,
      input: submitInput,
    });
    const command = {
      projectId: 'project-1',
      actorUserId: actor.id,
      action: 'R26_PROGRESS_SUBMITTED',
      requestHash,
      result: {
        progressSubmitted: true,
        taskStatusChanged: false,
        workflowTransitioned: false,
      },
    };
    const { service, prisma } = createService({ command });

    const result = await service.submitProgress(
      'task-6',
      submitInput,
      actor,
      'request-1',
    );

    expect(result).toMatchObject({
      progressSubmitted: true,
      idempotentReplay: true,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps ordinary observers and cross-project actors read-only', async () => {
    const observerTask = task({
      assigneeUserId: 'another-user',
      project: {
        ...task().project,
        members: [
          {
            ...task().project.members[0],
            userId: actor.id,
            memberType: ProjectMemberType.OBSERVER,
          },
        ],
      },
    });
    const { service } = createService({ loadedTask: observerTask });

    await expect(
      service.submitProgress(
        'task-6',
        submitInput,
        actor,
        'request-observer',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const denied = createService();
    denied.projectAccess.assertProjectAccessWithDefaultClient.mockRejectedValue(
      new ForbiddenException('当前用户无权访问该项目。'),
    );
    await expect(
      denied.service.submitProgress(
        'task-6',
        submitInput,
        actor,
        'request-idor',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cleans the upload reservation when binary storage fails', async () => {
    const attachmentCreate = vi
      .fn()
      .mockRejectedValue(new Error('storage interrupted'));
    const { service, prisma } = createService({ attachmentCreate });

    await expect(
      service.uploadMaterial(
        'task-6',
        {
          materialType: 'arrival-proof',
          taskVersion: taskUpdatedAt.toISOString(),
          idempotencyKey: 'r26-g3b:upload:00000001',
        },
        {
          originalname: '到货确认记录.pdf',
          mimetype: 'application/pdf',
          size: 64,
          buffer: Buffer.from('%PDF-1.4\n'),
        },
        actor,
        'request-upload',
      ),
    ).rejects.toThrow('storage interrupted');
    expect(prisma.r26CommandRequest.deleteMany).toHaveBeenCalled();
  });

  it('rejects an idempotency key reused with a different payload', async () => {
    const command = {
      projectId: 'project-1',
      actorUserId: actor.id,
      action: 'R26_PROGRESS_SUBMITTED',
      requestHash: 'different',
      result: {},
    };
    const { service } = createService({ command });

    await expect(
      service.submitProgress(
        'task-6',
        submitInput,
        actor,
        'request-conflict',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
