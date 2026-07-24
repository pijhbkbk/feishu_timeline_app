import {
  ProjectAssignmentSource,
  ProjectMemberType,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { R26ReadModelService } from './r26-read-model.service';

type AssignmentInput = Parameters<AssignmentBuilder['buildAssignmentPreview']>[0];
type AssignmentBuilder = {
  buildAssignmentPreview(input: {
    nodeCode: WorkflowNodeCode;
    task: {
      id: string;
      nodeName: string;
      status: WorkflowTaskStatus;
      isActive: boolean;
      assigneeUserId: string | null;
      assigneeDepartmentId: string | null;
      assigneeUser: {
        id: string;
        name: string;
        departmentId: string | null;
        department: { name: string } | null;
      } | null;
    } | null;
    project: {
      members: Array<{
        id: string;
        userId: string;
        name: string;
        departmentName: string | null;
        memberType: ProjectMemberType;
        title: string | null;
        isPrimary: boolean;
      }>;
    };
    departments: Array<{
      id: string;
      code: string;
      name: string;
      path: string | null;
    }>;
    users: Array<{
      id: string;
      name: string;
      departmentId: string | null;
      departmentName: string | null;
    }>;
  }): {
    assignmentStatus: string;
    assignmentSource: string;
    suggestedOwner: { id: string; name: string } | null;
    unassignedReason: string | null;
    primaryDepartment: {
      id: string | null;
      code: string;
      name: string;
      isDirectoryMatched: boolean;
    };
  };
};

function createBuilder() {
  return new R26ReadModelService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as AssignmentBuilder;
}

const actor: AuthenticatedUser = {
  id: 'actor-1',
  username: 'actor',
  name: '李晓晨',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: true,
  authSource: 'feishu',
  roleCodes: ['admin'],
  permissionCodes: [],
};

function baseInput(nodeCode: WorkflowNodeCode): AssignmentInput {
  return {
    nodeCode,
    task: null,
    project: { members: [] },
    departments: [],
    users: [],
  };
}

describe('R26ReadModelService assignment preview', () => {
  it('keeps missing business departments and owners explicitly unassigned', () => {
    const result = createBuilder().buildAssignmentPreview(
      baseInput(WorkflowNodeCode.MASS_PRODUCTION_PLAN),
    );

    expect(result.primaryDepartment).toMatchObject({
      id: null,
      code: 'PRODUCTION',
      name: '生产部',
      isDirectoryMatched: false,
    });
    expect(result.assignmentStatus).toBe('UNASSIGNED');
    expect(result.assignmentSource).toBe('UNASSIGNED');
    expect(result.suggestedOwner).toBeNull();
    expect(result.unassignedReason).toBe('公司目录中尚未配置“生产部”，负责人待分配。');
  });

  it('does not assign a company directory user who is not a project member', () => {
    const input = baseInput(WorkflowNodeCode.PAINT_PROCUREMENT);
    input.departments = [
      { id: 'dept-purchasing', code: 'PURCHASING', name: '采购部', path: null },
    ];
    input.users = [
      {
        id: 'external-user',
        name: '公司采购人员',
        departmentId: 'dept-purchasing',
        departmentName: '采购部',
      },
    ];

    const result = createBuilder().buildAssignmentPreview(input);

    expect(result.assignmentStatus).toBe('UNASSIGNED');
    expect(result.suggestedOwner).toBeNull();
    expect(result.unassignedReason).toBe('当前项目没有采购部有效成员。');
  });

  it('uses the project default executor for a matching department', () => {
    const input = baseInput(WorkflowNodeCode.PAINT_PROCUREMENT);
    input.departments = [
      { id: 'dept-purchasing', code: 'PURCHASING', name: '采购部', path: null },
    ];
    input.users = [
      {
        id: 'project-user',
        name: '张七巧',
        departmentId: 'dept-purchasing',
        departmentName: '采购部',
      },
    ];
    input.project.members = [
      {
        id: 'member-1',
        userId: 'project-user',
        name: '张七巧',
        departmentName: '采购部',
        memberType: ProjectMemberType.MEMBER,
        title: '采购负责人',
        isPrimary: true,
      },
    ];

    const result = createBuilder().buildAssignmentPreview(input);

    expect(result.assignmentStatus).toBe('SUGGESTED');
    expect(result.assignmentSource).toBe('PROJECT_DEFAULT_ASSIGNEE');
    expect(result.suggestedOwner).toMatchObject({ id: 'project-user', name: '张七巧' });
  });

  it('preserves the real task owner as the highest-priority assignment', () => {
    const input = baseInput(WorkflowNodeCode.CAB_REVIEW);
    input.task = {
      id: 'task-12',
      nodeName: '样车驾驶室评审',
      status: WorkflowTaskStatus.READY,
      isActive: true,
      assigneeUserId: 'current-owner',
      assigneeDepartmentId: 'dept-pmo',
      assigneeUser: {
        id: 'current-owner',
        name: '李晓晨',
        departmentId: null,
        department: null,
      },
    };

    const result = createBuilder().buildAssignmentPreview(input);

    expect(result.assignmentStatus).toBe('ASSIGNED');
    expect(result.assignmentSource).toBe('TASK_OVERRIDE');
    expect(result.suggestedOwner).toMatchObject({ id: 'current-owner', name: '李晓晨' });
  });

  it('uses a project node override before department defaults', () => {
    const input = baseInput(WorkflowNodeCode.PAINT_PROCUREMENT) as AssignmentInput & {
      nodeAssignment: {
        nodeCode: WorkflowNodeCode;
        primaryDepartmentId: string;
        ownerUserId: string;
        collaboratorUserIds: string[];
        reviewerUserIds: string[];
        assignmentSource: ProjectAssignmentSource;
      };
    };
    input.departments = [
      { id: 'dept-purchasing', code: 'PURCHASING', name: '采购部', path: null },
    ];
    input.users = [
      {
        id: 'node-owner',
        name: '节点专属负责人',
        departmentId: 'dept-purchasing',
        departmentName: '采购部',
      },
      {
        id: 'default-owner',
        name: '部门默认负责人',
        departmentId: 'dept-purchasing',
        departmentName: '采购部',
      },
    ];
    input.project.members = [
      {
        id: 'member-node',
        userId: 'node-owner',
        name: '节点专属负责人',
        departmentName: '采购部',
        memberType: ProjectMemberType.MEMBER,
        title: '采购执行',
        isPrimary: false,
      },
      {
        id: 'member-default',
        userId: 'default-owner',
        name: '部门默认负责人',
        departmentName: '采购部',
        memberType: ProjectMemberType.MEMBER,
        title: '采购负责人',
        isPrimary: true,
      },
    ];
    input.nodeAssignment = {
      nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
      primaryDepartmentId: 'dept-purchasing',
      ownerUserId: 'node-owner',
      collaboratorUserIds: [],
      reviewerUserIds: [],
      assignmentSource: ProjectAssignmentSource.PROJECT_NODE_OVERRIDE,
    };

    const result = createBuilder().buildAssignmentPreview(input);

    expect(result.assignmentSource).toBe('PROJECT_NODE_OVERRIDE');
    expect(result.suggestedOwner).toMatchObject({
      id: 'node-owner',
      name: '节点专属负责人',
    });
  });

  it('keeps multiple eligible department members unassigned without an explicit default', () => {
    const input = baseInput(WorkflowNodeCode.PAINT_PROCUREMENT);
    input.departments = [
      { id: 'dept-purchasing', code: 'PURCHASING', name: '采购部', path: null },
    ];
    input.users = [
      {
        id: 'buyer-1',
        name: '采购甲',
        departmentId: 'dept-purchasing',
        departmentName: '采购部',
      },
      {
        id: 'buyer-2',
        name: '采购乙',
        departmentId: 'dept-purchasing',
        departmentName: '采购部',
      },
    ];
    input.project.members = input.users.map((user, index) => ({
      id: `member-${index}`,
      userId: user.id,
      name: user.name,
      departmentName: user.departmentName,
      memberType: ProjectMemberType.MEMBER,
      title: '采购执行',
      isPrimary: false,
    }));

    const result = createBuilder().buildAssignmentPreview(input);

    expect(result.assignmentStatus).toBe('UNASSIGNED');
    expect(result.suggestedOwner).toBeNull();
  });
});

describe('R26ReadModelService real-data responsibility', () => {
  it('uses the business primary department when the real task has no explicit department', async () => {
    const service = new R26ReadModelService(
      {
        workflowTask: {
          findUnique: vi.fn().mockResolvedValue({
            nodeCode: WorkflowNodeCode.CAB_REVIEW,
            assigneeDepartment: null,
            assigneeUser: { department: null },
          }),
        },
      } as never,
      {} as never,
      {} as never,
      {
        getTaskInteractionDetail: vi.fn().mockResolvedValue({
          department: { id: 'dept-pmo', name: '项目管理部' },
        }),
      } as never,
    );

    const response = await service.getTask('task-12', actor);

    expect(response.task.department).toEqual({
      id: null,
      name: '质量管理部',
    });
  });

  it('preserves an explicitly assigned real task department', async () => {
    const service = new R26ReadModelService(
      {
        workflowTask: {
          findUnique: vi.fn().mockResolvedValue({
            nodeCode: WorkflowNodeCode.CAB_REVIEW,
            assigneeDepartment: {
              id: 'dept-review',
              name: '专项评审组',
            },
            assigneeUser: { department: null },
          }),
        },
      } as never,
      {} as never,
      {} as never,
      {
        getTaskInteractionDetail: vi.fn().mockResolvedValue({
          department: { id: 'dept-pmo', name: '项目管理部' },
        }),
      } as never,
    );

    const response = await service.getTask('task-12', actor);

    expect(response.task.department).toEqual({
      id: 'dept-review',
      name: '专项评审组',
    });
  });
});
