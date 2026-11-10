import { WorkflowNodeCode, WorkflowTaskStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { ReviewsService } from './reviews.service';

const projectId = 'history-display-project';
const actor = { id: 'member' } as never;
const timestamp = new Date('2026-10-25T00:00:00Z');

function task(nodeCode: WorkflowNodeCode, workflowInstanceId: string, active = false, round = 1) {
  return {
    id: `${workflowInstanceId}-${nodeCode}-${round}`, projectId, workflowInstanceId,
    nodeCode, nodeName: nodeCode, taskNo: 'synthetic', taskRound: round,
    status: active ? WorkflowTaskStatus.READY : WorkflowTaskStatus.COMPLETED,
    isPrimary: true, isActive: active, assigneeUserId: null, assigneeUser: null,
    assigneeDepartmentId: null, assigneeDepartment: null, dueAt: null, startedAt: null,
    completedAt: active ? null : timestamp, returnedAt: null, payload: {},
    createdAt: timestamp, updatedAt: timestamp,
  };
}

type Task = ReturnType<typeof task>;
type Workflow = { id: string; versionNo: number; status: string };

describe.each([
  ['cabin', WorkflowNodeCode.CAB_REVIEW, WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW],
  ['consistency', WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW, WorkflowNodeCode.MASS_PRODUCTION_PLAN],
] as const)('%s historical workspace', (kind, ownNode, downstreamNode) => {
  function fixture(tasks: Task[], workflows: Workflow[]) {
    const workflowTask = { findFirst: vi.fn(async ({ where }: { where: {
      projectId: string; nodeCode: WorkflowNodeCode; isActive?: boolean;
      workflowInstanceId?: string; status?: unknown;
    } }) => {
      expect(where.projectId).toBe(projectId);
      if (where.status) return null; // The preceding gate is separate from display history.
      return tasks.filter((row) => row.nodeCode === where.nodeCode &&
        (where.isActive === undefined || row.isActive === where.isActive) &&
        (where.workflowInstanceId === undefined || row.workflowInstanceId === where.workflowInstanceId))
        .sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.taskRound - a.taskRound)[0] ?? null;
    }) };
    const workflowInstance = { findFirst: vi.fn(async ({ where }: { where: {
      projectId: string; status?: string;
    } }) => {
      expect(where.projectId).toBe(projectId);
      return workflows.filter((row) => !where.status || row.status === where.status)
        .sort((a, b) => b.versionNo - a.versionNo)[0] ?? null;
    }) };
    const db = {
      project: { findUnique: vi.fn().mockResolvedValue({ id: projectId, code: 'SYN',
        name: 'Synthetic', priority: 'MEDIUM', currentNodeCode: WorkflowNodeCode.PROJECT_CLOSED,
        plannedEndDate: null }) },
      workflowTask, workflowInstance,
      trialProduction: { findFirst: vi.fn().mockResolvedValue(null) },
      reviewRecord: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const access = { assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: projectId }) };
    const service = new ReviewsService(db as never, {} as never, {} as never, {} as never, access as never);
    const read = async () => {
      const workspace = kind === 'cabin'
        ? await service.getCabinReviewWorkspace(projectId, actor)
        : await service.getConsistencyReviewWorkspace(projectId, actor);
      return { ...workspace, displayDownstreamTask: 'displayDownstreamTasks' in workspace
        ? workspace.displayDownstreamTasks.consistencyReview : workspace.displayDownstreamTask };
    };
    return { read, workflowTask, workflowInstance };
  }

  it('reports completed nodes without restoring active tasks or actions', async () => {
    const own = task(ownNode, 'w1');
    const next = task(downstreamNode, 'w1');
    const fee = task(WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE, 'w1');
    const { read } = fixture([own, next, fee], [{ id: 'w1', versionNo: 1, status: 'RUNNING' }]);
    expect(await read()).toMatchObject({ activeTask: null,
      displayTask: { id: own.id, status: 'COMPLETED', availableActions: [] },
      displayDownstreamTask: { id: next.id, status: 'COMPLETED', availableActions: [] } });
    if (kind === 'cabin') expect(await read()).toMatchObject({
      downstreamTasks: { developmentFee: null, consistencyReview: null },
      displayDownstreamTasks: { developmentFee: { id: fee.id, status: 'COMPLETED', availableActions: [] } },
    });
  });

  it('does not borrow completed nodes from an older workflow when the running one has none', async () => {
    const { read, workflowTask } = fixture([task(ownNode, 'w1'), task(downstreamNode, 'w1')], [
      { id: 'w1', versionNo: 1, status: 'COMPLETED' }, { id: 'w2', versionNo: 2, status: 'RUNNING' },
    ]);
    expect(await read()).toMatchObject({ activeTask: null, displayTask: null,
      displayDownstreamTask: null });
    const displayQueries = workflowTask.findFirst.mock.calls.filter(([arg]) => 'workflowInstanceId' in arg.where);
    expect(displayQueries).toHaveLength(kind === 'cabin' ? 3 : 2);
    expect(displayQueries.every(([arg]) => arg.where.workflowInstanceId === 'w2')).toBe(true);
  });

  it('keeps the active rework round and scopes the downstream display to its workflow', async () => {
    const current = task(ownNode, 'w1', true, 2);
    const { read, workflowInstance } = fixture([task(ownNode, 'w1'), current,
      task(downstreamNode, 'w1'), task(downstreamNode, 'w2', false, 3)], [
      { id: 'w2', versionNo: 2, status: 'RUNNING' },
    ]);
    expect(await read()).toMatchObject({ activeTask: { id: current.id },
      displayTask: { id: current.id, status: 'READY' },
      displayDownstreamTask: { id: `w1-${downstreamNode}-1` } });
    expect(workflowInstance.findFirst).not.toHaveBeenCalled();
  });

  it('uses the latest workflow only when none is running', async () => {
    const latest = task(ownNode, 'w2');
    const { read } = fixture([task(ownNode, 'w1'), latest], [
      { id: 'w1', versionNo: 1, status: 'COMPLETED' }, { id: 'w2', versionNo: 2, status: 'COMPLETED' },
    ]);
    expect(await read()).toMatchObject({ displayTask: { id: latest.id }, activeTask: null });
  });

  it('has no display history query when no workflow exists', async () => {
    const { read, workflowTask } = fixture([], []);
    expect(await read()).toMatchObject({ displayTask: null, displayDownstreamTask: null });
    expect(workflowTask.findFirst.mock.calls.some(([arg]) => 'workflowInstanceId' in arg.where)).toBe(false);
  });
});
