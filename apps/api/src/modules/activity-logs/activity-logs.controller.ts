import { Controller, Get, Param, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ActivityLogsService } from './activity-logs.service';

@Controller('projects/:projectId/logs')
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Permissions('project.read')
  @Get()
  getProjectLogs(
    @Param('projectId') projectId: string,
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.activityLogsService.getProjectLogTimeline(projectId, actor, query);
  }

  @Permissions('project.read')
  @Get(':logId')
  getProjectLogDetail(
    @Param('projectId') projectId: string,
    @Param('logId') logId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.activityLogsService.getProjectLogDetail(projectId, logId, actor);
  }
}
