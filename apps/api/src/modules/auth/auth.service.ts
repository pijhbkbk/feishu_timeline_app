import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import type { Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';

import { FEISHU_AUTH_ADAPTER } from '../feishu/feishu.constants';
import type { FeishuAuthAdapter } from '../feishu/feishu.types';
import { UsersService } from '../users/users.service';
import {
  AUTH_SESSION_PREFIX,
  FEISHU_OAUTH_STATE_COOKIE_NAME,
  FEISHU_OAUTH_STATE_COOKIE_PATH,
  ROLE_CODES,
  type AuthSource,
  type RoleCode,
} from './auth.constants';
import { SessionStoreService } from './session-store.service';
import type { AuthSessionPayload, SessionResponse } from './auth.types';

const FEISHU_OAUTH_STATE_PREFIX = 'auth:feishu:state:';
const FEISHU_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const FEISHU_AUTH_RATE_LIMIT_WINDOW_SECONDS = 60;
const FEISHU_LOGIN_URL_CLIENT_LIMIT = 20;
const FEISHU_LOGIN_URL_GLOBAL_LIMIT = 500;
const FEISHU_CALLBACK_CLIENT_LIMIT = 30;
const FEISHU_CALLBACK_GLOBAL_LIMIT = 1_000;
const UUID_STATE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MockLoginInput = {
  username?: unknown;
  name?: unknown;
  roleCodes?: unknown;
};

type FeishuCallbackInput = {
  code?: unknown;
  state?: unknown;
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
      throw new ForbiddenException('模拟登录已关闭。');
    }

    const requestedRoleCodes = this.normalizeRoleCodes(input.roleCodes);
    const username = this.normalizeOptionalString(input.username);
    const name = this.normalizeOptionalString(input.name);
    const payload: {
      username?: string;
      name?: string;
      roleCodes: RoleCode[];
    } = {
      roleCodes: requestedRoleCodes,
    };

    if (username) {
      payload.username = username;
    }

    if (name) {
      payload.name = name;
    }

    const user = await this.usersService.upsertMockUser(payload);

    await this.createSessionAndWriteCookie(user.id, 'mock', response);

    return this.getSessionResponseFromUserId(user.id, 'mock');
  }

  async getFeishuLoginUrl(response: Response, clientIdentifier = 'unknown') {
    if (!this.feishuAuthAdapter.isConfigured()) {
      return {
        enabled: false,
        loginUrl: null,
      };
    }

    await this.enforceFeishuRateLimit(
      'login-url',
      clientIdentifier,
      FEISHU_LOGIN_URL_CLIENT_LIMIT,
      FEISHU_LOGIN_URL_GLOBAL_LIMIT,
    );

    const state = randomUUID();
    const loginUrl = await this.feishuAuthAdapter.getAuthorizationUrl(state);
    await this.sessionStoreService.setJson(
      this.getFeishuOAuthStateStorageKey(state),
      {
        createdAt: new Date().toISOString(),
      },
      FEISHU_OAUTH_STATE_TTL_SECONDS,
    );
    this.writeFeishuOAuthStateCookie(state, response);

    return {
      enabled: true,
      loginUrl,
    };
  }

  async loginWithFeishu(
    input: FeishuCallbackInput | null | undefined,
    browserState: string | undefined,
    response: Response,
    clientIdentifier = 'unknown',
  ) {
    await this.enforceFeishuRateLimit(
      'callback',
      clientIdentifier,
      FEISHU_CALLBACK_CLIENT_LIMIT,
      FEISHU_CALLBACK_GLOBAL_LIMIT,
    );

    const code = this.normalizeFeishuAuthorizationCode(input?.code);
    const state = this.normalizeFeishuOAuthState(input?.state);
    const normalizedBrowserState = this.normalizeFeishuOAuthState(browserState);

    if (normalizedBrowserState !== state) {
      throw new UnauthorizedException('飞书登录状态与当前浏览器不匹配，请重新发起登录。');
    }

    this.clearFeishuOAuthStateCookie(response);
    const statePayload = await this.sessionStoreService.consumeJson<{
      createdAt: string;
    }>(this.getFeishuOAuthStateStorageKey(state));

    if (!statePayload) {
      throw new UnauthorizedException('飞书登录状态已失效，请重新发起登录。');
    }

    const profile = await this.feishuAuthAdapter.exchangeCodeForProfile(code, state);
    const user = await this.usersService.upsertFeishuUser(profile);

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('当前账号已停用或锁定，无法登录。');
    }

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

  private writeFeishuOAuthStateCookie(state: string, response: Response) {
    response.cookie(FEISHU_OAUTH_STATE_COOKIE_NAME, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.shouldUseSecureCookies(),
      path: FEISHU_OAUTH_STATE_COOKIE_PATH,
      maxAge: FEISHU_OAUTH_STATE_TTL_SECONDS * 1000,
    });
  }

  private clearFeishuOAuthStateCookie(response: Response) {
    response.clearCookie(FEISHU_OAUTH_STATE_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.shouldUseSecureCookies(),
      path: FEISHU_OAUTH_STATE_COOKIE_PATH,
    });
  }

  private async getSessionResponseFromUserId(userId: string, authSource: AuthSource) {
    const user = await this.usersService.getAuthenticatedUser(userId, authSource);

    if (!user) {
      throw new UnauthorizedException('登录会话建立失败。');
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

  private normalizeFeishuAuthorizationCode(code: unknown) {
    const normalized = this.normalizeOptionalString(code);

    if (!normalized || normalized.length > 4096) {
      throw new UnauthorizedException('飞书授权码无效，请重新发起登录。');
    }

    return normalized;
  }

  private normalizeFeishuOAuthState(state: unknown) {
    const normalized = this.normalizeOptionalString(state);

    if (!normalized || !UUID_STATE_PATTERN.test(normalized)) {
      throw new UnauthorizedException('飞书登录状态无效，请重新发起登录。');
    }

    return normalized;
  }

  private getFeishuOAuthStateStorageKey(state: string) {
    return `${FEISHU_OAUTH_STATE_PREFIX}${state}`;
  }

  private async enforceFeishuRateLimit(
    scope: 'login-url' | 'callback',
    clientIdentifier: string,
    clientLimit: number,
    globalLimit: number,
  ) {
    const normalizedClientIdentifier = clientIdentifier.trim() || 'unknown';
    const clientHash = createHash('sha256')
      .update(normalizedClientIdentifier)
      .digest('hex');
    const globalCount = await this.sessionStoreService.incrementWithTtl(
      `auth:feishu:rate:${scope}:global`,
      FEISHU_AUTH_RATE_LIMIT_WINDOW_SECONDS,
    );

    if (globalCount > globalLimit) {
      throw new HttpException('飞书登录请求过于频繁，请稍后重试。', HttpStatus.TOO_MANY_REQUESTS);
    }

    const clientCount = await this.sessionStoreService.incrementWithTtl(
      `auth:feishu:rate:${scope}:client:${clientHash}`,
      FEISHU_AUTH_RATE_LIMIT_WINDOW_SECONDS,
    );

    if (clientCount > clientLimit) {
      throw new HttpException('飞书登录请求过于频繁，请稍后重试。', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private isMockEnabled() {
    const enabled = this.configService.get<boolean>('authMockEnabled') ?? false;
    const nodeEnv = (
      this.configService.get<string>('nodeEnv') ??
      process.env.NODE_ENV ??
      'development'
    )
      .trim()
      .toLowerCase();

    return enabled && nodeEnv !== 'production';
  }

  private normalizeRoleCodes(input: unknown): RoleCode[] {
    const codes = Array.isArray(input)
      ? input.filter(
          (value): value is RoleCode =>
            typeof value === 'string' && ROLE_CODES.includes(value as RoleCode),
        )
      : undefined;

    return codes && codes.length > 0 ? [...new Set(codes)] : ['project_manager'];
  }

  private normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private shouldUseSecureCookies() {
    const nodeEnv = this.configService.get<string>('nodeEnv') ?? process.env.NODE_ENV;
    const frontendUrl = this.configService.get<string>('frontendUrl')?.trim();

    return nodeEnv === 'production' || Boolean(frontendUrl?.startsWith('https://'));
  }
}
