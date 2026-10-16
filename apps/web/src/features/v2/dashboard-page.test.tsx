import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { R26DashboardResponse } from './real-types';

const state = vi.hoisted(() => ({
  response: null as R26DashboardResponse | null,
  loading: false,
  error: null as string | null,
}));
vi.mock('./r26-data-mode', () => ({ isR26ReadOnlyRealDataEnabled: () => true }));
vi.mock('./r26-real-data-context', () => ({ useR26RealData: () => ({ dashboardResponse: state.response, loading: state.loading, error: state.error }) }));
import { DashboardPage } from './dashboard-page';

function response(id: string, visibleProjects: number, admin = true): R26DashboardResponse {
  return {
    dataSource: 'database', readOnly: true, generatedAt: '2026-09-17T00:00:00Z',
    viewer: { id, name: id, departmentId: null, departmentName: null, roleCodes: admin ? ['admin'] : ['viewer'], permissionCodes: admin ? ['project.create'] : [], isSystemAdmin: admin, roleLabel: admin ? '系统管理员' : '普通查看者', organizationStatus: 'MISSING_DEPARTMENT', authSource: 'local' },
    dashboard: {
      generatedAt: '2026-09-17T00:00:00Z', user: { id, name: id, departmentName: null }, currentTask: null, nextTask: null,
      stats: { activeTasks: 0, dueTodayTasks: 0, overdueTasks: 0, visibleProjects, pendingReviewTasks: 0, pendingMaterialTasks: 0, waitingOnOthersTasks: 0 },
      recentActivity: [],
    },
  };
}
const render = () => renderToStaticMarkup(<DashboardPage />);

describe('native dashboard task and project empty states', () => {
  beforeAll(() => { vi.stubGlobal('React', React); });
  afterAll(() => { vi.unstubAllGlobals(); });
  beforeEach(() => { state.response = response('synthetic-admin', 1); state.loading = false; state.error = null; });

  it('does not claim no projects when an administrator has projects but no assigned task', () => {
    const html = render();
    expect(html).toContain('当前没有待处理工序');
    expect(html).toContain('打开项目列表');
    expect(html).toContain('dashboard-create-project-button');
    expect(html).not.toContain('当前还没有项目');
    expect(html).not.toContain('第一个项目');
  });

  it('keeps the task empty state and authorized create action for a new empty installation', () => {
    state.response = response('empty-install-admin', 0);
    const html = render();
    expect(html).toContain('当前没有待处理工序');
    expect(html).toContain('新建项目');
    expect(html).not.toContain('当前还没有项目');
  });

  it('does not infer the project-list scope from the personal dashboard count', () => {
    state.response = response('department-viewer', 0, false);
    const html = render();
    expect(html).toContain('当前没有待处理工序');
    expect(html).toContain('打开项目列表');
    expect(html).not.toContain('dashboard-create-project-button');
    expect(html).not.toContain('当前还没有项目');
    expect(html).not.toContain('数据已经连接成功');
  });

  it.each(['无权访问该功能。', '网络连接失败，请稍后重试。'])('shows %s instead of a successful empty result', (error) => {
    state.error = error;
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain(error);
    expect(html).not.toContain('synthetic-admin');
    expect(html).not.toContain('当前没有待处理工序');
  });

  it('does not display stale dashboard data while loading', () => {
    state.loading = true;
    const html = render();
    expect(html).toContain('r26-real-loading');
    expect(html).not.toContain('synthetic-admin');
    expect(html).not.toContain('当前没有待处理工序');
  });

  it('renders the current viewer and permissions after an account context replacement', () => {
    expect(render()).toContain('dashboard-create-project-button');
    state.response = response('synthetic-next-viewer', 0, false);
    const html = render();
    expect(html).toContain('synthetic-next-viewer');
    expect(html).not.toContain('synthetic-admin');
    expect(html).not.toContain('dashboard-create-project-button');
  });
});
