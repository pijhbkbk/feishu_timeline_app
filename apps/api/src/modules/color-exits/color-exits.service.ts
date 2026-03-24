import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  ColorStatus,
  Prisma,
  ProjectStatus,
  WorkflowAction,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  getAllowedWorkflowActions,
  getCurrentNodeName,
  isWorkflowActionCurrentlyAvailable,
} from '../workflows/workflow-node.constants';
import { WorkflowsService } from '../workflows/workflows.service';
import {
  COLOR_EXIT_MANAGEMENT_ROLE_CODES,
  getColorExitCompletionIssue,
  getColorExitStageIssue,
} from './color-exits.rules';

type ColorExitsDbClient = Prisma.TransactionClient | PrismaService;

type ColorExitWriteInput = {
  exitDate: Date;
  exitReason: string;
  description: string | null;
  replacementColorId: string | null;
};

const COLOR_EXIT_NODE_CODE = WorkflowNodeCode.PROJECT_CLOSED;

const COLOR_EXIT_INCLUDE = {
  workflowTask: {
    include: {
      assigneeUser: true,
      assigneeDepartment: true,
    },
  },
  color: true,
  replacementColor: true,
  operator: true,
} satisfies Prisma.ColorExitInclude;

@Injectable()
export class ColorExitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  getWorkspace(projectId: string) {
    return this.buildWorkspace(this.prisma, projectId);
  }

  async createExitRecord(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getContext(tx, projectId);
      this.assertWritableStage(context);

      if (context.activeRecord) {
        throw new BadRequestException('当前颜色退出任务已存在退出记录。');
      }

      await this.startTaskIfNeeded(tx, context.activeTask!, actor, '颜色退出任务已开始处理。');

      const boundColor = await this.getBoundProjectColor(tx, projectId);
      await this.assertReplacementColor(tx, projectId, boundColor?.id ?? null, input.replacementColorId);

      const record = await tx.colorExit.create({
        data: {
          projectId,
          workflowTaskId: context.activeTask!.id,
          colorId: boundColor?.id ?? null,
          replacementColorId: input.replacementColorId,
          operatorId: actor.id,
          exitDate: input.exitDate,
          exitReason: input.exitReason,
          description: input.description,
        },
        include: COLOR_EXIT_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.COLOR_EXIT,
        targetId: record.id,
        action: 'COLOR_EXIT_CREATED',
        nodeCode: COLOR_EXIT_NODE_CODE,
        summary: `创建颜色退出记录 ${record.id}`,
        afterData: this.toColorExitAuditSnapshot(record),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async updateExitRecord(
    projectId: string,
    exitId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getContext(tx, projectId);
      this.assertWritableStage(context);
      const record = await this.getExitRecordOrThrow(tx, projectId, exitId);
      this.assertEditableRecord(record, context.activeTask!.id);

      await this.assertReplacementColor(
        tx,
        projectId,
        record.colorId ?? null,
        input.replacementColorId,
      );

      const updatedRecord = await tx.colorExit.update({
        where: { id: exitId },
        data: {
          replacementColorId: input.replacementColorId,
          operatorId: actor.id,
          exitDate: input.exitDate,
          exitReason: input.exitReason,
          description: input.description,
        },
        include: COLOR_EXIT_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.COLOR_EXIT,
        targetId: exitId,
        action: 'COLOR_EXIT_UPDATED',
        nodeCode: COLOR_EXIT_NODE_CODE,
        summary: `更新颜色退出记录 ${exitId}`,
        beforeData: this.toColorExitAuditSnapshot(record),
        afterData: this.toColorExitAuditSnapshot(updatedRecord),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async completeExitRecord(
    projectId: string,
    exitId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getContext(tx, projectId);
      this.assertWritableStage(context);
      const record = await this.getExitRecordOrThrow(tx, projectId, exitId);
      this.assertEditableRecord(record, context.activeTask!.id);

      const completionIssue = getColorExitCompletionIssue({
        exitDate: record.exitDate,
        exitReason: record.exitReason,
        operatorId: actor.id,
      });

      if (completionIssue) {
        throw new BadRequestException(completionIssue);
      }

      const resolvedColor =
        record.colorId
          ? await tx.color.findUnique({
              where: { id: record.colorId },
              select: {
                id: true,
                code: true,
                name: true,
                status: true,
                exitFlag: true,
                exitDate: true,
              },
            })
          : await this.getBoundProjectColor(tx, projectId);

      if (record.replacementColorId) {
        await this.assertReplacementColor(
          tx,
          projectId,
          resolvedColor?.id ?? null,
          record.replacementColorId,
        );
      }

      const projectBefore = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: {
          id: true,
          status: true,
          currentNodeCode: true,
          actualEndDate: true,
          closedAt: true,
        },
      });

      const completedRecord = await tx.colorExit.update({
        where: { id: exitId },
        data: {
          colorId: resolvedColor?.id ?? record.colorId ?? null,
          operatorId: actor.id,
          completedAt: new Date(),
        },
        include: COLOR_EXIT_INCLUDE,
      });

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask!.id,
        WorkflowAction.COMPLETE,
        actor,
        {
          comment: '颜色退出已完成，项目流程自动结束。',
          metadata: {
            colorExitId: completedRecord.id,
            colorId: completedRecord.colorId,
            replacementColorId: completedRecord.replacementColorId,
          },
        },
      );

      const projectAfter = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: {
          id: true,
          status: true,
          currentNodeCode: true,
          actualEndDate: true,
          closedAt: true,
        },
      });

      if (completedRecord.colorId) {
        const colorBefore = await tx.color.findUnique({
          where: { id: completedRecord.colorId },
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            exitFlag: true,
            exitDate: true,
          },
        });

        if (colorBefore) {
          const colorAfter = await tx.color.update({
            where: { id: completedRecord.colorId },
            data: {
              status: ColorStatus.EXITED,
              exitFlag: true,
              exitDate: completedRecord.exitDate,
            },
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              exitFlag: true,
              exitDate: true,
            },
          });

          await this.activityLogsService.createWithExecutor(tx, {
            projectId,
            actorUserId: actor.id,
            targetType: AuditTargetType.COLOR,
            targetId: colorAfter.id,
            action: 'COLOR_EXIT_STATUS_UPDATED',
            nodeCode: COLOR_EXIT_NODE_CODE,
            summary: `颜色主数据 ${colorAfter.name} 已退出。`,
            beforeData: colorBefore satisfies Prisma.InputJsonValue,
            afterData: colorAfter satisfies Prisma.InputJsonValue,
          });
        }
      }

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PROJECT,
        targetId: projectId,
        action: 'PROJECT_COMPLETED_BY_COLOR_EXIT',
        nodeCode: COLOR_EXIT_NODE_CODE,
        summary: '颜色退出完成，项目已收尾。',
        beforeData: projectBefore satisfies Prisma.InputJsonValue,
        afterData: projectAfter satisfies Prisma.InputJsonValue,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.COLOR_EXIT,
        targetId: completedRecord.id,
        action: 'COLOR_EXIT_COMPLETED',
        nodeCode: COLOR_EXIT_NODE_CODE,
        summary: '颜色退出节点已完成。',
        afterData: this.toColorExitAuditSnapshot(completedRecord),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  private async buildWorkspace(db: ColorExitsDbClient, projectId: string) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [activeTask, visualDeltaApproved, currentColor, replacementOptions, items] =
      await Promise.all([
        this.getActiveTask(db, projectId),
        this.hasApprovedOrCompletedWorkflowTask(
          db,
          projectId,
          WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        ),
        this.getBoundProjectColor(db, projectId),
        this.listProjectColors(db, projectId),
        db.colorExit.findMany({
          where: {
            projectId,
          },
          include: COLOR_EXIT_INCLUDE,
          orderBy: [{ createdAt: 'desc' }],
        }),
      ]);

    const latestRecord = items[0] ?? null;

    return {
      project: this.toProjectSummary(project),
      visualDeltaApproved,
      activeTask: activeTask ? this.toWorkflowTaskSummary(activeTask) : null,
      currentColor: currentColor
        ? {
            id: currentColor.id,
            code: currentColor.code,
            name: currentColor.name,
            status: currentColor.status,
            exitFlag: currentColor.exitFlag,
            exitDate: currentColor.exitDate?.toISOString() ?? null,
          }
        : null,
      replacementOptions: replacementOptions.map((color) => ({
        id: color.id,
        code: color.code,
        name: color.name,
        status: color.status,
        isPrimary: color.isPrimary,
      })),
      canCompleteTask:
        Boolean(activeTask) &&
        latestRecord !== null &&
        getColorExitCompletionIssue({
          exitDate: latestRecord.exitDate,
          exitReason: latestRecord.exitReason,
          operatorId: latestRecord.operatorId,
        }) === null,
      completionIssue:
        latestRecord === null
          ? '请先创建颜色退出记录。'
          : getColorExitCompletionIssue({
              exitDate: latestRecord.exitDate,
              exitReason: latestRecord.exitReason,
              operatorId: latestRecord.operatorId,
            }),
      items: items.map((item) => this.toSummary(item)),
    };
  }

  private async getContext(db: ColorExitsDbClient, projectId: string) {
    const [project, activeTask, visualDeltaApproved, activeRecord] = await Promise.all([
      this.getProjectOrThrow(db, projectId),
      this.getActiveTask(db, projectId),
      this.hasApprovedOrCompletedWorkflowTask(
        db,
        projectId,
        WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
      ),
      db.colorExit.findFirst({
        where: {
          projectId,
          workflowTask: {
            isActive: true,
          },
        },
        select: { id: true },
      }),
    ]);

    return {
      project,
      activeTask,
      visualDeltaApproved,
      activeRecord,
    };
  }

  private assertWritableStage(context: {
    visualDeltaApproved: boolean;
    activeTask: { id: string } | null;
  }) {
    const issue = getColorExitStageIssue({
      visualDeltaApproved: context.visualDeltaApproved,
      hasActiveTask: Boolean(context.activeTask),
    });

    if (issue) {
      throw new BadRequestException(issue);
    }
  }

  private assertActorCanManage(actor: AuthenticatedUser) {
    if (actor.isSystemAdmin) {
      return;
    }

    if (
      actor.roleCodes.some((roleCode) =>
        COLOR_EXIT_MANAGEMENT_ROLE_CODES.includes(
          roleCode as (typeof COLOR_EXIT_MANAGEMENT_ROLE_CODES)[number],
        ),
      )
    ) {
      return;
    }

    throw new BadRequestException('当前用户没有颜色退出权限。');
  }

  private async getProjectOrThrow(db: ColorExitsDbClient, projectId: string) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        code: true,
        name: true,
        priority: true,
        currentNodeCode: true,
        plannedEndDate: true,
        status: true,
        actualEndDate: true,
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在。');
    }

    return project;
  }

  private async getActiveTask(db: ColorExitsDbClient, projectId: string) {
    return db.workflowTask.findFirst({
      where: {
        projectId,
        nodeCode: WorkflowNodeCode.PROJECT_CLOSED,
        isActive: true,
      },
      include: {
        assigneeUser: true,
        assigneeDepartment: true,
      },
      orderBy: [{ createdAt: 'desc' }, { taskRound: 'desc' }],
    });
  }

  private async hasApprovedOrCompletedWorkflowTask(
    db: ColorExitsDbClient,
    projectId: string,
    nodeCode: WorkflowNodeCode,
  ) {
    const task = await db.workflowTask.findFirst({
      where: {
        projectId,
        nodeCode,
        status: {
          in: [WorkflowTaskStatus.APPROVED, WorkflowTaskStatus.COMPLETED],
        },
      },
      select: { id: true },
    });

    return Boolean(task);
  }

  private async getBoundProjectColor(db: ColorExitsDbClient, projectId: string) {
    return db.color.findFirst({
      where: { projectId },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        isPrimary: true,
        exitFlag: true,
        exitDate: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  private async listProjectColors(db: ColorExitsDbClient, projectId: string) {
    return db.color.findMany({
      where: { projectId },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        isPrimary: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  private async assertReplacementColor(
    db: ColorExitsDbClient,
    projectId: string,
    currentColorId: string | null,
    replacementColorId: string | null,
  ) {
    if (!replacementColorId) {
      return;
    }

    if (replacementColorId === currentColorId) {
      throw new BadRequestException('替代颜色不能与当前颜色相同。');
    }

    const replacementColor = await db.color.findFirst({
      where: {
        id: replacementColorId,
        projectId,
      },
      select: { id: true },
    });

    if (!replacementColor) {
      throw new BadRequestException('替代颜色不存在。');
    }
  }

  private async getExitRecordOrThrow(
    db: ColorExitsDbClient,
    projectId: string,
    exitId: string,
  ) {
    const record = await db.colorExit.findFirst({
      where: {
        id: exitId,
        projectId,
      },
      include: COLOR_EXIT_INCLUDE,
    });

    if (!record) {
      throw new NotFoundException('颜色退出记录不存在。');
    }

    return record;
  }

  private assertEditableRecord(
    record: Prisma.ColorExitGetPayload<{
      include: typeof COLOR_EXIT_INCLUDE;
    }>,
    activeTaskId: string,
  ) {
    if (record.workflowTaskId !== activeTaskId) {
      throw new BadRequestException('当前退出记录不属于活跃颜色退出任务。');
    }

    if (record.completedAt) {
      throw new BadRequestException('颜色退出记录已完成，不能再修改。');
    }
  }

  private async startTaskIfNeeded(
    tx: Prisma.TransactionClient,
    activeTask: {
      id: string;
      status: WorkflowTaskStatus;
    },
    actor: AuthenticatedUser,
    comment: string,
  ) {
    if (
      activeTask.status !== WorkflowTaskStatus.READY &&
      activeTask.status !== WorkflowTaskStatus.RETURNED
    ) {
      return;
    }

    await this.workflowsService.transitionTaskWithExecutor(
      tx,
      activeTask.id,
      WorkflowAction.START,
      actor,
      { comment },
    );
  }

  private parseWriteInput(rawInput: unknown): ColorExitWriteInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('颜色退出数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const exitReason = typeof input.exitReason === 'string' ? input.exitReason.trim() : '';
    const description =
      typeof input.description === 'string' && input.description.trim().length > 0
        ? input.description.trim()
        : null;
    const replacementColorId =
      typeof input.replacementColorId === 'string' && input.replacementColorId.trim().length > 0
        ? input.replacementColorId.trim()
        : null;

    if (!exitReason) {
      throw new BadRequestException('退出原因不能为空。');
    }

    return {
      exitReason,
      description,
      replacementColorId,
      exitDate: this.parseDate(input.exitDate, '退出日期'),
    };
  }

  private parseDate(value: unknown, label: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${label}不能为空。`);
    }

    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException(`${label}格式不正确。`);
    }

    return parsedDate;
  }

  private toProjectSummary(project: {
    id: string;
    code: string;
    name: string;
    priority: string;
    currentNodeCode: WorkflowNodeCode | null;
    plannedEndDate: Date | null;
    status: ProjectStatus;
    actualEndDate: Date | null;
  }) {
    return {
      id: project.id,
      code: project.code,
      name: project.name,
      currentNodeCode: project.currentNodeCode,
      currentNodeName: getCurrentNodeName(project.currentNodeCode),
      targetDate: project.plannedEndDate?.toISOString() ?? null,
      riskLevel: project.priority,
      status: project.status,
      actualEndDate: project.actualEndDate?.toISOString() ?? null,
    };
  }

  private toWorkflowTaskSummary(
    task: Prisma.WorkflowTaskGetPayload<{
      include: {
        assigneeUser: true;
        assigneeDepartment: true;
      };
    }>,
  ) {
    return {
      id: task.id,
      taskNo: task.taskNo,
      nodeCode: task.nodeCode,
      nodeName: task.nodeName,
      taskRound: task.taskRound,
      status: task.status,
      isPrimary: task.isPrimary,
      isActive: task.isActive,
      assigneeUserId: task.assigneeUserId,
      assigneeUserName: task.assigneeUser?.name ?? null,
      assigneeDepartmentId: task.assigneeDepartmentId,
      assigneeDepartmentName: task.assigneeDepartment?.name ?? null,
      dueAt: task.dueAt?.toISOString() ?? null,
      startedAt: task.startedAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      returnedAt: task.returnedAt?.toISOString() ?? null,
      payload: task.payload,
      availableActions: task.isActive
        ? getAllowedWorkflowActions(task.nodeCode).filter((action) =>
            isWorkflowActionCurrentlyAvailable(task.status, action),
          )
        : [],
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private toSummary(
    record: Prisma.ColorExitGetPayload<{
      include: typeof COLOR_EXIT_INCLUDE;
    }>,
  ) {
    return {
      id: record.id,
      workflowTaskId: record.workflowTaskId,
      colorId: record.colorId,
      colorName: record.color?.name ?? null,
      colorCode: record.color?.code ?? null,
      replacementColorId: record.replacementColorId,
      replacementColorName: record.replacementColor?.name ?? null,
      replacementColorCode: record.replacementColor?.code ?? null,
      operatorId: record.operatorId,
      operatorName: record.operator?.name ?? null,
      exitDate: record.exitDate.toISOString(),
      exitReason: record.exitReason,
      description: record.description,
      completedAt: record.completedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toColorExitAuditSnapshot(
    record: Prisma.ColorExitGetPayload<{
      include: typeof COLOR_EXIT_INCLUDE;
    }>,
  ) {
    return {
      id: record.id,
      workflowTaskId: record.workflowTaskId,
      colorId: record.colorId,
      colorName: record.color?.name ?? null,
      replacementColorId: record.replacementColorId,
      replacementColorName: record.replacementColor?.name ?? null,
      operatorId: record.operatorId,
      operatorName: record.operator?.name ?? null,
      exitDate: record.exitDate.toISOString(),
      exitReason: record.exitReason,
      description: record.description,
      completedAt: record.completedAt?.toISOString() ?? null,
    } satisfies Prisma.InputJsonValue;
  }
}
