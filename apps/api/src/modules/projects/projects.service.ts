import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  ProjectMemberType,
  ProjectPriority,
  ProjectStatus,
  UserStatus,
  WorkflowNodeCode,
  WorkflowInstanceStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { WorkflowsService } from '../workflows/workflows.service';

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
  status?: ProjectStatus;
  currentNodeCode?: WorkflowNodeCode;
  ownerUserId?: string;
  priority?: ProjectPriority;
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
  ) {}

  async listProjects(rawQuery: Record<string, string | undefined>) {
    const query = this.normalizeListQuery(rawQuery);
    const where = this.buildListWhere(query);

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
          _count: {
            select: {
              members: true,
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
        priority: query.priority ?? null,
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

  async getProjectDetail(projectId: string) {
    const project = await this.findProjectDetailOrThrow(this.prisma, projectId);

    return this.toProjectDetail(project);
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

  private normalizeListQuery(rawQuery: Record<string, string | undefined>): ProjectListQuery {
    const page = this.parsePositiveInt(rawQuery.page, 1, 'page');
    const pageSize = this.parsePositiveInt(rawQuery.pageSize, 10, 'pageSize', 50);
    const status = this.parseOptionalEnum(rawQuery.status, PROJECT_STATUS_VALUES, 'status');
    const currentNodeCode = this.parseOptionalEnum(
      rawQuery.currentNodeCode,
      WORKFLOW_NODE_VALUES,
      'currentNodeCode',
    );
    const ownerUserId = this.parseOptionalString(rawQuery.ownerUserId);
    const priority = this.parseOptionalEnum(
      rawQuery.priority,
      PROJECT_PRIORITY_VALUES,
      'priority',
    );
    const dateFrom = this.parseOptionalDate(rawQuery.dateFrom, 'dateFrom');
    const dateTo = this.parseOptionalDate(rawQuery.dateTo, 'dateTo');

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be earlier than or equal to dateTo.');
    }

    return {
      page,
      pageSize,
      ...(status ? { status } : {}),
      ...(currentNodeCode ? { currentNodeCode } : {}),
      ...(ownerUserId ? { ownerUserId } : {}),
      ...(priority ? { priority } : {}),
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

  private buildListWhere(query: ProjectListQuery): Prisma.ProjectWhereInput {
    const andConditions: Prisma.ProjectWhereInput[] = [];

    if (query.status) {
      andConditions.push({ status: query.status });
    }

    if (query.currentNodeCode) {
      andConditions.push({ currentNodeCode: query.currentNodeCode });
    }

    if (query.ownerUserId) {
      andConditions.push({ ownerUserId: query.ownerUserId });
    }

    if (query.priority) {
      andConditions.push({ priority: query.priority });
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
        _count: {
          select: {
            members: true;
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
