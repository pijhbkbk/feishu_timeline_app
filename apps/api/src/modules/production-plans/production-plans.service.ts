import { assertApprovedTeamMember } from '../../common/team-membership';
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
import { ProjectAccessService } from '../auth/project-access.service';
import {
  getAllowedWorkflowActions,
  getCurrentNodeName,
  isWorkflowActionCurrentlyAvailable,
} from '../workflows/workflow-node.constants';
import { WorkflowsService } from '../workflows/workflows.service';
import {
  canCancelSchedulePlan,
  canConfirmSchedulePlan,
  canEditSchedulePlan,
  getSchedulePlanCompletionIssue,
  getSchedulePlanNodeCode,
  getSchedulePlanStageIssue,
} from './production-plans.rules';

type ProductionPlansDbClient = Prisma.TransactionClient | PrismaService;

type SchedulePlanWriteInput = {
  planDate: Date;
  plannedQuantity: number;
  workshop: string;
  lineName: string;
  ownerId: string;
  batchNo: string;
  note: string | null;
};

const SCHEDULE_PLAN_NODE_CODE = getSchedulePlanNodeCode();
const SCHEDULE_PLAN_RECORD_LIMIT = 100;
const SCHEDULE_PLAN_MAX_PAYLOAD_BYTES = 16 * 1024;
const SCHEDULE_PLAN_NAME_MAX_CHARS = 200;
const SCHEDULE_PLAN_ID_MAX_CHARS = 64;
const SCHEDULE_PLAN_CODE_MAX_CHARS = 64;
const SCHEDULE_PLAN_NOTE_MAX_CHARS = 4_000;
const SCHEDULE_PLAN_MAX_QUANTITY = 2_147_483_647;
const SCHEDULE_PLAN_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SCHEDULE_PLAN_CODE_PATTERN = /^[A-Za-z0-9._-]+$/;

const SCHEDULE_PLAN_INCLUDE = {
  owner: true,
  confirmedBy: true,
  createdBy: true,
} satisfies Prisma.ProductionPlanInclude;

@Injectable()
export class ProductionPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly workflowsService: WorkflowsService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  async getScheduleWorkspace(projectId: string, actor: AuthenticatedUser) {
    await this.assertProjectAccess(projectId, actor, 'project.read');
    return this.buildScheduleWorkspace(this.prisma, projectId);
  }

  async createSchedulePlan(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseSchedulePlanWriteInput(rawInput);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const context = await this.lockActiveScheduleTaskAndGetContext(
        tx, actor,
        projectId,
      );
      this.assertSchedulePlanRecordCapacity(context.items, true);
      await this.getUserOrThrow(tx, input.ownerId);
      await this.startTaskIfNeeded(tx, context.activeTask!, actor, '排产计划已开始处理。');

      const createdPlan = await tx.productionPlan.create({
        data: {
          projectId,
          createdById: actor.id,
          ownerId: input.ownerId,
          planNo: this.buildSchedulePlanNo(),
          planType: ProductionPlanType.SCHEDULE,
          status: ProductionPlanStatus.DRAFT,
          quantity: input.plannedQuantity,
          planDate: input.planDate,
          lineName: input.lineName,
          workshop: input.workshop,
          batchNo: input.batchNo,
          remark: input.note,
        },
        include: SCHEDULE_PLAN_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PRODUCTION_PLAN,
        targetId: createdPlan.id,
        action: 'SCHEDULE_PLAN_CREATED',
        nodeCode: SCHEDULE_PLAN_NODE_CODE,
        summary: `创建排产计划 ${createdPlan.planNo}`,
        afterData: this.toSchedulePlanAuditSnapshot(createdPlan),
      });
    });

    return this.buildScheduleWorkspace(this.prisma, projectId);
  }

  async updateSchedulePlan(
    projectId: string,
    planId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseSchedulePlanWriteInput(rawInput);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      await this.lockSchedulePlanRow(tx, projectId, planId);
      const plan = await this.getSchedulePlanOrThrow(tx, projectId, planId);
      await this.lockActiveScheduleTaskAndGetContext(tx, actor, projectId);

      if (!canEditSchedulePlan(plan.status)) {
        throw new BadRequestException('已确认的排产计划不允许编辑。');
      }

      await this.getUserOrThrow(tx, input.ownerId);

      const claimed = await tx.productionPlan.updateMany({
        where: {
          id: planId,
          projectId,
          planType: ProductionPlanType.SCHEDULE,
          status: plan.status,
          updatedAt: plan.updatedAt,
        },
        data: {
          ownerId: input.ownerId,
          quantity: input.plannedQuantity,
          planDate: input.planDate,
          lineName: input.lineName,
          workshop: input.workshop,
          batchNo: input.batchNo,
          remark: input.note,
        },
      });
      if (claimed.count !== 1) {
        this.throwSchedulePlanStateChanged();
      }
      const updatedPlan = await tx.productionPlan.findUniqueOrThrow({
        where: { id: planId },
        include: SCHEDULE_PLAN_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PRODUCTION_PLAN,
        targetId: plan.id,
        action: 'SCHEDULE_PLAN_UPDATED',
        nodeCode: SCHEDULE_PLAN_NODE_CODE,
        summary: `更新排产计划 ${updatedPlan.planNo}`,
        beforeData: this.toSchedulePlanAuditSnapshot(plan),
        afterData: this.toSchedulePlanAuditSnapshot(updatedPlan),
      });
    });

    return this.buildScheduleWorkspace(this.prisma, projectId);
  }

  async confirmSchedulePlan(
    projectId: string,
    planId: string,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      await this.lockSchedulePlanRow(tx, projectId, planId);
      const plan = await this.getSchedulePlanOrThrow(tx, projectId, planId);
      await this.lockActiveScheduleTaskAndGetContext(tx, actor, projectId);

      if (!canConfirmSchedulePlan(plan.status)) {
        throw new BadRequestException('当前排产计划状态不允许确认。');
      }

      const claimed = await tx.productionPlan.updateMany({
        where: {
          id: planId,
          projectId,
          planType: ProductionPlanType.SCHEDULE,
          status: plan.status,
          updatedAt: plan.updatedAt,
        },
        data: {
          status: ProductionPlanStatus.CONFIRMED,
          confirmedAt: new Date(),
          confirmedById: actor.id,
        },
      });
      if (claimed.count !== 1) {
        this.throwSchedulePlanStateChanged();
      }
      const confirmedPlan = await tx.productionPlan.findUniqueOrThrow({
        where: { id: planId },
        include: SCHEDULE_PLAN_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PRODUCTION_PLAN,
        targetId: plan.id,
        action: 'SCHEDULE_PLAN_CONFIRMED',
        nodeCode: SCHEDULE_PLAN_NODE_CODE,
        summary: `确认排产计划 ${confirmedPlan.planNo}`,
        beforeData: this.toSchedulePlanAuditSnapshot(plan),
        afterData: this.toSchedulePlanAuditSnapshot(confirmedPlan),
      });
    });

    return this.buildScheduleWorkspace(this.prisma, projectId);
  }

  async cancelSchedulePlan(
    projectId: string,
    planId: string,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      await this.lockSchedulePlanRow(tx, projectId, planId);
      const plan = await this.getSchedulePlanOrThrow(tx, projectId, planId);
      await this.lockActiveScheduleTaskAndGetContext(tx, actor, projectId);

      if (!canCancelSchedulePlan(plan.status)) {
        throw new BadRequestException('当前排产计划状态不允许取消。');
      }

      const claimed = await tx.productionPlan.updateMany({
        where: {
          id: planId,
          projectId,
          planType: ProductionPlanType.SCHEDULE,
          status: plan.status,
          updatedAt: plan.updatedAt,
        },
        data: {
          status: ProductionPlanStatus.CANCELLED,
        },
      });
      if (claimed.count !== 1) {
        this.throwSchedulePlanStateChanged();
      }
      const cancelledPlan = await tx.productionPlan.findUniqueOrThrow({
        where: { id: planId },
        include: SCHEDULE_PLAN_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PRODUCTION_PLAN,
        targetId: plan.id,
        action: 'SCHEDULE_PLAN_CANCELLED',
        nodeCode: SCHEDULE_PLAN_NODE_CODE,
        summary: `取消排产计划 ${cancelledPlan.planNo}`,
        beforeData: this.toSchedulePlanAuditSnapshot(plan),
        afterData: this.toSchedulePlanAuditSnapshot(cancelledPlan),
      });
    });

    return this.buildScheduleWorkspace(this.prisma, projectId);
  }

  async completeScheduleTask(projectId: string, actor: AuthenticatedUser) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const context = await this.lockActiveScheduleTaskAndGetContext(
        tx, actor,
        projectId,
      );

      if (!context.activeTask) {
        throw new BadRequestException('当前没有可完成的排产计划任务。');
      }

      const completionIssue = getSchedulePlanCompletionIssue(context.items);

      if (completionIssue) {
        throw new BadRequestException(completionIssue);
      }

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask.id,
        WorkflowAction.COMPLETE,
        actor,
        {
          comment: '排产计划节点已完成，自动进入批量生产。',
          metadata: {
            confirmedPlanCount: context.items.filter(
              (item) => item.status === ProductionPlanStatus.CONFIRMED,
            ).length,
          },
        },
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.WORKFLOW_TASK,
        targetId: context.activeTask.id,
        action: 'SCHEDULE_PLAN_TASK_COMPLETED',
        nodeCode: SCHEDULE_PLAN_NODE_CODE,
        summary: '排产计划节点已完成。',
      });
    });

    return this.buildScheduleWorkspace(this.prisma, projectId);
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

  private async buildScheduleWorkspace(
    db: ProductionPlansDbClient,
    projectId: string,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [activeTask, downstreamMassProductionTask, consistencyReviewApproved, items] =
      await Promise.all([
        this.getActiveTask(db, projectId, SCHEDULE_PLAN_NODE_CODE),
        this.getActiveTask(db, projectId, WorkflowNodeCode.MASS_PRODUCTION),
        this.hasApprovedOrCompletedWorkflowTask(
          db,
          projectId,
          WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
        ),
        db.productionPlan.findMany({
          where: {
            projectId,
            planType: ProductionPlanType.SCHEDULE,
          },
          include: SCHEDULE_PLAN_INCLUDE,
          orderBy: [{ createdAt: 'desc' }],
          take: SCHEDULE_PLAN_RECORD_LIMIT + 1,
        }),
      ]);
    this.assertSchedulePlanRecordCapacity(items, false);

    return {
      project: this.toProjectSummary(project),
      consistencyReviewApproved,
      activeTask: activeTask ? this.toWorkflowTaskSummary(activeTask) : null,
      downstreamMassProductionTask: downstreamMassProductionTask
        ? this.toWorkflowTaskSummary(downstreamMassProductionTask)
        : null,
      canCompleteTask: activeTask
        ? getSchedulePlanCompletionIssue(items) === null
        : false,
      completionIssue: activeTask
        ? getSchedulePlanCompletionIssue(items)
        : '当前没有活跃的排产计划任务。',
      items: items.map((item) => this.toSchedulePlanSummary(item)),
    };
  }

  private async getSchedulePlanContext(db: ProductionPlansDbClient, projectId: string) {
    const [project, activeTask, consistencyReviewApproved, items] = await Promise.all([
      this.getProjectOrThrow(db, projectId),
      this.getActiveTask(db, projectId, SCHEDULE_PLAN_NODE_CODE),
      this.hasApprovedOrCompletedWorkflowTask(
        db,
        projectId,
        WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
      ),
      db.productionPlan.findMany({
        where: {
          projectId,
          planType: ProductionPlanType.SCHEDULE,
        },
        select: {
          id: true,
          status: true,
        },
        take: SCHEDULE_PLAN_RECORD_LIMIT + 1,
      }),
    ]);

    this.assertSchedulePlanRecordCapacity(items, false);

    return {
      project,
      activeTask,
      consistencyReviewApproved,
      items,
    };
  }

  private async lockActiveScheduleTaskAndGetContext(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    projectId: string,
  ) {
    const lockedTasks = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "workflow_tasks"
      WHERE "projectId" = ${projectId}
        AND "nodeCode" = ${SCHEDULE_PLAN_NODE_CODE}::"WorkflowNodeCode"
        AND "isActive" = true
      ORDER BY "createdAt" DESC, "taskRound" DESC
      LIMIT 1
      FOR UPDATE
    `);
    const lockedTaskId = lockedTasks[0]?.id;
    if (!lockedTaskId) {
      this.throwSchedulePlanStateChanged();
    }

    const context = await this.getSchedulePlanContext(tx, projectId);
    this.assertWritableSchedulePlanStage(context);
    if (context.activeTask?.id !== lockedTaskId) {
      this.throwSchedulePlanStateChanged();
    }
    await assertTeamTaskById(tx, context.activeTask!.id, actor);
    return context;
  }

  private async lockSchedulePlanRow(
    tx: Prisma.TransactionClient,
    projectId: string,
    planId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "production_plans"
      WHERE "id" = ${planId}
        AND "projectId" = ${projectId}
        AND "planType" = ${ProductionPlanType.SCHEDULE}::"ProductionPlanType"
      FOR UPDATE
    `);
    if (rows.length !== 1) {
      throw new NotFoundException('排产计划不存在。');
    }
  }

  private throwSchedulePlanStateChanged(): never {
    throw new ConflictException({
      code: 'SCHEDULE_PLAN_STATE_CHANGED',
      message: '排产计划或流程状态已变更，请刷新后重试。',
    });
  }

  private assertWritableSchedulePlanStage(context: {
    consistencyReviewApproved: boolean;
    activeTask: { id: string } | null;
  }) {
    const issue = getSchedulePlanStageIssue({
      consistencyReviewApproved: context.consistencyReviewApproved,
      hasActiveTask: Boolean(context.activeTask),
    });

    if (issue) {
      throw new BadRequestException(issue);
    }
  }

  private assertActorCanManage(actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
  }

  private async getProjectOrThrow(db: ProductionPlansDbClient, projectId: string) {
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
    db: ProductionPlansDbClient,
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

  private async hasApprovedOrCompletedWorkflowTask(
    db: ProductionPlansDbClient,
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

  private async getSchedulePlanOrThrow(
    db: ProductionPlansDbClient,
    projectId: string,
    planId: string,
  ) {
    const plan = await db.productionPlan.findFirst({
      where: {
        id: planId,
        projectId,
        planType: ProductionPlanType.SCHEDULE,
      },
      include: SCHEDULE_PLAN_INCLUDE,
    });

    if (!plan) {
      throw new NotFoundException('排产计划不存在。');
    }

    return plan;
  }

  private async getUserOrThrow(db: ProductionPlansDbClient, userId: string) {
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

  private parseSchedulePlanWriteInput(rawInput: unknown): SchedulePlanWriteInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('排产计划数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const workshop = typeof input.workshop === 'string' ? input.workshop.trim() : '';
    const lineName = typeof input.lineName === 'string' ? input.lineName.trim() : '';
    const ownerId = typeof input.ownerId === 'string' ? input.ownerId.trim() : '';
    const batchNo = typeof input.batchNo === 'string' ? input.batchNo.trim() : '';
    const note =
      typeof input.note === 'string' && input.note.trim().length > 0
        ? input.note.trim()
        : null;
    const plannedQuantity =
      typeof input.plannedQuantity === 'number'
        ? input.plannedQuantity
        : typeof input.plannedQuantity === 'string'
          ? Number(input.plannedQuantity)
          : NaN;

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
      throw new BadRequestException('计划批次不能为空。');
    }

    if (
      !Number.isSafeInteger(plannedQuantity) ||
      plannedQuantity <= 0 ||
      plannedQuantity > SCHEDULE_PLAN_MAX_QUANTITY
    ) {
      this.throwSchedulePlanInputOutOfBounds(
        `计划数量必须为 1～${SCHEDULE_PLAN_MAX_QUANTITY} 的整数。`,
      );
    }

    this.assertSchedulePlanText(workshop, '车间', SCHEDULE_PLAN_NAME_MAX_CHARS);
    this.assertSchedulePlanText(lineName, '生产线', SCHEDULE_PLAN_NAME_MAX_CHARS);
    this.assertSchedulePlanId(ownerId, '责任人');
    this.assertSchedulePlanCode(batchNo, '计划批次');
    if (note) {
      this.assertSchedulePlanText(note, '备注', SCHEDULE_PLAN_NOTE_MAX_CHARS);
    }

    const normalized = {
      workshop,
      lineName,
      ownerId,
      batchNo,
      note,
      plannedQuantity,
      planDate: this.parseDate(input.planDate, '计划日期'),
    };
    if (
      Buffer.byteLength(JSON.stringify(normalized), 'utf8') >
      SCHEDULE_PLAN_MAX_PAYLOAD_BYTES
    ) {
      this.throwSchedulePlanInputOutOfBounds(
        `排产计划不得超过 ${SCHEDULE_PLAN_MAX_PAYLOAD_BYTES} 字节。`,
      );
    }
    return normalized;
  }

  private assertSchedulePlanRecordCapacity(items: readonly unknown[], forCreate: boolean) {
    if (
      items.length > SCHEDULE_PLAN_RECORD_LIMIT ||
      (forCreate && items.length >= SCHEDULE_PLAN_RECORD_LIMIT)
    ) {
      throw new ConflictException({
        code: 'PRODUCTION_PLAN_RECORD_LIMIT_EXCEEDED',
        message: `每个项目最多保留 ${SCHEDULE_PLAN_RECORD_LIMIT} 条排产计划。`,
      });
    }
  }

  private assertSchedulePlanText(value: string, label: string, maxChars: number) {
    if (value.length > maxChars) {
      this.throwSchedulePlanInputOutOfBounds(`${label}不得超过 ${maxChars} 个字符。`);
    }
  }

  private assertSchedulePlanId(value: string, label: string) {
    if (value.length > SCHEDULE_PLAN_ID_MAX_CHARS || !SCHEDULE_PLAN_ID_PATTERN.test(value)) {
      this.throwSchedulePlanInputOutOfBounds(`${label}标识不合法。`);
    }
  }

  private assertSchedulePlanCode(value: string, label: string) {
    if (
      value.length > SCHEDULE_PLAN_CODE_MAX_CHARS ||
      !SCHEDULE_PLAN_CODE_PATTERN.test(value)
    ) {
      this.throwSchedulePlanInputOutOfBounds(
        `${label}仅允许 1～${SCHEDULE_PLAN_CODE_MAX_CHARS} 位字母、数字、点、下划线或连字符。`,
      );
    }
  }

  private throwSchedulePlanInputOutOfBounds(message: string): never {
    throw new BadRequestException({
      code: 'PRODUCTION_PLAN_INPUT_OUT_OF_BOUNDS',
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

  private toSchedulePlanSummary(
    plan: Prisma.ProductionPlanGetPayload<{
      include: typeof SCHEDULE_PLAN_INCLUDE;
    }>,
  ) {
    return {
      id: plan.id,
      planNo: plan.planNo,
      status: plan.status,
      planDate: plan.planDate?.toISOString() ?? null,
      plannedQuantity: plan.quantity,
      actualQuantity: plan.actualQuantity,
      workshop: plan.workshop,
      lineName: plan.lineName,
      ownerId: plan.ownerId,
      ownerName: plan.owner?.name ?? null,
      batchNo: plan.batchNo,
      note: plan.remark,
      confirmedAt: plan.confirmedAt?.toISOString() ?? null,
      confirmedById: plan.confirmedById,
      confirmedByName: plan.confirmedBy?.name ?? null,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    };
  }

  private toSchedulePlanAuditSnapshot(
    plan: Prisma.ProductionPlanGetPayload<{
      include: typeof SCHEDULE_PLAN_INCLUDE;
    }>,
  ) {
    return {
      id: plan.id,
      planNo: plan.planNo,
      planType: plan.planType,
      status: plan.status,
      planDate: plan.planDate?.toISOString() ?? null,
      plannedQuantity: plan.quantity,
      workshop: plan.workshop,
      lineName: plan.lineName,
      ownerId: plan.ownerId,
      ownerName: plan.owner?.name ?? null,
      batchNo: plan.batchNo,
      note: plan.remark ?? null,
      confirmedAt: plan.confirmedAt?.toISOString() ?? null,
      confirmedById: plan.confirmedById,
      confirmedByName: plan.confirmedBy?.name ?? null,
    } satisfies Prisma.InputJsonValue;
  }

  private buildSchedulePlanNo() {
    return `SP-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  }
}
