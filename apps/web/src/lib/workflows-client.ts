'use client';

import {
  type SessionUser,
  apiRequest,
  FRONTEND_ROLE_OPTIONS,
} from './auth-client';
import {
  formatDate,
  getWorkflowNodeLabel,
  type ProjectDetail,
  type WorkflowNodeCode,
} from './projects-client';
import {
  RECURRING_PLAN_STATUS_LABELS,
  RECURRING_TASK_STATUS_LABELS,
  REVIEW_RESULT_LABELS,
  WORKFLOW_ACTION_LABELS,
  WORKFLOW_TASK_STATUS_LABELS,
} from './status-labels';

export type WorkflowAction =
  | 'START'
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'RETURN'
  | 'COMPLETE';

export type WorkflowTaskStatus =
  | 'PENDING'
  | 'READY'
  | 'IN_PROGRESS'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'COMPLETED'
  | 'CANCELLED';

export type WorkflowInstanceSummary = {
  id: string;
  instanceNo: string;
  versionNo: number;
  status: string;
  currentNodeCode: WorkflowNodeCode | null;
  currentNodeName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
};

export type WorkflowTaskSummary = {
  id: string;
  taskNo: string;
  nodeCode: WorkflowNodeCode;
  nodeName: string;
  taskRound: number;
  status: WorkflowTaskStatus;
  isPrimary: boolean;
  isActive: boolean;
  assigneeUserId: string | null;
  assigneeUserName: string | null;
  assigneeDepartmentId: string | null;
  assigneeDepartmentName: string | null;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  returnedAt: string | null;
  payload: unknown;
  availableActions: WorkflowAction[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectWorkflowResponse = {
  projectId: string;
  workflowInstance: WorkflowInstanceSummary;
  activeTasks: WorkflowTaskSummary[];
  taskHistory: WorkflowTaskSummary[];
};

export type WorkflowTimelineEntry = {
  id: string;
  action: WorkflowAction | string;
  comment: string | null;
  fromTaskId: string | null;
  fromNodeCode: WorkflowNodeCode | null;
  fromNodeName: string | null;
  toTaskId: string | null;
  toNodeCode: WorkflowNodeCode | null;
  toNodeName: string | null;
  operatorUserId: string | null;
  operatorName: string | null;
  createdAt: string;
};

export type ProjectWorkflowTimelineResponse = {
  projectId: string;
  workflowInstance: WorkflowInstanceSummary;
  timeline: WorkflowTimelineEntry[];
};

export type RecurringPlanStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type RecurringTaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'OVERDUE'
  | 'CANCELLED';

export type ReviewResult =
  | 'PENDING'
  | 'APPROVED'
  | 'CONDITIONAL_APPROVED'
  | 'REJECTED'
  | 'NEED_REWORK';

export type WorkflowTaskDetailResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    status: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
  };
  workflowInstance: WorkflowInstanceSummary;
  task: WorkflowTaskSummary;
  transitions: WorkflowTimelineEntry[];
};

export type WorkflowTaskInteractionDetail = {
  taskId: string;
  taskVersion: string;
  projectId: string;
  stepCode: string | null;
  stepNumber: number;
  stepName: string;
  nodeCode: WorkflowNodeCode;
  status: WorkflowTaskStatus;
  statusLabel: string;
  isBlocking: boolean;
  isMainline: boolean;
  nodeType: 'MAINLINE' | 'PARALLEL';
  roundNo: number;
  owner: TaskPerson | null;
  collaborators: TaskPerson[];
  approvers: TaskPerson[];
  department: {
    id: string | null;
    name: string | null;
  };
  deadline: string | null;
  workContent: string;
  outputName: string;
  requiredMaterials: Array<{
    id: string;
    name: string;
    required: boolean;
    description: string | null;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    storageKey: string;
    fileSize: number;
    mimeType: string;
    uploadedById: string | null;
    uploadedByName: string | null;
    uploadedAt: string;
    materialType: string | null;
    versionNo: number | null;
    status: string;
    downloadUrl: string;
    previewUrl: string;
  }>;
  reviewDetail: {
    latestResult: ReviewResult | null;
    latestResultLabel: string | null;
    rejectReason: string | null;
    conditionNote: string | null;
    reworkRequirement: string | null;
    reworkOwnerName: string | null;
    reviewPassAt: string | null;
    historyRounds: Array<{
      taskId: string;
      roundNo: number;
      status: WorkflowTaskStatus;
      statusLabel: string;
      completedAt: string | null;
    }>;
    records: TaskReviewRecordSummary[];
  };
  feeSummary: {
    fixedAmount: number;
    currency: string;
    status: string;
    voucherCount: number;
    financeConfirmerName: string | null;
    records: Array<{
      id: string;
      amount: number;
      status: string;
      statusLabel: string;
      payer: string | null;
      recordedByName: string | null;
      recordedAt: string | null;
      completedAt: string | null;
    }>;
  } | null;
  monthlyReviewSummary: {
    planId: string | null;
    planCode: string | null;
    totalPeriods: number;
    completedPeriods: number;
    overduePeriods: number;
    currentMonthTask: {
      id: string;
      periodLabel: string;
      status: RecurringTaskStatus;
      statusLabel: string;
      plannedDate: string;
      dueAt: string | null;
    } | null;
    ledgerPath: string;
  } | null;
  colorExitSummary: {
    annualOutput: number | null;
    exitThreshold: number | null;
    systemSuggestion: string | null;
    systemSuggestionLabel: string | null;
    finalDecision: string | null;
    finalDecisionLabel: string | null;
    exitReason: string | null;
    effectiveDate: string | null;
    operatorName: string | null;
  } | null;
  availableActions: Array<{
    action: WorkflowAction;
    label: string;
  }>;
  flowLogs: Array<{
    id: string;
    source: 'WORKFLOW_TRANSITION' | 'AUDIT_LOG';
    action: string;
    actionLabel: string;
    summary: string | null;
    operatorUserId: string | null;
    operatorName: string | null;
    fromNodeCode: WorkflowNodeCode | null;
    fromNodeName: string | null;
    toNodeCode: WorkflowNodeCode | null;
    toNodeName: string | null;
    createdAt: string;
  }>;
  project: {
    id: string;
    code: string;
    name: string;
    colorName: string;
    colorCode: string | null;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
  };
  schedule: {
    durationType: string | null;
    durationValue: number | null;
    ruleText: string;
    startedAt: string;
    createdAt: string;
    dueAt: string | null;
    effectiveDueAt: string | null;
    completedAt: string | null;
    remainingWorkdays: number | null;
    overdueDays: number;
    isOverdue: boolean;
    slaStatus: string;
    progressPercent: number | null;
  };
  relations: {
    previousNodeCode: WorkflowNodeCode | null;
    previousNodeName: string | null;
    nextNodeCode: WorkflowNodeCode | null;
    nextNodeName: string | null;
    latestOperatorName: string | null;
  };
};

export type TaskPerson = {
  id: string;
  name: string;
  memberType?: string;
  departmentId: string | null;
  departmentName: string | null;
};

export type TaskReviewRecordSummary = {
  id: string;
  reviewType: string;
  reviewRound: number;
  result: ReviewResult;
  resultLabel: string;
  comment: string | null;
  conditionNote: string | null;
  rejectReason: string | null;
  returnToNodeCode: WorkflowNodeCode | null;
  returnToNodeName: string | null;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  attachmentId: string | null;
};

export type WorkflowTaskRoundHistoryResponse = {
  taskId: string;
  projectId: string;
  nodeCode: WorkflowNodeCode;
  nodeName: string;
  rounds: WorkflowTaskSummary[];
};

export type MonthlyReviewRecordSummary = {
  id: string;
  reviewType: string;
  result: ReviewResult;
  comment: string | null;
  rejectReason: string | null;
  returnToNodeCode: WorkflowNodeCode | null;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecurringTaskSummary = {
  id: string;
  recurringPlanId: string;
  taskCode: string;
  periodIndex: number;
  periodLabel: string;
  plannedDate: string;
  dueAt: string | null;
  completedAt: string | null;
  reviewerId: string | null;
  status: RecurringTaskStatus;
  result: ReviewResult;
  comment: string | null;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

export type MonthlyReviewWorkspaceResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    status: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
  };
  recurringPlan: {
    id: string;
    planCode: string;
    status: RecurringPlanStatus;
    totalCount: number;
    generatedCount: number;
    startDate: string;
    endDate: string;
  } | null;
  summary: {
    totalPeriods: number;
    completedPeriods: number;
    overduePeriods: number;
    pendingPeriods: number;
  };
  activeWorkflowTask: WorkflowTaskSummary | null;
  recurringTasks: RecurringTaskSummary[];
  recentReviews: MonthlyReviewRecordSummary[];
};

export type MonthlyReviewTaskDetailResponse = {
  recurringPlan: {
    id: string;
    planCode: string;
    status: RecurringPlanStatus;
  };
  recurringTask: RecurringTaskSummary;
  relatedReviews: MonthlyReviewRecordSummary[];
};

export async function fetchProjectWorkflow(projectId: string) {
  return apiRequest<ProjectWorkflowResponse>(`/workflows/projects/${projectId}`);
}

export async function fetchProjectWorkflowTimeline(projectId: string) {
  return apiRequest<ProjectWorkflowTimelineResponse>(`/workflows/projects/${projectId}/timeline`);
}

export async function fetchWorkflowTaskDetail(taskId: string) {
  return apiRequest<WorkflowTaskDetailResponse>(`/workflows/tasks/${taskId}`);
}

export async function fetchWorkflowTaskInteractionDetail(taskId: string) {
  return apiRequest<WorkflowTaskInteractionDetail>(`/workflows/tasks/${taskId}/detail`);
}

export async function fetchWorkflowTaskRoundHistory(taskId: string) {
  return apiRequest<WorkflowTaskRoundHistoryResponse>(`/workflows/tasks/${taskId}/history-rounds`);
}

export async function fetchMonthlyReviewWorkspace(projectId: string) {
  return apiRequest<MonthlyReviewWorkspaceResponse>(`/workflows/projects/${projectId}/monthly-reviews`);
}

export async function fetchMonthlyReviewTaskDetail(projectId: string, recurringTaskId: string) {
  return apiRequest<MonthlyReviewTaskDetailResponse>(
    `/workflows/projects/${projectId}/monthly-reviews/${recurringTaskId}`,
  );
}

export async function executeWorkflowAction(
  taskId: string,
  action: WorkflowAction,
  input?: {
    comment?: string;
    targetNodeCode?: WorkflowNodeCode;
  },
) {
  if (action !== 'START') {
    throw new Error('终态流转必须通过对应业务工作区完成。');
  }

  return apiRequest<ProjectWorkflowResponse>(`/workflows/tasks/${taskId}/${action.toLowerCase()}`, {
    method: 'POST',
    body: input ?? {},
  });
}

export function getWorkflowTaskStatusLabel(status: WorkflowTaskStatus) {
  return WORKFLOW_TASK_STATUS_LABELS[status];
}

export function getWorkflowActionLabel(action: WorkflowAction) {
  return WORKFLOW_ACTION_LABELS[action];
}

export function getRecurringTaskStatusLabel(status: RecurringTaskStatus) {
  return RECURRING_TASK_STATUS_LABELS[status];
}

export function getRecurringPlanStatusLabel(status: RecurringPlanStatus) {
  return RECURRING_PLAN_STATUS_LABELS[status];
}

export function getReviewResultLabel(result: ReviewResult) {
  return REVIEW_RESULT_LABELS[result];
}

export function getVisibleWorkflowActions(actions: WorkflowAction[]) {
  if (actions.includes('SUBMIT')) {
    return actions.filter((action) => action !== 'COMPLETE');
  }

  return actions;
}

export function getWorkflowTaskActualTime(task: WorkflowTaskSummary) {
  return task.completedAt ?? task.returnedAt ?? task.startedAt;
}

export function isWorkflowTaskOverdue(task: WorkflowTaskSummary) {
  if (!task.isActive || !task.dueAt) {
    return false;
  }

  return new Date(task.dueAt).getTime() < Date.now();
}

const requiredRole: Record<WorkflowNodeCode, SessionUser['roleCodes'][number]> = {
    PROJECT_INITIATION: 'project_manager', DEVELOPMENT_REPORT: 'project_manager',
    PAINT_DEVELOPMENT: 'process_engineer', SAMPLE_COLOR_CONFIRMATION: 'reviewer',
    COLOR_NUMBERING: 'process_engineer', PAINT_PROCUREMENT: 'purchaser',
    STANDARD_BOARD_PRODUCTION: 'process_engineer', BOARD_DETAIL_UPDATE: 'process_engineer',
    PERFORMANCE_TEST: 'quality_engineer', FIRST_UNIT_PRODUCTION_PLAN: 'production_operator',
    TRIAL_PRODUCTION: 'process_engineer', CAB_REVIEW: 'reviewer',
    DEVELOPMENT_ACCEPTANCE: 'finance', COLOR_CONSISTENCY_REVIEW: 'reviewer',
    MASS_PRODUCTION_PLAN: 'production_operator', MASS_PRODUCTION: 'production_operator',
    VISUAL_COLOR_DIFFERENCE_REVIEW: 'quality_engineer', PROJECT_CLOSED: 'project_manager',
};

export function getWorkflowBusinessRoleLabel(nodeCode: string) {
  if (!Object.hasOwn(requiredRole, nodeCode)) return '尚未匹配';
  return FRONTEND_ROLE_OPTIONS.find(role => role.code === requiredRole[nodeCode as WorkflowNodeCode])?.label ?? '尚未匹配';
}

export function canUserOperateWorkflowTask(
  user: SessionUser | null,
  task: WorkflowTaskSummary,
) {
  if (!user || !task.isActive || !['PENDING', 'READY', 'IN_PROGRESS', 'RETURNED'].includes(task.status) || task.assigneeUserId !== user.id) return false;
  return user.roleCodes.includes(requiredRole[task.nodeCode]);
}

export function formatWorkflowTaskTime(value: string | null | undefined) {
  return formatDate(value);
}

export function getWorkflowNodeDisplayLabel(task: WorkflowTaskSummary | null | undefined) {
  return task?.nodeName ?? getWorkflowNodeLabel(task?.nodeCode);
}

export function sortWorkflowTasks(tasks: WorkflowTaskSummary[]) {
  return [...tasks].sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

export function extractWorkflowTaskByNode(
  taskHistory: WorkflowTaskSummary[],
  nodeCode: WorkflowNodeCode,
) {
  const tasks = taskHistory
    .filter((task) => task.nodeCode === nodeCode)
    .sort((left, right) => right.taskRound - left.taskRound);

  return tasks[0] ?? null;
}

export type WorkflowWorkspacePayload = {
  project: ProjectDetail;
  workflow: ProjectWorkflowResponse;
  timeline: ProjectWorkflowTimelineResponse;
};
