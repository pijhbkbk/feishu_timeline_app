import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import { CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import type { AuthenticatedRequest, AuthenticatedUser } from './auth.types';
import { AuthService } from './auth.service';

type MockLoginBody = {
  username?: string;
  name?: string;
  roleCodes?: string[];
};

type FeishuCallbackBody = {
  code: string;
  state?: string | null;
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
  @Get('feishu/login-url')
  async getFeishuLoginUrl() {
    return this.authService.getFeishuLoginUrl();
  }

  @Public()
  @Post('feishu/callback')
  async feishuCallback(
    @Body() body: FeishuCallbackBody,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.loginWithFeishu(body, response);
  }

  @Post('logout')
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
}
