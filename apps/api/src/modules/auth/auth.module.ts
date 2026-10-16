import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { FeishuModule } from '../feishu/feishu.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PermissionsGuard } from './permissions.guard';
import { ProjectAccessService } from './project-access.service';
import { RolesGuard } from './roles.guard';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionStoreService } from './session-store.service';
import { NativeAuthController } from './native-auth.controller';
import { NativeAuthService } from './native-auth.service';
import { NativePasswordService } from './native-password.service';

@Module({
  imports: [FeishuModule, UsersModule],
  controllers: [AuthController, NativeAuthController],
  providers: [
    AuthService,
    NativeAuthService,
    NativePasswordService,
    PermissionsGuard,
    ProjectAccessService,
    SessionStoreService,
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [AuthService, NativeAuthService, ProjectAccessService],
})
export class AuthModule {}
