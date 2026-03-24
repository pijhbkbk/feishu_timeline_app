import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { StandardBoardsController } from './standard-boards.controller';
import { StandardBoardsService } from './standard-boards.service';

@Module({
  imports: [ActivityLogsModule, WorkflowsModule],
  controllers: [StandardBoardsController],
  providers: [StandardBoardsService],
  exports: [StandardBoardsService],
})
export class StandardBoardsModule {}
