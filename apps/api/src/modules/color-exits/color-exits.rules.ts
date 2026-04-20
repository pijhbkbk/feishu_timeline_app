import type { ColorExitSuggestion } from '@prisma/client';

export const COLOR_EXIT_MANAGEMENT_ROLE_CODES = [
  'admin',
  'project_manager',
  'process_engineer',
] as const;

export type ColorExitDecision = ColorExitSuggestion;

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
  statisticYear?: number | null;
  annualOutput?: number | null;
  finalDecision?: ColorExitDecision | null;
  effectiveDate?: Date | null;
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

  if (!input.statisticYear) {
    return '统计年度不能为空。';
  }

  if (input.annualOutput == null) {
    return '年产量不能为空。';
  }

  if (!input.finalDecision) {
    return '人工结论不能为空。';
  }

  if (!input.effectiveDate) {
    return '生效日期不能为空。';
  }

  return null;
}

export function getColorExitSystemSuggestion(input: {
  annualOutput: number | null;
  threshold: number;
}): ColorExitDecision | null {
  if (input.annualOutput == null) {
    return null;
  }

  return input.annualOutput <= input.threshold
    ? 'EXIT'
    : 'RETAIN';
}
