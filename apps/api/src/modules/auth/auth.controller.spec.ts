import { GoneException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  PUBLIC_ROUTE_KEY,
} from './auth.constants';
import { AuthController } from './auth.controller';

function createController(loginResult: { enabled: boolean; loginUrl: string | null }) {
  const authService = {
    getFeishuLoginUrl: vi.fn().mockResolvedValue(loginResult),
    loginWithFeishu: vi.fn().mockResolvedValue({ authenticated: true }),
  };
  const configService = {
    get: vi.fn(),
  };
  const response = {
    redirect: vi.fn(),
  };
  const controller = new AuthController(authService as never, configService as never);
  const request = {
    headers: {
      'x-real-ip': '203.0.113.8',
    },
    ip: '127.0.0.1',
    socket: {},
    cookies: {},
  };

  return { controller, authService, request, response };
}

describe('disabled third-party identity routes', () => {
  it('rejects all old entries without starting OAuth, redirecting, or exchanging a code', async () => {
    const { controller, authService, request, response } = createController({ enabled: true, loginUrl: 'https://accounts.feishu.cn/' });
    await expect(controller.startFeishuLogin(request as never, response as never)).rejects.toBeInstanceOf(GoneException);
    await expect(controller.getFeishuLoginUrl()).rejects.toBeInstanceOf(GoneException);
    await expect(controller.feishuCallback()).rejects.toBeInstanceOf(GoneException);
    expect(authService.getFeishuLoginUrl).not.toHaveBeenCalled();
    expect(authService.loginWithFeishu).not.toHaveBeenCalled();
    expect(response.redirect).not.toHaveBeenCalled();
  });
});

describe('AuthController logout', () => {
  it('is public and forwards the current session cookie for server-side invalidation', async () => {
    const authService = {
      logout: vi.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: vi.fn((key: string) => key === 'sessionCookieName' ? 'ft_session' : undefined),
    };
    const controller = new AuthController(authService as never, configService as never);
    const response = {};
    const sessionToken = ['8dcfdac1', '2a27', '46df', 'bd09', 'ec35ea84ccdb'].join('-');

    expect(
      Reflect.getMetadata(PUBLIC_ROUTE_KEY, AuthController.prototype.logout),
    ).toBe(true);
    await expect(
      controller.logout({
        cookies: { ft_session: sessionToken },
        sessionToken: undefined,
      } as never, response as never),
    ).resolves.toEqual({ success: true });
    expect(authService.logout).toHaveBeenCalledWith(sessionToken, response);
  });

  it('remains idempotent when the session cookie is missing', async () => {
    const authService = {
      logout: vi.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: vi.fn((key: string) => key === 'sessionCookieName' ? 'ft_session' : undefined),
    };
    const controller = new AuthController(authService as never, configService as never);
    const response = {};
    const request = { cookies: {} };

    await expect(
      controller.logout(request as never, response as never),
    ).resolves.toEqual({ success: true });
    await expect(
      controller.logout(request as never, response as never),
    ).resolves.toEqual({ success: true });

    expect(authService.logout).toHaveBeenNthCalledWith(1, undefined, response);
    expect(authService.logout).toHaveBeenNthCalledWith(2, undefined, response);
  });
});
