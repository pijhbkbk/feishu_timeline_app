import { describe, expect, it } from 'vitest';
import type { SessionUser } from './auth-client';
import { canManagePilotProductions } from './pilot-productions-client';
import { canManageSchedulePlans } from './production-plans-client';
import { canManageMassProductions } from './mass-production-client';
import { canUserOperateWorkflowTask, type WorkflowTaskSummary } from './workflows-client';

const user = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: 'member', username: 'synthetic', name: '合成', email: null,
  departmentId: null, departmentName: null, isSystemAdmin: false,
  authSource: 'local', teamAccessApproved: true, roleCodes: [], ...overrides,
});
const task = (nodeCode: WorkflowTaskSummary['nodeCode'], assigneeUserId = 'member') =>
  ({ nodeCode, assigneeUserId, isActive: true, status: 'READY' } as WorkflowTaskSummary);

describe('single-department production entry points', () => {
  it('lets approved members use all production forms without fixed roles', () => {
    expect(canManagePilotProductions(user())).toBe(true);
    expect(canManagePilotProductions(user(), 'FIRST_UNIT_PRODUCTION_PLAN')).toBe(true);
    expect(canManagePilotProductions(user(), 'TRIAL_PRODUCTION')).toBe(true);
    expect(canManageSchedulePlans(user())).toBe(true);
    expect(canManageMassProductions(user())).toBe(true);
    const pending = user({ teamAccessApproved: false, roleCodes: ['production_operator', 'process_engineer'] });
    expect(canManagePilotProductions(pending)).toBe(false);
    expect(canManageSchedulePlans(pending)).toBe(false);
    expect(canManageMassProductions(pending)).toBe(false);
  });

  it('keeps active-node and task-state restrictions for every member', () => {
    expect(canUserOperateWorkflowTask(user(), task('CAB_REVIEW'))).toBe(true);
    expect(canUserOperateWorkflowTask(user(), task('VISUAL_COLOR_DIFFERENCE_REVIEW'))).toBe(true);
    expect(canUserOperateWorkflowTask(user(), task('MASS_PRODUCTION', 'another-member'))).toBe(true);
    expect(canUserOperateWorkflowTask(user(), { ...task('MASS_PRODUCTION'), isActive: false })).toBe(false);
    for (const status of ['PENDING', 'READY', 'IN_PROGRESS', 'RETURNED'] as const) {
      expect(canUserOperateWorkflowTask(user(), { ...task('MASS_PRODUCTION'), status })).toBe(true);
    }
    for (const status of ['COMPLETED', 'CANCELLED', 'APPROVED', 'REJECTED'] as const) {
      expect(canUserOperateWorkflowTask(user(), { ...task('MASS_PRODUCTION'), status })).toBe(false);
      expect(canUserOperateWorkflowTask(user({ isSystemAdmin: true }), { ...task('MASS_PRODUCTION'), status })).toBe(false);
    }
  });
});
