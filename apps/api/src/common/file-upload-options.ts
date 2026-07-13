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
    parts: 5,
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
        return await super.intercept(context, next);
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

function isFieldNestingLimitError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'LIMIT_FIELD_NESTING'
  );
}
