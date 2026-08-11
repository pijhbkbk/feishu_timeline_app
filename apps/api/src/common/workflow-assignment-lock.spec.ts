import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { WorkflowNodeCode } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { lockWorkflowAssignmentMutations } from './workflow-assignment-lock';

const adminSource = readFileSync(
  join(
    __dirname,
    '../modules/admin/admin-control-center.service.ts',
  ),
  'utf8',
);
const workflowsSource = readFileSync(
  join(__dirname, '../modules/workflows/workflows.service.ts'),
  'utf8',
);
const ordinaryCompletionSource = readFileSync(
  join(
    __dirname,
    '../modules/r26-read-model/r26-ordinary-completion.service.ts',
  ),
  'utf8',
);
const memberAssignmentSource = readFileSync(
  join(
    __dirname,
    '../modules/r26-read-model/r26-member-assignment.service.ts',
  ),
  'utf8',
);

describe('workflow assignment mutation coordination', () => {
  it('locks unique project/node targets in stable order', async () => {
    const queries: Array<{ values?: unknown[] }> = [];
    const tx = {
      $queryRaw: vi.fn(async (query: { values?: unknown[] }) => {
        queries.push(query);
        return [{ locked: true }];
      }),
    };

    await lockWorkflowAssignmentMutations(
      tx as never,
      'project-1',
      [
        WorkflowNodeCode.PAINT_PROCUREMENT,
        WorkflowNodeCode.COLOR_NUMBERING,
        WorkflowNodeCode.PAINT_PROCUREMENT,
      ],
    );

    expect(queries).toHaveLength(2);
    expect(queries.map((query) => query.values)).toEqual([
      [
        'feishu-timeline:workflow-assignment-mutation:v1',
        'project-1:COLOR_NUMBERING',
      ],
      [
        'feishu-timeline:workflow-assignment-mutation:v1',
        'project-1:PAINT_PROCUREMENT',
      ],
    ]);
  });

  it('uses the same advisory coordination point before admin task and project claims', () => {
    const body = methodBody(
      adminSource,
      'changeNodeAssignment',
      'getPermissions',
    );
    const advisoryIndex = body.indexOf('lockWorkflowAssignmentMutations');
    expect(advisoryIndex).toBeGreaterThanOrEqual(0);
    expect(advisoryIndex).toBeLessThan(
      body.indexOf('lockAdminNodeAssignmentTask'),
    );
    expect(advisoryIndex).toBeLessThan(body.indexOf('project.updateMany'));
    expect(body.indexOf('lockWorkflowAssignmentMutations')).toBeLessThan(
      body.indexOf("input.scope === 'FUTURE_ONLY'"),
    );
  });

  it('coordinates the admin single-task writer before previewing or claiming its task', () => {
    const body = methodBody(
      adminSource,
      'changeAssignment',
      'previewBatchTaskChanges',
    );
    const advisoryIndex = body.indexOf('lockWorkflowAssignmentMutations');
    expect(advisoryIndex).toBeGreaterThanOrEqual(0);
    expect(advisoryIndex).toBeLessThan(
      body.indexOf('buildAssignmentPreview'),
    );
    expect(advisoryIndex).toBeLessThan(
      body.indexOf('claimAdminWorkflowTaskMutation'),
    );
    expect(advisoryIndex).toBeLessThan(
      body.indexOf('projectNodeAssignment.upsert'),
    );
  });

  it('coordinates every admin batch project/node target before preview and mutation', () => {
    const body = methodBody(
      adminSource,
      'applyBatchTaskChanges',
      'getTaskScheduleImportTemplate',
    );
    const advisoryIndex = body.indexOf('lockWorkflowAssignmentTargets');
    expect(advisoryIndex).toBeGreaterThanOrEqual(0);
    expect(body).toContain('workflowTask.findMany');
    expect(advisoryIndex).toBeLessThan(body.indexOf('buildAssignmentPreview'));
    expect(advisoryIndex).toBeLessThan(
      body.indexOf('claimAdminWorkflowTaskMutation'),
    );
    expect(advisoryIndex).toBeLessThan(
      body.indexOf('projectNodeAssignment.upsert'),
    );
  });

  it('coordinates every R26 versioned member/assignment command before its project claim', () => {
    const body = methodBody(
      memberAssignmentSource,
      'executeVersionedCommand',
      'assertCanManage',
    );
    const advisoryIndex = body.indexOf('lockWorkflowAssignmentMutations');
    expect(advisoryIndex).toBeGreaterThanOrEqual(0);
    expect(body).toContain('Object.values(WorkflowNodeCode)');
    expect(advisoryIndex).toBeLessThan(body.indexOf('project.updateMany'));
  });

  it('coordinates every next-task target before claiming the source task', () => {
    const body = methodBody(
      workflowsSource,
      'transitionTaskWithExecutor',
      'getCurrentNodeName',
    );
    const advisoryIndex = body.indexOf('lockWorkflowAssignmentMutations');
    const taskClaimIndex = body.indexOf('updateTaskForTransition', advisoryIndex);
    expect(advisoryIndex).toBeGreaterThanOrEqual(0);
    expect(body).toContain('nextTemplates.map((template) => template.nodeCode)');
    expect(advisoryIndex).toBeLessThan(taskClaimIndex);
    expect(advisoryIndex).toBeLessThan(body.indexOf('createNextTasks'));
  });

  it('locks the initial node before reading its configured assignment', () => {
    const body = methodBody(
      workflowsSource,
      'initializeProjectWorkflow',
      'getWorkflowByProject',
    );
    expect(body.indexOf('lockWorkflowAssignmentMutations')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('lockWorkflowAssignmentMutations')).toBeLessThan(
      body.indexOf('projectNodeAssignment.findUnique'),
    );
    expect(body.indexOf('lockWorkflowAssignmentMutations')).toBeLessThan(
      body.indexOf('workflowTask.create'),
    );
  });

  it('locks R26 next-task assignments before recomputing the trusted preview', () => {
    const body = methodBody(
      ordinaryCompletionSource,
      'completeTask',
      'resolveBlocker',
    );
    const advisoryIndex = body.indexOf('lockWorkflowAssignmentMutations');
    const previewIndex = body.indexOf('buildCompletionPreview', advisoryIndex);
    expect(advisoryIndex).toBeGreaterThanOrEqual(0);
    expect(body).toContain('nextTemplates.map((template) => template.nodeCode)');
    expect(advisoryIndex).toBeLessThan(previewIndex);
    expect(advisoryIndex).toBeLessThan(
      body.indexOf('transitionTaskWithExecutor', advisoryIndex),
    );
  });
});

function methodBody(source: string, method: string, nextMethod: string) {
  const start = source.indexOf(`  async ${method}(`) >= 0
    ? source.indexOf(`  async ${method}(`)
    : source.indexOf(`  private async ${method}`);
  const asyncNext = source.indexOf(`  async ${nextMethod}(`, start + 1);
  const privateNext = source.indexOf(
    `  private async ${nextMethod}(`,
    start + 1,
  );
  const candidates = [asyncNext, privateNext].filter((index) => index > start);
  const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}
