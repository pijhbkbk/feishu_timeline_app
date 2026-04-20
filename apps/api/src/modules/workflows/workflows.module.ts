import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowDeadlineService } from './workflow-deadline.service';
import { WorkflowRecurringService } from './workflow-recurring.service';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [AuthModule, ActivityLogsModule, QueueModule],
  controllers: [WorkflowsController],
  providers: [WorkflowDeadlineService, WorkflowRecurringService, WorkflowsService],
  exports: [WorkflowDeadlineService, WorkflowRecurringService, WorkflowsService],
})
export class WorkflowsModule {}
