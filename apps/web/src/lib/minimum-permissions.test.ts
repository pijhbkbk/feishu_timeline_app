import { describe, expect, it } from 'vitest';

import type { FrontendRoleCode, SessionUser } from './auth-client';
import { canManageColorExit } from './color-exits-client';
import { canManageFees } from './fees-client';
import { canManageCabinReviews } from './reviews-client';
import { canUserOperateWorkflowTask, type WorkflowTaskSummary } from './workflows-client';

function user(id: string, roleCode: FrontendRoleCode): SessionUser {
  return {
    id,
    username: id,
    name: id,
    email: null,
    departmentId: 'dept-1',
    departmentName: '部门',
    isSystemAdmin: roleCode === 'admin',
    authSource: 'mock',
    roleCodes: [roleCode],
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

describe('plan A minimum permissions in the UI', () => {
  it('shows ordinary workflow actions only to the assignee or project manager', () => {
    const ordinaryTask = task('PAINT_DEVELOPMENT', 'owner-1');

    expect(canUserOperateWorkflowTask(user('owner-1', 'process_engineer'), ordinaryTask)).toBe(
      true,
    );
    expect(canUserOperateWorkflowTask(user('manager-1', 'project_manager'), ordinaryTask)).toBe(
      true,
    );
    expect(canUserOperateWorkflowTask(user('admin-1', 'admin'), ordinaryTask)).toBe(false);
    expect(canUserOperateWorkflowTask(user('other-1', 'process_engineer'), ordinaryTask)).toBe(
      false,
    );
  });

  it('uses finance/admin for step 13 and project manager/admin for step 18', () => {
    const feeTask = task('DEVELOPMENT_ACCEPTANCE', 'manager-1');
    const exitTask = task('PROJECT_CLOSED', 'process-1');

    expect(canUserOperateWorkflowTask(user('finance-1', 'finance'), feeTask)).toBe(true);
    expect(canUserOperateWorkflowTask(user('manager-1', 'project_manager'), feeTask)).toBe(false);
    expect(canUserOperateWorkflowTask(user('admin-1', 'admin'), exitTask)).toBe(true);
    expect(canUserOperateWorkflowTask(user('process-1', 'process_engineer'), exitTask)).toBe(false);
    expect(canManageFees(user('manager-1', 'project_manager'))).toBe(false);
    expect(canManageFees(user('finance-1', 'finance'))).toBe(true);
    expect(canManageColorExit(user('process-1', 'process_engineer'))).toBe(false);
    expect(canManageColorExit(user('manager-1', 'project_manager'))).toBe(true);
  });

  it('shows review record actions only to the designated reviewer or project manager', () => {
    expect(canManageCabinReviews(user('reviewer-1', 'reviewer'), 'reviewer-1')).toBe(true);
    expect(canManageCabinReviews(user('reviewer-2', 'reviewer'), 'reviewer-1')).toBe(false);
    expect(canManageCabinReviews(user('manager-1', 'project_manager'), 'reviewer-1')).toBe(true);
    expect(canManageCabinReviews(user('admin-1', 'admin'), 'reviewer-1')).toBe(false);
  });

  it('keeps designated reviewers on the review-record path instead of generic task actions', () => {
    const reviewTask = task('CAB_REVIEW', 'reviewer-1');

    expect(canUserOperateWorkflowTask(user('reviewer-1', 'reviewer'), reviewTask)).toBe(false);
    expect(canUserOperateWorkflowTask(user('manager-1', 'project_manager'), reviewTask)).toBe(
      true,
    );
  });
});
