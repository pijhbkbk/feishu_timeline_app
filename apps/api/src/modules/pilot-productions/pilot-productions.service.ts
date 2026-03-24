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
  TrialProductionIssueSeverity,
  TrialProductionResult,
  TrialProductionStatus,
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
  canConfirmFirstProductionPlan,
  canEditFirstProductionPlan,
  canEditTrialProduction,
  getFirstProductionPlanCompletionIssue,
  getFirstProductionPlanStageIssue,
  getTrialProductionCompletionIssue,
  getTrialProductionStageIssue,
  getTrialProductionStatusAfterComplete,
  getTrialRecordCompletionIssue,
  PILOT_PRODUCTION_MANAGEMENT_ROLE_CODES,
} from './pilot-productions.rules';

type PilotProductionsDbClient = Prisma.TransactionClient | PrismaService;

type FirstProductionPlanWriteInput = {
  planDate: Date;
  plannedQuantity: number;
  workshop: string;
  lineName: string;
  ownerId: string;
  batchNo: string;
  note: string | null;
};

type TrialProductionWriteInput = {
  productionPlanId: string | null;
  vehicleNo: string;
  workshop: string;
  trialDate: Date;
  paintBatchNo: string;
  result: TrialProductionResult | null;
  issueSummary: string | null;
  note: string | null;
};

type TrialIssueWriteInput = {
  issueType: string;
  description: string;
  severity: TrialProductionIssueSeverity;
  responsibleDept: string;
};

const FIRST_PRODUCTION_PLAN_INCLUDE = {
  owner: true,
  confirmedBy: true,
  createdBy: true,
} satisfies Prisma.ProductionPlanInclude;

const TRIAL_PRODUCTION_INCLUDE = {
  productionPlan: {
    include: {
      owner: true,
      confirmedBy: true,
    },
  },
  issues: {
    orderBy: [
      { createdAt: 'desc' as const },
      { updatedAt: 'desc' as const },
    ],
  },
} satisfies Prisma.TrialProductionInclude;

@Injectable()
export class PilotProductionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  getFirstProductionPlanWorkspace(projectId: string) {
    return this.buildFirstProductionPlanWorkspace(this.prisma, projectId);
  }

  getTrialProductionWorkspace(projectId: string) {
    return this.buildTrialProductionWorkspace(this.prisma, projectId);
  }

  async getTrialProductionDetail(projectId: string, trialId: string) {
    const trial = await this.getTrialProductionOrThrow(this.prisma, projectId, trialId);
    return this.toTrialProductionSummary(trial);
  }

  async createFirstProductionPlan(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseFirstProductionPlanWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getFirstProductionPlanContext(tx, projectId);
      this.assertWritableFirstProductionPlanStage(context);
      await this.getUserOrThrow(tx, input.ownerId);

      const createdPlan = await tx.productionPlan.create({
        data: {
          projectId,
          createdById: actor.id,
          ownerId: input.ownerId,
          planNo: this.buildFirstProductionPlanNo(),
          planType: ProductionPlanType.FIRST_UNIT,
          status: ProductionPlanStatus.DRAFT,
          quantity: input.plannedQuantity,
          planDate: input.planDate,
          lineName: input.lineName,
          workshop: input.workshop,
          batchNo: input.batchNo,
          remark: input.note,
        },
        include: FIRST_PRODUCTION_PLAN_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PRODUCTION_PLAN,
        targetId: createdPlan.id,
        action: 'FIRST_PRODUCTION_PLAN_CREATED',
        nodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
        summary: `创建首台计划 ${createdPlan.planNo}`,
        afterData: this.toFirstProductionPlanAuditSnapshot(createdPlan),
      });
    });

    return this.buildFirstProductionPlanWorkspace(this.prisma, projectId);
  }

  async updateFirstProductionPlan(
    projectId: string,
    planId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseFirstProductionPlanWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getFirstProductionPlanContext(tx, projectId);
      this.assertWritableFirstProductionPlanStage(context);
      const plan = await this.getFirstProductionPlanOrThrow(tx, projectId, planId);

      if (!canEditFirstProductionPlan(plan.status)) {
        throw new BadRequestException('已确认的首台计划不允许编辑。');
      }

      await this.getUserOrThrow(tx, input.ownerId);

      const updatedPlan = await tx.productionPlan.update({
        where: { id: planId },
        data: {
          ownerId: input.ownerId,
          quantity: input.plannedQuantity,
          planDate: input.planDate,
          lineName: input.lineName,
          workshop: input.workshop,
          batchNo: input.batchNo,
          remark: input.note,
        },
        include: FIRST_PRODUCTION_PLAN_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PRODUCTION_PLAN,
        targetId: plan.id,
        action: 'FIRST_PRODUCTION_PLAN_UPDATED',
        nodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
        summary: `更新首台计划 ${updatedPlan.planNo}`,
        beforeData: this.toFirstProductionPlanAuditSnapshot(plan),
        afterData: this.toFirstProductionPlanAuditSnapshot(updatedPlan),
      });
    });

    return this.buildFirstProductionPlanWorkspace(this.prisma, projectId);
  }

  async confirmFirstProductionPlan(
    projectId: string,
    planId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getFirstProductionPlanContext(tx, projectId);
      this.assertWritableFirstProductionPlanStage(context);
      const plan = await this.getFirstProductionPlanOrThrow(tx, projectId, planId);

      if (!canConfirmFirstProductionPlan(plan.status)) {
        throw new BadRequestException('当前首台计划状态不允许确认。');
      }

      const confirmedPlan = await tx.productionPlan.update({
        where: { id: planId },
        data: {
          status: ProductionPlanStatus.PLANNED,
          confirmedAt: new Date(),
          confirmedById: actor.id,
        },
        include: FIRST_PRODUCTION_PLAN_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PRODUCTION_PLAN,
        targetId: plan.id,
        action: 'FIRST_PRODUCTION_PLAN_CONFIRMED',
        nodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
        summary: `确认首台计划 ${confirmedPlan.planNo}`,
        beforeData: this.toFirstProductionPlanAuditSnapshot(plan),
        afterData: this.toFirstProductionPlanAuditSnapshot(confirmedPlan),
      });
    });

    return this.buildFirstProductionPlanWorkspace(this.prisma, projectId);
  }

  async completeFirstProductionPlanTask(
    projectId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getFirstProductionPlanContext(tx, projectId);
      this.assertWritableFirstProductionPlanStage(context);

      if (!context.activeTask) {
        throw new BadRequestException('当前没有可完成的首台生产计划任务。');
      }

      const completionIssue = getFirstProductionPlanCompletionIssue(context.items);

      if (completionIssue) {
        throw new BadRequestException(completionIssue);
      }

      await tx.productionPlan.updateMany({
        where: {
          projectId,
          planType: ProductionPlanType.FIRST_UNIT,
          status: {
            in: [ProductionPlanStatus.PLANNED, ProductionPlanStatus.IN_PROGRESS],
          },
        },
        data: {
          status: ProductionPlanStatus.COMPLETED,
        },
      });

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask.id,
        WorkflowAction.COMPLETE,
        actor,
        {
          comment: '首台生产计划节点已完成，自动进入样车试制。',
          metadata: {
            confirmedPlanCount: context.items.filter((item) =>
              item.status === ProductionPlanStatus.PLANNED ||
              item.status === ProductionPlanStatus.COMPLETED ||
              item.status === ProductionPlanStatus.IN_PROGRESS,
            ).length,
          },
        },
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.WORKFLOW_TASK,
        targetId: context.activeTask.id,
        action: 'FIRST_PRODUCTION_PLAN_TASK_COMPLETED',
        nodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
        summary: '首台生产计划节点已完成。',
      });
    });

    return this.buildFirstProductionPlanWorkspace(this.prisma, projectId);
  }

  async createTrialProduction(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseTrialProductionWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getTrialProductionContext(tx, projectId);
      this.assertWritableTrialProductionStage(context);
      await this.assertValidTrialProductionPlan(tx, projectId, input.productionPlanId);
      await this.assertUniqueVehicleNo(tx, projectId, input.vehicleNo);

      const createdTrial = await tx.trialProduction.create({
        data: {
          projectId,
          productionPlanId: input.productionPlanId,
          trialNo: input.vehicleNo,
          status: TrialProductionStatus.PLANNED,
          location: input.workshop,
          plannedAt: input.trialDate,
          paintBatchNo: input.paintBatchNo,
          result: input.result,
          summary: input.issueSummary,
          note: input.note,
        },
        include: TRIAL_PRODUCTION_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.TRIAL_PRODUCTION,
        targetId: createdTrial.id,
        action: 'TRIAL_PRODUCTION_CREATED',
        nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
        summary: `创建试制记录 ${createdTrial.trialNo}`,
        afterData: this.toTrialProductionAuditSnapshot(createdTrial),
      });
    });

    return this.buildTrialProductionWorkspace(this.prisma, projectId);
  }

  async updateTrialProduction(
    projectId: string,
    trialId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseTrialProductionWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getTrialProductionContext(tx, projectId);
      this.assertWritableTrialProductionStage(context);
      const trial = await this.getTrialProductionOrThrow(tx, projectId, trialId);

      if (!canEditTrialProduction(trial.status)) {
        throw new BadRequestException('已完成或已取消的试制记录不允许编辑。');
      }

      await this.assertValidTrialProductionPlan(tx, projectId, input.productionPlanId);
      if (input.vehicleNo !== trial.trialNo) {
        await this.assertUniqueVehicleNo(tx, projectId, input.vehicleNo, trial.id);
      }

      const updatedTrial = await tx.trialProduction.update({
        where: { id: trialId },
        data: {
          productionPlanId: input.productionPlanId,
          trialNo: input.vehicleNo,
          location: input.workshop,
          plannedAt: input.trialDate,
          paintBatchNo: input.paintBatchNo,
          result: input.result,
          summary: input.issueSummary,
          note: input.note,
          status:
            trial.status === TrialProductionStatus.PLANNED
              ? TrialProductionStatus.IN_PROGRESS
              : trial.status,
        },
        include: TRIAL_PRODUCTION_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.TRIAL_PRODUCTION,
        targetId: trial.id,
        action: 'TRIAL_PRODUCTION_UPDATED',
        nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
        summary: `更新试制记录 ${updatedTrial.trialNo}`,
        beforeData: this.toTrialProductionAuditSnapshot(trial),
        afterData: this.toTrialProductionAuditSnapshot(updatedTrial),
      });
    });

    return this.buildTrialProductionWorkspace(this.prisma, projectId);
  }

  async addTrialProductionIssue(
    projectId: string,
    trialId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseTrialIssueWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getTrialProductionContext(tx, projectId);
      this.assertWritableTrialProductionStage(context);
      const trial = await this.getTrialProductionOrThrow(tx, projectId, trialId);

      if (!canEditTrialProduction(trial.status)) {
        throw new BadRequestException('当前试制记录状态不允许新增问题。');
      }

      const issue = await tx.trialProductionIssue.create({
        data: {
          trialProductionId: trialId,
          issueType: input.issueType,
          description: input.description,
          severity: input.severity,
          responsibleDept: input.responsibleDept,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.TRIAL_PRODUCTION,
        targetId: trial.id,
        action: 'TRIAL_PRODUCTION_ISSUE_ADDED',
        nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
        summary: `新增试制问题 ${input.issueType}`,
        afterData: {
          issueId: issue.id,
          issueType: issue.issueType,
          severity: issue.severity,
          responsibleDept: issue.responsibleDept,
        },
      });
    });

    return this.buildTrialProductionWorkspace(this.prisma, projectId);
  }

  async completeTrialProductionRecord(
    projectId: string,
    trialId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getTrialProductionContext(tx, projectId);
      this.assertWritableTrialProductionStage(context);
      const trial = await this.getTrialProductionOrThrow(tx, projectId, trialId);

      if (!canEditTrialProduction(trial.status)) {
        throw new BadRequestException('当前试制记录状态不允许完成。');
      }

      const completionIssue = getTrialRecordCompletionIssue({
        vehicleNo: trial.trialNo,
        workshop: trial.location,
        trialDate: trial.plannedAt,
        paintBatchNo: trial.paintBatchNo,
        result: trial.result,
        issueSummary: trial.summary,
      });

      if (completionIssue) {
        throw new BadRequestException(completionIssue);
      }

      const completedTrial = await tx.trialProduction.update({
        where: { id: trialId },
        data: {
          status: getTrialProductionStatusAfterComplete(trial.result!),
          startedAt: trial.startedAt ?? trial.plannedAt ?? new Date(),
          completedAt: new Date(),
        },
        include: TRIAL_PRODUCTION_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.TRIAL_PRODUCTION,
        targetId: trial.id,
        action: 'TRIAL_PRODUCTION_RECORD_COMPLETED',
        nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
        summary: `完成试制记录 ${completedTrial.trialNo}`,
        beforeData: this.toTrialProductionAuditSnapshot(trial),
        afterData: this.toTrialProductionAuditSnapshot(completedTrial),
      });
    });

    return this.buildTrialProductionWorkspace(this.prisma, projectId);
  }

  async completeTrialProductionTask(
    projectId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getTrialProductionContext(tx, projectId);
      this.assertWritableTrialProductionStage(context);

      if (!context.activeTask) {
        throw new BadRequestException('当前没有可完成的样车试制任务。');
      }

      const completionIssue = getTrialProductionCompletionIssue(context.items);

      if (completionIssue) {
        throw new BadRequestException(completionIssue);
      }

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask.id,
        WorkflowAction.COMPLETE,
        actor,
        {
          comment: '样车试制节点已完成，自动进入驾驶室评审。',
          metadata: {
            completedTrialCount: context.items.filter(
              (item) =>
                item.status === TrialProductionStatus.PASSED ||
                item.status === TrialProductionStatus.FAILED,
            ).length,
          },
        },
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.WORKFLOW_TASK,
        targetId: context.activeTask.id,
        action: 'TRIAL_PRODUCTION_TASK_COMPLETED',
        nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
        summary: '样车试制节点已完成。',
      });
    });

    return this.buildTrialProductionWorkspace(this.prisma, projectId);
  }

  private async buildFirstProductionPlanWorkspace(
    db: PilotProductionsDbClient,
    projectId: string,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [activeTask, procurementCompleted, trialTask, items] = await Promise.all([
      this.getActiveTask(db, projectId, WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN),
      this.hasCompletedWorkflowTask(db, projectId, WorkflowNodeCode.PAINT_PROCUREMENT),
      this.getActiveTask(db, projectId, WorkflowNodeCode.TRIAL_PRODUCTION),
      db.productionPlan.findMany({
        where: {
          projectId,
          planType: ProductionPlanType.FIRST_UNIT,
        },
        include: FIRST_PRODUCTION_PLAN_INCLUDE,
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    return {
      project: this.toProjectSummary(project),
      procurementCompleted,
      activeTask: activeTask ? this.toWorkflowTaskSummary(activeTask) : null,
      canCompleteTask:
        Boolean(activeTask) &&
        getFirstProductionPlanCompletionIssue(items) === null,
      completionIssue: getFirstProductionPlanCompletionIssue(items),
      downstreamTrialProductionTask: trialTask
        ? this.toWorkflowTaskSummary(trialTask)
        : null,
      items: items.map((item) => this.toFirstProductionPlanSummary(item)),
    };
  }

  private async buildTrialProductionWorkspace(
    db: PilotProductionsDbClient,
    projectId: string,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [
      activeTask,
      firstPlanTaskCompleted,
      cabReviewTask,
      planOptions,
      items,
    ] = await Promise.all([
      this.getActiveTask(db, projectId, WorkflowNodeCode.TRIAL_PRODUCTION),
      this.hasCompletedWorkflowTask(
        db,
        projectId,
        WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
      ),
      this.getActiveTask(db, projectId, WorkflowNodeCode.CAB_REVIEW),
      db.productionPlan.findMany({
        where: {
          projectId,
          planType: ProductionPlanType.FIRST_UNIT,
          status: {
            in: [ProductionPlanStatus.PLANNED, ProductionPlanStatus.COMPLETED],
          },
        },
        include: FIRST_PRODUCTION_PLAN_INCLUDE,
        orderBy: [{ planDate: 'desc' }, { createdAt: 'desc' }],
      }),
      db.trialProduction.findMany({
        where: { projectId },
        include: TRIAL_PRODUCTION_INCLUDE,
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    return {
      project: this.toProjectSummary(project),
      firstProductionPlanCompleted: firstPlanTaskCompleted,
      activeTask: activeTask ? this.toWorkflowTaskSummary(activeTask) : null,
      canCompleteTask:
        Boolean(activeTask) &&
        getTrialProductionCompletionIssue(items) === null,
      completionIssue: getTrialProductionCompletionIssue(items),
      downstreamCabReviewTask: cabReviewTask
        ? this.toWorkflowTaskSummary(cabReviewTask)
        : null,
      planOptions: planOptions.map((item) => ({
        id: item.id,
        planNo: item.planNo,
        planDate: item.planDate?.toISOString() ?? null,
        status: item.status,
        ownerName: item.owner?.name ?? null,
      })),
      items: items.map((item) => this.toTrialProductionSummary(item)),
    };
  }

  private async getFirstProductionPlanContext(
    db: PilotProductionsDbClient,
    projectId: string,
  ) {
    const [project, activeTask, procurementCompleted, items] = await Promise.all([
      this.getProjectOrThrow(db, projectId),
      this.getActiveTask(db, projectId, WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN),
      this.hasCompletedWorkflowTask(db, projectId, WorkflowNodeCode.PAINT_PROCUREMENT),
      db.productionPlan.findMany({
        where: {
          projectId,
          planType: ProductionPlanType.FIRST_UNIT,
        },
      }),
    ]);

    return {
      project,
      activeTask,
      procurementCompleted,
      items,
    };
  }

  private async getTrialProductionContext(
    db: PilotProductionsDbClient,
    projectId: string,
  ) {
    const [project, activeTask, firstPlanTaskCompleted, items] = await Promise.all([
      this.getProjectOrThrow(db, projectId),
      this.getActiveTask(db, projectId, WorkflowNodeCode.TRIAL_PRODUCTION),
      this.hasCompletedWorkflowTask(
        db,
        projectId,
        WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
      ),
      db.trialProduction.findMany({
        where: { projectId },
      }),
    ]);

    return {
      project,
      activeTask,
      firstPlanTaskCompleted,
      items,
    };
  }

  private assertWritableFirstProductionPlanStage(context: {
    procurementCompleted: boolean;
    activeTask: { id: string } | null;
  }) {
    const issue = getFirstProductionPlanStageIssue({
      procurementCompleted: context.procurementCompleted,
      hasActiveTask: Boolean(context.activeTask),
    });

    if (issue) {
      throw new BadRequestException(issue);
    }
  }

  private assertWritableTrialProductionStage(context: {
    firstPlanTaskCompleted: boolean;
    activeTask: { id: string } | null;
  }) {
    const issue = getTrialProductionStageIssue({
      firstPlanTaskCompleted: context.firstPlanTaskCompleted,
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
        PILOT_PRODUCTION_MANAGEMENT_ROLE_CODES.includes(
          roleCode as (typeof PILOT_PRODUCTION_MANAGEMENT_ROLE_CODES)[number],
        ),
      )
    ) {
      return;
    }

    throw new BadRequestException('当前用户没有首台生产计划/样车试制管理权限。');
  }

  private async getProjectOrThrow(db: PilotProductionsDbClient, projectId: string) {
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

  private async getUserOrThrow(db: PilotProductionsDbClient, userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('责任人不存在。');
    }

    return user;
  }

  private async getFirstProductionPlanOrThrow(
    db: PilotProductionsDbClient,
    projectId: string,
    planId: string,
  ) {
    const plan = await db.productionPlan.findFirst({
      where: {
        id: planId,
        projectId,
        planType: ProductionPlanType.FIRST_UNIT,
      },
      include: FIRST_PRODUCTION_PLAN_INCLUDE,
    });

    if (!plan) {
      throw new NotFoundException('首台生产计划不存在。');
    }

    return plan;
  }

  private async getTrialProductionOrThrow(
    db: PilotProductionsDbClient,
    projectId: string,
    trialId: string,
  ) {
    const trial = await db.trialProduction.findFirst({
      where: {
        id: trialId,
        projectId,
      },
      include: TRIAL_PRODUCTION_INCLUDE,
    });

    if (!trial) {
      throw new NotFoundException('试制记录不存在。');
    }

    return trial;
  }

  private async assertValidTrialProductionPlan(
    db: PilotProductionsDbClient,
    projectId: string,
    planId: string | null,
  ) {
    if (!planId) {
      return;
    }

    const plan = await db.productionPlan.findFirst({
      where: {
        id: planId,
        projectId,
        planType: ProductionPlanType.FIRST_UNIT,
        status: {
          in: [ProductionPlanStatus.PLANNED, ProductionPlanStatus.COMPLETED],
        },
      },
      select: { id: true },
    });

    if (!plan) {
      throw new BadRequestException('关联首台计划不存在或未确认。');
    }
  }

  private async assertUniqueVehicleNo(
    db: PilotProductionsDbClient,
    projectId: string,
    vehicleNo: string,
    excludedTrialId?: string,
  ) {
    const duplicatedRecord = await db.trialProduction.findFirst({
      where: {
        projectId,
        trialNo: vehicleNo,
        ...(excludedTrialId
          ? {
              NOT: {
                id: excludedTrialId,
              },
            }
          : {}),
      },
      select: { id: true },
    });

    if (duplicatedRecord) {
      throw new BadRequestException('样车编号已存在。');
    }
  }

  private async getActiveTask(
    db: PilotProductionsDbClient,
    projectId: string,
    nodeCode:
      | 'FIRST_UNIT_PRODUCTION_PLAN'
      | 'TRIAL_PRODUCTION'
      | 'CAB_REVIEW',
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
    db: PilotProductionsDbClient,
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

  private parseFirstProductionPlanWriteInput(
    rawInput: unknown,
  ): FirstProductionPlanWriteInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('首台计划数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const ownerId = typeof input.ownerId === 'string' ? input.ownerId.trim() : '';
    const workshop = typeof input.workshop === 'string' ? input.workshop.trim() : '';
    const lineName = typeof input.lineName === 'string' ? input.lineName.trim() : '';
    const batchNo = typeof input.batchNo === 'string' ? input.batchNo.trim() : '';
    const note =
      typeof input.note === 'string' && input.note.trim().length > 0
        ? input.note.trim()
        : null;

    if (!ownerId) {
      throw new BadRequestException('责任人不能为空。');
    }

    if (!workshop) {
      throw new BadRequestException('车间不能为空。');
    }

    if (!lineName) {
      throw new BadRequestException('生产线不能为空。');
    }

    if (!batchNo) {
      throw new BadRequestException('批次号不能为空。');
    }

    return {
      ownerId,
      workshop,
      lineName,
      batchNo,
      note,
      planDate: this.parseDate(input.planDate, '计划日期'),
      plannedQuantity: this.parsePositiveInteger(input.plannedQuantity, '计划数量'),
    };
  }

  private parseTrialProductionWriteInput(rawInput: unknown): TrialProductionWriteInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('试制记录数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const productionPlanId =
      typeof input.productionPlanId === 'string' && input.productionPlanId.trim().length > 0
        ? input.productionPlanId.trim()
        : null;
    const vehicleNo = typeof input.vehicleNo === 'string' ? input.vehicleNo.trim() : '';
    const workshop = typeof input.workshop === 'string' ? input.workshop.trim() : '';
    const paintBatchNo =
      typeof input.paintBatchNo === 'string' ? input.paintBatchNo.trim() : '';
    const result =
      typeof input.result === 'string' &&
      Object.values(TrialProductionResult).includes(
        input.result as TrialProductionResult,
      )
        ? (input.result as TrialProductionResult)
        : null;
    const issueSummary =
      typeof input.issueSummary === 'string' && input.issueSummary.trim().length > 0
        ? input.issueSummary.trim()
        : null;
    const note =
      typeof input.note === 'string' && input.note.trim().length > 0
        ? input.note.trim()
        : null;

    if (!vehicleNo) {
      throw new BadRequestException('样车编号不能为空。');
    }

    if (!workshop) {
      throw new BadRequestException('车间不能为空。');
    }

    if (!paintBatchNo) {
      throw new BadRequestException('涂料批次不能为空。');
    }

    return {
      productionPlanId,
      vehicleNo,
      workshop,
      trialDate: this.parseDate(input.trialDate, '试制日期'),
      paintBatchNo,
      result,
      issueSummary,
      note,
    };
  }

  private parseTrialIssueWriteInput(rawInput: unknown): TrialIssueWriteInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('试制问题数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const issueType = typeof input.issueType === 'string' ? input.issueType.trim() : '';
    const description =
      typeof input.description === 'string' ? input.description.trim() : '';
    const responsibleDept =
      typeof input.responsibleDept === 'string' ? input.responsibleDept.trim() : '';
    const severity =
      typeof input.severity === 'string' &&
      Object.values(TrialProductionIssueSeverity).includes(
        input.severity as TrialProductionIssueSeverity,
      )
        ? (input.severity as TrialProductionIssueSeverity)
        : null;

    if (!issueType) {
      throw new BadRequestException('问题类型不能为空。');
    }

    if (!description) {
      throw new BadRequestException('问题描述不能为空。');
    }

    if (!severity) {
      throw new BadRequestException('严重度不能为空。');
    }

    if (!responsibleDept) {
      throw new BadRequestException('责任部门不能为空。');
    }

    return {
      issueType,
      description,
      severity,
      responsibleDept,
    };
  }

  private parsePositiveInteger(value: unknown, label: string) {
    if (typeof value !== 'number' && typeof value !== 'string') {
      throw new BadRequestException(`${label}不能为空。`);
    }

    const numericValue = Number(value);

    if (!Number.isInteger(numericValue) || numericValue <= 0) {
      throw new BadRequestException(`${label}必须是大于 0 的整数。`);
    }

    return numericValue;
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

  private buildFirstProductionPlanNo() {
    return `FPP-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private toProjectSummary(project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    plannedEndDate: Date | null;
    priority: string;
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

  private toFirstProductionPlanSummary(
    plan: Prisma.ProductionPlanGetPayload<{
      include: typeof FIRST_PRODUCTION_PLAN_INCLUDE;
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

  private toTrialProductionSummary(
    trial: Prisma.TrialProductionGetPayload<{
      include: typeof TRIAL_PRODUCTION_INCLUDE;
    }>,
  ) {
    return {
      id: trial.id,
      productionPlanId: trial.productionPlanId,
      productionPlanNo: trial.productionPlan?.planNo ?? null,
      vehicleNo: trial.trialNo,
      workshop: trial.location,
      trialDate: trial.plannedAt?.toISOString() ?? null,
      paintBatchNo: trial.paintBatchNo,
      issueSummary: trial.summary,
      result: trial.result,
      status: trial.status,
      note: trial.note,
      startedAt: trial.startedAt?.toISOString() ?? null,
      completedAt: trial.completedAt?.toISOString() ?? null,
      createdAt: trial.createdAt.toISOString(),
      updatedAt: trial.updatedAt.toISOString(),
      issues: trial.issues.map((issue) => ({
        id: issue.id,
        issueType: issue.issueType,
        description: issue.description,
        severity: issue.severity,
        responsibleDept: issue.responsibleDept,
        createdAt: issue.createdAt.toISOString(),
        updatedAt: issue.updatedAt.toISOString(),
      })),
    };
  }

  private toFirstProductionPlanAuditSnapshot(
    plan: Prisma.ProductionPlanGetPayload<{
      include: typeof FIRST_PRODUCTION_PLAN_INCLUDE;
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
    } satisfies Prisma.InputJsonValue;
  }

  private toTrialProductionAuditSnapshot(
    trial: Prisma.TrialProductionGetPayload<{
      include: typeof TRIAL_PRODUCTION_INCLUDE;
    }>,
  ) {
    return {
      id: trial.id,
      productionPlanId: trial.productionPlanId,
      productionPlanNo: trial.productionPlan?.planNo ?? null,
      vehicleNo: trial.trialNo,
      workshop: trial.location,
      trialDate: trial.plannedAt?.toISOString() ?? null,
      paintBatchNo: trial.paintBatchNo,
      issueSummary: trial.summary,
      result: trial.result,
      status: trial.status,
      note: trial.note,
      completedAt: trial.completedAt?.toISOString() ?? null,
      issueCount: trial.issues.length,
    } satisfies Prisma.InputJsonValue;
  }
}
