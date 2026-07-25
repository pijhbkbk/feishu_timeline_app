import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttachmentTargetType,
  AuditTargetType,
  Prisma,
  ProcessTemplateStatus,
  ProjectAssignmentSource,
  ProjectMemberType,
  ProjectStatus,
  TaskBlockerStatus,
  UserStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  buildR26AssignmentPreview,
  parseAssignmentSource,
  type R26DirectoryDepartment,
  type R26DirectoryUser,
  type R26NodeAssignmentConfig,
  type R26ProjectMemberRow,
} from '../r26-read-model/r26-assignment.resolver';
import { WorkflowDeadlineService } from '../workflows/workflow-deadline.service';
import {
  type AdminAssignmentChangeDto,
  type AdminAssignmentPreviewDto,
  type AdminBatchTaskChangeDto,
  type AdminBatchTaskPreviewDto,
  type AdminDictionaryChangeDto,
  type AdminLedgerQueryDto,
  type AdminOrganizationQueryDto,
  type AdminProjectBasicInfoDto,
  type AdminSavedViewDto,
  type AdminScheduleChangeDto,
  type AdminSchedulePreviewDto,
  type AdminTemplateVersionDto,
  type AdminTaskScheduleImportDto,
  type AdminTaskScheduleImportPreviewDto,
  type AdminUserStatusChangeDto,
} from './dto/admin-control-center.dto';

type AdminDbClient = Prisma.TransactionClient | PrismaService;

const IMMUTABLE_TASK_STATUSES = new Set<WorkflowTaskStatus>([
  WorkflowTaskStatus.APPROVED,
  WorkflowTaskStatus.REJECTED,
  WorkflowTaskStatus.RETURNED,
  WorkflowTaskStatus.COMPLETED,
  WorkflowTaskStatus.CANCELLED,
]);

const REVIEW_NODE_CODES = [
  WorkflowNodeCode.CAB_REVIEW,
  WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
  WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
];

const SPECIAL_LOCKED_NODE_CODES = new Set<WorkflowNodeCode>([
  WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
  WorkflowNodeCode.PAINT_PROCUREMENT,
  WorkflowNodeCode.PERFORMANCE_TEST,
  WorkflowNodeCode.CAB_REVIEW,
  WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE,
  WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
  WorkflowNodeCode.PROJECT_CLOSED,
]);

@Injectable()
export class AdminControlCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly deadlineService: WorkflowDeadlineService,
  ) {}

  async listProjects(query: AdminLedgerQueryDto) {
    const page = this.readPage(query.page);
    const pageSize = this.readPageSize(query.pageSize);
    const search = query.search?.trim();
    const where: Prisma.ProjectWhereInput = {
      ...(query.projectStatus ? { status: query.projectStatus } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              { vehicleModel: { contains: search, mode: 'insensitive' } },
              {
                colors: {
                  some: {
                    OR: [
                      { name: { contains: search, mode: 'insensitive' } },
                      { code: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const orderBy = this.projectOrderBy(query);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
        include: {
          ownerUser: { select: { id: true, name: true } },
          owningDepartment: { select: { id: true, name: true } },
          colors: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            take: 1,
            select: { id: true, name: true, code: true, status: true },
          },
          workflowTasks: {
            where: { isActive: true },
            include: {
              assigneeUser: { select: { id: true, name: true } },
              blockers: {
                where: { status: TaskBlockerStatus.OPEN },
                select: {
                  id: true,
                  description: true,
                  expectedResolvedAt: true,
                },
              },
            },
            orderBy: [{ updatedAt: 'desc' }],
          },
          _count: {
            select: {
              members: true,
              attachments: true,
              workflowTasks: true,
            },
          },
        },
      }),
    ]);

    return {
      dataSource: 'database',
      generatedAt: new Date().toISOString(),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: rows.map((project) => {
        const currentTask =
          project.workflowTasks.find(
            (task) => task.nodeCode === project.currentNodeCode,
          ) ??
          project.workflowTasks.find(
            (task) =>
              task.status === WorkflowTaskStatus.IN_PROGRESS ||
              task.status === WorkflowTaskStatus.READY,
          ) ??
          project.workflowTasks[0] ??
          null;
        const overdueCount = project.workflowTasks.filter(
          (task) => task.overdueDays > 0,
        ).length;
        const blockerCount = project.workflowTasks.reduce(
          (count, task) => count + task.blockers.length,
          0,
        );
        const completedCount = project.workflowTasks.filter(
          (task) => task.status === WorkflowTaskStatus.COMPLETED,
        ).length;
        const riskLevel =
          blockerCount > 0 || overdueCount > 0
            ? 'HIGH'
            : project.status === ProjectStatus.ON_HOLD
              ? 'MEDIUM'
              : 'NORMAL';

        return {
          id: project.id,
          code: project.code,
          name: project.name,
          vehicleModel: project.vehicleModel,
          color: project.colors[0] ?? null,
          owner: project.ownerUser,
          owningDepartment: project.owningDepartment,
          status: project.status,
          currentNodeCode: project.currentNodeCode,
          currentTask: currentTask
            ? {
                id: currentTask.id,
                stepCode: currentTask.stepCode,
                nodeName: currentTask.nodeName,
                status: currentTask.status,
                assignee: currentTask.assigneeUser,
                dueAt: this.iso(currentTask.effectiveDueAt ?? currentTask.dueAt),
              }
            : null,
          progress: {
            completed: completedCount,
            total: 18,
          },
          plannedStartDate: this.iso(project.plannedStartDate),
          plannedEndDate: this.iso(project.plannedEndDate),
          actualStartDate: this.iso(project.actualStartDate),
          actualEndDate: this.iso(project.actualEndDate),
          riskLevel,
          overdueCount,
          blockerCount,
          memberCount: project._count.members,
          materialCount: project._count.attachments,
          taskCount: project._count.workflowTasks,
          updatedAt: project.updatedAt.toISOString(),
          dataVersion: project.updatedAt.toISOString(),
          availableActions: ['EDIT_BASIC_INFO', 'OPEN_WORKSPACE', 'VIEW_AUDIT'],
        };
      }),
    };
  }

  async listTasks(query: AdminLedgerQueryDto) {
    const page = this.readPage(query.page);
    const pageSize = this.readPageSize(query.pageSize);
    const where = await this.buildTaskWhere(query);
    const orderBy = this.taskOrderBy(query);
    const [total, rows, definitions] = await Promise.all([
      this.prisma.workflowTask.count({ where }),
      this.prisma.workflowTask.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
        include: {
          project: {
            include: {
              ownerUser: { select: { id: true, name: true } },
              colors: {
                orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
                take: 1,
                select: { name: true, code: true },
              },
            },
          },
          assigneeUser: {
            include: { department: { select: { id: true, name: true } } },
          },
          assigneeDepartment: { select: { id: true, name: true } },
          blockers: {
            where: { status: TaskBlockerStatus.OPEN },
            select: {
              id: true,
              blockerType: true,
              description: true,
              expectedResolvedAt: true,
              impactLevel: true,
            },
          },
          progressUpdates: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              completionPercent: true,
              completedContent: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.workflowNodeDefinition.findMany({
        orderBy: { sequence: 'asc' },
      }),
    ]);
    const definitionByNode = new Map(
      definitions.map((definition) => [definition.nodeCode, definition]),
    );
    const taskIds = rows.map((row) => row.id);
    const attachments =
      taskIds.length > 0
        ? await this.prisma.attachment.groupBy({
            by: ['entityId'],
            where: {
              entityType: AttachmentTargetType.WORKFLOW_TASK,
              entityId: { in: taskIds },
              isDeleted: false,
            },
            _count: { _all: true },
          })
        : [];
    const attachmentCountByTask = new Map(
      attachments.map((item) => [item.entityId, item._count._all]),
    );

    return {
      dataSource: 'database',
      generatedAt: new Date().toISOString(),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: rows.map((task) => {
        const definition = definitionByNode.get(task.nodeCode);
        const requiredMaterials = this.readStringList(
          definition?.requiredAttachments,
        );
        const materialCompleted = attachmentCountByTask.get(task.id) ?? 0;
        const payload = this.readObject(task.payload);
        const assignmentSource =
          parseAssignmentSource(payload.assignmentSource) ??
          (task.assigneeUserId
            ? ProjectAssignmentSource.TASK_OVERRIDE
            : ProjectAssignmentSource.UNASSIGNED);
        const riskLevel =
          task.blockers.length > 0
            ? 'BLOCKED'
            : task.overdueDays > 0
              ? 'OVERDUE'
              : requiredMaterials.length > materialCompleted
                ? 'MATERIAL_MISSING'
                : 'NORMAL';

        return {
          id: task.id,
          project: {
            id: task.project.id,
            code: task.project.code,
            name: task.project.name,
            vehicleModel: task.project.vehicleModel,
            colorName: task.project.colors[0]?.name ?? null,
            colorCode: task.project.colors[0]?.code ?? null,
            status: task.project.status,
            owner: task.project.ownerUser,
          },
          stepCode: task.stepCode,
          stepNumber: definition?.sequence
            ? Math.round(definition.sequence / 10)
            : null,
          nodeCode: task.nodeCode,
          nodeName: task.nodeName,
          branchType: definition?.isBlocking === false ? 'NON_BLOCKING' : 'MAIN',
          workContent: definition?.description ?? null,
          requiredOutput: this.readString(payload.requiredOutput),
          requiredMaterials,
          materialProgress: {
            completed: materialCompleted,
            required: requiredMaterials.length,
          },
          predecessor: this.readStringList(payload.predecessorNodeCodes),
          autoTransitionRule: this.readString(payload.autoTransitionRule),
          plannedStartAt: this.readString(payload.plannedStartAt),
          plannedDueAt: this.iso(task.effectiveDueAt ?? task.dueAt),
          actualStartAt: this.iso(task.startedAt),
          actualCompletedAt: this.iso(task.completedAt),
          durationDays: definition?.durationValue ?? null,
          overdueDays: task.overdueDays,
          pauseDays: this.readNumber(payload.pauseDays) ?? 0,
          updatedAt: task.updatedAt.toISOString(),
          primaryDepartment: task.assigneeDepartment,
          collaboratorDepartmentIds: this.readStringList(
            payload.collaboratorDepartmentIds,
          ),
          assignee: task.assigneeUser
            ? {
                id: task.assigneeUser.id,
                name: task.assigneeUser.name,
                departmentId: task.assigneeUser.departmentId,
                departmentName: task.assigneeUser.department?.name ?? null,
              }
            : null,
          collaboratorUserIds: this.readStringList(payload.collaboratorUserIds),
          reviewerUserIds: this.readStringList(payload.reviewerUserIds),
          assignmentSource,
          status: task.status,
          riskLevel,
          blockers: task.blockers,
          needsAssistance: task.blockers.length > 0,
          expectedResolvedAt: this.iso(task.blockers[0]?.expectedResolvedAt),
          reviewRound: task.taskRound,
          monthlyProgress:
            task.nodeCode === WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW
              ? this.readString(payload.monthlyProgress) ?? '0/12'
              : null,
          parameterSource: {
            schedule: task.manualDueAt ? 'PROJECT_OVERRIDE' : 'TEMPLATE_DEFAULT',
            assignment:
              assignmentSource === ProjectAssignmentSource.TASK_OVERRIDE
                ? 'TASK_OVERRIDE'
                : 'SYSTEM_CALCULATED',
            history:
              IMMUTABLE_TASK_STATUSES.has(task.status)
                ? 'HISTORY_LOCKED'
                : null,
          },
          latestProgress: task.progressUpdates[0] ?? null,
          taskVersion: task.updatedAt.toISOString(),
          availableActions: this.taskAvailableActions(task.status),
        };
      }),
    };
  }

  async getOrganization(query: AdminOrganizationQueryDto) {
    const page = this.readPage(query.page);
    const pageSize = this.readPageSize(query.pageSize);
    const tab = query.tab ?? 'users';
    const search = query.search?.trim();

    if (tab === 'departments') {
      const where: Prisma.DepartmentWhereInput = search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {};
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.department.count({ where }),
        this.prisma.department.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            parent: { select: { id: true, name: true } },
            users: {
              where: { status: UserStatus.ACTIVE },
              select: { id: true, name: true, isSystemAdmin: true },
            },
            _count: {
              select: {
                assignedWorkflowTasks: true,
                projectNodeAssignments: true,
              },
            },
          },
        }),
      ]);
      return {
        tab,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        items: rows.map((department) => ({
          id: department.id,
          code: department.code,
          name: department.name,
          parent: department.parent,
          path: department.path,
          level: department.level,
          isActive: department.isActive,
          memberCount: department.users.length,
          departmentLead:
            department.users.find((user) => user.isSystemAdmin) ?? null,
          activeTaskCount: department._count.assignedWorkflowTasks,
          configuredNodeCount: department._count.projectNodeAssignments,
          dataVersion: department.updatedAt.toISOString(),
        })),
      };
    }

    if (tab === 'members') {
      const where: Prisma.ProjectMemberWhereInput = {
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(search
          ? {
              OR: [
                { project: { name: { contains: search, mode: 'insensitive' } } },
                { user: { name: { contains: search, mode: 'insensitive' } } },
                { title: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.projectMember.count({ where }),
        this.prisma.projectMember.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ updatedAt: 'desc' }],
          include: {
            project: { select: { id: true, code: true, name: true } },
            user: {
              include: { department: { select: { id: true, name: true } } },
            },
          },
        }),
      ]);
      const userProjectPairs = rows.map((row) => ({
        userId: row.userId,
        projectId: row.projectId,
      }));
      const taskCounts = await Promise.all(
        userProjectPairs.map((pair) =>
          this.prisma.workflowTask.count({
            where: {
              projectId: pair.projectId,
              assigneeUserId: pair.userId,
              isActive: true,
              status: {
                in: [
                  WorkflowTaskStatus.PENDING,
                  WorkflowTaskStatus.READY,
                  WorkflowTaskStatus.IN_PROGRESS,
                ],
              },
            },
          }),
        ),
      );
      return {
        tab,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        items: rows.map((row, index) => ({
          id: row.id,
          project: row.project,
          user: {
            id: row.user.id,
            name: row.user.name,
            department: row.user.department,
            status: row.user.status,
          },
          memberType: row.memberType,
          responsibility: row.title,
          isProjectOwner: row.memberType === ProjectMemberType.OWNER,
          isDepartmentLead:
            row.memberType === ProjectMemberType.MANAGER && row.isPrimary,
          isDefaultExecutor:
            row.memberType === ProjectMemberType.MEMBER && row.isPrimary,
          isReviewer: row.memberType === ProjectMemberType.REVIEWER,
          activeTaskCount: taskCounts[index] ?? 0,
          validFrom: row.createdAt.toISOString(),
          dataVersion: row.updatedAt.toISOString(),
        })),
      };
    }

    const where: Prisma.UserWhereInput = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { username: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { mobile: { contains: search, mode: 'insensitive' } },
              { feishuUserId: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        include: {
          department: { select: { id: true, code: true, name: true } },
          userRoles: {
            include: { role: { select: { id: true, code: true, name: true } } },
          },
          _count: {
            select: {
              projectMembers: true,
              assignedWorkflowTasks: true,
            },
          },
        },
      }),
    ]);
    return {
      tab,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: rows.map((user) => ({
        id: user.id,
        username: user.username,
        name: user.name,
        feishuUserId: user.feishuUserId,
        email: user.email,
        mobile: user.mobile,
        department: user.department,
        roles: user.userRoles.map((row) => row.role),
        status: user.status,
        canLogin: user.status === UserStatus.ACTIVE,
        projectCount: user._count.projectMembers,
        taskCount: user._count.assignedWorkflowTasks,
        lastLoginAt: null,
        isSystemAdmin: user.isSystemAdmin,
        dataVersion: user.updatedAt.toISOString(),
        availableActions: ['CHANGE_STATUS', 'VIEW_PROJECTS', 'VIEW_TASKS'],
      })),
    };
  }

  async getAssignments(projectId?: string) {
    const projects = await this.prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, code: true, name: true, updatedAt: true },
    });
    const selectedProjectId = projectId ?? projects[0]?.id ?? null;
    if (!selectedProjectId) {
      return {
        projects,
        selectedProjectId: null,
        projectVersion: null,
        items: [],
      };
    }
    const project = await this.prisma.project.findUnique({
      where: { id: selectedProjectId },
      include: {
        members: {
          include: {
            user: { include: { department: true } },
          },
        },
        nodeAssignments: true,
        workflowTasks: {
          orderBy: [{ taskRound: 'desc' }, { createdAt: 'desc' }],
          include: {
            assigneeUser: { include: { department: true } },
          },
        },
      },
    });
    if (!project) {
      throw new NotFoundException('项目不存在。');
    }
    const [departments, users, definitions] = await Promise.all([
      this.prisma.department.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { status: UserStatus.ACTIVE },
        include: { department: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.workflowNodeDefinition.findMany({
        orderBy: { sequence: 'asc' },
      }),
    ]);
    const memberRows: R26ProjectMemberRow[] = project.members.map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      departmentName: member.user.department?.name ?? null,
      memberType: member.memberType,
      title: member.title,
      isPrimary: member.isPrimary,
    }));
    const directoryDepartments: R26DirectoryDepartment[] = departments.map(
      (department) => ({
        id: department.id,
        code: department.code,
        name: department.name,
        path: department.path,
      }),
    );
    const directoryUsers: R26DirectoryUser[] = users.map((user) => ({
      id: user.id,
      name: user.name,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
    }));
    const assignmentByNode = new Map(
      project.nodeAssignments.map((assignment) => [
        assignment.nodeCode,
        {
          nodeCode: assignment.nodeCode,
          primaryDepartmentId: assignment.primaryDepartmentId,
          ownerUserId: assignment.ownerUserId,
          collaboratorUserIds: this.readStringList(
            assignment.collaboratorUserIds,
          ),
          reviewerUserIds: this.readStringList(assignment.reviewerUserIds),
          assignmentSource: assignment.assignmentSource,
        } satisfies R26NodeAssignmentConfig,
      ]),
    );
    const latestTaskByNode = new Map<WorkflowNodeCode, (typeof project.workflowTasks)[number]>();
    for (const task of project.workflowTasks) {
      if (!latestTaskByNode.has(task.nodeCode)) {
        latestTaskByNode.set(task.nodeCode, task);
      }
    }

    return {
      projects,
      selectedProjectId,
      projectVersion: project.memberAssignmentVersion,
      items: definitions.map((definition) => {
        const task = latestTaskByNode.get(definition.nodeCode) ?? null;
        return buildR26AssignmentPreview({
          nodeCode: definition.nodeCode,
          task: task
            ? {
                id: task.id,
                nodeName: task.nodeName,
                status: task.status,
                isActive: task.isActive,
                assigneeUserId: task.assigneeUserId,
                assigneeDepartmentId: task.assigneeDepartmentId,
                assignmentSource: parseAssignmentSource(
                  this.readObject(task.payload).assignmentSource,
                ),
                assigneeUser: task.assigneeUser,
              }
            : null,
          nodeAssignment: assignmentByNode.get(definition.nodeCode) ?? null,
          projectMembers: memberRows,
          departments: directoryDepartments,
          users: directoryUsers,
        });
      }),
    };
  }

  async getPermissions() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        rolePermissions: {
          orderBy: { permissionCode: 'asc' },
        },
        _count: { select: { userRoles: true } },
      },
    });
    const actions = [
      ['project.read', '查看项目'],
      ['project.write', '编辑项目'],
      ['project.member.manage', '管理成员'],
      ['task.progress.write', '提交进展'],
      ['workflow.transition', '完成工序'],
      ['review.write', '评审'],
      ['fee.write', '财务确认'],
      ['color.exit', '退出决定'],
      ['system.manage', '后台管理'],
      ['audit.read', '读取审计'],
    ] as const;

    return {
      actions: actions.map(([code, label]) => ({ code, label })),
      roles: roles.map((role) => {
        const permissionCodes = new Set(
          role.rolePermissions.map((permission) => permission.permissionCode),
        );
        return {
          id: role.id,
          code: role.code,
          name: role.name,
          description: role.description,
          status: role.status,
          isSystem: role.isSystem,
          userCount: role._count.userRoles,
          permissions: actions.map(([code, label]) => ({
            code,
            label,
            granted: role.code === 'admin' || permissionCodes.has(code),
            scope:
              role.code === 'admin'
                ? 'ALL'
                : permissionCodes.has(code)
                  ? 'ROLE'
                  : 'NONE',
          })),
          dataVersion: role.updatedAt.toISOString(),
          locked: role.isSystem,
        };
      }),
      enforcement: {
        backendRequired: true,
        frontendOnlyDenied: true,
      },
    };
  }

  async getWorkflowTemplates() {
    const [templates, definitions] = await Promise.all([
      this.prisma.processTemplate.findMany({
        orderBy: [{ code: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.workflowNodeDefinition.findMany({
        orderBy: { sequence: 'asc' },
      }),
    ]);
    return {
      templates: templates.map((template) => {
        const metadata = this.readObject(template.metadata);
        return {
          id: template.id,
          code: template.code,
          version: template.version,
          name: template.name,
          description: template.description,
          status: template.status,
          isDefault: template.isDefault,
          effectiveAt: this.readString(metadata.effectiveAt),
          createdAt: template.createdAt.toISOString(),
          dataVersion: template.updatedAt.toISOString(),
        };
      }),
      nodes: definitions.map((definition) => ({
        id: definition.id,
        step: Math.round(definition.sequence / 10),
        stepCode: definition.stepCode,
        nodeCode: definition.nodeCode,
        name: definition.name,
        durationType: definition.durationType,
        durationValue: definition.durationValue,
        isMain: definition.isBlocking,
        isBlocking: definition.isBlocking,
        isReviewNode: definition.isReviewNode,
        allowManualDueAt: definition.allowManualDueAt,
        requiredOutput: this.readString(
          this.readObject(definition.formSchema).requiredOutput,
        ),
        requiredMaterials: this.readStringList(
          definition.requiredAttachments,
        ),
        defaultChargeAmount: definition.defaultChargeAmount?.toString() ?? null,
        lockedRule: SPECIAL_LOCKED_NODE_CODES.has(definition.nodeCode),
        lockReason: SPECIAL_LOCKED_NODE_CODES.has(definition.nodeCode)
          ? '特殊拓扑或业务门禁由服务端状态机锁定，不能在表格中直接改写。'
          : null,
        isActive: definition.isActive,
        dataVersion: definition.updatedAt.toISOString(),
      })),
    };
  }

  async getDictionaries() {
    const [items, parameters] = await Promise.all([
      this.prisma.systemEnumItem.findMany({
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
      }),
      this.prisma.systemParameter.findMany({
        orderBy: [{ category: 'asc' }, { code: 'asc' }],
      }),
    ]);
    const groups = new Map<string, typeof items>();
    for (const item of items) {
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    }
    return {
      categories: [...groups.entries()].map(([category, categoryItems]) => ({
        category,
        items: categoryItems.map((item) => ({
          id: item.id,
          code: item.code,
          name: item.name,
          sortOrder: item.sortOrder,
          isActive: item.isActive,
          metadata: item.metadata,
          locked: this.isSystemDictionaryItem(item.category, item.code),
          dataVersion: item.updatedAt.toISOString(),
        })),
      })),
      parameters: parameters.map((parameter) => ({
        id: parameter.id,
        category: parameter.category,
        code: parameter.code,
        valueType: parameter.valueType,
        value:
          parameter.valueText ??
          parameter.valueNumber?.toString() ??
          parameter.valueBoolean ??
          parameter.valueJson,
        description: parameter.description,
        isActive: parameter.isActive,
        locked:
          parameter.code === 'FIXED_DEVELOPMENT_FEE' ||
          parameter.valueNumber?.toString() === '10000',
        dataVersion: parameter.updatedAt.toISOString(),
      })),
    };
  }

  getSavedViews(pageKey: string, actor: AuthenticatedUser) {
    return this.prisma.adminSavedView.findMany({
      where: { userId: actor.id, pageKey },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async saveView(input: AdminSavedViewDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.adminSavedView.findUnique({
      where: {
        userId_pageKey_name: {
          userId: actor.id,
          pageKey: input.pageKey,
          name: input.name,
        },
      },
    });
    if (
      existing &&
      input.expectedVersion !== undefined &&
      existing.version !== input.expectedVersion
    ) {
      throw new ConflictException({
        code: 'STALE_SAVED_VIEW',
        message: '保存视图已被其他会话更新，请刷新后重试。',
        currentVersion: existing.version,
      });
    }
    return this.prisma.adminSavedView.upsert({
      where: {
        userId_pageKey_name: {
          userId: actor.id,
          pageKey: input.pageKey,
          name: input.name,
        },
      },
      create: {
        userId: actor.id,
        pageKey: input.pageKey,
        name: input.name,
        config: input.config as Prisma.InputJsonValue,
      },
      update: {
        config: input.config as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
  }

  async previewScheduleChange(
    taskId: string,
    input: AdminSchedulePreviewDto,
  ) {
    return this.buildSchedulePreview(this.prisma, taskId, input);
  }

  async changeSchedule(
    taskId: string,
    input: AdminScheduleChangeDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    if (!input.acknowledgedConsequences) {
      throw new BadRequestException('必须确认已阅读日期调整影响。');
    }
    return this.executeAdminCommand({
      projectId: null,
      action: 'ADMIN_TASK_SCHEDULE_CHANGED',
      input,
      actor,
      execute: async (tx) => {
        const preview = await this.buildSchedulePreview(tx, taskId, input);
        if (!preview.canApply) {
          throw new ConflictException({
            code: 'SCHEDULE_CHANGE_BLOCKED',
            message: '当前日期调整不满足执行条件。',
            reasons: preview.blockingReasons,
          });
        }
        const task = await tx.workflowTask.findUnique({
          where: { id: taskId },
          include: { project: true },
        });
        if (!task) {
          throw new NotFoundException('工序任务不存在。');
        }
        this.assertDateVersion(task.updatedAt, input.taskVersion, '工序');
        const newDueAt = new Date(input.plannedDueAt);
        const oldDueAt = task.effectiveDueAt ?? task.dueAt;
        const deltaMs = oldDueAt
          ? newDueAt.getTime() - oldDueAt.getTime()
          : 0;
        const payload = this.mergeJson(task.payload, {
          plannedStartAt: input.plannedStartAt ?? null,
          scheduleChangeReason: input.reason.trim(),
          scheduleChangeRequestId: requestId,
          scheduleSource: 'PROJECT_OVERRIDE',
        });
        const updated = await tx.workflowTask.update({
          where: { id: taskId },
          data: {
            manualDueAt: newDueAt,
            effectiveDueAt: newDueAt,
            overdueDays: this.deadlineService.getOverdueDays(newDueAt),
            payload,
          },
        });
        const shiftedTasks: Array<{
          id: string;
          beforeDueAt: string | null;
          afterDueAt: string | null;
        }> = [];
        if (
          input.scope === 'CURRENT_PROJECT_FUTURE_TASKS' &&
          deltaMs !== 0
        ) {
          const downstream = await tx.workflowTask.findMany({
            where: {
              projectId: task.projectId,
              isActive: true,
              status: {
                in: [
                  WorkflowTaskStatus.PENDING,
                  WorkflowTaskStatus.READY,
                ],
              },
              id: { not: task.id },
            },
          });
          const currentSequence =
            (
              await tx.workflowNodeDefinition.findUnique({
                where: { nodeCode: task.nodeCode },
                select: { sequence: true },
              })
            )?.sequence ?? 0;
          const downstreamCodes = new Set(
            (
              await tx.workflowNodeDefinition.findMany({
                where: { sequence: { gt: currentSequence } },
                select: { nodeCode: true },
              })
            ).map((definition) => definition.nodeCode),
          );
          for (const downstreamTask of downstream.filter((item) =>
            downstreamCodes.has(item.nodeCode),
          )) {
            const beforeDueAt =
              downstreamTask.effectiveDueAt ?? downstreamTask.dueAt;
            if (!beforeDueAt) {
              continue;
            }
            const afterDueAt = new Date(beforeDueAt.getTime() + deltaMs);
            await tx.workflowTask.update({
              where: { id: downstreamTask.id },
              data: {
                dueAt: downstreamTask.manualDueAt
                  ? downstreamTask.dueAt
                  : afterDueAt,
                effectiveDueAt: downstreamTask.manualDueAt
                  ? downstreamTask.manualDueAt
                  : afterDueAt,
                overdueDays: this.deadlineService.getOverdueDays(
                  downstreamTask.manualDueAt ?? afterDueAt,
                ),
              },
            });
            shiftedTasks.push({
              id: downstreamTask.id,
              beforeDueAt: beforeDueAt.toISOString(),
              afterDueAt: afterDueAt.toISOString(),
            });
          }
          if (task.project.plannedEndDate) {
            await tx.project.update({
              where: { id: task.projectId },
              data: {
                plannedEndDate: new Date(
                  task.project.plannedEndDate.getTime() + deltaMs,
                ),
              },
            });
          }
        }
        const audit = await this.activityLogsService.createWithExecutor(tx, {
          projectId: task.projectId,
          actorUserId: actor.id,
          targetType: AuditTargetType.WORKFLOW_TASK,
          targetId: task.id,
          action: 'ADMIN_TASK_SCHEDULE_CHANGED',
          nodeCode: task.nodeCode,
          summary: `调整工序 ${task.nodeName} 的计划日期`,
          beforeData: {
            effectiveDueAt: this.iso(oldDueAt),
            manualDueAt: this.iso(task.manualDueAt),
          },
          afterData: {
            effectiveDueAt: updated.effectiveDueAt?.toISOString() ?? null,
            scope: input.scope,
            shiftedTasks,
          },
          metadata: {
            requestId,
            idempotencyKey: input.idempotencyKey,
            reason: input.reason.trim(),
            result: 'SUCCESS',
          },
        });
        return {
          projectId: task.projectId,
          taskId: task.id,
          taskVersion: updated.updatedAt.toISOString(),
          shiftedTaskIds: shiftedTasks.map((item) => item.id),
          auditLogIds: [audit.id],
        };
      },
    });
  }

  async previewAssignmentChange(
    taskId: string,
    input: AdminAssignmentPreviewDto,
  ) {
    return this.buildAssignmentPreview(this.prisma, taskId, input);
  }

  async changeAssignment(
    taskId: string,
    input: AdminAssignmentChangeDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    if (!input.acknowledgedConsequences) {
      throw new BadRequestException('必须确认已阅读人员与部门调整影响。');
    }
    return this.executeAdminCommand({
      projectId: null,
      action: 'ADMIN_TASK_ASSIGNMENT_CHANGED',
      input,
      actor,
      execute: async (tx) => {
        const preview = await this.buildAssignmentPreview(tx, taskId, input);
        if (!preview.canApply) {
          throw new ConflictException({
            code: 'ASSIGNMENT_CHANGE_BLOCKED',
            message: '当前分配调整不满足执行条件。',
            reasons: preview.blockingReasons,
          });
        }
        const task = await tx.workflowTask.findUnique({
          where: { id: taskId },
        });
        if (!task) {
          throw new NotFoundException('工序任务不存在。');
        }
        this.assertDateVersion(task.updatedAt, input.taskVersion, '工序');
        const selectedOwnerId = preview.proposed.owner?.id ?? null;
        const selectedDepartmentId =
          preview.proposed.primaryDepartment?.id ?? null;
        const assignmentSource = input.ownerUserId
          ? ProjectAssignmentSource.TASK_OVERRIDE
          : preview.proposed.assignmentSource;
        const updated = await tx.workflowTask.update({
          where: { id: task.id },
          data: {
            assigneeUserId: selectedOwnerId,
            assigneeDepartmentId: selectedDepartmentId,
            payload: this.mergeJson(task.payload, {
              assignmentSource,
              collaboratorUserIds: input.collaboratorUserIds ?? [],
              reviewerUserIds: input.reviewerUserIds ?? [],
              assignmentReason: input.reason.trim(),
              assignmentRequestId: requestId,
            }),
          },
        });
        await tx.projectNodeAssignment.upsert({
          where: {
            projectId_nodeCode: {
              projectId: task.projectId,
              nodeCode: task.nodeCode,
            },
          },
          create: {
            projectId: task.projectId,
            nodeCode: task.nodeCode,
            primaryDepartmentId: selectedDepartmentId,
            ownerUserId: selectedOwnerId,
            collaboratorUserIds: input.collaboratorUserIds ?? [],
            reviewerUserIds: input.reviewerUserIds ?? [],
            assignmentSource,
            updatedById: actor.id,
          },
          update: {
            primaryDepartmentId: selectedDepartmentId,
            ownerUserId: selectedOwnerId,
            collaboratorUserIds: input.collaboratorUserIds ?? [],
            reviewerUserIds: input.reviewerUserIds ?? [],
            assignmentSource,
            updatedById: actor.id,
            version: { increment: 1 },
          },
        });
        const audit = await this.activityLogsService.createWithExecutor(tx, {
          projectId: task.projectId,
          actorUserId: actor.id,
          targetType: AuditTargetType.WORKFLOW_TASK,
          targetId: task.id,
          action: 'ADMIN_TASK_ASSIGNMENT_CHANGED',
          nodeCode: task.nodeCode,
          summary: `调整工序 ${task.nodeName} 的负责人和部门`,
          beforeData: {
            assigneeUserId: task.assigneeUserId,
            assigneeDepartmentId: task.assigneeDepartmentId,
          },
          afterData: {
            assigneeUserId: updated.assigneeUserId,
            assigneeDepartmentId: updated.assigneeDepartmentId,
            assignmentSource,
            collaboratorUserIds: input.collaboratorUserIds ?? [],
            reviewerUserIds: input.reviewerUserIds ?? [],
          },
          metadata: {
            requestId,
            idempotencyKey: input.idempotencyKey,
            reason: input.reason.trim(),
            result: 'SUCCESS',
          },
        });
        return {
          projectId: task.projectId,
          taskId: task.id,
          taskVersion: updated.updatedAt.toISOString(),
          assignmentSource,
          auditLogIds: [audit.id],
        };
      },
    });
  }

  async previewBatchTaskChanges(input: AdminBatchTaskPreviewDto) {
    if (input.operation === 'SCHEDULE' && !input.plannedDueAt) {
      throw new BadRequestException('批量调整计划必须提供新的截止时间。');
    }
    const items: Array<{
      taskId: string;
      canApply: boolean;
      blockingReasons: string[];
      preview: Record<string, unknown> | null;
    }> = [];
    for (const row of input.tasks) {
      try {
        const preview =
          input.operation === 'SCHEDULE'
            ? await this.buildSchedulePreview(this.prisma, row.taskId, {
                taskVersion: row.taskVersion,
                plannedDueAt: input.plannedDueAt!,
                scope: 'CURRENT_TASK_ONLY',
                reason: input.reason,
              })
            : await this.buildAssignmentPreview(this.prisma, row.taskId, {
                taskVersion: row.taskVersion,
                ...(input.primaryDepartmentId
                  ? { primaryDepartmentId: input.primaryDepartmentId }
                  : {}),
                ...(input.ownerUserId
                  ? { ownerUserId: input.ownerUserId }
                  : {}),
                reason: input.reason,
                confirmInProgress: true,
              });
        items.push({
          taskId: row.taskId,
          canApply: preview.canApply,
          blockingReasons: preview.blockingReasons,
          preview: preview as unknown as Record<string, unknown>,
        });
      } catch (error) {
        items.push({
          taskId: row.taskId,
          canApply: false,
          blockingReasons: [this.readExceptionMessage(error)],
          preview: null,
        });
      }
    }
    const applicableCount = items.filter((item) => item.canApply).length;
    return {
      canApply: applicableCount === items.length,
      operation: input.operation,
      total: items.length,
      applicableCount,
      rejectedCount: items.length - applicableCount,
      items,
      writePerformed: false,
    };
  }

  async applyBatchTaskChanges(
    input: AdminBatchTaskChangeDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    if (!input.acknowledgedConsequences) {
      throw new BadRequestException('必须确认已阅读批量修改影响。');
    }
    if (input.operation === 'SCHEDULE' && !input.plannedDueAt) {
      throw new BadRequestException('批量调整计划必须提供新的截止时间。');
    }
    return this.executeAdminCommand({
      projectId: null,
      action: `ADMIN_TASK_BATCH_${input.operation}_CHANGED`,
      input,
      actor,
      execute: async (tx) => {
        const previewItems: Array<{
          row: (typeof input.tasks)[number];
          preview: Record<string, unknown>;
        }> = [];
        for (const row of input.tasks) {
          const preview =
            input.operation === 'SCHEDULE'
              ? await this.buildSchedulePreview(tx, row.taskId, {
                  taskVersion: row.taskVersion,
                  plannedDueAt: input.plannedDueAt!,
                  scope: 'CURRENT_TASK_ONLY',
                  reason: input.reason,
                })
              : await this.buildAssignmentPreview(tx, row.taskId, {
                  taskVersion: row.taskVersion,
                  ...(input.primaryDepartmentId
                    ? { primaryDepartmentId: input.primaryDepartmentId }
                    : {}),
                  ...(input.ownerUserId
                    ? { ownerUserId: input.ownerUserId }
                    : {}),
                  reason: input.reason,
                  confirmInProgress: true,
                });
          if (!preview.canApply) {
            throw new ConflictException({
              code: 'BATCH_CHANGE_BLOCKED',
              message: '批量修改包含不可变更工序，未写入任何数据。',
              taskId: row.taskId,
              reasons: preview.blockingReasons,
            });
          }
          previewItems.push({
            row,
            preview: preview as unknown as Record<string, unknown>,
          });
        }

        const results: Array<Record<string, unknown>> = [];
        const auditLogIds: string[] = [];
        for (const item of previewItems) {
          const task = await tx.workflowTask.findUnique({
            where: { id: item.row.taskId },
          });
          if (!task) {
            throw new NotFoundException('工序任务不存在。');
          }
          this.assertDateVersion(task.updatedAt, item.row.taskVersion, '工序');
          if (input.operation === 'SCHEDULE') {
            const newDueAt = new Date(input.plannedDueAt!);
            const beforeDueAt = task.effectiveDueAt ?? task.dueAt;
            const updated = await tx.workflowTask.update({
              where: { id: task.id },
              data: {
                manualDueAt: newDueAt,
                effectiveDueAt: newDueAt,
                overdueDays: this.deadlineService.getOverdueDays(newDueAt),
                payload: this.mergeJson(task.payload, {
                  scheduleChangeReason: input.reason.trim(),
                  scheduleChangeRequestId: requestId,
                  scheduleSource: 'PROJECT_OVERRIDE',
                }),
              },
            });
            const audit =
              await this.activityLogsService.createWithExecutor(tx, {
                projectId: task.projectId,
                actorUserId: actor.id,
                targetType: AuditTargetType.WORKFLOW_TASK,
                targetId: task.id,
                action: 'ADMIN_TASK_BATCH_SCHEDULE_CHANGED',
                nodeCode: task.nodeCode,
                summary: `批量调整工序 ${task.nodeName} 的计划截止时间`,
                beforeData: { effectiveDueAt: this.iso(beforeDueAt) },
                afterData: {
                  effectiveDueAt: updated.effectiveDueAt?.toISOString() ?? null,
                },
                metadata: {
                  requestId,
                  idempotencyKey: input.idempotencyKey,
                  reason: input.reason.trim(),
                  result: 'SUCCESS',
                },
              });
            auditLogIds.push(audit.id);
            results.push({
              taskId: task.id,
              projectId: task.projectId,
              taskVersion: updated.updatedAt.toISOString(),
            });
          } else {
            const assignmentPreview = item.preview as unknown as Awaited<
              ReturnType<typeof this.buildAssignmentPreview>
            >;
            const ownerId = assignmentPreview.proposed.owner?.id ?? null;
            const departmentId =
              assignmentPreview.proposed.primaryDepartment?.id ?? null;
            const assignmentSource = input.ownerUserId
              ? ProjectAssignmentSource.TASK_OVERRIDE
              : assignmentPreview.proposed.assignmentSource;
            const updated = await tx.workflowTask.update({
              where: { id: task.id },
              data: {
                assigneeUserId: ownerId,
                assigneeDepartmentId: departmentId,
                payload: this.mergeJson(task.payload, {
                  assignmentSource,
                  assignmentReason: input.reason.trim(),
                  assignmentRequestId: requestId,
                }),
              },
            });
            await tx.projectNodeAssignment.upsert({
              where: {
                projectId_nodeCode: {
                  projectId: task.projectId,
                  nodeCode: task.nodeCode,
                },
              },
              create: {
                projectId: task.projectId,
                nodeCode: task.nodeCode,
                primaryDepartmentId: departmentId,
                ownerUserId: ownerId,
                collaboratorUserIds: [],
                reviewerUserIds: [],
                assignmentSource,
                updatedById: actor.id,
              },
              update: {
                primaryDepartmentId: departmentId,
                ownerUserId: ownerId,
                assignmentSource,
                updatedById: actor.id,
                version: { increment: 1 },
              },
            });
            const audit =
              await this.activityLogsService.createWithExecutor(tx, {
                projectId: task.projectId,
                actorUserId: actor.id,
                targetType: AuditTargetType.WORKFLOW_TASK,
                targetId: task.id,
                action: 'ADMIN_TASK_BATCH_ASSIGNMENT_CHANGED',
                nodeCode: task.nodeCode,
                summary: `批量调整工序 ${task.nodeName} 的负责人`,
                beforeData: {
                  assigneeUserId: task.assigneeUserId,
                  assigneeDepartmentId: task.assigneeDepartmentId,
                },
                afterData: {
                  assigneeUserId: updated.assigneeUserId,
                  assigneeDepartmentId: updated.assigneeDepartmentId,
                  assignmentSource,
                },
                metadata: {
                  requestId,
                  idempotencyKey: input.idempotencyKey,
                  reason: input.reason.trim(),
                  result: 'SUCCESS',
                },
              });
            auditLogIds.push(audit.id);
            results.push({
              taskId: task.id,
              projectId: task.projectId,
              taskVersion: updated.updatedAt.toISOString(),
              assignmentSource,
            });
          }
        }
        return {
          operation: input.operation,
          updatedCount: results.length,
          items: results,
          auditLogIds,
        };
      },
    });
  }

  getTaskScheduleImportTemplate() {
    return '\uFEFFtaskId,taskVersion,plannedDueAt\r\n';
  }

  async previewTaskScheduleImport(input: AdminTaskScheduleImportPreviewDto) {
    const parsed = this.parseTaskScheduleImport(input.csv);
    const items: Array<{
      rowNumber: number;
      taskId: string;
      canApply: boolean;
      blockingReasons: string[];
      projectName: string | null;
      nodeName: string | null;
      beforeDueAt: string | null;
      afterDueAt: string;
    }> = [];
    for (const row of parsed) {
      try {
        const preview = await this.buildSchedulePreview(
          this.prisma,
          row.taskId,
          {
            taskVersion: row.taskVersion,
            plannedDueAt: row.plannedDueAt,
            scope: 'CURRENT_TASK_ONLY',
            reason: input.reason,
          },
        );
        items.push({
          rowNumber: row.rowNumber,
          taskId: row.taskId,
          canApply: preview.canApply,
          blockingReasons: preview.blockingReasons,
          projectName: preview.task.projectName,
          nodeName: preview.task.nodeName,
          beforeDueAt: preview.before.plannedDueAt,
          afterDueAt: preview.after.plannedDueAt,
        });
      } catch (error) {
        items.push({
          rowNumber: row.rowNumber,
          taskId: row.taskId,
          canApply: false,
          blockingReasons: [this.readExceptionMessage(error)],
          projectName: null,
          nodeName: null,
          beforeDueAt: null,
          afterDueAt: row.plannedDueAt,
        });
      }
    }
    const applicableCount = items.filter((item) => item.canApply).length;
    return {
      canApply: applicableCount === items.length,
      total: items.length,
      applicableCount,
      rejectedCount: items.length - applicableCount,
      items,
      writePerformed: false,
    };
  }

  async applyTaskScheduleImport(
    input: AdminTaskScheduleImportDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    if (!input.acknowledgedConsequences) {
      throw new BadRequestException('必须确认已阅读导入影响。');
    }
    const rows = this.parseTaskScheduleImport(input.csv);
    return this.executeAdminCommand({
      projectId: null,
      action: 'ADMIN_TASK_SCHEDULE_IMPORT_APPLIED',
      input,
      actor,
      execute: async (tx) => {
        const previews = [];
        for (const row of rows) {
          const preview = await this.buildSchedulePreview(tx, row.taskId, {
            taskVersion: row.taskVersion,
            plannedDueAt: row.plannedDueAt,
            scope: 'CURRENT_TASK_ONLY',
            reason: input.reason,
          });
          if (!preview.canApply) {
            throw new ConflictException({
              code: 'IMPORT_ROW_BLOCKED',
              message: '导入文件包含不可变更工序，未写入任何数据。',
              rowNumber: row.rowNumber,
              taskId: row.taskId,
              reasons: preview.blockingReasons,
            });
          }
          previews.push({ row, preview });
        }
        const auditLogIds: string[] = [];
        const items = [];
        for (const { row } of previews) {
          const task = await tx.workflowTask.findUnique({
            where: { id: row.taskId },
          });
          if (!task) {
            throw new NotFoundException('工序任务不存在。');
          }
          this.assertDateVersion(task.updatedAt, row.taskVersion, '工序');
          const newDueAt = new Date(row.plannedDueAt);
          const beforeDueAt = task.effectiveDueAt ?? task.dueAt;
          const updated = await tx.workflowTask.update({
            where: { id: task.id },
            data: {
              manualDueAt: newDueAt,
              effectiveDueAt: newDueAt,
              overdueDays: this.deadlineService.getOverdueDays(newDueAt),
              payload: this.mergeJson(task.payload, {
                scheduleChangeReason: input.reason.trim(),
                scheduleChangeRequestId: requestId,
                scheduleSource: 'PROJECT_OVERRIDE',
                importedByAdmin: true,
              }),
            },
          });
          const audit =
            await this.activityLogsService.createWithExecutor(tx, {
              projectId: task.projectId,
              actorUserId: actor.id,
              targetType: AuditTargetType.WORKFLOW_TASK,
              targetId: task.id,
              action: 'ADMIN_TASK_SCHEDULE_IMPORTED',
              nodeCode: task.nodeCode,
              summary: `通过正式模板导入工序 ${task.nodeName} 的计划截止时间`,
              beforeData: { effectiveDueAt: this.iso(beforeDueAt) },
              afterData: {
                effectiveDueAt: updated.effectiveDueAt?.toISOString() ?? null,
              },
              metadata: {
                requestId,
                idempotencyKey: input.idempotencyKey,
                reason: input.reason.trim(),
                rowNumber: row.rowNumber,
                result: 'SUCCESS',
              },
            });
          auditLogIds.push(audit.id);
          items.push({
            taskId: task.id,
            projectId: task.projectId,
            taskVersion: updated.updatedAt.toISOString(),
          });
        }
        return {
          importedCount: items.length,
          items,
          auditLogIds,
        };
      },
    });
  }

  async updateProjectBasicInfo(
    projectId: string,
    input: AdminProjectBasicInfoDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    const allowedFields = [
      input.name,
      input.vehicleModel,
      input.description,
      input.colorName,
      input.plannedStartDate,
      input.plannedEndDate,
    ];
    if (allowedFields.every((value) => value === undefined)) {
      throw new BadRequestException('没有可保存的项目展示字段。');
    }
    return this.executeAdminCommand({
      projectId,
      action: 'ADMIN_PROJECT_BASIC_INFO_CHANGED',
      input,
      actor,
      execute: async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          include: {
            colors: {
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
              take: 1,
            },
          },
        });
        if (!project) {
          throw new NotFoundException('项目不存在。');
        }
        this.assertDateVersion(project.updatedAt, input.expectedVersion, '项目');
        const updated = await tx.project.update({
          where: { id: projectId },
          data: {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.vehicleModel !== undefined
              ? { vehicleModel: input.vehicleModel?.trim() || null }
              : {}),
            ...(input.description !== undefined
              ? { description: input.description?.trim() || null }
              : {}),
            ...(input.plannedStartDate !== undefined
              ? {
                  plannedStartDate: input.plannedStartDate
                    ? new Date(input.plannedStartDate)
                    : null,
                }
              : {}),
            ...(input.plannedEndDate !== undefined
              ? {
                  plannedEndDate: input.plannedEndDate
                    ? new Date(input.plannedEndDate)
                    : null,
                }
              : {}),
          },
        });
        if (input.colorName !== undefined && project.colors[0]) {
          await tx.color.update({
            where: { id: project.colors[0].id },
            data: { name: input.colorName?.trim() || project.colors[0].name },
          });
        }
        const audit = await this.activityLogsService.createWithExecutor(tx, {
          projectId,
          actorUserId: actor.id,
          targetType: AuditTargetType.PROJECT,
          targetId: projectId,
          action: 'ADMIN_PROJECT_BASIC_INFO_CHANGED',
          nodeCode: project.currentNodeCode,
          summary: `修改项目 ${project.name} 的展示信息`,
          beforeData: {
            name: project.name,
            vehicleModel: project.vehicleModel,
            description: project.description,
            colorName: project.colors[0]?.name ?? null,
            plannedStartDate: this.iso(project.plannedStartDate),
            plannedEndDate: this.iso(project.plannedEndDate),
          },
          afterData: {
            name: updated.name,
            vehicleModel: updated.vehicleModel,
            description: updated.description,
            colorName: input.colorName ?? project.colors[0]?.name ?? null,
            plannedStartDate: this.iso(updated.plannedStartDate),
            plannedEndDate: this.iso(updated.plannedEndDate),
          },
          metadata: {
            requestId,
            idempotencyKey: input.idempotencyKey,
            reason: input.reason.trim(),
            result: 'SUCCESS',
          },
        });
        return {
          projectId,
          projectVersion: updated.updatedAt.toISOString(),
          auditLogIds: [audit.id],
        };
      },
    });
  }

  async changeUserStatus(
    userId: string,
    input: AdminUserStatusChangeDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    if (userId === actor.id && input.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('不能停用当前正在操作的管理员账号。');
    }
    return this.executeAdminCommand({
      projectId: null,
      action: 'ADMIN_USER_STATUS_CHANGED',
      input,
      actor,
      execute: async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          throw new NotFoundException('用户不存在。');
        }
        this.assertDateVersion(user.updatedAt, input.expectedVersion, '用户');
        const updated = await tx.user.update({
          where: { id: userId },
          data: { status: input.status },
        });
        const audit = await this.activityLogsService.createWithExecutor(tx, {
          projectId: null,
          actorUserId: actor.id,
          targetType: AuditTargetType.USER,
          targetId: userId,
          action: 'ADMIN_USER_STATUS_CHANGED',
          summary: `将用户 ${user.name} 状态调整为 ${input.status}`,
          beforeData: { status: user.status },
          afterData: { status: updated.status },
          metadata: {
            requestId,
            idempotencyKey: input.idempotencyKey,
            reason: input.reason.trim(),
            result: 'SUCCESS',
          },
        });
        return {
          userId,
          status: updated.status,
          userVersion: updated.updatedAt.toISOString(),
          auditLogIds: [audit.id],
        };
      },
    });
  }

  async changeDictionaryItem(
    itemId: string,
    input: AdminDictionaryChangeDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    return this.executeAdminCommand({
      projectId: null,
      action: 'ADMIN_DICTIONARY_ITEM_CHANGED',
      input,
      actor,
      execute: async (tx) => {
        const item = await tx.systemEnumItem.findUnique({
          where: { id: itemId },
        });
        if (!item) {
          throw new NotFoundException('字典项不存在。');
        }
        if (this.isSystemDictionaryItem(item.category, item.code)) {
          throw new ConflictException({
            code: 'SYSTEM_DICTIONARY_ITEM_LOCKED',
            message: '系统保留字典项不可修改。',
          });
        }
        this.assertDateVersion(item.updatedAt, input.expectedVersion, '字典项');
        const updated = await tx.systemEnumItem.update({
          where: { id: item.id },
          data: {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.isActive !== undefined
              ? { isActive: input.isActive }
              : {}),
            ...(input.sortOrder !== undefined
              ? { sortOrder: input.sortOrder }
              : {}),
          },
        });
        const audit = await this.activityLogsService.createWithExecutor(tx, {
          projectId: null,
          actorUserId: actor.id,
          targetType: AuditTargetType.SYSTEM,
          targetId: item.id,
          action: 'ADMIN_DICTIONARY_ITEM_CHANGED',
          summary: `修改字典项 ${item.category}/${item.code}`,
          beforeData: {
            name: item.name,
            isActive: item.isActive,
            sortOrder: item.sortOrder,
          },
          afterData: {
            name: updated.name,
            isActive: updated.isActive,
            sortOrder: updated.sortOrder,
          },
          metadata: {
            requestId,
            idempotencyKey: input.idempotencyKey,
            reason: input.reason.trim(),
            result: 'SUCCESS',
          },
        });
        return {
          itemId,
          itemVersion: updated.updatedAt.toISOString(),
          auditLogIds: [audit.id],
        };
      },
    });
  }

  async createTemplateVersion(
    templateId: string,
    input: AdminTemplateVersionDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    return this.executeAdminCommand({
      projectId: null,
      action: 'ADMIN_WORKFLOW_TEMPLATE_VERSION_CREATED',
      input,
      actor,
      execute: async (tx) => {
        const source = await tx.processTemplate.findUnique({
          where: { id: templateId },
        });
        if (!source) {
          throw new NotFoundException('流程模板不存在。');
        }
        const effectiveAt = new Date(input.effectiveAt);
        if (effectiveAt.getTime() <= Date.now()) {
          throw new BadRequestException('新模板版本生效日期必须晚于当前时间。');
        }
        const duplicate = await tx.processTemplate.findUnique({
          where: {
            code_version: {
              code: source.code,
              version: input.version,
            },
          },
        });
        if (duplicate) {
          throw new ConflictException({
            code: 'TEMPLATE_VERSION_EXISTS',
            message: '该模板版本已经存在。',
          });
        }
        const created = await tx.processTemplate.create({
          data: {
            code: source.code,
            version: input.version,
            name: source.name,
            description: input.description ?? source.description,
            status: ProcessTemplateStatus.DRAFT,
            isDefault: false,
            metadata: {
              ...this.readObject(source.metadata),
              effectiveAt: effectiveAt.toISOString(),
              sourceTemplateId: source.id,
              nodeOverrides: input.nodeOverrides ?? [],
              createdBy: actor.id,
              reason: input.reason.trim(),
            } as Prisma.InputJsonValue,
          },
        });
        const audit = await this.activityLogsService.createWithExecutor(tx, {
          projectId: null,
          actorUserId: actor.id,
          targetType: AuditTargetType.SYSTEM,
          targetId: created.id,
          action: 'ADMIN_WORKFLOW_TEMPLATE_VERSION_CREATED',
          summary: `创建流程模板 ${source.code} ${created.version}`,
          beforeData: {
            sourceTemplateId: source.id,
            sourceVersion: source.version,
          },
          afterData: {
            templateId: created.id,
            version: created.version,
            effectiveAt: effectiveAt.toISOString(),
            status: created.status,
          },
          metadata: {
            requestId,
            idempotencyKey: input.idempotencyKey,
            reason: input.reason.trim(),
            result: 'SUCCESS',
          },
        });
        return {
          templateId: created.id,
          version: created.version,
          status: created.status,
          auditLogIds: [audit.id],
        };
      },
    });
  }

  async exportTasksCsv(query: AdminLedgerQueryDto) {
    const result = await this.listTasks({ ...query, page: 1, pageSize: 100 });
    const rows = [
      [
        '项目',
        '项目编号',
        '步骤',
        '工序',
        '主责部门',
        '负责人',
        '状态',
        '计划截止',
        '实际完成',
        '材料',
        '风险',
      ],
      ...result.items.map((item) => [
        item.project.name,
        item.project.code,
        String(item.stepNumber ?? ''),
        item.nodeName,
        item.primaryDepartment?.name ?? '',
        item.assignee?.name ?? '待分配',
        item.status,
        item.plannedDueAt ?? '',
        item.actualCompletedAt ?? '',
        `${item.materialProgress.completed}/${item.materialProgress.required}`,
        item.riskLevel,
      ]),
    ];
    return `\uFEFF${rows
      .map((row) =>
        row
          .map((cell) => this.csvCell(cell))
          .join(','),
      )
      .join('\r\n')}`;
  }

  private async buildTaskWhere(query: AdminLedgerQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.WorkflowTaskWhereInput = {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.taskStatus ? { status: query.taskStatus } : {}),
      ...(query.nodeCode ? { nodeCode: query.nodeCode } : {}),
      ...(query.departmentId
        ? { assigneeDepartmentId: query.departmentId }
        : {}),
      ...(query.ownerUserId ? { assigneeUserId: query.ownerUserId } : {}),
      ...(search
        ? {
            OR: [
              { nodeName: { contains: search, mode: 'insensitive' } },
              { taskNo: { contains: search, mode: 'insensitive' } },
              { project: { name: { contains: search, mode: 'insensitive' } } },
              { project: { code: { contains: search, mode: 'insensitive' } } },
              {
                assigneeUser: {
                  name: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    switch (query.view) {
      case 'OVERDUE':
        where.overdueDays = { gt: 0 };
        where.isActive = true;
        break;
      case 'DUE_SOON':
        where.effectiveDueAt = { gte: now, lte: sevenDays };
        where.isActive = true;
        break;
      case 'UNASSIGNED':
        where.assigneeUserId = null;
        where.isActive = true;
        break;
      case 'BLOCKED':
        where.blockers = { some: { status: TaskBlockerStatus.OPEN } };
        break;
      case 'WAITING_REVIEW':
        where.nodeCode = { in: REVIEW_NODE_CODES };
        where.status = {
          in: [
            WorkflowTaskStatus.PENDING,
            WorkflowTaskStatus.READY,
            WorkflowTaskStatus.IN_PROGRESS,
          ],
        };
        break;
      case 'MONTHLY_REVIEW':
        where.nodeCode = WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW;
        break;
      case 'COMPLETED':
        where.status = WorkflowTaskStatus.COMPLETED;
        break;
      case 'MISSING_MATERIAL': {
        const definitions = await this.prisma.workflowNodeDefinition.findMany({
          where: { requiredAttachments: { not: Prisma.JsonNull } },
          select: { nodeCode: true },
        });
        const taskIdsWithAttachments = await this.prisma.attachment.findMany({
          where: {
            entityType: AttachmentTargetType.WORKFLOW_TASK,
            isDeleted: false,
          },
          distinct: ['entityId'],
          select: { entityId: true },
          take: 5000,
        });
        where.nodeCode = { in: definitions.map((item) => item.nodeCode) };
        where.id = {
          notIn: taskIdsWithAttachments.map((item) => item.entityId),
        };
        break;
      }
      default:
        break;
    }
    return where;
  }

  private async buildSchedulePreview(
    db: AdminDbClient,
    taskId: string,
    input: AdminSchedulePreviewDto,
  ) {
    const task = await db.workflowTask.findUnique({
      where: { id: taskId },
      include: {
        project: true,
        assigneeUser: { select: { id: true, name: true } },
      },
    });
    if (!task) {
      throw new NotFoundException('工序任务不存在。');
    }
    this.assertDateVersion(task.updatedAt, input.taskVersion, '工序');
    const newDueAt = new Date(input.plannedDueAt);
    const oldDueAt = task.effectiveDueAt ?? task.dueAt;
    const diffDays = oldDueAt
      ? Math.round(
          (newDueAt.getTime() - oldDueAt.getTime()) / (24 * 60 * 60 * 1000),
        )
      : 0;
    const currentSequence =
      (
        await db.workflowNodeDefinition.findUnique({
          where: { nodeCode: task.nodeCode },
          select: { sequence: true },
        })
      )?.sequence ?? 0;
    const downstreamCodes = (
      await db.workflowNodeDefinition.findMany({
        where: { sequence: { gt: currentSequence } },
        orderBy: { sequence: 'asc' },
        select: { nodeCode: true, name: true, sequence: true },
      })
    );
    const downstreamTasks =
      input.scope === 'CURRENT_PROJECT_FUTURE_TASKS'
        ? await db.workflowTask.findMany({
            where: {
              projectId: task.projectId,
              nodeCode: { in: downstreamCodes.map((item) => item.nodeCode) },
              isActive: true,
              status: {
                in: [
                  WorkflowTaskStatus.PENDING,
                  WorkflowTaskStatus.READY,
                ],
              },
            },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              nodeCode: true,
              nodeName: true,
              effectiveDueAt: true,
              dueAt: true,
              manualDueAt: true,
            },
          })
        : [];
    const blockingReasons: string[] = [];
    if (IMMUTABLE_TASK_STATUSES.has(task.status)) {
      blockingReasons.push('已完成或历史工序不可调整计划日期。');
    }
    if (!input.reason.trim()) {
      blockingReasons.push('必须填写调整原因。');
    }
    if (Number.isNaN(newDueAt.getTime())) {
      blockingReasons.push('新的计划截止时间无效。');
    }

    return {
      canApply: blockingReasons.length === 0,
      blockingReasons,
      task: {
        id: task.id,
        projectId: task.projectId,
        projectName: task.project.name,
        nodeCode: task.nodeCode,
        nodeName: task.nodeName,
        status: task.status,
        assignee: task.assigneeUser,
        taskVersion: task.updatedAt.toISOString(),
      },
      before: {
        plannedStartAt: this.readString(
          this.readObject(task.payload).plannedStartAt,
        ),
        plannedDueAt: this.iso(oldDueAt),
        overdueDays: task.overdueDays,
        projectPlannedEndDate: this.iso(task.project.plannedEndDate),
      },
      after: {
        plannedStartAt: input.plannedStartAt ?? null,
        plannedDueAt: newDueAt.toISOString(),
        overdueDays: this.deadlineService.getOverdueDays(newDueAt),
        projectPlannedEndDate:
          input.scope === 'CURRENT_PROJECT_FUTURE_TASKS' &&
          task.project.plannedEndDate
            ? new Date(
                task.project.plannedEndDate.getTime() +
                  diffDays * 24 * 60 * 60 * 1000,
              ).toISOString()
            : this.iso(task.project.plannedEndDate),
      },
      impact: {
        workdayDifference: diffDays,
        scope: input.scope,
        downstreamTasks: downstreamTasks.map((downstreamTask) => {
          const beforeDueAt =
            downstreamTask.effectiveDueAt ?? downstreamTask.dueAt;
          return {
            id: downstreamTask.id,
            nodeCode: downstreamTask.nodeCode,
            nodeName: downstreamTask.nodeName,
            beforeDueAt: this.iso(beforeDueAt),
            afterDueAt:
              beforeDueAt && !downstreamTask.manualDueAt
                ? new Date(
                    beforeDueAt.getTime() +
                      diffDays * 24 * 60 * 60 * 1000,
                  ).toISOString()
                : this.iso(beforeDueAt),
            manuallyOverridden: Boolean(downstreamTask.manualDueAt),
          };
        }),
      },
      writePerformed: false,
    };
  }

  private async buildAssignmentPreview(
    db: AdminDbClient,
    taskId: string,
    input: AdminAssignmentPreviewDto,
  ) {
    const task = await db.workflowTask.findUnique({
      where: { id: taskId },
      include: {
        project: {
          include: {
            members: {
              include: {
                user: { include: { department: true } },
              },
            },
          },
        },
        assigneeUser: { include: { department: true } },
        assigneeDepartment: true,
      },
    });
    if (!task) {
      throw new NotFoundException('工序任务不存在。');
    }
    this.assertDateVersion(task.updatedAt, input.taskVersion, '工序');
    const department = input.primaryDepartmentId
      ? await db.department.findFirst({
          where: { id: input.primaryDepartmentId, isActive: true },
        })
      : task.assigneeDepartment;
    if (input.primaryDepartmentId && !department) {
      throw new BadRequestException('所选主责部门不存在或已停用。');
    }
    const activeMemberIds = new Set(
      task.project.members
        .filter((member) => member.user.status === UserStatus.ACTIVE)
        .map((member) => member.userId),
    );
    const requestedOwner = input.ownerUserId
      ? task.project.members.find(
          (member) =>
            member.userId === input.ownerUserId &&
            member.user.status === UserStatus.ACTIVE,
        )?.user ?? null
      : null;
    if (input.ownerUserId && !requestedOwner) {
      throw new BadRequestException('负责人必须是当前项目的有效成员。');
    }
    const candidates = task.project.members
      .filter(
        (member) =>
          member.user.status === UserStatus.ACTIVE &&
          (!department || member.user.departmentId === department.id),
      )
      .map((member) => ({
        id: member.user.id,
        name: member.user.name,
        departmentId: member.user.departmentId,
        departmentName: member.user.department?.name ?? null,
        memberType: member.memberType,
        responsibility: member.title,
        isPrimary: member.isPrimary,
      }));
    const suggested =
      requestedOwner ??
      candidates.find(
        (candidate) =>
          candidate.memberType === ProjectMemberType.MANAGER &&
          candidate.isPrimary,
      ) ??
      candidates.find(
        (candidate) =>
          candidate.memberType === ProjectMemberType.MEMBER &&
          candidate.isPrimary,
      ) ??
      (candidates.length === 1 ? candidates[0] ?? null : null);
    const assignmentSource = requestedOwner
      ? ProjectAssignmentSource.TASK_OVERRIDE
      : candidates.some(
            (candidate) =>
              candidate.id === suggested?.id &&
              candidate.memberType === ProjectMemberType.MANAGER,
          )
        ? ProjectAssignmentSource.PROJECT_DEPARTMENT_LEAD
        : candidates.some(
              (candidate) =>
                candidate.id === suggested?.id && candidate.isPrimary,
            )
          ? ProjectAssignmentSource.PROJECT_DEFAULT_ASSIGNEE
          : suggested
            ? ProjectAssignmentSource.SINGLE_ELIGIBLE_MEMBER
            : ProjectAssignmentSource.UNASSIGNED;
    const collaboratorIds = input.collaboratorUserIds ?? [];
    const reviewerIds = input.reviewerUserIds ?? [];
    const invalidRelatedIds = [...collaboratorIds, ...reviewerIds].filter(
      (userId) => !activeMemberIds.has(userId),
    );
    const blockingReasons: string[] = [];
    if (IMMUTABLE_TASK_STATUSES.has(task.status)) {
      blockingReasons.push('已完成或历史工序不可修改负责人。');
    }
    if (
      task.status === WorkflowTaskStatus.IN_PROGRESS &&
      (!input.confirmInProgress || !input.reason.trim())
    ) {
      blockingReasons.push('转交进行中任务必须明确确认并填写原因。');
    }
    if (!suggested) {
      blockingReasons.push('所选部门没有唯一可确定的项目成员负责人。');
    }
    if (invalidRelatedIds.length > 0) {
      blockingReasons.push('协同人或评审人中存在非项目有效成员。');
    }

    return {
      canApply: blockingReasons.length === 0,
      blockingReasons,
      task: {
        id: task.id,
        projectId: task.projectId,
        projectName: task.project.name,
        nodeCode: task.nodeCode,
        nodeName: task.nodeName,
        status: task.status,
        taskVersion: task.updatedAt.toISOString(),
      },
      current: {
        primaryDepartment: task.assigneeDepartment
          ? {
              id: task.assigneeDepartment.id,
              name: task.assigneeDepartment.name,
            }
          : null,
        owner: task.assigneeUser
          ? {
              id: task.assigneeUser.id,
              name: task.assigneeUser.name,
              departmentId: task.assigneeUser.departmentId,
              departmentName: task.assigneeUser.department?.name ?? null,
            }
          : null,
      },
      proposed: {
        primaryDepartment: department
          ? { id: department.id, name: department.name }
          : null,
        owner: suggested
          ? {
              id: suggested.id,
              name: suggested.name,
              departmentId: suggested.departmentId,
              departmentName:
                'departmentName' in suggested
                  ? suggested.departmentName
                  : suggested.department?.name ?? null,
            }
          : null,
        assignmentSource,
        collaboratorUserIds: collaboratorIds,
        reviewerUserIds: reviewerIds,
      },
      candidates,
      impact: {
        previousOwnerLosesTask:
          Boolean(task.assigneeUserId) &&
          task.assigneeUserId !== suggested?.id,
        newOwnerGainsTask:
          Boolean(suggested) && task.assigneeUserId !== suggested?.id,
        historyPreserved: true,
      },
      writePerformed: false,
    };
  }

  private async executeAdminCommand<T extends object>(input: {
    projectId: string | null;
    action: string;
    input: object;
    actor: AuthenticatedUser;
    execute: (tx: Prisma.TransactionClient) => Promise<T>;
  }): Promise<T & { idempotentReplay: boolean }> {
    const commandInput = input.input as Record<string, unknown>;
    const idempotencyKey = this.readString(commandInput.idempotencyKey);
    if (!idempotencyKey) {
      throw new BadRequestException('缺少 Idempotency-Key。');
    }
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ action: input.action, body: input.input }))
      .digest('hex');
    const existing = await this.prisma.adminCommandRequest.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (
        existing.action !== input.action ||
        existing.requestHash !== requestHash
      ) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: '同一幂等键不能用于不同的后台管理请求。',
        });
      }
      return {
        ...(this.readObject(existing.result) as T),
        idempotentReplay: true,
      };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const result = await input.execute(tx);
        await tx.adminCommandRequest.create({
          data: {
            projectId:
              input.projectId ??
              (typeof this.readObject(result).projectId === 'string'
                ? String(this.readObject(result).projectId)
                : null),
            actorUserId: input.actor.id,
            idempotencyKey,
            action: input.action,
            requestHash,
            result: result as unknown as Prisma.InputJsonValue,
          },
        });
        return { ...result, idempotentReplay: false };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.prisma.adminCommandRequest.findUnique({
          where: { idempotencyKey },
        });
        if (replay?.action === input.action && replay.requestHash === requestHash) {
          return {
            ...(this.readObject(replay.result) as T),
            idempotentReplay: true,
          };
        }
      }
      throw error;
    }
  }

  private projectOrderBy(query: AdminLedgerQueryDto): Prisma.ProjectOrderByWithRelationInput {
    const direction = query.sortOrder ?? 'desc';
    switch (query.sortBy) {
      case 'name':
        return { name: direction };
      case 'plannedEndDate':
        return { plannedEndDate: direction };
      case 'createdAt':
        return { createdAt: direction };
      default:
        return { updatedAt: direction };
    }
  }

  private taskOrderBy(query: AdminLedgerQueryDto): Prisma.WorkflowTaskOrderByWithRelationInput {
    const direction = query.sortOrder ?? 'desc';
    switch (query.sortBy) {
      case 'effectiveDueAt':
        return { effectiveDueAt: direction };
      case 'createdAt':
        return { createdAt: direction };
      default:
        return { updatedAt: direction };
    }
  }

  private taskAvailableActions(status: WorkflowTaskStatus) {
    if (IMMUTABLE_TASK_STATUSES.has(status)) {
      return ['VIEW_DETAIL', 'VIEW_AUDIT'];
    }
    return [
      'VIEW_DETAIL',
      'CHANGE_SCHEDULE',
      'CHANGE_ASSIGNMENT',
      'VIEW_AUDIT',
    ];
  }

  private readPage(value?: number) {
    return Math.max(1, value ?? 1);
  }

  private readPageSize(value?: number) {
    return Math.min(100, Math.max(1, value ?? 25));
  }

  private assertDateVersion(
    current: Date,
    expected: string,
    label: string,
  ) {
    if (current.toISOString() !== expected) {
      throw new ConflictException({
        code: 'STALE_VERSION',
        message: `${label}已被其他会话修改，请刷新后重试。`,
        currentVersion: current.toISOString(),
      });
    }
  }

  private readObject(value: unknown): Record<string, unknown> {
    return value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(value: unknown) {
    return typeof value === 'string' ? value : null;
  }

  private readExceptionMessage(error: unknown) {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }
    return '服务端无法计算此工序的变更影响。';
  }

  private readNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private readStringList(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === 'string');
  }

  private mergeJson(
    value: Prisma.JsonValue | null,
    patch: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    return {
      ...this.readObject(value),
      ...patch,
    } as Prisma.InputJsonValue;
  }

  private iso(value: Date | null | undefined) {
    return value?.toISOString() ?? null;
  }

  private isSystemDictionaryItem(category: string, code: string) {
    return (
      category === 'WORKFLOW_STATUS' ||
      category === 'PROJECT_STATUS' ||
      code === 'FIXED_DEVELOPMENT_FEE'
    );
  }

  private csvCell(value: string) {
    const protectedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${protectedValue.replace(/"/g, '""')}"`;
  }

  private parseTaskScheduleImport(csv: string) {
    const normalized = csv.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
    const lines = normalized
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines[0] !== 'taskId,taskVersion,plannedDueAt') {
      throw new BadRequestException(
        '导入文件表头无效，请下载正式模板后填写。',
      );
    }
    if (lines.length < 2) {
      throw new BadRequestException('导入文件没有数据行。');
    }
    if (lines.length > 101) {
      throw new BadRequestException('单次最多导入 100 条工序。');
    }
    const seenTaskIds = new Set<string>();
    return lines.slice(1).map((line, index) => {
      const cells = line.split(',').map((cell) => cell.trim());
      if (cells.length !== 3) {
        throw new BadRequestException(
          `第 ${index + 2} 行列数无效，字段中不得包含逗号。`,
        );
      }
      const [taskId = '', taskVersion = '', plannedDueAt = ''] = cells;
      if (
        [taskId, taskVersion, plannedDueAt].some((value) =>
          /^[=+\-@]/.test(value),
        )
      ) {
        throw new BadRequestException(
          `第 ${index + 2} 行包含公式前缀，已拒绝导入。`,
        );
      }
      if (!taskId || !taskVersion || !plannedDueAt) {
        throw new BadRequestException(`第 ${index + 2} 行存在空字段。`);
      }
      if (seenTaskIds.has(taskId)) {
        throw new BadRequestException(
          `第 ${index + 2} 行包含重复工序 ID。`,
        );
      }
      seenTaskIds.add(taskId);
      if (
        Number.isNaN(new Date(taskVersion).getTime()) ||
        Number.isNaN(new Date(plannedDueAt).getTime())
      ) {
        throw new BadRequestException(
          `第 ${index + 2} 行的数据版本或计划截止时间不是有效 ISO 日期。`,
        );
      }
      return {
        rowNumber: index + 2,
        taskId,
        taskVersion,
        plannedDueAt: new Date(plannedDueAt).toISOString(),
      };
    });
  }
}
