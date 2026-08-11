import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { PERMISSION_METADATA_KEY, ROLE_METADATA_KEY } from '../auth/auth.constants';
import { MassProductionsController } from './mass-productions.controller';

describe('MassProductionsController RBAC metadata', () => {
  it('protects mass production write endpoints with production roles', () => {
    const prototype = MassProductionsController.prototype;

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.createRecord)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.startRecord)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.completeTask)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
    ]);
  });

  it('requires project read or workflow transition permission on every endpoint', () => {
    const prototype = MassProductionsController.prototype;

    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getWorkspace)).toEqual([
      'project.read',
    ]);
    for (const handler of [
      prototype.createRecord,
      prototype.updateRecord,
      prototype.startRecord,
      prototype.completeRecord,
      prototype.cancelRecord,
      prototype.completeTask,
    ]) {
      expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, handler)).toEqual([
        'workflow.transition',
      ]);
    }
  });
});
