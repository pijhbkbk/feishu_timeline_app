'use client';

export const PROJECT_STATUS_LABELS = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  ON_HOLD: '挂起',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
} as const;

export const PROJECT_PRIORITY_LABELS = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  CRITICAL: '紧急',
} as const;

export const PROJECT_MEMBER_TYPE_LABELS = {
  OWNER: '负责人',
  MANAGER: '项目经理',
  MEMBER: '成员',
  REVIEWER: '评审人',
  OBSERVER: '观察者',
} as const;

export const WORKFLOW_TASK_STATUS_LABELS = {
  PENDING: '待处理',
  READY: '待开始',
  IN_PROGRESS: '进行中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  RETURNED: '已退回',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
} as const;

export const WORKFLOW_ACTION_LABELS = {
  START: '开始',
  SUBMIT: '提交',
  APPROVE: '通过',
  REJECT: '驳回',
  RETURN: '退回',
  COMPLETE: '完成',
} as const;

export const RECURRING_TASK_STATUS_LABELS = {
  PENDING: '未开始',
  IN_PROGRESS: '待评审',
  COMPLETED: '已完成',
  OVERDUE: '已逾期',
  CANCELLED: '已取消',
} as const;

export const RECURRING_PLAN_STATUS_LABELS = {
  DRAFT: '草稿',
  ACTIVE: '进行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
} as const;

export const REVIEW_RESULT_LABELS = {
  PENDING: '待评审',
  APPROVED: '通过',
  CONDITIONAL_APPROVED: '条件通过',
  REJECTED: '驳回',
  NEED_REWORK: '待整改',
} as const;

export const TIMELINE_NODE_STATUS_LABELS = {
  NOT_STARTED: '未开始',
  PENDING: '待处理',
  IN_PROGRESS: '进行中',
  CURRENT: '当前节点',
  COMPLETED: '已完成',
  OVERDUE: '已逾期',
  RETURNED: '已退回',
} as const;

export const COLOR_EXIT_SUGGESTION_LABELS = {
  EXIT: '建议退出',
  RETAIN: '建议保留',
  OBSERVE: '延期观察',
} as const;

export type TimelineNodeStatus = keyof typeof TIMELINE_NODE_STATUS_LABELS;

export function getTimelineNodeStatusLabel(status: TimelineNodeStatus | string | null) {
  if (!status) {
    return '未开始';
  }

  return TIMELINE_NODE_STATUS_LABELS[status as TimelineNodeStatus] ?? status;
}

export function getTimelineNodeTone(status: TimelineNodeStatus | string | null) {
  switch (status) {
    case 'CURRENT':
    case 'IN_PROGRESS':
      return 'current';
    case 'COMPLETED':
      return 'done';
    case 'OVERDUE':
      return 'overdue';
    case 'RETURNED':
      return 'returned';
    case 'PENDING':
      return 'pending';
    case 'NOT_STARTED':
    default:
      return 'not-started';
  }
}
