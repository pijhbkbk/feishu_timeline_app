import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { ColorExitsController } from './color-exits.controller';
import { ColorExitsService } from './color-exits.service';

@Module({
  imports: [ActivityLogsModule, WorkflowsModule],
  controllers: [ColorExitsController],
  providers: [ColorExitsService],
  exports: [ColorExitsService],
})
export class ColorExitsModule {}
