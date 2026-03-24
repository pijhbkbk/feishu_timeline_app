import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ROLE_METADATA_KEY } from '../auth/auth.constants';
import { ColorExitsController } from './color-exits.controller';

describe('ColorExitsController RBAC metadata', () => {
  it('protects color exit write endpoints with management roles', () => {
    const prototype = ColorExitsController.prototype;

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.createExitRecord)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.updateExitRecord)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.completeExitRecord)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
    ]);
  });
});
