import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Step17MonthlySummary } from './task-detail-drawer';
import { RealTaskDetail } from '../features/v2/real-workspace-page';

describe('actual and historical visual review summaries', () => {
  // Next uses automatic JSX; this test runner uses classic JSX for imported legacy views.
  beforeAll(() => vi.stubGlobal('React', React));
  afterAll(() => vi.unstubAllGlobals());
  const summary = (totalPeriods: number) => ({ totalPeriods, completedPeriods: 2, overduePeriods: 1, progressText: '已完成 2 / 12', currentMonthTask: null });
  function drawer(totalPeriods?: number) {
    const detail = { projectId: 'project-a', monthlyReviewSummary: totalPeriods === undefined ? null : summary(totalPeriods) } as Parameters<typeof Step17MonthlySummary>[0]['detail'];
    return renderToStaticMarkup(<Step17MonthlySummary detail={detail} />);
  }
  function workspace(totalPeriods: number) {
    const node: Parameters<typeof RealTaskDetail>[0]['node'] = {
      step: 17, code: 'VISUAL_COLOR_DIFFERENCE_REVIEW', name: '整车色差一致性评审',
      taskId: 'task-17', status: 'IN_PROGRESS', round: 1, missingMaterials: [],
      x: 0, y: 0, width: 190, height: 92, shape: 'rounded', owner: '合成成员',
      department: '合成部门', deadline: '待确定', collaborators: [], approver: '无',
      startedAt: '待确定', remainingDays: null, overdueDays: 0, requirement: '', output: '',
      requiredMaterials: [], uploadedMaterials: [], recentEvents: [],
    };
    const rawNode: Parameters<typeof RealTaskDetail>[0]['rawNode'] = {
      taskId: 'task-17', stepCode: '17', stepNumber: 17, stepName: node.name, nodeCode: node.code,
      status: 'IN_PROGRESS', statusLabel: '进行中', ownerName: null, departmentName: null,
      dueAt: null, overdueDays: 0, isOverdue: false, isBlocking: false, isMainline: true,
      nodeType: 'TASK', roundNo: 1, colorExit: null, primaryDepartment: null,
      collaboratorDepartments: [], suggestedOwner: null, collaborators: [], reviewers: [],
      assignmentStatus: 'UNASSIGNED', assignmentSource: 'UNASSIGNED', availableActions: [], blocker: null,
      materialProgress: { submitted: 0, required: 0, missing: 0, total: 0, text: '0 / 0' },
      monthlyReview: summary(totalPeriods),
    };
    return renderToStaticMarkup(<RealTaskDetail node={node} rawNode={rawNode} task={null} loading={false} error={null} onClose={() => {}} onComplete={() => {}} />);
  }
  it.each([undefined, 0])('does not invent a twelve-month obligation for actual mode (%s)', total => {
    const html = drawer(total);
    expect(html).toContain('不生成固定月份义务');
    expect(html).toContain('href="/projects/project-a/color-evaluation"');
    expect(html).toContain('查看实际目视评审');
    expect(html).not.toContain('12 个月');
    expect(html).not.toContain('逾期月份');
  });
  it('retains real historical period counts and the correct review destination', () => {
    const html = drawer(12);
    expect(html).toContain('已完成 2 / 12');
    expect(html).toContain('1 个月');
    expect(html).toContain('查看历史月度评审');
    expect(html).toContain('href="/projects/project-a/color-evaluation"');
    expect(html).not.toContain('不生成固定月份义务');
  });
  it('shows actual-mode guidance in the project task detail without historic overdue claims', () => {
    const html = workspace(0);
    expect(html).toContain('不生成固定月份义务');
    expect(html).not.toContain('逾期月份');
    expect(html).not.toContain('已完成 2 / 12');
  });
  it('preserves historical periods in the project task detail', () => {
    const html = workspace(12);
    expect(html).toContain('已完成 2 / 12');
    expect(html).toContain('逾期月份');
    expect(html).toContain('保留原历史期次与签署事实');
    expect(html).not.toContain('不生成固定月份义务');
  });
});
