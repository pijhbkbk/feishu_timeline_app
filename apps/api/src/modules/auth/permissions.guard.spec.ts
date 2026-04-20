import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsGuard } from './permissions.guard';

function createContext(input: {
  permissionCodes?: string[];
  isAdmin?: boolean;
}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        authUser: {
          id: 'user-1',
          username: 'mock_user',
          name: 'Mock User',
          email: null,
          departmentId: null,
          departmentName: null,
          isSystemAdmin: input.isAdmin ?? false,
          authSource: 'mock',
          roleCodes: input.isAdmin ? ['admin'] : ['project_manager'],
          permissionCodes: input.permissionCodes ?? [],
        },
      }),
    }),
    getHandler: () => 'handler',
    getClass: () => 'class',
  } as never;
}

describe('PermissionsGuard', () => {
  it('allows access when the user has the required permission', () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['attachment.manage']),
    };
    const guard = new PermissionsGuard(reflector as never);

    expect(
      guard.canActivate(createContext({ permissionCodes: ['attachment.manage'] })),
    ).toBe(true);
  });

  it('allows admin users without checking permission codes', () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['system.manage']),
    };
    const guard = new PermissionsGuard(reflector as never);

    expect(guard.canActivate(createContext({ isAdmin: true }))).toBe(true);
  });

  it('rejects access when the user lacks the required permission', () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['system.manage']),
    };
    const guard = new PermissionsGuard(reflector as never);

    expect(() => guard.canActivate(createContext({ permissionCodes: ['project.read'] }))).toThrow(
      ForbiddenException,
    );
  });
});
