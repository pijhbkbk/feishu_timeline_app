import { GoneException, Module } from '@nestjs/common';
import { FEISHU_AUTH_ADAPTER } from './feishu.constants';

// No network-capable identity adapter is registered in the application.
const disabledIdentity = {
  isConfigured: () => false,
  getAuthorizationUrl: async () => { throw new GoneException('第三方登录入口已移除，请使用系统账号。'); },
  exchangeCodeForProfile: async () => { throw new GoneException('第三方登录入口已移除，请使用系统账号。'); },
};

@Module({ providers: [{ provide: FEISHU_AUTH_ADAPTER, useValue: disabledIdentity }], exports: [FEISHU_AUTH_ADAPTER] })
export class FeishuModule {}
