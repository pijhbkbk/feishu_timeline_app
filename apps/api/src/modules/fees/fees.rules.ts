import {
  DevelopmentFeeStatus,
  WorkflowNodeCode,
} from '@prisma/client';

export const FEE_MANAGEMENT_ROLE_CODES = [
  'admin',
  'project_manager',
  'finance',
] as const;

export type FeeLifecycleAction = 'MARK_RECORDED' | 'MARK_PAID' | 'CANCEL';

export function getDevelopmentFeeStageIssue(input: {
  cabinReviewApproved: boolean;
  hasActiveTask: boolean;
}) {
  if (!input.cabinReviewApproved) {
    return '样车驾驶室评审尚未通过，不能进入颜色开发收费。';
  }

  if (!input.hasActiveTask) {
    return '当前没有活跃的颜色开发收费任务。';
  }

  return null;
}

export function getDevelopmentFeeStatusTransitionTarget(
  currentStatus: DevelopmentFeeStatus,
  action: FeeLifecycleAction,
) {
  switch (action) {
    case 'MARK_RECORDED':
      return currentStatus === DevelopmentFeeStatus.PENDING
        ? DevelopmentFeeStatus.RECORDED
        : null;
    case 'MARK_PAID':
      return currentStatus === DevelopmentFeeStatus.PENDING ||
        currentStatus === DevelopmentFeeStatus.RECORDED
        ? DevelopmentFeeStatus.PAID
        : null;
    case 'CANCEL':
      return currentStatus === DevelopmentFeeStatus.PENDING ||
        currentStatus === DevelopmentFeeStatus.RECORDED
        ? DevelopmentFeeStatus.CANCELLED
        : null;
    default:
      return null;
  }
}

export function getDevelopmentFeeCompletionIssue(
  items: Array<{
    payStatus: DevelopmentFeeStatus;
  }>,
) {
  const effectiveItems = items.filter(
    (item) => item.payStatus !== DevelopmentFeeStatus.CANCELLED,
  );

  if (effectiveItems.length === 0) {
    return '至少需要一条有效收费记录后才能完成收费节点。';
  }

  if (!effectiveItems.some((item) => item.payStatus === DevelopmentFeeStatus.PAID)) {
    return '没有已支付的收费记录，不能完成收费节点。';
  }

  return null;
}

export function getDevelopmentFeeAmountIssue(amount: number, fixedAmount: number) {
  if (amount !== fixedAmount) {
    return `颜色开发收费固定金额为 ${fixedAmount}。`;
  }

  return null;
}

export function canEditDevelopmentFee(status: DevelopmentFeeStatus) {
  return status === DevelopmentFeeStatus.PENDING || status === DevelopmentFeeStatus.RECORDED;
}

export function getDevelopmentFeeNodeCode() {
  return WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE;
}
