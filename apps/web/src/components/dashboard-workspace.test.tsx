import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  KPIOverviewSection,
  RecentReviewsPanel,
  RiskProjectsPanel,
} from './dashboard-workspace';

describe('DashboardWorkspace', () => {
  it('renders KPI cards', () => {
    const html = renderToStaticMarkup(
      <KPIOverviewSection
        cards={[
          { label: '项目总数', value: '8' },
          { label: '超期任务', value: '3' },
        ]}
      />,
    );

    expect(html).toContain('项目总数');
    expect(html).toContain('8');
    expect(html).toContain('超期任务');
  });

  it('renders recent reviews and risk project links', () => {
    const reviewsHtml = renderToStaticMarkup(
      <RecentReviewsPanel
        items={[
          {
            id: 'review-1',
            reviewType: 'CAB_REVIEW',
            projectId: 'project-1',
            projectName: '项目A',
            reviewerName: '张工',
            reviewDate: '2026-03-19T12:00:00.000Z',
            conclusion: 'APPROVED',
          },
        ]}
      />,
    );
    const risksHtml = renderToStaticMarkup(
      <RiskProjectsPanel
        items={[
          {
            projectId: 'project-1',
            projectName: '项目A',
            riskLevel: 'HIGH',
            currentNodeCode: 'PAINT_PROCUREMENT',
            currentNodeName: '涂料采购',
            overdueDays: 2,
            ownerName: '李工',
          },
        ]}
      />,
    );

    expect(reviewsHtml).toContain('项目A');
    expect(reviewsHtml).toContain('通过');
    expect(risksHtml).toContain('/projects/project-1/overview');
    expect(risksHtml).toContain('超期 2 天');
  });
});

