import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { PUBLIC_ROUTE_KEY } from './auth.constants';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieName = this.configService.get<string>('sessionCookieName') ?? 'ft_session';
    const sessionToken = request.cookies?.[cookieName];

    if (!sessionToken) {
      throw new UnauthorizedException('Authentication required.');
    }

    const authUser = await this.authService.getAuthenticatedUserFromSessionToken(sessionToken);

    if (!authUser) {
      throw new UnauthorizedException('Session expired or invalid.');
    }

    request.authUser = authUser;
    request.sessionToken = sessionToken;

    return true;
  }
}
