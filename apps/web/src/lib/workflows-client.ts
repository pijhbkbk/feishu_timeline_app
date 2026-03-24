'use client';

import {
  type SessionUser,
  apiRequest,
} from './auth-client';
import {
  formatDate,
  getWorkflowNodeLabel,
  type ProjectDetail,
  type WorkflowNodeCode,
} from './projects-client';

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

const WORKFLOW_TASK_STATUS_LABELS: Record<WorkflowTaskStatus, string> = {
  PENDING: '待处理',
  READY: '待开始',
  IN_PROGRESS: '进行中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  RETURNED: '已退回',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

const WORKFLOW_ACTION_LABELS: Record<WorkflowAction, string> = {
  START: '开始',
  SUBMIT: '提交',
  APPROVE: '通过',
  REJECT: '驳回',
  RETURN: '退回',
  COMPLETE: '完成',
};

export async function fetchProjectWorkflow(projectId: string) {
  return apiRequest<ProjectWorkflowResponse>(`/workflows/projects/${projectId}`);
}

export async function fetchProjectWorkflowTimeline(projectId: string) {
  return apiRequest<ProjectWorkflowTimelineResponse>(`/workflows/projects/${projectId}/timeline`);
}

export async function executeWorkflowAction(
  taskId: string,
  action: WorkflowAction,
  input?: {
    comment?: string;
    targetNodeCode?: WorkflowNodeCode;
  },
) {
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

export function canUserOperateWorkflowTask(
  user: SessionUser | null,
  task: WorkflowTaskSummary,
) {
  if (!user) {
    return false;
  }

  if (
    user.isSystemAdmin ||
    user.roleCodes.includes('admin') ||
    user.roleCodes.includes('project_manager')
  ) {
    return true;
  }

  if (task.nodeCode === 'PAINT_PROCUREMENT' && user.roleCodes.includes('purchaser')) {
    return true;
  }

  if (
    task.nodeCode === 'PERFORMANCE_TEST' &&
    (user.roleCodes.includes('quality_engineer') ||
      user.roleCodes.includes('process_engineer'))
  ) {
    return true;
  }

  if (
    (task.nodeCode === 'STANDARD_BOARD_PRODUCTION' ||
      task.nodeCode === 'BOARD_DETAIL_UPDATE') &&
    (user.roleCodes.includes('quality_engineer') ||
      user.roleCodes.includes('process_engineer'))
  ) {
    return true;
  }

  if (
    (task.nodeCode === 'FIRST_UNIT_PRODUCTION_PLAN' ||
      task.nodeCode === 'TRIAL_PRODUCTION' ||
      task.nodeCode === 'MASS_PRODUCTION_PLAN' ||
      task.nodeCode === 'MASS_PRODUCTION' ||
      task.nodeCode === 'PROJECT_CLOSED') &&
    user.roleCodes.includes('process_engineer')
  ) {
    return true;
  }

  if (
    (task.nodeCode === 'CAB_REVIEW' ||
      task.nodeCode === 'COLOR_CONSISTENCY_REVIEW' ||
      task.nodeCode === 'VISUAL_COLOR_DIFFERENCE_REVIEW') &&
    (user.roleCodes.includes('reviewer') ||
      user.roleCodes.includes('quality_engineer'))
  ) {
    return true;
  }

  if (task.nodeCode === 'DEVELOPMENT_ACCEPTANCE' && user.roleCodes.includes('finance')) {
    return true;
  }

  if (!task.assigneeUserId) {
    return true;
  }

  return task.assigneeUserId === user.id;
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
