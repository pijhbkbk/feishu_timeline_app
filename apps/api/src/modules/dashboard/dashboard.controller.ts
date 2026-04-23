import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiCookieAuth('ft_session')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Permissions('dashboard.read')
  @ApiOperation({ summary: '获取仪表盘总览' })
  @Get('overview')
  getOverview(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboardService.getOverview(actor);
  }

  @Permissions('dashboard.read')
  @ApiOperation({ summary: '获取项目阶段分布' })
  @Get('stage-distribution')
  getStageDistribution(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboardService.getStageDistribution(actor);
  }

  @Permissions('dashboard.read')
  @ApiOperation({ summary: '获取最近评审记录' })
  @Get('recent-reviews')
  getRecentReviews(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboardService.getRecentReviews(actor);
  }

  @Permissions('dashboard.read')
  @ApiOperation({ summary: '获取风险项目清单' })
  @Get('risk-projects')
  getRiskProjects(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboardService.getRiskProjects(actor);
  }
}
