import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AuthController } from './auth.controller';

function createController(loginResult: { enabled: boolean; loginUrl: string | null }) {
  const authService = {
    getFeishuLoginUrl: vi.fn().mockResolvedValue(loginResult),
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
