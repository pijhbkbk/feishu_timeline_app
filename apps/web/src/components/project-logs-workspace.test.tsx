import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ProjectLogFilterBar,
  ProjectLogSourceBadge,
  ProjectLogTimelineList,
} from './project-logs-workspace';

describe('ProjectLogsWorkspace', () => {
  it('renders filter bar and timeline items', () => {
    const filterHtml = renderToStaticMarkup(
      <ProjectLogFilterBar filter="ALL" onChange={() => undefined} />,
    );
    const timelineHtml = renderToStaticMarkup(
      <ProjectLogTimelineList
        items={[
          {
            id: 'workflow:1',
            sourceType: 'WORKFLOW',
            action: 'COMPLETE',
            title: '样车试制 -> 驾驶室评审',
            description: '样车试制完成后进入驾驶室评审。',
            actorName: '工艺工程师',
            actorUserId: 'user-1',
            nodeCode: 'CAB_REVIEW',
            nodeName: '样车驾驶室评审',
            linkPath: '/projects/project-1/workflow',
            isRead: null,
            sendStatus: null,
            createdAt: '2026-03-19T12:00:00.000Z',
          },
        ]}
      />,
    );

    expect(filterHtml).toContain('全部');
    expect(filterHtml).toContain('流程流转');
    expect(timelineHtml).toContain('样车试制 -&gt; 驾驶室评审');
    expect(timelineHtml).toContain('/projects/project-1/workflow');
  });

  it('renders source badge label', () => {
    const html = renderToStaticMarkup(<ProjectLogSourceBadge sourceType="NOTIFICATION" />);

    expect(html).toContain('通知');
  });
});
