import { Global, Module } from '@nestjs/common';

import { UploadAdmissionService } from './upload-admission.service';

@Global()
@Module({
  providers: [UploadAdmissionService],
  exports: [UploadAdmissionService],
})
export class UploadAdmissionModule {}
