import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ROLE_METADATA_KEY } from '../auth/auth.constants';
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
});
