import { readFileSync } from 'node:fs';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProjectBoardCard } from './projects-list-client';
import { R22Kpi, R22ProgressBar, R22StatusBadge, R22TaskCard } from './r22-ui';
import { StatePanel } from './state-panel';

const css = readFileSync(new URL('../app/r22.css', import.meta.url), 'utf8');
const materialsSource = readFileSync(new URL('./materials-upload-r22.tsx', import.meta.url), 'utf8');
const retrospectiveSource = readFileSync(new URL('./project-retrospective-r22.tsx', import.meta.url), 'utf8');
const adminSource = readFileSync(new URL('./admin-dashboard-r22.tsx', import.meta.url), 'utf8');

describe('R22 product component contracts', () => {
  it('defines the Apple-like typography, button, status and progress tokens', () => {
    expect(css).toContain('font-family: -apple-system');
    expect(css).toMatch(/font-size:\s*clamp\(36px,[^;]+40px\)/);
    expect(css).toContain('.r22-button-primary');
    expect(css).toContain('.r22-button-secondary');
    expect(css).toContain('.r22-button-danger');
    expect(css).toContain('.r22-status-danger');
    expect(css).toContain('@media (max-width: 600px)');

    const html = renderToStaticMarkup(
      <>
        <R22StatusBadge tone="danger">已逾期</R22StatusBadge>
        <R22Kpi label="风险项目" value={2} hint="需要协同" tone="warning" />
        <R22ProgressBar value={140} label="阶段进度" />
      </>,
    );
    expect(html).toContain('r22-status-danger');
    expect(html).toContain('r22-kpi-warning');
    expect(html).toContain('width:100%');
  });

  it('renders the current task hero and a project risk card with concrete recovery facts', () => {
    const taskHtml = renderToStaticMarkup(
      <R22TaskCard
        primary
        task={{
          taskId: 'task-1',
          projectId: 'project-1',
          projectCode: 'R22-001',
          projectName: '深海蓝定制色项目',
          projectPriority: 'HIGH',
          nodeCode: 'PAINT_DEVELOPMENT',
          nodeName: '涂料开发',
          status: 'IN_PROGRESS',
          dueAt: '2026-07-15T00:00:00.000Z',
          isOverdue: false,
          overdueDays: 0,
          completionPercent: 60,
          materials: { submitted: 1, required: 2, missing: 1 },
          projectHref: '/projects/project-1',
        }}
      />,
    );
    expect(taskHtml).toContain('r22-task-card-primary');
    expect(taskHtml).toContain('打开工序');
    expect(taskHtml).toContain('缺 1 项');

    const projectHtml = renderToStaticMarkup(
      <ProjectBoardCard
        project={{
          id: 'project-1', code: 'R22-001', name: '深海蓝定制色项目', status: 'IN_PROGRESS',
          priority: 'HIGH', currentNodeCode: 'PAINT_DEVELOPMENT', currentNodeName: '涂料开发',
          ownerUserId: 'owner-1', ownerName: '李经理', ownerDepartmentName: '产品部', colorName: '深海蓝',
          colorCode: 'LC-022', marketRegion: 'CN', vehicleModel: 'LT-01', targetDate: '2026-07-20T00:00:00.000Z',
          riskLevel: 'HIGH', isOverdue: true, progressPercent: 33, progressText: '6 / 18', currentTaskId: 'task-1',
          currentTaskOwnerId: 'owner-1', currentTaskOwnerName: '李经理', currentTaskDueAt: '2026-07-12T00:00:00.000Z',
          latestTaskUpdatedAt: '2026-07-13T00:00:00.000Z',
          stall: { nodeCode: 'PAINT_DEVELOPMENT', nodeName: '涂料开发', days: 3, reason: '供应商参数确认延迟', ownerName: '李经理', helperName: '王工', expectedResolvedAt: '2026-07-16T00:00:00.000Z' },
          plannedStartDate: null, plannedEndDate: null, memberCount: 4, updatedAt: '2026-07-13T00:00:00.000Z', createdAt: '2026-07-01T00:00:00.000Z',
        }}
      />,
    );
    expect(projectHtml).toContain('供应商参数确认延迟');
    expect(projectHtml).toContain('责任人');
    expect(projectHtml).toContain('预计解决');
  });

  it('keeps required materials, retrospective and admin module structures explicit', () => {
    for (const label of ['本工序材料清单', '添加新材料', '已上传材料', 'replacesAttachmentId']) {
      expect(materialsSource).toContain(label);
    }
    for (const label of ['阶段用时对比', '经验与改进', '后续改进措施', '完成复盘']) {
      expect(retrospectiveSource).toContain(label);
    }
    for (const label of ['r22-admin-toolbar', 'r22-admin-module-card', '近期异常与敏感动作']) {
      expect(adminSource).toContain(label);
    }
    expect(adminSource).not.toContain('<h1>后台管理</h1>');
    expect(adminSource).not.toContain('组织、权限、流程参数和审计风险集中在一个管理员工作台。');
  });

  it('renders empty, error and permission state variants', () => {
    const html = renderToStaticMarkup(
      <>
        <StatePanel variant="empty" title="暂无任务" description="任务完成后会出现在这里。" />
        <StatePanel variant="error" title="加载失败" description="请重试。" />
        <StatePanel variant="permission" title="无权访问" description="请联系管理员。" />
      </>,
    );
    expect(html).toContain('state-panel-empty');
    expect(html).toContain('state-panel-error');
    expect(html).toContain('state-panel-permission');
  });
});
