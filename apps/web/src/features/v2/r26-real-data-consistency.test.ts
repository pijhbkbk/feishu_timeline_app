import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const dashboardSource = readFileSync(
  new URL('./dashboard-page.tsx', import.meta.url),
  'utf8',
);
const flowMapSource = readFileSync(
  new URL('./flow-map.tsx', import.meta.url),
  'utf8',
);
const workspaceSource = readFileSync(
  new URL('./real-workspace-page.tsx', import.meta.url),
  'utf8',
);

describe('R26 Gate 2 real-data consistency contracts', () => {
  it('uses the current task assignment instead of the signed-in viewer as responsibility', () => {
    expect(dashboardSource).toContain('currentTask.assigneeUserName');
    expect(dashboardSource).toContain('currentTask.assigneeDepartmentName');
    expect(dashboardSource).not.toContain('viewer.departmentName ?? currentTask');
  });

  it('renders the workspace progress and review round from the API response', () => {
    expect(workspaceSource).toContain('workspace.flowMap.progressText');
    expect(flowMapSource).toContain('node.round || 1');
    expect(flowMapSource).not.toContain('第 2 轮 · 待结论');
  });

  it('renders monthly progress dynamically and keeps ungenerated nodes unassigned', () => {
    expect(flowMapSource).toContain('{completedPeriods}/{totalPeriods}');
    expect(flowMapSource).not.toContain('>3/12<');
    expect(workspaceSource).toContain(
      "owner: hasTask ? node.ownerName ?? '负责人待分配' : '负责人待分配'",
    );
    expect(workspaceSource).toContain(
      "return '该工序尚未生成，负责人保持待分配。';",
    );
  });
});
