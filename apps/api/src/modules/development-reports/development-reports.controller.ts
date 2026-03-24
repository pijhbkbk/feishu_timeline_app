import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DevelopmentReportsService } from './development-reports.service';

@Controller('projects/:projectId/development-report')
export class DevelopmentReportsController {
  constructor(
    private readonly developmentReportsService: DevelopmentReportsService,
  ) {}

  @Get()
  getWorkspace(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.developmentReportsService.getWorkspace(projectId, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Put()
  saveReport(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.developmentReportsService.saveReport(projectId, body, actor);
  }

  @Roles('admin', 'project_manager', 'process_engineer')
  @Post('submit')
  submitReport(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.developmentReportsService.submitReport(projectId, body, actor);
  }
}
