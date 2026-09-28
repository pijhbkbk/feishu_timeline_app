import { Body, Controller, GoneException, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import { nativeAuthClientAddress } from '../../common/native-auth-client';

import { AuthService } from './auth.service';
import type { AuthenticatedRequest, AuthenticatedUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { NativeJobDto, NativeLoginDto, NativePasswordChangeDto, NativeRecoveryDto, NativeRegisterDto } from './dto/native-auth.dto';
import { NativeAuthService } from './native-auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class NativeAuthController {
  constructor(private readonly native: NativeAuthService, private readonly auth: AuthService, private readonly config: ConfigService) {}

  @Public() @Post('register')
  register(@Body() body: NativeRegisterDto, @Req() request: AuthenticatedRequest) {
    return this.native.register(body, this.client(request));
  }

  @Public() @Post('login') @HttpCode(200)
  login(@Body() body: NativeLoginDto, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.native.login(body, this.client(request), this.sessionToken(request), response);
  }

  @Post('job') @HttpCode(200)
  chooseJob(@CurrentUser() actor: AuthenticatedUser, @Body() body: NativeJobDto) {
    void actor; void body;
    throw new GoneException('岗位申请已停用，请由管理员在人员表分配角色。');
  }

  @Post('password') @HttpCode(200)
  async changePassword(@CurrentUser() actor: AuthenticatedUser, @Body() body: NativePasswordChangeDto,
    @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    const result = await this.native.changePassword(actor, body, this.client(request));
    await this.auth.logout(this.sessionToken(request), response);
    return result;
  }

  @Public() @Post('recover') @HttpCode(200)
  recover(@Body() body: NativeRecoveryDto, @Req() request: AuthenticatedRequest) {
    return this.native.recover(body, this.client(request));
  }

  @Get('accounts')
  listAccounts(@CurrentUser() actor: AuthenticatedUser, @Query('q') q?: string) {
    return this.native.listAccounts(actor, q);
  }

  @Post('accounts/:userId/recovery') @HttpCode(200)
  issueRecovery(@CurrentUser() actor: AuthenticatedUser, @Param('userId') userId: string,
    @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.native.issueRecovery(actor, userId, this.client(request));
  }

  private sessionToken(request: AuthenticatedRequest) {
    const value = request.cookies?.[this.config.get<string>('sessionCookieName') ?? 'ft_session'];
    return typeof value === 'string' ? value : undefined;
  }

  private client(request: AuthenticatedRequest) {
    return nativeAuthClientAddress(request.socket.remoteAddress, request.headers['x-real-ip'],
      this.config.get<string>('nativeAuthTrustedProxyIp'));
  }
}
