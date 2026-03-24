import { Module } from '@nestjs/common';

import { StorageModule } from '../../infra/storage/storage.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [ActivityLogsModule, StorageModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
