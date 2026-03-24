import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  Prisma,
  ProcurementStatus,
  WorkflowAction,
  WorkflowNodeCode,
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
  canEditPaintProcurement,
  getPaintProcurementCompletionIssue,
  getPaintProcurementStageIssue,
  getProcurementStatusTransitionTarget,
  type ProcurementLifecycleAction,
} from './paint-procurements.rules';

type PaintProcurementDbClient = Prisma.TransactionClient | PrismaService;

type PaintProcurementCreateInput = {
  supplierId: string;
  procurementCode: string;
  materialName: string;
  batchNo: string;
  quantity: Prisma.Decimal;
  unit: string;
  arrivalDate: Date;
  note: string | null;
};

type PaintProcurementUpdateInput = {
  supplierId?: string;
  procurementCode?: string;
  materialName?: string;
  batchNo?: string;
  quantity?: Prisma.Decimal;
  unit?: string;
  arrivalDate?: Date;
  note?: string | null;
};

const PAINT_PROCUREMENT_DOWNSTREAM_NODES = [
  WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
  WorkflowNodeCode.PERFORMANCE_TEST,
  WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
] as const;

@Injectable()
export class PaintProcurementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  getWorkspace(projectId: string) {
    return this.buildWorkspace(this.prisma, projectId);
  }

  async createProcurement(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseCreateInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getProcurementContextOrThrow(tx, projectId);
      this.assertWritableProcurementStage(context);
      await this.getSupplierOrThrow(tx, input.supplierId);
      await this.assertUniqueProcurementCode(tx, projectId, input.procurementCode);

      const createdRecord = await tx.paintProcurement.create({
        data: {
          projectId,
          supplierId: input.supplierId,
          procurementCode: input.procurementCode,
          materialName: input.materialName,
          batchNo: input.batchNo,
          quantity: input.quantity,
          unit: input.unit,
          arrivalDate: input.arrivalDate,
          note: input.note,
          status: ProcurementStatus.DRAFT,
          requestedById: actor.id,
        },
        include: {
          supplier: true,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PAINT_PROCUREMENT,
        targetId: createdRecord.id,
        action: 'PAINT_PROCUREMENT_CREATED',
        nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
        summary: `创建采购记录 ${createdRecord.procurementCode}`,
        afterData: this.toProcurementAuditSnapshot(createdRecord),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async updateProcurement(
    projectId: string,
    procurementId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseUpdateInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getProcurementContextOrThrow(tx, projectId);
      this.assertWritableProcurementStage(context);
      const procurement = await this.getProcurementOrThrow(tx, projectId, procurementId);

      if (!canEditPaintProcurement(procurement.status)) {
        throw new BadRequestException('已到货或已取消的采购记录不允许编辑。');
      }

      if (input.supplierId) {
        await this.getSupplierOrThrow(tx, input.supplierId);
      }

      if (
        input.procurementCode &&
        input.procurementCode !== procurement.procurementCode
      ) {
        await this.assertUniqueProcurementCode(
          tx,
          projectId,
          input.procurementCode,
          procurement.id,
        );
      }

      const updatedRecord = await tx.paintProcurement.update({
        where: { id: procurementId },
        data: {
          ...(input.supplierId ? { supplierId: input.supplierId } : {}),
          ...(input.procurementCode ? { procurementCode: input.procurementCode } : {}),
          ...(input.materialName ? { materialName: input.materialName } : {}),
          ...(input.batchNo ? { batchNo: input.batchNo } : {}),
          ...(input.quantity ? { quantity: input.quantity } : {}),
          ...(input.unit ? { unit: input.unit } : {}),
          ...(input.arrivalDate ? { arrivalDate: input.arrivalDate } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
        include: {
          supplier: true,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PAINT_PROCUREMENT,
        targetId: procurement.id,
        action: 'PAINT_PROCUREMENT_UPDATED',
        nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
        summary: `更新采购记录 ${updatedRecord.procurementCode}`,
        beforeData: this.toProcurementAuditSnapshot(procurement),
        afterData: this.toProcurementAuditSnapshot(updatedRecord),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async orderProcurement(
    projectId: string,
    procurementId: string,
    actor: AuthenticatedUser,
  ) {
    return this.transitionProcurementStatus(
      projectId,
      procurementId,
      'ORDER',
      actor,
      'PAINT_PROCUREMENT_ORDERED',
      '采购记录已下单。',
    );
  }

  async markArrived(
    projectId: string,
    procurementId: string,
    actor: AuthenticatedUser,
  ) {
    return this.transitionProcurementStatus(
      projectId,
      procurementId,
      'MARK_ARRIVED',
      actor,
      'PAINT_PROCUREMENT_ARRIVED',
      '采购记录已标记到货。',
    );
  }

  async cancelProcurement(
    projectId: string,
    procurementId: string,
    actor: AuthenticatedUser,
  ) {
    return this.transitionProcurementStatus(
      projectId,
      procurementId,
      'CANCEL',
      actor,
      'PAINT_PROCUREMENT_CANCELLED',
      '采购记录已取消。',
    );
  }

  async completeTask(projectId: string, actor: AuthenticatedUser) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getProcurementContextOrThrow(tx, projectId);
      this.assertWritableProcurementStage(context);

      if (!context.activeTask) {
        throw new BadRequestException('当前没有可完成的涂料采购任务。');
      }

      const completionIssue = getPaintProcurementCompletionIssue(context.records);

      if (completionIssue) {
        throw new BadRequestException(completionIssue);
      }

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask.id,
        WorkflowAction.COMPLETE,
        actor,
        {
          comment: '涂料采购节点已完成，自动触发性能试验、标准板制作和首台生产计划。',
          metadata: {
            procurementCount: context.records.length,
            arrivedCount: context.records.filter(
              (record) => record.status === ProcurementStatus.ARRIVED,
            ).length,
          },
        },
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.WORKFLOW_TASK,
        targetId: context.activeTask.id,
        action: 'PAINT_PROCUREMENT_TASK_COMPLETED',
        nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
        summary: '涂料采购节点已完成。',
        afterData: {
          workflowTaskId: context.activeTask.id,
          procurementCount: context.records.length,
        },
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  private async transitionProcurementStatus(
    projectId: string,
    procurementId: string,
    action: ProcurementLifecycleAction,
    actor: AuthenticatedUser,
    auditAction: string,
    summary: string,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getProcurementContextOrThrow(tx, projectId);
      this.assertWritableProcurementStage(context);
      const procurement = await this.getProcurementOrThrow(tx, projectId, procurementId);
      const nextStatus = getProcurementStatusTransitionTarget(procurement.status, action);

      if (!nextStatus) {
        throw new BadRequestException('非法采购状态变更。');
      }

      const now = new Date();
      const updatedRecord = await tx.paintProcurement.update({
        where: { id: procurementId },
        data: {
          status: nextStatus,
          ...(action === 'ORDER' ? { orderedAt: now } : {}),
          ...(action === 'MARK_ARRIVED'
            ? { arrivalDate: procurement.arrivalDate ?? now, cancelledAt: null }
            : {}),
          ...(action === 'CANCEL' ? { cancelledAt: now } : {}),
        },
        include: {
          supplier: true,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PAINT_PROCUREMENT,
        targetId: procurementId,
        action: auditAction,
        nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
        summary: `${updatedRecord.procurementCode} ${summary}`,
        beforeData: this.toProcurementAuditSnapshot(procurement),
        afterData: this.toProcurementAuditSnapshot(updatedRecord),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  private async buildWorkspace(
    db: PaintProcurementDbClient,
    projectId: string,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [records, suppliers, activeTask, downstreamTasks] = await Promise.all([
      db.paintProcurement.findMany({
        where: {
          projectId,
        },
        include: {
          supplier: true,
        },
        orderBy: [
          { updatedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      db.supplier.findMany({
        orderBy: [
          { status: 'asc' },
          { supplierName: 'asc' },
        ],
      }),
      this.getActiveProcurementTask(db, projectId),
      db.workflowTask.findMany({
        where: {
          projectId,
          nodeCode: {
            in: [...PAINT_PROCUREMENT_DOWNSTREAM_NODES],
          },
        },
        include: {
          assigneeUser: true,
          assigneeDepartment: true,
        },
        orderBy: [
          { createdAt: 'desc' },
          { taskRound: 'desc' },
        ],
      }),
    ]);

    const downstreamTaskMap = new Map<WorkflowNodeCode, (typeof downstreamTasks)[number]>();

    for (const task of downstreamTasks) {
      if (!downstreamTaskMap.has(task.nodeCode)) {
        downstreamTaskMap.set(task.nodeCode, task);
      }
    }

    const completionIssue = getPaintProcurementCompletionIssue(records);

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        currentNodeCode: project.currentNodeCode,
        currentNodeName: getCurrentNodeName(project.currentNodeCode),
        targetDate: project.plannedEndDate?.toISOString() ?? null,
        riskLevel: project.priority,
      },
      activeTask: activeTask ? this.toWorkflowTaskSummary(activeTask) : null,
      canCompleteTask: activeTask ? completionIssue === null : false,
      completionIssue,
      statistics: {
        totalCount: records.length,
        arrivedCount: records.filter((record) => record.status === ProcurementStatus.ARRIVED).length,
        orderedCount: records.filter((record) => record.status === ProcurementStatus.ORDERED).length,
        cancelledCount: records.filter((record) => record.status === ProcurementStatus.CANCELLED).length,
      },
      suppliers: suppliers.map((supplier) => this.toSupplierSummary(supplier)),
      items: records.map((record) => this.toProcurementSummary(record)),
      downstreamTasks: {
        firstProductionPlan:
          downstreamTaskMap.get(WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN)
            ? this.toWorkflowTaskSummary(
                downstreamTaskMap.get(WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN)!,
              )
            : null,
        performanceTest:
          downstreamTaskMap.get(WorkflowNodeCode.PERFORMANCE_TEST)
            ? this.toWorkflowTaskSummary(
                downstreamTaskMap.get(WorkflowNodeCode.PERFORMANCE_TEST)!,
              )
            : null,
        standardBoardCreateDistribute:
          downstreamTaskMap.get(WorkflowNodeCode.STANDARD_BOARD_PRODUCTION)
            ? this.toWorkflowTaskSummary(
                downstreamTaskMap.get(WorkflowNodeCode.STANDARD_BOARD_PRODUCTION)!,
              )
            : null,
      },
    };
  }

  private async getProcurementContextOrThrow(
    db: PaintProcurementDbClient,
    projectId: string,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [activeTask, records] = await Promise.all([
      this.getActiveProcurementTask(db, projectId),
      db.paintProcurement.findMany({
        where: {
          projectId,
        },
      }),
    ]);

    return {
      project,
      activeTask,
      records,
    };
  }

  private assertWritableProcurementStage(context: {
    project: {
      currentNodeCode: WorkflowNodeCode | null;
    };
    activeTask: {
      id: string;
    } | null;
  }) {
    const stageIssue = getPaintProcurementStageIssue({
      currentNodeCode: context.project.currentNodeCode,
      hasActiveTask: Boolean(context.activeTask),
    });

    if (stageIssue) {
      throw new BadRequestException(stageIssue);
    }
  }

  private assertActorCanManage(actor: AuthenticatedUser) {
    if (
      actor.isSystemAdmin ||
      actor.roleCodes.some(
        (roleCode) =>
          roleCode === 'admin' ||
          roleCode === 'project_manager' ||
          roleCode === 'purchaser',
      )
    ) {
      return;
    }

    throw new BadRequestException('当前用户没有采购管理权限。');
  }

  private async getProjectOrThrow(db: PaintProcurementDbClient, projectId: string) {
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

  private async getSupplierOrThrow(
    db: PaintProcurementDbClient,
    supplierId: string,
  ) {
    const supplier = await db.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier) {
      throw new NotFoundException('供应商不存在。');
    }

    return supplier;
  }

  private async getActiveProcurementTask(
    db: PaintProcurementDbClient,
    projectId: string,
  ) {
    return db.workflowTask.findFirst({
      where: {
        projectId,
        nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
        isActive: true,
      },
      include: {
        assigneeUser: true,
        assigneeDepartment: true,
      },
      orderBy: [
        { createdAt: 'desc' },
        { taskRound: 'desc' },
      ],
    });
  }

  private async getProcurementOrThrow(
    db: PaintProcurementDbClient,
    projectId: string,
    procurementId: string,
  ) {
    const procurement = await db.paintProcurement.findFirst({
      where: {
        id: procurementId,
        projectId,
      },
      include: {
        supplier: true,
      },
    });

    if (!procurement) {
      throw new NotFoundException('采购记录不存在。');
    }

    return procurement;
  }

  private async assertUniqueProcurementCode(
    db: PaintProcurementDbClient,
    projectId: string,
    procurementCode: string,
    excludedProcurementId?: string,
  ) {
    const duplicatedRecord = await db.paintProcurement.findFirst({
      where: {
        projectId,
        procurementCode,
        ...(excludedProcurementId
          ? {
              NOT: {
                id: excludedProcurementId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (duplicatedRecord) {
      throw new BadRequestException('采购单号已存在。');
    }
  }

  private parseCreateInput(rawInput: unknown): PaintProcurementCreateInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('采购记录数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const supplierId = typeof input.supplierId === 'string' ? input.supplierId.trim() : '';
    const procurementCode =
      typeof input.procurementCode === 'string' ? input.procurementCode.trim() : '';
    const materialName =
      typeof input.materialName === 'string' ? input.materialName.trim() : '';
    const batchNo = typeof input.batchNo === 'string' ? input.batchNo.trim() : '';
    const quantity = this.parseDecimal(input.quantity, '采购数量');
    const unit = typeof input.unit === 'string' ? input.unit.trim() : '';
    const arrivalDate = this.parseDate(input.arrivalDate, '到货日期');
    const note =
      typeof input.note === 'string' && input.note.trim().length > 0
        ? input.note.trim()
        : null;

    if (!supplierId) {
      throw new BadRequestException('供应商不能为空。');
    }

    if (!procurementCode) {
      throw new BadRequestException('采购单号不能为空。');
    }

    if (!materialName) {
      throw new BadRequestException('物料名称不能为空。');
    }

    if (!batchNo) {
      throw new BadRequestException('批次号不能为空。');
    }

    if (!unit) {
      throw new BadRequestException('单位不能为空。');
    }

    return {
      supplierId,
      procurementCode,
      materialName,
      batchNo,
      quantity,
      unit,
      arrivalDate,
      note,
    };
  }

  private parseUpdateInput(rawInput: unknown): PaintProcurementUpdateInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('采购记录数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const supplierId =
      typeof input.supplierId === 'string' && input.supplierId.trim().length > 0
        ? input.supplierId.trim()
        : undefined;
    const procurementCode =
      typeof input.procurementCode === 'string' && input.procurementCode.trim().length > 0
        ? input.procurementCode.trim()
        : undefined;
    const materialName =
      typeof input.materialName === 'string' && input.materialName.trim().length > 0
        ? input.materialName.trim()
        : undefined;
    const batchNo =
      typeof input.batchNo === 'string' && input.batchNo.trim().length > 0
        ? input.batchNo.trim()
        : undefined;
    const quantity =
      input.quantity === undefined
        ? undefined
        : this.parseDecimal(input.quantity, '采购数量');
    const unit =
      typeof input.unit === 'string' && input.unit.trim().length > 0
        ? input.unit.trim()
        : undefined;
    const arrivalDate =
      input.arrivalDate === undefined
        ? undefined
        : this.parseDate(input.arrivalDate, '到货日期');
    const note =
      input.note === undefined
        ? undefined
        : typeof input.note === 'string' && input.note.trim().length > 0
          ? input.note.trim()
          : null;

    if (
      supplierId === undefined &&
      procurementCode === undefined &&
      materialName === undefined &&
      batchNo === undefined &&
      quantity === undefined &&
      unit === undefined &&
      arrivalDate === undefined &&
      note === undefined
    ) {
      throw new BadRequestException('至少提交一个要更新的字段。');
    }

    return {
      ...(supplierId ? { supplierId } : {}),
      ...(procurementCode ? { procurementCode } : {}),
      ...(materialName ? { materialName } : {}),
      ...(batchNo ? { batchNo } : {}),
      ...(quantity ? { quantity } : {}),
      ...(unit ? { unit } : {}),
      ...(arrivalDate ? { arrivalDate } : {}),
      ...(note !== undefined ? { note } : {}),
    };
  }

  private parseDecimal(value: unknown, label: string) {
    if (typeof value !== 'number' && typeof value !== 'string') {
      throw new BadRequestException(`${label}不能为空。`);
    }

    const normalizedValue = typeof value === 'string' ? value.trim() : String(value);

    if (!normalizedValue) {
      throw new BadRequestException(`${label}不能为空。`);
    }

    const parsedValue = Number(normalizedValue);

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      throw new BadRequestException(`${label}必须大于 0。`);
    }

    return new Prisma.Decimal(normalizedValue);
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

  private toSupplierSummary(
    supplier: Prisma.SupplierGetPayload<Record<string, never>>,
  ) {
    return {
      id: supplier.id,
      supplierCode: supplier.supplierCode,
      supplierName: supplier.supplierName,
      contactName: supplier.contactName,
      contactPhone: supplier.contactPhone,
      status: supplier.status,
    };
  }

  private toProcurementSummary(
    procurement: Prisma.PaintProcurementGetPayload<{
      include: {
        supplier: true;
      };
    }>,
  ) {
    return {
      id: procurement.id,
      procurementCode: procurement.procurementCode,
      supplierId: procurement.supplierId,
      materialName: procurement.materialName,
      batchNo: procurement.batchNo,
      quantity: procurement.quantity?.toString() ?? null,
      unit: procurement.unit,
      arrivalDate: procurement.arrivalDate?.toISOString() ?? null,
      status: procurement.status,
      note: procurement.note,
      orderedAt: procurement.orderedAt?.toISOString() ?? null,
      cancelledAt: procurement.cancelledAt?.toISOString() ?? null,
      createdAt: procurement.createdAt.toISOString(),
      updatedAt: procurement.updatedAt.toISOString(),
      supplier: procurement.supplier ? this.toSupplierSummary(procurement.supplier) : null,
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

  private toProcurementAuditSnapshot(
    procurement: Prisma.PaintProcurementGetPayload<{
      include: {
        supplier: true;
      };
    }>,
  ) {
    return {
      id: procurement.id,
      procurementCode: procurement.procurementCode,
      supplierId: procurement.supplierId,
      supplierName: procurement.supplier?.supplierName ?? null,
      materialName: procurement.materialName,
      batchNo: procurement.batchNo,
      quantity: procurement.quantity?.toString() ?? null,
      unit: procurement.unit,
      arrivalDate: procurement.arrivalDate?.toISOString() ?? null,
      status: procurement.status,
      note: procurement.note,
    } satisfies Prisma.InputJsonValue;
  }
}
