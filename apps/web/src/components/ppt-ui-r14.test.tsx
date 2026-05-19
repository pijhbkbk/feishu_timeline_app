import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  DepartmentAnalysisList,
  KeyLedgerPanel,
  ReworkAnalysisPanel,
  WorkflowEfficiencyList,
} from './analytics-center';
import { MaterialsProjectTable } from './materials-center';
import { MonthlyReviewMonthCard } from './monthly-reviews-board';
import type { AnalyticsOverview } from '../lib/analytics-client';
import type {
  DashboardMonthlyReviewTask,
  DashboardProjectTimelineItem,
} from '../lib/dashboard-client';
import type { WorkflowNodeCode } from '../lib/projects-client';

const NODE_CODES: WorkflowNodeCode[] = [
  'PROJECT_INITIATION',
  'DEVELOPMENT_REPORT',
  'PAINT_DEVELOPMENT',
  'SAMPLE_COLOR_CONFIRMATION',
  'COLOR_NUMBERING',
  'PAINT_PROCUREMENT',
  'PERFORMANCE_TEST',
  'STANDARD_BOARD_PRODUCTION',
  'BOARD_DETAIL_UPDATE',
  'FIRST_UNIT_PRODUCTION_PLAN',
  'TRIAL_PRODUCTION',
  'CAB_REVIEW',
  'DEVELOPMENT_ACCEPTANCE',
  'COLOR_CONSISTENCY_REVIEW',
  'MASS_PRODUCTION_PLAN',
  'MASS_PRODUCTION',
  'VISUAL_COLOR_DIFFERENCE_REVIEW',
  'PROJECT_CLOSED',
];

function createProjectTimelineItem(): DashboardProjectTimelineItem {
  return {
    projectId: 'project-1',
    projectCode: 'XM-2026-001',
    projectName: '轻卡星云蓝项目',
    colorName: '星云蓝',
    colorCode: 'C-001',
    projectStatus: 'IN_PROGRESS',
    currentNodeCode: 'CAB_REVIEW',
    currentNodeName: '样车驾驶室评审',
    currentOwnerName: '张工',
    currentDepartmentName: '质量部',
    deadline: '2026-05-20T00:00:00.000Z',
    overdueDays: 2,
    progressPercent: 42,
    nextStep: '完成评审结论',
    monthlyReview: {
      completedPeriods: 4,
      totalPeriods: 12,
      overduePeriods: 1,
    },
    updatedAt: '2026-05-07T12:00:00.000Z',
    nodes: NODE_CODES.map((nodeCode, index) => ({
      stepNumber: index + 1,
      stepCode: String(index + 1).padStart(2, '0'),
      stepName: `节点 ${index + 1}`,
      nodeCode,
      nodeName: `节点 ${index + 1}`,
      taskId: null,
      taskStatus: null,
      status: index < 7 ? 'COMPLETED' : index === 7 ? 'CURRENT' : 'NOT_STARTED',
      timelineStatus: index < 7 ? 'COMPLETED' : index === 7 ? 'CURRENT' : 'NOT_STARTED',
      isOverdue: false,
      overdueDays: 0,
      ownerName: null,
      departmentName: null,
      isBlocking: true,
      nodeType: 'MAINLINE',
      assigneeName: null,
      dueAt: null,
      completedAt: null,
    })),
  };
}

function createMonthlyTask(): DashboardMonthlyReviewTask {
  return {
    id: 'month-1',
    periodIndex: 5,
    periodLabel: '2026-05',
    plannedDate: '2026-05-07T00:00:00.000Z',
    dueAt: '2026-05-20T00:00:00.000Z',
    completedAt: null,
    status: 'IN_PROGRESS',
    result: 'PENDING',
  };
}

function createAnalyticsOverview(): AnalyticsOverview {
  return {
    lastUpdatedAt: '2026-05-07T12:00:00.000Z',
    projectOverview: {
      totalProjects: 8,
      activeProjects: 6,
      completedProjects: 2,
      overdueProjects: 1,
      averageDevelopmentDays: 31,
    },
    workflowEfficiency: {
      onTimeCompletionRate: 82,
      totalOverdueTasks: 3,
      byNode: [
        {
          nodeCode: 'CAB_REVIEW',
          nodeName: '样车驾驶室评审',
          averageDays: 4,
          overdueCount: 1,
          onTimeRate: 75,
        },
      ],
    },
    departmentAnalysis: [
      {
        departmentName: '质量部',
        todoCount: 5,
        overdueCount: 1,
        onTimeRate: 80,
      },
    ],
    reworkAnalysis: {
      returnCount: 2,
      averageReworkDays: 3,
      reasonDistribution: [{ reason: '色差超限', count: 2 }],
    },
    monthlyReviewAnalysis: {
      currentMonthDue: 4,
      completed: 2,
      pending: 1,
      overdue: 1,
      completionRate: 50,
    },
    colorExitAnalysis: {
      suggestedExit: 1,
      exited: 0,
      retained: 2,
      pending: 1,
    },
    feeAnalysis: {
      fixedAmount: 10000,
      totalRecords: 3,
      recordedCount: 2,
    },
  };
}

describe('PPT UI R14 components', () => {
  it('renders materials center table in Chinese', () => {
    const html = renderToStaticMarkup(
      <MaterialsProjectTable items={[createProjectTimelineItem()]} />,
    );

    expect(html).toContain('轻卡星云蓝项目');
    expect(html).toContain('提交材料');
    expect(html).toContain('逾期 2 天');
  });

  it('renders monthly review month card with current task and detail link', () => {
    const html = renderToStaticMarkup(
      <MonthlyReviewMonthCard projectId="project-1" task={createMonthlyTask()} />,
    );

    expect(html).toContain('第 5 个月');
    expect(html).toContain('待评审');
    expect(html).toContain('查看详情');
    expect(html).toContain('/projects/project-1/reviews?recurringTaskId=month-1');
  });

  it('renders analytics panels in Chinese', () => {
    const payload = createAnalyticsOverview();
    const html = [
      renderToStaticMarkup(<WorkflowEfficiencyList payload={payload} />),
      renderToStaticMarkup(<DepartmentAnalysisList payload={payload} />),
      renderToStaticMarkup(<ReworkAnalysisPanel payload={payload} />),
      renderToStaticMarkup(<KeyLedgerPanel payload={payload} />),
    ].join('');

    expect(html).toContain('样车驾驶室评审');
    expect(html).toContain('质量部');
    expect(html).toContain('色差超限');
    expect(html).toContain('开发费标准');
  });
});
