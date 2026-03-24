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
