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
import { ProjectAccessService } from '../auth/project-access.service';
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

const FIRST_PRODUCTION_PLAN_RECORD_LIMIT = 100;
const TRIAL_PRODUCTION_RECORD_LIMIT = 100;
const TRIAL_PRODUCTION_ISSUE_LIMIT = 100;
const PILOT_PRODUCTION_MAX_PAYLOAD_BYTES = 16 * 1024;
const PILOT_PRODUCTION_ID_MAX_CHARS = 64;
const PILOT_PRODUCTION_CODE_MAX_CHARS = 64;
const PILOT_PRODUCTION_NAME_MAX_CHARS = 200;
const PILOT_PRODUCTION_SHORT_TEXT_MAX_CHARS = 500;
const PILOT_PRODUCTION_LONG_TEXT_MAX_CHARS = 4_000;
const PILOT_PRODUCTION_MAX_QUANTITY = 2_147_483_647;
const PILOT_PRODUCTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const PILOT_PRODUCTION_CODE_PATTERN = /^[A-Za-z0-9._-]+$/;

const FIRST_PRODUCTION_PLAN_INCLUDE = {
  owner: true,
  confirmedBy: true,
  createdBy: true,
} satisfies Prisma.ProductionPlanInclude;

const TRIAL_PRODUCTION_RELATION_INCLUDE = {
  productionPlan: {
    include: {
      owner: true,
      confirmedBy: true,
    },
  },
} satisfies Prisma.TrialProductionInclude;

const TRIAL_PRODUCTION_WRITE_INCLUDE = {
  ...TRIAL_PRODUCTION_RELATION_INCLUDE,
  _count: {
    select: { issues: true },
  },
} satisfies Prisma.TrialProductionInclude;

const TRIAL_PRODUCTION_DETAIL_INCLUDE = {
  ...TRIAL_PRODUCTION_RELATION_INCLUDE,
  issues: {
    orderBy: [
      { createdAt: 'desc' as const },
      { updatedAt: 'desc' as const },
    ],
    take: TRIAL_PRODUCTION_ISSUE_LIMIT + 1,
  },
  _count: {
    select: { issues: true },
  },
} satisfies Prisma.TrialProductionInclude;

const TRIAL_PRODUCTION_WORKSPACE_SELECT = {
  id: true,
  productionPlanId: true,
  productionPlan: {
    select: { planNo: true },
  },
  trialNo: true,
  location: true,
  plannedAt: true,
  paintBatchNo: true,
  summary: true,
  result: true,
  status: true,
  note: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: { issues: true },
  },
} satisfies Prisma.TrialProductionSelect;

@Injectable()
export class PilotProductionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly workflowsService: WorkflowsService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  async getFirstProductionPlanWorkspace(projectId: string, actor: AuthenticatedUser) {
    await this.assertProjectAccess(projectId, actor, 'project.read');
    return this.buildFirstProductionPlanWorkspace(this.prisma, projectId);
  }

  async getTrialProductionWorkspace(projectId: string, actor: AuthenticatedUser) {
    await this.assertProjectAccess(projectId, actor, 'project.read');
    return this.buildTrialProductionWorkspace(this.prisma, projectId);
  }

  async getTrialProductionDetail(
    projectId: string,
    trialId: string,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'project.read');
    const trial = await this.getTrialProductionOrThrow(this.prisma, projectId, trialId);
    return this.toTrialProductionDetailSummary(trial);
  }

  async createFirstProductionPlan(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseFirstProductionPlanWriteInput(rawInput);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const context = await this.lockFirstProductionPlanTaskAndGetContext(tx, actor, projectId);
      this.assertFirstProductionPlanCapacity(context.items, true);
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
        metadata: { workflowTaskId: context.activeTask!.id, evidenceKind: 'TASK_CREATED_RECORD' },
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseFirstProductionPlanWriteInput(rawInput);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      await this.lockFirstProductionPlanRow(tx, projectId, planId);
      const plan = await this.getFirstProductionPlanOrThrow(tx, projectId, planId);
      await this.lockFirstProductionPlanTaskAndGetContext(tx, actor, projectId);

      if (!canEditFirstProductionPlan(plan.status)) {
        throw new BadRequestException('已确认的首台计划不允许编辑。');
      }

      await this.getUserOrThrow(tx, input.ownerId);

      const claimed = await tx.productionPlan.updateMany({
        where: {
          id: planId,
          projectId,
          planType: ProductionPlanType.FIRST_UNIT,
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
        this.throwPilotProductionStateChanged();
      }
      const updatedPlan = await tx.productionPlan.findUniqueOrThrow({
        where: { id: planId },
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      await this.lockFirstProductionPlanRow(tx, projectId, planId);
      const plan = await this.getFirstProductionPlanOrThrow(tx, projectId, planId);
      await this.lockFirstProductionPlanTaskAndGetContext(tx, actor, projectId);

      if (!canConfirmFirstProductionPlan(plan.status)) {
        throw new BadRequestException('当前首台计划状态不允许确认。');
      }

      const claimed = await tx.productionPlan.updateMany({
        where: {
          id: planId,
          projectId,
          planType: ProductionPlanType.FIRST_UNIT,
          status: plan.status,
          updatedAt: plan.updatedAt,
        },
        data: {
          status: ProductionPlanStatus.PLANNED,
          confirmedAt: new Date(),
          confirmedById: actor.id,
        },
      });
      if (claimed.count !== 1) {
        this.throwPilotProductionStateChanged();
      }
      const confirmedPlan = await tx.productionPlan.findUniqueOrThrow({
        where: { id: planId },
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      await this.lockFirstProductionPlanRows(tx, projectId);
      const context = await this.lockFirstProductionPlanTaskAndGetContext(
        tx, actor,
        projectId,
      );

      if (!context.activeTask) {
        throw new BadRequestException('当前没有可完成的首台生产计划任务。');
      }

      const completionIssue = getFirstProductionPlanCompletionIssue(context.items);

      if (completionIssue) {
        throw new BadRequestException(completionIssue);
      }

      for (const plan of context.items) {
        if (
          plan.status !== ProductionPlanStatus.PLANNED &&
          plan.status !== ProductionPlanStatus.IN_PROGRESS
        ) {
          continue;
        }

        const claimed = await tx.productionPlan.updateMany({
          where: {
            id: plan.id,
            projectId,
            planType: ProductionPlanType.FIRST_UNIT,
            status: plan.status,
            updatedAt: plan.updatedAt,
          },
          data: {
            status: ProductionPlanStatus.COMPLETED,
          },
        });
        if (claimed.count !== 1) {
          this.throwPilotProductionStateChanged();
        }
      }

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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseTrialProductionWriteInput(rawInput);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const context = await this.lockTrialProductionTaskAndGetContext(tx, actor, projectId);
      this.assertTrialProductionCapacity(context.items, true);
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
        include: TRIAL_PRODUCTION_WRITE_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.TRIAL_PRODUCTION,
        targetId: createdTrial.id,
        action: 'TRIAL_PRODUCTION_CREATED',
        metadata: { workflowTaskId: context.activeTask!.id, evidenceKind: 'TASK_CREATED_RECORD' },
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseTrialProductionWriteInput(rawInput);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      await this.lockTrialProductionRow(tx, projectId, trialId);
      const trial = await this.getTrialProductionForMutationOrThrow(
        tx,
        projectId,
        trialId,
      );
      await this.lockTrialProductionTaskAndGetContext(tx, actor, projectId);
      this.assertTrialProductionIssueCount(trial._count.issues, false);

      if (!canEditTrialProduction(trial.status)) {
        throw new BadRequestException('已完成或已取消的试制记录不允许编辑。');
      }

      await this.assertValidTrialProductionPlan(tx, projectId, input.productionPlanId);
      if (input.vehicleNo !== trial.trialNo) {
        await this.assertUniqueVehicleNo(tx, projectId, input.vehicleNo, trial.id);
      }

      const claimed = await tx.trialProduction.updateMany({
        where: {
          id: trialId,
          projectId,
          status: trial.status,
          updatedAt: trial.updatedAt,
        },
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
      });
      if (claimed.count !== 1) {
        this.throwPilotProductionStateChanged();
      }
      const updatedTrial = await tx.trialProduction.findUniqueOrThrow({
        where: { id: trialId },
        include: TRIAL_PRODUCTION_WRITE_INCLUDE,
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseTrialIssueWriteInput(rawInput);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      await this.lockTrialProductionRow(tx, projectId, trialId);
      const trial = await this.getTrialProductionForMutationOrThrow(
        tx,
        projectId,
        trialId,
      );
      await this.lockTrialProductionTaskAndGetContext(tx, actor, projectId);
      this.assertTrialProductionIssueCount(trial._count.issues, true);

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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      await this.lockTrialProductionRow(tx, projectId, trialId);
      const trial = await this.getTrialProductionForMutationOrThrow(
        tx,
        projectId,
        trialId,
      );
      await this.lockTrialProductionTaskAndGetContext(tx, actor, projectId);

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

      const claimed = await tx.trialProduction.updateMany({
        where: {
          id: trialId,
          projectId,
          status: trial.status,
          updatedAt: trial.updatedAt,
        },
        data: {
          status: getTrialProductionStatusAfterComplete(trial.result!),
          startedAt: trial.startedAt ?? trial.plannedAt ?? new Date(),
          completedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        this.throwPilotProductionStateChanged();
      }
      const completedTrial = await tx.trialProduction.findUniqueOrThrow({
        where: { id: trialId },
        include: TRIAL_PRODUCTION_WRITE_INCLUDE,
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const context = await this.lockTrialProductionTaskAndGetContext(tx, actor, projectId);

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

  private assertProjectAccess(
    projectId: string,
    actor: AuthenticatedUser,
    requiredPermission: string,
  ) {
    return this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      requiredPermission,
    );
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
        take: FIRST_PRODUCTION_PLAN_RECORD_LIMIT + 1,
      }),
    ]);

    this.assertFirstProductionPlanCapacity(items, false);

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
        select: {
          id: true,
          planNo: true,
          planDate: true,
          status: true,
          owner: {
            select: { name: true },
          },
        },
        orderBy: [{ planDate: 'desc' }, { createdAt: 'desc' }],
        take: FIRST_PRODUCTION_PLAN_RECORD_LIMIT + 1,
      }),
      db.trialProduction.findMany({
        where: { projectId },
        select: TRIAL_PRODUCTION_WORKSPACE_SELECT,
        orderBy: [{ createdAt: 'desc' }],
        take: TRIAL_PRODUCTION_RECORD_LIMIT + 1,
      }),
    ]);

    this.assertFirstProductionPlanCapacity(planOptions, false);
    this.assertTrialProductionCapacity(items, false);
    for (const item of items) {
      this.assertTrialProductionIssueCount(item._count.issues, false);
    }

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
      items: items.map((item) => this.toTrialProductionWorkspaceSummary(item)),
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
        select: {
          id: true,
          status: true,
          updatedAt: true,
        },
        take: FIRST_PRODUCTION_PLAN_RECORD_LIMIT + 1,
      }),
    ]);

    this.assertFirstProductionPlanCapacity(items, false);

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
        select: {
          id: true,
          status: true,
          result: true,
        },
        take: TRIAL_PRODUCTION_RECORD_LIMIT + 1,
      }),
    ]);

    this.assertTrialProductionCapacity(items, false);

    return {
      project,
      activeTask,
      firstPlanTaskCompleted,
      items,
    };
  }

  private async lockFirstProductionPlanTaskAndGetContext(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    projectId: string,
  ) {
    const lockedTasks = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "workflow_tasks"
      WHERE "projectId" = ${projectId}
        AND "nodeCode" = ${WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN}::"WorkflowNodeCode"
        AND "isActive" = true
      ORDER BY "createdAt" DESC, "taskRound" DESC
      LIMIT 1
      FOR UPDATE
    `);
    const lockedTaskId = lockedTasks[0]?.id;
    if (!lockedTaskId) {
      this.throwPilotProductionStateChanged();
    }

    const context = await this.getFirstProductionPlanContext(tx, projectId);
    this.assertWritableFirstProductionPlanStage(context);
    if (context.activeTask?.id !== lockedTaskId) {
      this.throwPilotProductionStateChanged();
    }
    await assertTeamTaskById(tx, context.activeTask!.id, actor);
    return context;
  }

  private async lockTrialProductionTaskAndGetContext(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    projectId: string,
  ) {
    const lockedTasks = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "workflow_tasks"
      WHERE "projectId" = ${projectId}
        AND "nodeCode" = ${WorkflowNodeCode.TRIAL_PRODUCTION}::"WorkflowNodeCode"
        AND "isActive" = true
      ORDER BY "createdAt" DESC, "taskRound" DESC
      LIMIT 1
      FOR UPDATE
    `);
    const lockedTaskId = lockedTasks[0]?.id;
    if (!lockedTaskId) {
      this.throwPilotProductionStateChanged();
    }

    const context = await this.getTrialProductionContext(tx, projectId);
    this.assertWritableTrialProductionStage(context);
    if (context.activeTask?.id !== lockedTaskId) {
      this.throwPilotProductionStateChanged();
    }
    await assertTeamTaskById(tx, context.activeTask!.id, actor);
    return context;
  }

  private async lockFirstProductionPlanRow(
    tx: Prisma.TransactionClient,
    projectId: string,
    planId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "production_plans"
      WHERE "id" = ${planId}
        AND "projectId" = ${projectId}
        AND "planType" = ${ProductionPlanType.FIRST_UNIT}::"ProductionPlanType"
      FOR UPDATE
    `);
    if (rows.length !== 1) {
      throw new NotFoundException('首台生产计划不存在。');
    }
  }

  private async lockFirstProductionPlanRows(
    tx: Prisma.TransactionClient,
    projectId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "production_plans"
      WHERE "projectId" = ${projectId}
        AND "planType" = ${ProductionPlanType.FIRST_UNIT}::"ProductionPlanType"
      ORDER BY "id"
      LIMIT ${FIRST_PRODUCTION_PLAN_RECORD_LIMIT + 1}
      FOR UPDATE
    `);
    this.assertFirstProductionPlanCapacity(rows, false);
  }

  private async lockTrialProductionRow(
    tx: Prisma.TransactionClient,
    projectId: string,
    trialId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "trial_productions"
      WHERE "id" = ${trialId} AND "projectId" = ${projectId}
      FOR UPDATE
    `);
    if (rows.length !== 1) {
      throw new NotFoundException('试制记录不存在。');
    }
  }

  private throwPilotProductionStateChanged(): never {
    throw new ConflictException({
      code: 'PILOT_PRODUCTION_STATE_CHANGED',
      message: '首台生产计划、样车试制记录或流程状态已变更，请刷新后重试。',
    });
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
    assertApprovedTeamMember(actor);
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
      include: TRIAL_PRODUCTION_DETAIL_INCLUDE,
    });

    if (!trial) {
      throw new NotFoundException('试制记录不存在。');
    }

    this.assertTrialProductionIssueCapacity(trial.issues, false);
    this.assertTrialProductionIssueCount(trial._count.issues, false);
    return trial;
  }

  private async getTrialProductionForMutationOrThrow(
    db: PilotProductionsDbClient,
    projectId: string,
    trialId: string,
  ) {
    const trial = await db.trialProduction.findFirst({
      where: {
        id: trialId,
        projectId,
      },
      include: TRIAL_PRODUCTION_WRITE_INCLUDE,
    });

    if (!trial) {
      throw new NotFoundException('试制记录不存在。');
    }

    this.assertTrialProductionIssueCount(trial._count.issues, false);
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

    this.assertPilotId(ownerId, '责任人', this.throwFirstProductionPlanInput.bind(this));
    this.assertPilotText(
      workshop,
      '车间',
      PILOT_PRODUCTION_NAME_MAX_CHARS,
      this.throwFirstProductionPlanInput.bind(this),
    );
    this.assertPilotText(
      lineName,
      '生产线',
      PILOT_PRODUCTION_NAME_MAX_CHARS,
      this.throwFirstProductionPlanInput.bind(this),
    );
    this.assertPilotCode(
      batchNo,
      '批次号',
      this.throwFirstProductionPlanInput.bind(this),
    );
    if (note) {
      this.assertPilotText(
        note,
        '备注',
        PILOT_PRODUCTION_LONG_TEXT_MAX_CHARS,
        this.throwFirstProductionPlanInput.bind(this),
      );
    }

    const plannedQuantity = this.parseFirstProductionPlanQuantity(
      input.plannedQuantity,
    );
    const normalized = {
      ownerId,
      workshop,
      lineName,
      batchNo,
      note,
      planDate: this.parseDate(input.planDate, '计划日期'),
      plannedQuantity,
    };
    this.assertPilotPayloadBound(
      normalized,
      '首台计划',
      this.throwFirstProductionPlanInput.bind(this),
    );
    return normalized;
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

    if (productionPlanId) {
      this.assertPilotId(
        productionPlanId,
        '关联首台计划',
        this.throwTrialProductionInput.bind(this),
      );
    }
    this.assertPilotCode(
      vehicleNo,
      '样车编号',
      this.throwTrialProductionInput.bind(this),
    );
    this.assertPilotText(
      workshop,
      '车间',
      PILOT_PRODUCTION_NAME_MAX_CHARS,
      this.throwTrialProductionInput.bind(this),
    );
    this.assertPilotCode(
      paintBatchNo,
      '涂料批次',
      this.throwTrialProductionInput.bind(this),
    );
    if (issueSummary) {
      this.assertPilotText(
        issueSummary,
        '问题摘要',
        PILOT_PRODUCTION_LONG_TEXT_MAX_CHARS,
        this.throwTrialProductionInput.bind(this),
      );
    }
    if (note) {
      this.assertPilotText(
        note,
        '备注',
        PILOT_PRODUCTION_LONG_TEXT_MAX_CHARS,
        this.throwTrialProductionInput.bind(this),
      );
    }

    const normalized = {
      productionPlanId,
      vehicleNo,
      workshop,
      trialDate: this.parseDate(input.trialDate, '试制日期'),
      paintBatchNo,
      result,
      issueSummary,
      note,
    };
    this.assertPilotPayloadBound(
      normalized,
      '试制记录',
      this.throwTrialProductionInput.bind(this),
    );
    return normalized;
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

    this.assertPilotText(
      issueType,
      '问题类型',
      PILOT_PRODUCTION_SHORT_TEXT_MAX_CHARS,
      this.throwTrialProductionIssueInput.bind(this),
    );
    this.assertPilotText(
      description,
      '问题描述',
      PILOT_PRODUCTION_LONG_TEXT_MAX_CHARS,
      this.throwTrialProductionIssueInput.bind(this),
    );
    this.assertPilotText(
      responsibleDept,
      '责任部门',
      PILOT_PRODUCTION_SHORT_TEXT_MAX_CHARS,
      this.throwTrialProductionIssueInput.bind(this),
    );

    const normalized = {
      issueType,
      description,
      severity,
      responsibleDept,
    };
    this.assertPilotPayloadBound(
      normalized,
      '试制问题',
      this.throwTrialProductionIssueInput.bind(this),
    );
    return normalized;
  }

  private parseFirstProductionPlanQuantity(value: unknown) {
    if (typeof value !== 'number' && typeof value !== 'string') {
      throw new BadRequestException('计划数量不能为空。');
    }

    const numericValue = Number(value);

    if (
      !Number.isSafeInteger(numericValue) ||
      numericValue <= 0 ||
      numericValue > PILOT_PRODUCTION_MAX_QUANTITY
    ) {
      this.throwFirstProductionPlanInput(
        `计划数量必须为 1～${PILOT_PRODUCTION_MAX_QUANTITY} 的整数。`,
      );
    }

    return numericValue;
  }

  private assertFirstProductionPlanCapacity(
    items: readonly unknown[],
    forCreate: boolean,
  ) {
    if (
      items.length > FIRST_PRODUCTION_PLAN_RECORD_LIMIT ||
      (forCreate && items.length >= FIRST_PRODUCTION_PLAN_RECORD_LIMIT)
    ) {
      throw new ConflictException({
        code: 'FIRST_PRODUCTION_PLAN_RECORD_LIMIT_EXCEEDED',
        message: `每个项目最多保留 ${FIRST_PRODUCTION_PLAN_RECORD_LIMIT} 条首台生产计划。`,
      });
    }
  }

  private assertTrialProductionCapacity(items: readonly unknown[], forCreate: boolean) {
    if (
      items.length > TRIAL_PRODUCTION_RECORD_LIMIT ||
      (forCreate && items.length >= TRIAL_PRODUCTION_RECORD_LIMIT)
    ) {
      throw new ConflictException({
        code: 'TRIAL_PRODUCTION_RECORD_LIMIT_EXCEEDED',
        message: `每个项目最多保留 ${TRIAL_PRODUCTION_RECORD_LIMIT} 条试制记录。`,
      });
    }
  }

  private assertTrialProductionIssueCapacity(
    issues: readonly unknown[],
    forCreate: boolean,
  ) {
    this.assertTrialProductionIssueCount(issues.length, forCreate);
  }

  private assertTrialProductionIssueCount(issueCount: number, forCreate: boolean) {
    if (
      issueCount > TRIAL_PRODUCTION_ISSUE_LIMIT ||
      (forCreate && issueCount >= TRIAL_PRODUCTION_ISSUE_LIMIT)
    ) {
      throw new ConflictException({
        code: 'TRIAL_PRODUCTION_ISSUE_LIMIT_EXCEEDED',
        message: `每条试制记录最多保留 ${TRIAL_PRODUCTION_ISSUE_LIMIT} 个问题。`,
      });
    }
  }

  private assertPilotText(
    value: string,
    label: string,
    maxChars: number,
    fail: (message: string) => never,
  ) {
    if (value.length > maxChars) {
      fail(`${label}不得超过 ${maxChars} 个字符。`);
    }
  }

  private assertPilotId(
    value: string,
    label: string,
    fail: (message: string) => never,
  ) {
    if (
      value.length > PILOT_PRODUCTION_ID_MAX_CHARS ||
      !PILOT_PRODUCTION_ID_PATTERN.test(value)
    ) {
      fail(`${label}标识不合法。`);
    }
  }

  private assertPilotCode(
    value: string,
    label: string,
    fail: (message: string) => never,
  ) {
    if (
      value.length > PILOT_PRODUCTION_CODE_MAX_CHARS ||
      !PILOT_PRODUCTION_CODE_PATTERN.test(value)
    ) {
      fail(
        `${label}仅允许 1～${PILOT_PRODUCTION_CODE_MAX_CHARS} 位字母、数字、点、下划线或连字符。`,
      );
    }
  }

  private assertPilotPayloadBound(
    normalized: object,
    label: string,
    fail: (message: string) => never,
  ) {
    if (
      Buffer.byteLength(JSON.stringify(normalized), 'utf8') >
      PILOT_PRODUCTION_MAX_PAYLOAD_BYTES
    ) {
      fail(`${label}不得超过 ${PILOT_PRODUCTION_MAX_PAYLOAD_BYTES} 字节。`);
    }
  }

  private throwFirstProductionPlanInput(message: string): never {
    throw new BadRequestException({
      code: 'FIRST_PRODUCTION_PLAN_INPUT_OUT_OF_BOUNDS',
      message,
    });
  }

  private throwTrialProductionInput(message: string): never {
    throw new BadRequestException({
      code: 'TRIAL_PRODUCTION_INPUT_OUT_OF_BOUNDS',
      message,
    });
  }

  private throwTrialProductionIssueInput(message: string): never {
    throw new BadRequestException({
      code: 'TRIAL_PRODUCTION_ISSUE_INPUT_OUT_OF_BOUNDS',
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

  private toTrialProductionWorkspaceSummary(
    trial: Prisma.TrialProductionGetPayload<{
      select: typeof TRIAL_PRODUCTION_WORKSPACE_SELECT;
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
      issueCount: trial._count.issues,
    };
  }

  private toTrialProductionDetailSummary(
    trial: Prisma.TrialProductionGetPayload<{
      include: typeof TRIAL_PRODUCTION_DETAIL_INCLUDE;
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
      issueCount: trial._count.issues,
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
      include: typeof TRIAL_PRODUCTION_WRITE_INCLUDE;
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
      issueCount: trial._count.issues,
    } satisfies Prisma.InputJsonValue;
  }
}
