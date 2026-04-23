import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  DevelopmentFeeStatus,
  DevelopmentFeeType,
  Prisma,
  SystemParameterValueType,
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
  canEditDevelopmentFee,
  FEE_MANAGEMENT_ROLE_CODES,
  getDevelopmentFeeAmountIssue,
  getDevelopmentFeeCompletionIssue,
  getDevelopmentFeeNodeCode,
  getDevelopmentFeeStageIssue,
  getDevelopmentFeeStatusTransitionTarget,
  type FeeLifecycleAction,
} from './fees.rules';

type FeesDbClient = Prisma.TransactionClient | PrismaService;

type DevelopmentFeeCreateInput = {
  feeType: DevelopmentFeeType;
  amount: Prisma.Decimal;
  currency: string;
  payer: string;
  recordedAt: Date;
  note: string | null;
};

const DEVELOPMENT_FEE_NODE_CODE = getDevelopmentFeeNodeCode();

@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  getWorkspace(projectId: string) {
    return this.buildWorkspace(this.prisma, projectId);
  }

  async createFee(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getFeeContext(tx, projectId);
      this.assertWritableFeeStage(context);
      await this.assertFixedFeeAmount(tx, input.amount);

      const createdRecord = await tx.developmentFee.create({
        data: {
          projectId,
          feeType: input.feeType,
          amount: input.amount,
          currency: input.currency,
          payer: input.payer,
          payStatus: DevelopmentFeeStatus.PENDING,
          occurredAt: input.recordedAt,
          recordedAt: input.recordedAt,
          note: input.note,
          remark: input.note,
          createdById: actor.id,
          recordedById: actor.id,
        },
        include: {
          recordedBy: true,
          createdBy: true,
        },
      });

      await this.startTaskIfNeeded(tx, context.activeTask!, actor, '颜色开发收费记录已创建，节点开始处理。');

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.DEVELOPMENT_FEE,
        targetId: createdRecord.id,
        action: 'DEVELOPMENT_FEE_CREATED',
        nodeCode: DEVELOPMENT_FEE_NODE_CODE,
        summary: `创建开发收费记录 ${createdRecord.id}`,
        afterData: this.toFeeAuditSnapshot(createdRecord),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async updateFee(
    projectId: string,
    feeId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getFeeContext(tx, projectId);
      this.assertWritableFeeStage(context);
      await this.assertFixedFeeAmount(tx, input.amount);
      const feeRecord = await this.getFeeOrThrow(tx, projectId, feeId);

      if (!canEditDevelopmentFee(feeRecord.payStatus)) {
        throw new BadRequestException('已支付或已取消的收费记录不允许编辑。');
      }

      const updatedRecord = await tx.developmentFee.update({
        where: { id: feeId },
        data: {
          feeType: input.feeType,
          amount: input.amount,
          currency: input.currency,
          payer: input.payer,
          occurredAt: input.recordedAt,
          recordedAt: input.recordedAt,
          note: input.note,
          remark: input.note,
          recordedById: actor.id,
        },
        include: {
          recordedBy: true,
          createdBy: true,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.DEVELOPMENT_FEE,
        targetId: feeId,
        action: 'DEVELOPMENT_FEE_UPDATED',
        nodeCode: DEVELOPMENT_FEE_NODE_CODE,
        summary: `更新开发收费记录 ${feeId}`,
        beforeData: this.toFeeAuditSnapshot(feeRecord),
        afterData: this.toFeeAuditSnapshot(updatedRecord),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async markRecorded(
    projectId: string,
    feeId: string,
    actor: AuthenticatedUser,
  ) {
    return this.transitionFeeStatus(
      projectId,
      feeId,
      'MARK_RECORDED',
      actor,
      'DEVELOPMENT_FEE_RECORDED',
      '开发收费记录已记账。',
    );
  }

  async markPaid(
    projectId: string,
    feeId: string,
    actor: AuthenticatedUser,
  ) {
    return this.transitionFeeStatus(
      projectId,
      feeId,
      'MARK_PAID',
      actor,
      'DEVELOPMENT_FEE_PAID',
      '开发收费记录已支付。',
    );
  }

  async cancelFee(
    projectId: string,
    feeId: string,
    actor: AuthenticatedUser,
  ) {
    return this.transitionFeeStatus(
      projectId,
      feeId,
      'CANCEL',
      actor,
      'DEVELOPMENT_FEE_CANCELLED',
      '开发收费记录已取消。',
    );
  }

  async completeTask(projectId: string, actor: AuthenticatedUser) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getFeeContext(tx, projectId);
      this.assertWritableFeeStage(context);

      if (!context.activeTask) {
        throw new BadRequestException('当前没有可完成的颜色开发收费任务。');
      }

      const completionIssue = getDevelopmentFeeCompletionIssue(context.records);

      if (completionIssue) {
        throw new BadRequestException(completionIssue);
      }

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask.id,
        WorkflowAction.COMPLETE,
        actor,
        {
          comment: '颜色开发收费节点已完成。',
          metadata: {
            feeCount: context.records.length,
            paidCount: context.records.filter(
              (item) => item.payStatus === DevelopmentFeeStatus.PAID,
            ).length,
          },
        },
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.WORKFLOW_TASK,
        targetId: context.activeTask.id,
        action: 'DEVELOPMENT_FEE_TASK_COMPLETED',
        nodeCode: DEVELOPMENT_FEE_NODE_CODE,
        summary: '颜色开发收费节点已完成。',
        afterData: {
          workflowTaskId: context.activeTask.id,
          feeCount: context.records.length,
        },
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  private async transitionFeeStatus(
    projectId: string,
    feeId: string,
    action: FeeLifecycleAction,
    actor: AuthenticatedUser,
    auditAction: string,
    summary: string,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getFeeContext(tx, projectId);
      this.assertWritableFeeStage(context);
      const feeRecord = await this.getFeeOrThrow(tx, projectId, feeId);
      const nextStatus = getDevelopmentFeeStatusTransitionTarget(feeRecord.payStatus, action);

      if (!nextStatus) {
        throw new BadRequestException('非法收费状态变更。');
      }

      await this.startTaskIfNeeded(tx, context.activeTask!, actor, '颜色开发收费记录开始处理。');

      const now = new Date();
      const updatedRecord = await tx.developmentFee.update({
        where: { id: feeId },
        data: {
          payStatus: nextStatus,
          recordedById: actor.id,
          ...(action === 'MARK_RECORDED'
            ? {
                recordedAt: feeRecord.recordedAt ?? now,
                cancelledAt: null,
              }
            : {}),
          ...(action === 'MARK_PAID'
            ? {
                recordedAt: feeRecord.recordedAt ?? now,
                completedAt: now,
                cancelledAt: null,
              }
            : {}),
          ...(action === 'CANCEL'
            ? {
                cancelledAt: now,
                completedAt: null,
              }
            : {}),
        },
        include: {
          recordedBy: true,
          createdBy: true,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.DEVELOPMENT_FEE,
        targetId: feeId,
        action: auditAction,
        nodeCode: DEVELOPMENT_FEE_NODE_CODE,
        summary: `${updatedRecord.id} ${summary}`,
        beforeData: this.toFeeAuditSnapshot(feeRecord),
        afterData: this.toFeeAuditSnapshot(updatedRecord),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  private async buildWorkspace(
    db: FeesDbClient,
    projectId: string,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [records, activeTask, cabinReviewApproved, fixedAmount] = await Promise.all([
      db.developmentFee.findMany({
        where: { projectId },
        include: {
          recordedBy: true,
          createdBy: true,
        },
        orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.getActiveTask(db, projectId),
      this.hasApprovedOrCompletedWorkflowTask(db, projectId, WorkflowNodeCode.CAB_REVIEW),
      this.getFixedFeeAmount(db),
    ]);

    return {
      project: this.toProjectSummary(project),
      cabinReviewApproved,
      fixedAmount: fixedAmount.toString(),
      activeTask: activeTask ? this.toWorkflowTaskSummary(activeTask) : null,
      canCompleteTask: activeTask
        ? getDevelopmentFeeCompletionIssue(records) === null
        : false,
      completionIssue: activeTask
        ? getDevelopmentFeeCompletionIssue(records)
        : '当前没有活跃的颜色开发收费任务。',
      statistics: {
        totalCount: records.length,
        pendingCount: records.filter((item) => item.payStatus === DevelopmentFeeStatus.PENDING)
          .length,
        recordedCount: records.filter((item) => item.payStatus === DevelopmentFeeStatus.RECORDED)
          .length,
        paidCount: records.filter((item) => item.payStatus === DevelopmentFeeStatus.PAID).length,
        cancelledCount: records.filter(
          (item) => item.payStatus === DevelopmentFeeStatus.CANCELLED,
        ).length,
      },
      items: records.map((record) => this.toFeeSummary(record)),
    };
  }

  private async getFeeContext(db: FeesDbClient, projectId: string) {
    const [project, activeTask, cabinReviewApproved, records] = await Promise.all([
      this.getProjectOrThrow(db, projectId),
      this.getActiveTask(db, projectId),
      this.hasApprovedOrCompletedWorkflowTask(db, projectId, WorkflowNodeCode.CAB_REVIEW),
      db.developmentFee.findMany({
        where: { projectId },
        select: {
          id: true,
          payStatus: true,
        },
      }),
    ]);

    return {
      project,
      activeTask,
      cabinReviewApproved,
      records,
    };
  }

  private async getFixedFeeAmount(db: FeesDbClient) {
    const parameter = await db.systemParameter.findUnique({
      where: {
        category_code: {
          category: 'WORKFLOW',
          code: 'DEVELOPMENT_FEE_FIXED_AMOUNT',
        },
      },
      select: {
        valueType: true,
        valueNumber: true,
      },
    });

    if (
      parameter?.valueType === SystemParameterValueType.NUMBER &&
      parameter.valueNumber
    ) {
      return Number(parameter.valueNumber);
    }

    return 10000;
  }

  private async assertFixedFeeAmount(
    db: FeesDbClient,
    amount: Prisma.Decimal,
  ) {
    const fixedAmount = await this.getFixedFeeAmount(db);
    const issue = getDevelopmentFeeAmountIssue(Number(amount.toString()), fixedAmount);

    if (issue) {
      throw new BadRequestException(issue);
    }
  }

  private assertWritableFeeStage(context: {
    cabinReviewApproved: boolean;
    activeTask: { id: string } | null;
  }) {
    const issue = getDevelopmentFeeStageIssue({
      cabinReviewApproved: context.cabinReviewApproved,
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
        FEE_MANAGEMENT_ROLE_CODES.includes(
          roleCode as (typeof FEE_MANAGEMENT_ROLE_CODES)[number],
        ),
      )
    ) {
      return;
    }

    throw new BadRequestException('当前用户没有颜色开发收费权限。');
  }

  private async getProjectOrThrow(db: FeesDbClient, projectId: string) {
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

  private async getActiveTask(db: FeesDbClient, projectId: string) {
    return db.workflowTask.findFirst({
      where: {
        projectId,
        nodeCode: DEVELOPMENT_FEE_NODE_CODE,
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
    db: FeesDbClient,
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

  private async getFeeOrThrow(
    db: FeesDbClient,
    projectId: string,
    feeId: string,
  ) {
    const feeRecord = await db.developmentFee.findFirst({
      where: {
        id: feeId,
        projectId,
      },
      include: {
        recordedBy: true,
        createdBy: true,
      },
    });

    if (!feeRecord) {
      throw new NotFoundException('收费记录不存在。');
    }

    return feeRecord;
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

  private parseWriteInput(rawInput: unknown): DevelopmentFeeCreateInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('收费记录数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const feeType =
      typeof input.feeType === 'string' &&
      Object.values(DevelopmentFeeType).includes(input.feeType as DevelopmentFeeType)
        ? (input.feeType as DevelopmentFeeType)
        : null;
    const amount =
      typeof input.amount === 'number'
        ? input.amount
        : typeof input.amount === 'string'
          ? Number(input.amount)
          : NaN;
    const currency =
      typeof input.currency === 'string' && input.currency.trim().length > 0
        ? input.currency.trim().toUpperCase()
        : 'CNY';
    const payer = typeof input.payer === 'string' ? input.payer.trim() : '';
    const note =
      typeof input.note === 'string' && input.note.trim().length > 0
        ? input.note.trim()
        : null;

    if (!feeType) {
      throw new BadRequestException('费用类型不能为空。');
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('金额必须大于 0。');
    }

    if (!payer) {
      throw new BadRequestException('付款方不能为空。');
    }

    return {
      feeType,
      amount: new Prisma.Decimal(amount),
      currency,
      payer,
      note,
      recordedAt: this.parseDate(input.recordedAt, '记录时间'),
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

  private toFeeSummary(
    feeRecord: Prisma.DevelopmentFeeGetPayload<{
      include: {
        recordedBy: true;
        createdBy: true;
      };
    }>,
  ) {
    return {
      id: feeRecord.id,
      feeType: feeRecord.feeType,
      amount: feeRecord.amount.toString(),
      currency: feeRecord.currency,
      payer: feeRecord.payer,
      payStatus: feeRecord.payStatus,
      recordedById: feeRecord.recordedById,
      recordedByName: feeRecord.recordedBy?.name ?? null,
      createdById: feeRecord.createdById,
      createdByName: feeRecord.createdBy?.name ?? null,
      recordedAt: feeRecord.recordedAt?.toISOString() ?? null,
      completedAt: feeRecord.completedAt?.toISOString() ?? null,
      cancelledAt: feeRecord.cancelledAt?.toISOString() ?? null,
      note: feeRecord.note ?? feeRecord.remark,
      createdAt: feeRecord.createdAt.toISOString(),
      updatedAt: feeRecord.updatedAt.toISOString(),
    };
  }

  private toFeeAuditSnapshot(
    feeRecord: Prisma.DevelopmentFeeGetPayload<{
      include: {
        recordedBy: true;
        createdBy: true;
      };
    }>,
  ) {
    return {
      id: feeRecord.id,
      feeType: feeRecord.feeType,
      amount: feeRecord.amount.toString(),
      currency: feeRecord.currency,
      payer: feeRecord.payer,
      payStatus: feeRecord.payStatus,
      recordedById: feeRecord.recordedById,
      recordedByName: feeRecord.recordedBy?.name ?? null,
      recordedAt: feeRecord.recordedAt?.toISOString() ?? null,
      completedAt: feeRecord.completedAt?.toISOString() ?? null,
      cancelledAt: feeRecord.cancelledAt?.toISOString() ?? null,
      note: feeRecord.note ?? feeRecord.remark ?? null,
    } satisfies Prisma.InputJsonValue;
  }
}
