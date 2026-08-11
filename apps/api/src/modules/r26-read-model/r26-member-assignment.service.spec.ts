import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProjectAssignmentSource,
  ProjectMemberType,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { R26MemberAssignmentService } from './r26-member-assignment.service';

const admin: AuthenticatedUser = {
  id: 'admin-1',
  username: 'admin',
  name: '系统管理员',
  email: null,
  departmentId: 'dept-pmo',
  departmentName: '项目管理部',
  isSystemAdmin: true,
  authSource: 'feishu',
  roleCodes: ['admin'],
  permissionCodes: ['project.read', 'project.write'],
};

const member: AuthenticatedUser = {
  ...admin,
  id: 'member-1',
  username: 'member',
  name: '普通成员',
  isSystemAdmin: false,
  roleCodes: ['viewer'],
  permissionCodes: ['project.read'],
};

const ordinaryAdminReadOnly: AuthenticatedUser = {
  ...admin,
  id: 'ordinary-admin-read-only',
  username: 'ordinary-admin-read-only',
  name: '仅有项目读取权限的普通管理员',
  isSystemAdmin: false,
  roleCodes: ['admin'],
  permissionCodes: ['project.read'],
};

const ordinaryAdminWriter: AuthenticatedUser = {
  ...ordinaryAdminReadOnly,
  id: 'ordinary-admin-writer',
  username: 'ordinary-admin-writer',
  name: '具有项目写权限的普通管理员',
  permissionCodes: ['project.read', 'project.write'],
};

const permissionlessSystemAdmin: AuthenticatedUser = {
  ...admin,
  id: 'system-admin-without-permissions',
  username: 'system-admin-without-permissions',
  name: '无权限码系统管理员',
  roleCodes: [],
  permissionCodes: [],
};

const baseCommand = {
  expectedVersion: 1,
  idempotencyKey: 'r26-g3a:test:00000001',
  userId: 'user-2',
  memberTypes: [ProjectMemberType.MEMBER],
  responsibility: '采购执行',
  isDepartmentLead: false,
  isDefaultExecutor: true,
  defaultNodeCodes: [WorkflowNodeCode.PAINT_PROCUREMENT],
  reason: 'Gate 3A UAT',
};

function project(version = 1) {
  return {
    id: 'project-1',
    name: 'R26-G3A-UAT-成员分工',
    ownerUserId: 'owner-1',
    owningDepartmentId: 'dept-pmo',
    currentNodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
    memberAssignmentVersion: version,
  };
}

describe('R26MemberAssignmentService security and command gates', () => {
  it('keeps ordinary project members read-only', async () => {
    const prisma = {
      project: {
        findUnique: vi.fn().mockResolvedValue(project()),
      },
    };
    const service = new R26MemberAssignmentService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.previewAssignments(
        'project-1',
        { scope: 'FUTURE_ONLY' },
        member,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects all five member and assignment mutations for an ordinary admin with project.read only before any write or audit', async () => {
    const tx = {
      project: {
        findUnique: vi.fn().mockResolvedValue(project()),
        updateMany: vi.fn(),
      },
      r26CommandRequest: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      projectMember: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        updateMany: vi.fn(),
        upsert: vi.fn(),
      },
      projectNodeAssignment: {
        deleteMany: vi.fn(),
        upsert: vi.fn(),
      },
      workflowTask: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findFirst: vi.fn(),
      },
    };
    const prisma = {
      r26CommandRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const activityLogs = {
      createWithExecutor: vi.fn(),
    };
    const service = new R26MemberAssignmentService(
      prisma as never,
      activityLogs as never,
    );

    const attempts = [
      () =>
        service.addMember(
          'project-1',
          { ...baseCommand, idempotencyKey: 'r26-permission:add' },
          ordinaryAdminReadOnly,
          'request-add',
        ),
      () =>
        service.updateMember(
          'project-1',
          baseCommand.userId,
          { ...baseCommand, idempotencyKey: 'r26-permission:update' },
          ordinaryAdminReadOnly,
          'request-update',
        ),
      () =>
        service.removeMember(
          'project-1',
          baseCommand.userId,
          {
            expectedVersion: 1,
            idempotencyKey: 'r26-permission:remove',
            reason: '权限负向测试',
          },
          ordinaryAdminReadOnly,
          'request-remove',
        ),
      () =>
        service.applyAssignments(
          'project-1',
          {
            expectedVersion: 1,
            idempotencyKey: 'r26-permission:apply',
            scope: 'FUTURE_ONLY',
          },
          ordinaryAdminReadOnly,
          'request-apply',
        ),
      () =>
        service.transferTask(
          'project-1',
          'task-1',
          {
            expectedVersion: 1,
            idempotencyKey: 'r26-permission:transfer',
            newOwnerUserId: 'user-3',
          },
          ordinaryAdminReadOnly,
          'request-transfer',
        ),
    ];

    for (const attempt of attempts) {
      await expect(attempt()).rejects.toBeInstanceOf(ForbiddenException);
    }

    expect(tx.project.updateMany).not.toHaveBeenCalled();
    expect(tx.r26CommandRequest.create).not.toHaveBeenCalled();
    expect(tx.projectMember.deleteMany).not.toHaveBeenCalled();
    expect(tx.projectMember.updateMany).not.toHaveBeenCalled();
    expect(tx.projectMember.upsert).not.toHaveBeenCalled();
    expect(tx.projectNodeAssignment.deleteMany).not.toHaveBeenCalled();
    expect(tx.projectNodeAssignment.upsert).not.toHaveBeenCalled();
    expect(tx.workflowTask.update).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('allows an ordinary admin with project.write to manage any project', async () => {
    const prisma = {
      project: {
        findUnique: vi.fn().mockResolvedValue(project()),
      },
    };
    const service = new R26MemberAssignmentService(
      prisma as never,
      {} as never,
    );

    await expect(
      (
        service as unknown as {
          assertCanManage(
            db: typeof prisma,
            projectId: string,
            actor: AuthenticatedUser,
          ): Promise<unknown>;
        }
      ).assertCanManage(prisma, 'project-1', ordinaryAdminWriter),
    ).resolves.toMatchObject({ id: 'project-1' });
  });

  it('keeps the system-administrator bypass independent from permission codes', async () => {
    const prisma = {
      project: {
        findUnique: vi.fn().mockResolvedValue(project()),
      },
    };
    const service = new R26MemberAssignmentService(
      prisma as never,
      {} as never,
    );

    await expect(
      (
        service as unknown as {
          assertCanManage(
            db: typeof prisma,
            projectId: string,
            actor: AuthenticatedUser,
          ): Promise<unknown>;
        }
      ).assertCanManage(prisma, 'project-1', permissionlessSystemAdmin),
    ).resolves.toMatchObject({ id: 'project-1' });
  });

  it('requires both the project-manager role and project.write for a project owner', async () => {
    const prisma = {
      project: {
        findUnique: vi.fn().mockResolvedValue({
          ...project(),
          ownerUserId: 'owner-1',
        }),
      },
    };
    const service = new R26MemberAssignmentService(
      prisma as never,
      {} as never,
    );
    const ownerWithoutWrite: AuthenticatedUser = {
      ...member,
      id: 'owner-1',
      roleCodes: ['project_manager'],
      permissionCodes: ['project.read'],
    };
    const ownerWithWrite: AuthenticatedUser = {
      ...ownerWithoutWrite,
      permissionCodes: ['project.read', 'project.write'],
    };
    const assertCanManage = (
      service as unknown as {
        assertCanManage(
          db: typeof prisma,
          projectId: string,
          actor: AuthenticatedUser,
        ): Promise<unknown>;
      }
    ).assertCanManage.bind(service);

    await expect(
      assertCanManage(prisma, 'project-1', ownerWithoutWrite),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      assertCanManage(prisma, 'project-1', ownerWithWrite),
    ).resolves.toMatchObject({ id: 'project-1' });
  });

  it('returns a saved idempotent result without executing a second transaction', async () => {
    const prisma = {
      r26CommandRequest: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    };
    const service = new R26MemberAssignmentService(
      prisma as never,
      {} as never,
    );
    const requestHash = (
      service as unknown as {
        hashRequest(value: unknown): string;
      }
    ).hashRequest({
      projectId: 'project-1',
      action: 'R26_PROJECT_MEMBER_ADDED',
      actorUserId: admin.id,
      body: baseCommand,
    });
    prisma.r26CommandRequest.findUnique.mockResolvedValue({
      projectId: 'project-1',
      actorUserId: admin.id,
      action: 'R26_PROJECT_MEMBER_ADDED',
      requestHash,
      result: {
        action: 'R26_PROJECT_MEMBER_ADDED',
        memberAssignmentVersion: 2,
        auditLogIds: ['audit-1'],
        affectedTaskIds: [],
      },
    });

    const result = await service.addMember(
      'project-1',
      baseCommand,
      admin,
      'request-1',
    );

    expect(result).toMatchObject({
      action: 'R26_PROJECT_MEMBER_ADDED',
      memberAssignmentVersion: 2,
      idempotentReplay: true,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key reused with a different request', async () => {
    const prisma = {
      r26CommandRequest: {
        findUnique: vi.fn().mockResolvedValue({
          projectId: 'project-1',
          actorUserId: admin.id,
          action: 'R26_PROJECT_MEMBER_ADDED',
          requestHash: 'different',
          result: {},
        }),
      },
    };
    const service = new R26MemberAssignmentService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.addMember('project-1', baseCommand, admin, 'request-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 409 semantics for a stale member-assignment version', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      project: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(project(2))
          .mockResolvedValueOnce({ memberAssignmentVersion: 2 }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      r26CommandRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      r26CommandRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new R26MemberAssignmentService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.addMember('project-1', baseCommand, admin, 'request-1'),
    ).rejects.toMatchObject({
      response: {
        code: 'STALE_MEMBER_ASSIGNMENT_VERSION',
        currentVersion: 2,
      },
    });
  });

  it('maps a serializable transaction write conflict to an explicit 409', async () => {
    const prisma = {
      r26CommandRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('write conflict', {
          code: 'P2034',
          clientVersion: '6.19.3',
        }),
      ),
    };
    const service = new R26MemberAssignmentService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.addMember('project-1', baseCommand, admin, 'request-concurrent'),
    ).rejects.toMatchObject({
      response: {
        code: 'CONCURRENT_MEMBER_ASSIGNMENT_UPDATE',
      },
    });
  });

  it('uses project-scoped task lookup to block cross-project assignment IDOR', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(project()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      r26CommandRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      workflowTask: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      r26CommandRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new R26MemberAssignmentService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.transferTask(
        'project-1',
        'task-from-another-project',
        {
          expectedVersion: 1,
          idempotencyKey: 'r26-g3a:idor:00000001',
          newOwnerUserId: 'user-2',
          reason: 'UAT',
        },
        admin,
        'request-idor',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.workflowTask.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'task-from-another-project',
        projectId: 'project-1',
        isActive: true,
      },
    });
  });

  it('never reassigns a completed task', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(project()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      r26CommandRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      workflowTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'task-complete',
          projectId: 'project-1',
          status: WorkflowTaskStatus.COMPLETED,
          isActive: true,
        }),
      },
    };
    const prisma = {
      r26CommandRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new R26MemberAssignmentService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.transferTask(
        'project-1',
        'task-complete',
        {
          expectedVersion: 1,
          idempotencyKey: 'r26-g3a:complete:00000001',
          newOwnerUserId: 'user-2',
          reason: '不应生效',
        },
        admin,
        'request-complete',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'COMPLETED_OR_HISTORICAL_TASK_IMMUTABLE',
      },
    });
  });

  it('requires explicit confirmation and a reason before reassigning an in-progress task', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(project()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      r26CommandRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      workflowTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'task-in-progress',
          projectId: 'project-1',
          status: WorkflowTaskStatus.IN_PROGRESS,
          isActive: true,
          assigneeUserId: 'owner-1',
        }),
        update: vi.fn(),
      },
    };
    const prisma = {
      r26CommandRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new R26MemberAssignmentService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.transferTask(
        'project-1',
        'task-in-progress',
        {
          expectedVersion: 1,
          idempotencyKey: 'r26-g3a:in-progress:00000001',
          newOwnerUserId: 'user-2',
          reason: '负责人调整',
          confirmInProgress: false,
        },
        admin,
        'request-in-progress',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'IN_PROGRESS_CONFIRMATION_REQUIRED',
        affectedTaskIds: ['task-in-progress'],
      },
    });
    expect(tx.workflowTask.update).not.toHaveBeenCalled();
  });

  it('requires active tasks to be transferred before removing a member', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      project: {
        findUnique: vi.fn().mockResolvedValue(project()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      r26CommandRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      projectMember: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'project-member-1',
            projectId: 'project-1',
            userId: 'user-2',
            memberType: ProjectMemberType.MEMBER,
            user: {
              id: 'user-2',
              name: '待移出成员',
              department: { name: '采购部' },
            },
          },
        ]),
      },
      workflowTask: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'task-active',
            nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
            nodeName: '涂料采购',
            status: WorkflowTaskStatus.READY,
            assigneeUserId: 'user-2',
            assigneeDepartmentId: 'dept-purchase',
            payload: null,
          },
        ]),
      },
    };
    const prisma = {
      r26CommandRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new R26MemberAssignmentService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.removeMember(
        'project-1',
        'user-2',
        {
          expectedVersion: 1,
          idempotencyKey: 'r26-g3a:remove-active:00000001',
          reason: '人员离开项目',
        },
        admin,
        'request-remove-active',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'ACTIVE_TASK_TRANSFER_REQUIRED',
        affectedTaskIds: ['task-active'],
      },
    });
  });

  it('uses the transfer target only for active tasks when previewing member removal', () => {
    const service = new R26MemberAssignmentService({} as never, {} as never);
    const removedUserId = 'process-user';
    const transferUserId = 'owner-1';
    const assignmentByNode = new Map([
      [
        WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
        {
          nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
          primaryDepartmentId: 'dept-process',
          ownerUserId: removedUserId,
          collaboratorUserIds: [removedUserId, 'quality-user'],
          reviewerUserIds: [removedUserId],
          assignmentSource:
            ProjectAssignmentSource.PROJECT_DEFAULT_ASSIGNEE,
        },
      ],
    ]);
    const state = {
      users: [
        {
          id: transferUserId,
          name: '项目负责人',
          departmentId: 'dept-pmo',
          departmentName: '项目管理部',
        },
      ],
      latestTaskByNode: new Map(),
      assignmentByNode,
    };

    const previewState = (
      service as unknown as {
        buildPreviewState(
          state: unknown,
          proposedMembers: Array<{ userId: string }>,
          input: {
            memberChange: {
              type: 'REMOVE';
              userId: string;
              transferToUserId: string;
            };
          },
        ): { assignmentByNode: typeof assignmentByNode };
      }
    ).buildPreviewState(
      state,
      [{ userId: transferUserId }],
      {
        memberChange: {
          type: 'REMOVE',
          userId: removedUserId,
          transferToUserId: transferUserId,
        },
      },
    );
    const previewAssignment = previewState.assignmentByNode.get(
      WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
    );

    expect(previewAssignment).toMatchObject({
      primaryDepartmentId: 'dept-process',
      ownerUserId: null,
      collaboratorUserIds: ['quality-user'],
      reviewerUserIds: [],
      assignmentSource: ProjectAssignmentSource.UNASSIGNED,
    });
  });
});
