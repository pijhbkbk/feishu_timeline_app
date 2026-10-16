import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { PaintProcurementsController } from './paint-procurements.controller';
import { PaintProcurementsService } from './paint-procurements.service';

@Module({
  imports: [ActivityLogsModule, AuthModule, WorkflowsModule],
  controllers: [PaintProcurementsController],
  providers: [PaintProcurementsService],
  exports: [PaintProcurementsService],
})
export class PaintProcurementsModule {}
