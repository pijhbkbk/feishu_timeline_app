import { Injectable } from '@nestjs/common';
import {
  ProjectMemberType,
  UserStatus,
  WorkflowNodeCode,
  type WorkflowTaskStatus,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DashboardService } from '../dashboard/dashboard.service';
import { ProjectsService } from '../projects/projects.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { R26_ASSIGNMENT_RULES } from './r26-assignment.rules';
import {
  buildR26AssignmentPreview,
  parseAssignmentSource,
  type R26AssignmentTask,
  type R26DirectoryDepartment,
  type R26DirectoryUser,
  type R26NodeAssignmentConfig,
  type R26ProjectMemberRow,
} from './r26-assignment.resolver';

type ProjectDetail = Awaited<ReturnType<ProjectsService['getProjectDetail']>>;

const MEMBER_TYPE_LABELS: Record<ProjectMemberType, string> = {
  OWNER: '项目负责人',
  MANAGER: '部门项目负责人',
  MEMBER: '项目成员',
  REVIEWER: '评审人',
  OBSERVER: '观察人',
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
    const [
      project,
      flowMap,
      departments,
      users,
      tasks,
      nodeAssignments,
      projectRecords,
    ] =
      await Promise.all([
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
          payload: true,
          assigneeUser: {
            select: {
              id: true,
              name: true,
              departmentId: true,
              department: { select: { name: true } },
            },
          },
          blockers: {
            where: { status: 'OPEN' },
            include: {
              helperUser: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          createdAt: true,
        },
        orderBy: [{ taskRound: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.projectNodeAssignment.findMany({
        where: { projectId },
        select: {
          nodeCode: true,
          primaryDepartmentId: true,
          ownerUserId: true,
          collaboratorUserIds: true,
          reviewerUserIds: true,
          assignmentSource: true,
        },
      }),
      this.prisma.auditLog.findMany({
        where: { projectId },
        select: {
          id: true,
          action: true,
          summary: true,
          actorUser: { select: { name: true } },
          nodeCode: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 30,
      }),
    ]);

    const directoryDepartments: R26DirectoryDepartment[] = departments;
    const directoryUsers: R26DirectoryUser[] = users.map((user) => ({
      id: user.id,
      name: user.name,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
    }));
    const assignmentByNode = new Map(
      nodeAssignments.map((assignment) => [
        assignment.nodeCode,
        {
          ...assignment,
          collaboratorUserIds: this.parseUserIdList(assignment.collaboratorUserIds),
          reviewerUserIds: this.parseUserIdList(assignment.reviewerUserIds),
        } satisfies R26NodeAssignmentConfig,
      ]),
    );
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
        nodeAssignment: assignmentByNode.get(node.nodeCode) ?? null,
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
      readOnly: false,
      writeScope: 'PROJECT_MEMBERS_AND_ASSIGNMENTS',
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
          const task = latestTaskByNode.get(node.nodeCode) ?? null;
          const blocker = task?.blockers[0] ?? null;

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
            blocker: blocker
              ? {
                  type: blocker.blockerType,
                  description: blocker.description,
                  helperName: blocker.helperUser?.name ?? null,
                  assistanceUserIds: this.parseUserIdList(
                    blocker.assistanceUserIds,
                  ),
                  assistanceDepartmentIds: this.parseUserIdList(
                    blocker.assistanceDepartmentIds,
                  ),
                  impactLevel: blocker.impactLevel,
                  expectedResolvedAt:
                    blocker.expectedResolvedAt?.toISOString() ?? null,
                }
              : null,
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
        users: directoryUsers.map((user) => ({
          ...user,
          isProjectMember: project.members.some((member) => member.userId === user.id),
        })),
      },
      memberAssignments: this.buildMemberAssignments(project, assignments),
      assignmentPreview: assignments,
      projectRecords: projectRecords.map((record) => ({
        id: record.id,
        action: record.action,
        summary: record.summary ?? record.action,
        actorName: record.actorUser?.name ?? '系统',
        nodeCode: record.nodeCode,
        requestId: this.readMetadataString(record.metadata, 'requestId'),
        reason: this.readMetadataString(record.metadata, 'reason'),
        createdAt: record.createdAt.toISOString(),
      })),
      capabilities: {
        gate: 'R26_GATE3B',
        memberAssignmentVersion: project.memberAssignmentVersion,
        manageMembers:
          actor.isSystemAdmin ||
          actor.roleCodes.includes('admin') ||
          (project.ownerUserId === actor.id &&
            (actor.permissionCodes ?? []).includes('project.write')),
        progressWriteEnabled: true,
        workflowWriteEnabled: false,
      },
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
      payload?: unknown;
      assigneeUser: {
        id: string;
        name: string;
        departmentId: string | null;
        department: { name: string } | null;
      } | null;
    } | null;
    nodeAssignment?: R26NodeAssignmentConfig | null;
    project: ProjectDetail;
    departments: R26DirectoryDepartment[];
    users: R26DirectoryUser[];
  }) {
    const payload =
      input.task?.payload && typeof input.task.payload === 'object'
        ? (input.task.payload as Record<string, unknown>)
        : null;
    const projectMembers: R26ProjectMemberRow[] = input.project.members.map(
      (member) => ({
        id: member.id,
        userId: member.userId,
        name: member.name,
        departmentName: member.departmentName,
        memberType: member.memberType,
        title: member.title,
        isPrimary: member.isPrimary,
      }),
    );
    const task: R26AssignmentTask | null = input.task
      ? {
          ...input.task,
          assignmentSource: parseAssignmentSource(payload?.assignmentSource),
        }
      : null;

    return buildR26AssignmentPreview({
      nodeCode: input.nodeCode,
      task,
      nodeAssignment: input.nodeAssignment ?? null,
      projectMembers,
      departments: input.departments,
      users: input.users,
    });
  }

  private buildMemberAssignments(
    project: ProjectDetail,
    assignments: ReturnType<R26ReadModelService['buildAssignmentPreview']>[],
  ) {
    const groupedMembers = [
      ...new Map(
        project.members.map((member) => [
          member.userId,
          {
            ...member,
            roles: project.members
              .filter((item) => item.userId === member.userId)
              .map((item) => ({
                memberType: item.memberType,
                label: MEMBER_TYPE_LABELS[item.memberType],
                title: item.title,
                isPrimary: item.isPrimary,
              })),
          },
        ]),
      ).values(),
    ];

    return groupedMembers.map((member) => {
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
        roles: member.roles,
        projectResponsibility:
          [
            ...new Set(
              member.roles
                .map((role) => role.title)
                .filter((title): title is string => Boolean(title)),
            ),
          ].join('、') ||
          member.roles.map((role) => role.label).join('、'),
        isPrimary: member.roles.some((role) => role.isPrimary),
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

  private parseUserIdList(value: unknown) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private readMetadataString(value: unknown, key: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const candidate = (value as Record<string, unknown>)[key];
    return typeof candidate === 'string' ? candidate : null;
  }

  private readOnlyEnvelope() {
    return {
      dataSource: 'database',
      readOnly: true,
      generatedAt: new Date().toISOString(),
    } as const;
  }
}
