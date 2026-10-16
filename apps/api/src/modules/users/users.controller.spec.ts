import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { PERMISSION_METADATA_KEY } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UsersController } from './users.controller';

const actor: AuthenticatedUser = {
  id: 'manager-1',
  username: 'manager',
  name: '项目经理',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['project_manager'],
  permissionCodes: ['project.read', 'project.write'],
};

describe('UsersController directory boundary', () => {
  it('requires an explicit project permission at the controller boundary', () => {
    expect(
      Reflect.getMetadata(PERMISSION_METADATA_KEY, UsersController.prototype.getDirectory),
    ).toEqual(['project.read', 'project.write']);
  });

  it('passes the validated directory query and authenticated actor to the service', async () => {
    const usersService = {
      getDirectory: vi.fn().mockResolvedValue([]),
    };
    const controller = new UsersController(usersService as never);
    const query = { projectId: 'project-1', q: '张', take: 20 };

    await expect(controller.getDirectory(query as never, actor)).resolves.toEqual([]);
    expect(usersService.getDirectory).toHaveBeenCalledWith(query, actor);
  });
});
