import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttachmentTargetType,
  AuditTargetType,
  ColorExitSuggestion,
  ProjectMemberType,
  ProjectPriority,
  ProjectStatus,
  RecurringTaskStatus,
  ReviewType,
  UserStatus,
  WorkflowNodeCode,
  WorkflowInstanceStatus,
  WorkflowTaskStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { WORKFLOW_NODE_META_MAP } from '../workflows/workflow-node.constants';

type ProjectDbClient = Prisma.TransactionClient | PrismaService;

type ProjectMemberInput = {
  userId: string;
  memberType: ProjectMemberType;
  title: string | null;
  isPrimary: boolean;
};

type ProjectListQuery = {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: ProjectStatus;
  currentNodeCode?: WorkflowNodeCode;
  ownerUserId?: string;
  ownerDepartmentId?: string;
  priority?: ProjectPriority;
  isOverdue?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
};

type CreateProjectInput = {
  code: string;
  name: string;
  description: string | null;
  priority: ProjectPriority;
  marketRegion: string | null;
  vehicleModel: string | null;
  ownerUserId: string;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  members: ProjectMemberInput[];
};

type UpdateProjectInput = {
  name?: string;
  description?: string | null;
  priority?: ProjectPriority;
  marketRegion?: string | null;
  vehicleModel?: string | null;
  ownerUserId?: string;
  plannedStartDate?: Date | null;
  plannedEndDate?: Date | null;
};

type ProjectRecord = Prisma.ProjectGetPayload<{
  include: {
    ownerUser: {
      include: {
        department: true;
      };
    };
    owningDepartment: true;
    members: {
      include: {
        user: {
          include: {
            department: true;
            userRoles: {
              include: {
                role: true;
              };
            };
          };
        };
      };
    };
    workflowInstances: {
      where: {
        status: WorkflowInstanceStatus;
      };
    };
    _count: {
      select: {
        members: true;
      };
    };
  };
}>;

const PROJECT_STATUS_VALUES = Object.values(ProjectStatus);
const PROJECT_PRIORITY_VALUES = Object.values(ProjectPriority);
const PROJECT_MEMBER_TYPE_VALUES = Object.values(ProjectMemberType);
const WORKFLOW_NODE_VALUES = Object.values(WorkflowNodeCode);

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowsService: WorkflowsService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  async listProjects(rawQuery: Record<string, unknown>, actor: AuthenticatedUser) {
    const query = this.normalizeListQuery(rawQuery);
    const where = this.buildListWhere(query, actor);

    const [total, projects, nodeDefinitions] = await this.prisma.$transaction([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        include: {
          ownerUser: {
            include: {
              department: true,
            },
          },
          owningDepartment: true,
          colors: {
            select: {
              name: true,
              code: true,
              isPrimary: true,
            },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
          workflowTasks: {
            where: {
              isActive: true,
            },
            select: {
              isActive: true,
              dueAt: true,
              status: true,
            },
          },
          _count: {
            select: {
              members: true,
              workflowTasks: true,
            },
          },
        },
        orderBy: [
          { updatedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.workflowNodeDefinition.findMany({
        where: {
          isActive: true,
        },
        orderBy: {
          sequence: 'asc',
        },
      }),
    ]);

    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      filters: {
        status: query.status ?? null,
        currentNodeCode: query.currentNodeCode ?? null,
        ownerUserId: query.ownerUserId ?? null,
        ownerDepartmentId: query.ownerDepartmentId ?? null,
        priority: query.priority ?? null,
        isOverdue: query.isOverdue ?? null,
        dateFrom: this.serializeDate(query.dateFrom),
        dateTo: this.serializeDate(query.dateTo),
      },
      nodeOptions: nodeDefinitions.map((definition) => ({
        code: definition.nodeCode,
        name: definition.name,
        sequence: definition.sequence,
      })),
      items: projects.map((project) => this.toProjectListItem(project)),
    };
  }

  async getProjectDetail(projectId: string, actor: AuthenticatedUser) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );
    const project = await this.findProjectDetailOrThrow(this.prisma, projectId);

    return this.toProjectDetail(project);
  }

  async getProjectStageOverview(projectId: string, actor: AuthenticatedUser) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );

    const [project, tasks, recurringPlan] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          priority: true,
          currentNodeCode: true,
          plannedEndDate: true,
          updatedAt: true,
        },
      }),
      this.prisma.workflowTask.findMany({
        where: {
          projectId,
        },
        include: {
          assigneeUser: {
            select: {
              id: true,
              name: true,
            },
          },
          assigneeDepartment: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [
          { createdAt: 'asc' },
          { taskRound: 'asc' },
        ],
      }),
      this.prisma.recurringPlan.findFirst({
        where: {
          projectId,
          sourceNodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          planCode: true,
          status: true,
          totalCount: true,
          generatedCount: true,
          startDate: true,
          endDate: true,
        },
      }),
    ]);

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status,
        priority: project.priority,
        currentNodeCode: project.currentNodeCode,
        currentNodeName: this.workflowsService.getCurrentNodeName(project.currentNodeCode),
        targetDate: this.serializeDate(project.plannedEndDate),
        updatedAt: project.updatedAt.toISOString(),
      },
      summary: {
        totalTasks: tasks.length,
        activeTasks: tasks.filter((task) => task.isActive).length,
        completedTasks: tasks.filter((task) => !task.isActive).length,
        overdueTasks: tasks.filter((task) => (task.overdueDays ?? 0) > 0 && task.isActive).length,
      },
      recurringPlan: recurringPlan
        ? {
            id: recurringPlan.id,
            planCode: recurringPlan.planCode,
            status: recurringPlan.status,
            totalCount: recurringPlan.totalCount,
            generatedCount: recurringPlan.generatedCount,
            startDate: this.serializeDate(recurringPlan.startDate),
            endDate: this.serializeDate(recurringPlan.endDate),
          }
        : null,
      stages: tasks.map((task) => this.toProjectStageOverviewTask(task)),
    };
  }

  async getProjectTimeline(projectId: string, actor: AuthenticatedUser) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );

    const now = new Date();
    const [project, tasks, recurringPlan, reviewRecords, colorExits] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          ownerUser: {
            include: {
              department: true,
            },
          },
          owningDepartment: true,
          colors: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
        },
      }),
      this.prisma.workflowTask.findMany({
        where: {
          projectId,
        },
        include: {
          assigneeUser: true,
          assigneeDepartment: true,
        },
        orderBy: [{ createdAt: 'asc' }, { taskRound: 'asc' }],
      }),
      this.prisma.recurringPlan.findFirst({
        where: {
          projectId,
          sourceNodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        },
        include: {
          tasks: {
            orderBy: {
              periodIndex: 'asc',
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.reviewRecord.findMany({
        where: {
          projectId,
        },
        include: {
          reviewer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.colorExit.findMany({
        where: {
          projectId,
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    const taskIds = tasks.map((task) => task.id);
    const reviewIds = reviewRecords.map((review) => review.id);
    const attachments =
      taskIds.length === 0 && reviewIds.length === 0
        ? []
        : await this.prisma.attachment.findMany({
            where: {
              projectId,
              isDeleted: false,
              OR: [
                {
                  entityType: AttachmentTargetType.WORKFLOW_TASK,
                  entityId: {
                    in: taskIds.length > 0 ? taskIds : ['__none__'],
                  },
                },
                {
                  entityType: AttachmentTargetType.REVIEW_RECORD,
                  entityId: {
                    in: reviewIds.length > 0 ? reviewIds : ['__none__'],
                  },
                },
              ],
            },
            select: {
              entityType: true,
              entityId: true,
            },
          });
    const attachmentCountByTaskId = new Map<string, number>();

    for (const attachment of attachments) {
      if (attachment.entityType === AttachmentTargetType.WORKFLOW_TASK) {
        attachmentCountByTaskId.set(
          attachment.entityId,
          (attachmentCountByTaskId.get(attachment.entityId) ?? 0) + 1,
        );
      }
    }

    for (const review of reviewRecords) {
      if (!review.attachmentId) {
        continue;
      }

      attachmentCountByTaskId.set(
        review.workflowTaskId,
        (attachmentCountByTaskId.get(review.workflowTaskId) ?? 0) + 1,
      );
    }

    const latestTaskByNode = this.getLatestTaskByNode(tasks);
    const nodes = this.getOrderedWorkflowNodeCodes().map((nodeCode) => {
      const task = latestTaskByNode.get(nodeCode) ?? null;
      const nodeReviews = reviewRecords.filter((review) => review.workflowTaskId === task?.id);
      const attachmentCount = task ? attachmentCountByTaskId.get(task.id) ?? 0 : 0;

      return {
        stepNumber: WORKFLOW_NODE_META_MAP[nodeCode].sequence / 10,
        nodeCode,
        nodeName: WORKFLOW_NODE_META_MAP[nodeCode].name,
        status: this.resolveTimelineStatus(nodeCode, task, project.currentNodeCode, now),
        taskId: task?.id ?? null,
        taskRound: task?.taskRound ?? null,
        startTime: task?.startedAt?.toISOString() ?? null,
        triggerTime: task?.createdAt.toISOString() ?? null,
        dueAt: task?.dueAt?.toISOString() ?? null,
        completedAt:
          task?.completedAt?.toISOString() ??
          task?.reviewPassAt?.toISOString() ??
          task?.returnedAt?.toISOString() ??
          null,
        responsibleDepartment: task?.assigneeDepartment?.name ?? null,
        ownerName: task?.assigneeUser?.name ?? project.ownerUser?.name ?? null,
        output:
          nodeReviews.length > 0
            ? `评审记录 ${nodeReviews.length} 条`
            : task
              ? this.resolveNodeOutput(nodeCode, task)
              : '未产生输出物',
        attachmentCount,
        isOverdue: task ? this.isTaskOverdue(task, now) : false,
        overdueDays: task ? this.getOverdueDays(task.dueAt, now) : 0,
        reviewGate:
          nodeCode === WorkflowNodeCode.CAB_REVIEW
            ? this.buildCabReviewGate(reviewRecords, tasks)
            : null,
        monthlyReview:
          nodeCode === WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW
            ? this.buildMonthlyReviewSummary(recurringPlan, now)
            : null,
        colorExit:
          nodeCode === WorkflowNodeCode.PROJECT_CLOSED
            ? this.buildColorExitSummary(colorExits[0] ?? null)
            : null,
      };
    });
    const completedNodeCount = nodes.filter((node) => node.status === 'COMPLETED').length;

    return {
      lastUpdatedAt: now.toISOString(),
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status,
        priority: project.priority,
        currentNodeCode: project.currentNodeCode,
        currentNodeName: this.workflowsService.getCurrentNodeName(project.currentNodeCode),
        colorName: project.colors[0]?.name ?? '未关联颜色',
        ownerName: project.ownerUser?.name ?? '未分配',
        ownerDepartmentName: project.ownerUser?.department?.name ?? project.owningDepartment?.name ?? null,
        plannedEndDate: this.serializeDate(project.plannedEndDate),
        progressPercent: Math.round((completedNodeCount / this.getOrderedWorkflowNodeCodes().length) * 100),
      },
      nodes,
    };
  }

  async createProject(rawInput: unknown, actor: AuthenticatedUser) {
    const input = this.normalizeCreateInput(rawInput, actor);

    return this.prisma.$transaction(async (tx) => {
      const owner = await this.findActiveUserOrThrow(tx, input.ownerUserId);

      const project = await tx.project.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description,
          status: ProjectStatus.IN_PROGRESS,
          priority: input.priority,
          currentNodeCode: WorkflowNodeCode.PROJECT_INITIATION,
          owningDepartmentId: owner.departmentId ?? actor.departmentId ?? null,
          ownerUserId: owner.id,
          marketRegion: input.marketRegion,
          vehicleModel: input.vehicleModel,
          plannedStartDate: input.plannedStartDate,
          plannedEndDate: input.plannedEndDate,
          actualStartDate: null,
          actualEndDate: null,
          closedAt: null,
        },
      });

      const createdMembers = await this.replaceMembersInTx(tx, {
        projectId: project.id,
        ownerUserId: owner.id,
        members: input.members,
      });

      const workflow = await this.workflowsService.initializeProjectWorkflow(tx, {
        projectId: project.id,
        ownerUserId: owner.id,
        initiatedById: actor.id,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId: project.id,
        actorUserId: actor.id,
        targetType: AuditTargetType.PROJECT,
        targetId: project.id,
        action: 'PROJECT_CREATED',
        nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
        summary: `创建项目 ${project.name}`,
        afterData: {
          project: this.toProjectAuditSnapshot(project),
          members: this.toMemberAuditSnapshot(createdMembers),
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId: project.id,
        actorUserId: actor.id,
        targetType: AuditTargetType.WORKFLOW_INSTANCE,
        targetId: workflow.instance.id,
        action: 'WORKFLOW_INITIALIZED',
        nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
        summary: '项目创建后自动初始化流程实例。',
        afterData: {
          workflowInstanceId: workflow.instance.id,
          workflowTaskId: workflow.task.id,
          currentNodeCode: workflow.instance.currentNodeCode,
        },
      });

      const createdProject = await this.findProjectDetailOrThrow(tx, project.id);

      return this.toProjectDetail(createdProject);
    });
  }

  async updateProject(projectId: string, rawInput: unknown, actor: AuthenticatedUser) {
    const input = this.normalizeUpdateInput(rawInput);

    return this.prisma.$transaction(async (tx) => {
      await this.projectAccessService.assertProjectAccess(tx, projectId, actor, 'project.write');

      const currentProject = await tx.project.findUnique({
        where: { id: projectId },
      });

      if (!currentProject) {
        throw new NotFoundException('Project not found.');
      }

      const ownerUserId = input.ownerUserId ?? currentProject.ownerUserId;
      let resolvedOwnerUserId = ownerUserId;

      if (ownerUserId) {
        const owner = await this.findActiveUserOrThrow(tx, ownerUserId);
        resolvedOwnerUserId = owner.id;
      }

      const updatedProject = await tx.project.update({
        where: { id: projectId },
        data: {
          name: input.name ?? currentProject.name,
          description:
            input.description === undefined ? currentProject.description : input.description,
          priority: input.priority ?? currentProject.priority,
          marketRegion:
            input.marketRegion === undefined ? currentProject.marketRegion : input.marketRegion,
          vehicleModel:
            input.vehicleModel === undefined ? currentProject.vehicleModel : input.vehicleModel,
          ownerUserId: resolvedOwnerUserId ?? null,
          owningDepartmentId:
            resolvedOwnerUserId && resolvedOwnerUserId !== currentProject.ownerUserId
              ? (
                  await this.findActiveUserOrThrow(tx, resolvedOwnerUserId)
                ).departmentId ?? currentProject.owningDepartmentId
              : currentProject.owningDepartmentId,
          plannedStartDate:
            input.plannedStartDate === undefined
              ? currentProject.plannedStartDate
              : input.plannedStartDate,
          plannedEndDate:
            input.plannedEndDate === undefined
              ? currentProject.plannedEndDate
              : input.plannedEndDate,
        },
      });

      if (resolvedOwnerUserId) {
        await this.ensureOwnerMemberInTx(tx, projectId, resolvedOwnerUserId);
      }

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PROJECT,
        targetId: projectId,
        action: 'PROJECT_UPDATED',
        nodeCode: updatedProject.currentNodeCode,
        summary: `更新项目 ${updatedProject.name} 基础信息`,
        beforeData: this.toProjectAuditSnapshot(currentProject),
        afterData: this.toProjectAuditSnapshot(updatedProject),
      });

      const project = await this.findProjectDetailOrThrow(tx, projectId);
      return this.toProjectDetail(project);
    });
  }

  async replaceProjectMembers(projectId: string, rawInput: unknown, actor: AuthenticatedUser) {
    const input = this.normalizeMembersInput(rawInput);

    return this.prisma.$transaction(async (tx) => {
      await this.projectAccessService.assertProjectAccess(tx, projectId, actor, 'project.write');

      const project = await tx.project.findUnique({
        where: { id: projectId },
        include: {
          members: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!project) {
        throw new NotFoundException('Project not found.');
      }

      const beforeMembers = project.members.map((member) => ({
        userId: member.userId,
        userName: member.user.name,
        memberType: member.memberType,
        title: member.title,
        isPrimary: member.isPrimary,
      }));

      const updatedMembers = await this.replaceMembersInTx(tx, {
        projectId,
        ownerUserId: project.ownerUserId,
        members: input.members,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PROJECT,
        targetId: projectId,
        action: 'PROJECT_MEMBERS_REPLACED',
        nodeCode: project.currentNodeCode,
        summary: `更新项目 ${project.name} 成员`,
        beforeData: {
          members: beforeMembers,
        },
        afterData: {
          members: this.toMemberAuditSnapshot(updatedMembers),
        },
      });

      const detail = await this.findProjectDetailOrThrow(tx, projectId);
      return this.toProjectDetail(detail);
    });
  }

  private normalizeListQuery(rawQuery: Record<string, unknown>): ProjectListQuery {
    const page = this.parsePositiveInt(rawQuery.page, 1, 'page');
    const pageSize = this.parsePositiveInt(rawQuery.pageSize, 10, 'pageSize', 50);
    const keyword = this.parseOptionalString(rawQuery.keyword);
    const status = this.parseOptionalEnum(rawQuery.status, PROJECT_STATUS_VALUES, 'status');
    const currentNodeCode = this.parseOptionalEnum(
      rawQuery.currentNodeCode,
      WORKFLOW_NODE_VALUES,
      'currentNodeCode',
    );
    const ownerUserId = this.parseOptionalString(rawQuery.ownerUserId);
    const ownerDepartmentId = this.parseOptionalString(rawQuery.ownerDepartmentId);
    const priority = this.parseOptionalEnum(
      rawQuery.priority,
      PROJECT_PRIORITY_VALUES,
      'priority',
    );
    const isOverdue = this.parseOptionalBoolean(rawQuery.isOverdue);
    const dateFrom = this.parseOptionalDate(rawQuery.dateFrom, 'dateFrom');
    const dateTo = this.parseOptionalDate(rawQuery.dateTo, 'dateTo');

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be earlier than or equal to dateTo.');
    }

    return {
      page,
      pageSize,
      ...(keyword ? { keyword } : {}),
      ...(status ? { status } : {}),
      ...(currentNodeCode ? { currentNodeCode } : {}),
      ...(ownerUserId ? { ownerUserId } : {}),
      ...(ownerDepartmentId ? { ownerDepartmentId } : {}),
      ...(priority ? { priority } : {}),
      ...(isOverdue !== undefined ? { isOverdue } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    };
  }

  private normalizeCreateInput(rawInput: unknown, actor: AuthenticatedUser): CreateProjectInput {
    const input = this.asRecord(rawInput, 'Invalid project payload.');
    const code = this.parseRequiredString(input.code, 'code');
    const name = this.parseRequiredString(input.name, 'name');
    const description = this.parseNullableString(input.description);
    const priority =
      this.parseOptionalEnum(input.priority, PROJECT_PRIORITY_VALUES, 'priority') ??
      ProjectPriority.MEDIUM;
    const marketRegion = this.parseNullableString(input.marketRegion);
    const vehicleModel = this.parseNullableString(input.vehicleModel);
    const ownerUserId = this.parseOptionalString(input.ownerUserId) ?? actor.id;
    const plannedStartDate = this.parseOptionalDate(input.plannedStartDate, 'plannedStartDate');
    const plannedEndDate = this.parseOptionalDate(input.plannedEndDate, 'plannedEndDate');
    const members = this.parseMembers(input.members);

    this.assertDateRange(plannedStartDate, plannedEndDate);

    return {
      code,
      name,
      description,
      priority,
      marketRegion,
      vehicleModel,
      ownerUserId,
      plannedStartDate,
      plannedEndDate,
      members,
    };
  }

  private normalizeUpdateInput(rawInput: unknown): UpdateProjectInput {
    const input = this.asRecord(rawInput, 'Invalid project payload.');
    const plannedStartDate = this.parseOptionalDate(
      input.plannedStartDate,
      'plannedStartDate',
      true,
    );
    const plannedEndDate = this.parseOptionalDate(input.plannedEndDate, 'plannedEndDate', true);

    this.assertDateRange(
      plannedStartDate === undefined ? undefined : plannedStartDate,
      plannedEndDate === undefined ? undefined : plannedEndDate,
    );

    const normalized: UpdateProjectInput = {};
    const name = this.parseOptionalString(input.name);
    const description = this.parseNullableString(input.description, true);
    const priority = this.parseOptionalEnum(
      input.priority,
      PROJECT_PRIORITY_VALUES,
      'priority',
    );
    const marketRegion = this.parseNullableString(input.marketRegion, true);
    const vehicleModel = this.parseNullableString(input.vehicleModel, true);
    const ownerUserId = this.parseOptionalString(input.ownerUserId);

    if (name !== undefined) {
      normalized.name = name;
    }

    if (description !== undefined) {
      normalized.description = description;
    }

    if (priority !== undefined) {
      normalized.priority = priority;
    }

    if (marketRegion !== undefined) {
      normalized.marketRegion = marketRegion;
    }

    if (vehicleModel !== undefined) {
      normalized.vehicleModel = vehicleModel;
    }

    if (ownerUserId !== undefined) {
      normalized.ownerUserId = ownerUserId;
    }

    if (plannedStartDate !== undefined) {
      normalized.plannedStartDate = plannedStartDate;
    }

    if (plannedEndDate !== undefined) {
      normalized.plannedEndDate = plannedEndDate;
    }

    return normalized;
  }

  private normalizeMembersInput(rawInput: unknown) {
    const input = this.asRecord(rawInput, 'Invalid project members payload.');

    return {
      members: this.parseMembers(input.members),
    };
  }

  private parseMembers(rawValue: unknown): ProjectMemberInput[] {
    if (rawValue === undefined || rawValue === null) {
      return [];
    }

    if (!Array.isArray(rawValue)) {
      throw new BadRequestException('members must be an array.');
    }

    const normalized = rawValue.map((entry, index) => {
      const item = this.asRecord(entry, `Invalid member payload at index ${index}.`);
      const userId = this.parseRequiredString(item.userId, `members[${index}].userId`);
      const memberType = this.parseOptionalEnum(
        item.memberType,
        PROJECT_MEMBER_TYPE_VALUES,
        `members[${index}].memberType`,
      );

      if (!memberType) {
        throw new BadRequestException(`members[${index}].memberType is required.`);
      }

      return {
        userId,
        memberType,
        title: this.parseNullableString(item.title),
        isPrimary: item.isPrimary === true,
      };
    });

    const uniqueKeys = new Set<string>();

    for (const member of normalized) {
      const key = `${member.userId}:${member.memberType}`;

      if (uniqueKeys.has(key)) {
        throw new BadRequestException(
          `Duplicate project member found for user ${member.userId} and type ${member.memberType}.`,
        );
      }

      uniqueKeys.add(key);
    }

    return normalized;
  }

  private buildListWhere(query: ProjectListQuery, actor: AuthenticatedUser): Prisma.ProjectWhereInput {
    const andConditions: Prisma.ProjectWhereInput[] = [];
    const visibleWhere = this.buildVisibleProjectWhere(actor);

    if (Object.keys(visibleWhere).length > 0) {
      andConditions.push(visibleWhere);
    }

    if (query.keyword) {
      andConditions.push({
        OR: [
          { code: { contains: query.keyword, mode: 'insensitive' } },
          { name: { contains: query.keyword, mode: 'insensitive' } },
          {
            colors: {
              some: {
                OR: [
                  { name: { contains: query.keyword, mode: 'insensitive' } },
                  { code: { contains: query.keyword, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      });
    }

    if (query.status) {
      andConditions.push({ status: query.status });
    }

    if (query.currentNodeCode) {
      andConditions.push({ currentNodeCode: query.currentNodeCode });
    }

    if (query.ownerUserId) {
      andConditions.push({ ownerUserId: query.ownerUserId });
    }

    if (query.ownerDepartmentId) {
      andConditions.push({
        OR: [
          { owningDepartmentId: query.ownerDepartmentId },
          {
            ownerUser: {
              is: {
                departmentId: query.ownerDepartmentId,
              },
            },
          },
        ],
      });
    }

    if (query.priority) {
      andConditions.push({ priority: query.priority });
    }

    if (query.isOverdue !== undefined) {
      const overdueWhere: Prisma.ProjectWhereInput = {
        workflowTasks: {
          some: {
            isActive: true,
            dueAt: {
              lt: new Date(),
            },
            status: {
              in: [
                WorkflowTaskStatus.PENDING,
                WorkflowTaskStatus.READY,
                WorkflowTaskStatus.IN_PROGRESS,
                WorkflowTaskStatus.RETURNED,
              ],
            },
          },
        },
      };

      andConditions.push(query.isOverdue ? overdueWhere : { NOT: overdueWhere });
    }

    if (query.dateFrom) {
      andConditions.push({
        OR: [
          { plannedEndDate: null },
          { plannedEndDate: { gte: query.dateFrom } },
        ],
      });
    }

    if (query.dateTo) {
      andConditions.push({
        OR: [
          { plannedStartDate: null },
          { plannedStartDate: { lte: query.dateTo } },
        ],
      });
    }

    return andConditions.length > 0 ? { AND: andConditions } : {};
  }

  private buildVisibleProjectWhere(actor: AuthenticatedUser): Prisma.ProjectWhereInput {
    if (actor.isSystemAdmin || actor.roleCodes.includes('admin')) {
      return {};
    }

    const scopeWhere: Prisma.ProjectWhereInput[] = [
      {
        ownerUserId: actor.id,
      },
      {
        members: {
          some: {
            userId: actor.id,
          },
        },
      },
    ];

    if (actor.departmentId) {
      scopeWhere.push({
        owningDepartmentId: actor.departmentId,
      });
    }

    return {
      OR: scopeWhere,
    };
  }

  private async findProjectDetailOrThrow(db: ProjectDbClient, projectId: string) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        ownerUser: {
          include: {
            department: true,
          },
        },
        owningDepartment: true,
        members: {
          include: {
            user: {
              include: {
                department: true,
                userRoles: {
                  include: {
                    role: true,
                  },
                },
              },
            },
          },
          orderBy: [
            { isPrimary: 'desc' },
            { createdAt: 'asc' },
          ],
        },
        workflowInstances: {
          where: {
            status: WorkflowInstanceStatus.RUNNING,
          },
          orderBy: {
            versionNo: 'desc',
          },
          take: 1,
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    return project;
  }

  private async replaceMembersInTx(
    tx: Prisma.TransactionClient,
    input: {
      projectId: string;
      ownerUserId?: string | null;
      members: ProjectMemberInput[];
    },
  ) {
    const validatedMembers = await this.validateMembers(tx, input.members);
    const ensuredMembers = [...validatedMembers];

    if (input.ownerUserId) {
      const hasOwnerMember = ensuredMembers.some(
        (member) =>
          member.userId === input.ownerUserId && member.memberType === ProjectMemberType.OWNER,
      );

      if (!hasOwnerMember) {
        ensuredMembers.unshift({
          userId: input.ownerUserId,
          memberType: ProjectMemberType.OWNER,
          title: '项目负责人',
          isPrimary: true,
        });
      }
    }

    await tx.projectMember.deleteMany({
      where: {
        projectId: input.projectId,
      },
    });

    if (ensuredMembers.length > 0) {
      await tx.projectMember.createMany({
        data: ensuredMembers.map((member) => ({
          projectId: input.projectId,
          userId: member.userId,
          memberType: member.memberType,
          title: member.title,
          isPrimary: member.isPrimary,
        })),
      });
    }

    return tx.projectMember.findMany({
      where: {
        projectId: input.projectId,
      },
      include: {
        user: true,
      },
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'asc' },
      ],
    });
  }

  private async ensureOwnerMemberInTx(
    tx: Prisma.TransactionClient,
    projectId: string,
    ownerUserId: string,
  ) {
    const ownerMember = await tx.projectMember.findFirst({
      where: {
        projectId,
        userId: ownerUserId,
        memberType: ProjectMemberType.OWNER,
      },
    });

    if (ownerMember) {
      if (!ownerMember.isPrimary) {
        await tx.projectMember.update({
          where: {
            id: ownerMember.id,
          },
          data: {
            isPrimary: true,
            title: ownerMember.title ?? '项目负责人',
          },
        });
      }

      return;
    }

    await tx.projectMember.create({
      data: {
        projectId,
        userId: ownerUserId,
        memberType: ProjectMemberType.OWNER,
        title: '项目负责人',
        isPrimary: true,
      },
    });
  }

  private async validateMembers(tx: Prisma.TransactionClient, members: ProjectMemberInput[]) {
    if (members.length === 0) {
      return members;
    }

    const userIds = [...new Set(members.map((member) => member.userId))];
    const users = await tx.user.findMany({
      where: {
        id: {
          in: userIds,
        },
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    if (users.length !== userIds.length) {
      throw new BadRequestException('One or more project members do not exist or are inactive.');
    }

    return members;
  }

  private async findActiveUserOrThrow(tx: Prisma.TransactionClient, userId: string) {
    const user = await tx.user.findFirst({
      where: {
        id: userId,
        status: UserStatus.ACTIVE,
      },
    });

    if (!user) {
      throw new BadRequestException(`User ${userId} does not exist or is inactive.`);
    }

    return user;
  }

  private toProjectListItem(
    project: Prisma.ProjectGetPayload<{
      include: {
        ownerUser: {
          include: {
            department: true;
          };
        };
        owningDepartment: true;
        colors: {
          select: {
            name: true;
            code: true;
            isPrimary: true;
          };
        };
        workflowTasks: {
          select: {
            isActive: true;
            dueAt: true;
            status: true;
          };
        };
        _count: {
          select: {
            members: true;
            workflowTasks: true;
          };
        };
      };
    }>,
  ) {
    const riskLevel = this.computeRiskLevel(project);

    return {
      id: project.id,
      code: project.code,
      name: project.name,
      colorName: project.colors[0]?.name ?? null,
      colorCode: project.colors[0]?.code ?? null,
      status: project.status,
      priority: project.priority,
      currentNodeCode: project.currentNodeCode,
      currentNodeName: this.workflowsService.getCurrentNodeName(project.currentNodeCode),
      ownerUserId: project.ownerUserId,
      ownerName: project.ownerUser?.name ?? null,
      ownerDepartmentName: project.ownerUser?.department?.name ?? null,
      marketRegion: project.marketRegion,
      vehicleModel: project.vehicleModel,
      targetDate: this.serializeDate(project.plannedEndDate),
      riskLevel,
      isOverdue: project.workflowTasks.some((task) => this.isTaskOverdue(task, new Date())),
      progressPercent: this.computeProgressPercent(project.currentNodeCode),
      plannedStartDate: this.serializeDate(project.plannedStartDate),
      plannedEndDate: this.serializeDate(project.plannedEndDate),
      memberCount: project._count.members,
      updatedAt: project.updatedAt.toISOString(),
      createdAt: project.createdAt.toISOString(),
    };
  }

  private toProjectDetail(project: ProjectRecord) {
    const riskLevel = this.computeRiskLevel(project);
    const currentWorkflowInstance = project.workflowInstances[0] ?? null;

    return {
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description,
      status: project.status,
      priority: project.priority,
      riskLevel,
      currentNodeCode: project.currentNodeCode,
      currentNodeName: this.workflowsService.getCurrentNodeName(project.currentNodeCode),
      targetDate: this.serializeDate(project.plannedEndDate),
      marketRegion: project.marketRegion,
      vehicleModel: project.vehicleModel,
      ownerUserId: project.ownerUserId,
      ownerName: project.ownerUser?.name ?? null,
      owningDepartmentId: project.owningDepartmentId,
      owningDepartmentName: project.owningDepartment?.name ?? null,
      plannedStartDate: this.serializeDate(project.plannedStartDate),
      plannedEndDate: this.serializeDate(project.plannedEndDate),
      actualStartDate: this.serializeDate(project.actualStartDate),
      actualEndDate: this.serializeDate(project.actualEndDate),
      closedAt: this.serializeDate(project.closedAt),
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      memberCount: project._count.members,
      currentWorkflowInstance: currentWorkflowInstance
        ? {
            id: currentWorkflowInstance.id,
            instanceNo: currentWorkflowInstance.instanceNo,
            status: currentWorkflowInstance.status,
            versionNo: currentWorkflowInstance.versionNo,
            currentNodeCode: currentWorkflowInstance.currentNodeCode,
            currentNodeName: this.workflowsService.getCurrentNodeName(
              currentWorkflowInstance.currentNodeCode,
            ),
            startedAt: this.serializeDate(currentWorkflowInstance.startedAt),
          }
        : null,
      members: project.members.map((member) => ({
        id: member.id,
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        departmentName: member.user.department?.name ?? null,
        memberType: member.memberType,
        title: member.title,
        isPrimary: member.isPrimary,
        roleCodes: member.user.userRoles.map((userRole) => userRole.role.code),
        createdAt: member.createdAt.toISOString(),
      })),
    };
  }

  private toProjectStageOverviewTask(
    task: Prisma.WorkflowTaskGetPayload<{
      include: {
        assigneeUser: {
          select: {
            id: true;
            name: true;
          };
        };
        assigneeDepartment: {
          select: {
            id: true;
            name: true;
          };
        };
      };
    }>,
  ) {
    return {
      taskId: task.id,
      taskNo: task.taskNo,
      nodeCode: task.nodeCode,
      nodeName: task.nodeName,
      stepCode: task.stepCode,
      taskRound: task.taskRound,
      status: task.status,
      isPrimary: task.isPrimary,
      isActive: task.isActive,
      overdueDays: task.overdueDays,
      assigneeUserId: task.assigneeUserId,
      assigneeUserName: task.assigneeUser?.name ?? null,
      assigneeDepartmentId: task.assigneeDepartmentId,
      assigneeDepartmentName: task.assigneeDepartment?.name ?? null,
      dueAt: this.serializeDate(task.dueAt),
      effectiveDueAt: this.serializeDate(task.effectiveDueAt),
      startedAt: this.serializeDate(task.startedAt),
      completedAt: this.serializeDate(task.completedAt),
      returnedAt: this.serializeDate(task.returnedAt),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private getOrderedWorkflowNodeCodes() {
    return Object.values(WorkflowNodeCode).sort(
      (left, right) =>
        WORKFLOW_NODE_META_MAP[left].sequence - WORKFLOW_NODE_META_MAP[right].sequence,
    );
  }

  private getLatestTaskByNode<
    T extends {
      nodeCode: WorkflowNodeCode;
      taskRound: number;
      createdAt: Date;
    },
  >(tasks: T[]) {
    const result = new Map<WorkflowNodeCode, T>();

    for (const task of tasks) {
      const current = result.get(task.nodeCode);

      if (
        !current ||
        task.taskRound > current.taskRound ||
        (task.taskRound === current.taskRound && task.createdAt > current.createdAt)
      ) {
        result.set(task.nodeCode, task);
      }
    }

    return result;
  }

  private resolveTimelineStatus(
    nodeCode: WorkflowNodeCode,
    task:
      | {
          status: WorkflowTaskStatus;
          isActive: boolean;
          dueAt: Date | null;
        }
      | null,
    currentNodeCode: WorkflowNodeCode | null,
    now: Date,
  ) {
    if (task && this.isTaskOverdue(task, now)) {
      return 'OVERDUE';
    }

    if (task?.isActive && currentNodeCode === nodeCode) {
      return 'CURRENT';
    }

    if (!task) {
      return 'NOT_STARTED';
    }

    if (task.status === WorkflowTaskStatus.APPROVED || task.status === WorkflowTaskStatus.COMPLETED) {
      return 'COMPLETED';
    }

    if (task.status === WorkflowTaskStatus.REJECTED || task.status === WorkflowTaskStatus.RETURNED) {
      return 'RETURNED';
    }

    if (task.status === WorkflowTaskStatus.IN_PROGRESS) {
      return 'IN_PROGRESS';
    }

    return 'PENDING';
  }

  private isTaskOverdue(
    task: {
      dueAt: Date | null;
      isActive: boolean;
      status: WorkflowTaskStatus;
    },
    now: Date,
  ) {
    return (
      task.isActive &&
      task.dueAt !== null &&
      task.dueAt.getTime() < now.getTime() &&
      ([
        WorkflowTaskStatus.PENDING,
        WorkflowTaskStatus.READY,
        WorkflowTaskStatus.IN_PROGRESS,
        WorkflowTaskStatus.RETURNED,
      ] as WorkflowTaskStatus[]).includes(task.status)
    );
  }

  private getOverdueDays(dueAt: Date | null, now: Date) {
    if (!dueAt || dueAt.getTime() >= now.getTime()) {
      return 0;
    }

    return Math.max(1, Math.ceil((now.getTime() - dueAt.getTime()) / (24 * 60 * 60 * 1000)));
  }

  private computeProgressPercent(currentNodeCode: WorkflowNodeCode | null) {
    if (!currentNodeCode) {
      return 0;
    }

    const sequence = WORKFLOW_NODE_META_MAP[currentNodeCode].sequence;
    const maxSequence = Math.max(
      ...Object.values(WORKFLOW_NODE_META_MAP).map((meta) => meta.sequence),
    );

    return Math.min(100, Math.max(0, Math.round((sequence / maxSequence) * 100)));
  }

  private resolveNodeOutput(
    nodeCode: WorkflowNodeCode,
    task: {
      payload: Prisma.JsonValue | null;
    },
  ) {
    if (nodeCode === WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE) {
      return '颜色开发收费记录';
    }

    if (nodeCode === WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW) {
      return '整车色差一致性评审计划';
    }

    if (nodeCode === WorkflowNodeCode.PROJECT_CLOSED) {
      return '颜色退出记录';
    }

    if (task.payload && typeof task.payload === 'object') {
      return '节点表单与流程记录';
    }

    return '流程节点输出物';
  }

  private buildCabReviewGate(
    reviewRecords: Array<{
      reviewType: ReviewType;
      result: Prisma.ReviewRecordGetPayload<Record<string, never>>['result'];
      reviewedAt: Date | null;
      reviewRound: number;
    }>,
    tasks: Array<{
      nodeCode: WorkflowNodeCode;
      taskRound: number;
      returnedAt: Date | null;
      status: WorkflowTaskStatus;
      reviewPassAt: Date | null;
    }>,
  ) {
    const latestReview =
      reviewRecords.find((review) => review.reviewType === ReviewType.CAB_REVIEW) ?? null;
    const cabTasks = tasks.filter((task) => task.nodeCode === WorkflowNodeCode.CAB_REVIEW);
    const latestPassTask =
      cabTasks.find((task) => task.reviewPassAt !== null) ??
      cabTasks.find((task) => task.status === WorkflowTaskStatus.APPROVED) ??
      null;

    return {
      reviewConclusion: latestReview?.result ?? null,
      reviewPassAt:
        latestPassTask?.reviewPassAt?.toISOString() ??
        latestReview?.reviewedAt?.toISOString() ??
        null,
      returnRounds: Math.max(0, ...cabTasks.map((task) => task.taskRound - 1)),
    };
  }

  private buildMonthlyReviewSummary(
    recurringPlan:
      | Prisma.RecurringPlanGetPayload<{
          include: {
            tasks: true;
          };
        }>
      | null,
    now: Date,
  ) {
    if (!recurringPlan) {
      return {
        totalPeriods: 12,
        completedPeriods: 0,
        overduePeriods: 0,
        progressText: '尚未生成 12 个月度实例',
        currentMonthTask: null,
      };
    }

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const currentMonthTask =
      recurringPlan.tasks.find(
        (task) =>
          task.plannedDate.getTime() >= monthStart.getTime() &&
          task.plannedDate.getTime() < nextMonthStart.getTime(),
      ) ?? null;
    const completedPeriods = recurringPlan.tasks.filter(
      (task) => task.status === RecurringTaskStatus.COMPLETED,
    ).length;

    return {
      totalPeriods: recurringPlan.totalCount,
      completedPeriods,
      overduePeriods: recurringPlan.tasks.filter(
        (task) => task.status === RecurringTaskStatus.OVERDUE,
      ).length,
      progressText: `已完成 ${completedPeriods} / ${recurringPlan.totalCount}`,
      currentMonthTask: currentMonthTask
        ? {
            id: currentMonthTask.id,
            periodLabel: currentMonthTask.periodLabel,
            status: currentMonthTask.status,
            plannedDate: currentMonthTask.plannedDate.toISOString(),
          }
        : null,
    };
  }

  private buildColorExitSummary(
    record:
      | {
          annualOutput: number | null;
          exitThreshold: number | null;
          systemSuggestion: ColorExitSuggestion | null;
          finalDecision: ColorExitSuggestion | null;
          completedAt: Date | null;
        }
      | null,
  ) {
    if (!record) {
      return {
        annualOutput: null,
        exitThreshold: null,
        systemSuggestion: null,
        finalDecision: null,
        completedAt: null,
      };
    }

    return {
      annualOutput: record.annualOutput,
      exitThreshold: record.exitThreshold,
      systemSuggestion: record.systemSuggestion,
      finalDecision: record.finalDecision,
      completedAt: record.completedAt?.toISOString() ?? null,
    };
  }

  private computeRiskLevel(project: {
    status: ProjectStatus;
    priority: ProjectPriority;
    plannedEndDate: Date | null;
  }) {
    if (
      project.status === ProjectStatus.COMPLETED ||
      project.status === ProjectStatus.CANCELLED
    ) {
      return ProjectPriority.LOW;
    }

    if (project.status === ProjectStatus.ON_HOLD) {
      return ProjectPriority.HIGH;
    }

    if (!project.plannedEndDate) {
      return project.priority === ProjectPriority.CRITICAL
        ? ProjectPriority.HIGH
        : project.priority;
    }

    const diffInDays = Math.ceil(
      (project.plannedEndDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );

    if (diffInDays < 0) {
      return ProjectPriority.CRITICAL;
    }

    if (diffInDays <= 7) {
      return ProjectPriority.HIGH;
    }

    if (diffInDays <= 14) {
      return ProjectPriority.MEDIUM;
    }

    return project.priority === ProjectPriority.CRITICAL
      ? ProjectPriority.HIGH
      : project.priority;
  }

  private toProjectAuditSnapshot(project: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    status: ProjectStatus;
    priority: ProjectPriority;
    currentNodeCode: WorkflowNodeCode | null;
    owningDepartmentId: string | null;
    ownerUserId: string | null;
    marketRegion: string | null;
    vehicleModel: string | null;
    plannedStartDate: Date | null;
    plannedEndDate: Date | null;
    actualStartDate: Date | null;
    actualEndDate: Date | null;
  }) {
    return {
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description,
      status: project.status,
      priority: project.priority,
      currentNodeCode: project.currentNodeCode,
      owningDepartmentId: project.owningDepartmentId,
      ownerUserId: project.ownerUserId,
      marketRegion: project.marketRegion,
      vehicleModel: project.vehicleModel,
      plannedStartDate: this.serializeDate(project.plannedStartDate),
      plannedEndDate: this.serializeDate(project.plannedEndDate),
      actualStartDate: this.serializeDate(project.actualStartDate),
      actualEndDate: this.serializeDate(project.actualEndDate),
    };
  }

  private toMemberAuditSnapshot(
    members: Array<{
      userId: string;
      user: {
        name: string;
      };
      memberType: ProjectMemberType;
      title: string | null;
      isPrimary: boolean;
    }>,
  ) {
    return members.map((member) => ({
      userId: member.userId,
      userName: member.user.name,
      memberType: member.memberType,
      title: member.title,
      isPrimary: member.isPrimary,
    }));
  }

  private parsePositiveInt(
    rawValue: unknown,
    fallback: number,
    fieldName: string,
    maxValue = 200,
  ) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return fallback;
    }

    const value = Number(rawValue);

    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${fieldName} must be a positive integer.`);
    }

    return Math.min(value, maxValue);
  }

  private parseOptionalEnum<T extends string>(
    rawValue: unknown,
    candidates: readonly T[],
    fieldName: string,
  ) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return undefined;
    }

    if (typeof rawValue !== 'string' || !candidates.includes(rawValue as T)) {
      throw new BadRequestException(`${fieldName} is invalid.`);
    }

    return rawValue as T;
  }

  private parseRequiredString(rawValue: unknown, fieldName: string) {
    const value = this.parseOptionalString(rawValue);

    if (!value) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    return value;
  }

  private parseOptionalString(rawValue: unknown) {
    if (rawValue === undefined || rawValue === null) {
      return undefined;
    }

    if (typeof rawValue !== 'string') {
      throw new BadRequestException('Invalid string payload.');
    }

    const value = rawValue.trim();
    return value.length > 0 ? value : undefined;
  }

  private parseOptionalBoolean(rawValue: unknown) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return undefined;
    }

    if (rawValue === true || rawValue === 'true') {
      return true;
    }

    if (rawValue === false || rawValue === 'false') {
      return false;
    }

    throw new BadRequestException('Invalid boolean payload.');
  }

  private parseNullableString(rawValue: unknown): string | null;
  private parseNullableString(rawValue: unknown, keepUndefined: true): string | null | undefined;
  private parseNullableString(rawValue: unknown, keepUndefined = false) {
    if (rawValue === undefined) {
      return keepUndefined ? undefined : null;
    }

    if (rawValue === null) {
      return null;
    }

    if (typeof rawValue !== 'string') {
      throw new BadRequestException('Invalid string payload.');
    }

    const value = rawValue.trim();
    return value.length > 0 ? value : null;
  }

  private parseOptionalDate(rawValue: unknown, fieldName: string): Date | null;
  private parseOptionalDate(
    rawValue: unknown,
    fieldName: string,
    keepUndefined: true,
  ): Date | null | undefined;
  private parseOptionalDate(rawValue: unknown, fieldName: string, keepUndefined = false) {
    if (rawValue === undefined) {
      return keepUndefined ? undefined : null;
    }

    if (rawValue === null || rawValue === '') {
      return null;
    }

    if (typeof rawValue !== 'string') {
      throw new BadRequestException(`${fieldName} must be a valid ISO date string.`);
    }

    const date = new Date(rawValue);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid ISO date string.`);
    }

    return date;
  }

  private assertDateRange(
    plannedStartDate: Date | null | undefined,
    plannedEndDate: Date | null | undefined,
  ) {
    if (
      plannedStartDate &&
      plannedEndDate &&
      plannedStartDate.getTime() > plannedEndDate.getTime()
    ) {
      throw new BadRequestException(
        'plannedStartDate must be earlier than or equal to plannedEndDate.',
      );
    }
  }

  private asRecord(rawValue: unknown, message: string) {
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      throw new BadRequestException(message);
    }

    return rawValue as Record<string, unknown>;
  }

  private serializeDate(value: Date | null | undefined) {
    return value ? value.toISOString() : null;
  }
}
