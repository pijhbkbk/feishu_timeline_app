import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const context = vi.hoisted(() => ({ review: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams({ review: context.review }) }));

import { AuthProvider } from './auth-provider';
import { ProjectReviewsWorkspace } from './project-reviews-workspace';

describe('ProjectReviewsWorkspace', () => {
  it.each([
    ['', '正在加载驾驶室评审模块'],
    ['consistency', '正在加载一致性评审模块'],
    ['legacy-monthly', '正在加载月度评审台账'],
    ['https://invalid.example', '正在加载驾驶室评审模块'],
  ])('opens only the selected review category: %s', (review, loading) => {
    context.review = review;
    const html = renderToStaticMarkup(
      <AuthProvider>
        <ProjectReviewsWorkspace projectId="project-1" />
      </AuthProvider>,
    );

    expect(html).toContain(loading);
    expect(html).toContain('aria-label="评审类别"');
    expect(html).toContain('历史月度评审');
    for (const other of ['正在加载驾驶室评审模块', '正在加载一致性评审模块', '正在加载月度评审台账']) {
      if (other !== loading) expect(html).not.toContain(other);
    }
  });
});
