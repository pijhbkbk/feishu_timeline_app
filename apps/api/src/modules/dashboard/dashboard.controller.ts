import { Controller, Get } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  getOverview(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboardService.getOverview(actor);
  }

  @Get('stage-distribution')
  getStageDistribution(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboardService.getStageDistribution(actor);
  }

  @Get('recent-reviews')
  getRecentReviews(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboardService.getRecentReviews(actor);
  }

  @Get('risk-projects')
  getRiskProjects(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboardService.getRiskProjects(actor);
  }
}

