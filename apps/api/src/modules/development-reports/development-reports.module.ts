import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { DevelopmentReportsController } from './development-reports.controller';
import { DevelopmentReportsService } from './development-reports.service';

@Module({
  imports: [ActivityLogsModule, WorkflowsModule],
  controllers: [DevelopmentReportsController],
  providers: [DevelopmentReportsService],
})
export class DevelopmentReportsModule {}
