import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ProjectStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { AdminControlCenterService } from './admin-control-center.service';

const serviceSource = readFileSync(
  join(__dirname, 'admin-control-center.service.ts'),
  'utf8',
);

describe('AdminControlCenterService concurrent security writes', () => {
  const version = new Date('2026-08-11T01:00:00.000Z');
  const nextVersion = new Date('2026-08-11T01:01:00.000Z');
  const actor = {
    id: 'system-admin',
    username: 'system-admin',
    name: 'System Admin',
    email: null,
    departmentId: null,
    departmentName: null,
    isSystemAdmin: true,
    authSource: 'mock',
    roleCodes: ['admin'],
    permissionCodes: ['system.manage'],
  } satisfies AuthenticatedUser;

  it('rejects a stale role-permission claim before replacing mappings or auditing', async () => {
    const activityLogsService = {
      createWithExecutor: vi.fn(async () => ({ id: 'audit-role' })),
    };
    const tx = baseTransaction();
    Object.assign(tx, {
      role: {
        findUnique: vi.fn(async () => ({
          id: 'role-admin',
          code: 'admin',
          name: '管理员',
          updatedAt: version,
          rolePermissions: [{ permissionCode: 'project.read' }],
        })),
        findFirst: vi.fn(async () => null),
        update: vi.fn(async () => ({
          id: 'role-admin',
          code: 'admin',
          name: '管理员新名称',
          updatedAt: nextVersion,
        })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      rolePermission: {
        deleteMany: vi.fn(async () => ({ count: 1 })),
        createMany: vi.fn(async () => ({ count: 1 })),
      },
    });
    const service = serviceWith(tx, activityLogsService);

    await expect(
      service.changeRolePermissions(
        'role-admin',
        {
          expectedVersion: version.toISOString(),
          name: '管理员新名称',
          permissionCodes: ['project.read', 'system.manage'],
          acknowledgedConsequences: true,
          idempotencyKey: 'role-change-command',
          reason: '并发权限矩阵测试',
        },
        actor,
        'request-role-change',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ROLE_PERMISSION_STATE_CHANGED' }),
    });

    expect(tx.rolePermission.deleteMany).not.toHaveBeenCalled();
    expect(tx.rolePermission.createMany).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('rejects a schedule write that loses its task state claim before audit', async () => {
    const activityLogsService = {
      createWithExecutor: vi.fn(async () => ({ id: 'audit-task' })),
    };
    const task = mutableTask();
    const tx = baseTransaction();
    Object.assign(tx, {
      workflowTask: {
        findUnique: vi.fn(async () => task),
        findMany: vi.fn(async () => []),
        update: vi.fn(async () => ({
          ...task,
          manualDueAt: new Date('2026-08-20T00:00:00.000Z'),
          effectiveDueAt: new Date('2026-08-20T00:00:00.000Z'),
          updatedAt: nextVersion,
        })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      workflowNodeDefinition: {
        findUnique: vi.fn(async () => ({ sequence: 10 })),
        findMany: vi.fn(async () => []),
      },
      project: {
        update: vi.fn(async () => task.project),
      },
    });
    const service = serviceWith(tx, activityLogsService);

    await expect(
      service.changeSchedule(
        task.id,
        {
          taskVersion: version.toISOString(),
          plannedDueAt: '2026-08-20T00:00:00.000Z',
          scope: 'CURRENT_TASK_ONLY',
          reason: '调整排期',
          idempotencyKey: 'schedule-command',
          acknowledgedConsequences: true,
        },
        actor,
        'request-schedule',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ADMIN_TASK_STATE_CHANGED' }),
    });

    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('uses task state claims for every single-task administrator mutation', () => {
    for (const [method, nextMethod] of [
      ['changeSchedule', 'previewAssignmentChange'],
      ['changeAssignment', 'previewBatchTaskChanges'],
    ] as const) {
      const source = methodBody(method, nextMethod);
      expect(source).toContain('claimAdminWorkflowTaskMutation');
    }
  });

  it('claims batch and imported tasks in stable task-id order', () => {
    for (const [method, nextMethod] of [
      ['applyBatchTaskChanges', 'getTaskScheduleImportTemplate'],
      ['applyTaskScheduleImport', 'updateProjectBasicInfo'],
    ] as const) {
      const source = methodBody(method, nextMethod);
      expect(source).toContain('claimAdminWorkflowTaskMutation');
      expect(source).toContain('.sort((left, right) =>');
      expect(source).toContain(
        'left.row.taskId.localeCompare(right.row.taskId)',
      );
    }
  });

  it('uses a task state CAS before applying a node assignment to a live task', () => {
    const source = methodBody('changeNodeAssignment', 'getPermissions');
    expect(source).toContain('claimAdminWorkflowTaskMutation');
    expect(source.indexOf('lockAdminNodeAssignmentTask')).toBeLessThan(
      source.indexOf('project.updateMany'),
    );
  });

  it('locks the exact mutable node task before the project assignment version', () => {
    const source = methodBody(
      'lockAdminNodeAssignmentTask',
      'claimAdminWorkflowTaskMutation',
    );
    expect(source).toContain('FROM "workflow_tasks"');
    expect(source).toContain('"isActive" = TRUE');
    expect(source).toContain("'PENDING'::\"WorkflowTaskStatus\"");
    expect(source).toContain('ORDER BY "taskRound" DESC');
    expect(source).toContain('FOR UPDATE');
  });

  it('claims the exact task status, active flag, and version before mutation', () => {
    const source = methodBody(
      'claimAdminWorkflowTaskMutation',
      'executeAdminCommand',
    );
    expect(source).toContain('workflowTask.updateMany');
    expect(source).toContain("code: 'ADMIN_TASK_STATE_CHANGED'");
    expect(source).toContain('updatedAt: task.updatedAt');
    expect(source).toContain('isActive: task.isActive');
    expect(source).toContain('status: task.status');
  });

  it('treats inactive tasks as immutable in both administrator previews', () => {
    const schedulePreview = methodBody(
      'buildSchedulePreview',
      'buildNodeAssignmentPreview',
    );
    const assignmentPreview = methodBody(
      'buildAssignmentPreview',
      'executeAdminCommand',
    );
    expect(schedulePreview).toContain('if (!task.isActive)');
    expect(assignmentPreview).toContain('if (!task.isActive)');
  });

  function baseTransaction() {
    return {
      $queryRaw: vi.fn(async () => [{ locked: true }]),
      $executeRaw: vi.fn().mockResolvedValue(0),
      adminCommandRequest: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'command' })),
      },
    } as Record<string, any>;
  }

  function serviceWith(
    tx: Record<string, any>,
    activityLogsService: { createWithExecutor: ReturnType<typeof vi.fn> },
  ) {
    const prisma = {
      adminCommandRequest: {
        findUnique: vi.fn(async () => null),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    return new AdminControlCenterService(
      prisma as never,
      activityLogsService as never,
      { getOverdueDays: vi.fn(() => 0) } as never,
    );
  }

  function mutableTask() {
    return {
      id: 'task-1',
      projectId: 'project-1',
      workflowInstanceId: 'workflow-1',
      nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
      nodeName: '项目立项',
      status: WorkflowTaskStatus.IN_PROGRESS,
      isActive: true,
      updatedAt: version,
      dueAt: new Date('2026-08-15T00:00:00.000Z'),
      effectiveDueAt: new Date('2026-08-15T00:00:00.000Z'),
      manualDueAt: null,
      overdueDays: 0,
      payload: {},
      assigneeUserId: 'user-1',
      assigneeDepartmentId: 'department-1',
      assigneeUser: { id: 'user-1', name: '负责人' },
      project: {
        id: 'project-1',
        name: '测试项目',
        status: ProjectStatus.IN_PROGRESS,
        plannedEndDate: new Date('2026-08-31T00:00:00.000Z'),
      },
    };
  }

  function methodBody(method: string, nextMethod: string) {
    const start = serviceSource.indexOf(`  async ${method}(`) >= 0
      ? serviceSource.indexOf(`  async ${method}(`)
      : serviceSource.indexOf(`  private async ${method}(`);
    const asyncNext = serviceSource.indexOf(`  async ${nextMethod}(`, start + 1);
    const privateNext = serviceSource.indexOf(
      `  private async ${nextMethod}(`,
      start + 1,
    );
    const candidates = [asyncNext, privateNext].filter((index) => index > start);
    const end = candidates.length > 0 ? Math.min(...candidates) : serviceSource.length;
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return serviceSource.slice(start, end);
  }
});
