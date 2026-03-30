import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';

import { FEISHU_AUTH_ADAPTER } from '../feishu/feishu.constants';
import type { FeishuAuthAdapter } from '../feishu/feishu.types';
import { UsersService } from '../users/users.service';
import {
  AUTH_SESSION_PREFIX,
  ROLE_CODES,
  type AuthSource,
  type RoleCode,
} from './auth.constants';
import { SessionStoreService } from './session-store.service';
import type { AuthSessionPayload, SessionResponse } from './auth.types';

type MockLoginInput = {
  username?: string;
  name?: string;
  roleCodes?: string[];
};

type FeishuCallbackInput = {
  code: string;
  state?: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly sessionStoreService: SessionStoreService,
    @Inject(FEISHU_AUTH_ADAPTER)
    private readonly feishuAuthAdapter: FeishuAuthAdapter,
  ) {}

  async getAuthenticatedUserFromSessionToken(sessionToken: string) {
    const session = await this.sessionStoreService.getJson<AuthSessionPayload>(
      this.getSessionStorageKey(sessionToken),
    );

    if (!session) {
      return null;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await this.sessionStoreService.delete(this.getSessionStorageKey(sessionToken));
      return null;
    }

    return this.usersService.getAuthenticatedUser(session.userId, session.authSource);
  }

  async getSessionResponse(sessionToken?: string | null): Promise<SessionResponse> {
    const user = sessionToken
      ? await this.getAuthenticatedUserFromSessionToken(sessionToken)
      : null;

    return {
      authenticated: user !== null,
      mockEnabled: this.isMockEnabled(),
      feishuEnabled: this.feishuAuthAdapter.isConfigured(),
      user,
    };
  }

  async loginWithMock(input: MockLoginInput, response: Response) {
    if (!this.isMockEnabled()) {
      throw new ForbiddenException('Mock login is disabled.');
    }

    const requestedRoleCodes = this.normalizeRoleCodes(input.roleCodes);
    const payload: {
      username?: string;
      name?: string;
      roleCodes: RoleCode[];
    } = {
      roleCodes: requestedRoleCodes,
    };

    if (input.username?.trim()) {
      payload.username = input.username.trim();
    }

    if (input.name?.trim()) {
      payload.name = input.name.trim();
    }

    const user = await this.usersService.upsertMockUser(payload);

    await this.createSessionAndWriteCookie(user.id, 'mock', response);

    return this.getSessionResponseFromUserId(user.id, 'mock');
  }

  async getFeishuLoginUrl() {
    if (!this.feishuAuthAdapter.isConfigured()) {
      return {
        enabled: false,
        loginUrl: null,
      };
    }

    const state = randomUUID();

    return {
      enabled: true,
      loginUrl: await this.feishuAuthAdapter.getAuthorizationUrl(state),
    };
  }

  async loginWithFeishu(input: FeishuCallbackInput, response: Response) {
    const profile = await this.feishuAuthAdapter.exchangeCodeForProfile(input.code, input.state);
    const user = await this.usersService.upsertFeishuUser(profile);

    await this.createSessionAndWriteCookie(user.id, 'feishu', response);

    return this.getSessionResponseFromUserId(user.id, 'feishu');
  }

  async logout(sessionToken: string | undefined, response: Response) {
    if (sessionToken) {
      await this.sessionStoreService.delete(this.getSessionStorageKey(sessionToken));
    }

    this.clearSessionCookie(response);
  }

  private async createSessionAndWriteCookie(
    userId: string,
    authSource: AuthSource,
    response: Response,
  ) {
    const now = new Date();
    const sessionTtlSeconds = this.configService.get<number>('sessionTtlSeconds') ?? 28800;
    const expiresAt = new Date(now.getTime() + sessionTtlSeconds * 1000);
    const sessionToken = randomUUID();
    const session: AuthSessionPayload = {
      userId,
      authSource,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await this.sessionStoreService.setJson(
      this.getSessionStorageKey(sessionToken),
      session,
      sessionTtlSeconds,
    );

    response.cookie(
      this.configService.get<string>('sessionCookieName') ?? 'ft_session',
      sessionToken,
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.shouldUseSecureCookies(),
        path: '/',
        expires: expiresAt,
      },
    );
  }

  private clearSessionCookie(response: Response) {
    response.clearCookie(this.configService.get<string>('sessionCookieName') ?? 'ft_session', {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.shouldUseSecureCookies(),
      path: '/',
    });
  }

  private async getSessionResponseFromUserId(userId: string, authSource: AuthSource) {
    const user = await this.usersService.getAuthenticatedUser(userId, authSource);

    if (!user) {
      throw new UnauthorizedException('User session could not be established.');
    }

    return {
      authenticated: true,
      mockEnabled: this.isMockEnabled(),
      feishuEnabled: this.feishuAuthAdapter.isConfigured(),
      user,
    };
  }

  private getSessionStorageKey(sessionToken: string) {
    return `${AUTH_SESSION_PREFIX}${sessionToken}`;
  }

  private isMockEnabled() {
    return this.configService.get<boolean>('authMockEnabled') ?? true;
  }

  private normalizeRoleCodes(input?: string[]): RoleCode[] {
    const codes = input?.filter((value): value is RoleCode =>
      ROLE_CODES.includes(value as RoleCode),
    );

    return codes && codes.length > 0 ? [...new Set(codes)] : ['project_manager'];
  }

  private shouldUseSecureCookies() {
    const nodeEnv = this.configService.get<string>('nodeEnv') ?? process.env.NODE_ENV;
    const frontendUrl = this.configService.get<string>('frontendUrl')?.trim();

    return nodeEnv === 'production' || Boolean(frontendUrl?.startsWith('https://'));
  }
}
