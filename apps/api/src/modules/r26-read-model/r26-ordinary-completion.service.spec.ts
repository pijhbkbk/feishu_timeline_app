import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  Prisma,
  ProjectAssignmentSource,
  ProjectMemberType,
  WorkflowInstanceStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { R26OrdinaryCompletionService } from './r26-ordinary-completion.service';

const owner: AuthenticatedUser = {
  id: 'owner-1',
  username: 'owner',
  name: '项目负责人',
  email: null,
  departmentId: 'dept-pmo',
  departmentName: '项目管理部',
  isSystemAdmin: false,
  authSource: 'feishu',
  roleCodes: ['project_manager'],
  permissionCodes: ['project.read', 'workflow.transition'],
};

const observer: AuthenticatedUser = {
  ...owner,
  id: 'observer-1',
  username: 'observer',
  name: '普通观察者',
  departmentId: 'dept-other',
  departmentName: '其他部门',
  roleCodes: ['viewer'],
};

const updatedAt = new Date('2026-07-24T03:00:00.000Z');

function task(
  nodeCode: WorkflowNodeCode,
  overrides: Record<string, unknown> = {},
) {
  const names: Partial<Record<WorkflowNodeCode, string>> = {
    [WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION]:
      '样板颜色确认',
    [WorkflowNodeCode.PAINT_PROCUREMENT]: '涂料采购',
    [WorkflowNodeCode.CAB_REVIEW]:
      '样车驾驶室评审',
  };

  return {
    id: `task-${nodeCode}`,
    projectId: 'project-1',
    workflowInstanceId: 'workflow-1',
    nodeCode,
    nodeName: names[nodeCode] ?? '普通工序',
    status: WorkflowTaskStatus.IN_PROGRESS,
    isActive: true,
    assigneeUserId: owner.id,
    updatedAt,
    workflowInstance: {
      id: 'workflow-1',
      status: WorkflowInstanceStatus.RUNNING,
      currentNodeCode: nodeCode,
      commandVersion: 8,
    },
    assigneeUser: {
      id: owner.id,
      name: owner.name,
    },
    project: {
      id: 'project-1',
      ownerUserId: owner.id,
      members: [
        {
          userId: owner.id,
          memberType: ProjectMemberType.OWNER,
        },
      ],
    },
    ...overrides,
  };
}

type CompletionInspectionFixture = {
  taskIsActive: boolean;
  form: {
    satisfied: boolean;
    missing: Array<{ key: string; label: string }>;
  };
  materials: {
    satisfied: boolean;
    missing: Array<{
      id: string;
      name: string;
      required?: boolean;
    }>;
  };
  blockers: Array<{
    id: string;
    blockerType: string;
    description: string;
    impactLevel: string | null;
    expectedResolvedAt: string | null;
    createdAt: string;
  }>;
  domainBlockingReasons: string[];
};

const satisfiedInspection: CompletionInspectionFixture = {
  taskIsActive: true,
  form: { satisfied: true, missing: [] },
  materials: { satisfied: true, missing: [] },
  blockers: [],
  domainBlockingReasons: [],
};

function assignment(nodeCode: WorkflowNodeCode) {
  return {
    nodeCode,
    primaryDepartment: {
      id: `dept-${nodeCode}`,
      name: '责任部门',
    },
    collaboratorDepartments: [],
    suggestedOwner: {
      id: `owner-${nodeCode}`,
      name: `负责人-${nodeCode}`,
    },
    collaborators: [],
    reviewers: [],
    assignmentStatus: 'ASSIGNED',
    assignmentSource:
      ProjectAssignmentSource.PROJECT_DEFAULT_ASSIGNEE,
    availableActions: [],
    unassignedReason: null,
  };
}

function createService(options: {
  loadedTask?: ReturnType<typeof task>;
  command?: unknown;
  inspection?: CompletionInspectionFixture;
  transactionError?: unknown;
} = {}) {
  const loadedTask =
    options.loadedTask ??
    task(WorkflowNodeCode.PAINT_PROCUREMENT);
  const prisma = {
    workflowTask: {
      findUnique: vi.fn().mockResolvedValue(loadedTask),
    },
    r26CommandRequest: {
      findUnique: vi.fn().mockResolvedValue(
        options.command ?? null,
      ),
    },
    $transaction: options.transactionError
      ? vi.fn().mockRejectedValue(options.transactionError)
      : vi.fn(
          async (
            callback: (client: {
              workflowTask: {
                findUnique: ReturnType<typeof vi.fn>;
              };
            }) => Promise<unknown>,
          ) =>
            callback({
              workflowTask: {
                findUnique: vi
                  .fn()
                  .mockResolvedValue(loadedTask),
              },
            }),
        ),
  };
  const projectAccess = {
    assertProjectAccess: vi.fn().mockResolvedValue({
      id: loadedTask.projectId,
    }),
  };
  const workflows = {
    inspectTaskCompletionWithExecutor: vi
      .fn()
      .mockResolvedValue(
        options.inspection ?? satisfiedInspection,
      ),
    transitionTaskWithExecutor: vi.fn(),
  };
  const assignments = {
    resolveFutureAssignmentsWithExecutor: vi
      .fn()
      .mockImplementation(
        async (
          _db: unknown,
          _projectId: string,
          nodeCodes: WorkflowNodeCode[],
        ) => nodeCodes.map(assignment),
      ),
  };
  const activityLogs = {
    createWithExecutor: vi.fn(),
  };
  const service = new R26OrdinaryCompletionService(
    prisma as never,
    projectAccess as never,
    assignments as never,
    workflows as never,
    activityLogs as never,
  );

  return {
    service,
    prisma,
    projectAccess,
    workflows,
    assignments,
  };
}

describe('R26OrdinaryCompletionService Gate 3C1', () => {
  it('previews step 4 as exactly steps 5 and 6 using server assignments', async () => {
    const { service } = createService({
      loadedTask: task(
        WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
      ),
    });

    const preview = await service.previewCompletion(
      'task-step-4',
      { taskVersion: updatedAt.toISOString() },
      owner,
    );

    expect(preview.canComplete).toBe(true);
    expect(
      preview.nextTasks.map((item) => [
        item.stepNumber,
        item.isPrimary,
      ]),
    ).toEqual([
      [5, false],
      [6, true],
    ]);
    expect(
      preview.nextTasks.every(
        (item) =>
          item.assignmentSource ===
          ProjectAssignmentSource.PROJECT_DEFAULT_ASSIGNEE,
      ),
    ).toBe(true);
  });

  it('previews step 6 as exactly steps 7, 9 and 10 and marks step 9 non-blocking', async () => {
    const { service } = createService();

    const preview = await service.previewCompletion(
      'task-step-6',
      { taskVersion: updatedAt.toISOString() },
      owner,
    );

    expect(
      preview.nextTasks.map((item) => item.stepNumber),
    ).toEqual([7, 9, 10]);
    expect(
      preview.nextTasks.find((item) => item.stepNumber === 9),
    ).toMatchObject({
      isPrimary: false,
      isNonBlocking: true,
    });
    expect(
      preview.nextTasks.find((item) => item.stepNumber === 10),
    ).toMatchObject({
      isPrimary: true,
      isNonBlocking: false,
    });
  });

  it('lists missing materials and open blockers instead of silently disabling completion', async () => {
    const { service } = createService({
      inspection: {
        ...satisfiedInspection,
        materials: {
          satisfied: false,
          missing: [
            {
              id: 'material-1',
              name: '到货确认记录',
            },
          ],
        },
        blockers: [
          {
            id: 'blocker-1',
            blockerType: 'SUPPLIER',
            description: '等待供应商确认',
            impactLevel: 'HIGH',
            expectedResolvedAt: null,
            createdAt: updatedAt.toISOString(),
          },
        ],
      },
    });

    const preview = await service.previewCompletion(
      'task-step-6',
      { taskVersion: updatedAt.toISOString() },
      owner,
    );

    expect(preview.canComplete).toBe(false);
    expect(preview.blockingReasons).toEqual(
      expect.arrayContaining([
        '缺少必交材料：到货确认记录',
        '解除“等待供应商确认”阻塞',
      ]),
    );
    expect(
      preview.availableActions.map((item) => item.action),
    ).toContain('RESOLVE_BLOCKER');
  });

  it('keeps step 12 and later outside Gate 3C1', async () => {
    const { service } = createService({
      loadedTask: task(
        WorkflowNodeCode.CAB_REVIEW,
      ),
    });

    await expect(
      service.previewCompletion(
        'task-step-12',
        { taskVersion: updatedAt.toISOString() },
        owner,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a stale taskVersion with 409 semantics', async () => {
    const { service } = createService();

    await expect(
      service.previewCompletion(
        'task-step-6',
        { taskVersion: '2026-07-24T02:00:00.000Z' },
        owner,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'STALE_TASK_VERSION',
      },
    });
  });

  it('returns a read-only permission check in preview but rejects observer completion with 403', async () => {
    const loadedTask = task(
      WorkflowNodeCode.PAINT_PROCUREMENT,
      {
        assigneeUserId: 'another-user',
        project: {
          id: 'project-1',
          ownerUserId: 'another-user',
          members: [],
        },
      },
    );
    const { service, prisma } = createService({ loadedTask });
    const preview = await service.previewCompletion(
      loadedTask.id,
      { taskVersion: updatedAt.toISOString() },
      observer,
    );

    expect(preview.canComplete).toBe(false);
    expect(preview.blockingReasons).toContain(
      '当前用户不是任务负责人或项目负责人。',
    );

    const tx = {
      workflowTask: {
        findUnique: vi.fn().mockResolvedValue(loadedTask),
      },
    };
    prisma.$transaction.mockImplementation(
      async (
        callback: (client: typeof tx) => Promise<unknown>,
      ) => callback(tx),
    );

    await expect(
      service.completeTask(
        loadedTask.id,
        {
          taskVersion: updatedAt.toISOString(),
          completionReason: '观察者不应能完成',
          acknowledgedConsequences: true,
          idempotencyKey: 'r26-g3c1:observer:00000001',
        },
        observer,
        'request-observer',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('replays the same idempotency key without starting another transaction', async () => {
    const loadedTask = task(
      WorkflowNodeCode.PAINT_PROCUREMENT,
    );
    const input = {
      taskVersion: updatedAt.toISOString(),
      completionReason: '涂料已到货并完成验收',
      acknowledgedConsequences: true as const,
      idempotencyKey: 'r26-g3c1:complete:00000001',
    };
    const base = createService({ loadedTask });
    const hash = (
      base.service as unknown as {
        hashRequest(value: unknown): string;
      }
    ).hashRequest({
      action: 'R26_ORDINARY_TASK_COMPLETED',
      taskId: loadedTask.id,
      actorUserId: owner.id,
      input,
    });
    base.prisma.r26CommandRequest.findUnique.mockResolvedValue({
      projectId: loadedTask.projectId,
      actorUserId: owner.id,
      action: 'R26_ORDINARY_TASK_COMPLETED',
      requestHash: hash,
      result: {
        action: 'R26_ORDINARY_TASK_COMPLETED',
        createdTasks: [{ taskId: 'task-10' }],
      },
    });

    await expect(
      base.service.completeTask(
        loadedTask.id,
        input,
        owner,
        'request-replay',
      ),
    ).resolves.toMatchObject({
      action: 'R26_ORDINARY_TASK_COMPLETED',
      idempotentReplay: true,
    });
    expect(base.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps a serializable concurrent completion to explicit 409', async () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'write conflict',
      {
        code: 'P2034',
        clientVersion: '6.19.3',
      },
    );
    const { service } = createService({
      transactionError: error,
    });

    await expect(
      service.completeTask(
        'task-step-6',
        {
          taskVersion: updatedAt.toISOString(),
          completionReason: '并发测试',
          acknowledgedConsequences: true,
          idempotencyKey: 'r26-g3c1:concurrent:00000001',
        },
        owner,
        'request-concurrent',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'CONCURRENT_TASK_COMPLETION',
      },
    });
  });

  it('requires explicit consequence acknowledgement', async () => {
    const { service } = createService();

    await expect(
      service.completeTask(
        'task-step-6',
        {
          taskVersion: updatedAt.toISOString(),
          completionReason: '不应推进',
          acknowledgedConsequences: false,
          idempotencyKey: 'r26-g3c1:ack:00000001',
        },
        owner,
        'request-ack',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
