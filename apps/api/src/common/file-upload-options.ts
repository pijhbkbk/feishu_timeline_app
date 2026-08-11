import {
  BadRequestException,
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type Type,
  mixin,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { finalize } from 'rxjs';

import type { AuthenticatedRequest } from '../modules/auth/auth.types';
import {
  UploadAdmissionRejectedException,
  UploadAdmissionService,
  type UploadAdmissionLease,
} from './upload-admission.service';
import { API_UPLOAD_MAX_FILE_SIZE_BYTES } from './upload-security.constants';

export { API_UPLOAD_MAX_FILE_SIZE_BYTES } from './upload-security.constants';

type FileInterceptorOptions = NonNullable<Parameters<typeof FileInterceptor>[1]>;

type MulterOptionsWithFieldNestingLimit = Omit<FileInterceptorOptions, 'limits'> & {
  readonly limits: NonNullable<FileInterceptorOptions['limits']> & {
    readonly fieldNestingDepth: number;
  };
};

type UploadLifecycleEmitter = {
  once(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
};

type UploadLifecycleRequest = UploadLifecycleEmitter & {
  aborted?: boolean;
};

type UploadLifecycleResponse = UploadLifecycleEmitter & {
  writableFinished?: boolean;
};

export function bindUploadAdmissionLeaseToHttpLifecycle(
  request: UploadLifecycleRequest,
  response: UploadLifecycleResponse,
  lease: UploadAdmissionLease,
) {
  let released = false;
  let transportTerminal = Boolean(request.aborted || response.writableFinished);
  let downstreamWorkSettled = false;
  const bindings: Array<[UploadLifecycleEmitter, string]> = [
    [response, 'finish'],
    [response, 'close'],
    [response, 'error'],
    [request, 'aborted'],
    [request, 'error'],
  ];
  const releaseIfSettled = () => {
    if (!transportTerminal || !downstreamWorkSettled || released) return;
    released = true;
    for (const [emitter, event] of bindings) {
      emitter.removeListener(event, markTransportTerminal);
    }
    lease.release();
  };
  const markTransportTerminal = () => {
    if (released) return;
    transportTerminal = true;
    releaseIfSettled();
  };

  for (const [emitter, event] of bindings) {
    emitter.once(event, markTransportTerminal);
  }

  releaseIfSettled();

  return {
    markDownstreamWorkSettled() {
      if (released) return;
      downstreamWorkSettled = true;
      releaseIfSettled();
    },
  };
}

/**
 * Transport-level limits shared by every API endpoint that accepts one binary file.
 * Business-specific file type and signature validation still runs in each service.
 */
export const SECURE_SINGLE_FILE_UPLOAD_OPTIONS = Object.freeze({
  limits: Object.freeze({
    fileSize: API_UPLOAD_MAX_FILE_SIZE_BYTES,
    files: 1,
    fields: 4,
    // Busboy emits LIMIT_PART_COUNT when the internal counter reaches the
    // configured boundary, so six is the strict ceiling that permits the
    // valid replacement payload of one file plus four business fields.
    parts: 6,
    fieldNameSize: 64,
    fieldSize: 1024,
    headerPairs: 20,
    fieldNestingDepth: 0,
  }),
}) satisfies MulterOptionsWithFieldNestingLimit;

export function SecureSingleFileInterceptor(fieldName: string): Type<NestInterceptor> {
  const NestFileInterceptor = FileInterceptor(
    fieldName,
    SECURE_SINGLE_FILE_UPLOAD_OPTIONS,
  );

  @Injectable()
  class SecureSingleFileInterceptorMixin extends NestFileInterceptor {
    constructor(
      @Inject(UploadAdmissionService)
      private readonly uploadAdmissionService: UploadAdmissionService,
    ) {
      super();
    }

    override async intercept(context: ExecutionContext, next: CallHandler) {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest & {
        file?: { originalname?: string };
      }>();
      const response = context
        .switchToHttp()
        .getResponse<UploadLifecycleResponse & {
          setHeader(name: string, value: string): void;
        }>();
      let admissionLease: UploadAdmissionLease;

      try {
        admissionLease = this.uploadAdmissionService.acquire(request);
      } catch (error) {
        if (error instanceof UploadAdmissionRejectedException) {
          response.setHeader('Retry-After', String(error.retryAfterSeconds));
        }
        throw error;
      }
      const admissionLifecycle = bindUploadAdmissionLeaseToHttpLifecycle(
        request,
        response,
        admissionLease,
      );

      try {
        const result = await super.intercept(context, next);

        if (request.file?.originalname) {
          request.file.originalname = normalizeMultipartOriginalFileName(
            request.file.originalname,
          );
        }

        return result.pipe(
          finalize(() => admissionLifecycle.markDownstreamWorkSettled()),
        );
      } catch (error) {
        admissionLifecycle.markDownstreamWorkSettled();

        if (isFieldNestingLimitError(error)) {
          throw new BadRequestException('上传表单字段不允许嵌套。');
        }

        throw error;
      }
    }
  }

  return mixin(SecureSingleFileInterceptorMixin);
}

/**
 * Busboy exposes multipart header parameters as latin1. Browsers encode modern
 * filenames as UTF-8, so non-ASCII names otherwise arrive as mojibake. Only use
 * the decoded value when the latin1 bytes form valid UTF-8; this preserves
 * genuine latin1 names such as `café.pdf`.
 */
export function normalizeMultipartOriginalFileName(fileName: string) {
  const decoded = Buffer.from(fileName, 'latin1').toString('utf8');

  return decoded.includes('\uFFFD') ? fileName.normalize('NFC') : decoded.normalize('NFC');
}

function isFieldNestingLimitError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'LIMIT_FIELD_NESTING'
  );
}
