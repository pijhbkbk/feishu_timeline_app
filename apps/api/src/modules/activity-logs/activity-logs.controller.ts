import { Controller, Get, Param } from '@nestjs/common';

import { ActivityLogsService } from './activity-logs.service';

@Controller('projects/:projectId/logs')
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  getProjectLogs(@Param('projectId') projectId: string) {
    return this.activityLogsService.getProjectLogTimeline(projectId);
  }
}
