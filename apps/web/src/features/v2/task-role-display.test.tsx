import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, expect, it, vi } from 'vitest';
import { RealTaskDetail } from './real-workspace-page';
import type { R26FlowMapNode } from './real-types';
import type { R26FlowNode } from './types';

vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

it('labels a production node with its business role despite a retained historical department', () => {
  const node = { code: 'FIRST_UNIT_PRODUCTION_PLAN', step: 10, name: '首台生产计划', status: 'NOT_STARTED',
    taskId: null, owner: '负责人待分配', missingMaterials: [] } as unknown as R26FlowNode;
  const rawNode = { taskId: null, primaryDepartment: { name: '旧营销部门' }, collaborators: [], reviewers: [],
    materialProgress: { submitted: 0, required: 0, missing: 0 } } as unknown as R26FlowMapNode;
  const markup = renderToStaticMarkup(<RealTaskDetail node={node} rawNode={rawNode} task={null}
    loading={false} error={null} onClose={() => {}} onComplete={() => {}} />);
  expect(markup).toMatch(/主责角色<\/dt>\s*<dd[^>]*>生产<\/dd>/);
  expect(markup).not.toContain('旧营销部门');
});
