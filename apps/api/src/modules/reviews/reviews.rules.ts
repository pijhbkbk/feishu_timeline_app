import {
  ReviewResult,
  WorkflowNodeCode,
} from '@prisma/client';

export const CABIN_REVIEW_MANAGEMENT_ROLE_CODES = [
  'admin',
  'project_manager',
  'quality_engineer',
  'reviewer',
] as const;

export function getCabinReviewStageIssue(input: {
  trialProductionCompleted: boolean;
  hasActiveTask: boolean;
}) {
  if (!input.trialProductionCompleted) {
    return '样车试制尚未完成，不能进入驾驶室评审。';
  }

  if (!input.hasActiveTask) {
    return '当前没有活跃的驾驶室评审任务。';
  }

  return null;
}

export function getCabinReviewSubmitIssue(input: {
  reviewDate: Date | null;
  reviewerId: string | null;
  reviewConclusion: ReviewResult | null;
  comment: string | null;
  conditionNote: string | null;
  rejectReason: string | null;
}) {
  if (!input.reviewDate) {
    return '评审日期不能为空。';
  }

  if (!input.reviewerId) {
    return '评审人不能为空。';
  }

  if (!input.reviewConclusion || input.reviewConclusion === ReviewResult.PENDING) {
    return '评审结论不能为空。';
  }

  if (!input.comment?.trim()) {
    return '评审意见不能为空。';
  }

  if (
    input.reviewConclusion === ReviewResult.CONDITIONAL_APPROVED &&
    !input.conditionNote?.trim()
  ) {
    return '条件通过时必须填写说明。';
  }

  if (
    input.reviewConclusion === ReviewResult.REJECTED &&
    !input.rejectReason?.trim()
  ) {
    return '驳回时必须填写原因。';
  }

  return null;
}

export function getCabinReviewApproveIssue(input: {
  reviewConclusion: ReviewResult;
  submittedAt: Date | null;
  conditionNote: string | null;
}) {
  if (!input.submittedAt) {
    return '请先提交评审记录。';
  }

  if (
    input.reviewConclusion !== ReviewResult.APPROVED &&
    input.reviewConclusion !== ReviewResult.CONDITIONAL_APPROVED
  ) {
    return '当前评审结论不允许执行通过操作。';
  }

  if (
    input.reviewConclusion === ReviewResult.CONDITIONAL_APPROVED &&
    !input.conditionNote?.trim()
  ) {
    return '条件通过时必须保留说明。';
  }

  return null;
}

export function getCabinReviewRejectIssue(input: {
  reviewConclusion: ReviewResult;
  submittedAt: Date | null;
  rejectReason: string | null;
}) {
  if (!input.submittedAt) {
    return '请先提交评审记录。';
  }

  if (input.reviewConclusion !== ReviewResult.REJECTED) {
    return '当前评审结论不允许执行驳回操作。';
  }

  if (!input.rejectReason?.trim()) {
    return '驳回时必须填写原因。';
  }

  return null;
}

export function getCabinReviewReturnNodeCode() {
  return WorkflowNodeCode.TRIAL_PRODUCTION;
}

export function getConsistencyReviewStageIssue(input: {
  cabinReviewCompleted: boolean;
  hasActiveTask: boolean;
}) {
  if (!input.cabinReviewCompleted) {
    return '样车驾驶室评审尚未通过，不能进入颜色一致性评审。';
  }

  if (!input.hasActiveTask) {
    return '当前没有活跃的颜色一致性评审任务。';
  }

  return null;
}

export function getConsistencyReviewReturnNodeCode() {
  return WorkflowNodeCode.PAINT_DEVELOPMENT;
}

export function getVisualDeltaReviewStageIssue(input: {
  massProductionCompleted: boolean;
  hasActiveTask: boolean;
}) {
  if (!input.massProductionCompleted) {
    return '批量生产尚未完成，不能进入目视色差评审。';
  }

  if (!input.hasActiveTask) {
    return '当前没有活跃的目视色差评审任务。';
  }

  return null;
}

export function getVisualDeltaReviewReturnNodeCode() {
  return WorkflowNodeCode.MASS_PRODUCTION;
}
