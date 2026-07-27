import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { formatV2ActivitySummary } from './real-ui';

const dashboardSource = readFileSync(
  new URL('./dashboard-page.tsx', import.meta.url),
  'utf8',
);
const flowMapSource = readFileSync(
  new URL('./flow-map.tsx', import.meta.url),
  'utf8',
);
const projectsSource = readFileSync(
  new URL('./projects-page.tsx', import.meta.url),
  'utf8',
);
const workspaceSource = readFileSync(
  new URL('./real-workspace-page.tsx', import.meta.url),
  'utf8',
);
const stylesSource = readFileSync(
  new URL('../../styles/r26-v2.css', import.meta.url),
  'utf8',
);

describe('R26 Gate 2 real-data consistency contracts', () => {
  it('keeps the project list focused on data and actions without explanatory hero copy', () => {
    expect(projectsSource).not.toContain('哪些项目需要介入？');
    expect(projectsSource).not.toContain(
      '先识别停滞、逾期和评审风险，再进入真实项目工作区。',
    );
    expect(projectsSource).toContain('data-testid="create-project-button"');
  });

  it('places the project-opening action inside the card content as a prominent primary control', () => {
    expect(projectsSource).toContain('className="r26-project-card__header"');
    expect(projectsSource).toContain('className="r26-project-card__open"');
    expect(projectsSource).toContain('打开项目');
    expect(projectsSource).not.toMatch(
      /className="r26-project-card__action"[\s\S]{0,500}<Link[^>]*>\s*打开项目/,
    );
    expect(stylesSource).toMatch(
      /\.r26-project-card__open\s*\{[\s\S]*?min-width:\s*168px;[\s\S]*?min-height:\s*54px;[\s\S]*?background:\s*var\(--r26-blue\);/,
    );
    expect(stylesSource).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.r26-project-card__open\s*\{[\s\S]*?width:\s*100%;/,
    );
  });

  it('keeps decision and terminal node copy inside dedicated safe areas', () => {
    expect(flowMapSource).toContain('isTerminal ? 28 : 16');
    expect(flowMapSource).toContain('isDecision ? 50 : isTerminal ? 24 : 20');
    expect(flowMapSource).toContain('isDecision ? 72 : isTerminal ? 46 : 40');
    expect(flowMapSource).toContain('!isTerminal ? (');
    expect(flowMapSource).toContain('isTerminal ? 20 : 26');
    expect(flowMapSource).toContain('node.y + node.height - 12');
    expect(flowMapSource).toContain('node.y + 91');
  });

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

  it('renders monthly progress dynamically and uses only the server suggestion for future owners', () => {
    expect(flowMapSource).toContain('{completedPeriods}/{totalPeriods}');
    expect(flowMapSource).not.toContain('>3/12<');
    expect(workspaceSource).toContain(
      "owner: node.ownerName ?? node.suggestedOwner?.name ?? '负责人待分配'",
    );
    expect(workspaceSource).toContain(
      '服务端建议负责人：${node.owner}',
    );
    expect(flowMapSource).toContain('`尚未生成 · ${node.owner}`');
  });

  it('keeps internal audit action codes out of the project-record copy', () => {
    expect(workspaceSource).toContain('data-record-action={record.action}');
    expect(workspaceSource).toContain('操作人：{record.actorName}');
    expect(workspaceSource).not.toContain(
      '{record.actorName} · {record.action}',
    );
  });

  it('moves the workspace selection to the server-designated next task after completion', () => {
    expect(workspaceSource).toContain(
      'getPrimaryCompletionTask(\n        response.command.createdTasks',
    );
    expect(workspaceSource).toContain(
      'focusCreatedTask(nextTask, false)',
    );
    expect(workspaceSource).toContain(
      '页面已自动切换到“{primaryTask.stepName}”',
    );
  });

  it('localizes legacy material codes and hides unknown internal codes', () => {
    expect(
      formatV2ActivitySummary(
        '替换工序材料 WORK_EVIDENCE，生成 V2',
        '项目动态已更新',
      ),
    ).toBe('替换工序材料 工作证明材料，生成 V2');
    expect(
      formatV2ActivitySummary(
        '材料状态 INTERNAL_MATERIAL_CODE 已更新',
        '项目动态已更新',
      ),
    ).toBe('项目动态已更新');
  });
});
