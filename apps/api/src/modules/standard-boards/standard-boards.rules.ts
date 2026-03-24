import {
  ColorBoardDetailUpdateStatus,
  StandardBoardStatus,
  WorkflowAction,
  WorkflowNodeCode,
} from '@prisma/client';

export type StandardBoardLifecycleAction = 'MARK_CREATED' | 'ISSUE';

export function getStandardBoardStageIssue(input: {
  procurementCompleted: boolean;
  hasActiveTask: boolean;
}) {
  if (!input.procurementCompleted) {
    return '采购节点尚未完成，不能进入标准板制作、下发。';
  }

  if (!input.hasActiveTask) {
    return '当前没有活跃的标准板制作、下发任务。';
  }

  return null;
}

export function getBoardDetailUpdateStageIssue(input: {
  hasActiveTask: boolean;
}) {
  if (!input.hasActiveTask) {
    return '当前没有活跃的色板明细更新任务。';
  }

  return null;
}

export function getStandardBoardStatusTransitionTarget(
  currentStatus: StandardBoardStatus,
  action: StandardBoardLifecycleAction,
) {
  switch (action) {
    case 'MARK_CREATED':
      return currentStatus === StandardBoardStatus.DRAFT
        ? StandardBoardStatus.CREATED
        : null;
    case 'ISSUE':
      return currentStatus === StandardBoardStatus.CREATED
        ? StandardBoardStatus.ISSUED
        : null;
    default:
      return null;
  }
}

export function getStandardBoardCompletionIssue(
  boards: Array<{
    status: StandardBoardStatus;
  }>,
) {
  if (boards.length === 0) {
    return '至少需要一条标准板记录后才能完成标准板节点。';
  }

  if (!boards.some((board) => board.status === StandardBoardStatus.ISSUED)) {
    return '没有已下发的标准板时不能完成标准板节点。';
  }

  return null;
}

export function getBoardDetailUpdateCompletionIssue(
  updates: Array<{
    updateStatus: ColorBoardDetailUpdateStatus;
  }>,
) {
  if (updates.length === 0) {
    return '没有明细更新记录时不能完成色板明细更新节点。';
  }

  if (
    !updates.some(
      (updateRecord) =>
        updateRecord.updateStatus === ColorBoardDetailUpdateStatus.UPDATED,
    )
  ) {
    return '至少需要一条已更新的明细记录后才能完成色板明细更新节点。';
  }

  return null;
}

export function canEditStandardBoard(status: StandardBoardStatus) {
  return status === StandardBoardStatus.DRAFT || status === StandardBoardStatus.CREATED;
}

export function shouldSpawnBoardDetailUpdate(
  nodeCode: WorkflowNodeCode,
  action: WorkflowAction,
) {
  return (
    nodeCode === WorkflowNodeCode.STANDARD_BOARD_PRODUCTION &&
    (action === WorkflowAction.SUBMIT || action === WorkflowAction.COMPLETE)
  );
}
