import { describe, expect, it, vi } from 'vitest';
import { getTrialReworkCompletionIssue } from '../../common/workflow-evidence';
import { PilotProductionsService } from './pilot-productions.service';

const task = { id: 'trial-round-2', projectId: 'project-1', workflowInstanceId: 'flow-1',
  nodeCode: 'TRIAL_PRODUCTION', nodeName: '样车试制', payload: { supersedesTaskId: 'trial-round-1' } };

function fixture(fresh: boolean, payload: typeof task.payload | null = task.payload) {
  const old = { id: 'old-trial', status: 'PASSED', result: 'PASS', _count: { issues: 0 } };
  const currentTask = { ...task, payload };
  const db = {
    workflowTask: { findFirst: vi.fn().mockResolvedValue({ nodeCode: 'TRIAL_PRODUCTION' }) },
    $queryRaw: vi.fn().mockResolvedValue(fresh ? [{ evidenceId: 'new-trial', invalidType: false }] : []),
    productionPlan: { findMany: vi.fn().mockResolvedValue([]) },
    trialProduction: {
      findMany: vi.fn().mockResolvedValue([old]),
      findFirst: vi.fn().mockImplementation(async ({ where }) =>
        where.id.in.includes('new-trial') ? { id: 'new-trial' } : null),
    },
  };
  const service = new PilotProductionsService(db as never, {} as never, {} as never,
    { assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }) } as never);
  const internals = service as unknown as {
    getProjectOrThrow: () => Promise<unknown>;
    getActiveTask: (_db: unknown, _project: string, node: string) => Promise<unknown>;
    hasCompletedWorkflowTask: () => Promise<boolean>;
    toProjectSummary: (project: unknown) => unknown;
    toWorkflowTaskSummary: (value: unknown) => unknown;
    toTrialProductionWorkspaceSummary: (value: unknown) => unknown;
  };
  vi.spyOn(internals, 'getProjectOrThrow').mockResolvedValue({ id: 'project-1' });
  vi.spyOn(internals, 'getActiveTask').mockImplementation(async (_db, _project, node) => node === 'TRIAL_PRODUCTION' ? currentTask : null);
  vi.spyOn(internals, 'hasCompletedWorkflowTask').mockResolvedValue(true);
  vi.spyOn(internals, 'toProjectSummary').mockImplementation(value => value);
  vi.spyOn(internals, 'toWorkflowTaskSummary').mockImplementation(value => value);
  vi.spyOn(internals, 'toTrialProductionWorkspaceSummary').mockImplementation(value => value);
  return { service, db, currentTask };
}

describe('trial production rework preview', () => {
  it('keeps old results visible but blocks completion until this task owns valid evidence', async () => {
    const { service, db, currentTask } = fixture(false);
    const workspace = await service.getTrialProductionWorkspace('project-1', {} as never);
    expect(workspace.items).toHaveLength(1);
    expect(workspace.canCompleteTask).toBe(false);
    expect(workspace.completionIssue).toContain('旧轮次结果需复核');
    expect(workspace.completionIssue).toBe(await getTrialReworkCompletionIssue(db as never, currentTask));
    expect(db.trialProduction.findFirst).toHaveBeenCalledWith({ where: {
      projectId: 'project-1', id: { in: [] }, status: { in: ['PASSED', 'FAILED'] }, result: { not: null },
    }, select: { id: true } });
  });

  it('allows a completed record owned by the reopened task', async () => {
    const { service, db } = fixture(true);
    const workspace = await service.getTrialProductionWorkspace('project-1', {} as never);
    expect(workspace.canCompleteTask).toBe(true);
    expect(workspace.completionIssue).toBeNull();
    expect(db.trialProduction.findFirst.mock.calls[0]?.[0].where.id).toEqual({ in: ['new-trial'] });
  });

  it('preserves ordinary first-round completion without requiring rework audits', async () => {
    const { service, db } = fixture(false, null);
    expect((await service.getTrialProductionWorkspace('project-1', {} as never)).canCompleteTask).toBe(true);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('retains technical-rework ancestor-plan scope even when a trial is task-owned', async () => {
    const { db } = fixture(true);
    db.trialProduction.findFirst.mockResolvedValue(null);
    const issue = await getTrialReworkCompletionIssue(db as never, {
      ...task, payload: { technicalReworkSourceTaskId: 'rejected-task' },
    });
    expect(issue).toContain('旧轮次结果需复核');
    expect(db.trialProduction.findFirst.mock.calls[0]?.[0].where.productionPlan).toEqual({
      planType: 'FIRST_UNIT', id: { in: [] }, status: { in: ['PLANNED', 'IN_PROGRESS', 'COMPLETED'] },
    });
  });
});
