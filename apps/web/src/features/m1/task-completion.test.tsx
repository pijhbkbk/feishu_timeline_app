import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { R26TaskDetail } from '../v2/real-types';
import { M1TaskCompletion } from './task-completion';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams('from=dashboard') }));

const task = { taskId: 'synthetic-numbering', projectId: 'synthetic-color', taskVersion: '2026-10-08T00:00:00.000Z', stepNumber: 5, nodeCode: 'COLOR_NUMBERING' } as R26TaskDetail;

describe('M1 ordinary completion entry', () => {
  it('opens a completion action on the work form instead of linking back to the map', () => {
    const markup = renderToStaticMarkup(<M1TaskCompletion task={task} onUpdated={() => undefined} />);
    expect(markup).toContain('检查工序完成条件');
    expect(markup).toContain('<button');
    expect(markup).not.toContain('href=');
  });
  it('does not send specialized later steps to the ordinary completion endpoint', () => {
    const markup = renderToStaticMarkup(<M1TaskCompletion task={{ ...task, stepNumber: 14, nodeCode: 'COLOR_CONSISTENCY_REVIEW' }} onUpdated={() => undefined} />);
    expect(markup).toBe('');
  });
});
