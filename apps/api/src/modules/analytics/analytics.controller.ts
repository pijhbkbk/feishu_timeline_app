import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiCookieAuth('ft_session')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Permissions('dashboard.read')
  @ApiOperation({ summary: '获取数据中心总览' })
  @Get('overview')
  getOverview(@CurrentUser() actor: AuthenticatedUser) {
    return this.analyticsService.getOverview(actor);
  }
}
