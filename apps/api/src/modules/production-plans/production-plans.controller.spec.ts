import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ROLE_METADATA_KEY } from '../auth/auth.constants';
import { ProductionPlansController } from './production-plans.controller';

describe('ProductionPlansController RBAC metadata', () => {
  it('protects schedule plan write endpoints with production roles', () => {
    const prototype = ProductionPlansController.prototype;

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.createSchedulePlan)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.confirmSchedulePlan)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.completeScheduleTask)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
    ]);
  });
});
