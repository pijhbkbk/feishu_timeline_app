import { Injectable } from '@nestjs/common';
import {
  ProjectMemberType,
  UserStatus,
  WorkflowAction,
  WorkflowNodeCode,
  type WorkflowTaskStatus,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DashboardService } from '../dashboard/dashboard.service';
import { ProjectsService } from '../projects/projects.service';
import { WorkflowsService } from '../workflows/workflows.service';
import {
  getAllowedWorkflowActions,
  isWorkflowActionCurrentlyAvailable,
  WORKFLOW_NODE_META_MAP,
} from '../workflows/workflow-node.constants';
import { R26_ASSIGNMENT_RULES } from './r26-assignment.rules';

type DirectoryDepartment = {
  id: string;
  code: string;
  name: string;
  path: string | null;
};

type DirectoryUser = {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
};

type ProjectDetail = Awaited<ReturnType<ProjectsService['getProjectDetail']>>;

const MEMBER_TYPE_LABELS: Record<ProjectMemberType, string> = {
  OWNER: '项目负责人',
  MANAGER: '部门项目负责人',
  MEMBER: '项目成员',
  REVIEWER: '评审人',
  OBSERVER: '观察人',
};

const ACTION_LABELS: Record<WorkflowAction, string> = {
  SUBMIT: '提交',
  ASSIGN: '分配',
  START: '开始',
  COMPLETE: '完成',
  APPROVE: '通过',
  REJECT: '驳回',
  RETURN: '退回',
  REOPEN: '重新打开',
  CANCEL: '取消',
  SYSTEM_SYNC: '系统同步',
};

@Injectable()
export class R26ReadModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardService: DashboardService,
    private readonly projectsService: ProjectsService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  async getDashboard(actor: AuthenticatedUser) {
    const dashboard = await this.dashboardService.getPersonalOverview(actor);

    return {
      ...this.readOnlyEnvelope(),
      viewer: this.serializeViewer(actor),
      dashboard,
    };
  }

  async getProjects(query: Record<string, unknown>, actor: AuthenticatedUser) {
    const projects = await this.projectsService.listProjects(query, actor);

    return {
      ...this.readOnlyEnvelope(),
      viewer: this.serializeViewer(actor),
      projects,
    };
  }

  async getWorkspace(projectId: string, actor: AuthenticatedUser) {
    const [project, flowMap, departments, users, tasks] = await Promise.all([
      this.projectsService.getProjectDetail(projectId, actor),
      this.projectsService.getProjectFlowMap(projectId, actor),
      this.prisma.department.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, path: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.user.findMany({
        where: { status: UserStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          departmentId: true,
          department: { select: { name: true } },
        },
        orderBy: [{ name: 'asc' }],
      }),
      this.prisma.workflowTask.findMany({
        where: { projectId },
        select: {
          id: true,
          nodeCode: true,
          nodeName: true,
          status: true,
          isActive: true,
          assigneeUserId: true,
          assigneeDepartmentId: true,
          assigneeUser: {
            select: {
              id: true,
              name: true,
              departmentId: true,
              department: { select: { name: true } },
            },
          },
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    const directoryDepartments: DirectoryDepartment[] = departments;
    const directoryUsers: DirectoryUser[] = users.map((user) => ({
      id: user.id,
      name: user.name,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
    }));
    const latestTaskByNode = new Map<WorkflowNodeCode, (typeof tasks)[number]>();

    for (const task of tasks) {
      if (!latestTaskByNode.has(task.nodeCode)) {
        latestTaskByNode.set(task.nodeCode, task);
      }
    }

    const assignments = flowMap.nodes.map((node) =>
      this.buildAssignmentPreview({
        nodeCode: node.nodeCode,
        task: latestTaskByNode.get(node.nodeCode) ?? null,
        project,
        departments: directoryDepartments,
        users: directoryUsers,
      }),
    );

    return {
      ...this.readOnlyEnvelope(),
      viewer: this.serializeViewer(actor),
      project,
      flowMap: {
        ...flowMap,
        nodes: flowMap.nodes.map((node) => {
          const assignment = assignments.find((item) => item.nodeCode === node.nodeCode);

          return {
            ...node,
            primaryDepartment: assignment?.primaryDepartment ?? null,
            collaboratorDepartments: assignment?.collaboratorDepartments ?? [],
            suggestedOwner: assignment?.suggestedOwner ?? null,
            collaborators: assignment?.collaborators ?? [],
            reviewers: assignment?.reviewers ?? [],
            assignmentStatus: assignment?.assignmentStatus ?? 'UNASSIGNED',
            assignmentSource: assignment?.assignmentSource ?? 'NONE',
            availableActions: assignment?.availableActions ?? [],
          };
        }),
      },
      organization: {
        departments: directoryDepartments.map((department) => ({
          ...department,
          activeUserCount: directoryUsers.filter(
            (user) => user.departmentId === department.id,
          ).length,
        })),
        users: directoryUsers,
      },
      memberAssignments: this.buildMemberAssignments(project, assignments),
      assignmentPreview: assignments,
    };
  }

  async getTask(taskId: string, actor: AuthenticatedUser) {
    const task = await this.workflowsService.getTaskInteractionDetail(taskId, actor);

    return {
      ...this.readOnlyEnvelope(),
      viewer: this.serializeViewer(actor),
      task,
    };
  }

  async getProgressContext(taskId: string, actor: AuthenticatedUser) {
    const task = await this.workflowsService.getTaskInteractionDetail(taskId, actor);

    return {
      ...this.readOnlyEnvelope(),
      viewer: this.serializeViewer(actor),
      progressSubmissionEnabled: false,
      task: {
        ...task,
        availableActions: [],
      },
      notice: 'Gate 2 仅展示真实进展上下文，进展提交与材料上传将在后续门禁开放。',
    };
  }

  private buildAssignmentPreview(input: {
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
    project: ProjectDetail;
    departments: DirectoryDepartment[];
    users: DirectoryUser[];
  }) {
    const rule = R26_ASSIGNMENT_RULES[input.nodeCode];
    const departmentByCode = new Map(
      input.departments.map((department) => [department.code, department]),
    );
    const primaryDepartment = departmentByCode.get(rule.primaryDepartmentCode) ?? null;
    const collaboratorDepartments = rule.collaboratorDepartmentCodes
      .map((code) => departmentByCode.get(code) ?? null)
      .filter((department): department is DirectoryDepartment => department !== null);
    const projectMemberIds = new Set(input.project.members.map((member) => member.userId));
    const projectMembersByDepartment = input.project.members.filter((member) =>
      input.users.some(
        (user) =>
          user.id === member.userId &&
          user.departmentId !== null &&
          user.departmentId === primaryDepartment?.id,
      ),
    );
    const departmentCandidates = input.users.filter(
      (user) => user.departmentId === primaryDepartment?.id,
    );
    const suggestedOwner = input.task?.assigneeUser
      ? this.serializePerson(input.task.assigneeUser)
      : projectMembersByDepartment[0]
        ? this.serializeProjectMember(projectMembersByDepartment[0])
        : departmentCandidates[0] ?? null;
    const assignmentStatus = input.task?.assigneeUser
      ? 'ASSIGNED'
      : suggestedOwner
        ? 'SUGGESTED'
        : 'UNASSIGNED';
    const assignmentSource = input.task?.assigneeUser
      ? 'WORKFLOW_TASK'
      : projectMembersByDepartment[0]
        ? 'PROJECT_MEMBER_RULE'
        : departmentCandidates[0]
          ? 'DEPARTMENT_POOL'
          : 'NONE';
    const collaborators = collaboratorDepartments
      .map((department) => {
        const projectCandidate = input.project.members.find((member) =>
          input.users.some(
            (user) =>
              user.id === member.userId &&
              user.departmentId === department.id &&
              member.userId !== suggestedOwner?.id,
          ),
        );

        if (projectCandidate) {
          return this.serializeProjectMember(projectCandidate);
        }

        return (
          input.users.find(
            (user) =>
              user.departmentId === department.id &&
              user.id !== suggestedOwner?.id &&
              !projectMemberIds.has(user.id),
          ) ?? null
        );
      })
      .filter((person): person is NonNullable<typeof person> => person !== null);
    const reviewerMember = input.project.members.find(
      (member) => member.memberType === ProjectMemberType.REVIEWER,
    );
    const reviewDepartment = departmentByCode.get('REVIEW') ?? null;
    const reviewers = [
      reviewerMember
        ? this.serializeProjectMember(reviewerMember)
        : input.users.find((user) => user.departmentId === reviewDepartment?.id) ?? null,
    ].filter((person): person is NonNullable<typeof person> => person !== null);

    return {
      nodeCode: input.nodeCode,
      stepNumber: WORKFLOW_NODE_META_MAP[input.nodeCode].sequence / 10,
      stepName: WORKFLOW_NODE_META_MAP[input.nodeCode].name,
      taskId: input.task?.id ?? null,
      primaryDepartment,
      collaboratorDepartments,
      suggestedOwner,
      collaborators,
      reviewers: WORKFLOW_NODE_META_MAP[input.nodeCode].isReviewNode ? reviewers : [],
      assignmentStatus,
      assignmentSource,
      unassignedReason:
        assignmentStatus === 'UNASSIGNED'
          ? `主责部门“${primaryDepartment?.name ?? rule.primaryDepartmentCode}”暂无可用候选人。`
          : null,
      availableActions:
        input.task?.isActive === true
          ? getAllowedWorkflowActions(input.nodeCode)
              .filter((action) =>
                isWorkflowActionCurrentlyAvailable(input.task!.status, action),
              )
              .map((action) => ({
                action,
                label: ACTION_LABELS[action],
              }))
          : [],
    };
  }

  private buildMemberAssignments(
    project: ProjectDetail,
    assignments: ReturnType<R26ReadModelService['buildAssignmentPreview']>[],
  ) {
    return project.members.map((member) => {
      const defaultAssignments = assignments.filter(
        (assignment) => assignment.suggestedOwner?.id === member.userId,
      );
      const collaborationAssignments = assignments.filter(
        (assignment) =>
          assignment.collaborators.some((person) => person.id === member.userId) ||
          assignment.reviewers.some((person) => person.id === member.userId),
      );

      return {
        id: member.id,
        userId: member.userId,
        name: member.name,
        departmentName: member.departmentName,
        memberType: member.memberType,
        memberTypeLabel: MEMBER_TYPE_LABELS[member.memberType],
        projectResponsibility: member.title ?? MEMBER_TYPE_LABELS[member.memberType],
        isPrimary: member.isPrimary,
        defaultNodes: defaultAssignments.map((assignment) => ({
          nodeCode: assignment.nodeCode,
          stepNumber: assignment.stepNumber,
          stepName: assignment.stepName,
        })),
        currentTasks: defaultAssignments
          .filter((assignment) => assignment.taskId !== null)
          .map((assignment) => ({
            taskId: assignment.taskId,
            nodeCode: assignment.nodeCode,
            stepName: assignment.stepName,
          })),
        relations: collaborationAssignments.map((assignment) => ({
          nodeCode: assignment.nodeCode,
          stepName: assignment.stepName,
          relation: assignment.reviewers.some((person) => person.id === member.userId)
            ? '评审'
            : '协同',
        })),
      };
    });
  }

  private serializeViewer(actor: AuthenticatedUser) {
    return {
      id: actor.id,
      name: actor.name,
      departmentId: actor.departmentId,
      departmentName: actor.departmentName,
      roleCodes: actor.roleCodes,
      permissionCodes: actor.permissionCodes ?? [],
      isSystemAdmin: actor.isSystemAdmin,
      authSource: actor.authSource,
    };
  }

  private serializeProjectMember(member: ProjectDetail['members'][number]) {
    return {
      id: member.userId,
      name: member.name,
      departmentId: null,
      departmentName: member.departmentName,
    };
  }

  private serializePerson(person: {
    id: string;
    name: string;
    departmentId: string | null;
    department?: { name: string } | null;
    departmentName?: string | null;
  }) {
    return {
      id: person.id,
      name: person.name,
      departmentId: person.departmentId,
      departmentName: person.department?.name ?? person.departmentName ?? null,
    };
  }

  private readOnlyEnvelope() {
    return {
      dataSource: 'database',
      readOnly: true,
      generatedAt: new Date().toISOString(),
    } as const;
  }
}
