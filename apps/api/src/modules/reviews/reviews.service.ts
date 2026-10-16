import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttachmentScanStatus,
  AttachmentTargetType,
  AuditTargetType,
  RecurringTaskStatus,
  ReviewResult,
  ReviewType,
  TrialProductionStatus,
  UserStatus,
  WorkflowAction,
  WorkflowNodeCode,
  WorkflowTaskStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AttachmentsService } from '../attachments/attachments.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import {
  getAllowedWorkflowActions,
  getCurrentNodeName,
  isWorkflowActionCurrentlyAvailable,
} from '../workflows/workflow-node.constants';
import { WorkflowsService } from '../workflows/workflows.service';
import {
  getCabinReviewApproveIssue,
  getCabinReviewRejectIssue,
  getCabinReviewReturnNodeCode,
  getCabinReviewStageIssue,
  getCabinReviewSubmitIssue,
  getConsistencyReviewReturnNodeCode,
  getConsistencyReviewStageIssue,
  getMonthlyReviewPeriodKey,
  getMonthlyReviewPeriodRange,
  shouldCompleteVisualDeltaWorkflow,
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

type ReviewAttachmentHistoryRow = {
  id: string;
  projectId: string;
  entityType: AttachmentTargetType;
  entityId: string;
  bucket: string;
  storageKey: string;
  fileName: string;
  originalFileName: string | null;
  fileExtension: string | null;
  mimeType: string;
  fileSize: number;
  checksum: string | null;
  fileUrl: string | null;
  scanStatus: AttachmentScanStatus;
  scannerEngine: string | null;
  scannerVersion: string | null;
  scannerSignatureVersion: string | null;
  scanResultSummary: string | null;
  scannedAt: Date | null;
  materialType: string | null;
  versionNo: number;
  replacesAttachmentId: string | null;
  uploadedById: string | null;
  uploadedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  uploadedByName: string | null;
  deletedByName: string | null;
};

type ReviewAttachmentHistory = {
  items: ReviewAttachmentHistoryRow[];
  hasMore: boolean;
};

const CABIN_REVIEW_ALLOWED_RESULTS = [
  ReviewResult.APPROVED,
  ReviewResult.CONDITIONAL_APPROVED,
  ReviewResult.REJECTED,
] as const;

const REVIEW_RECORD_LIMIT = 100;
const VISUAL_DELTA_REVIEW_PERIOD_LIMIT = 12;
const REVIEW_ATTACHMENT_HISTORY_LIMIT = 20;
const REVIEW_MAX_PAYLOAD_BYTES = 16 * 1024;
const REVIEWER_ID_MAX_CHARS = 64;
const REVIEW_COMMENT_MAX_CHARS = 4_000;
const REVIEW_CONDITION_NOTE_MAX_CHARS = 1_900;
const REVIEW_REJECT_REASON_MAX_CHARS = 2_000;
const REVIEWER_NAME_MAX_CHARS = 200;
const REVIEWER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

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

type ReviewRecordWithDetails = Prisma.ReviewRecordGetPayload<{
  include: typeof CABIN_REVIEW_INCLUDE;
}>;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly attachmentsService: AttachmentsService,
    private readonly workflowsService: WorkflowsService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  async getCabinReviewWorkspace(projectId: string, actor: AuthenticatedUser) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );
    return this.buildCabinReviewWorkspace(this.prisma, projectId);
  }

  async createCabinReview(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    await this.assertActorCanManage(projectId, actor);
    const input = this.parseReviewWriteInput(rawInput);
    this.assertActorCanAssignReviewer(actor, input.reviewerId);

    await this.prisma.$transaction(async (tx) => {
      const { context } = await this.lockCabinReviewWriteState(
        tx,
        projectId,
        actor,
      );
      await this.assertReviewCreateCapacity(
        tx,
        projectId,
        ReviewType.CAB_REVIEW,
      );
      await this.assertReviewWriteInputPersistable(tx, input);

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
    await this.assertActorCanManage(projectId, actor);
    const input = this.parseReviewWriteInput(rawInput);
    this.assertActorCanAssignReviewer(actor, input.reviewerId);

    await this.prisma.$transaction(async (tx) => {
      const { context, reviewRecord } = await this.lockCabinReviewWriteState(
        tx,
        projectId,
        actor,
        reviewId,
      );
      if (!reviewRecord) {
        this.throwReviewStateChanged();
      }
      this.assertDraftReviewRecordForLockedWrite(reviewRecord);
      await this.assertReviewWriteInputPersistable(tx, input);
      await this.assertUniqueReviewerPerTask(
        tx,
        context.activeTask!.id,
        input.reviewerId,
        reviewId,
      );

      const updatedRecord = await this.claimReviewRecordUpdate(
        tx,
        reviewRecord,
        {
          reviewerId: input.reviewerId,
          result: input.reviewConclusion,
          comment: input.comment,
          conditionNote: input.conditionNote,
          rejectReason: input.rejectReason,
          reviewedAt: input.reviewDate,
        },
      );

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
    await this.assertActorCanManage(projectId, actor);

    if (!file) {
      throw new BadRequestException('请选择要上传的评审附件。');
    }

    const context = await this.getCabinReviewContext(this.prisma, projectId);
    this.assertWritableCabinReviewStage(context);
    const reviewRecord = await this.getCabinReviewOrThrow(this.prisma, projectId, reviewId, actor);
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
      replacesAttachmentId: reviewRecord.attachmentId,
      finalizeDomainAttachment: this.createReviewAttachmentFinalizeHook({
        projectId,
        reviewId,
        reviewType: ReviewType.CAB_REVIEW,
        workflowTaskId: context.activeTask!.id,
        reviewerId: reviewRecord.reviewerId,
        expectedAttachmentId: reviewRecord.attachmentId,
        nodeCode: WorkflowNodeCode.CAB_REVIEW,
        actor,
      }),
    });

    await this.prisma.$transaction(async (tx) => {
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
    await this.assertActorCanManage(projectId, actor);

    await this.prisma.$transaction(async (tx) => {
      const { reviewRecord } = await this.lockCabinReviewWriteState(
        tx,
        projectId,
        actor,
        reviewId,
      );
      if (!reviewRecord) {
        this.throwReviewStateChanged();
      }
      this.assertDraftReviewRecordForLockedWrite(reviewRecord);

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

      const submittedRecord = await this.claimReviewRecordUpdate(
        tx,
        reviewRecord,
        {
          submittedAt: new Date(),
        },
      );

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
    await this.assertActorCanManage(projectId, actor);

    await this.prisma.$transaction(async (tx) => {
      const { context, reviewRecord } = await this.lockCabinReviewWriteState(
        tx,
        projectId,
        actor,
        reviewId,
      );
      if (!reviewRecord) {
        this.throwReviewStateChanged();
      }

      const approveIssue = getCabinReviewApproveIssue({
        reviewConclusion: reviewRecord.result,
        submittedAt: reviewRecord.submittedAt,
        conditionNote: reviewRecord.conditionNote,
      });

      if (approveIssue) {
        throw new BadRequestException(approveIssue);
      }

      const updatedReview = await this.claimReviewRecordUpdate(
        tx,
        reviewRecord,
        {
          returnToNodeCode: null,
          rejectReason: null,
          reviewedAt: reviewRecord.reviewedAt ?? new Date(),
        },
      );

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
        'designated-review',
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
    await this.assertActorCanManage(projectId, actor);

    await this.prisma.$transaction(async (tx) => {
      const { context, reviewRecord } = await this.lockCabinReviewWriteState(
        tx,
        projectId,
        actor,
        reviewId,
      );
      if (!reviewRecord) {
        this.throwReviewStateChanged();
      }

      const rejectIssue = getCabinReviewRejectIssue({
        reviewConclusion: reviewRecord.result,
        submittedAt: reviewRecord.submittedAt,
        rejectReason: reviewRecord.rejectReason,
      });

      if (rejectIssue) {
        throw new BadRequestException(rejectIssue);
      }

      const updatedReview = await this.claimReviewRecordUpdate(
        tx,
        reviewRecord,
        {
          returnToNodeCode: getCabinReviewReturnNodeCode(),
        },
      );

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
        'designated-review',
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

  async getConsistencyReviewWorkspace(projectId: string, actor: AuthenticatedUser) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );
    return this.buildConsistencyReviewWorkspace(this.prisma, projectId);
  }

  async createConsistencyReview(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    await this.assertActorCanManage(projectId, actor);
    const input = this.parseReviewWriteInput(rawInput);
    this.assertActorCanAssignReviewer(actor, input.reviewerId);

    await this.prisma.$transaction(async (tx) => {
      const { context } = await this.lockConsistencyReviewWriteState(
        tx,
        projectId,
        actor,
      );
      await this.assertReviewCreateCapacity(
        tx,
        projectId,
        ReviewType.COLOR_CONSISTENCY_REVIEW,
      );
      await this.assertReviewWriteInputPersistable(tx, input);
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
    await this.assertActorCanManage(projectId, actor);
    const input = this.parseReviewWriteInput(rawInput);
    this.assertActorCanAssignReviewer(actor, input.reviewerId);

    await this.prisma.$transaction(async (tx) => {
      const { context, reviewRecord } =
        await this.lockConsistencyReviewWriteState(
          tx,
          projectId,
          actor,
          reviewId,
        );
      if (!reviewRecord) {
        this.throwReviewStateChanged();
      }
      this.assertDraftReviewRecordForLockedWrite(reviewRecord);
      await this.assertReviewWriteInputPersistable(tx, input);
      await this.assertUniqueReviewerPerTask(
        tx,
        context.activeTask!.id,
        input.reviewerId,
        reviewId,
      );

      const updatedRecord = await this.claimReviewRecordUpdate(
        tx,
        reviewRecord,
        {
          reviewerId: input.reviewerId,
          result: input.reviewConclusion,
          comment: input.comment,
          conditionNote: input.conditionNote,
          rejectReason: input.rejectReason,
          reviewedAt: input.reviewDate,
        },
      );

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
    await this.assertActorCanManage(projectId, actor);

    if (!file) {
      throw new BadRequestException('请选择要上传的一致性评审附件。');
    }

    const context = await this.getConsistencyReviewContext(this.prisma, projectId);
    this.assertWritableConsistencyReviewStage(context);
    const reviewRecord = await this.getConsistencyReviewOrThrow(
      this.prisma,
      projectId,
      reviewId,
      actor,
    );
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
      replacesAttachmentId: reviewRecord.attachmentId,
      finalizeDomainAttachment: this.createReviewAttachmentFinalizeHook({
        projectId,
        reviewId,
        reviewType: ReviewType.COLOR_CONSISTENCY_REVIEW,
        workflowTaskId: context.activeTask!.id,
        reviewerId: reviewRecord.reviewerId,
        expectedAttachmentId: reviewRecord.attachmentId,
        nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
        actor,
      }),
    });

    await this.prisma.$transaction(async (tx) => {
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
    await this.assertActorCanManage(projectId, actor);

    await this.prisma.$transaction(async (tx) => {
      const { reviewRecord } = await this.lockConsistencyReviewWriteState(
        tx,
        projectId,
        actor,
        reviewId,
      );
      if (!reviewRecord) {
        this.throwReviewStateChanged();
      }
      this.assertDraftReviewRecordForLockedWrite(reviewRecord);

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

      const submittedRecord = await this.claimReviewRecordUpdate(
        tx,
        reviewRecord,
        {
          submittedAt: new Date(),
        },
      );

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
    await this.assertActorCanManage(projectId, actor);

    await this.prisma.$transaction(async (tx) => {
      const { context, reviewRecord } =
        await this.lockConsistencyReviewWriteState(
          tx,
          projectId,
          actor,
          reviewId,
        );
      if (!reviewRecord) {
        this.throwReviewStateChanged();
      }

      const approveIssue = getCabinReviewApproveIssue({
        reviewConclusion: reviewRecord.result,
        submittedAt: reviewRecord.submittedAt,
        conditionNote: reviewRecord.conditionNote,
      });

      if (approveIssue) {
        throw new BadRequestException(approveIssue);
      }

      const updatedReview = await this.claimReviewRecordUpdate(
        tx,
        reviewRecord,
        {
          returnToNodeCode: null,
          rejectReason: null,
          reviewedAt: reviewRecord.reviewedAt ?? new Date(),
        },
      );

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
        'designated-review',
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
    await this.assertActorCanManage(projectId, actor);

    await this.prisma.$transaction(async (tx) => {
      const { context, reviewRecord } =
        await this.lockConsistencyReviewWriteState(
          tx,
          projectId,
          actor,
          reviewId,
        );
      if (!reviewRecord) {
        this.throwReviewStateChanged();
      }

      const rejectIssue = getCabinReviewRejectIssue({
        reviewConclusion: reviewRecord.result,
        submittedAt: reviewRecord.submittedAt,
        rejectReason: reviewRecord.rejectReason,
      });

      if (rejectIssue) {
        throw new BadRequestException(rejectIssue);
      }

      const updatedReview = await this.claimReviewRecordUpdate(
        tx,
        reviewRecord,
        {
          returnToNodeCode: getConsistencyReviewReturnNodeCode(),
        },
      );

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
        'designated-review',
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

  async getVisualDeltaReviewWorkspace(projectId: string, actor: AuthenticatedUser) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );
    return this.buildVisualDeltaReviewWorkspace(this.prisma, projectId);
  }

  async createVisualDeltaReview(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    await this.assertActorCanManage(projectId, actor);
    const input = this.parseReviewWriteInput(rawInput);
    this.assertActorCanAssignReviewer(actor, input.reviewerId);

    await this.prisma.$transaction(async (tx) => {
      const { context, recurringPlanId } = await this.lockVisualDeltaReviewWriteState(
        tx,
        projectId,
        actor,
      );
      await this.assertReviewCreateCapacity(
        tx,
        projectId,
        ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
      );
      await this.assertReviewWriteInputPersistable(tx, input);
      await this.getVisualDeltaRecurringTaskForDate(
        tx,
        projectId,
        recurringPlanId,
        input.reviewDate,
      );
      await this.assertUniqueVisualReviewerPerPeriod(
        tx,
        context.activeTask!.id,
        input.reviewerId,
        input.reviewDate,
      );

      const reviewRecord = await tx.reviewRecord.create({
        data: {
          projectId,
          workflowTaskId: context.activeTask!.id,
          reviewerId: input.reviewerId,
          reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
          reviewPeriod: getMonthlyReviewPeriodKey(input.reviewDate),
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
    await this.assertActorCanManage(projectId, actor);
    const input = this.parseReviewWriteInput(rawInput);
    this.assertActorCanAssignReviewer(actor, input.reviewerId);

    await this.prisma.$transaction(async (tx) => {
      const { context, reviewRecord, recurringPlanId } =
        await this.lockVisualDeltaReviewWriteState(
          tx,
          projectId,
          actor,
          reviewId,
        );
      if (!reviewRecord) {
        this.throwReviewStateChanged();
      }
      this.assertDraftReviewRecordForLockedWrite(reviewRecord);
      await this.assertReviewWriteInputPersistable(tx, input);
      await this.getVisualDeltaRecurringTaskForDate(
        tx,
        projectId,
        recurringPlanId,
        input.reviewDate,
      );
      await this.assertUniqueVisualReviewerPerPeriod(
        tx,
        context.activeTask!.id,
        input.reviewerId,
        input.reviewDate,
        reviewId,
      );

      const updatedRecord = await this.claimReviewRecordUpdate(
        tx,
        reviewRecord,
        {
          reviewerId: input.reviewerId,
          reviewPeriod: getMonthlyReviewPeriodKey(input.reviewDate),
          result: input.reviewConclusion,
          comment: input.comment,
          conditionNote: input.conditionNote,
          rejectReason: input.rejectReason,
          reviewedAt: input.reviewDate,
        },
      );

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
    await this.assertActorCanManage(projectId, actor);

    if (!file) {
      throw new BadRequestException('请选择要上传的目视色差评审附件。');
    }

    const context = await this.getVisualDeltaReviewContext(this.prisma, projectId);
    this.assertWritableVisualDeltaReviewStage(context);
    const reviewRecord = await this.getVisualDeltaReviewOrThrow(
      this.prisma,
      projectId,
      reviewId,
      actor,
    );
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
      replacesAttachmentId: reviewRecord.attachmentId,
      finalizeDomainAttachment: this.createReviewAttachmentFinalizeHook({
        projectId,
        reviewId,
        reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
        workflowTaskId: context.activeTask!.id,
        reviewerId: reviewRecord.reviewerId,
        expectedAttachmentId: reviewRecord.attachmentId,
        nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        actor,
      }),
    });

    await this.prisma.$transaction(async (tx) => {
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
    await this.assertActorCanManage(projectId, actor);

    await this.prisma.$transaction(async (tx) => {
      const { reviewRecord } = await this.lockVisualDeltaReviewWriteState(
        tx,
        projectId,
        actor,
        reviewId,
      );
      if (!reviewRecord) {
        this.throwReviewStateChanged();
      }
      this.assertDraftReviewRecordForLockedWrite(reviewRecord);

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

      const submittedRecord = await this.claimReviewRecordUpdate(
        tx,
        reviewRecord,
        {
          submittedAt: new Date(),
        },
      );

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
    await this.assertActorCanManage(projectId, actor);

    await this.prisma.$transaction(async (tx) => {
      const { context, reviewRecord, recurringPlanId } =
        await this.lockVisualDeltaReviewWriteState(
          tx,
          projectId,
          actor,
          reviewId,
        );
      if (!reviewRecord) {
        this.throwReviewStateChanged();
      }

      const approveIssue = getCabinReviewApproveIssue({
        reviewConclusion: reviewRecord.result,
        submittedAt: reviewRecord.submittedAt,
        conditionNote: reviewRecord.conditionNote,
      });

      if (approveIssue) {
        throw new BadRequestException(approveIssue);
      }

      const updatedReview = await this.claimReviewRecordUpdate(
        tx,
        reviewRecord,
        {
          returnToNodeCode: null,
          rejectReason: null,
          reviewedAt: reviewRecord.reviewedAt ?? new Date(),
        },
      );

      const recurringTask = await this.getVisualDeltaRecurringTaskForDate(
        tx,
        projectId,
        recurringPlanId,
        updatedReview.reviewedAt!,
      );

      if (recurringTask.status === RecurringTaskStatus.COMPLETED) {
        throw new BadRequestException('当前月份已完成评审，请选择其他月份。');
      }

      if (
        context.activeTask!.status === WorkflowTaskStatus.PENDING ||
        context.activeTask!.status === WorkflowTaskStatus.READY ||
        context.activeTask!.status === WorkflowTaskStatus.RETURNED
      ) {
        await this.workflowsService.transitionTaskWithExecutor(
          tx,
          context.activeTask!.id,
          WorkflowAction.START,
          actor,
          {
            comment: '开始执行 12 个月目视色差评审计划。',
            metadata: {
              reviewRecordId: updatedReview.id,
              recurringTaskId: recurringTask.id,
            },
          },
          'designated-review',
        );
      }

      const completedAt = new Date();
      const completed = await tx.recurringTask.updateMany({
        where: {
          id: recurringTask.id,
          recurringPlanId,
          status: {
            in: [
              RecurringTaskStatus.PENDING,
              RecurringTaskStatus.IN_PROGRESS,
              RecurringTaskStatus.OVERDUE,
            ],
          },
        },
        data: {
          status: RecurringTaskStatus.COMPLETED,
          result: updatedReview.result,
          comment: updatedReview.comment,
          reviewerId: updatedReview.reviewerId,
          completedAt,
        },
      });

      if (completed.count !== 1) {
        throw new BadRequestException('当前月份评审状态已变更，请刷新后重试。');
      }

      const [recurringPlan, completedPeriods] = await Promise.all([
        tx.recurringPlan.findUniqueOrThrow({
          where: { id: recurringPlanId },
          select: { totalCount: true },
        }),
        tx.recurringTask.count({
          where: {
            recurringPlanId,
            status: RecurringTaskStatus.COMPLETED,
          },
        }),
      ]);
      const workflowComplete = shouldCompleteVisualDeltaWorkflow({
        completedPeriods,
        totalPeriods: recurringPlan.totalCount,
      });

      if (workflowComplete) {
        await this.workflowsService.transitionTaskWithExecutor(
          tx,
          context.activeTask!.id,
          WorkflowAction.APPROVE,
          actor,
          {
            comment: '12 个月目视色差评审全部完成。',
            metadata: {
              reviewRecordId: updatedReview.id,
              reviewConclusion: updatedReview.result,
              recurringTaskId: recurringTask.id,
              completedPeriods,
              totalPeriods: recurringPlan.totalCount,
            },
          },
          'designated-review',
        );
      }

      const projectClosedTask = workflowComplete
        ? await this.getLatestWorkflowTaskByNode(
            tx,
            projectId,
            WorkflowNodeCode.PROJECT_CLOSED,
          )
        : null;

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: reviewId,
        action: 'VISUAL_DELTA_REVIEW_APPROVED',
        nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        summary: workflowComplete
          ? '12 个月目视色差评审已全部完成，项目收尾节点已激活。'
          : `第 ${recurringTask.periodIndex} 个月目视色差评审已完成（${completedPeriods}/${recurringPlan.totalCount}）。`,
        afterData: {
          reviewRecordId: updatedReview.id,
          result: updatedReview.result,
          recurringTaskId: recurringTask.id,
          recurringTaskPeriodIndex: recurringTask.periodIndex,
          completedPeriods,
          totalPeriods: recurringPlan.totalCount,
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
    await this.assertActorCanManage(projectId, actor);

    await this.prisma.$transaction(async (tx) => {
      const { context, reviewRecord } =
        await this.lockVisualDeltaReviewWriteState(
          tx,
          projectId,
          actor,
          reviewId,
        );
      if (!reviewRecord) {
        this.throwReviewStateChanged();
      }

      const rejectIssue = getCabinReviewRejectIssue({
        reviewConclusion: reviewRecord.result,
        submittedAt: reviewRecord.submittedAt,
        rejectReason: reviewRecord.rejectReason,
      });

      if (rejectIssue) {
        throw new BadRequestException(rejectIssue);
      }

      const updatedReview = await this.claimReviewRecordUpdate(
        tx,
        reviewRecord,
        {
          returnToNodeCode: getVisualDeltaReviewReturnNodeCode(),
        },
      );

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
        'designated-review',
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
        take: REVIEW_RECORD_LIMIT + 1,
      }),
    ]);
    this.assertReviewRecordCapacity(items, false);
    const attachmentHistories = await this.loadReviewAttachmentHistories(
      db,
      projectId,
      items.map((item) => item.id),
    );

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
      items: items.map((item) =>
        this.toCabinReviewSummary(
          item,
          attachmentHistories.get(item.id),
        ),
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
        take: REVIEW_RECORD_LIMIT + 1,
      }),
    ]);
    this.assertReviewRecordCapacity(items, false);
    const attachmentHistories = await this.loadReviewAttachmentHistories(
      db,
      projectId,
      items.map((item) => item.id),
    );

    return {
      project: this.toProjectSummary(project),
      cabinReviewCompleted,
      activeTask: activeTask ? this.toWorkflowTaskSummary(activeTask) : null,
      downstreamTask: schedulePlanTask
        ? this.toWorkflowTaskSummary(schedulePlanTask)
        : null,
      items: items.map((item) =>
        this.toCabinReviewSummary(
          item,
          attachmentHistories.get(item.id),
        ),
      ),
    };
  }

  private async buildVisualDeltaReviewWorkspace(
    db: ReviewsDbClient,
    projectId: string,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [
      activeTask,
      massProductionCompleted,
      projectClosedTask,
      items,
    ] =
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
          take: REVIEW_RECORD_LIMIT + 1,
        }),
      ]);
    this.assertReviewRecordCapacity(items, false);
    const reviewTaskIds = [...new Set(items.map((item) => item.workflowTaskId))];
    const recurringPlans = reviewTaskIds.length === 0
      ? []
      : await db.recurringPlan.findMany({
          where: {
            projectId,
            sourceWorkflowTaskId: { in: reviewTaskIds },
            sourceNodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
          },
          select: {
            sourceWorkflowTaskId: true,
            tasks: {
              select: {
                status: true,
                plannedDate: true,
              },
              orderBy: [{ periodIndex: 'asc' }, { id: 'asc' }],
              take: VISUAL_DELTA_REVIEW_PERIOD_LIMIT + 1,
            },
          },
          take: reviewTaskIds.length + 1,
        });
    const planTaskIds = new Set<string>();
    const completedReviewPeriods = new Set<string>();
    for (const recurringPlan of recurringPlans) {
      if (
        !recurringPlan.sourceWorkflowTaskId ||
        planTaskIds.has(recurringPlan.sourceWorkflowTaskId)
      ) {
        throw new ConflictException({
          code: 'VISUAL_DELTA_REVIEW_PLAN_IDENTITY_CONFLICT',
          message: '目视色差评审任务关联了重复或无来源的月度计划。',
        });
      }
      planTaskIds.add(recurringPlan.sourceWorkflowTaskId);
      this.assertVisualDeltaReviewPeriodCapacity(recurringPlan.tasks);
      for (const task of recurringPlan.tasks) {
        if (task.status === RecurringTaskStatus.COMPLETED) {
          completedReviewPeriods.add(
            this.getVisualDeltaCompletionKey(
              recurringPlan.sourceWorkflowTaskId,
              getMonthlyReviewPeriodKey(task.plannedDate),
            ),
          );
        }
      }
    }
    const attachmentHistories = await this.loadReviewAttachmentHistories(
      db,
      projectId,
      items.map((item) => item.id),
    );

    return {
      project: this.toProjectSummary(project),
      massProductionCompleted,
      activeTask: activeTask ? this.toWorkflowTaskSummary(activeTask) : null,
      downstreamTask: projectClosedTask
        ? this.toWorkflowTaskSummary(projectClosedTask)
        : null,
      items: items.map((item) => ({
        ...this.toCabinReviewSummary(
          item,
          attachmentHistories.get(item.id),
        ),
        isPeriodCompleted: Boolean(
          item.reviewPeriod &&
            completedReviewPeriods.has(
              this.getVisualDeltaCompletionKey(
                item.workflowTaskId,
                item.reviewPeriod,
              ),
            ),
        ),
      })),
    };
  }

  private getVisualDeltaCompletionKey(
    workflowTaskId: string,
    reviewPeriod: string,
  ) {
    return `${workflowTaskId}:${reviewPeriod}`;
  }

  private async assertReviewCreateCapacity(
    db: ReviewsDbClient,
    projectId: string,
    reviewType: ReviewType,
  ) {
    const records = await this.loadReviewCapacityRows(
      db,
      projectId,
      reviewType,
    );
    this.assertReviewRecordCapacity(records, true);
  }

  private async assertReviewExistingCapacity(
    db: ReviewsDbClient,
    projectId: string,
    reviewType: ReviewType,
  ) {
    const records = await this.loadReviewCapacityRows(
      db,
      projectId,
      reviewType,
    );
    this.assertReviewRecordCapacity(records, false);
  }

  private loadReviewCapacityRows(
    db: ReviewsDbClient,
    projectId: string,
    reviewType: ReviewType,
  ) {
    return db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT review_record."id"
      FROM "review_records" AS review_record
      WHERE review_record."projectId" = ${projectId}
        AND review_record."reviewType" = ${reviewType}::"ReviewType"
      ORDER BY review_record."id" ASC
      LIMIT ${REVIEW_RECORD_LIMIT + 1}
    `);
  }

  private assertReviewRecordCapacity(
    records: readonly unknown[],
    forCreate: boolean,
  ) {
    if (
      records.length > REVIEW_RECORD_LIMIT ||
      (forCreate && records.length >= REVIEW_RECORD_LIMIT)
    ) {
      throw new ConflictException({
        code: 'REVIEW_RECORD_LIMIT_EXCEEDED',
        message: `每个项目的每类评审最多保留 ${REVIEW_RECORD_LIMIT} 条记录。`,
      });
    }
  }

  private assertVisualDeltaReviewPeriodCapacity(periods: readonly unknown[]) {
    if (periods.length > VISUAL_DELTA_REVIEW_PERIOD_LIMIT) {
      throw new ConflictException({
        code: 'VISUAL_DELTA_REVIEW_PERIOD_LIMIT_EXCEEDED',
        message: `目视色差评审最多读取 ${VISUAL_DELTA_REVIEW_PERIOD_LIMIT} 个月度周期。`,
      });
    }
  }

  private async loadReviewAttachmentHistories(
    db: ReviewsDbClient,
    projectId: string,
    reviewIds: string[],
  ) {
    const uniqueReviewIds = [...new Set(reviewIds)];
    if (uniqueReviewIds.length === 0) {
      return new Map<string, ReviewAttachmentHistory>();
    }
    if (uniqueReviewIds.length > REVIEW_RECORD_LIMIT) {
      throw new ConflictException({
        code: 'REVIEW_RECORD_LIMIT_EXCEEDED',
        message: `每个项目的每类评审最多保留 ${REVIEW_RECORD_LIMIT} 条记录。`,
      });
    }

    const rows = await db.$queryRaw<ReviewAttachmentHistoryRow[]>(Prisma.sql`
      WITH ranked_review_attachments AS (
        SELECT
          attachment."id",
          attachment."projectId",
          attachment."targetType" AS "entityType",
          attachment."targetId" AS "entityId",
          attachment."bucket",
          attachment."objectKey" AS "storageKey",
          attachment."fileName",
          attachment."originalFileName",
          attachment."fileExtension",
          attachment."contentType" AS "mimeType",
          attachment."fileSize",
          attachment."checksum",
          attachment."fileUrl",
          attachment."scanStatus",
          attachment."scannerEngine",
          attachment."scannerVersion",
          attachment."scannerSignatureVersion",
          attachment."scanResultSummary",
          attachment."scannedAt",
          attachment."materialType",
          attachment."versionNo",
          attachment."replacesAttachmentId",
          attachment."uploadedById",
          attachment."uploadedAt",
          attachment."isDeleted",
          attachment."deletedAt",
          attachment."deletedById",
          attachment."createdAt",
          attachment."updatedAt",
          ROW_NUMBER() OVER (
            PARTITION BY attachment."targetId"
            ORDER BY attachment."uploadedAt" DESC, attachment."id" DESC
          ) AS history_rank
        FROM "attachments" AS attachment
        WHERE attachment."projectId" = ${projectId}
          AND attachment."targetType" = ${AttachmentTargetType.REVIEW_RECORD}::"AttachmentTargetType"
          AND attachment."targetId" IN (${Prisma.join(uniqueReviewIds)})
          AND attachment."isDeleted" = FALSE
          AND attachment."scanStatus" = ${AttachmentScanStatus.CLEAN}::"AttachmentScanStatus"
      )
      SELECT
        ranked_review_attachments."id",
        ranked_review_attachments."projectId",
        ranked_review_attachments."entityType",
        ranked_review_attachments."entityId",
        ranked_review_attachments."bucket",
        ranked_review_attachments."storageKey",
        ranked_review_attachments."fileName",
        ranked_review_attachments."originalFileName",
        ranked_review_attachments."fileExtension",
        ranked_review_attachments."mimeType",
        ranked_review_attachments."fileSize",
        ranked_review_attachments."checksum",
        ranked_review_attachments."fileUrl",
        ranked_review_attachments."scanStatus",
        ranked_review_attachments."scannerEngine",
        ranked_review_attachments."scannerVersion",
        ranked_review_attachments."scannerSignatureVersion",
        ranked_review_attachments."scanResultSummary",
        ranked_review_attachments."scannedAt",
        ranked_review_attachments."materialType",
        ranked_review_attachments."versionNo",
        ranked_review_attachments."replacesAttachmentId",
        ranked_review_attachments."uploadedById",
        ranked_review_attachments."uploadedAt",
        ranked_review_attachments."isDeleted",
        ranked_review_attachments."deletedAt",
        ranked_review_attachments."deletedById",
        ranked_review_attachments."createdAt",
        ranked_review_attachments."updatedAt",
        uploader."name" AS "uploadedByName",
        deleter."name" AS "deletedByName"
      FROM ranked_review_attachments
      LEFT JOIN "users" AS uploader
        ON uploader."id" = ranked_review_attachments."uploadedById"
      LEFT JOIN "users" AS deleter
        ON deleter."id" = ranked_review_attachments."deletedById"
      WHERE ranked_review_attachments.history_rank <= ${REVIEW_ATTACHMENT_HISTORY_LIMIT + 1}
      ORDER BY
        ranked_review_attachments."entityId" ASC,
        ranked_review_attachments."uploadedAt" DESC,
        ranked_review_attachments."id" DESC
    `);

    const groupedRows = new Map<string, ReviewAttachmentHistoryRow[]>();
    for (const row of rows) {
      const group = groupedRows.get(row.entityId) ?? [];
      if (group.length < REVIEW_ATTACHMENT_HISTORY_LIMIT + 1) {
        group.push(row);
        groupedRows.set(row.entityId, group);
      }
    }

    return new Map(
      uniqueReviewIds.map((reviewId) => {
        const history = groupedRows.get(reviewId) ?? [];
        return [
          reviewId,
          {
            items: history.slice(0, REVIEW_ATTACHMENT_HISTORY_LIMIT),
            hasMore: history.length > REVIEW_ATTACHMENT_HISTORY_LIMIT,
          },
        ];
      }),
    );
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

  private async assertActorCanManage(projectId: string, actor: AuthenticatedUser) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'review.execute',
    );
  }

  private assertActorCanAssignReviewer(
    actor: AuthenticatedUser,
    reviewerId: string,
  ) {
    if (actor.roleCodes.includes('project_manager') || reviewerId === actor.id) {
      return;
    }

    throw new ForbiddenException('只有项目经理可指定其他评审人；评审人只能建立本人记录。');
  }

  private assertActorCanManageReviewRecord(
    actor: AuthenticatedUser,
    reviewerId: string | null,
  ) {
    if (actor.roleCodes.includes('project_manager') || reviewerId === actor.id) {
      return;
    }

    throw new ForbiddenException('第 12/17 步评审仅允许指定评审人或项目经理操作。');
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
    actor: AuthenticatedUser,
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

    this.assertActorCanManageReviewRecord(actor, reviewRecord.reviewerId);
    return reviewRecord;
  }

  private async getConsistencyReviewOrThrow(
    db: ReviewsDbClient,
    projectId: string,
    reviewId: string,
    actor: AuthenticatedUser,
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

    this.assertActorCanManageReviewRecord(actor, reviewRecord.reviewerId);
    return reviewRecord;
  }

  private async getVisualDeltaReviewOrThrow(
    db: ReviewsDbClient,
    projectId: string,
    reviewId: string,
    actor: AuthenticatedUser,
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

    this.assertActorCanManageReviewRecord(actor, reviewRecord.reviewerId);
    return reviewRecord;
  }

  private lockCabinReviewWriteState(
    tx: Prisma.TransactionClient,
    projectId: string,
    actor: AuthenticatedUser,
    reviewId?: string,
  ) {
    return this.lockReviewWriteState(tx, projectId, {
      ...(reviewId ? { reviewId } : {}),
      reviewType: ReviewType.CAB_REVIEW,
      getContext: () => this.getCabinReviewContext(tx, projectId),
      assertWritable: (context) => this.assertWritableCabinReviewStage(context),
      getReview: (id) =>
        this.getCabinReviewOrThrow(tx, projectId, id, actor),
    });
  }

  private lockConsistencyReviewWriteState(
    tx: Prisma.TransactionClient,
    projectId: string,
    actor: AuthenticatedUser,
    reviewId?: string,
  ) {
    return this.lockReviewWriteState(tx, projectId, {
      ...(reviewId ? { reviewId } : {}),
      reviewType: ReviewType.COLOR_CONSISTENCY_REVIEW,
      getContext: () => this.getConsistencyReviewContext(tx, projectId),
      assertWritable: (context) =>
        this.assertWritableConsistencyReviewStage(context),
      getReview: (id) =>
        this.getConsistencyReviewOrThrow(tx, projectId, id, actor),
    });
  }

  private async lockVisualDeltaReviewWriteState(
    tx: Prisma.TransactionClient,
    projectId: string,
    actor: AuthenticatedUser,
    reviewId?: string,
  ) {
    const state = await this.lockReviewWriteState(tx, projectId, {
      ...(reviewId ? { reviewId } : {}),
      reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
      getContext: () => this.getVisualDeltaReviewContext(tx, projectId),
      assertWritable: (context) =>
        this.assertWritableVisualDeltaReviewStage(context),
      getReview: (id) =>
        this.getVisualDeltaReviewOrThrow(tx, projectId, id, actor),
    });
    const recurringPlan = await this.resolveVisualDeltaRecurringPlan(
      tx,
      projectId,
      state.context.activeTask!.id,
    );
    await this.assertVisualDeltaPlanCapacity(
      tx,
      projectId,
      recurringPlan.id,
    );
    return { ...state, recurringPlanId: recurringPlan.id };
  }

  private async lockReviewWriteState<
    TContext extends { activeTask: { id: string } | null },
  >(
    tx: Prisma.TransactionClient,
    projectId: string,
    input: {
      reviewId?: string;
      reviewType: ReviewType;
      getContext: () => Promise<TContext>;
      assertWritable: (context: TContext) => void;
      getReview: (reviewId: string) => Promise<ReviewRecordWithDetails>;
    },
  ): Promise<{
    context: TContext;
    reviewRecord: ReviewRecordWithDetails | null;
  }> {
    if (input.reviewId) {
      if (!(await this.lockReviewRecordRow(tx, projectId, input.reviewId))) {
        this.throwReviewStateChanged();
      }
      let reviewRecord = await input.getReview(input.reviewId);

      if (
        !(await this.lockWorkflowTaskRow(
          tx,
          projectId,
          reviewRecord.workflowTaskId,
        ))
      ) {
        this.throwReviewStateChanged();
      }

      const context = await input.getContext();
      if (
        !context.activeTask ||
        context.activeTask.id !== reviewRecord.workflowTaskId
      ) {
        this.throwReviewStateChanged();
      }
      try {
        input.assertWritable(context);
      } catch {
        this.throwReviewStateChanged();
      }

      reviewRecord = await input.getReview(input.reviewId);
      if (reviewRecord.workflowTaskId !== context.activeTask.id) {
        this.throwReviewStateChanged();
      }
      await this.assertReviewExistingCapacity(
        tx,
        projectId,
        input.reviewType,
      );
      this.assertPersistedReviewSourceBound(reviewRecord);
      return { context, reviewRecord };
    }

    const candidateContext = await input.getContext();
    input.assertWritable(candidateContext);
    const candidateTask = candidateContext.activeTask;
    if (!candidateTask) {
      this.throwReviewStateChanged();
    }

    if (!(await this.lockWorkflowTaskRow(tx, projectId, candidateTask.id))) {
      this.throwReviewStateChanged();
    }

    const context = await input.getContext();
    if (!context.activeTask || context.activeTask.id !== candidateTask.id) {
      this.throwReviewStateChanged();
    }
    try {
      input.assertWritable(context);
    } catch {
      this.throwReviewStateChanged();
    }
    return { context, reviewRecord: null };
  }

  private async resolveVisualDeltaRecurringPlan(
    db: ReviewsDbClient,
    projectId: string,
    workflowTaskId: string,
  ) {
    const plans = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT recurring_plan."id"
      FROM "workflow_tasks" AS workflow_task
      INNER JOIN "recurring_plans" AS recurring_plan
        ON recurring_plan."sourceWorkflowTaskId" = workflow_task."id"
      WHERE workflow_task."id" = ${workflowTaskId}
        AND workflow_task."projectId" = ${projectId}
        AND recurring_plan."projectId" = ${projectId}
        AND recurring_plan."sourceNodeCode" = ${WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW}::"WorkflowNodeCode"
      ORDER BY recurring_plan."id" ASC
      LIMIT ${2}
    `);
    if (plans.length !== 1) {
      throw new ConflictException({
        code: 'VISUAL_DELTA_REVIEW_PLAN_IDENTITY_CONFLICT',
        message: plans.length === 0
          ? '当前目视色差评审任务缺少唯一的月度计划。'
          : '当前目视色差评审任务关联了多个月度计划。',
      });
    }
    return plans[0]!;
  }

  private async assertVisualDeltaPlanCapacity(
    db: ReviewsDbClient,
    projectId: string,
    recurringPlanId: string,
  ) {
    const tasks = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT recurring_task."id"
      FROM "recurring_tasks" AS recurring_task
      INNER JOIN "recurring_plans" AS recurring_plan
        ON recurring_plan."id" = recurring_task."recurringPlanId"
      WHERE recurring_task."projectId" = ${projectId}
        AND recurring_plan."projectId" = ${projectId}
        AND recurring_plan."id" = ${recurringPlanId}
        AND recurring_plan."sourceNodeCode" = ${WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW}::"WorkflowNodeCode"
      ORDER BY recurring_task."periodIndex" ASC, recurring_task."id" ASC
      LIMIT ${VISUAL_DELTA_REVIEW_PERIOD_LIMIT + 1}
    `);
    this.assertVisualDeltaReviewPeriodCapacity(tasks);
  }

  private async claimReviewRecordUpdate(
    tx: Prisma.TransactionClient,
    reviewRecord: ReviewRecordWithDetails,
    data: Prisma.ReviewRecordUncheckedUpdateManyInput,
  ) {
    const claimed = await tx.reviewRecord.updateMany({
      where: {
        id: reviewRecord.id,
        projectId: reviewRecord.projectId,
        reviewType: reviewRecord.reviewType,
        workflowTaskId: reviewRecord.workflowTaskId,
        reviewRound: reviewRecord.reviewRound,
        reviewPeriod: reviewRecord.reviewPeriod,
        reviewerId: reviewRecord.reviewerId,
        submittedAt: reviewRecord.submittedAt,
        updatedAt: reviewRecord.updatedAt,
      },
      data,
    });
    if (claimed.count !== 1) {
      this.throwReviewStateChanged();
    }

    const updatedReview = await tx.reviewRecord.findFirst({
      where: {
        id: reviewRecord.id,
        projectId: reviewRecord.projectId,
        reviewType: reviewRecord.reviewType,
      },
      include: CABIN_REVIEW_INCLUDE,
    });
    if (!updatedReview) {
      this.throwReviewStateChanged();
    }
    return updatedReview;
  }

  private async assertReviewWriteInputPersistable(
    db: ReviewsDbClient,
    input: CabinReviewWriteInput,
  ) {
    const reviewer = await db.user.findUnique({
      where: { id: input.reviewerId },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    if (!reviewer || reviewer.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('评审人不存在或不可用。');
    }

    this.assertPersistedReviewSourceBound({
      comment: input.comment,
      conditionNote: input.conditionNote,
      rejectReason: input.rejectReason,
      reviewer,
    });
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

  private async getVisualDeltaRecurringTaskForDate(
    db: ReviewsDbClient,
    projectId: string,
    recurringPlanId: string,
    reviewDate: Date,
  ) {
    const { periodStart, periodEnd } = getMonthlyReviewPeriodRange(reviewDate);
    const recurringTask = await db.recurringTask.findFirst({
      where: {
        projectId,
        recurringPlanId,
        plannedDate: {
          gte: periodStart,
          lt: periodEnd,
        },
      },
      orderBy: {
        periodIndex: 'asc',
      },
    });

    if (!recurringTask) {
      throw new BadRequestException('评审日期未命中任何月度评审周期。');
    }

    return recurringTask;
  }

  private async assertUniqueVisualReviewerPerPeriod(
    db: ReviewsDbClient,
    workflowTaskId: string,
    reviewerId: string,
    reviewDate: Date,
    excludeReviewId?: string,
  ) {
    const reviewPeriod = getMonthlyReviewPeriodKey(reviewDate);
    const duplicatedReview = await db.reviewRecord.findFirst({
      where: {
        workflowTaskId,
        reviewerId,
        reviewPeriod,
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
      throw new BadRequestException('当前月份下，该评审人已存在记录。');
    }
  }

  private createReviewAttachmentFinalizeHook(input: {
    projectId: string;
    reviewId: string;
    reviewType: ReviewType;
    workflowTaskId: string;
    reviewerId: string | null;
    expectedAttachmentId: string | null;
    nodeCode: WorkflowNodeCode;
    actor: AuthenticatedUser;
  }) {
    return async (
      tx: Prisma.TransactionClient,
      context: { attachmentId: string },
    ) => {
      if (!(await this.lockReviewRecordRow(tx, input.projectId, input.reviewId))) {
        this.throwAttachmentTargetStateChanged();
      }

      const lockedReview = await tx.reviewRecord.findFirst({
        where: {
          id: input.reviewId,
          projectId: input.projectId,
          reviewType: input.reviewType,
        },
        select: {
          id: true,
          workflowTaskId: true,
          reviewerId: true,
          attachmentId: true,
          submittedAt: true,
          comment: true,
          conditionNote: true,
          rejectReason: true,
          reviewer: {
            select: { name: true },
          },
        },
      });
      if (
        !lockedReview ||
        lockedReview.workflowTaskId !== input.workflowTaskId ||
        lockedReview.reviewerId !== input.reviewerId ||
        lockedReview.attachmentId !== input.expectedAttachmentId ||
        lockedReview.submittedAt !== null
      ) {
        this.throwAttachmentTargetStateChanged();
      }
      this.assertActorCanManageReviewRecord(input.actor, lockedReview.reviewerId);

      if (
        !(await this.lockWorkflowTaskRow(
          tx,
          input.projectId,
          input.workflowTaskId,
        ))
      ) {
        this.throwAttachmentTargetStateChanged();
      }
      const activeTask = await tx.workflowTask.findFirst({
        where: {
          id: input.workflowTaskId,
          projectId: input.projectId,
          nodeCode: input.nodeCode,
          isActive: true,
        },
        select: { id: true },
      });
      if (!activeTask) {
        this.throwAttachmentTargetStateChanged();
      }

      if (input.expectedAttachmentId) {
        if (
          !(await this.lockAttachmentRow(
            tx,
            input.projectId,
            input.expectedAttachmentId,
          ))
        ) {
          this.throwAttachmentTargetStateChanged();
        }
        const replacement = await tx.attachment.findFirst({
          where: {
            id: input.expectedAttachmentId,
            projectId: input.projectId,
            entityType: AttachmentTargetType.REVIEW_RECORD,
            entityId: input.reviewId,
            isDeleted: false,
            scanStatus: AttachmentScanStatus.CLEAN,
          },
          select: { id: true },
        });
        if (!replacement) {
          this.throwAttachmentTargetStateChanged();
        }
      }

      await this.assertReviewExistingCapacity(
        tx,
        input.projectId,
        input.reviewType,
      );
      this.assertPersistedReviewSourceBound(lockedReview);
      if (input.reviewType === ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW) {
        const recurringPlan = await this.resolveVisualDeltaRecurringPlan(
          tx,
          input.projectId,
          input.workflowTaskId,
        );
        await this.assertVisualDeltaPlanCapacity(
          tx,
          input.projectId,
          recurringPlan.id,
        );
      }

      const updated = await tx.reviewRecord.updateMany({
        where: {
          id: input.reviewId,
          projectId: input.projectId,
          reviewType: input.reviewType,
          workflowTaskId: input.workflowTaskId,
          reviewerId: input.reviewerId,
          submittedAt: null,
          attachmentId: input.expectedAttachmentId,
        },
        data: { attachmentId: context.attachmentId },
      });
      if (updated.count !== 1) {
        this.throwAttachmentTargetStateChanged();
      }
    };
  }

  private async lockReviewRecordRow(
    tx: Prisma.TransactionClient,
    projectId: string,
    reviewId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "review_records"
      WHERE "id" = ${reviewId} AND "projectId" = ${projectId}
      FOR UPDATE
    `);
    return rows.length === 1;
  }

  private async lockWorkflowTaskRow(
    tx: Prisma.TransactionClient,
    projectId: string,
    taskId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "workflow_tasks"
      WHERE "id" = ${taskId} AND "projectId" = ${projectId}
      FOR UPDATE
    `);
    return rows.length === 1;
  }

  private async lockAttachmentRow(
    tx: Prisma.TransactionClient,
    projectId: string,
    attachmentId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "attachments"
      WHERE "id" = ${attachmentId} AND "projectId" = ${projectId}
      FOR UPDATE
    `);
    return rows.length === 1;
  }

  private throwAttachmentTargetStateChanged(): never {
    throw new ConflictException({
      code: 'ATTACHMENT_TARGET_STATE_CHANGED',
      message: '附件扫描期间评审或流程状态已变更，请刷新后重试。',
    });
  }

  private throwReviewStateChanged(): never {
    throw new ConflictException({
      code: 'REVIEW_STATE_CHANGED',
      message: '评审记录或流程状态已变更，请刷新后重试。',
    });
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

  private assertDraftReviewRecordForLockedWrite(
    reviewRecord: ReviewRecordWithDetails,
  ) {
    if (reviewRecord.submittedAt) {
      this.throwReviewStateChanged();
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
    if (
      reviewerId.length > REVIEWER_ID_MAX_CHARS ||
      !REVIEWER_ID_PATTERN.test(reviewerId)
    ) {
      this.throwReviewInputOutOfBounds(
        `评审人 ID 必须为不超过 ${REVIEWER_ID_MAX_CHARS} 个字符的字母、数字、下划线或连字符。`,
      );
    }

    if (!reviewConclusion) {
      throw new BadRequestException('评审结论不能为空。');
    }

    if (!comment) {
      throw new BadRequestException('评审意见不能为空。');
    }
    this.assertReviewTextBound(
      comment,
      '评审意见',
      REVIEW_COMMENT_MAX_CHARS,
    );
    if (conditionNote) {
      this.assertReviewTextBound(
        conditionNote,
        '条件通过说明',
        REVIEW_CONDITION_NOTE_MAX_CHARS,
      );
    }
    if (rejectReason) {
      this.assertReviewTextBound(
        rejectReason,
        '驳回原因',
        REVIEW_REJECT_REASON_MAX_CHARS,
      );
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

    const normalized = {
      reviewerId,
      reviewConclusion,
      comment,
      conditionNote,
      rejectReason,
      reviewDate: this.parseDate(input.reviewDate, '评审日期'),
    };
    if (
      Buffer.byteLength(JSON.stringify(normalized), 'utf8') >
      REVIEW_MAX_PAYLOAD_BYTES
    ) {
      this.throwReviewInputOutOfBounds(
        `评审数据不得超过 ${REVIEW_MAX_PAYLOAD_BYTES} 字节。`,
      );
    }

    return normalized;
  }

  private assertReviewTextBound(
    value: string,
    label: string,
    maxChars: number,
  ) {
    if (value.length > maxChars) {
      this.throwReviewInputOutOfBounds(`${label}不得超过 ${maxChars} 个字符。`);
    }
  }

  private throwReviewInputOutOfBounds(message: string): never {
    throw new BadRequestException({
      code: 'REVIEW_INPUT_OUT_OF_BOUNDS',
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

  private toCabinReviewSummary(
    reviewRecord: Prisma.ReviewRecordGetPayload<{
      include: typeof CABIN_REVIEW_INCLUDE;
    }>,
    attachmentHistory: ReviewAttachmentHistory = {
      items: [],
      hasMore: false,
    },
  ) {
    return {
      id: reviewRecord.id,
      workflowTaskId: reviewRecord.workflowTaskId,
      reviewType: reviewRecord.reviewType,
      reviewPeriod: reviewRecord.reviewPeriod,
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
      attachment:
        reviewRecord.attachment &&
        !reviewRecord.attachment.isDeleted &&
        reviewRecord.attachment.scanStatus === AttachmentScanStatus.CLEAN
        ? this.attachmentsService.toAttachmentSummary(reviewRecord.attachment)
        : null,
      attachmentHistory: attachmentHistory.items.map((attachment) =>
        this.attachmentsService.toAttachmentSummary({
          ...attachment,
          uploadedBy: attachment.uploadedByName
            ? { name: attachment.uploadedByName }
            : null,
          deletedBy: attachment.deletedByName
            ? { name: attachment.deletedByName }
            : null,
        }),
      ),
      attachmentHistoryHasMore: attachmentHistory.hasMore,
    };
  }

  private toCabinReviewAuditSnapshot(
    reviewRecord: Prisma.ReviewRecordGetPayload<{
      include: typeof CABIN_REVIEW_INCLUDE;
    }>,
  ) {
    this.assertPersistedReviewSourceBound(reviewRecord);

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

  private assertPersistedReviewSourceBound(source: {
    comment?: string | null;
    conditionNote?: string | null;
    rejectReason?: string | null;
    reviewer?: { name: string } | null;
  }) {
    this.assertPersistedReviewTextBound(
      source.comment,
      '评审意见',
      REVIEW_COMMENT_MAX_CHARS,
    );
    this.assertPersistedReviewTextBound(
      source.conditionNote,
      '条件通过说明',
      REVIEW_CONDITION_NOTE_MAX_CHARS,
    );
    this.assertPersistedReviewTextBound(
      source.rejectReason,
      '驳回原因',
      REVIEW_REJECT_REASON_MAX_CHARS,
    );
    this.assertPersistedReviewTextBound(
      source.reviewer?.name,
      '评审人姓名',
      REVIEWER_NAME_MAX_CHARS,
    );
  }

  private assertPersistedReviewTextBound(
    value: string | null | undefined,
    label: string,
    maxChars: number,
  ) {
    if (value && value.length > maxChars) {
      throw new ConflictException({
        code: 'REVIEW_PERSISTED_SOURCE_OUT_OF_BOUNDS',
        message: `历史${label}超过 ${maxChars} 个字符，不能继续写入评审状态。`,
      });
    }
  }
}
