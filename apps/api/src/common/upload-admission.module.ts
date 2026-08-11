import { Global, Module } from '@nestjs/common';

import { DownloadAdmissionInterceptor } from './download-admission.interceptor';
import { DownloadAdmissionService } from './download-admission.service';
import { UploadAdmissionService } from './upload-admission.service';

@Global()
@Module({
  providers: [
    DownloadAdmissionInterceptor,
    DownloadAdmissionService,
    UploadAdmissionService,
  ],
  exports: [
    DownloadAdmissionInterceptor,
    DownloadAdmissionService,
    UploadAdmissionService,
  ],
})
export class UploadAdmissionModule {}
