import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import type { ColorExitFormInput, ColorExitWorkspaceResponse } from '../lib/color-exits-client';

const state = vi.hoisted(() => ({ values: [] as unknown[], setters: [] as ReturnType<typeof vi.fn>[], onSaved: undefined as (() => void) | undefined }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useState: (initial: unknown) => { const setter = vi.fn(); state.setters.push(setter); return [state.values.length ? state.values.shift() : initial, setter]; }, useEffect: () => undefined };
});
vi.mock('./auth-provider', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../features/m1/record-return', () => ({ M1RecordLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>, M1RecordReturn: () => null }));
vi.mock('../features/color-register/annual-review', () => ({ AnnualReviewPanel: ({ onSaved }: { onSaved?: () => void }) => { state.onSaved = onSaved; return <section>年度复核</section>; } }));
vi.mock('../lib/color-exits-client', async () => ({ ...await vi.importActual<typeof import('../lib/color-exits-client')>('../lib/color-exits-client'), fetchColorExitWorkspace: vi.fn() }));
import { fetchColorExitWorkspace } from '../lib/color-exits-client';
import { ColorExitWorkspace } from './color-exit-workspace';

afterEach(() => vi.unstubAllGlobals());

it('refreshes the saved annual threshold while preserving the unsaved exit form', async () => {
  // Next uses the automatic JSX runtime; this Node transform needs React in legacy children.
  vi.stubGlobal('React', React);
  const workspace: ColorExitWorkspaceResponse = {
    project: { id: 'project-annual', code: 'SYNTH-ANNUAL', name: '合成年度项目', currentNodeCode: 'PROJECT_CLOSED', currentNodeName: '颜色退出', targetDate: null, riskLevel: 'LOW', status: 'IN_PROGRESS', actualEndDate: null },
    currentColor: { id: 'color-annual', code: null, name: '合成年度颜色', status: 'APPROVED', exitFlag: false, exitDate: null },
    activeTask: null, visualDeltaApproved: true, replacementOptions: [], defaultExitThreshold: 100, canCompleteTask: false, completionIssue: null, items: [],
  };
  const form: ColorExitFormInput = { exitDate: '2025-10-19', statisticYear: '2025', annualOutput: '20', finalDecision: '', effectiveDate: '', exitReason: '保留尚未保存的说明', description: '', replacementColorId: '' };
  const render = (value: ColorExitWorkspaceResponse) => {
    state.values = [value, null, null, form, false, false, false, null, null, null];
    state.setters = [];
    return renderToStaticMarkup(<ColorExitWorkspace projectId="project-annual" />);
  };
  expect(render(workspace)).toContain('建议退出');
  const refreshed = { ...workspace, defaultExitThreshold: 20 };
  vi.mocked(fetchColorExitWorkspace).mockResolvedValueOnce(refreshed);
  expect(state.onSaved).toBeTypeOf('function');
  state.onSaved?.();
  await vi.waitFor(() => expect(state.setters[0]).toHaveBeenCalledWith(refreshed));
  expect(fetchColorExitWorkspace).toHaveBeenCalledWith('project-annual');
  expect(state.setters[3]).not.toHaveBeenCalled();
  const html = render(refreshed);
  expect(html).toContain('建议保留');
  expect(html).toContain('保留尚未保存的说明');
});
