import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  PUBLIC_ROUTE_KEY,
  getFeishuOAuthStateCookieName,
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

describe('AuthController Feishu start', () => {
  it('redirects the browser to the server-generated Feishu CN URL', async () => {
    const loginUrl =
      'https://accounts.feishu.cn/open-apis/authen/v1/index?response_type=code&state=test';
    const { controller, authService, request, response } = createController({
      enabled: true,
      loginUrl,
    });

    await controller.startFeishuLogin(request as never, response as never);

    expect(authService.getFeishuLoginUrl).toHaveBeenCalledWith(
      response,
      '203.0.113.8',
    );
    expect(response.redirect).toHaveBeenCalledWith(HttpStatus.FOUND, loginUrl);
  });

  it('does not redirect when Feishu authentication is not configured', async () => {
    const { controller, request, response } = createController({
      enabled: false,
      loginUrl: null,
    });

    await expect(
      controller.startFeishuLogin(request as never, response as never),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(response.redirect).not.toHaveBeenCalled();
  });
});

describe('AuthController Feishu callback', () => {
  it('selects the state-specific cookie for concurrent browser login attempts', async () => {
    const { controller, authService, request, response } = createController({
      enabled: true,
      loginUrl: 'https://accounts.feishu.cn/open-apis/authen/v1/index',
    });
    const firstState = '00000000-0000-4000-8000-000000000001';
    const secondState = '00000000-0000-4000-8000-000000000002';
    request.cookies = {
      [getFeishuOAuthStateCookieName(firstState)]: firstState,
      [getFeishuOAuthStateCookieName(secondState)]: secondState,
    };

    await controller.feishuCallback(
      { code: 'first-code', state: firstState },
      request as never,
      response as never,
    );
    await controller.feishuCallback(
      { code: 'second-code', state: secondState },
      request as never,
      response as never,
    );

    expect(authService.loginWithFeishu).toHaveBeenNthCalledWith(
      1,
      { code: 'first-code', state: firstState },
      firstState,
      response,
      '203.0.113.8',
    );
    expect(authService.loginWithFeishu).toHaveBeenNthCalledWith(
      2,
      { code: 'second-code', state: secondState },
      secondState,
      response,
      '203.0.113.8',
    );
  });
});

describe('AuthController logout', () => {
  it('is public and clears an expired or missing session idempotently', async () => {
    const authService = {
      logout: vi.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: vi.fn(),
    };
    const controller = new AuthController(authService as never, configService as never);
    const response = {};

    expect(
      Reflect.getMetadata(PUBLIC_ROUTE_KEY, AuthController.prototype.logout),
    ).toBe(true);
    await expect(
      controller.logout({ sessionToken: undefined } as never, response as never),
    ).resolves.toEqual({ success: true });
    expect(authService.logout).toHaveBeenCalledWith(undefined, response);
  });
});
