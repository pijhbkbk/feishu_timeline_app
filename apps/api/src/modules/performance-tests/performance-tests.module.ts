import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { PerformanceTestsController } from './performance-tests.controller';
import { PerformanceTestsService } from './performance-tests.service';

@Module({
  imports: [ActivityLogsModule, AttachmentsModule, WorkflowsModule],
  controllers: [PerformanceTestsController],
  providers: [PerformanceTestsService],
  exports: [PerformanceTestsService],
})
export class PerformanceTestsModule {}
