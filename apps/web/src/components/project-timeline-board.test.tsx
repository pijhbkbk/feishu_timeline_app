import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProjectTimelineCard } from './project-timeline-board';
import type { DashboardProjectTimelineItem } from '../lib/dashboard-client';
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

function createTimelineItem(): DashboardProjectTimelineItem {
  return {
    projectId: 'project-1',
    projectCode: 'R14-001',
    projectName: 'R14 时间线项目',
    colorName: '星云蓝',
    colorCode: 'C-001',
    projectStatus: 'IN_PROGRESS',
    currentNodeCode: 'CAB_REVIEW',
    currentNodeName: '样车驾驶室评审',
    currentOwnerName: '张工',
    currentDepartmentName: '质量部',
    deadline: '2026-05-20T00:00:00.000Z',
    overdueDays: 0,
    progressPercent: 42,
    nextStep: '推进样车驾驶室评审',
    monthlyReview: null,
    updatedAt: '2026-05-07T12:00:00.000Z',
    nodes: NODE_CODES.map((nodeCode, index) => ({
      stepNumber: index + 1,
      nodeCode,
      nodeName: `节点 ${index + 1}`,
      taskId: null,
      taskStatus: null,
      timelineStatus: index < 7 ? 'COMPLETED' : index === 7 ? 'CURRENT' : 'NOT_STARTED',
      isOverdue: false,
      overdueDays: 0,
      assigneeName: null,
      dueAt: null,
      completedAt: null,
    })),
  };
}

describe('ProjectTimelineCard', () => {
  it('renders current node, owner and progress in Chinese', () => {
    const html = renderToStaticMarkup(<ProjectTimelineCard item={createTimelineItem()} />);

    expect(html).toContain('R14 时间线项目');
    expect(html).toContain('当前节点：样车驾驶室评审');
    expect(html).toContain('当前责任人');
    expect(html).toContain('42%');
    expect(html).toContain('查看详情');
  });
});
