import { describe, expect, it } from 'vitest';
import type { SessionUser, FrontendRoleCode } from './auth-client';
import { canManagePilotProductions } from './pilot-productions-client';
import { canManageSchedulePlans } from './production-plans-client';
import { canManageMassProductions } from './mass-production-client';
import { canUserOperateWorkflowTask, type WorkflowTaskSummary } from './workflows-client';
const user = (role: FrontendRoleCode): SessionUser => ({ id: 'owner', username: 'synthetic', name: '合成', email: null, departmentId: null, departmentName: null, isSystemAdmin: role === 'admin', authSource: 'local', roleCodes: [role] });
const task = (nodeCode: WorkflowTaskSummary['nodeCode'], assigneeUserId = 'owner') => ({ nodeCode, assigneeUserId, isActive: true, status: 'READY' } as WorkflowTaskSummary);
describe('fixed production and review role entry points', () => {
  it('lets the pure production role access all production forms', () => {
    expect(canManagePilotProductions(user('production_operator'))).toBe(true);
    expect(canManageSchedulePlans(user('production_operator'))).toBe(true);
    expect(canManageMassProductions(user('production_operator'))).toBe(true);
  });
  it('requires the fixed role and current ownership, including reviewers', () => {
    expect(canUserOperateWorkflowTask(user('reviewer'), task('CAB_REVIEW'))).toBe(true);
    expect(canUserOperateWorkflowTask(user('quality_engineer'), task('VISUAL_COLOR_DIFFERENCE_REVIEW'))).toBe(true);
    expect(canUserOperateWorkflowTask(user('project_manager'), task('MASS_PRODUCTION'))).toBe(false);
    expect(canUserOperateWorkflowTask(user('admin'), task('DEVELOPMENT_ACCEPTANCE'))).toBe(false);
    expect(canUserOperateWorkflowTask(user('production_operator'), task('MASS_PRODUCTION', 'someone-else'))).toBe(false);
    expect(canUserOperateWorkflowTask(user('production_operator'), { ...task('MASS_PRODUCTION'), isActive: false })).toBe(false);
    expect(canUserOperateWorkflowTask(user('production_operator'), { ...task('MASS_PRODUCTION'), status: 'RETURNED' })).toBe(true);
  });
});
