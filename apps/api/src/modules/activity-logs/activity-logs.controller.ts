import { Controller, Get, Param } from '@nestjs/common';

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
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.activityLogsService.getProjectLogTimeline(projectId, actor);
  }
}
