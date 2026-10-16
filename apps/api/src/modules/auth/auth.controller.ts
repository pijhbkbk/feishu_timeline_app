import { AccountSelfService } from '../../common/team-membership';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  GoneException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import { CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import type { AuthenticatedRequest, AuthenticatedUser } from './auth.types';
import { AuthService } from './auth.service';

type MockLoginBody = {
  username?: unknown;
  name?: unknown;
  roleCodes?: unknown;
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
    return this.authService.getSessionResponse(
      this.getSessionTokenFromCookie(request),
    );
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
    void request; void response;
    throw new GoneException('第三方登录入口已移除，请使用系统账号。');
  }

  @Public()
  @Get('feishu/login-url')
  async getFeishuLoginUrl() {
    throw new GoneException('第三方登录入口已移除，请使用系统账号。');
  }

  @Public()
  @Post('feishu/callback')
  async feishuCallback() {
    throw new GoneException('第三方登录入口已移除，请使用系统账号。');
  }

  @Public()
  @AccountSelfService()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(
      this.getSessionTokenFromCookie(request),
      response,
    );

    return { success: true };
  }

  @AccountSelfService()
  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  private getSessionTokenFromCookie(request: AuthenticatedRequest) {
    const cookieName = this.configService.get<string>('sessionCookieName') ?? 'ft_session';
    const sessionToken = request.cookies?.[cookieName];

    return typeof sessionToken === 'string' ? sessionToken : undefined;
  }

}
