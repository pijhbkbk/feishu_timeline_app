import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from './auth-provider';
import { ProjectReviewsWorkspace } from './project-reviews-workspace';

describe('ProjectReviewsWorkspace', () => {
  it('renders cabin, consistency and monthly review panels', () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <ProjectReviewsWorkspace projectId="project-1" />
      </AuthProvider>,
    );

    expect(html).toContain('正在加载驾驶室评审模块');
    expect(html).toContain('正在加载一致性评审模块');
    expect(html).toContain('正在加载月度评审台账');
  });
});
