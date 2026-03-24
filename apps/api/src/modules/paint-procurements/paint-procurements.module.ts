import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { PaintProcurementsController } from './paint-procurements.controller';
import { PaintProcurementsService } from './paint-procurements.service';

@Module({
  imports: [ActivityLogsModule, WorkflowsModule],
  controllers: [PaintProcurementsController],
  providers: [PaintProcurementsService],
  exports: [PaintProcurementsService],
})
export class PaintProcurementsModule {}
