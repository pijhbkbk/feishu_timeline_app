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

describe('AdminControlCenterService organization concurrency integrity', () => {
  const version = new Date('2026-08-11T01:00:00.000Z');
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

  it('rejects a stale project version claim before changing its color or auditing', async () => {
    const project = mutableProject();
    const tx = baseTransaction();
    Object.assign(tx, {
      project: {
        findUnique: vi.fn(async () => project),
        update: vi.fn(async () => ({ ...project, name: '并发覆盖' })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      color: {
        update: vi.fn(async () => ({ id: 'color-1', name: '新颜色' })),
      },
    });
    const activityLogsService = activityLogMock();
    const service = serviceWith(tx, activityLogsService);

    await expect(
      service.updateProjectBasicInfo(
        project.id,
        {
          expectedVersion: version.toISOString(),
          name: '并发覆盖',
          colorName: '新颜色',
          reason: '验证项目版本声明',
          idempotencyKey: 'project-basic-cas',
        },
        actor,
        'request-project-basic',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ADMIN_PROJECT_STATE_CHANGED' }),
    });

    expect(tx.color.update).not.toHaveBeenCalled();
    expect(tx.project.update).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('rejects a stale project end-date claim after claiming the task and before auditing', async () => {
    const task = mutableTask();
    const tx = baseTransaction();
    Object.assign(tx, {
      workflowTask: {
        findUnique: vi.fn(async () => task),
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      workflowNodeDefinition: {
        findUnique: vi.fn(async () => ({ sequence: 10 })),
        findMany: vi.fn(async () => []),
      },
      project: {
        findUnique: vi.fn(async () => task.project),
        update: vi.fn(async () => ({ ...task.project })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    });
    const activityLogsService = activityLogMock();
    const service = serviceWith(tx, activityLogsService);

    await expect(
      service.changeSchedule(
        task.id,
        {
          taskVersion: version.toISOString(),
          plannedDueAt: '2026-08-20T00:00:00.000Z',
          scope: 'CURRENT_PROJECT_FUTURE_TASKS',
          reason: '验证项目日期并发声明',
          idempotencyKey: 'schedule-project-cas',
          acknowledgedConsequences: true,
        },
        actor,
        'request-schedule-project',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ADMIN_PROJECT_STATE_CHANGED' }),
    });

    expect(tx.workflowTask.updateMany).toHaveBeenCalledTimes(1);
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('rejects a stale department version claim before descendant writes or auditing', async () => {
    const existing = mutableDepartment();
    const parent = businessDivision();
    const tx = baseTransaction();
    Object.assign(tx, {
      department: {
        findUnique: vi.fn(async (args: Record<string, any>) => {
          if (args.where?.id === parent.id) return parent;
          if (args.select?._count) {
            return {
              _count: {
                users: 0,
                children: 0,
                ownedProjects: 0,
                assignedWorkflowTasks: 0,
              },
            };
          }
          return existing;
        }),
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
        aggregate: vi.fn(async () => ({ _max: { sortOrder: 0 } })),
        update: vi.fn(async () => ({ ...existing, name: '新部门名称' })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      user: { findMany: vi.fn(async () => []) },
    });
    const activityLogsService = activityLogMock();
    const service = serviceWith(tx, activityLogsService);

    await expect(
      service.changeDepartmentConfiguration(
        existing.id,
        {
          expectedVersion: version.toISOString(),
          name: '新部门名称',
          parentId: parent.id,
          leadUserName: null,
          isActive: true,
          idempotencyKey: 'department-update-cas',
          acknowledgedConsequences: true,
        },
        actor,
        'request-department-update',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DEPARTMENT_STATE_CHANGED' }),
    });

    expect(tx.department.findMany).not.toHaveBeenCalled();
    expect(tx.department.update).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('fails closed on a recursive ancestor cycle before writing or auditing', async () => {
    const existing = mutableDepartment();
    const parent = businessDivision();
    const tx = baseTransaction();
    tx.$queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        { id: parent.id, parentId: existing.id, depth: 1, cycle: false },
        { id: existing.id, parentId: parent.id, depth: 2, cycle: false },
        { id: parent.id, parentId: existing.id, depth: 3, cycle: true },
      ]);
    Object.assign(tx, {
      department: {
        findUnique: vi.fn(async (args: Record<string, any>) => {
          if (args.where?.id === parent.id) return parent;
          if (args.select?._count) {
            return {
              _count: {
                users: 0,
                children: 0,
                ownedProjects: 0,
                assignedWorkflowTasks: 0,
              },
            };
          }
          return existing;
        }),
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
        aggregate: vi.fn(async () => ({ _max: { sortOrder: 0 } })),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      user: { findMany: vi.fn(async () => []) },
    });
    const activityLogsService = activityLogMock();
    const service = serviceWith(tx, activityLogsService);

    await expect(
      service.changeDepartmentConfiguration(
        existing.id,
        {
          expectedVersion: version.toISOString(),
          name: existing.name,
          parentId: parent.id,
          isActive: true,
          idempotencyKey: 'department-cycle',
          acknowledgedConsequences: true,
        },
        actor,
        'request-department-cycle',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DEPARTMENT_HIERARCHY_INVALID',
      }),
    });

    expect(tx.department.updateMany).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('fails a batch delete when any stable versioned delete claim is lost', async () => {
    const first = mutableDepartment({ id: 'department-a', code: 'CUSTOM_A' });
    const second = mutableDepartment({ id: 'department-b', code: 'CUSTOM_B' });
    const tx = baseTransaction();
    Object.assign(tx, {
      department: {
        findMany: vi.fn(async () => [second, first]),
        deleteMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
    });
    const activityLogsService = activityLogMock();
    const service = serviceWith(tx, activityLogsService);

    await expect(
      service.deleteDepartments(
        {
          departments: [
            {
              departmentId: second.id,
              departmentVersion: version.toISOString(),
            },
            {
              departmentId: first.id,
              departmentVersion: version.toISOString(),
            },
          ],
          reason: '验证批量删除版本声明',
          idempotencyKey: 'department-delete-cas',
          acknowledgedConsequences: true,
        },
        actor,
        'request-department-delete',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DEPARTMENT_STATE_CHANGED' }),
    });

    expect(tx.department.deleteMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: first.id, updatedAt: version }),
      }),
    );
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('serializes all department hierarchy mutations before rereading state', () => {
    for (const [method, nextMethod] of [
      ['changeNodeAssignment', 'getPermissions'],
      ['changeDepartmentConfiguration', 'deleteDepartments'],
      ['deleteDepartments', 'exportTasksCsv'],
    ] as const) {
      const source = methodBody(method, nextMethod);
      expect(source).toContain('lockAdminDepartmentHierarchyMutation');
    }

    const nodeAssignment = methodBody(
      'changeNodeAssignment',
      'getPermissions',
    );
    expect(
      nodeAssignment.indexOf('lockAdminNodeAssignmentTask'),
    ).toBeLessThan(
      nodeAssignment.indexOf('lockAdminDepartmentHierarchyMutation'),
    );
    expect(
      nodeAssignment.indexOf('lockAdminDepartmentHierarchyMutation'),
    ).toBeLessThan(nodeAssignment.indexOf('buildNodeAssignmentPreview'));
    expect(
      nodeAssignment.indexOf('lockAdminDepartmentHierarchyMutation'),
    ).toBeLessThan(nodeAssignment.indexOf('tx.department.findFirst'));
  });

  it('uses a consistent task-to-project lock and CAS order for schedule writes', () => {
    const schedule = methodBody('changeSchedule', 'previewAssignmentChange');
    expect(schedule.indexOf('claimAdminWorkflowTaskMutation')).toBeLessThan(
      schedule.indexOf('lockAdminProjectMutation'),
    );
    expect(schedule.indexOf('lockAdminProjectMutation')).toBeLessThan(
      schedule.indexOf('claimAdminProjectMutation'),
    );

    const projectBasic = methodBody(
      'updateProjectBasicInfo',
      'changeUserStatus',
    );
    expect(projectBasic.indexOf('lockAdminProjectMutation')).toBeLessThan(
      projectBasic.indexOf('project.findUnique'),
    );
    expect(projectBasic).toContain('claimAdminProjectMutation');
  });

  it('uses a recursive ancestor walk and fails closed on cycles or excessive depth', () => {
    const source = methodBody(
      'inspectDepartmentAncestorChain',
      'lockDepartmentRowsForDeletion',
    );
    expect(source).toContain('WITH RECURSIVE');
    expect(source).toContain('cycle');
    expect(source).toContain('depth');
    expect(source).toContain('DEPARTMENT_HIERARCHY_INVALID');
  });

  it('allows a depth-99 parent but rejects a depth-100 parent before adding a child', async () => {
    const tx = baseTransaction();
    const service = serviceWith(tx, activityLogMock()) as unknown as {
      inspectDepartmentAncestorChain: (
        client: Record<string, any>,
        departmentId: string | null,
        parentId: string,
      ) => Promise<{ wouldCreateCycle: boolean }>;
    };
    const ancestors = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `ancestor-${index + 1}`,
        parentId: index + 1 === count ? null : `ancestor-${index + 2}`,
        depth: index + 1,
        cycle: false,
      }));

    tx.$queryRaw = vi.fn(async () => ancestors(99));
    await expect(
      service.inspectDepartmentAncestorChain(tx, null, 'ancestor-1'),
    ).resolves.toEqual({ wouldCreateCycle: false });

    tx.$queryRaw = vi.fn(async () => ancestors(100));
    await expect(
      service.inspectDepartmentAncestorChain(tx, null, 'ancestor-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DEPARTMENT_HIERARCHY_INVALID',
      }),
    });
  });

  it('bounds descendant traversal with visited-node and depth checks', () => {
    const source = methodBody(
      'refreshDepartmentDescendantPaths',
      'readPageSize',
    );
    expect(source).toContain('visited');
    expect(source).toContain('depth');
    expect(source).toContain('parentLevel >= MAX_DEPARTMENT_HIERARCHY_DEPTH');
    expect(source).toContain('DEPARTMENT_HIERARCHY_INVALID');
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

  function activityLogMock() {
    return {
      createWithExecutor: vi.fn(async () => ({ id: 'audit-log' })),
    };
  }

  function serviceWith(
    tx: Record<string, any>,
    activityLogsService: ReturnType<typeof activityLogMock>,
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

  function mutableProject() {
    return {
      id: 'project-1',
      code: 'PRJ-001',
      name: '测试项目',
      vehicleModel: '车型 A',
      description: null,
      status: ProjectStatus.IN_PROGRESS,
      currentNodeCode: WorkflowNodeCode.PROJECT_INITIATION,
      plannedStartDate: new Date('2026-08-01T00:00:00.000Z'),
      plannedEndDate: new Date('2026-08-31T00:00:00.000Z'),
      updatedAt: version,
      colors: [{ id: 'color-1', name: '旧颜色' }],
    };
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
        ...mutableProject(),
        colors: undefined,
      },
    };
  }

  function businessDivision() {
    return {
      id: 'division-technology',
      code: 'BU_TECHNOLOGY',
      name: '技术中心',
      parentId: null,
      path: '/BU_TECHNOLOGY',
      level: 1,
      sortOrder: 10,
      isActive: true,
      leadUserId: null,
      updatedAt: version,
    };
  }

  function mutableDepartment(
    override: Partial<ReturnType<typeof businessDivision>> = {},
  ) {
    return {
      id: 'department-1',
      code: 'CUSTOM_DEPARTMENT',
      name: '测试部门',
      parentId: 'division-technology',
      path: '/BU_TECHNOLOGY/CUSTOM_DEPARTMENT',
      level: 2,
      sortOrder: 20,
      isActive: true,
      leadUserId: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: version,
      _count: {
        users: 0,
        children: 0,
        ownedProjects: 0,
        assignedWorkflowTasks: 0,
        projectNodeAssignments: 0,
        boardDistributionUsers: 0,
      },
      ...override,
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
    const end = candidates.length > 0
      ? Math.min(...candidates)
      : serviceSource.length;
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return serviceSource.slice(start, end);
  }
});
