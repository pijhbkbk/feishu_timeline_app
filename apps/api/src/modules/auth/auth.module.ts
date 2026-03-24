import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { FeishuModule } from '../feishu/feishu.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './roles.guard';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionStoreService } from './session-store.service';

@Module({
  imports: [FeishuModule, UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionStoreService,
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
