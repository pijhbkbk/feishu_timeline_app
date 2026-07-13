import { readFileSync, readdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join, relative } from 'node:path';

import {
  Controller,
  Module,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ATTACHMENT_MAX_FILE_SIZE_BYTES } from '../modules/attachments/attachments.rules';
import {
  API_UPLOAD_MAX_FILE_SIZE_BYTES,
  SECURE_SINGLE_FILE_UPLOAD_OPTIONS,
  SecureSingleFileInterceptor,
} from './file-upload-options';

const EXPECTED_SECURED_UPLOAD_CONTROLLERS = [
  'modules/attachments/attachments.controller.ts',
  'modules/performance-tests/performance-tests.controller.ts',
  'modules/reviews/reviews.controller.ts',
  'modules/reviews/reviews.controller.ts',
  'modules/reviews/reviews.controller.ts',
  'modules/samples/samples.controller.ts',
];

const uploadHandler = vi.fn((file: { size: number } | undefined) => ({
  size: file?.size ?? 0,
}));

@Controller('upload-policy-probe')
class UploadPolicyProbeController {
  @Post()
  @UseInterceptors(SecureSingleFileInterceptor('file'))
  upload(@UploadedFile() file: { size: number } | undefined) {
    return uploadHandler(file);
  }
}

@Module({ controllers: [UploadPolicyProbeController] })
class UploadPolicyProbeModule {}

describe('secure single-file upload policy', () => {
  it('sets strict transport limits and shares the business file-size boundary', () => {
    expect(SECURE_SINGLE_FILE_UPLOAD_OPTIONS).toEqual({
      limits: {
        fileSize: 20 * 1024 * 1024,
        files: 1,
        fields: 4,
        parts: 5,
        fieldNameSize: 64,
        fieldSize: 1024,
        headerPairs: 20,
        fieldNestingDepth: 0,
      },
    });
    expect(API_UPLOAD_MAX_FILE_SIZE_BYTES).toBe(ATTACHMENT_MAX_FILE_SIZE_BYTES);
    expect(Object.isFrozen(SECURE_SINGLE_FILE_UPLOAD_OPTIONS)).toBe(true);
    expect(Object.isFrozen(SECURE_SINGLE_FILE_UPLOAD_OPTIONS.limits)).toBe(true);
  });

  it('applies the shared policy to every single-file upload route', () => {
    const sourceRoot = join(__dirname, '..');
    const uploadCalls = listControllerPaths(sourceRoot).flatMap((controllerPath) => {
      const source = readFileSync(controllerPath, 'utf8');

      return Array.from(
        source.matchAll(/SecureSingleFileInterceptor\(\s*['"]file['"]\s*\)/g),
        (match) => ({
          controller: relative(sourceRoot, controllerPath),
          call: match[0],
        }),
      );
    });

    expect(uploadCalls.map(({ controller }) => controller).sort()).toEqual(
      EXPECTED_SECURED_UPLOAD_CONTROLLERS,
    );
    expect(uploadCalls.every(({ call }) => call.includes('SecureSingleFileInterceptor'))).toBe(true);
    expect(
      listControllerPaths(sourceRoot).some((controllerPath) =>
        /@UseInterceptors\(FileInterceptor\(\s*['"]file['"]/.test(
          readFileSync(controllerPath, 'utf8'),
        ),
      ),
    ).toBe(false);
  });
});

describe('secure single-file upload transport enforcement', () => {
  let baseUrl: string;
  let app: Awaited<ReturnType<typeof NestFactory.create>>;

  beforeAll(async () => {
    app = await NestFactory.create(UploadPolicyProbeModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/upload-policy-probe`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a multipart file before the controller when it exceeds 20 MiB', async () => {
    uploadHandler.mockClear();
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(API_UPLOAD_MAX_FILE_SIZE_BYTES + 1)]),
      'oversized.bin',
    );

    const response = await fetch(baseUrl, {
      method: 'POST',
      body: form,
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(413);
    expect(uploadHandler).not.toHaveBeenCalled();
  });

  it('rejects nested multipart field names before the controller', async () => {
    uploadHandler.mockClear();
    const form = new FormData();
    form.append('metadata[nested]', 'blocked');
    form.append('file', new Blob([new Uint8Array([0x01])]), 'small.bin');

    const response = await fetch(baseUrl, {
      method: 'POST',
      body: form,
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
    expect(uploadHandler).not.toHaveBeenCalled();
  });
});

function listControllerPaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return listControllerPaths(entryPath);
    }

    return entry.name.endsWith('.controller.ts') ? [entryPath] : [];
  });
}
