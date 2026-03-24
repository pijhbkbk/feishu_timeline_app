import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ROLE_METADATA_KEY } from '../auth/auth.constants';
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
});
