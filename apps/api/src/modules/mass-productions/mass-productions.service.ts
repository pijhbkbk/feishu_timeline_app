import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  Prisma,
  ProductionPlanStatus,
  ProductionPlanType,
  UserStatus,
  WorkflowAction,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

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
  canCancelMassProductionRecord,
  canCompleteMassProductionRecord,
  canEditMassProductionRecord,
  canStartMassProductionRecord,
  getMassProductionCompletionIssue,
  getMassProductionNodeCode,
  getMassProductionStageIssue,
  MASS_PRODUCTION_MANAGEMENT_ROLE_CODES,
} from './mass-productions.rules';

type MassProductionDbClient = Prisma.TransactionClient | PrismaService;

type MassProductionWriteInput = {
  productionDate: Date;
  plannedQuantity: number;
  actualQuantity: number | null;
  workshop: string;
  lineName: string;
  ownerId: string;
  batchNo: string;
  exceptionNote: string | null;
};

const MASS_PRODUCTION_NODE_CODE = getMassProductionNodeCode();

const MASS_PRODUCTION_INCLUDE = {
  owner: true,
  createdBy: true,
  confirmedBy: true,
} satisfies Prisma.ProductionPlanInclude;

@Injectable()
export class MassProductionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  getWorkspace(projectId: string) {
    return this.buildWorkspace(this.prisma, projectId);
  }

  async createRecord(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getMassProductionContext(tx, projectId);
      this.assertWritableStage(context);
      await this.getUserOrThrow(tx, input.ownerId);
      await this.startTaskIfNeeded(tx, context.activeTask!, actor, '批量生产已开始准备。');

      const createdRecord = await tx.productionPlan.create({
        data: {
          projectId,
          createdById: actor.id,
          ownerId: input.ownerId,
          planNo: this.buildRecordNo(),
          planType: ProductionPlanType.MASS_PRODUCTION,
          status: ProductionPlanStatus.DRAFT,
          quantity: input.plannedQuantity,
          actualQuantity: input.actualQuantity,
          planDate: input.productionDate,
          lineName: input.lineName,
          workshop: input.workshop,
          batchNo: input.batchNo,
          remark: input.exceptionNote,
        },
        include: MASS_PRODUCTION_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PRODUCTION_PLAN,
        targetId: createdRecord.id,
        action: 'MASS_PRODUCTION_RECORD_CREATED',
        nodeCode: MASS_PRODUCTION_NODE_CODE,
        summary: `创建批量生产记录 ${createdRecord.planNo}`,
        afterData: this.toAuditSnapshot(createdRecord),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async updateRecord(
    projectId: string,
    recordId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getMassProductionContext(tx, projectId);
      this.assertWritableStage(context);
      const record = await this.getRecordOrThrow(tx, projectId, recordId);

      if (!canEditMassProductionRecord(record.status)) {
        throw new BadRequestException('当前批量生产记录状态不允许编辑。');
      }

      await this.getUserOrThrow(tx, input.ownerId);

      const updatedRecord = await tx.productionPlan.update({
        where: { id: recordId },
        data: {
          ownerId: input.ownerId,
          quantity: input.plannedQuantity,
          actualQuantity: input.actualQuantity,
          planDate: input.productionDate,
          lineName: input.lineName,
          workshop: input.workshop,
          batchNo: input.batchNo,
          remark: input.exceptionNote,
        },
        include: MASS_PRODUCTION_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PRODUCTION_PLAN,
        targetId: record.id,
        action: 'MASS_PRODUCTION_RECORD_UPDATED',
        nodeCode: MASS_PRODUCTION_NODE_CODE,
        summary: `更新批量生产记录 ${updatedRecord.planNo}`,
        beforeData: this.toAuditSnapshot(record),
        afterData: this.toAuditSnapshot(updatedRecord),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async startRecord(
    projectId: string,
    recordId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getMassProductionContext(tx, projectId);
      this.assertWritableStage(context);
      const record = await this.getRecordOrThrow(tx, projectId, recordId);

      if (!canStartMassProductionRecord(record.status)) {
        throw new BadRequestException('当前批量生产记录状态不允许开始。');
      }

      await this.startTaskIfNeeded(tx, context.activeTask!, actor, '批量生产任务已开始执行。');

      const startedRecord = await tx.productionPlan.update({
        where: { id: recordId },
        data: {
          status: ProductionPlanStatus.IN_PROGRESS,
          actualStartAt: record.actualStartAt ?? new Date(),
        },
        include: MASS_PRODUCTION_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PRODUCTION_PLAN,
        targetId: record.id,
        action: 'MASS_PRODUCTION_RECORD_STARTED',
        nodeCode: MASS_PRODUCTION_NODE_CODE,
        summary: `开始批量生产记录 ${startedRecord.planNo}`,
        beforeData: this.toAuditSnapshot(record),
        afterData: this.toAuditSnapshot(startedRecord),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async completeRecord(
    projectId: string,
    recordId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getMassProductionContext(tx, projectId);
      this.assertWritableStage(context);
      const record = await this.getRecordOrThrow(tx, projectId, recordId);

      if (!canCompleteMassProductionRecord(record.status)) {
        throw new BadRequestException('当前批量生产记录状态不允许完成。');
      }

      if (!record.actualQuantity || record.actualQuantity <= 0) {
        throw new BadRequestException('完成批量生产前必须填写大于 0 的实际数量。');
      }

      const completedRecord = await tx.productionPlan.update({
        where: { id: recordId },
        data: {
          status: ProductionPlanStatus.COMPLETED,
          actualEndAt: new Date(),
        },
        include: MASS_PRODUCTION_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PRODUCTION_PLAN,
        targetId: record.id,
        action: 'MASS_PRODUCTION_RECORD_COMPLETED',
        nodeCode: MASS_PRODUCTION_NODE_CODE,
        summary: `完成批量生产记录 ${completedRecord.planNo}`,
        beforeData: this.toAuditSnapshot(record),
        afterData: this.toAuditSnapshot(completedRecord),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async cancelRecord(
    projectId: string,
    recordId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getMassProductionContext(tx, projectId);
      this.assertWritableStage(context);
      const record = await this.getRecordOrThrow(tx, projectId, recordId);

      if (!canCancelMassProductionRecord(record.status)) {
        throw new BadRequestException('当前批量生产记录状态不允许取消。');
      }

      const cancelledRecord = await tx.productionPlan.update({
        where: { id: recordId },
        data: {
          status: ProductionPlanStatus.CANCELLED,
        },
        include: MASS_PRODUCTION_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PRODUCTION_PLAN,
        targetId: record.id,
        action: 'MASS_PRODUCTION_RECORD_CANCELLED',
        nodeCode: MASS_PRODUCTION_NODE_CODE,
        summary: `取消批量生产记录 ${cancelledRecord.planNo}`,
        beforeData: this.toAuditSnapshot(record),
        afterData: this.toAuditSnapshot(cancelledRecord),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async completeTask(projectId: string, actor: AuthenticatedUser) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getMassProductionContext(tx, projectId);
      this.assertWritableStage(context);

      if (!context.activeTask) {
        throw new BadRequestException('当前没有可完成的批量生产任务。');
      }

      const completionIssue = getMassProductionCompletionIssue(context.items);

      if (completionIssue) {
        throw new BadRequestException(completionIssue);
      }

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask.id,
        WorkflowAction.COMPLETE,
        actor,
        {
          comment: '批量生产节点已完成，自动进入色差目视评审。',
          metadata: {
            completedRecordCount: context.items.filter(
              (item) => item.status === ProductionPlanStatus.COMPLETED,
            ).length,
          },
        },
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.WORKFLOW_TASK,
        targetId: context.activeTask.id,
        action: 'MASS_PRODUCTION_TASK_COMPLETED',
        nodeCode: MASS_PRODUCTION_NODE_CODE,
        summary: '批量生产节点已完成。',
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  private async buildWorkspace(db: MassProductionDbClient, projectId: string) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [activeTask, downstreamVisualReviewTask, schedulePlanCompleted, items] =
      await Promise.all([
        this.getActiveTask(db, projectId, MASS_PRODUCTION_NODE_CODE),
        this.getActiveTask(
          db,
          projectId,
          WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        ),
        this.hasCompletedWorkflowTask(db, projectId, WorkflowNodeCode.MASS_PRODUCTION_PLAN),
        db.productionPlan.findMany({
          where: {
            projectId,
            planType: ProductionPlanType.MASS_PRODUCTION,
          },
          include: MASS_PRODUCTION_INCLUDE,
          orderBy: [{ createdAt: 'desc' }],
        }),
      ]);

    return {
      project: this.toProjectSummary(project),
      schedulePlanCompleted,
      activeTask: activeTask ? this.toWorkflowTaskSummary(activeTask) : null,
      downstreamVisualReviewTask: downstreamVisualReviewTask
        ? this.toWorkflowTaskSummary(downstreamVisualReviewTask)
        : null,
      canCompleteTask: activeTask
        ? getMassProductionCompletionIssue(items) === null
        : false,
      completionIssue: activeTask
        ? getMassProductionCompletionIssue(items)
        : '当前没有活跃的批量生产任务。',
      items: items.map((item) => this.toSummary(item)),
    };
  }

  private async getMassProductionContext(
    db: MassProductionDbClient,
    projectId: string,
  ) {
    const [project, activeTask, schedulePlanCompleted, items] = await Promise.all([
      this.getProjectOrThrow(db, projectId),
      this.getActiveTask(db, projectId, MASS_PRODUCTION_NODE_CODE),
      this.hasCompletedWorkflowTask(db, projectId, WorkflowNodeCode.MASS_PRODUCTION_PLAN),
      db.productionPlan.findMany({
        where: {
          projectId,
          planType: ProductionPlanType.MASS_PRODUCTION,
        },
        select: {
          id: true,
          status: true,
        },
      }),
    ]);

    return {
      project,
      activeTask,
      schedulePlanCompleted,
      items,
    };
  }

  private assertWritableStage(context: {
    schedulePlanCompleted: boolean;
    activeTask: { id: string } | null;
  }) {
    const issue = getMassProductionStageIssue({
      schedulePlanCompleted: context.schedulePlanCompleted,
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
        MASS_PRODUCTION_MANAGEMENT_ROLE_CODES.includes(
          roleCode as (typeof MASS_PRODUCTION_MANAGEMENT_ROLE_CODES)[number],
        ),
      )
    ) {
      return;
    }

    throw new BadRequestException('当前用户没有批量生产权限。');
  }

  private async getProjectOrThrow(db: MassProductionDbClient, projectId: string) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        code: true,
        name: true,
        priority: true,
        currentNodeCode: true,
        plannedEndDate: true,
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在。');
    }

    return project;
  }

  private async getActiveTask(
    db: MassProductionDbClient,
    projectId: string,
    nodeCode: WorkflowNodeCode,
  ) {
    return db.workflowTask.findFirst({
      where: {
        projectId,
        nodeCode,
        isActive: true,
      },
      include: {
        assigneeUser: true,
        assigneeDepartment: true,
      },
      orderBy: [{ createdAt: 'desc' }, { taskRound: 'desc' }],
    });
  }

  private async hasCompletedWorkflowTask(
    db: MassProductionDbClient,
    projectId: string,
    nodeCode: WorkflowNodeCode,
  ) {
    const task = await db.workflowTask.findFirst({
      where: {
        projectId,
        nodeCode,
        status: WorkflowTaskStatus.COMPLETED,
      },
      select: { id: true },
    });

    return Boolean(task);
  }

  private async getRecordOrThrow(
    db: MassProductionDbClient,
    projectId: string,
    recordId: string,
  ) {
    const record = await db.productionPlan.findFirst({
      where: {
        id: recordId,
        projectId,
        planType: ProductionPlanType.MASS_PRODUCTION,
      },
      include: MASS_PRODUCTION_INCLUDE,
    });

    if (!record) {
      throw new NotFoundException('批量生产记录不存在。');
    }

    return record;
  }

  private async getUserOrThrow(db: MassProductionDbClient, userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('责任人不存在或不可用。');
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
      {
        comment,
      },
    );
  }

  private parseWriteInput(rawInput: unknown): MassProductionWriteInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('批量生产数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const workshop = typeof input.workshop === 'string' ? input.workshop.trim() : '';
    const lineName = typeof input.lineName === 'string' ? input.lineName.trim() : '';
    const ownerId = typeof input.ownerId === 'string' ? input.ownerId.trim() : '';
    const batchNo = typeof input.batchNo === 'string' ? input.batchNo.trim() : '';
    const exceptionNote =
      typeof input.exceptionNote === 'string' && input.exceptionNote.trim().length > 0
        ? input.exceptionNote.trim()
        : null;
    const plannedQuantity =
      typeof input.plannedQuantity === 'number'
        ? input.plannedQuantity
        : typeof input.plannedQuantity === 'string'
          ? Number(input.plannedQuantity)
          : NaN;
    const actualQuantity =
      typeof input.actualQuantity === 'number'
        ? input.actualQuantity
        : typeof input.actualQuantity === 'string' && input.actualQuantity.trim().length > 0
          ? Number(input.actualQuantity)
          : null;

    if (!workshop) {
      throw new BadRequestException('车间不能为空。');
    }

    if (!lineName) {
      throw new BadRequestException('生产线不能为空。');
    }

    if (!ownerId) {
      throw new BadRequestException('责任人不能为空。');
    }

    if (!batchNo) {
      throw new BadRequestException('生产批次不能为空。');
    }

    if (!Number.isInteger(plannedQuantity) || plannedQuantity <= 0) {
      throw new BadRequestException('计划数量必须是大于 0 的整数。');
    }

    if (
      actualQuantity !== null &&
      (!Number.isInteger(actualQuantity) || actualQuantity < 0)
    ) {
      throw new BadRequestException('实际数量必须是大于等于 0 的整数。');
    }

    return {
      workshop,
      lineName,
      ownerId,
      batchNo,
      exceptionNote,
      plannedQuantity,
      actualQuantity,
      productionDate: this.parseDate(input.productionDate, '生产日期'),
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
  }) {
    return {
      id: project.id,
      code: project.code,
      name: project.name,
      currentNodeCode: project.currentNodeCode,
      currentNodeName: getCurrentNodeName(project.currentNodeCode),
      targetDate: project.plannedEndDate?.toISOString() ?? null,
      riskLevel: project.priority,
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
    record: Prisma.ProductionPlanGetPayload<{
      include: typeof MASS_PRODUCTION_INCLUDE;
    }>,
  ) {
    return {
      id: record.id,
      planNo: record.planNo,
      status: record.status,
      productionDate: record.planDate?.toISOString() ?? null,
      plannedQuantity: record.quantity,
      actualQuantity: record.actualQuantity,
      workshop: record.workshop,
      lineName: record.lineName,
      ownerId: record.ownerId,
      ownerName: record.owner?.name ?? null,
      batchNo: record.batchNo,
      exceptionNote: record.remark,
      actualStartAt: record.actualStartAt?.toISOString() ?? null,
      actualEndAt: record.actualEndAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toAuditSnapshot(
    record: Prisma.ProductionPlanGetPayload<{
      include: typeof MASS_PRODUCTION_INCLUDE;
    }>,
  ) {
    return {
      id: record.id,
      planNo: record.planNo,
      planType: record.planType,
      status: record.status,
      productionDate: record.planDate?.toISOString() ?? null,
      plannedQuantity: record.quantity,
      actualQuantity: record.actualQuantity,
      workshop: record.workshop,
      lineName: record.lineName,
      ownerId: record.ownerId,
      ownerName: record.owner?.name ?? null,
      batchNo: record.batchNo,
      exceptionNote: record.remark ?? null,
      actualStartAt: record.actualStartAt?.toISOString() ?? null,
      actualEndAt: record.actualEndAt?.toISOString() ?? null,
    } satisfies Prisma.InputJsonValue;
  }

  private buildRecordNo() {
    return `MP-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  }
}
