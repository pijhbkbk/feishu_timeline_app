import {
  ProductionPlanStatus,
  WorkflowNodeCode,
} from '@prisma/client';

export const SCHEDULE_PLAN_MANAGEMENT_ROLE_CODES = [
  'admin',
  'project_manager',
  'process_engineer',
] as const;

export function getSchedulePlanStageIssue(input: {
  consistencyReviewApproved: boolean;
  hasActiveTask: boolean;
}) {
  if (!input.consistencyReviewApproved) {
    return '颜色一致性评审尚未通过，不能进入排产计划。';
  }

  if (!input.hasActiveTask) {
    return '当前没有活跃的排产计划任务。';
  }

  return null;
}

export function getSchedulePlanCompletionIssue(
  items: Array<{
    status: ProductionPlanStatus;
  }>,
) {
  if (items.length === 0) {
    return '至少需要一条有效排产计划后才能完成排产节点。';
  }

  if (!items.some((item) => item.status === ProductionPlanStatus.CONFIRMED)) {
    return '没有已确认的排产计划，不能完成排产节点。';
  }

  return null;
}

export function canEditSchedulePlan(status: ProductionPlanStatus) {
  return status === ProductionPlanStatus.DRAFT;
}

export function canConfirmSchedulePlan(status: ProductionPlanStatus) {
  return status === ProductionPlanStatus.DRAFT;
}

export function canCancelSchedulePlan(status: ProductionPlanStatus) {
  return (
    status === ProductionPlanStatus.DRAFT ||
    status === ProductionPlanStatus.CONFIRMED
  );
}

export function getSchedulePlanNodeCode() {
  return WorkflowNodeCode.MASS_PRODUCTION_PLAN;
}
