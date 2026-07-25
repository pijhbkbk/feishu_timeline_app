import {
  ProjectAssignmentSource,
  ProjectMemberType,
  WorkflowNodeCode,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { buildR26AssignmentPreview } from './r26-assignment.resolver';

describe('R26 assignment resolver project-node overrides', () => {
  it('uses the configured project department and owner ahead of the default department rule', () => {
    const preview = buildR26AssignmentPreview({
      nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
      task: null,
      nodeAssignment: {
        nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
        primaryDepartmentId: 'department-pmo',
        ownerUserId: 'user-owner',
        collaboratorUserIds: ['user-collaborator'],
        reviewerUserIds: [],
        assignmentSource: ProjectAssignmentSource.PROJECT_NODE_OVERRIDE,
      },
      projectMembers: [
        {
          id: 'member-owner',
          userId: 'user-owner',
          name: '项目负责人',
          departmentName: '项目管理部',
          memberType: ProjectMemberType.MANAGER,
          title: '项目经理',
          isPrimary: true,
        },
        {
          id: 'member-collaborator',
          userId: 'user-collaborator',
          name: '协同成员',
          departmentName: '工艺开发部',
          memberType: ProjectMemberType.MEMBER,
          title: '协同',
          isPrimary: false,
        },
      ],
      departments: [
        {
          id: 'department-marketing',
          code: 'MARKETING',
          name: '营销公司',
          path: null,
        },
        {
          id: 'department-pmo',
          code: 'PMO',
          name: '项目管理部',
          path: null,
        },
      ],
      users: [
        {
          id: 'user-owner',
          name: '项目负责人',
          departmentId: 'department-pmo',
          departmentName: '项目管理部',
        },
        {
          id: 'user-collaborator',
          name: '协同成员',
          departmentId: 'department-marketing',
          departmentName: '营销公司',
        },
      ],
    });

    expect(preview.primaryDepartment).toMatchObject({
      id: 'department-pmo',
      name: '项目管理部',
    });
    expect(preview.suggestedOwner).toMatchObject({
      id: 'user-owner',
      name: '项目负责人',
    });
    expect(preview.collaborators.map((person) => person.id)).toEqual([
      'user-collaborator',
    ]);
    expect(preview.assignmentSource).toBe(
      ProjectAssignmentSource.PROJECT_NODE_OVERRIDE,
    );
  });
});
