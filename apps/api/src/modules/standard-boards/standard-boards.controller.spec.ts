import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ROLE_METADATA_KEY } from '../auth/auth.constants';
import { StandardBoardsController } from './standard-boards.controller';

describe('StandardBoardsController RBAC metadata', () => {
  it('protects board and detail update endpoints with quality and process roles', () => {
    const prototype = StandardBoardsController.prototype;

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.getWorkspace)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
      'quality_engineer',
    ]);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.setCurrentBoard)).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
      'quality_engineer',
    ]);
    expect(
      Reflect.getMetadata(
        ROLE_METADATA_KEY,
        prototype.completeColorBoardDetailUpdateTask,
      ),
    ).toEqual([
      'admin',
      'project_manager',
      'process_engineer',
      'quality_engineer',
    ]);
  });
});
