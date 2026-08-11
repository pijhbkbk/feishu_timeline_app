import { Module } from '@nestjs/common';

import { StorageModule } from '../../infra/storage/storage.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import {
  ConfiguredMalwareScanner,
  MalwareScanner,
} from './malware-scanner.service';

@Module({
  imports: [ActivityLogsModule, AuthModule, StorageModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    {
      provide: MalwareScanner,
      useClass: ConfiguredMalwareScanner,
    },
  ],
  exports: [AttachmentsService, MalwareScanner],
})
export class AttachmentsModule {}
