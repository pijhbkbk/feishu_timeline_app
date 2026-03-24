import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { MassProductionsController } from './mass-productions.controller';
import { MassProductionsService } from './mass-productions.service';

@Module({
  imports: [ActivityLogsModule, WorkflowsModule],
  controllers: [MassProductionsController],
  providers: [MassProductionsService],
  exports: [MassProductionsService],
})
export class MassProductionsModule {}
