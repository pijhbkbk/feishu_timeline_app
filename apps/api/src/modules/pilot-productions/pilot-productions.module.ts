import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { PilotProductionsController } from './pilot-productions.controller';
import { PilotProductionsService } from './pilot-productions.service';

@Module({
  imports: [ActivityLogsModule, WorkflowsModule],
  controllers: [PilotProductionsController],
  providers: [PilotProductionsService],
})
export class PilotProductionsModule {}
