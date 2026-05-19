import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ProjectTimelineCard } from './project-timeline-board';
import { TaskDetailDrawer } from './task-detail-drawer';
import { TimelineNode } from './timeline-node';
import type { DashboardProjectTimelineItem } from '../lib/dashboard-client';
import type { WorkflowNodeCode } from '../lib/projects-client';
import type { WorkflowTaskInteractionDetail } from '../lib/workflows-client';

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
      stepCode: String(index + 1).padStart(2, '0'),
      stepName: `节点 ${index + 1}`,
      nodeCode,
      nodeName: `节点 ${index + 1}`,
      taskId: `task-${index + 1}`,
      taskStatus: null,
      status: index < 7 ? 'COMPLETED' : index === 7 ? 'CURRENT' : 'NOT_STARTED',
      timelineStatus: index < 7 ? 'COMPLETED' : index === 7 ? 'CURRENT' : 'NOT_STARTED',
      isOverdue: false,
      overdueDays: 0,
      ownerName: index === 0 ? '张工' : null,
      departmentName: index === 0 ? '质量部' : null,
      isBlocking: true,
      nodeType: 'MAINLINE',
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

  it('clicks a timeline node through the component handler', () => {
    const onSelect = vi.fn();
    const element = TimelineNode({
      node: {
        taskId: 'task-1',
        stepNumber: 1,
        nodeName: '反映市场需求',
        status: 'CURRENT',
        ownerName: '张工',
        departmentName: '质量部',
        dueAt: '2026-05-20T00:00:00.000Z',
      },
      onSelect,
    });

    element.props.onClick();

    expect(onSelect).toHaveBeenCalledWith('task-1');
  });

  it('renders task detail drawer owner, department, SLA and materials', () => {
    const html = renderToStaticMarkup(
      <TaskDetailDrawer
        open
        detail={createTaskDetail('PROJECT_INITIATION')}
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onReload={() => undefined}
      />,
    );

    expect(html).toContain('负责人');
    expect(html).toContain('张工');
    expect(html).toContain('责任部门');
    expect(html).toContain('质量部');
    expect(html).toContain('SLA 状态');
    expect(html).toContain('必交材料清单');
    expect(html).toContain('客户颜色样板');
  });

  it('renders step 12 review actions', () => {
    const html = renderToStaticMarkup(
      <TaskDetailDrawer
        open
        detail={createTaskDetail('CAB_REVIEW')}
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onReload={() => undefined}
      />,
    );

    expect(html).toContain('第 12 步样车驾驶室评审');
    expect(html).toContain('通过');
    expect(html).toContain('不通过 / 退回');
  });

  it('renders step 13 fixed fee amount', () => {
    const html = renderToStaticMarkup(
      <TaskDetailDrawer
        open
        detail={createTaskDetail('DEVELOPMENT_ACCEPTANCE')}
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onReload={() => undefined}
      />,
    );

    expect(html).toContain('固定金额');
    expect(html).toContain('10000 元');
  });

  it('renders step 17 monthly progress', () => {
    const html = renderToStaticMarkup(
      <TaskDetailDrawer
        open
        detail={createTaskDetail('VISUAL_COLOR_DIFFERENCE_REVIEW')}
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onReload={() => undefined}
      />,
    );

    expect(html).toContain('周期');
    expect(html).toContain('12 个月');
    expect(html).toContain('已完成 3 / 12');
  });

  it('renders step 18 color exit fields', () => {
    const html = renderToStaticMarkup(
      <TaskDetailDrawer
        open
        detail={createTaskDetail('PROJECT_CLOSED')}
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onReload={() => undefined}
      />,
    );

    expect(html).toContain('年产量');
    expect(html).toContain('18 台');
    expect(html).toContain('系统建议');
    expect(html).toContain('建议退出');
  });
});

function createTaskDetail(nodeCode: WorkflowNodeCode): WorkflowTaskInteractionDetail {
  const stepNumber = NODE_CODES.indexOf(nodeCode) + 1;
  const stepNameMap = Object.fromEntries(
    NODE_CODES.map((code, index) => [code, `节点 ${index + 1}`]),
  ) as Record<WorkflowNodeCode, string>;
  stepNameMap.CAB_REVIEW = '样车驾驶室评审';
  stepNameMap.DEVELOPMENT_ACCEPTANCE = '颜色开发收费';
  stepNameMap.VISUAL_COLOR_DIFFERENCE_REVIEW = '整车色差一致性评审';
  stepNameMap.PROJECT_CLOSED = '颜色退出';

  return {
    taskId: `task-${stepNumber}`,
    projectId: 'project-1',
    stepCode: String(stepNumber).padStart(2, '0'),
    stepNumber,
    stepName: stepNameMap[nodeCode],
    nodeCode,
    status: 'IN_PROGRESS',
    statusLabel: '进行中',
    isBlocking: true,
    isMainline: true,
    nodeType: 'MAINLINE',
    roundNo: 1,
    owner: {
      id: 'user-1',
      name: '张工',
      departmentId: 'dept-1',
      departmentName: '质量部',
    },
    collaborators: [],
    approvers: [],
    department: {
      id: 'dept-1',
      name: '质量部',
    },
    deadline: '2026-05-20T00:00:00.000Z',
    workContent: '执行工序并提交材料。',
    outputName: '工序输出物',
    requiredMaterials: [
      {
        id: 'm-1',
        name: '客户颜色样板',
        required: true,
        description: null,
      },
    ],
    attachments: [],
    reviewDetail: {
      latestResult: 'APPROVED',
      latestResultLabel: '通过',
      rejectReason: null,
      conditionNote: '按评审意见整改。',
      reworkRequirement: '按评审意见整改。',
      reworkOwnerName: '张工',
      reviewPassAt: '2026-05-20T00:00:00.000Z',
      historyRounds: [
        {
          taskId: 'task-1',
          roundNo: 1,
          status: 'APPROVED',
          statusLabel: '已通过',
          completedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
      records: [],
    },
    feeSummary:
      nodeCode === 'DEVELOPMENT_ACCEPTANCE'
        ? {
            fixedAmount: 10000,
            currency: 'CNY',
            status: '未记录',
            voucherCount: 0,
            financeConfirmerName: null,
            records: [],
          }
        : null,
    monthlyReviewSummary:
      nodeCode === 'VISUAL_COLOR_DIFFERENCE_REVIEW'
        ? {
            planId: 'plan-1',
            planCode: 'MR-1',
            totalPeriods: 12,
            completedPeriods: 3,
            overduePeriods: 1,
            currentMonthTask: {
              id: 'month-1',
              periodLabel: '2026-05',
              status: 'IN_PROGRESS',
              statusLabel: '待评审',
              plannedDate: '2026-05-01T00:00:00.000Z',
              dueAt: '2026-05-31T00:00:00.000Z',
            },
            ledgerPath: '/monthly-reviews',
          }
        : null,
    colorExitSummary:
      nodeCode === 'PROJECT_CLOSED'
        ? {
            annualOutput: 18,
            exitThreshold: 20,
            systemSuggestion: 'EXIT',
            systemSuggestionLabel: '建议退出',
            finalDecision: 'EXIT',
            finalDecisionLabel: '建议退出',
            exitReason: '年产量低于阈值。',
            effectiveDate: '2026-06-01T00:00:00.000Z',
            operatorName: '张工',
          }
        : null,
    availableActions: [
      {
        action: nodeCode === 'CAB_REVIEW' ? 'APPROVE' : 'COMPLETE',
        label: nodeCode === 'CAB_REVIEW' ? '通过' : '完成工序',
      },
    ],
    flowLogs: [],
    project: {
      id: 'project-1',
      code: 'R17-001',
      name: 'R17 时间线项目',
      colorName: '星云蓝',
      colorCode: 'C-001',
      currentNodeCode: nodeCode,
      currentNodeName: stepNameMap[nodeCode],
    },
    schedule: {
      durationType: 'WORKDAY',
      durationValue: 4,
      ruleText: '按工作日，4 个工作日',
      startedAt: '2026-05-17T00:00:00.000Z',
      createdAt: '2026-05-17T00:00:00.000Z',
      dueAt: '2026-05-20T00:00:00.000Z',
      effectiveDueAt: '2026-05-20T00:00:00.000Z',
      completedAt: null,
      remainingWorkdays: 2,
      overdueDays: 0,
      isOverdue: false,
      slaStatus: '正常',
      progressPercent: 45,
    },
    relations: {
      previousNodeCode: null,
      previousNodeName: null,
      nextNodeCode: 'DEVELOPMENT_REPORT',
      nextNodeName: '新颜色开发报告',
      latestOperatorName: '张工',
    },
  };
}
