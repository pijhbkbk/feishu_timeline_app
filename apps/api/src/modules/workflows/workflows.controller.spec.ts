import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { PERMISSION_METADATA_KEY, ROLE_METADATA_KEY } from '../auth/auth.constants';
import { WorkflowsController } from './workflows.controller';

describe('WorkflowsController metadata', () => {
  it('protects read endpoints with project.read', () => {
    const prototype = WorkflowsController.prototype;

    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getProjectWorkflow)).toEqual([
      'project.read',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getProjectWorkflowTimeline)).toEqual([
      'project.read',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getMonthlyReviewWorkspace)).toEqual([
      'project.read',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getMonthlyReviewTaskDetail)).toEqual([
      'project.read',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getTaskDetail)).toEqual([
      'project.read',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getTaskHistoryRounds)).toEqual([
      'project.read',
    ]);
  });

  it('protects write endpoints with workflow.transition', () => {
    const prototype = WorkflowsController.prototype;

    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.saveTaskForm)).toEqual([
      'workflow.transition',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.startTask)).toEqual([
      'workflow.transition',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.approveTask)).toEqual([
      'workflow.transition',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.rejectTask)).toEqual([
      'workflow.transition',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.returnTask)).toEqual([
      'workflow.transition',
    ]);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.completeTask)).toEqual([
      'workflow.transition',
    ]);
  });

  it('keeps workflow roles on transition endpoints', () => {
    const prototype = WorkflowsController.prototype;

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.startTask)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
      'quality_engineer',
      'purchaser',
      'reviewer',
      'finance',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.completeTask)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
      'quality_engineer',
      'purchaser',
      'reviewer',
      'finance',
    ]);
  });
});
