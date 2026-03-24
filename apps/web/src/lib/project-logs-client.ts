'use client';

import { apiRequest } from './auth-client';
import { formatDate, getWorkflowNodeLabel, type WorkflowNodeCode } from './projects-client';

export type ProjectLogSourceType = 'AUDIT' | 'WORKFLOW' | 'NOTIFICATION';

export type ProjectLogItem = {
  id: string;
  sourceType: ProjectLogSourceType;
  action: string;
  title: string;
  description: string;
  actorName: string | null;
  actorUserId: string | null;
  nodeCode: WorkflowNodeCode | null;
  nodeName: string | null;
  linkPath: string | null;
  isRead: boolean | null;
  sendStatus: 'PENDING' | 'SENT' | 'FAILED' | null;
  createdAt: string;
};

export type ProjectLogsResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    targetDate: string | null;
  };
  summary: {
    auditCount: number;
    workflowCount: number;
    notificationCount: number;
    totalCount: number;
  };
  items: ProjectLogItem[];
};

export function fetchProjectLogs(projectId: string) {
  return apiRequest<ProjectLogsResponse>(`/projects/${projectId}/logs`);
}

export function getProjectLogSourceLabel(sourceType: ProjectLogSourceType) {
  switch (sourceType) {
    case 'AUDIT':
      return '审计日志';
    case 'WORKFLOW':
      return '流程流转';
    case 'NOTIFICATION':
      return '通知';
    default:
      return sourceType;
  }
}

export function getProjectLogActorLabel(item: Pick<ProjectLogItem, 'actorName' | 'sourceType'>) {
  if (item.actorName) {
    return item.actorName;
  }

  return item.sourceType === 'NOTIFICATION' ? '系统通知' : '系统';
}

export function getProjectLogNodeLabel(item: Pick<ProjectLogItem, 'nodeCode' | 'nodeName'>) {
  return item.nodeName ?? getWorkflowNodeLabel(item.nodeCode);
}

export function formatProjectLogTimestamp(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatProjectLogTargetDate(value: string | null) {
  return formatDate(value);
}
