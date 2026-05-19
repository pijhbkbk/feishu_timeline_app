import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { AuthProvider } from '../components/auth-provider';
import { DashboardWorkspace } from '../components/dashboard-workspace';
import { ProjectEditor } from '../components/project-editor';
import { ProjectLogsWorkspace } from '../components/project-logs-workspace';
import { ProjectReviewsWorkspace } from '../components/project-reviews-workspace';
import { ProjectWorkflowWorkspace } from '../components/project-workflow-workspace';
import { SystemGuidePage } from '../components/system-guide-page';
import { normalizeApiErrorMessage } from '../lib/auth-client';
import { sidebarSections, topNavigationItems } from '../lib/navigation';

describe('route smoke', () => {
  it('renders dashboard and create project entry pages', async () => {
    const dashboardHtml = renderToStaticMarkup(<DashboardWorkspace />);
    const newProjectHtml = renderToStaticMarkup(
      <AuthProvider>
        <ProjectEditor mode="create" />
      </AuthProvider>,
    );

    expect(dashboardHtml).toContain('skeleton-block');
    expect(newProjectHtml).toContain('创建项目');
  });

  it('renders system guide with process, operation, role and FAQ content', async () => {
    const guideHtml = renderToStaticMarkup(<SystemGuidePage />);

    expect(topNavigationItems[0]?.label).toBe('系统导览');
    expect(sidebarSections[0]?.items[0]?.label).toBe('系统导览');
    expect(guideHtml).toContain('轻卡定制颜色开发项目管理系统');
    expect(guideHtml).toContain('反映市场需求');
    expect(guideHtml).toContain('颜色退出');
    expect(guideHtml).toContain('如何使用本系统');
    expect(guideHtml).toContain('各角色怎么使用');
    expect(guideHtml).toContain('为什么完成第4步后出现两个任务？');
  });

  it('normalizes backend technical error messages to Chinese UI text', () => {
    expect(normalizeApiErrorMessage('Insufficient permissions.', 403)).toBe('无权访问该功能。');
    expect(normalizeApiErrorMessage('Request failed with 404', 404)).toBe(
      '请求的数据不存在或已被删除。',
    );
    expect(normalizeApiErrorMessage('样车驾驶室评审 cannot execute START from READY.', 400)).toBe(
      '请求参数不正确，请检查后重试。',
    );
    expect(normalizeApiErrorMessage('Failed to fetch')).toBe('网络连接失败，请稍后重试。');
  });

  it('renders project workflow, reviews and logs routes without crashing', async () => {
    const workflowHtml = renderToStaticMarkup(
      <AuthProvider>
        <ProjectWorkflowWorkspace projectId="project-1" mode="workflow" />
      </AuthProvider>,
    );
    const reviewsHtml = renderToStaticMarkup(
      <AuthProvider>
        <ProjectReviewsWorkspace projectId="project-1" />
      </AuthProvider>,
    );
    const logsHtml = renderToStaticMarkup(
      <ProjectLogsWorkspace projectId="project-1" />,
    );

    expect(workflowHtml).toContain('正在加载流程视图');
    expect(reviewsHtml).toContain('正在加载驾驶室评审模块');
    expect(reviewsHtml).toContain('正在加载一致性评审模块');
    expect(logsHtml).toContain('正在加载项目日志');
  });
});
