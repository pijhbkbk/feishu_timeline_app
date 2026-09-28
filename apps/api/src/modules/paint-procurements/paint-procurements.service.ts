import { assertTeamTaskById, withProjectWrite } from '../../common/team-authorization';
import {
  BadRequestException,
  ConflictException,
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
import { ProjectAccessService } from '../auth/project-access.service';
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
const PAINT_PROCUREMENT_RECORD_LIMIT = 100;
const PAINT_PROCUREMENT_MAX_PAYLOAD_BYTES = 16 * 1024;
const PAINT_PROCUREMENT_ID_MAX_CHARS = 64;
const PAINT_PROCUREMENT_CODE_MAX_CHARS = 64;
const PAINT_PROCUREMENT_NAME_MAX_CHARS = 200;
const PAINT_PROCUREMENT_UNIT_MAX_CHARS = 32;
const PAINT_PROCUREMENT_NOTE_MAX_CHARS = 4_000;
const PAINT_PROCUREMENT_DECIMAL_PATTERN = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/;
const PAINT_PROCUREMENT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const PAINT_PROCUREMENT_CODE_PATTERN = /^[A-Za-z0-9._-]+$/;

@Injectable()
export class PaintProcurementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly workflowsService: WorkflowsService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  async getWorkspace(projectId: string, actor: AuthenticatedUser) {
    await this.assertProjectAccess(projectId, actor, 'project.read');
    return this.buildWorkspace(this.prisma, projectId);
  }

  async createProcurement(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseCreateInput(rawInput);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const context = await this.lockActiveProcurementTaskAndGetContext(tx, actor, projectId);
      this.assertProcurementRecordCapacity(context.records, true);
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseUpdateInput(rawInput);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      await this.lockProcurementRow(tx, projectId, procurementId);
      const procurement = await this.getProcurementOrThrow(tx, projectId, procurementId);
      await this.lockActiveProcurementTaskAndGetContext(tx, actor, projectId);

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

      const claimed = await tx.paintProcurement.updateMany({
        where: {
          id: procurementId,
          projectId,
          status: procurement.status,
          updatedAt: procurement.updatedAt,
        },
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
      });
      if (claimed.count !== 1) {
        this.throwProcurementStateChanged();
      }
      const updatedRecord = await tx.paintProcurement.findUniqueOrThrow({
        where: { id: procurementId },
        include: { supplier: true },
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const context = await this.lockActiveProcurementTaskAndGetContext(
        tx, actor,
        projectId,
      );

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

  private assertProjectAccess(
    projectId: string,
    actor: AuthenticatedUser,
    requiredPermission: 'project.read' | 'workflow.transition',
  ) {
    return this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      requiredPermission,
    );
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

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      await this.lockProcurementRow(tx, projectId, procurementId);
      const procurement = await this.getProcurementOrThrow(tx, projectId, procurementId);
      await this.lockActiveProcurementTaskAndGetContext(tx, actor, projectId);
      const nextStatus = getProcurementStatusTransitionTarget(procurement.status, action);

      if (!nextStatus) {
        throw new BadRequestException('非法采购状态变更。');
      }

      const now = new Date();
      const claimed = await tx.paintProcurement.updateMany({
        where: {
          id: procurementId,
          projectId,
          status: procurement.status,
          updatedAt: procurement.updatedAt,
        },
        data: {
          status: nextStatus,
          ...(action === 'ORDER' ? { orderedAt: now } : {}),
          ...(action === 'MARK_ARRIVED'
            ? { arrivalDate: procurement.arrivalDate ?? now, cancelledAt: null }
            : {}),
          ...(action === 'CANCEL' ? { cancelledAt: now } : {}),
        },
      });
      if (claimed.count !== 1) {
        this.throwProcurementStateChanged();
      }
      const updatedRecord = await tx.paintProcurement.findUniqueOrThrow({
        where: { id: procurementId },
        include: { supplier: true },
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
        take: PAINT_PROCUREMENT_RECORD_LIMIT + 1,
      }),
      db.supplier.findMany({
        orderBy: [
          { status: 'asc' },
          { supplierName: 'asc' },
          { id: 'asc' },
        ],
        take: 100,
      }),
      this.getActiveProcurementTask(db, projectId),
      Promise.all(
        PAINT_PROCUREMENT_DOWNSTREAM_NODES.map((nodeCode) =>
          db.workflowTask.findFirst({
            where: {
              projectId,
              nodeCode,
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
        ),
      ),
    ]);
    this.assertProcurementRecordCapacity(records, false);

    const downstreamTaskMap = new Map<
      WorkflowNodeCode,
      NonNullable<(typeof downstreamTasks)[number]>
    >();

    for (const task of downstreamTasks) {
      if (task) {
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
        take: PAINT_PROCUREMENT_RECORD_LIMIT + 1,
      }),
    ]);

    this.assertProcurementRecordCapacity(records, false);

    return {
      project,
      activeTask,
      records,
    };
  }

  private async lockActiveProcurementTaskAndGetContext(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    projectId: string,
  ) {
    const lockedTasks = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "workflow_tasks"
      WHERE "projectId" = ${projectId}
        AND "nodeCode" = ${WorkflowNodeCode.PAINT_PROCUREMENT}::"WorkflowNodeCode"
        AND "isActive" = true
      ORDER BY "createdAt" DESC, "taskRound" DESC
      LIMIT 1
      FOR UPDATE
    `);
    const lockedTaskId = lockedTasks[0]?.id;
    if (!lockedTaskId) {
      this.throwProcurementStateChanged();
    }

    const context = await this.getProcurementContextOrThrow(tx, projectId);
    this.assertWritableProcurementStage(context);
    if (context.activeTask?.id !== lockedTaskId) {
      this.throwProcurementStateChanged();
    }
    await assertTeamTaskById(tx, context.activeTask!.id, actor);
    return context;
  }

  private async lockProcurementRow(
    tx: Prisma.TransactionClient,
    projectId: string,
    procurementId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "paint_procurements"
      WHERE "id" = ${procurementId} AND "projectId" = ${projectId}
      FOR UPDATE
    `);
    if (rows.length !== 1) {
      throw new NotFoundException('采购记录不存在。');
    }
  }

  private throwProcurementStateChanged(): never {
    throw new ConflictException({
      code: 'PAINT_PROCUREMENT_STATE_CHANGED',
      message: '采购记录或流程状态已变更，请刷新后重试。',
    });
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

    this.assertProcurementId(supplierId, '供应商');
    this.assertProcurementCode(procurementCode, '采购单号');
    this.assertProcurementText(materialName, '物料名称', PAINT_PROCUREMENT_NAME_MAX_CHARS);
    this.assertProcurementCode(batchNo, '批次号');
    this.assertProcurementText(unit, '单位', PAINT_PROCUREMENT_UNIT_MAX_CHARS);
    if (note) {
      this.assertProcurementText(note, '备注', PAINT_PROCUREMENT_NOTE_MAX_CHARS);
    }

    const normalized = {
      supplierId,
      procurementCode,
      materialName,
      batchNo,
      quantity,
      unit,
      arrivalDate,
      note,
    };
    this.assertProcurementPayloadBytes(normalized);
    return normalized;
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

    if (supplierId) this.assertProcurementId(supplierId, '供应商');
    if (procurementCode) this.assertProcurementCode(procurementCode, '采购单号');
    if (materialName) {
      this.assertProcurementText(
        materialName,
        '物料名称',
        PAINT_PROCUREMENT_NAME_MAX_CHARS,
      );
    }
    if (batchNo) this.assertProcurementCode(batchNo, '批次号');
    if (unit) this.assertProcurementText(unit, '单位', PAINT_PROCUREMENT_UNIT_MAX_CHARS);
    if (note) this.assertProcurementText(note, '备注', PAINT_PROCUREMENT_NOTE_MAX_CHARS);

    const normalized = {
      ...(supplierId ? { supplierId } : {}),
      ...(procurementCode ? { procurementCode } : {}),
      ...(materialName ? { materialName } : {}),
      ...(batchNo ? { batchNo } : {}),
      ...(quantity ? { quantity } : {}),
      ...(unit ? { unit } : {}),
      ...(arrivalDate ? { arrivalDate } : {}),
      ...(note !== undefined ? { note } : {}),
    };
    this.assertProcurementPayloadBytes(normalized);
    return normalized;
  }

  private parseDecimal(value: unknown, label: string) {
    if (typeof value !== 'number' && typeof value !== 'string') {
      throw new BadRequestException(`${label}不能为空。`);
    }

    const normalizedValue = typeof value === 'string' ? value.trim() : String(value);

    if (!normalizedValue) {
      throw new BadRequestException(`${label}不能为空。`);
    }

    if (
      !PAINT_PROCUREMENT_DECIMAL_PATTERN.test(normalizedValue) ||
      new Prisma.Decimal(normalizedValue).lessThanOrEqualTo(0)
    ) {
      this.throwProcurementInputOutOfBounds(
        `${label}必须为大于 0 且最多 15 位整数、3 位小数的数值。`,
      );
    }

    return new Prisma.Decimal(normalizedValue);
  }

  private assertProcurementRecordCapacity(records: readonly unknown[], forCreate: boolean) {
    if (
      records.length > PAINT_PROCUREMENT_RECORD_LIMIT ||
      (forCreate && records.length >= PAINT_PROCUREMENT_RECORD_LIMIT)
    ) {
      throw new ConflictException({
        code: 'PAINT_PROCUREMENT_RECORD_LIMIT_EXCEEDED',
        message: `每个项目最多保留 ${PAINT_PROCUREMENT_RECORD_LIMIT} 条采购记录。`,
      });
    }
  }

  private assertProcurementId(value: string, label: string) {
    if (
      value.length > PAINT_PROCUREMENT_ID_MAX_CHARS ||
      !PAINT_PROCUREMENT_ID_PATTERN.test(value)
    ) {
      this.throwProcurementInputOutOfBounds(`${label}标识不合法。`);
    }
  }

  private assertProcurementCode(value: string, label: string) {
    if (
      value.length > PAINT_PROCUREMENT_CODE_MAX_CHARS ||
      !PAINT_PROCUREMENT_CODE_PATTERN.test(value)
    ) {
      this.throwProcurementInputOutOfBounds(
        `${label}仅允许 1～${PAINT_PROCUREMENT_CODE_MAX_CHARS} 位字母、数字、点、下划线或连字符。`,
      );
    }
  }

  private assertProcurementText(value: string, label: string, maxChars: number) {
    if (value.length > maxChars) {
      this.throwProcurementInputOutOfBounds(`${label}不得超过 ${maxChars} 个字符。`);
    }
  }

  private assertProcurementPayloadBytes(value: object) {
    if (
      Buffer.byteLength(JSON.stringify(value), 'utf8') >
      PAINT_PROCUREMENT_MAX_PAYLOAD_BYTES
    ) {
      this.throwProcurementInputOutOfBounds(
        `采购记录不得超过 ${PAINT_PROCUREMENT_MAX_PAYLOAD_BYTES} 字节。`,
      );
    }
  }

  private throwProcurementInputOutOfBounds(message: string): never {
    throw new BadRequestException({
      code: 'PAINT_PROCUREMENT_INPUT_OUT_OF_BOUNDS',
      message,
    });
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
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
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
