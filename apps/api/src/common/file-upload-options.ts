import {
  BadRequestException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type Type,
  mixin,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

export const API_UPLOAD_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

type FileInterceptorOptions = NonNullable<Parameters<typeof FileInterceptor>[1]>;

type MulterOptionsWithFieldNestingLimit = Omit<FileInterceptorOptions, 'limits'> & {
  readonly limits: NonNullable<FileInterceptorOptions['limits']> & {
    readonly fieldNestingDepth: number;
  };
};

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
    override async intercept(context: ExecutionContext, next: CallHandler) {
      try {
        const result = await super.intercept(context, next);
        const request = context.switchToHttp().getRequest<{
          file?: { originalname?: string };
        }>();

        if (request.file?.originalname) {
          request.file.originalname = normalizeMultipartOriginalFileName(
            request.file.originalname,
          );
        }

        return result;
      } catch (error) {
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
