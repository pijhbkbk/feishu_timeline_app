import { Module } from '@nestjs/common';

import {
  LocalFilesystemObjectStorageService,
  ObjectStorageService,
} from './object-storage.service';

@Module({
  providers: [
    {
      provide: ObjectStorageService,
      useClass: LocalFilesystemObjectStorageService,
    },
  ],
  exports: [ObjectStorageService],
})
export class StorageModule {}
