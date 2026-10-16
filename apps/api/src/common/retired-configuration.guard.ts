import { GoneException, Injectable, type CanActivate } from '@nestjs/common';

/** Old configuration writes must never bypass global roles and claimed tasks. */
@Injectable()
export class RetiredConfigurationGuard implements CanActivate {
  canActivate(): never {
    throw new GoneException({
      code: 'LEGACY_CONFIGURATION_RETIRED',
      message: '系统已改用人员角色和任务领取；请在人员页面分配角色，在我的工作中领取或转派任务。',
    });
  }
}
