import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { FEISHU_OAUTH_STATE_COOKIE_NAME } from './auth.constants';
import { AuthService } from './auth.service';

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
    getJson: vi.fn(),
    consumeJson: vi.fn(async (key: string) => {
      const value = stateStore.get(key);
      stateStore.delete(key);
      return value ?? null;
    }),
    delete: vi.fn(),
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
    usersService,
    sessionStoreService,
    feishuAuthAdapter,
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
      FEISHU_OAUTH_STATE_COOKIE_NAME,
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
      FEISHU_OAUTH_STATE_COOKIE_NAME,
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
