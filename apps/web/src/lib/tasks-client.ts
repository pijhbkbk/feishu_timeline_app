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

export type TaskListMode = 'my' | 'pending' | 'overdue';

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
};

export type TaskListResponse = {
  mode: TaskListMode;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: TaskListItem[];
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

export function getTaskModeTitle(mode: TaskListMode) {
  switch (mode) {
    case 'my':
      return '我的待办';
    case 'pending':
      return '待处理任务';
    case 'overdue':
      return '我的超期任务';
    default:
      return '任务';
  }
}

export function getTaskModeDescription(mode: TaskListMode) {
  switch (mode) {
    case 'my':
      return '展示当前用户分配到的全部活跃任务。';
    case 'pending':
      return '展示当前用户尚未超期的待处理任务。';
    case 'overdue':
      return '展示当前用户已经超期的任务。';
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

