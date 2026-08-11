import { Module } from '@nestjs/common';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { SamplesController } from './samples.controller';
import { SamplesService } from './samples.service';

@Module({
  imports: [ActivityLogsModule, AttachmentsModule, AuthModule, WorkflowsModule],
  controllers: [SamplesController],
  providers: [SamplesService],
})
export class SamplesModule {}
