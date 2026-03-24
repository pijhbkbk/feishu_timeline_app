import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ROLE_METADATA_KEY } from '../auth/auth.constants';
import { FeesController } from './fees.controller';

describe('FeesController RBAC metadata', () => {
  it('protects write endpoints with finance roles', () => {
    const prototype = FeesController.prototype;

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.createFee)).toEqual([
      'admin',
      'project_manager',
      'finance',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.markPaid)).toEqual([
      'admin',
      'project_manager',
      'finance',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.completeTask)).toEqual([
      'admin',
      'project_manager',
      'finance',
    ]);
  });
});
