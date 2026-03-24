import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ROLE_METADATA_KEY } from '../auth/auth.constants';
import { SuppliersController } from './suppliers.controller';

describe('SuppliersController RBAC metadata', () => {
  it('protects supplier management endpoints with procurement roles', () => {
    const prototype = SuppliersController.prototype;

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.listSuppliers)).toEqual([
      'admin',
      'project_manager',
      'purchaser',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.createSupplier)).toEqual([
      'admin',
      'project_manager',
      'purchaser',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.updateSupplier)).toEqual([
      'admin',
      'project_manager',
      'purchaser',
    ]);
  });
});
