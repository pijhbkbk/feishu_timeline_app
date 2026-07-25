import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import { CurrentUser } from './current-user.decorator';
import { FEISHU_OAUTH_STATE_COOKIE_NAME } from './auth.constants';
import { Public } from './public.decorator';
import type { AuthenticatedRequest, AuthenticatedUser } from './auth.types';
import { AuthService } from './auth.service';

type MockLoginBody = {
  username?: unknown;
  name?: unknown;
  roleCodes?: unknown;
};

type FeishuCallbackBody = {
  code: unknown;
  state?: unknown;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get('session')
  async getSession(@Req() request: AuthenticatedRequest) {
    const cookieName = this.configService.get<string>('sessionCookieName') ?? 'ft_session';
    const sessionToken = request.cookies?.[cookieName];

    return this.authService.getSessionResponse(sessionToken);
  }

  @Public()
  @Post('mock-login')
  async mockLogin(
    @Body() body: MockLoginBody,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.loginWithMock(body, response);
  }

  @Public()
  @Get('feishu/start')
  async startFeishuLogin(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const result = await this.authService.getFeishuLoginUrl(
      response,
      this.getAuthClientIdentifier(request),
    );

    if (!result.enabled || !result.loginUrl) {
      throw new ServiceUnavailableException('飞书登录未配置。');
    }

    response.redirect(HttpStatus.FOUND, result.loginUrl);
  }

  @Public()
  @Get('feishu/login-url')
  async getFeishuLoginUrl(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.getFeishuLoginUrl(
      response,
      this.getAuthClientIdentifier(request),
    );
  }

  @Public()
  @Post('feishu/callback')
  async feishuCallback(
    @Body() body: FeishuCallbackBody,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const browserState = request.cookies?.[FEISHU_OAUTH_STATE_COOKIE_NAME];

    return this.authService.loginWithFeishu(
      body,
      browserState,
      response,
      this.getAuthClientIdentifier(request),
    );
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(request.sessionToken, response);

    return { success: true };
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  private getAuthClientIdentifier(request: AuthenticatedRequest) {
    // The production Nginx configuration overwrites X-Real-IP and the API port is
    // loopback-only. Direct local/test traffic falls back to the socket address.
    const proxyClientIp = request.headers['x-real-ip'];

    if (typeof proxyClientIp === 'string' && proxyClientIp.trim()) {
      return proxyClientIp.trim().slice(0, 128);
    }

    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}
