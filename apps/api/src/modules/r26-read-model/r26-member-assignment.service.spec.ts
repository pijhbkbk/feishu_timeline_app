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
