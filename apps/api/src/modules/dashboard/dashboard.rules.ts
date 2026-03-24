import {
  ProjectPriority,
  ProjectStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';

import { ACTIVE_WORKFLOW_TASK_STATUSES } from '../workflows/workflow-node.constants';

export const DASHBOARD_REVIEW_NODE_CODES: WorkflowNodeCode[] = [
  WorkflowNodeCode.CAB_REVIEW,
  WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
  WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
];

export function isTaskOverdue(
  input: {
    dueAt: Date | null;
    status: WorkflowTaskStatus;
    isActive: boolean;
  },
  now = new Date(),
) {
  if (!input.isActive || !input.dueAt) {
    return false;
  }

  if (!ACTIVE_WORKFLOW_TASK_STATUSES.includes(input.status)) {
    return false;
  }

  return input.dueAt.getTime() < now.getTime();
}

export function getOverdueDays(dueAt: Date | null, now = new Date()) {
  if (!dueAt || dueAt.getTime() >= now.getTime()) {
    return 0;
  }

  const diff = now.getTime() - dueAt.getTime();
  return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

export function computeProjectRiskLevel(
  input: {
    status: ProjectStatus;
    priority: ProjectPriority;
    plannedEndDate: Date | null;
    maxOverdueDays?: number;
    returnCount?: number;
  },
  now = new Date(),
) {
  const maxOverdueDays = input.maxOverdueDays ?? 0;
  const returnCount = input.returnCount ?? 0;

  if (
    input.status === ProjectStatus.COMPLETED ||
    input.status === ProjectStatus.CANCELLED
  ) {
    return ProjectPriority.LOW;
  }

  if (maxOverdueDays >= 7 || returnCount >= 2) {
    return ProjectPriority.CRITICAL;
  }

  if (maxOverdueDays > 0 || input.status === ProjectStatus.ON_HOLD) {
    return ProjectPriority.HIGH;
  }

  if (!input.plannedEndDate) {
    return input.priority === ProjectPriority.CRITICAL
      ? ProjectPriority.HIGH
      : input.priority;
  }

  const diffInDays = Math.ceil(
    (input.plannedEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffInDays < 0) {
    return ProjectPriority.CRITICAL;
  }

  if (diffInDays <= 7) {
    return ProjectPriority.HIGH;
  }

  if (diffInDays <= 14) {
    return ProjectPriority.MEDIUM;
  }

  return input.priority === ProjectPriority.CRITICAL
    ? ProjectPriority.HIGH
    : input.priority;
}

