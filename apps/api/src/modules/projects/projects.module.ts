import { ApprovedReportService } from './approved-report.service';
import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AuthModule, WorkflowsModule, ActivityLogsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ApprovedReportService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
