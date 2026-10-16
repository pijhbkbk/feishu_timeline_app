import { describe, expect, it } from 'vitest';

import { isApprovedTeamUser, type SessionUser } from './auth-client';
import { canManageProjectAttachments } from './attachments-client';
import { canManageColorExit } from './color-exits-client';
import { canManageConsistencyReviews } from './consistency-reviews-client';
import { canManageFees } from './fees-client';
import { canManageMassProductions } from './mass-production-client';
import { canManagePaintProcurement } from './paint-procurements-client';
import { canManagePerformanceTests } from './performance-tests-client';
import { canManagePilotProductions } from './pilot-productions-client';
import { canManageSchedulePlans } from './production-plans-client';
import { canManageCabinReviews } from './reviews-client';
import { canManageStandardBoards } from './standard-boards-client';
import { canManageVisualDeltaReviews } from './visual-delta-reviews-client';
import { canUserOperateWorkflowTask, type WorkflowTaskSummary } from './workflows-client';

function user(id: string, overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id,
    username: id,
    name: id,
    email: null,
    departmentId: 'dept-1',
    departmentName: '部门',
    isSystemAdmin: false,
    teamAccessApproved: true,
    authSource: 'local',
    roleCodes: [],
    ...overrides,
  };
}

function task(
  nodeCode: WorkflowTaskSummary['nodeCode'],
  assigneeUserId: string | null,
): WorkflowTaskSummary {
  return {
    id: 'task-1',
    taskNo: 'TASK-1',
    nodeCode,
    nodeName: nodeCode,
    taskRound: 1,
    status: 'READY',
    isPrimary: true,
    isActive: true,
    assigneeUserId,
    assigneeUserName: null,
    assigneeDepartmentId: null,
    assigneeDepartmentName: null,
    dueAt: null,
    startedAt: null,
    completedAt: null,
    returnedAt: null,
    payload: null,
    availableActions: ['START'],
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  };
}

const businessManagers = [
  ['attachments', canManageProjectAttachments],
  ['color exit', canManageColorExit],
  ['fees', canManageFees],
  ['mass production', canManageMassProductions],
  ['paint procurement', canManagePaintProcurement],
  ['performance tests', canManagePerformanceTests],
  ['pilot production', canManagePilotProductions],
  ['schedule plans', canManageSchedulePlans],
  ['standard boards', canManageStandardBoards],
  ['cabin review', canManageCabinReviews],
  ['visual delta review', canManageVisualDeltaReviews],
  ['consistency review', canManageConsistencyReviews],
] as const;

describe('single-department business access in the UI', () => {
  it('requires a local approved team identity without inferring approval from roles', () => {
    expect(isApprovedTeamUser(user('member'))).toBe(true);
    expect(isApprovedTeamUser(user('admin', { isSystemAdmin: true, teamAccessApproved: false }))).toBe(true);
    expect(isApprovedTeamUser(null)).toBe(false);
    expect(isApprovedTeamUser(undefined)).toBe(false);
    expect(isApprovedTeamUser(user('legacy-admin', { teamAccessApproved: false, roleCodes: ['admin'] }))).toBe(false);
    const pending = user('pending');
    delete pending.teamAccessApproved;
    expect(isApprovedTeamUser(pending)).toBe(false);
    expect(isApprovedTeamUser(user('mock', { authSource: 'mock', isSystemAdmin: true }))).toBe(false);
    expect(isApprovedTeamUser(user('feishu', { authSource: 'feishu', isSystemAdmin: true }))).toBe(false);
  });

  it.each(businessManagers)('%s uses the same approved-team boundary', (_name, canManage) => {
    expect(canManage(user('member'))).toBe(true);
    expect(canManage(user('admin', { isSystemAdmin: true, teamAccessApproved: false }))).toBe(true);
    expect(canManage(null)).toBe(false);
    expect(canManage(user('pending', {
      teamAccessApproved: false,
      roleCodes: ['admin', 'project_manager', 'process_engineer', 'quality_engineer', 'purchaser', 'production_operator', 'reviewer', 'finance'],
    }))).toBe(false);
    expect(canManage(user('mock', { authSource: 'mock', isSystemAdmin: true }))).toBe(false);
    expect(canManage(user('feishu', { authSource: 'feishu' }))).toBe(false);
  });

  it('allows approved team members to operate active ordinary nodes regardless of old assignee or role', () => {
    const ordinaryTask = task('PAINT_DEVELOPMENT', 'owner-1');
    expect(canUserOperateWorkflowTask(user('owner-1'), ordinaryTask)).toBe(true);
    expect(canUserOperateWorkflowTask(user('member-2'), ordinaryTask)).toBe(true);
    expect(canUserOperateWorkflowTask(user('pending', { teamAccessApproved: false, roleCodes: ['process_engineer'] }), ordinaryTask)).toBe(false);
    expect(canUserOperateWorkflowTask(user('mock', { authSource: 'mock', isSystemAdmin: true }), ordinaryTask)).toBe(false);
  });

  it('keeps fee and color-exit work available to approved members without restoring old fixed roles', () => {
    expect(canUserOperateWorkflowTask(user('member'), task('DEVELOPMENT_ACCEPTANCE', 'finance-1'))).toBe(true);
    expect(canUserOperateWorkflowTask(user('member'), task('PROJECT_CLOSED', 'manager-1'))).toBe(true);
    expect(canManageFees(user('pending', { teamAccessApproved: false, roleCodes: ['finance'] }))).toBe(false);
    expect(canManageColorExit(user('pending', { teamAccessApproved: false, roleCodes: ['project_manager'] }))).toBe(false);
  });

  it.each([
    ['cabin', canManageCabinReviews],
    ['visual delta', canManageVisualDeltaReviews],
    ['consistency', canManageConsistencyReviews],
  ] as const)('%s review keeps the designated member signature', (_name, canManage) => {
    expect(canManage(user('reviewer-1'), 'reviewer-1')).toBe(true);
    expect(canManage(user('reviewer-2'), 'reviewer-1')).toBe(false);
    expect(canManage(user('admin', { isSystemAdmin: true }), 'reviewer-1')).toBe(false);
    expect(canManage(user('reviewer-1'), null)).toBe(false);
    expect(canManage(user('reviewer-1', { teamAccessApproved: false, roleCodes: ['reviewer'] }), 'reviewer-1')).toBe(false);
  });
});
