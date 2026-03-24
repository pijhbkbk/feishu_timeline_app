import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttachmentTargetType,
  AuditTargetType,
  ReviewResult,
  ReviewType,
  TrialProductionStatus,
  UserStatus,
  WorkflowAction,
  WorkflowNodeCode,
  WorkflowTaskStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AttachmentsService } from '../attachments/attachments.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  getAllowedWorkflowActions,
  getCurrentNodeName,
  isWorkflowActionCurrentlyAvailable,
} from '../workflows/workflow-node.constants';
import { WorkflowsService } from '../workflows/workflows.service';
import {
  CABIN_REVIEW_MANAGEMENT_ROLE_CODES,
  getCabinReviewApproveIssue,
  getCabinReviewRejectIssue,
  getCabinReviewReturnNodeCode,
  getCabinReviewStageIssue,
  getCabinReviewSubmitIssue,
  getConsistencyReviewReturnNodeCode,
  getConsistencyReviewStageIssue,
  getVisualDeltaReviewReturnNodeCode,
  getVisualDeltaReviewStageIssue,
} from './reviews.rules';

type ReviewsDbClient = Prisma.TransactionClient | PrismaService;

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type ReviewWriteConclusion = (typeof CABIN_REVIEW_ALLOWED_RESULTS)[number];

type CabinReviewWriteInput = {
  reviewDate: Date;
  reviewerId: string;
  reviewConclusion: ReviewWriteConclusion;
  comment: string;
  conditionNote: string | null;
  rejectReason: string | null;
};

const CABIN_REVIEW_ALLOWED_RESULTS = [
  ReviewResult.APPROVED,
  ReviewResult.CONDITIONAL_APPROVED,
  ReviewResult.REJECTED,
] as const;

const CABIN_REVIEW_INCLUDE = {
  reviewer: true,
  attachment: true,
  trialProduction: true,
  workflowTask: {
    include: {
      assigneeUser: true,
      assigneeDepartment: true,
    },
  },
} satisfies Prisma.ReviewRecordInclude;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly attachmentsService: AttachmentsService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  getCabinReviewWorkspace(projectId: string) {
    return this.buildCabinReviewWorkspace(this.prisma, projectId);
  }

  async createCabinReview(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseReviewWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getCabinReviewContext(tx, projectId);
      this.assertWritableCabinReviewStage(context);
      await this.assertReviewerReference(tx, input.reviewerId);

      const trialProduction = await this.getLatestCompletedTrialProductionOrThrow(tx, projectId);
      const duplicatedReview = await tx.reviewRecord.findFirst({
        where: {
          workflowTaskId: context.activeTask!.id,
          reviewerId: input.reviewerId,
        },
        select: { id: true },
      });

      if (duplicatedReview) {
        throw new BadRequestException('当前评审任务下，该评审人已存在记录。');
      }

      const reviewRecord = await tx.reviewRecord.create({
        data: {
          projectId,
          workflowTaskId: context.activeTask!.id,
          trialProductionId: trialProduction.id,
          reviewerId: input.reviewerId,
          reviewType: ReviewType.CAB_REVIEW,
          result: input.reviewConclusion,
          comment: input.comment,
          conditionNote: input.conditionNote,
          rejectReason: input.rejectReason,
          reviewedAt: input.reviewDate,
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewRecord.id,
        action: 'CABIN_REVIEW_CREATED',
        nodeCode: WorkflowNodeCode.CAB_REVIEW,
        summary: `创建驾驶室评审记录 ${reviewRecord.id}`,
        afterData: this.toCabinReviewAuditSnapshot(reviewRecord),
      });
    });

    return this.buildCabinReviewWorkspace(this.prisma, projectId);
  }

  async updateCabinReview(
    projectId: string,
    reviewId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseReviewWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getCabinReviewContext(tx, projectId);
      this.assertWritableCabinReviewStage(context);
      const reviewRecord = await this.getCabinReviewOrThrow(tx, projectId, reviewId);
      this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);
      this.assertDraftReviewRecord(reviewRecord);
      await this.assertReviewerReference(tx, input.reviewerId);
      await this.assertUniqueReviewerPerTask(
        tx,
        context.activeTask!.id,
        input.reviewerId,
        reviewId,
      );

      const updatedRecord = await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          reviewerId: input.reviewerId,
          result: input.reviewConclusion,
          comment: input.comment,
          conditionNote: input.conditionNote,
          rejectReason: input.rejectReason,
          reviewedAt: input.reviewDate,
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'CABIN_REVIEW_UPDATED',
        nodeCode: WorkflowNodeCode.CAB_REVIEW,
        summary: `更新驾驶室评审记录 ${reviewId}`,
        beforeData: this.toCabinReviewAuditSnapshot(reviewRecord),
        afterData: this.toCabinReviewAuditSnapshot(updatedRecord),
      });
    });

    return this.buildCabinReviewWorkspace(this.prisma, projectId);
  }

  async uploadCabinReviewAttachment(
    projectId: string,
    reviewId: string,
    file: UploadedBinaryFile | undefined,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    if (!file) {
      throw new BadRequestException('请选择要上传的评审附件。');
    }

    const context = await this.getCabinReviewContext(this.prisma, projectId);
    this.assertWritableCabinReviewStage(context);
    const reviewRecord = await this.getCabinReviewOrThrow(this.prisma, projectId, reviewId);
    this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);
    this.assertDraftReviewRecord(reviewRecord);

    const attachment = await this.attachmentsService.createStoredAttachment({
      projectId,
      targetType: AttachmentTargetType.REVIEW_RECORD,
      targetId: reviewId,
      file,
      uploadedById: actor.id,
      nodeCode: WorkflowNodeCode.CAB_REVIEW,
      summary: `上传驾驶室评审附件 ${reviewId}`,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          attachmentId: attachment.id,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'CABIN_REVIEW_ATTACHMENT_UPLOADED',
        nodeCode: WorkflowNodeCode.CAB_REVIEW,
        summary: `驾驶室评审记录 ${reviewId} 已上传附件。`,
        afterData: {
          attachmentId: attachment.id,
          fileName: attachment.fileName,
        },
      });
    });

    return this.buildCabinReviewWorkspace(this.prisma, projectId);
  }

  async submitCabinReview(
    projectId: string,
    reviewId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getCabinReviewContext(tx, projectId);
      this.assertWritableCabinReviewStage(context);
      const reviewRecord = await this.getCabinReviewOrThrow(tx, projectId, reviewId);
      this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);
      this.assertDraftReviewRecord(reviewRecord);

      const submitIssue = getCabinReviewSubmitIssue({
        reviewDate: reviewRecord.reviewedAt,
        reviewerId: reviewRecord.reviewerId,
        reviewConclusion: reviewRecord.result,
        comment: reviewRecord.comment,
        conditionNote: reviewRecord.conditionNote,
        rejectReason: reviewRecord.rejectReason,
      });

      if (submitIssue) {
        throw new BadRequestException(submitIssue);
      }

      const submittedRecord = await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          submittedAt: new Date(),
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'CABIN_REVIEW_SUBMITTED',
        nodeCode: WorkflowNodeCode.CAB_REVIEW,
        summary: `提交驾驶室评审记录 ${reviewId}`,
        afterData: this.toCabinReviewAuditSnapshot(submittedRecord),
      });
    });

    return this.buildCabinReviewWorkspace(this.prisma, projectId);
  }

  async approveCabinReview(
    projectId: string,
    reviewId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getCabinReviewContext(tx, projectId);
      this.assertWritableCabinReviewStage(context);
      const reviewRecord = await this.getCabinReviewOrThrow(tx, projectId, reviewId);
      this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);

      const approveIssue = getCabinReviewApproveIssue({
        reviewConclusion: reviewRecord.result,
        submittedAt: reviewRecord.submittedAt,
        conditionNote: reviewRecord.conditionNote,
      });

      if (approveIssue) {
        throw new BadRequestException(approveIssue);
      }

      const updatedReview = await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          returnToNodeCode: null,
          rejectReason: null,
          reviewedAt: reviewRecord.reviewedAt ?? new Date(),
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask!.id,
        WorkflowAction.APPROVE,
        actor,
        {
          comment:
            updatedReview.result === ReviewResult.CONDITIONAL_APPROVED
              ? `驾驶室评审条件通过：${updatedReview.conditionNote ?? ''}`
              : '驾驶室评审通过。',
          metadata: {
            reviewRecordId: updatedReview.id,
            reviewConclusion: updatedReview.result,
          },
        },
      );

      const [developmentFeeTask, consistencyReviewTask] = await Promise.all([
        this.getLatestWorkflowTaskByNode(
          tx,
          projectId,
          WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE,
        ),
        this.getLatestWorkflowTaskByNode(
          tx,
          projectId,
          WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
        ),
      ]);

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'CABIN_REVIEW_APPROVED',
        nodeCode: WorkflowNodeCode.CAB_REVIEW,
        summary:
          updatedReview.result === ReviewResult.CONDITIONAL_APPROVED
            ? '驾驶室评审条件通过，并行节点已激活。'
            : '驾驶室评审通过，并行节点已激活。',
        afterData: {
          reviewRecordId: updatedReview.id,
          result: updatedReview.result,
          developmentFeeTaskId: developmentFeeTask?.id ?? null,
          consistencyReviewTaskId: consistencyReviewTask?.id ?? null,
        },
      });
    });

    return this.buildCabinReviewWorkspace(this.prisma, projectId);
  }

  async rejectCabinReview(
    projectId: string,
    reviewId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getCabinReviewContext(tx, projectId);
      this.assertWritableCabinReviewStage(context);
      const reviewRecord = await this.getCabinReviewOrThrow(tx, projectId, reviewId);
      this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);

      const rejectIssue = getCabinReviewRejectIssue({
        reviewConclusion: reviewRecord.result,
        submittedAt: reviewRecord.submittedAt,
        rejectReason: reviewRecord.rejectReason,
      });

      if (rejectIssue) {
        throw new BadRequestException(rejectIssue);
      }

      const updatedReview = await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          returnToNodeCode: getCabinReviewReturnNodeCode(),
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask!.id,
        WorkflowAction.REJECT,
        actor,
        {
          comment: updatedReview.rejectReason ?? '驾驶室评审不通过，退回样车试制。',
          metadata: {
            reviewRecordId: updatedReview.id,
            returnToNodeCode: updatedReview.returnToNodeCode,
          },
        },
      );

      const returnedTrialTask = await this.getLatestWorkflowTaskByNode(
        tx,
        projectId,
        WorkflowNodeCode.TRIAL_PRODUCTION,
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'CABIN_REVIEW_REJECTED',
        nodeCode: WorkflowNodeCode.CAB_REVIEW,
        summary: '驾驶室评审驳回，已退回样车试制。',
        afterData: {
          reviewRecordId: updatedReview.id,
          rejectReason: updatedReview.rejectReason,
          returnToNodeCode: updatedReview.returnToNodeCode,
          returnedTrialTaskId: returnedTrialTask?.id ?? null,
        },
      });
    });

    return this.buildCabinReviewWorkspace(this.prisma, projectId);
  }

  getConsistencyReviewWorkspace(projectId: string) {
    return this.buildConsistencyReviewWorkspace(this.prisma, projectId);
  }

  async createConsistencyReview(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseReviewWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getConsistencyReviewContext(tx, projectId);
      this.assertWritableConsistencyReviewStage(context);
      await this.assertReviewerReference(tx, input.reviewerId);
      await this.assertUniqueReviewerPerTask(tx, context.activeTask!.id, input.reviewerId);

      const reviewRecord = await tx.reviewRecord.create({
        data: {
          projectId,
          workflowTaskId: context.activeTask!.id,
          reviewerId: input.reviewerId,
          reviewType: ReviewType.COLOR_CONSISTENCY_REVIEW,
          result: input.reviewConclusion,
          comment: input.comment,
          conditionNote: input.conditionNote,
          rejectReason: input.rejectReason,
          reviewedAt: input.reviewDate,
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewRecord.id,
        action: 'CONSISTENCY_REVIEW_CREATED',
        nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
        summary: `创建颜色一致性评审记录 ${reviewRecord.id}`,
        afterData: this.toCabinReviewAuditSnapshot(reviewRecord),
      });
    });

    return this.buildConsistencyReviewWorkspace(this.prisma, projectId);
  }

  async updateConsistencyReview(
    projectId: string,
    reviewId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseReviewWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getConsistencyReviewContext(tx, projectId);
      this.assertWritableConsistencyReviewStage(context);
      const reviewRecord = await this.getConsistencyReviewOrThrow(tx, projectId, reviewId);
      this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);
      this.assertDraftReviewRecord(reviewRecord);
      await this.assertReviewerReference(tx, input.reviewerId);
      await this.assertUniqueReviewerPerTask(
        tx,
        context.activeTask!.id,
        input.reviewerId,
        reviewId,
      );

      const updatedRecord = await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          reviewerId: input.reviewerId,
          result: input.reviewConclusion,
          comment: input.comment,
          conditionNote: input.conditionNote,
          rejectReason: input.rejectReason,
          reviewedAt: input.reviewDate,
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'CONSISTENCY_REVIEW_UPDATED',
        nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
        summary: `更新颜色一致性评审记录 ${reviewId}`,
        beforeData: this.toCabinReviewAuditSnapshot(reviewRecord),
        afterData: this.toCabinReviewAuditSnapshot(updatedRecord),
      });
    });

    return this.buildConsistencyReviewWorkspace(this.prisma, projectId);
  }

  async uploadConsistencyReviewAttachment(
    projectId: string,
    reviewId: string,
    file: UploadedBinaryFile | undefined,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    if (!file) {
      throw new BadRequestException('请选择要上传的一致性评审附件。');
    }

    const context = await this.getConsistencyReviewContext(this.prisma, projectId);
    this.assertWritableConsistencyReviewStage(context);
    const reviewRecord = await this.getConsistencyReviewOrThrow(this.prisma, projectId, reviewId);
    this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);
    this.assertDraftReviewRecord(reviewRecord);

    const attachment = await this.attachmentsService.createStoredAttachment({
      projectId,
      targetType: AttachmentTargetType.REVIEW_RECORD,
      targetId: reviewId,
      file,
      uploadedById: actor.id,
      nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
      summary: `上传颜色一致性评审附件 ${reviewId}`,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          attachmentId: attachment.id,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'CONSISTENCY_REVIEW_ATTACHMENT_UPLOADED',
        nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
        summary: `颜色一致性评审记录 ${reviewId} 已上传附件。`,
        afterData: {
          attachmentId: attachment.id,
          fileName: attachment.fileName,
        },
      });
    });

    return this.buildConsistencyReviewWorkspace(this.prisma, projectId);
  }

  async submitConsistencyReview(
    projectId: string,
    reviewId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getConsistencyReviewContext(tx, projectId);
      this.assertWritableConsistencyReviewStage(context);
      const reviewRecord = await this.getConsistencyReviewOrThrow(tx, projectId, reviewId);
      this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);
      this.assertDraftReviewRecord(reviewRecord);

      const submitIssue = getCabinReviewSubmitIssue({
        reviewDate: reviewRecord.reviewedAt,
        reviewerId: reviewRecord.reviewerId,
        reviewConclusion: reviewRecord.result,
        comment: reviewRecord.comment,
        conditionNote: reviewRecord.conditionNote,
        rejectReason: reviewRecord.rejectReason,
      });

      if (submitIssue) {
        throw new BadRequestException(submitIssue);
      }

      const submittedRecord = await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          submittedAt: new Date(),
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'CONSISTENCY_REVIEW_SUBMITTED',
        nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
        summary: `提交颜色一致性评审记录 ${reviewId}`,
        afterData: this.toCabinReviewAuditSnapshot(submittedRecord),
      });
    });

    return this.buildConsistencyReviewWorkspace(this.prisma, projectId);
  }

  async approveConsistencyReview(
    projectId: string,
    reviewId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getConsistencyReviewContext(tx, projectId);
      this.assertWritableConsistencyReviewStage(context);
      const reviewRecord = await this.getConsistencyReviewOrThrow(tx, projectId, reviewId);
      this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);

      const approveIssue = getCabinReviewApproveIssue({
        reviewConclusion: reviewRecord.result,
        submittedAt: reviewRecord.submittedAt,
        conditionNote: reviewRecord.conditionNote,
      });

      if (approveIssue) {
        throw new BadRequestException(approveIssue);
      }

      const updatedReview = await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          returnToNodeCode: null,
          rejectReason: null,
          reviewedAt: reviewRecord.reviewedAt ?? new Date(),
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask!.id,
        WorkflowAction.APPROVE,
        actor,
        {
          comment:
            updatedReview.result === ReviewResult.CONDITIONAL_APPROVED
              ? `颜色一致性评审条件通过：${updatedReview.conditionNote ?? ''}`
              : '颜色一致性评审通过。',
          metadata: {
            reviewRecordId: updatedReview.id,
            reviewConclusion: updatedReview.result,
          },
        },
      );

      const schedulePlanTask = await this.getLatestWorkflowTaskByNode(
        tx,
        projectId,
        WorkflowNodeCode.MASS_PRODUCTION_PLAN,
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'CONSISTENCY_REVIEW_APPROVED',
        nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
        summary:
          updatedReview.result === ReviewResult.CONDITIONAL_APPROVED
            ? '颜色一致性评审条件通过，排产计划节点已激活。'
            : '颜色一致性评审通过，排产计划节点已激活。',
        afterData: {
          reviewRecordId: updatedReview.id,
          result: updatedReview.result,
          schedulePlanTaskId: schedulePlanTask?.id ?? null,
        },
      });
    });

    return this.buildConsistencyReviewWorkspace(this.prisma, projectId);
  }

  async rejectConsistencyReview(
    projectId: string,
    reviewId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getConsistencyReviewContext(tx, projectId);
      this.assertWritableConsistencyReviewStage(context);
      const reviewRecord = await this.getConsistencyReviewOrThrow(tx, projectId, reviewId);
      this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);

      const rejectIssue = getCabinReviewRejectIssue({
        reviewConclusion: reviewRecord.result,
        submittedAt: reviewRecord.submittedAt,
        rejectReason: reviewRecord.rejectReason,
      });

      if (rejectIssue) {
        throw new BadRequestException(rejectIssue);
      }

      const updatedReview = await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          returnToNodeCode: getConsistencyReviewReturnNodeCode(),
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask!.id,
        WorkflowAction.REJECT,
        actor,
        {
          comment: updatedReview.rejectReason ?? '颜色一致性评审不通过，退回涂料开发。',
          metadata: {
            reviewRecordId: updatedReview.id,
            returnToNodeCode: updatedReview.returnToNodeCode,
          },
        },
      );

      const returnedPaintDevelopmentTask = await this.getLatestWorkflowTaskByNode(
        tx,
        projectId,
        WorkflowNodeCode.PAINT_DEVELOPMENT,
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'CONSISTENCY_REVIEW_REJECTED',
        nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
        summary: '颜色一致性评审驳回，已退回涂料开发。',
        afterData: {
          reviewRecordId: updatedReview.id,
          rejectReason: updatedReview.rejectReason,
          returnToNodeCode: updatedReview.returnToNodeCode,
          returnedPaintDevelopmentTaskId: returnedPaintDevelopmentTask?.id ?? null,
        },
      });
    });

    return this.buildConsistencyReviewWorkspace(this.prisma, projectId);
  }

  getVisualDeltaReviewWorkspace(projectId: string) {
    return this.buildVisualDeltaReviewWorkspace(this.prisma, projectId);
  }

  async createVisualDeltaReview(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseReviewWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getVisualDeltaReviewContext(tx, projectId);
      this.assertWritableVisualDeltaReviewStage(context);
      await this.assertReviewerReference(tx, input.reviewerId);
      await this.assertUniqueReviewerPerTask(tx, context.activeTask!.id, input.reviewerId);

      const reviewRecord = await tx.reviewRecord.create({
        data: {
          projectId,
          workflowTaskId: context.activeTask!.id,
          reviewerId: input.reviewerId,
          reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
          result: input.reviewConclusion,
          comment: input.comment,
          conditionNote: input.conditionNote,
          rejectReason: input.rejectReason,
          reviewedAt: input.reviewDate,
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewRecord.id,
        action: 'VISUAL_DELTA_REVIEW_CREATED',
        nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        summary: `创建目视色差评审记录 ${reviewRecord.id}`,
        afterData: this.toCabinReviewAuditSnapshot(reviewRecord),
      });
    });

    return this.buildVisualDeltaReviewWorkspace(this.prisma, projectId);
  }

  async updateVisualDeltaReview(
    projectId: string,
    reviewId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseReviewWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getVisualDeltaReviewContext(tx, projectId);
      this.assertWritableVisualDeltaReviewStage(context);
      const reviewRecord = await this.getVisualDeltaReviewOrThrow(tx, projectId, reviewId);
      this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);
      this.assertDraftReviewRecord(reviewRecord);
      await this.assertReviewerReference(tx, input.reviewerId);
      await this.assertUniqueReviewerPerTask(
        tx,
        context.activeTask!.id,
        input.reviewerId,
        reviewId,
      );

      const updatedRecord = await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          reviewerId: input.reviewerId,
          result: input.reviewConclusion,
          comment: input.comment,
          conditionNote: input.conditionNote,
          rejectReason: input.rejectReason,
          reviewedAt: input.reviewDate,
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'VISUAL_DELTA_REVIEW_UPDATED',
        nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        summary: `更新目视色差评审记录 ${reviewId}`,
        beforeData: this.toCabinReviewAuditSnapshot(reviewRecord),
        afterData: this.toCabinReviewAuditSnapshot(updatedRecord),
      });
    });

    return this.buildVisualDeltaReviewWorkspace(this.prisma, projectId);
  }

  async uploadVisualDeltaReviewAttachment(
    projectId: string,
    reviewId: string,
    file: UploadedBinaryFile | undefined,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    if (!file) {
      throw new BadRequestException('请选择要上传的目视色差评审附件。');
    }

    const context = await this.getVisualDeltaReviewContext(this.prisma, projectId);
    this.assertWritableVisualDeltaReviewStage(context);
    const reviewRecord = await this.getVisualDeltaReviewOrThrow(this.prisma, projectId, reviewId);
    this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);
    this.assertDraftReviewRecord(reviewRecord);

    const attachment = await this.attachmentsService.createStoredAttachment({
      projectId,
      targetType: AttachmentTargetType.REVIEW_RECORD,
      targetId: reviewId,
      file,
      uploadedById: actor.id,
      nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
      summary: `上传目视色差评审附件 ${reviewId}`,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          attachmentId: attachment.id,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'VISUAL_DELTA_REVIEW_ATTACHMENT_UPLOADED',
        nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        summary: `目视色差评审记录 ${reviewId} 已上传附件。`,
        afterData: {
          attachmentId: attachment.id,
          fileName: attachment.fileName,
        },
      });
    });

    return this.buildVisualDeltaReviewWorkspace(this.prisma, projectId);
  }

  async submitVisualDeltaReview(
    projectId: string,
    reviewId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getVisualDeltaReviewContext(tx, projectId);
      this.assertWritableVisualDeltaReviewStage(context);
      const reviewRecord = await this.getVisualDeltaReviewOrThrow(tx, projectId, reviewId);
      this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);
      this.assertDraftReviewRecord(reviewRecord);

      const submitIssue = getCabinReviewSubmitIssue({
        reviewDate: reviewRecord.reviewedAt,
        reviewerId: reviewRecord.reviewerId,
        reviewConclusion: reviewRecord.result,
        comment: reviewRecord.comment,
        conditionNote: reviewRecord.conditionNote,
        rejectReason: reviewRecord.rejectReason,
      });

      if (submitIssue) {
        throw new BadRequestException(submitIssue);
      }

      const submittedRecord = await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          submittedAt: new Date(),
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'VISUAL_DELTA_REVIEW_SUBMITTED',
        nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        summary: `提交目视色差评审记录 ${reviewId}`,
        afterData: this.toCabinReviewAuditSnapshot(submittedRecord),
      });
    });

    return this.buildVisualDeltaReviewWorkspace(this.prisma, projectId);
  }

  async approveVisualDeltaReview(
    projectId: string,
    reviewId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getVisualDeltaReviewContext(tx, projectId);
      this.assertWritableVisualDeltaReviewStage(context);
      const reviewRecord = await this.getVisualDeltaReviewOrThrow(tx, projectId, reviewId);
      this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);

      const approveIssue = getCabinReviewApproveIssue({
        reviewConclusion: reviewRecord.result,
        submittedAt: reviewRecord.submittedAt,
        conditionNote: reviewRecord.conditionNote,
      });

      if (approveIssue) {
        throw new BadRequestException(approveIssue);
      }

      const updatedReview = await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          returnToNodeCode: null,
          rejectReason: null,
          reviewedAt: reviewRecord.reviewedAt ?? new Date(),
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask!.id,
        WorkflowAction.APPROVE,
        actor,
        {
          comment:
            updatedReview.result === ReviewResult.CONDITIONAL_APPROVED
              ? `目视色差评审条件通过：${updatedReview.conditionNote ?? ''}`
              : '目视色差评审通过。',
          metadata: {
            reviewRecordId: updatedReview.id,
            reviewConclusion: updatedReview.result,
          },
        },
      );

      const projectClosedTask = await this.getLatestWorkflowTaskByNode(
        tx,
        projectId,
        WorkflowNodeCode.PROJECT_CLOSED,
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'VISUAL_DELTA_REVIEW_APPROVED',
        nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        summary:
          updatedReview.result === ReviewResult.CONDITIONAL_APPROVED
            ? '目视色差评审条件通过，项目收尾节点已激活。'
            : '目视色差评审通过，项目收尾节点已激活。',
        afterData: {
          reviewRecordId: updatedReview.id,
          result: updatedReview.result,
          projectClosedTaskId: projectClosedTask?.id ?? null,
        },
      });
    });

    return this.buildVisualDeltaReviewWorkspace(this.prisma, projectId);
  }

  async rejectVisualDeltaReview(
    projectId: string,
    reviewId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getVisualDeltaReviewContext(tx, projectId);
      this.assertWritableVisualDeltaReviewStage(context);
      const reviewRecord = await this.getVisualDeltaReviewOrThrow(tx, projectId, reviewId);
      this.assertCurrentTaskEditable(reviewRecord, context.activeTask!.id);

      const rejectIssue = getCabinReviewRejectIssue({
        reviewConclusion: reviewRecord.result,
        submittedAt: reviewRecord.submittedAt,
        rejectReason: reviewRecord.rejectReason,
      });

      if (rejectIssue) {
        throw new BadRequestException(rejectIssue);
      }

      const updatedReview = await tx.reviewRecord.update({
        where: { id: reviewId },
        data: {
          returnToNodeCode: getVisualDeltaReviewReturnNodeCode(),
        },
        include: CABIN_REVIEW_INCLUDE,
      });

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask!.id,
        WorkflowAction.REJECT,
        actor,
        {
          comment: updatedReview.rejectReason ?? '目视色差评审不通过，退回批量生产。',
          metadata: {
            reviewRecordId: updatedReview.id,
            returnToNodeCode: updatedReview.returnToNodeCode,
          },
        },
      );

      const returnedMassProductionTask = await this.getLatestWorkflowTaskByNode(
        tx,
        projectId,
        WorkflowNodeCode.MASS_PRODUCTION,
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'VISUAL_DELTA_REVIEW_REJECTED',
        nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        summary: '目视色差评审驳回，已退回批量生产。',
        afterData: {
          reviewRecordId: updatedReview.id,
          rejectReason: updatedReview.rejectReason,
          returnToNodeCode: updatedReview.returnToNodeCode,
          returnedMassProductionTaskId: returnedMassProductionTask?.id ?? null,
        },
      });
    });

    return this.buildVisualDeltaReviewWorkspace(this.prisma, projectId);
  }

  private async buildCabinReviewWorkspace(
    db: ReviewsDbClient,
    projectId: string,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [
      activeTask,
      trialProductionCompleted,
      latestTrialProduction,
      developmentFeeTask,
      consistencyReviewTask,
      items,
    ] = await Promise.all([
      this.getActiveTask(db, projectId, WorkflowNodeCode.CAB_REVIEW),
      this.hasCompletedWorkflowTask(db, projectId, WorkflowNodeCode.TRIAL_PRODUCTION),
      this.getLatestCompletedTrialProduction(db, projectId),
      this.getActiveTask(db, projectId, WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE),
      this.getActiveTask(db, projectId, WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW),
      db.reviewRecord.findMany({
        where: {
          projectId,
          reviewType: ReviewType.CAB_REVIEW,
        },
        include: CABIN_REVIEW_INCLUDE,
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    return {
      project: this.toProjectSummary(project),
      trialProductionCompleted,
      activeTask: activeTask ? this.toWorkflowTaskSummary(activeTask) : null,
      downstreamTasks: {
        developmentFee: developmentFeeTask
          ? this.toWorkflowTaskSummary(developmentFeeTask)
          : null,
        consistencyReview: consistencyReviewTask
          ? this.toWorkflowTaskSummary(consistencyReviewTask)
          : null,
      },
      latestTrialProduction: latestTrialProduction
        ? {
            id: latestTrialProduction.id,
            vehicleNo: latestTrialProduction.trialNo,
            completedAt: latestTrialProduction.completedAt?.toISOString() ?? null,
            result: latestTrialProduction.result,
            issueSummary: latestTrialProduction.summary,
          }
        : null,
      items: await Promise.all(
        items.map((item) => this.toCabinReviewSummary(db, item)),
      ),
    };
  }

  private async buildConsistencyReviewWorkspace(
    db: ReviewsDbClient,
    projectId: string,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [activeTask, cabinReviewCompleted, schedulePlanTask, items] = await Promise.all([
      this.getActiveTask(db, projectId, WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW),
      this.hasApprovedOrCompletedWorkflowTask(db, projectId, WorkflowNodeCode.CAB_REVIEW),
      this.getActiveTask(db, projectId, WorkflowNodeCode.MASS_PRODUCTION_PLAN),
      db.reviewRecord.findMany({
        where: {
          projectId,
          reviewType: ReviewType.COLOR_CONSISTENCY_REVIEW,
        },
        include: CABIN_REVIEW_INCLUDE,
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    return {
      project: this.toProjectSummary(project),
      cabinReviewCompleted,
      activeTask: activeTask ? this.toWorkflowTaskSummary(activeTask) : null,
      downstreamTask: schedulePlanTask
        ? this.toWorkflowTaskSummary(schedulePlanTask)
        : null,
      items: await Promise.all(items.map((item) => this.toCabinReviewSummary(db, item))),
    };
  }

  private async buildVisualDeltaReviewWorkspace(
    db: ReviewsDbClient,
    projectId: string,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [activeTask, massProductionCompleted, projectClosedTask, items] =
      await Promise.all([
        this.getActiveTask(
          db,
          projectId,
          WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        ),
        this.hasCompletedWorkflowTask(db, projectId, WorkflowNodeCode.MASS_PRODUCTION),
        this.getActiveTask(db, projectId, WorkflowNodeCode.PROJECT_CLOSED),
        db.reviewRecord.findMany({
          where: {
            projectId,
            reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
          },
          include: CABIN_REVIEW_INCLUDE,
          orderBy: [{ createdAt: 'desc' }],
        }),
      ]);

    return {
      project: this.toProjectSummary(project),
      massProductionCompleted,
      activeTask: activeTask ? this.toWorkflowTaskSummary(activeTask) : null,
      downstreamTask: projectClosedTask
        ? this.toWorkflowTaskSummary(projectClosedTask)
        : null,
      items: await Promise.all(items.map((item) => this.toCabinReviewSummary(db, item))),
    };
  }

  private async getCabinReviewContext(db: ReviewsDbClient, projectId: string) {
    const [project, activeTask, trialProductionCompleted] = await Promise.all([
      this.getProjectOrThrow(db, projectId),
      this.getActiveTask(db, projectId, WorkflowNodeCode.CAB_REVIEW),
      this.hasCompletedWorkflowTask(db, projectId, WorkflowNodeCode.TRIAL_PRODUCTION),
    ]);

    return {
      project,
      activeTask,
      trialProductionCompleted,
    };
  }

  private async getConsistencyReviewContext(
    db: ReviewsDbClient,
    projectId: string,
  ) {
    const [project, activeTask, cabinReviewCompleted] = await Promise.all([
      this.getProjectOrThrow(db, projectId),
      this.getActiveTask(db, projectId, WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW),
      this.hasApprovedOrCompletedWorkflowTask(db, projectId, WorkflowNodeCode.CAB_REVIEW),
    ]);

    return {
      project,
      activeTask,
      cabinReviewCompleted,
    };
  }

  private async getVisualDeltaReviewContext(
    db: ReviewsDbClient,
    projectId: string,
  ) {
    const [project, activeTask, massProductionCompleted] = await Promise.all([
      this.getProjectOrThrow(db, projectId),
      this.getActiveTask(
        db,
        projectId,
        WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
      ),
      this.hasCompletedWorkflowTask(db, projectId, WorkflowNodeCode.MASS_PRODUCTION),
    ]);

    return {
      project,
      activeTask,
      massProductionCompleted,
    };
  }

  private assertWritableCabinReviewStage(context: {
    trialProductionCompleted: boolean;
    activeTask: { id: string } | null;
  }) {
    const issue = getCabinReviewStageIssue({
      trialProductionCompleted: context.trialProductionCompleted,
      hasActiveTask: Boolean(context.activeTask),
    });

    if (issue) {
      throw new BadRequestException(issue);
    }
  }

  private assertWritableConsistencyReviewStage(context: {
    cabinReviewCompleted: boolean;
    activeTask: { id: string } | null;
  }) {
    const issue = getConsistencyReviewStageIssue({
      cabinReviewCompleted: context.cabinReviewCompleted,
      hasActiveTask: Boolean(context.activeTask),
    });

    if (issue) {
      throw new BadRequestException(issue);
    }
  }

  private assertWritableVisualDeltaReviewStage(context: {
    massProductionCompleted: boolean;
    activeTask: { id: string } | null;
  }) {
    const issue = getVisualDeltaReviewStageIssue({
      massProductionCompleted: context.massProductionCompleted,
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
        CABIN_REVIEW_MANAGEMENT_ROLE_CODES.includes(
          roleCode as (typeof CABIN_REVIEW_MANAGEMENT_ROLE_CODES)[number],
        ),
      )
    ) {
      return;
    }

    throw new BadRequestException('当前用户没有评审权限。');
  }

  private async getProjectOrThrow(db: ReviewsDbClient, projectId: string) {
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
    db: ReviewsDbClient,
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

  private async getLatestWorkflowTaskByNode(
    db: ReviewsDbClient,
    projectId: string,
    nodeCode: WorkflowNodeCode,
  ) {
    return db.workflowTask.findFirst({
      where: {
        projectId,
        nodeCode,
      },
      select: {
        id: true,
      },
      orderBy: [{ createdAt: 'desc' }, { taskRound: 'desc' }],
    });
  }

  private async hasCompletedWorkflowTask(
    db: ReviewsDbClient,
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

  private async hasApprovedOrCompletedWorkflowTask(
    db: ReviewsDbClient,
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

  private async getLatestCompletedTrialProduction(
    db: ReviewsDbClient,
    projectId: string,
  ) {
    return db.trialProduction.findFirst({
      where: {
        projectId,
        status: {
          in: [TrialProductionStatus.PASSED, TrialProductionStatus.FAILED],
        },
      },
      orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  private async getLatestCompletedTrialProductionOrThrow(
    db: ReviewsDbClient,
    projectId: string,
  ) {
    const trialProduction = await db.trialProduction.findFirst({
      where: {
        projectId,
        status: {
          in: [TrialProductionStatus.PASSED, TrialProductionStatus.FAILED],
        },
      },
      orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    if (!trialProduction) {
      throw new BadRequestException('没有已完成的样车试制记录，不能创建驾驶室评审。');
    }

    return trialProduction;
  }

  private async getCabinReviewOrThrow(
    db: ReviewsDbClient,
    projectId: string,
    reviewId: string,
  ) {
    const reviewRecord = await db.reviewRecord.findFirst({
      where: {
        id: reviewId,
        projectId,
        reviewType: ReviewType.CAB_REVIEW,
      },
      include: CABIN_REVIEW_INCLUDE,
    });

    if (!reviewRecord) {
      throw new NotFoundException('驾驶室评审记录不存在。');
    }

    return reviewRecord;
  }

  private async getConsistencyReviewOrThrow(
    db: ReviewsDbClient,
    projectId: string,
    reviewId: string,
  ) {
    const reviewRecord = await db.reviewRecord.findFirst({
      where: {
        id: reviewId,
        projectId,
        reviewType: ReviewType.COLOR_CONSISTENCY_REVIEW,
      },
      include: CABIN_REVIEW_INCLUDE,
    });

    if (!reviewRecord) {
      throw new NotFoundException('颜色一致性评审记录不存在。');
    }

    return reviewRecord;
  }

  private async getVisualDeltaReviewOrThrow(
    db: ReviewsDbClient,
    projectId: string,
    reviewId: string,
  ) {
    const reviewRecord = await db.reviewRecord.findFirst({
      where: {
        id: reviewId,
        projectId,
        reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
      },
      include: CABIN_REVIEW_INCLUDE,
    });

    if (!reviewRecord) {
      throw new NotFoundException('目视色差评审记录不存在。');
    }

    return reviewRecord;
  }

  private async assertReviewerReference(
    db: ReviewsDbClient,
    reviewerId: string,
  ) {
    const reviewer = await db.user.findUnique({
      where: { id: reviewerId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!reviewer || reviewer.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('评审人不存在或不可用。');
    }
  }

  private async assertUniqueReviewerPerTask(
    db: ReviewsDbClient,
    workflowTaskId: string,
    reviewerId: string,
    excludeReviewId?: string,
  ) {
    const duplicatedReview = await db.reviewRecord.findFirst({
      where: {
        workflowTaskId,
        reviewerId,
        ...(excludeReviewId
          ? {
              id: {
                not: excludeReviewId,
              },
            }
          : {}),
      },
      select: { id: true },
    });

    if (duplicatedReview) {
      throw new BadRequestException('当前评审任务下，该评审人已存在记录。');
    }
  }

  private assertCurrentTaskEditable(
    reviewRecord: Prisma.ReviewRecordGetPayload<{
      include: typeof CABIN_REVIEW_INCLUDE;
    }>,
    activeTaskId: string,
  ) {
    if (reviewRecord.workflowTaskId !== activeTaskId) {
      throw new BadRequestException('当前评审记录不属于活跃评审任务。');
    }
  }

  private assertDraftReviewRecord(
    reviewRecord: Prisma.ReviewRecordGetPayload<{
      include: typeof CABIN_REVIEW_INCLUDE;
    }>,
  ) {
    if (reviewRecord.submittedAt) {
      throw new BadRequestException('评审记录已提交，不能再修改。');
    }
  }

  private parseReviewWriteInput(rawInput: unknown): CabinReviewWriteInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('评审数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const reviewerId = typeof input.reviewerId === 'string' ? input.reviewerId.trim() : '';
    const comment = typeof input.comment === 'string' ? input.comment.trim() : '';
    const conditionNote =
      typeof input.conditionNote === 'string' && input.conditionNote.trim().length > 0
        ? input.conditionNote.trim()
        : null;
    const rejectReason =
      typeof input.rejectReason === 'string' && input.rejectReason.trim().length > 0
        ? input.rejectReason.trim()
        : null;
    const reviewConclusion =
      typeof input.reviewConclusion === 'string' &&
      CABIN_REVIEW_ALLOWED_RESULTS.includes(input.reviewConclusion as ReviewWriteConclusion)
        ? (input.reviewConclusion as ReviewWriteConclusion)
        : null;

    if (!reviewerId) {
      throw new BadRequestException('评审人不能为空。');
    }

    if (!reviewConclusion) {
      throw new BadRequestException('评审结论不能为空。');
    }

    if (!comment) {
      throw new BadRequestException('评审意见不能为空。');
    }

    if (
      reviewConclusion === ReviewResult.CONDITIONAL_APPROVED &&
      !conditionNote
    ) {
      throw new BadRequestException('条件通过时必须填写说明。');
    }

    if (reviewConclusion === ReviewResult.REJECTED && !rejectReason) {
      throw new BadRequestException('驳回时必须填写原因。');
    }

    return {
      reviewerId,
      reviewConclusion,
      comment,
      conditionNote,
      rejectReason,
      reviewDate: this.parseDate(input.reviewDate, '评审日期'),
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

  private async toCabinReviewSummary(
    db: ReviewsDbClient,
    reviewRecord: Prisma.ReviewRecordGetPayload<{
      include: typeof CABIN_REVIEW_INCLUDE;
    }>,
  ) {
    const attachmentHistory = await this.attachmentsService.listTargetAttachments(
      db,
      AttachmentTargetType.REVIEW_RECORD,
      reviewRecord.id,
    );

    return {
      id: reviewRecord.id,
      workflowTaskId: reviewRecord.workflowTaskId,
      reviewType: reviewRecord.reviewType,
      reviewConclusion: reviewRecord.result,
      reviewDate: reviewRecord.reviewedAt?.toISOString() ?? null,
      submittedAt: reviewRecord.submittedAt?.toISOString() ?? null,
      reviewerId: reviewRecord.reviewerId,
      reviewerName: reviewRecord.reviewer?.name ?? null,
      comment: reviewRecord.comment,
      conditionNote: reviewRecord.conditionNote,
      rejectReason: reviewRecord.rejectReason,
      returnToNodeCode: reviewRecord.returnToNodeCode,
      returnToNodeName: getCurrentNodeName(reviewRecord.returnToNodeCode),
      createdAt: reviewRecord.createdAt.toISOString(),
      updatedAt: reviewRecord.updatedAt.toISOString(),
      trialProduction: reviewRecord.trialProduction
        ? {
            id: reviewRecord.trialProduction.id,
            vehicleNo: reviewRecord.trialProduction.trialNo,
            result: reviewRecord.trialProduction.result,
            completedAt: reviewRecord.trialProduction.completedAt?.toISOString() ?? null,
          }
        : null,
      attachment: reviewRecord.attachment
        ? this.attachmentsService.toAttachmentSummary(reviewRecord.attachment)
        : null,
      attachmentHistory: attachmentHistory.map((attachment) =>
        this.attachmentsService.toAttachmentSummary(attachment),
      ),
    };
  }

  private toCabinReviewAuditSnapshot(
    reviewRecord: Prisma.ReviewRecordGetPayload<{
      include: typeof CABIN_REVIEW_INCLUDE;
    }>,
  ) {
    return {
      id: reviewRecord.id,
      workflowTaskId: reviewRecord.workflowTaskId,
      reviewType: reviewRecord.reviewType,
      reviewConclusion: reviewRecord.result,
      reviewDate: reviewRecord.reviewedAt?.toISOString() ?? null,
      submittedAt: reviewRecord.submittedAt?.toISOString() ?? null,
      reviewerId: reviewRecord.reviewerId,
      reviewerName: reviewRecord.reviewer?.name ?? null,
      comment: reviewRecord.comment,
      conditionNote: reviewRecord.conditionNote,
      rejectReason: reviewRecord.rejectReason,
      returnToNodeCode: reviewRecord.returnToNodeCode,
      attachmentId: reviewRecord.attachmentId,
      trialProductionId: reviewRecord.trialProductionId,
      trialVehicleNo: reviewRecord.trialProduction?.trialNo ?? null,
    } satisfies Prisma.InputJsonValue;
  }
}
