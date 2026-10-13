import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DownloadAdmissionService } from '../../common/download-admission.service';
import { DownloadAdmissionInterceptor } from '../../common/download-admission.interceptor';
import type { AuthenticatedRequest } from '../auth/auth.types';

/** Small, authenticated derivatives have a separate budget from full originals.
 * Decoding remains bounded to two simultaneous requests across the process;
 * SheetImagesService enforces 5 MiB input, 40 MP and 512 KiB output limits.
 * Reuse the existing HTTP lifecycle and Retry-After handling without changing
 * the original attachment admission policy or its rate counters.
 */
@Injectable()
export class SheetThumbnailAdmissionService extends DownloadAdmissionService {
  constructor() {
    super(new ConfigService({
      downloadAdmissionGlobalLimit: 2,
      downloadAdmissionPerActorLimit: 2,
      downloadAdmissionPerTargetLimit: 2,
      downloadAdmissionRateMaxRequests: 120,
      downloadAdmissionRateWindowMs: 60_000,
    }));
  }
  override acquire(request: AuthenticatedRequest) {
    // The derivative URL carries a stable SheetImage id. The shared original
    // admission expects its target under attachmentId; never mutate the actual
    // request passed to the controller or skip the mandatory target check.
    const mapped = Object.create(request) as AuthenticatedRequest;
    mapped.params = { ...request.params, attachmentId: typeof request.params?.id === 'string' ? request.params.id : '' };
    return super.acquire(mapped);
  }
}

@Injectable()
export class SheetThumbnailAdmissionInterceptor extends DownloadAdmissionInterceptor {
  constructor(@Inject(SheetThumbnailAdmissionService) admission: SheetThumbnailAdmissionService) {
    super(admission);
  }
}
