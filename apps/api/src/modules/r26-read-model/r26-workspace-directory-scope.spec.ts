import { ForbiddenException } from '@nestjs/common';
import {
  ProjectAssignmentSource,
  ProjectMemberType,
  UserStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { R26ReadModelService } from './r26-read-model.service';

describe('R26 workspace directory scope', () => {
  it('limits an ordinary project reader to referenced people and departments with minimal fields', async () => {
    const harness = workspaceHarness();
    const response = await harness.service.getWorkspace(
      'project-1',
      actor({
        id: 'active-member',
        roleCodes: ['viewer'],
        permissionCodes: ['project.read'],
      }),
    );

    expect(response.capabilities.manageMembers).toBe(false);
    expect(response.organization.users.map((user) => user.id)).toEqual([
      'active-member',
      'assistance-user',
      'blocker-helper',
      'collaborator',
      'node-owner',
      'owner-1',
      'reviewer',
      'task-owner',
    ]);
    expect(response.organization.users).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'inactive-member' }),
        expect.objectContaining({ id: 'global-outsider' }),
      ]),
    );
    expect(response.organization.departments.map((department) => department.id)).toEqual([
      'department-assistance',
      'department-blocker',
      'department-collaborator',
      'department-member',
      'department-node',
      'department-owner',
      'department-project',
      'department-reviewer',
      'department-task',
    ]);
    expect(response.organization.departments).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'department-global' }),
      ]),
    );

    for (const user of response.organization.users) {
      expect(Object.keys(user).sort()).toEqual([
        'departmentId',
        'departmentName',
        'id',
        'isProjectMember',
        'name',
      ]);
    }
    for (const department of response.organization.departments) {
      expect(Object.keys(department).sort()).toEqual([
        'activeUserCount',
        'code',
        'id',
        'name',
      ]);
    }
    expect(response.project.members.map((member) => member.userId)).toEqual([
      'owner-1',
      'active-member',
    ]);
    for (const member of response.project.members) {
      expect(member).not.toHaveProperty('email');
      expect(member).not.toHaveProperty('roleCodes');
      expect(member).not.toHaveProperty('createdAt');
    }

    const userQuery = harness.prisma.user.findMany.mock.calls[0]?.[0];
    const departmentQuery = harness.prisma.department.findMany.mock.calls[0]?.[0];
    if (!userQuery || !departmentQuery) {
      throw new Error('workspace directory queries were not executed');
    }
    expect(userQuery.where).toHaveProperty('OR');
    expect(userQuery.where).not.toEqual({ status: UserStatus.ACTIVE });
    expect(userQuery.select).not.toHaveProperty('email');
    expect(userQuery.select).not.toHaveProperty('userRoles');
    expect(departmentQuery.where).toHaveProperty('id.in');
  });

  it('does not start project-scoped or company-directory queries when project access fails', async () => {
    const harness = workspaceHarness();
    harness.projectsService.getProjectDetail.mockRejectedValueOnce(
      new ForbiddenException('当前用户无权访问该项目。'),
    );

    await expect(
      harness.service.getWorkspace(
        'project-1',
        actor({ id: 'outsider', permissionCodes: ['project.read'] }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(harness.projectsService.getProjectFlowMap).not.toHaveBeenCalled();
    expect(harness.prisma.workflowTask.findMany).not.toHaveBeenCalled();
    expect(harness.prisma.projectNodeAssignment.findMany).not.toHaveBeenCalled();
    expect(harness.prisma.auditLog.findMany).not.toHaveBeenCalled();
    expect(harness.prisma.user.findMany).not.toHaveBeenCalled();
    expect(harness.prisma.department.findMany).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'permissionless system administrator',
      viewer: actor({
        id: 'system-admin',
        isSystemAdmin: true,
        roleCodes: ['admin'],
        permissionCodes: ['project.read'],
      }),
    },
    {
      name: 'administrator with explicit project.write',
      viewer: actor({
        id: 'admin-writer',
        roleCodes: ['admin'],
        permissionCodes: ['project.read', 'project.write'],
      }),
    },
    {
      name: 'project-manager owner with explicit project.write',
      viewer: actor({
        id: 'owner-1',
        roleCodes: ['project_manager'],
        permissionCodes: ['project.read', 'project.write'],
      }),
    },
  ])('allows the $name to receive the controlled active company directory', async ({ viewer }) => {
    const harness = workspaceHarness();
    const response = await harness.service.getWorkspace('project-1', viewer);

    expect(response.capabilities.manageMembers).toBe(true);
    expect(response.organization.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'global-outsider' }),
      ]),
    );
    expect(response.organization.departments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'department-global' }),
      ]),
    );
    expect(harness.prisma.user.findMany.mock.calls[0]?.[0]?.where).toEqual({
      status: UserStatus.ACTIVE,
    });
    expect(harness.prisma.department.findMany.mock.calls[0]?.[0]?.where).toEqual({
      isActive: true,
    });
    for (const member of response.project.members) {
      expect(member).not.toHaveProperty('email');
      expect(member).not.toHaveProperty('roleCodes');
    }
  });

  it.each([
    {
      name: 'read-only administrator',
      viewer: actor({
        id: 'admin-reader',
        roleCodes: ['admin'],
        permissionCodes: ['project.read'],
      }),
    },
    {
      name: 'owner without project.write',
      viewer: actor({
        id: 'owner-1',
        roleCodes: ['project_manager'],
        permissionCodes: ['project.read'],
      }),
    },
    {
      name: 'project writer without an authorized management role',
      viewer: actor({
        id: 'active-member',
        roleCodes: ['viewer'],
        permissionCodes: ['project.read', 'project.write'],
      }),
    },
  ])('keeps the $name on the scoped directory', async ({ viewer }) => {
    const harness = workspaceHarness();
    const response = await harness.service.getWorkspace('project-1', viewer);

    expect(response.capabilities.manageMembers).toBe(false);
    expect(response.organization.users).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'global-outsider' }),
      ]),
    );
    expect(harness.prisma.user.findMany.mock.calls[0]?.[0]?.where).toHaveProperty(
      'OR',
    );
  });

  function workspaceHarness() {
    const project = {
      id: 'project-1',
      code: 'PROJECT-1',
      name: '测试项目',
      ownerUserId: 'owner-1',
      owningDepartmentId: 'department-project',
      memberAssignmentVersion: 4,
      members: [
        projectMember('owner-1', ProjectMemberType.OWNER),
        projectMember('active-member', ProjectMemberType.MEMBER),
        projectMember('inactive-member', ProjectMemberType.OBSERVER),
      ],
    };
    const users = [
      directoryUser(
        'active-member',
        UserStatus.ACTIVE,
        department('department-member'),
      ),
      directoryUser(
        'assistance-user',
        UserStatus.ACTIVE,
        department('department-assistance'),
      ),
      directoryUser(
        'blocker-helper',
        UserStatus.ACTIVE,
        department('department-blocker'),
      ),
      directoryUser(
        'collaborator',
        UserStatus.ACTIVE,
        department('department-collaborator'),
      ),
      directoryUser(
        'global-outsider',
        UserStatus.ACTIVE,
        department('department-global'),
      ),
      directoryUser(
        'inactive-member',
        UserStatus.INACTIVE,
        department('department-inactive'),
      ),
      directoryUser(
        'node-owner',
        UserStatus.ACTIVE,
        department('department-node'),
      ),
      directoryUser(
        'owner-1',
        UserStatus.INACTIVE,
        department('department-owner'),
      ),
      directoryUser(
        'reviewer',
        UserStatus.ACTIVE,
        department('department-reviewer'),
      ),
      directoryUser(
        'task-owner',
        UserStatus.INACTIVE,
        department('department-task'),
      ),
    ];
    const departments = [
      department('department-global'),
      department('department-assistance'),
      department('department-blocker'),
      department('department-collaborator'),
      department('department-member'),
      department('department-node'),
      department('department-owner'),
      department('department-project'),
      department('department-reviewer'),
      department('department-task'),
      department('department-inactive'),
    ];
    const prisma = {
      user: {
        findMany: vi.fn(async (query: Record<string, any>) => {
          void query;
          return users;
        }),
      },
      department: {
        findMany: vi.fn(async (query: Record<string, any>) => {
          void query;
          return departments;
        }),
      },
      workflowTask: {
        findMany: vi.fn(async () => [
          {
            id: 'task-1',
            nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
            nodeName: '项目立项',
            taskRound: 1,
            status: WorkflowTaskStatus.READY,
            isActive: true,
            assigneeUserId: 'task-owner',
            assigneeDepartmentId: 'department-task',
            payload: {},
            assigneeUser: null,
            blockers: [
              {
                helperUser: { id: 'blocker-helper', name: '阻塞协助人' },
                assistanceUserIds: ['assistance-user'],
                assistanceDepartmentIds: ['department-assistance'],
              },
            ],
            createdAt: new Date('2026-08-11T01:00:00.000Z'),
          },
        ]),
      },
      projectNodeAssignment: {
        findMany: vi.fn(async () => [
          {
            nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
            primaryDepartmentId: 'department-node',
            ownerUserId: 'node-owner',
            collaboratorUserIds: ['collaborator'],
            reviewerUserIds: ['reviewer'],
            assignmentSource: ProjectAssignmentSource.PROJECT_NODE_OVERRIDE,
          },
        ]),
      },
      auditLog: { findMany: vi.fn(async () => []) },
    };
    const projectsService = {
      getProjectDetail: vi.fn(async () => project),
      getProjectFlowMap: vi.fn(async () => ({
        projectId: project.id,
        projectName: project.name,
        projectCode: project.code,
        currentStepCode: null,
        currentDepartment: null,
        nodes: [],
      })),
    };
    return {
      prisma,
      projectsService,
      service: new R26ReadModelService(
        prisma as never,
        {} as never,
        projectsService as never,
        {} as never,
      ),
    };
  }

  function projectMember(userId: string, memberType: ProjectMemberType) {
    return {
      id: `membership-${userId}`,
      userId,
      name: `成员-${userId}`,
      email: `${userId}@internal.example`,
      departmentName: null,
      memberType,
      title: null,
      isPrimary: memberType === ProjectMemberType.OWNER,
      roleCodes: ['internal-role'],
      createdAt: '2026-08-11T01:00:00.000Z',
    };
  }

  function directoryUser(
    id: string,
    status: UserStatus,
    userDepartment: ReturnType<typeof department>,
  ) {
    return {
      id,
      name: `用户-${id}`,
      status,
      departmentId: userDepartment.id,
      department: userDepartment,
      email: `${id}@internal.example`,
      userRoles: [{ role: { code: 'internal-role' } }],
    };
  }

  function department(id: string) {
    return {
      id,
      code: id.toUpperCase().replaceAll('-', '_'),
      name: `部门-${id}`,
      path: `/ROOT/${id}`,
      isActive: true,
    };
  }

  function actor(
    override: Partial<AuthenticatedUser> = {},
  ): AuthenticatedUser {
    return {
      id: 'active-member',
      username: 'viewer',
      name: '普通项目成员',
      email: null,
      departmentId: 'department-member',
      departmentName: '部门-member',
      isSystemAdmin: false,
      authSource: 'mock',
      roleCodes: ['viewer'],
      permissionCodes: ['project.read'],
      ...override,
    };
  }
});
