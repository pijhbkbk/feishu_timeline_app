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
import {
  R26_ASSIGNMENT_RULES,
  type R26DepartmentRule,
} from './r26-assignment.rules';

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
      dashboard: {
        ...dashboard,
        currentTask: this.enrichDashboardTask(dashboard.currentTask),
        nextTask: this.enrichDashboardTask(dashboard.nextTask),
      },
    };
  }

  async getProjects(query: Record<string, unknown>, actor: AuthenticatedUser) {
    const projects = await this.projectsService.listProjects(query, actor);

    return {
      ...this.readOnlyEnvelope(),
      viewer: this.serializeViewer(actor),
      projects: {
        ...projects,
        items: projects.items.map((project) => ({
          ...project,
          currentTaskDepartmentName:
            project.currentTaskDepartmentName ??
            (project.currentNodeCode
              ? R26_ASSIGNMENT_RULES[project.currentNodeCode].primaryDepartment.name
              : null),
        })),
      },
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
          taskRound: true,
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
        orderBy: [{ taskRound: 'desc' }, { createdAt: 'desc' }],
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
      const current = latestTaskByNode.get(task.nodeCode);

      if (
        !current ||
        task.taskRound > current.taskRound ||
        (task.taskRound === current.taskRound && task.createdAt > current.createdAt)
      ) {
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
    const currentAssignment = flowMap.currentStepCode
      ? assignments.find(
          (assignment) => assignment.nodeCode === flowMap.currentStepCode,
        ) ?? null
      : null;

    return {
      ...this.readOnlyEnvelope(),
      viewer: this.serializeViewer(actor),
      project,
      flowMap: {
        ...flowMap,
        currentDepartment:
          flowMap.currentDepartment ??
          currentAssignment?.primaryDepartment.name ??
          null,
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
            assignmentSource: assignment?.assignmentSource ?? 'UNASSIGNED',
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
    const task = await this.getTaskWithResponsibility(taskId, actor);

    return {
      ...this.readOnlyEnvelope(),
      viewer: this.serializeViewer(actor),
      task,
    };
  }

  async getProgressContext(taskId: string, actor: AuthenticatedUser) {
    const task = await this.getTaskWithResponsibility(taskId, actor);

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

  private enrichDashboardTask<T extends {
    nodeCode: WorkflowNodeCode;
    assigneeDepartmentName: string | null;
  }>(task: T | null) {
    if (!task) {
      return null;
    }

    return {
      ...task,
      assigneeDepartmentName:
        task.assigneeDepartmentName ??
        R26_ASSIGNMENT_RULES[task.nodeCode].primaryDepartment.name,
    };
  }

  private async getTaskWithResponsibility(
    taskId: string,
    actor: AuthenticatedUser,
  ) {
    const [task, assignment] = await Promise.all([
      this.workflowsService.getTaskInteractionDetail(taskId, actor),
      this.prisma.workflowTask.findUnique({
        where: { id: taskId },
        select: {
          nodeCode: true,
          assigneeDepartment: {
            select: {
              id: true,
              name: true,
            },
          },
          assigneeUser: {
            select: {
              department: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);
    const explicitDepartment =
      assignment?.assigneeDepartment ??
      assignment?.assigneeUser?.department ??
      null;
    const departmentRule = assignment
      ? R26_ASSIGNMENT_RULES[assignment.nodeCode].primaryDepartment
      : null;

    return {
      ...task,
      department: explicitDepartment
        ? {
            id: explicitDepartment.id,
            name: explicitDepartment.name,
          }
        : {
            id: null,
            name: departmentRule?.name ?? null,
          },
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
    const primaryDepartment = this.materializeDepartment(
      rule.primaryDepartment,
      departmentByCode,
    );
    const collaboratorDepartments = rule.collaboratorDepartments.map((departmentRule) =>
      this.materializeDepartment(departmentRule, departmentByCode),
    );
    const reviewerDepartments = (rule.reviewerDepartments ?? []).map((departmentRule) =>
      this.materializeDepartment(departmentRule, departmentByCode),
    );
    const projectMembersByDepartment = this.findProjectMembersForDepartment(
      input.project,
      input.users,
      primaryDepartment.id,
    );
    const departmentLead =
      projectMembersByDepartment.find(
        (member) =>
          member.memberType === ProjectMemberType.MANAGER || member.isPrimary,
      ) ?? null;
    const defaultExecutor =
      projectMembersByDepartment.find(
        (member) =>
          member.memberType === ProjectMemberType.MEMBER &&
          member.title?.includes('负责人') === true,
      ) ?? null;
    const singleEligibleMember =
      projectMembersByDepartment.length === 1 ? projectMembersByDepartment[0] : null;
    const suggestedOwner = input.task?.assigneeUser
      ? this.serializePerson(input.task.assigneeUser)
      : departmentLead
        ? this.serializeProjectMember(departmentLead, input.users)
        : defaultExecutor
          ? this.serializeProjectMember(defaultExecutor, input.users)
          : singleEligibleMember
            ? this.serializeProjectMember(singleEligibleMember, input.users)
            : null;
    const assignmentStatus = input.task?.assigneeUser
      ? 'ASSIGNED'
      : suggestedOwner
        ? 'SUGGESTED'
        : 'UNASSIGNED';
    const assignmentSource = input.task?.assigneeUser
      ? 'TASK_OVERRIDE'
      : departmentLead
        ? 'PROJECT_DEPARTMENT_LEAD'
        : defaultExecutor
          ? 'PROJECT_DEFAULT_ASSIGNEE'
          : singleEligibleMember
            ? 'SINGLE_ELIGIBLE_MEMBER'
            : 'UNASSIGNED';
    const collaborators = this.uniquePeople(
      collaboratorDepartments.flatMap((department) =>
        this.findProjectMembersForDepartment(
          input.project,
          input.users,
          department.id,
        )
          .filter((member) => member.userId !== suggestedOwner?.id)
          .map((member) => this.serializeProjectMember(member, input.users)),
      ),
    );
    const reviewers = this.uniquePeople([
      ...input.project.members
        .filter((member) => member.memberType === ProjectMemberType.REVIEWER)
        .map((member) => this.serializeProjectMember(member, input.users)),
      ...reviewerDepartments.flatMap((department) =>
        this.findProjectMembersForDepartment(
          input.project,
          input.users,
          department.id,
        ).map((member) => this.serializeProjectMember(member, input.users)),
      ),
    ]).filter((person) => person.id !== suggestedOwner?.id);

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
          ? this.resolveUnassignedReason(
              primaryDepartment,
              projectMembersByDepartment.length,
            )
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

  private materializeDepartment(
    rule: R26DepartmentRule,
    departmentByCode: Map<string, DirectoryDepartment>,
  ) {
    const directoryDepartment =
      departmentByCode.get(rule.directoryCode ?? rule.code) ?? null;

    return {
      id: directoryDepartment?.id ?? null,
      code: rule.code,
      name: rule.name,
      directoryCode: directoryDepartment?.code ?? null,
      directoryName: directoryDepartment?.name ?? null,
      isDirectoryMatched: directoryDepartment !== null,
    };
  }

  private findProjectMembersForDepartment(
    project: ProjectDetail,
    users: DirectoryUser[],
    departmentId: string | null,
  ) {
    if (!departmentId) {
      return [];
    }

    const activeUserIds = new Set(
      users
        .filter((user) => user.departmentId === departmentId)
        .map((user) => user.id),
    );

    return project.members.filter((member) => activeUserIds.has(member.userId));
  }

  private resolveUnassignedReason(
    department: ReturnType<R26ReadModelService['materializeDepartment']>,
    projectMemberCount: number,
  ) {
    if (!department.isDirectoryMatched) {
      return `公司目录中尚未配置“${department.name}”，负责人待分配。`;
    }

    if (projectMemberCount === 0) {
      return `当前项目没有${department.name}有效成员。`;
    }

    return `当前项目有 ${projectMemberCount} 位${department.name}成员，但未设置部门负责人或默认执行人。`;
  }

  private uniquePeople<T extends { id: string }>(people: T[]) {
    return [...new Map(people.map((person) => [person.id, person])).values()];
  }

  private buildMemberAssignments(
    project: ProjectDetail,
    assignments: ReturnType<R26ReadModelService['buildAssignmentPreview']>[],
  ) {
    return project.members.map((member) => {
      const ownedAssignments = assignments.filter(
        (assignment) => assignment.suggestedOwner?.id === member.userId,
      );
      const defaultAssignments = ownedAssignments.filter(
        (assignment) => assignment.assignmentSource !== 'TASK_OVERRIDE',
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
        currentTasks: ownedAssignments
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
      roleLabel: actor.isSystemAdmin
        ? '系统管理员'
        : actor.roleCodes.includes('project_manager')
          ? '项目经理'
          : '项目成员',
      organizationStatus: actor.departmentId ? 'SYNCED' : 'MISSING_DEPARTMENT',
      authSource: actor.authSource,
    };
  }

  private serializeProjectMember(
    member: ProjectDetail['members'][number],
    users: DirectoryUser[] = [],
  ) {
    const directoryUser = users.find((user) => user.id === member.userId) ?? null;

    return {
      id: member.userId,
      name: member.name,
      departmentId: directoryUser?.departmentId ?? null,
      departmentName: directoryUser?.departmentName ?? member.departmentName,
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
