'use client';

import { apiRequest } from './auth-client';
import {
  formatDateTime,
  getProjectPriorityLabel,
  getWorkflowNodeLabel,
  type ProjectPriority,
  type WorkflowNodeCode,
} from './projects-client';
import type { RecurringTaskStatus, ReviewResult } from './workflows-client';
import type { TaskListResponse } from './tasks-client';
import type { TimelineNodeStatus } from './status-labels';

export type DashboardOverview = {
  totalProjects: number;
  activeProjects: number;
  overdueTasks: number;
  pendingReviews: number;
  currentMonthPendingReviews: number;
  monthlyColorReviewPending: number;
  pendingColorExits: number;
  activeColors: number;
  completedProjects: number;
  lastUpdatedAt: string;
  lastDataUpdatedAt: string;
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

export type DashboardTimelineNode = {
  stepNumber: number;
  nodeCode: WorkflowNodeCode;
  nodeName: string;
  taskId: string | null;
  taskStatus: string | null;
  timelineStatus: TimelineNodeStatus;
  isOverdue: boolean;
  overdueDays: number;
  assigneeName: string | null;
  dueAt: string | null;
  completedAt: string | null;
};

export type DashboardProjectTimelineItem = {
  projectId: string;
  projectCode: string;
  projectName: string;
  colorName: string;
  colorCode: string | null;
  projectStatus: string;
  currentNodeCode: WorkflowNodeCode | null;
  currentNodeName: string;
  currentOwnerName: string;
  currentDepartmentName: string | null;
  deadline: string | null;
  overdueDays: number;
  progressPercent: number;
  nextStep: string;
  monthlyReview: {
    completedPeriods: number;
    totalPeriods: number;
    overduePeriods: number;
  } | null;
  updatedAt: string;
  nodes: DashboardTimelineNode[];
};

export type DashboardProjectTimelinesResponse = {
  lastUpdatedAt: string;
  items: DashboardProjectTimelineItem[];
};

export type DashboardMonthlyReviewBoardResponse = {
  lastUpdatedAt: string;
  summary: {
    projectCount: number;
    totalPeriods: number;
    completedPeriods: number;
    overduePeriods: number;
    currentMonthPending: number;
  };
  items: Array<{
    projectId: string;
    projectCode: string;
    projectName: string;
    colorName: string;
    ownerName: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string;
    planId: string;
    planCode: string;
    totalPeriods: number;
    completedPeriods: number;
    overduePeriods: number;
    currentMonthTask: DashboardMonthlyReviewTask | null;
    months: DashboardMonthlyReviewTask[];
  }>;
};

export type DashboardMonthlyReviewTask = {
  id: string;
  periodIndex: number;
  periodLabel: string;
  plannedDate: string;
  dueAt: string | null;
  completedAt: string | null;
  status: RecurringTaskStatus;
  result: ReviewResult;
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

export async function fetchDashboardProjectTimelines() {
  return apiRequest<DashboardProjectTimelinesResponse>('/dashboard/project-timelines');
}

export async function fetchDashboardMonthlyReviewBoard() {
  return apiRequest<DashboardMonthlyReviewBoardResponse>('/dashboard/monthly-review-board');
}

export function getDashboardOverviewCards(overview: DashboardOverview) {
  return [
    { label: '项目总数', value: String(overview.totalProjects) },
    { label: '进行中项目', value: String(overview.activeProjects) },
    { label: '逾期任务', value: String(overview.overdueTasks) },
    { label: '本月待评审', value: String(overview.currentMonthPendingReviews) },
    { label: '月度色差评审待完成', value: String(overview.monthlyColorReviewPending) },
    { label: '待退出颜色', value: String(overview.pendingColorExits) },
    { label: '最近更新时间', value: formatDateTime(overview.lastUpdatedAt) },
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
  projectTimelines: DashboardProjectTimelinesResponse;
  monthlyReviewBoard: DashboardMonthlyReviewBoardResponse;
  myTasks: TaskListResponse;
  overdueTasks: TaskListResponse;
};
