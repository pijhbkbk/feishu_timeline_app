export const COLOR_EXIT_MANAGEMENT_ROLE_CODES = [
  'admin',
  'project_manager',
  'process_engineer',
] as const;

export function getColorExitStageIssue(input: {
  visualDeltaApproved: boolean;
  hasActiveTask: boolean;
}) {
  if (!input.visualDeltaApproved) {
    return '目视色差评审尚未通过，不能进入颜色退出。';
  }

  if (!input.hasActiveTask) {
    return '当前没有活跃的颜色退出任务。';
  }

  return null;
}

export function getColorExitCompletionIssue(input: {
  exitDate: Date | null;
  exitReason: string | null;
  operatorId: string | null;
}) {
  if (!input.exitDate) {
    return '退出日期不能为空。';
  }

  if (!input.exitReason?.trim()) {
    return '退出原因不能为空。';
  }

  if (!input.operatorId) {
    return '操作人不能为空。';
  }

  return null;
}
