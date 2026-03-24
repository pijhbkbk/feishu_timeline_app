import {
  ProductionPlanStatus,
  WorkflowNodeCode,
} from '@prisma/client';

export const MASS_PRODUCTION_MANAGEMENT_ROLE_CODES = [
  'admin',
  'project_manager',
  'process_engineer',
] as const;

export function getMassProductionStageIssue(input: {
  schedulePlanCompleted: boolean;
  hasActiveTask: boolean;
}) {
  if (!input.schedulePlanCompleted) {
    return '排产计划尚未完成，不能进入批量生产。';
  }

  if (!input.hasActiveTask) {
    return '当前没有活跃的批量生产任务。';
  }

  return null;
}

export function getMassProductionCompletionIssue(
  items: Array<{
    status: ProductionPlanStatus;
  }>,
) {
  if (items.length === 0) {
    return '至少需要一条有效批量生产记录后才能完成批量生产节点。';
  }

  if (!items.some((item) => item.status === ProductionPlanStatus.COMPLETED)) {
    return '没有已完成的批量生产记录，不能完成批量生产节点。';
  }

  return null;
}

export function canEditMassProductionRecord(status: ProductionPlanStatus) {
  return (
    status === ProductionPlanStatus.DRAFT ||
    status === ProductionPlanStatus.IN_PROGRESS
  );
}

export function canStartMassProductionRecord(status: ProductionPlanStatus) {
  return status === ProductionPlanStatus.DRAFT;
}

export function canCompleteMassProductionRecord(status: ProductionPlanStatus) {
  return status === ProductionPlanStatus.IN_PROGRESS;
}

export function canCancelMassProductionRecord(status: ProductionPlanStatus) {
  return (
    status === ProductionPlanStatus.DRAFT ||
    status === ProductionPlanStatus.IN_PROGRESS
  );
}

export function getMassProductionNodeCode() {
  return WorkflowNodeCode.MASS_PRODUCTION;
}
