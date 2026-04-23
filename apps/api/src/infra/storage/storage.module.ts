import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
  LocalFilesystemObjectStorageService,
  ObjectStorageService,
} from './object-storage.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: ObjectStorageService,
      useClass: LocalFilesystemObjectStorageService,
    },
  ],
  exports: [ObjectStorageService],
})
export class StorageModule {}
