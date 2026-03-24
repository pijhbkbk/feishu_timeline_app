'use client';

import { apiRequest } from './auth-client';
import {
  getProjectPriorityLabel,
  getWorkflowNodeLabel,
  type ProjectPriority,
  type WorkflowNodeCode,
} from './projects-client';
import type { TaskListResponse } from './tasks-client';

export type DashboardOverview = {
  totalProjects: number;
  activeProjects: number;
  overdueTasks: number;
  pendingReviews: number;
  activeColors: number;
  completedProjects: number;
};

export type StageDistributionItem = {
  nodeCode: WorkflowNodeCode;
  nodeName: string;
  count: number;
};

export type RecentReviewItem = {
  id: string;
  reviewType: string;
  projectId: string;
  projectName: string;
  reviewerName: string;
  reviewDate: string | null;
  conclusion: 'APPROVED' | 'CONDITIONAL_APPROVED' | 'REJECTED';
};

export type RiskProjectItem = {
  projectId: string;
  projectName: string;
  riskLevel: ProjectPriority;
  currentNodeCode: WorkflowNodeCode | null;
  currentNodeName: string;
  overdueDays: number;
  ownerName: string;
};

export async function fetchDashboardOverview() {
  return apiRequest<DashboardOverview>('/dashboard/overview');
}

export async function fetchDashboardStageDistribution() {
  return apiRequest<StageDistributionItem[]>('/dashboard/stage-distribution');
}

export async function fetchDashboardRecentReviews() {
  return apiRequest<RecentReviewItem[]>('/dashboard/recent-reviews');
}

export async function fetchDashboardRiskProjects() {
  return apiRequest<RiskProjectItem[]>('/dashboard/risk-projects');
}

export function getDashboardOverviewCards(overview: DashboardOverview) {
  return [
    { label: '项目总数', value: String(overview.totalProjects) },
    { label: '进行中项目', value: String(overview.activeProjects) },
    { label: '超期任务', value: String(overview.overdueTasks) },
    { label: '待评审任务', value: String(overview.pendingReviews) },
    { label: '有效颜色数', value: String(overview.activeColors) },
    { label: '已完成项目', value: String(overview.completedProjects) },
  ];
}

export function getStageDistributionRatio(
  item: StageDistributionItem,
  items: StageDistributionItem[],
) {
  const max = Math.max(1, ...items.map((entry) => entry.count));
  return Math.max(8, Math.round((item.count / max) * 100));
}

export function getReviewConclusionLabel(
  conclusion: RecentReviewItem['conclusion'],
) {
  switch (conclusion) {
    case 'APPROVED':
      return '通过';
    case 'CONDITIONAL_APPROVED':
      return '条件通过';
    case 'REJECTED':
      return '驳回';
    default:
      return conclusion;
  }
}

export function getRiskProjectSummary(item: RiskProjectItem) {
  return `${getProjectPriorityLabel(item.riskLevel)} / ${getWorkflowNodeLabel(item.currentNodeCode)}`;
}

export type DashboardWorkspacePayload = {
  overview: DashboardOverview;
  stageDistribution: StageDistributionItem[];
  recentReviews: RecentReviewItem[];
  riskProjects: RiskProjectItem[];
  myTasks: TaskListResponse;
  overdueTasks: TaskListResponse;
};
