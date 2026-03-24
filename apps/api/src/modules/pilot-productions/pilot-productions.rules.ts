import {
  ProductionPlanStatus,
  TrialProductionResult,
  TrialProductionStatus,
  WorkflowAction,
  WorkflowNodeCode,
} from '@prisma/client';

export const PILOT_PRODUCTION_MANAGEMENT_ROLE_CODES = [
  'admin',
  'project_manager',
  'process_engineer',
] as const;

export const PILOT_PRODUCTION_VIEW_ROLE_CODES = [
  ...PILOT_PRODUCTION_MANAGEMENT_ROLE_CODES,
  'quality_engineer',
] as const;

export function getFirstProductionPlanStageIssue(input: {
  procurementCompleted: boolean;
  hasActiveTask: boolean;
}) {
  if (!input.procurementCompleted) {
    return '采购节点尚未完成，不能进入首台生产计划。';
  }

  if (!input.hasActiveTask) {
    return '当前没有活跃的首台生产计划任务。';
  }

  return null;
}

export function getFirstProductionPlanCompletionIssue(
  items: Array<{
    status: ProductionPlanStatus;
  }>,
) {
  if (items.length === 0) {
    return '至少需要一条首台生产计划后才能完成节点。';
  }

  if (
    !items.some(
      (item) =>
        item.status === ProductionPlanStatus.PLANNED ||
        item.status === ProductionPlanStatus.IN_PROGRESS ||
        item.status === ProductionPlanStatus.COMPLETED,
    )
  ) {
    return '首台计划未确认时不能完成首台节点。';
  }

  return null;
}

export function canEditFirstProductionPlan(status: ProductionPlanStatus) {
  return status === ProductionPlanStatus.DRAFT;
}

export function canConfirmFirstProductionPlan(status: ProductionPlanStatus) {
  return status === ProductionPlanStatus.DRAFT;
}

export function getTrialProductionStageIssue(input: {
  firstPlanTaskCompleted: boolean;
  hasActiveTask: boolean;
}) {
  if (!input.firstPlanTaskCompleted) {
    return '首台生产计划尚未完成，不能进入样车试制。';
  }

  if (!input.hasActiveTask) {
    return '当前没有活跃的样车试制任务。';
  }

  return null;
}

export function getTrialProductionCompletionIssue(
  items: Array<{
    status: TrialProductionStatus;
    result: TrialProductionResult | null;
  }>,
) {
  if (items.length === 0) {
    return '至少需要一条有效试制记录后才能完成试制节点。';
  }

  const effectiveItems = items.filter(
    (item) =>
      (item.status === TrialProductionStatus.PASSED ||
        item.status === TrialProductionStatus.FAILED) &&
      item.result !== null,
  );

  if (effectiveItems.length === 0) {
    return '没有有效试制记录时不能完成试制节点。';
  }

  return null;
}

export function getTrialRecordCompletionIssue(input: {
  vehicleNo: string;
  workshop: string | null;
  trialDate: Date | null;
  paintBatchNo: string | null;
  result: TrialProductionResult | null;
  issueSummary: string | null;
}) {
  if (!input.vehicleNo.trim()) {
    return '样车编号不能为空。';
  }

  if (!input.workshop?.trim()) {
    return '车间不能为空。';
  }

  if (!input.trialDate) {
    return '试制日期不能为空。';
  }

  if (!input.paintBatchNo?.trim()) {
    return '涂料批次不能为空。';
  }

  if (!input.result) {
    return '试制结果不能为空。';
  }

  if (!input.issueSummary?.trim()) {
    return '问题摘要不能为空。';
  }

  return null;
}

export function canEditTrialProduction(status: TrialProductionStatus) {
  return (
    status === TrialProductionStatus.PLANNED ||
    status === TrialProductionStatus.IN_PROGRESS
  );
}

export function getTrialProductionStatusAfterComplete(
  result: TrialProductionResult,
) {
  return result === TrialProductionResult.FAIL
    ? TrialProductionStatus.FAILED
    : TrialProductionStatus.PASSED;
}

export function getPilotProductionDownstreamTemplates(
  nodeCode: WorkflowNodeCode,
  action: WorkflowAction,
) {
  if (
    nodeCode === WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN &&
    (action === WorkflowAction.SUBMIT || action === WorkflowAction.COMPLETE)
  ) {
    return [WorkflowNodeCode.TRIAL_PRODUCTION];
  }

  if (
    nodeCode === WorkflowNodeCode.TRIAL_PRODUCTION &&
    (action === WorkflowAction.SUBMIT || action === WorkflowAction.COMPLETE)
  ) {
    return [WorkflowNodeCode.CAB_REVIEW];
  }

  return [];
}
