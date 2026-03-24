import { WorkflowNodeCode, WorkflowTaskStatus } from '@prisma/client';

import { ACTIVE_WORKFLOW_TASK_STATUSES } from '../workflows/workflow-node.constants';

export type TaskListMode = 'my' | 'pending' | 'overdue';

export function normalizePage(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function normalizePageSize(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

export function isWorkflowTaskOverdue(
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

export function matchesTaskMode(
  mode: TaskListMode,
  input: {
    dueAt: Date | null;
    status: WorkflowTaskStatus;
    isActive: boolean;
  },
  now = new Date(),
) {
  const overdue = isWorkflowTaskOverdue(input, now);

  if (mode === 'overdue') {
    return overdue;
  }

  if (mode === 'pending') {
    return ACTIVE_WORKFLOW_TASK_STATUSES.includes(input.status) && !overdue;
  }

  return ACTIVE_WORKFLOW_TASK_STATUSES.includes(input.status);
}

export function getTaskRouteSegment(nodeCode: WorkflowNodeCode) {
  switch (nodeCode) {
    case WorkflowNodeCode.DEVELOPMENT_REPORT:
      return 'development-report';
    case WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION:
      return 'samples';
    case WorkflowNodeCode.PAINT_PROCUREMENT:
      return 'paint-procurement';
    case WorkflowNodeCode.PERFORMANCE_TEST:
      return 'performance-tests';
    case WorkflowNodeCode.STANDARD_BOARD_PRODUCTION:
    case WorkflowNodeCode.BOARD_DETAIL_UPDATE:
      return 'standard-boards';
    case WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN:
    case WorkflowNodeCode.TRIAL_PRODUCTION:
      return 'pilot-production';
    case WorkflowNodeCode.CAB_REVIEW:
    case WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW:
      return 'reviews';
    case WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE:
      return 'fees';
    case WorkflowNodeCode.MASS_PRODUCTION_PLAN:
      return 'production-plans';
    case WorkflowNodeCode.MASS_PRODUCTION:
      return 'mass-production';
    case WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW:
      return 'color-evaluation';
    case WorkflowNodeCode.PROJECT_CLOSED:
      return 'color-exit';
    default:
      return 'workflow';
  }
}

