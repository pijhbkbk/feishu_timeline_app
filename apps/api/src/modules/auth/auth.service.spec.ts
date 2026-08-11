import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { getFeishuOAuthStateCookieName } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './session-auth.guard';

function createAuthService(
  options: {
    authMockEnabled?: boolean;
    nodeEnv?: string;
    feishuUserStatus?: UserStatus;
  } = {},
) {
  const stateStore = new Map<string, unknown>();
  const configService = {
    get: vi.fn((key: string) => {
      if (key === 'sessionCookieName') {
        return 'ft_session';
      }

      if (key === 'sessionTtlSeconds') {
        return 28800;
      }

      if (key === 'authMockEnabled') {
        return options.authMockEnabled ?? true;
      }

      if (key === 'nodeEnv') {
        return options.nodeEnv ?? 'development';
      }

      return undefined;
    }),
  };
  const usersService = {
    upsertMockUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
    upsertFeishuUser: vi.fn().mockResolvedValue({
      id: 'user-1',
      status: options.feishuUserStatus ?? UserStatus.ACTIVE,
    }),
    getAuthenticatedUser: vi.fn().mockResolvedValue({
      id: 'user-1',
      username: 'feishu-user',
      name: '飞书用户',
      email: null,
      departmentId: null,
      departmentName: null,
      isSystemAdmin: false,
      authSource: 'feishu',
      roleCodes: ['project_manager'],
      permissionCodes: ['project.read'],
    }),
  };
  const sessionStoreService = {
    setJson: vi.fn(async (key: string, value: unknown) => {
      stateStore.set(key, value);
    }),
    getJson: vi.fn(async (key: string) => stateStore.get(key) ?? null),
    consumeJson: vi.fn(async (key: string) => {
      const value = stateStore.get(key);
      stateStore.delete(key);
      return value ?? null;
    }),
    delete: vi.fn(async (key: string) => {
      stateStore.delete(key);
    }),
    incrementWithTtl: vi.fn().mockResolvedValue(1),
  };
  const feishuAuthAdapter = {
    isConfigured: vi.fn(() => true),
    getAuthorizationUrl: vi.fn(async (state: string) => `https://login.example.test?state=${state}`),
    exchangeCodeForProfile: vi.fn().mockResolvedValue({
      feishuOpenId: 'ou-test',
      feishuUnionId: null,
      name: '飞书用户',
      email: null,
      avatarUrl: null,
    }),
  };
  const response = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  };
  const service = new AuthService(
    configService as never,
    usersService as never,
    sessionStoreService as never,
    feishuAuthAdapter as never,
  );

  return {
    service,
    response,
    configService,
    usersService,
    sessionStoreService,
    feishuAuthAdapter,
    stateStore,
  };
}

describe('AuthService Feishu OAuth state', () => {
  it('stores a short-lived state before returning the Feishu login URL', async () => {
    const { service, response, sessionStoreService, feishuAuthAdapter } = createAuthService();

    const result = await service.getFeishuLoginUrl(response as never);
    const state = new URL(result.loginUrl ?? '').searchParams.get('state');

    expect(result.enabled).toBe(true);
    expect(sessionStoreService.setJson).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:feishu:state:/),
      expect.objectContaining({ createdAt: expect.any(String) }),
      600,
    );
    expect(feishuAuthAdapter.getAuthorizationUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
    expect(result.loginUrl).toContain('state=');
    expect(response.cookie).toHaveBeenCalledWith(
      getFeishuOAuthStateCookieName(state ?? ''),
      state,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/api/auth/feishu',
        maxAge: 600_000,
      }),
    );
  });

  it('keeps overlapping browser login attempts in independent state cookies', async () => {
    const { service, response, feishuAuthAdapter } = createAuthService();
    const firstLogin = await service.getFeishuLoginUrl(response as never);
    const secondLogin = await service.getFeishuLoginUrl(response as never);
    const firstState = new URL(firstLogin.loginUrl ?? '').searchParams.get('state');
    const secondState = new URL(secondLogin.loginUrl ?? '').searchParams.get('state');

    expect(firstState).not.toBe(secondState);
    expect(response.cookie).toHaveBeenCalledWith(
      getFeishuOAuthStateCookieName(firstState ?? ''),
      firstState,
      expect.any(Object),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      getFeishuOAuthStateCookieName(secondState ?? ''),
      secondState,
      expect.any(Object),
    );

    await expect(
      service.loginWithFeishu(
        { code: 'first-code', state: firstState },
        firstState ?? undefined,
        response as never,
      ),
    ).resolves.toMatchObject({ authenticated: true });
    await expect(
      service.loginWithFeishu(
        { code: 'second-code', state: secondState },
        secondState ?? undefined,
        response as never,
      ),
    ).resolves.toMatchObject({ authenticated: true });
    expect(feishuAuthAdapter.exchangeCodeForProfile).toHaveBeenCalledTimes(2);
  });

  it('rate-limits anonymous login URL requests before allocating OAuth state', async () => {
    const { service, response, sessionStoreService, feishuAuthAdapter } = createAuthService();
    sessionStoreService.incrementWithTtl.mockResolvedValueOnce(501);

    await expect(
      service.getFeishuLoginUrl(response as never, '203.0.113.8'),
    ).rejects.toMatchObject({ status: 429 });

    expect(sessionStoreService.setJson).not.toHaveBeenCalled();
    expect(feishuAuthAdapter.getAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('rejects missing or unknown callback state before exchanging the authorization code', async () => {
    const { service, response, feishuAuthAdapter } = createAuthService();

    await expect(
      service.loginWithFeishu({ code: 'code', state: null }, undefined, response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      service.loginWithFeishu({
        code: 'code',
        state: '00000000-0000-4000-8000-000000000001',
      }, '00000000-0000-4000-8000-000000000001', response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(feishuAuthAdapter.exchangeCodeForProfile).not.toHaveBeenCalled();
  });

  it('rejects malformed authorization codes before consuming callback state', async () => {
    const { service, response, sessionStoreService, feishuAuthAdapter } = createAuthService();
    const loginUrlResult = await service.getFeishuLoginUrl(response as never);
    const state = new URL(loginUrlResult.loginUrl ?? '').searchParams.get('state');

    await expect(
      service.loginWithFeishu({ code: 123, state }, state ?? undefined, response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(sessionStoreService.consumeJson).not.toHaveBeenCalled();
    expect(feishuAuthAdapter.exchangeCodeForProfile).not.toHaveBeenCalled();
  });

  it('rejects an empty callback body without raising an internal server error', async () => {
    const { service, response, sessionStoreService, feishuAuthAdapter } = createAuthService();

    await expect(
      service.loginWithFeishu(undefined, undefined, response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(sessionStoreService.consumeJson).not.toHaveBeenCalled();
    expect(feishuAuthAdapter.exchangeCodeForProfile).not.toHaveBeenCalled();
  });

  it('consumes callback state once before establishing a Feishu session', async () => {
    const { service, response, feishuAuthAdapter } = createAuthService();
    const loginUrlResult = await service.getFeishuLoginUrl(response as never);
    const state = new URL(loginUrlResult.loginUrl ?? '').searchParams.get('state');

    await expect(
      service.loginWithFeishu({ code: 'code', state }, state ?? undefined, response as never),
    ).resolves.toMatchObject({ authenticated: true });
    await expect(
      service.loginWithFeishu({ code: 'code', state }, state ?? undefined, response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(feishuAuthAdapter.exchangeCodeForProfile).toHaveBeenCalledTimes(1);
    expect(response.clearCookie).toHaveBeenCalledWith(
      getFeishuOAuthStateCookieName(state ?? ''),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/auth/feishu',
      }),
    );
  });

  it('rejects a callback state that was not issued to the current browser', async () => {
    const { service, response, sessionStoreService, feishuAuthAdapter } = createAuthService();
    const loginUrlResult = await service.getFeishuLoginUrl(response as never);
    const state = new URL(loginUrlResult.loginUrl ?? '').searchParams.get('state');

    await expect(
      service.loginWithFeishu({ code: 'code', state }, undefined, response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(sessionStoreService.consumeJson).not.toHaveBeenCalled();
    expect(feishuAuthAdapter.exchangeCodeForProfile).not.toHaveBeenCalled();

    await expect(
      service.loginWithFeishu({ code: 'code', state }, state ?? undefined, response as never),
    ).resolves.toMatchObject({ authenticated: true });
  });

  it.each([UserStatus.INACTIVE, UserStatus.LOCKED])(
    'does not establish a session for a %s Feishu account',
    async (status) => {
      const { service, response, sessionStoreService } = createAuthService({
        feishuUserStatus: status,
      });
      const loginUrlResult = await service.getFeishuLoginUrl(response as never);
      const state = new URL(loginUrlResult.loginUrl ?? '').searchParams.get('state');

      await expect(
        service.loginWithFeishu(
          { code: 'code', state },
          state ?? undefined,
          response as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(sessionStoreService.setJson).toHaveBeenCalledTimes(1);
      expect(response.cookie).toHaveBeenCalledTimes(1);
    },
  );

  it('uses secure, HttpOnly and SameSite cookies in production', async () => {
    const { service, response } = createAuthService({ nodeEnv: 'production' });
    const loginUrlResult = await service.getFeishuLoginUrl(response as never);
    const state = new URL(loginUrlResult.loginUrl ?? '').searchParams.get('state');

    await service.loginWithFeishu(
      { code: 'code', state },
      state ?? undefined,
      response as never,
    );

    expect(response.cookie).toHaveBeenCalledWith(
      'ft_session',
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        expires: expect.any(Date),
      }),
    );
  });

  it('expires old sessions and deletes the server-side record', async () => {
    const { service, sessionStoreService, usersService } = createAuthService();
    sessionStoreService.getJson.mockResolvedValue({
      userId: 'user-1',
      authSource: 'feishu',
      createdAt: '2026-07-16T00:00:00.000Z',
      expiresAt: '2026-07-16T00:00:01.000Z',
    });

    await expect(service.getAuthenticatedUserFromSessionToken('expired')).resolves.toBeNull();
    expect(sessionStoreService.delete).toHaveBeenCalledWith('auth:session:expired');
    expect(usersService.getAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('invalidates logout server-side and clears the cookie with matching attributes', async () => {
    const { service, response, sessionStoreService } = createAuthService({
      nodeEnv: 'production',
    });

    const sessionToken = ['8dcfdac1', '2a27', '46df', 'bd09', 'ec35ea84ccdb'].join('-');

    await service.logout(sessionToken, response as never);

    expect(sessionStoreService.delete).toHaveBeenCalledWith(
      `auth:session:${sessionToken}`,
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      'ft_session',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });

  it('makes the old cookie unusable while preserving another device session', async () => {
    const { service, response, sessionStoreService } = createAuthService();

    await service.loginWithMock({}, response as never);
    await service.loginWithMock({}, response as never);
    const firstToken = response.cookie.mock.calls[0]?.[1] as string;
    const secondToken = response.cookie.mock.calls[1]?.[1] as string;

    await expect(
      service.getAuthenticatedUserFromSessionToken(firstToken),
    ).resolves.toMatchObject({ id: 'user-1' });
    await expect(
      service.getAuthenticatedUserFromSessionToken(secondToken),
    ).resolves.toMatchObject({ id: 'user-1' });

    await service.logout(firstToken, response as never);

    await expect(
      service.getAuthenticatedUserFromSessionToken(firstToken),
    ).resolves.toBeNull();
    await expect(
      service.getAuthenticatedUserFromSessionToken(secondToken),
    ).resolves.toMatchObject({ id: 'user-1' });
    expect(sessionStoreService.delete).toHaveBeenCalledWith(
      `auth:session:${firstToken}`,
    );
  });

  it('treats missing, malformed and repeated logout cookies safely', async () => {
    const { service, response, sessionStoreService } = createAuthService();

    await service.loginWithMock({}, response as never);
    const activeToken = response.cookie.mock.calls[0]?.[1] as string;
    const forgedToken = '00000000-0000-4000-8000-000000000001';

    await expect(service.logout(undefined, response as never)).resolves.toBeUndefined();
    await expect(
      service.logout('not-a-valid-session-token', response as never),
    ).resolves.toBeUndefined();
    await expect(service.logout(forgedToken, response as never)).resolves.toBeUndefined();
    await expect(
      service.getAuthenticatedUserFromSessionToken(activeToken),
    ).resolves.toMatchObject({ id: 'user-1' });

    await expect(service.logout(activeToken, response as never)).resolves.toBeUndefined();
    await expect(service.logout(activeToken, response as never)).resolves.toBeUndefined();
    await expect(
      service.getAuthenticatedUserFromSessionToken(activeToken),
    ).resolves.toBeNull();

    expect(sessionStoreService.delete).not.toHaveBeenCalledWith(
      'auth:session:not-a-valid-session-token',
    );
    expect(sessionStoreService.delete).toHaveBeenCalledWith(
      `auth:session:${forgedToken}`,
    );
    expect(response.clearCookie).toHaveBeenCalledTimes(5);
  });

  it('rejects an old logout cookie with 401 while another device stays authenticated', async () => {
    const { service, response, configService } = createAuthService();
    const controller = new AuthController(service, configService as never);
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    };
    const guard = new SessionAuthGuard(
      reflector as never,
      configService as never,
      service,
    );

    await service.loginWithMock({}, response as never);
    await service.loginWithMock({}, response as never);
    const loggedOutToken = response.cookie.mock.calls[0]?.[1] as string;
    const otherDeviceToken = response.cookie.mock.calls[1]?.[1] as string;
    const contextFor = (sessionToken: string) => {
      const request = {
        cookies: { ft_session: sessionToken },
      };

      return {
        request,
        context: {
          getHandler: () => controller.getMe,
          getClass: () => AuthController,
          switchToHttp: () => ({
            getRequest: () => request,
          }),
        },
      };
    };

    await expect(
      guard.canActivate(contextFor(loggedOutToken).context as never),
    ).resolves.toBe(true);

    await controller.logout(
      { cookies: { ft_session: loggedOutToken } } as never,
      response as never,
    );

    await expect(
      guard.canActivate(contextFor(loggedOutToken).context as never),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      guard.canActivate(contextFor(otherDeviceToken).context as never),
    ).resolves.toBe(true);
  });
});

describe('AuthService mock authentication safety', () => {
  it('rejects mock login in production even if an invalid config object enables it', async () => {
    const { service, response, usersService } = createAuthService({
      authMockEnabled: true,
      nodeEnv: 'production',
    });

    await expect(service.loginWithMock({}, response as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(usersService.upsertMockUser).not.toHaveBeenCalled();
  });
});
