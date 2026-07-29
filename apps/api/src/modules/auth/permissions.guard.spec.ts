import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsGuard } from './permissions.guard';

function createContext(input: {
  permissionCodes?: string[];
  isSystemAdmin?: boolean;
  roleCodes?: string[];
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
          isSystemAdmin: input.isSystemAdmin ?? false,
          authSource: 'mock',
          roleCodes: input.roleCodes ?? ['project_manager'],
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

  it('allows explicit super administrators without checking permission codes', () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['system.manage']),
    };
    const guard = new PermissionsGuard(reflector as never);

    expect(guard.canActivate(createContext({ isSystemAdmin: true, roleCodes: ['admin'] }))).toBe(true);
  });

  it('does not let the admin role bypass the editable permission matrix', () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['system.manage']),
    };
    const guard = new PermissionsGuard(reflector as never);

    expect(() => guard.canActivate(createContext({ roleCodes: ['admin'] }))).toThrow(
      ForbiddenException,
    );
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
