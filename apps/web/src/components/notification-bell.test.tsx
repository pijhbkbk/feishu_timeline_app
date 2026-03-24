import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  NotificationList,
  UnreadCountBadge,
} from './notification-bell';

describe('NotificationBell', () => {
  it('renders unread count badge', () => {
    const html = renderToStaticMarkup(<UnreadCountBadge count={5} />);

    expect(html).toContain('5');
  });

  it('renders notification list and jump link', () => {
    const html = renderToStaticMarkup(
      <NotificationList
        items={[
          {
            id: 'notification-1',
            projectId: 'project-1',
            taskId: 'task-1',
            notificationType: 'REVIEW_PENDING',
            title: '项目A 待评审',
            content: '你有一条待处理评审：驾驶室评审。',
            linkPath: '/projects/project-1/reviews',
            isRead: false,
            readAt: null,
            sendStatus: 'SENT',
            createdAt: '2026-03-19T12:00:00.000Z',
          },
        ]}
        actingId={null}
        onMarkRead={() => undefined}
      />,
    );

    expect(html).toContain('项目A 待评审');
    expect(html).toContain('/projects/project-1/reviews');
    expect(html).toContain('待评审');
  });
});

