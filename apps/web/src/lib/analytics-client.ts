'use client';

import { apiRequest } from './auth-client';
import type { WorkflowNodeCode } from './projects-client';

export type AnalyticsOverview = {
  lastUpdatedAt: string;
  projectOverview: {
    totalProjects: number;
    activeProjects: number;
    completedProjects: number;
    overdueProjects: number;
    averageDevelopmentDays: number;
  };
  workflowEfficiency: {
    onTimeCompletionRate: number;
    totalOverdueTasks: number;
    byNode: Array<{
      nodeCode: WorkflowNodeCode;
      nodeName: string;
      averageDays: number;
      overdueCount: number;
      onTimeRate: number;
    }>;
  };
  departmentAnalysis: Array<{
    departmentName: string;
    todoCount: number;
    overdueCount: number;
    onTimeRate: number;
  }>;
  reworkAnalysis: {
    returnCount: number;
    averageReworkDays: number;
    reasonDistribution: Array<{
      reason: string;
      count: number;
    }>;
  };
  monthlyReviewAnalysis: {
    currentMonthDue: number;
    completed: number;
    pending: number;
    overdue: number;
    completionRate: number;
  };
  colorExitAnalysis: {
    suggestedExit: number;
    exited: number;
    retained: number;
    pending: number;
  };
  feeAnalysis: {
    fixedAmount: number;
    totalRecords: number;
    recordedCount: number;
  };
};

export function fetchAnalyticsOverview() {
  return apiRequest<AnalyticsOverview>('/analytics/overview');
}
