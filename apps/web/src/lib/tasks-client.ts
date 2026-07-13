'use client';

import { apiRequest } from './auth-client';
import {
  formatDate,
  getProjectPriorityLabel,
  getProjectStatusLabel,
  getWorkflowNodeLabel,
  type ProjectPriority,
  type ProjectStatus,
  type WorkflowNodeCode,
} from './projects-client';
import { getWorkflowTaskStatusLabel, type WorkflowTaskStatus } from './workflows-client';

export type TaskListMode = 'my' | 'pending' | 'review' | 'due-soon' | 'overdue' | 'completed';

export type TaskListItem = {
  taskId: string;
  projectId: string;
  projectName: string;
  projectHref: string;
  nodeCode: WorkflowNodeCode;
  nodeName: string;
  taskStatus: WorkflowTaskStatus;
  dueAt: string | null;
  assigneeName: string;
  isOverdue: boolean;
  priority: ProjectPriority;
  currentProjectStatus: ProjectStatus;
  currentProjectNodeCode: WorkflowNodeCode | null;
  materialCount: number;
  completionPercent: number;
  latestUpdate: {
    content: string;
    nextPlan: string | null;
    createdAt: string;
  } | null;
  blocker: {
    type: string;
    description: string;
    helperName: string | null;
    expectedResolvedAt: string | null;
    status: 'OPEN' | 'RESOLVED' | 'CANCELLED';
  } | null;
};

export type TaskListResponse = {
  mode: TaskListMode;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: TaskListItem[];
};

export type TaskProgressItem = {
  id: string;
  taskId: string;
  projectId: string;
  submittedById: string | null;
  submittedByName: string;
  completionPercent: number;
  completedContent: string;
  nextPlan: string | null;
  materialAttachmentIds: string[];
  blocker: {
    id: string;
    type: string;
    description: string;
    helperUserId: string | null;
    helperUserName: string | null;
    expectedResolvedAt: string | null;
    status: 'OPEN' | 'RESOLVED' | 'CANCELLED';
    resolvedAt: string | null;
  } | null;
  idempotencyKey: string;
  createdAt: string;
};

export type TaskProgressResponse = {
  taskId: string;
  projectId: string;
  items: TaskProgressItem[];
};

export type CreateTaskProgressInput = {
  completedContent: string;
  nextPlan?: string;
  completionPercent: number;
  isBlocked: boolean;
  blockerType?: 'MATERIAL' | 'SUPPLIER' | 'TECHNICAL' | 'REVIEW' | 'SCHEDULE' | 'OTHER';
  blockerDescription?: string;
  helperUserId?: string;
  expectedResolvedAt?: string;
  materialAttachmentIds?: string[];
  idempotencyKey: string;
};

export async function fetchTaskList(
  mode: TaskListMode,
  params: {
    page?: number;
    pageSize?: number;
  } = {},
) {
  const searchParams = new URLSearchParams();

  if (params.page) {
    searchParams.set('page', String(params.page));
  }

  if (params.pageSize) {
    searchParams.set('pageSize', String(params.pageSize));
  }

  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return apiRequest<TaskListResponse>(`/tasks/${mode}${suffix}`);
}

export async function fetchTaskDetail(taskId: string) {
  return apiRequest<TaskListItem>(`/tasks/${taskId}`);
}

export function fetchTaskProgress(taskId: string) {
  return apiRequest<TaskProgressResponse>(`/tasks/${taskId}/progress`);
}

export function createTaskProgress(taskId: string, input: CreateTaskProgressInput) {
  return apiRequest<TaskProgressItem>(`/tasks/${taskId}/progress`, {
    method: 'POST',
    body: input,
  });
}

export function getTaskModeTitle(mode: TaskListMode) {
  switch (mode) {
    case 'my':
      return '我的待办';
    case 'pending':
      return '待处理任务';
    case 'review':
      return '待我评审';
    case 'due-soon':
      return '即将到期';
    case 'overdue':
      return '我的逾期任务';
    case 'completed':
      return '已完成任务';
    default:
      return '任务';
  }
}

export function getTaskModeDescription(mode: TaskListMode) {
  switch (mode) {
    case 'my':
      return '展示当前用户分配到的全部活跃任务。';
    case 'pending':
      return '展示当前用户尚未逾期的待处理任务。';
    case 'review':
      return '展示当前用户负责的评审门禁任务。';
    case 'due-soon':
      return '展示未来 7 天内需要完成的任务。';
    case 'overdue':
      return '展示当前用户已经逾期的任务。';
    case 'completed':
      return '展示当前用户已经完成的历史任务。';
    default:
      return '展示任务列表。';
  }
}

export function getTaskPriorityLabel(priority: ProjectPriority) {
  return getProjectPriorityLabel(priority);
}

export function getTaskProjectStatusLabel(status: ProjectStatus) {
  return getProjectStatusLabel(status);
}

export function getTaskNodeLabel(item: Pick<TaskListItem, 'nodeCode' | 'nodeName'>) {
  return item.nodeName || getWorkflowNodeLabel(item.nodeCode);
}

export function getTaskDueDateLabel(dueAt: string | null) {
  return formatDate(dueAt);
}

export function getTaskStatusLabel(status: WorkflowTaskStatus) {
  return getWorkflowTaskStatusLabel(status);
}
