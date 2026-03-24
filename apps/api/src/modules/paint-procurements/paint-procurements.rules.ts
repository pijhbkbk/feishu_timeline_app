import {
  ProcurementStatus,
  WorkflowNodeCode,
} from '@prisma/client';

export const PROCUREMENT_MANAGEMENT_ROLE_CODES = [
  'admin',
  'project_manager',
  'purchaser',
] as const;

export type ProcurementLifecycleAction = 'ORDER' | 'MARK_ARRIVED' | 'CANCEL';

export function getProcurementStatusTransitionTarget(
  currentStatus: ProcurementStatus,
  action: ProcurementLifecycleAction,
) {
  switch (action) {
    case 'ORDER':
      return currentStatus === ProcurementStatus.DRAFT ? ProcurementStatus.ORDERED : null;
    case 'MARK_ARRIVED':
      return currentStatus === ProcurementStatus.ORDERED ? ProcurementStatus.ARRIVED : null;
    case 'CANCEL':
      return currentStatus === ProcurementStatus.DRAFT ||
        currentStatus === ProcurementStatus.ORDERED
        ? ProcurementStatus.CANCELLED
        : null;
    default:
      return null;
  }
}

export function getPaintProcurementStageIssue(input: {
  currentNodeCode: WorkflowNodeCode | null;
  hasActiveTask: boolean;
}) {
  if (!input.hasActiveTask) {
    return '当前没有活跃的涂料采购任务，样板颜色确认通过后才能进入采购。';
  }

  if (input.currentNodeCode !== WorkflowNodeCode.PAINT_PROCUREMENT) {
    return '当前流程尚未进入涂料采购阶段。';
  }

  return null;
}

export function getPaintProcurementCompletionIssue(
  items: Array<{
    status: ProcurementStatus;
  }>,
) {
  const effectiveItems = items.filter((item) => item.status !== ProcurementStatus.CANCELLED);

  if (effectiveItems.length === 0) {
    return '至少需要一条有效采购记录后才能完成采购节点。';
  }

  if (!effectiveItems.some((item) => item.status === ProcurementStatus.ARRIVED)) {
    return '没有已到货的采购记录，不能完成采购节点。';
  }

  return null;
}

export function canEditPaintProcurement(status: ProcurementStatus) {
  return status === ProcurementStatus.DRAFT || status === ProcurementStatus.ORDERED;
}
