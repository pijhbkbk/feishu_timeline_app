import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';

function createAuthService() {
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
        return true;
      }

      return undefined;
    }),
  };
  const usersService = {
    upsertFeishuUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
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
    sessionStoreService,
    feishuAuthAdapter,
  };
}

describe('AuthService Feishu OAuth state', () => {
  it('stores a short-lived state before returning the Feishu login URL', async () => {
    const { service, sessionStoreService, feishuAuthAdapter } = createAuthService();

    const result = await service.getFeishuLoginUrl();

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
  });

  it('rejects missing or unknown callback state before exchanging the authorization code', async () => {
    const { service, response, feishuAuthAdapter } = createAuthService();

    await expect(
      service.loginWithFeishu({ code: 'code', state: null }, response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      service.loginWithFeishu({
        code: 'code',
        state: '00000000-0000-4000-8000-000000000001',
      }, response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(feishuAuthAdapter.exchangeCodeForProfile).not.toHaveBeenCalled();
  });

  it('consumes callback state once before establishing a Feishu session', async () => {
    const { service, response, feishuAuthAdapter } = createAuthService();
    const loginUrlResult = await service.getFeishuLoginUrl();
    const state = new URL(loginUrlResult.loginUrl ?? '').searchParams.get('state');

    await expect(
      service.loginWithFeishu({ code: 'code', state }, response as never),
    ).resolves.toMatchObject({ authenticated: true });
    await expect(
      service.loginWithFeishu({ code: 'code', state }, response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(feishuAuthAdapter.exchangeCodeForProfile).toHaveBeenCalledTimes(1);
  });
});
