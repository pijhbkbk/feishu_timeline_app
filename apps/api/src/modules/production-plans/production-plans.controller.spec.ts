import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { PERMISSION_METADATA_KEY, ROLE_METADATA_KEY } from '../auth/auth.constants';
import { ProductionPlansController } from './production-plans.controller';

describe('ProductionPlansController RBAC metadata', () => {
  it('protects schedule plan write endpoints with production roles', () => {
    const prototype = ProductionPlansController.prototype;

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.createSchedulePlan)).toEqual([
      'production_operator',
      'admin',
      'project_manager',
      'process_engineer',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.confirmSchedulePlan)).toEqual([
      'production_operator',
      'admin',
      'project_manager',
      'process_engineer',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.completeScheduleTask)).toEqual([
      'production_operator',
      'admin',
      'project_manager',
      'process_engineer',
    ]);
  });

  it('requires project read or workflow transition permission on every endpoint', () => {
    const prototype = ProductionPlansController.prototype;

    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getScheduleWorkspace)).toEqual([
      'project.read',
    ]);
    for (const handler of [
      prototype.createSchedulePlan,
      prototype.updateSchedulePlan,
      prototype.confirmSchedulePlan,
      prototype.cancelSchedulePlan,
      prototype.completeScheduleTask,
    ]) {
      expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, handler)).toEqual([
        'workflow.transition',
      ]);
    }
  });
});
