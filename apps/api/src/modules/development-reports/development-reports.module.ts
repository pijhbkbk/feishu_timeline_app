import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { DevelopmentReportsController } from './development-reports.controller';
import { DevelopmentReportsService } from './development-reports.service';

@Module({
  imports: [ActivityLogsModule, AuthModule, WorkflowsModule],
  controllers: [DevelopmentReportsController],
  providers: [DevelopmentReportsService],
})
export class DevelopmentReportsModule {}
