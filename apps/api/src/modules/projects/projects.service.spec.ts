import {
  ProjectPriority,
  ProjectStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectsService } from './projects.service';

const actor: AuthenticatedUser = {
  id: 'user-manager',
  username: 'mock_project_manager',
  name: '演示项目经理',
  email: 'pm@example.com',
  departmentId: 'dept-pmo',
  departmentName: '项目管理部',
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['project_manager'],
};

function createProjectRecord() {
  return {
    id: 'project-1',
    code: 'PRJ-001',
    name: '演示项目',
    description: 'demo',
    status: ProjectStatus.IN_PROGRESS,
    priority: ProjectPriority.HIGH,
    currentNodeCode: 'PROJECT_INITIATION',
    owningDepartmentId: 'dept-pmo',
    ownerUserId: 'owner-1',
    marketRegion: '华东',
    vehicleModel: '轻卡 X1',
    plannedStartDate: new Date('2026-03-01T00:00:00.000Z'),
    plannedEndDate: new Date('2026-04-01T00:00:00.000Z'),
    actualStartDate: null,
    actualEndDate: null,
    closedAt: null,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    ownerUser: {
      id: 'owner-1',
      name: '演示项目经理',
      department: {
        name: '项目管理部',
      },
    },
    owningDepartment: {
      id: 'dept-pmo',
      name: '项目管理部',
    },
    members: [
      {
        id: 'member-1',
        userId: 'owner-1',
        memberType: 'OWNER',
        title: '项目负责人',
        isPrimary: true,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        user: {
          id: 'owner-1',
          name: '演示项目经理',
          email: 'pm@example.com',
          department: {
            name: '项目管理部',
          },
          userRoles: [
            {
              role: {
                code: 'project_manager',
              },
            },
          ],
        },
      },
    ],
    workflowInstances: [
      {
        id: 'wf-1',
        instanceNo: 'WF-001',
        status: 'RUNNING',
        versionNo: 1,
        currentNodeCode: 'PROJECT_INITIATION',
        startedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ],
    _count: {
      members: 1,
    },
  };
}

function createService() {
  const tx = {
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    project: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    projectMember: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (executor: (client: typeof tx) => Promise<unknown>) => executor(tx)),
  };

  const workflowsService = {
    initializeProjectWorkflow: vi.fn(),
    getCurrentNodeName: vi.fn((nodeCode: string | null) => (nodeCode ? '项目立项' : null)),
  };

  const activityLogsService = {
    createWithExecutor: vi.fn().mockResolvedValue(undefined),
  };
  const projectAccessService = {
    assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined),
    assertProjectAccess: vi.fn().mockResolvedValue(undefined),
  };

  const service = new ProjectsService(
    prisma as never,
    workflowsService as never,
    activityLogsService as never,
    projectAccessService as never,
  );

  return {
    service,
    prisma,
    tx,
    workflowsService,
    activityLogsService,
    projectAccessService,
  };
}

describe('ProjectsService', () => {
  it('creates project and initializes workflow instance', async () => {
    const { service, tx, workflowsService, activityLogsService } = createService();
    const projectRecord = createProjectRecord();
    tx.user.findFirst.mockResolvedValue({
      id: 'owner-1',
      departmentId: 'dept-pmo',
      status: 'ACTIVE',
    });
    tx.user.findMany.mockResolvedValue([{ id: 'owner-1' }]);
    tx.project.create.mockResolvedValue(projectRecord);
    tx.project.findUnique.mockResolvedValue(projectRecord);
    tx.projectMember.deleteMany.mockResolvedValue({ count: 0 });
    tx.projectMember.createMany.mockResolvedValue({ count: 1 });
    tx.projectMember.findMany.mockResolvedValue([
      {
        id: 'member-1',
        userId: 'owner-1',
        memberType: 'OWNER',
        title: '项目负责人',
        isPrimary: true,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        user: {
          id: 'owner-1',
          name: '演示项目经理',
          email: 'pm@example.com',
        },
      },
    ]);
    workflowsService.initializeProjectWorkflow.mockResolvedValue({
      instance: {
        id: 'wf-1',
        currentNodeCode: 'PROJECT_INITIATION',
      },
      task: {
        id: 'task-1',
      },
    });

    const result = await service.createProject(
      {
        code: 'PRJ-001',
        name: '演示项目',
        priority: 'HIGH',
        ownerUserId: 'owner-1',
        members: [],
      },
      actor,
    );

    expect(workflowsService.initializeProjectWorkflow).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        projectId: 'project-1',
        ownerUserId: 'owner-1',
        initiatedById: actor.id,
      }),
    );
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledTimes(2);
    expect(result.code).toBe('PRJ-001');
    expect(result.currentWorkflowInstance?.id).toBe('wf-1');
  });
});
