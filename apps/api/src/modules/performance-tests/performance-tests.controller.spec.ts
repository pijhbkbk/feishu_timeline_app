import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ROLE_METADATA_KEY } from '../auth/auth.constants';
import { PerformanceTestsController } from './performance-tests.controller';

describe('PerformanceTestsController RBAC metadata', () => {
  it('protects performance test endpoints with quality and process roles', () => {
    const prototype = PerformanceTestsController.prototype;

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.getWorkspace)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
      'quality_engineer',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.submitTest)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
      'quality_engineer',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.completeTask)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
      'quality_engineer',
    ]);
  });
});
