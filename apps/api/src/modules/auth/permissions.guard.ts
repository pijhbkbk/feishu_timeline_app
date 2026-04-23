import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PERMISSION_METADATA_KEY, PUBLIC_ROUTE_KEY } from './auth.constants';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSION_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.authUser;

    if (!user) {
      throw new ForbiddenException('User context not found.');
    }

    if (user.isSystemAdmin || user.roleCodes.includes('admin')) {
      return true;
    }

    const permissionCodes = new Set(user.permissionCodes ?? []);
    const hasAccess = requiredPermissions.some((permission) => permissionCodes.has(permission));

    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    return true;
  }
}
