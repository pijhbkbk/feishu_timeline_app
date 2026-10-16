import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { PERMISSION_METADATA_KEY, ROLE_METADATA_KEY } from '../auth/auth.constants';
import { PaintProcurementsController } from './paint-procurements.controller';

describe('PaintProcurementsController RBAC metadata', () => {
  it('protects mutation endpoints with procurement roles', () => {
    const prototype = PaintProcurementsController.prototype;

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.createProcurement)).toEqual([
      'admin',
      'project_manager',
      'purchaser',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.orderProcurement)).toEqual([
      'admin',
      'project_manager',
      'purchaser',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.completeTask)).toEqual([
      'admin',
      'project_manager',
      'purchaser',
    ]);
  });

  it('requires project read or workflow transition permission on every endpoint', () => {
    const prototype = PaintProcurementsController.prototype;

    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getWorkspace)).toEqual([
      'project.read',
    ]);
    for (const handler of [
      prototype.createProcurement,
      prototype.updateProcurement,
      prototype.orderProcurement,
      prototype.markArrived,
      prototype.cancelProcurement,
      prototype.completeTask,
    ]) {
      expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, handler)).toEqual([
        'workflow.transition',
      ]);
    }
  });
});
