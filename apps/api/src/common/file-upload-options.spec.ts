import { readFileSync, readdirSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, relative } from 'node:path';

import {
  CanActivate,
  Controller,
  ExecutionContext,
  Injectable,
  Module,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ATTACHMENT_MAX_FILE_SIZE_BYTES } from '../modules/attachments/attachments.rules';
import {
  API_UPLOAD_MAX_FILE_SIZE_BYTES,
  SECURE_SINGLE_FILE_UPLOAD_OPTIONS,
  SecureSingleFileInterceptor,
  bindUploadAdmissionLeaseToHttpLifecycle,
  normalizeMultipartOriginalFileName,
} from './file-upload-options';
import { UploadAdmissionService } from './upload-admission.service';

const EXPECTED_SECURED_UPLOAD_CONTROLLERS = [
  'modules/attachments/attachments.controller.ts',
  'modules/performance-tests/performance-tests.controller.ts',
  'modules/r26-read-model/r26-read-model.controller.ts',
  'modules/r26-read-model/r26-read-model.controller.ts',
  'modules/reviews/reviews.controller.ts',
  'modules/reviews/reviews.controller.ts',
  'modules/reviews/reviews.controller.ts',
  'modules/samples/samples.controller.ts',
];

const scannerProbe = vi.fn();
const storageProbe = vi.fn();
const databaseProbe = vi.fn();
let controllerCompletion: Promise<void> | null = null;
const uploadHandler = vi.fn(async (file: { size: number; originalname: string } | undefined) => {
  if (controllerCompletion) await controllerCompletion;
  scannerProbe();
  storageProbe();
  databaseProbe();

  return {
    size: file?.size ?? 0,
    originalName: file?.originalname ?? null,
  };
});

@Injectable()
class ProbeAuthenticationGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      authUser?: { id: string };
    }>();
    const rawActor = request.headers['x-probe-actor'];
    request.authUser = {
      id: typeof rawActor === 'string' && rawActor ? rawActor : 'default-probe-actor',
    };
    return true;
  }
}

@Controller('projects/:projectId/upload-policy-probe')
class UploadPolicyProbeController {
  @Post()
  @UseInterceptors(SecureSingleFileInterceptor('file'))
  upload(@UploadedFile() file: { size: number; originalname: string } | undefined) {
    return uploadHandler(file);
  }
}

@Module({
  controllers: [UploadPolicyProbeController],
  providers: [
    UploadAdmissionService,
    {
      provide: ConfigService,
      useValue: {
        get: (key: string) =>
          ({
            uploadAdmissionGlobalLimit: 2,
            uploadAdmissionPerActorLimit: 1,
            uploadAdmissionPerTargetLimit: 2,
            uploadAdmissionRateMaxRequests: 20,
            uploadAdmissionRateWindowMs: 60_000,
          })[key],
      },
    },
    {
      provide: APP_GUARD,
      useClass: ProbeAuthenticationGuard,
    },
  ],
})
class UploadPolicyProbeModule {}

describe('secure single-file upload policy', () => {
  it('sets strict transport limits and shares the business file-size boundary', () => {
    expect(SECURE_SINGLE_FILE_UPLOAD_OPTIONS).toEqual({
      limits: {
        fileSize: 20 * 1024 * 1024,
        files: 1,
        fields: 4,
        parts: 6,
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
    app = await NestFactory.create(UploadPolicyProbeModule, {
      abortOnError: false,
      logger: ['error'],
    });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/projects/project-1/upload-policy-probe`;
  });

  afterAll(async () => {
    if (app) await app.close();
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

  it('rejects excess concurrency before Multer buffers the body or any downstream work starts', async () => {
    uploadHandler.mockClear();
    scannerProbe.mockClear();
    storageProbe.mockClear();
    databaseProbe.mockClear();
    const admissionGate = app.get(UploadAdmissionService);
    const heldLease = admissionGate.acquire({
      authUser: { id: 'busy-actor' },
      params: { projectId: 'project-1' },
    } as never);
    const observedAtAdmission: Array<{
      file: unknown;
      contentLength: string | string[] | undefined;
      transferEncoding: string | string[] | undefined;
    }> = [];
    const acquireSpy = vi
      .spyOn(admissionGate, 'acquire')
      .mockImplementationOnce((request) => {
        observedAtAdmission.push({
          file: (request as { file?: unknown }).file,
          contentLength: request.headers['content-length'],
          transferEncoding: request.headers['transfer-encoding'],
        });
        return Reflect.apply(
          UploadAdmissionService.prototype.acquire,
          admissionGate,
          [request],
        );
      });

    try {
      const response = await postChunkedMultipart(
        baseUrl,
        'busy-actor',
        'rejected-before-buffering.bin',
        1024,
      );

      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBe('1');
      expect(JSON.parse(response.body)).toMatchObject({
        statusCode: 429,
        code: 'UPLOAD_PER_ACTOR_CONCURRENCY_LIMIT',
      });
      expect(observedAtAdmission).toEqual([
        {
          file: undefined,
          contentLength: undefined,
          transferEncoding: 'chunked',
        },
      ]);
      expect(uploadHandler).not.toHaveBeenCalled();
      expect(scannerProbe).not.toHaveBeenCalled();
      expect(storageProbe).not.toHaveBeenCalled();
      expect(databaseProbe).not.toHaveBeenCalled();
    } finally {
      acquireSpy.mockRestore();
      heldLease.release();
    }
  });

  it('enforces the Busboy 20 MiB file limit for chunked bodies without Content-Length', async () => {
    uploadHandler.mockClear();
    const admissionGate = app.get(UploadAdmissionService);
    const observedHeaders: Array<Record<string, string | string[] | undefined>> = [];
    const acquireSpy = vi.spyOn(admissionGate, 'acquire').mockImplementationOnce((request) => {
      observedHeaders.push(request.headers);
      return Reflect.apply(
        UploadAdmissionService.prototype.acquire,
        admissionGate,
        [request],
      );
    });

    try {
      const response = await postChunkedMultipart(
        baseUrl,
        'chunked-limit-actor',
        'oversized-chunked.bin',
        API_UPLOAD_MAX_FILE_SIZE_BYTES + 1,
      );

      expect(response.statusCode).toBe(413);
      expect(observedHeaders[0]?.['content-length']).toBeUndefined();
      expect(observedHeaders[0]?.['transfer-encoding']).toBe('chunked');
      expect(uploadHandler).not.toHaveBeenCalled();
    } finally {
      acquireSpy.mockRestore();
    }
  });

  it('holds the admission lease until controller work and the HTTP response both complete', async () => {
    uploadHandler.mockClear();
    scannerProbe.mockClear();
    storageProbe.mockClear();
    databaseProbe.mockClear();
    let completeController!: () => void;
    controllerCompletion = new Promise<void>((resolve) => {
      completeController = resolve;
    });
    const firstForm = new FormData();
    firstForm.append('file', new Blob([new Uint8Array([0x01])]), 'first.bin');
    const firstResponsePromise = fetch(baseUrl, {
      method: 'POST',
      headers: { 'x-probe-actor': 'lease-actor' },
      body: firstForm,
    });

    await vi.waitFor(() => expect(uploadHandler).toHaveBeenCalledTimes(1));

    const secondForm = new FormData();
    secondForm.append('file', new Blob([new Uint8Array([0x02])]), 'second.bin');
    const secondResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'x-probe-actor': 'lease-actor' },
      body: secondForm,
    });

    expect(secondResponse.status).toBe(429);
    expect(secondResponse.headers.get('retry-after')).toBe('1');
    expect(await secondResponse.json()).toMatchObject({
      code: 'UPLOAD_PER_ACTOR_CONCURRENCY_LIMIT',
    });
    expect(uploadHandler).toHaveBeenCalledTimes(1);
    expect(scannerProbe).not.toHaveBeenCalled();
    expect(storageProbe).not.toHaveBeenCalled();
    expect(databaseProbe).not.toHaveBeenCalled();

    controllerCompletion = null;
    completeController();
    const firstResponse = await firstResponsePromise;
    expect(firstResponse.status).toBe(201);

    const thirdForm = new FormData();
    thirdForm.append('file', new Blob([new Uint8Array([0x03])]), 'third.bin');
    const thirdResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'x-probe-actor': 'lease-actor' },
      body: thirdForm,
    });
    expect(thirdResponse.status).toBe(201);
    expect(uploadHandler).toHaveBeenCalledTimes(2);
  });

  it('keeps the lease after client abort until non-cancelled downstream work settles', async () => {
    uploadHandler.mockClear();
    scannerProbe.mockClear();
    storageProbe.mockClear();
    databaseProbe.mockClear();
    let completeController!: () => void;
    controllerCompletion = new Promise<void>((resolve) => {
      completeController = resolve;
    });
    const abortController = new AbortController();
    const firstForm = new FormData();
    firstForm.append('file', new Blob([new Uint8Array([0x01])]), 'aborted.bin');
    const firstResponsePromise = fetch(baseUrl, {
      method: 'POST',
      headers: { 'x-probe-actor': 'aborted-actor' },
      body: firstForm,
      signal: abortController.signal,
    });

    await vi.waitFor(() => expect(uploadHandler).toHaveBeenCalledTimes(1));
    abortController.abort();
    await expect(firstResponsePromise).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 25));

    const blockedForm = new FormData();
    blockedForm.append('file', new Blob([new Uint8Array([0x02])]), 'blocked.bin');
    const blockedResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'x-probe-actor': 'aborted-actor' },
      body: blockedForm,
    });
    expect(blockedResponse.status).toBe(429);
    expect(await blockedResponse.json()).toMatchObject({
      code: 'UPLOAD_PER_ACTOR_CONCURRENCY_LIMIT',
    });
    expect(uploadHandler).toHaveBeenCalledTimes(1);

    controllerCompletion = null;
    completeController();
    await vi.waitFor(() => expect(scannerProbe).toHaveBeenCalled());

    const admittedForm = new FormData();
    admittedForm.append('file', new Blob([new Uint8Array([0x03])]), 'admitted.bin');
    await vi.waitFor(async () => {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'x-probe-actor': 'aborted-actor' },
        body: admittedForm,
      });
      expect(response.status).toBe(201);
    });
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

  it('restores UTF-8 multipart filenames before the controller', async () => {
    uploadHandler.mockClear();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([0x01])]), 'R23-同名材料.pdf');

    const response = await fetch(baseUrl, { method: 'POST', body: form });

    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({
      size: 1,
      originalName: 'R23-同名材料.pdf',
    });
    expect(uploadHandler).toHaveBeenCalledTimes(1);
  });

  it('accepts the replacement boundary of one file plus four business fields', async () => {
    uploadHandler.mockClear();
    const form = new FormData();
    form.append('entityType', 'PROJECT');
    form.append('entityId', 'project-1');
    form.append('materialType', '颜色编号确认单');
    form.append('replacesAttachmentId', 'attachment-1');
    form.append('file', new Blob([new Uint8Array([0x01])]), 'replacement.pdf');

    const response = await fetch(baseUrl, { method: 'POST', body: form });

    expect(response.ok).toBe(true);
    expect(uploadHandler).toHaveBeenCalledTimes(1);
  });
});

describe('multipart filename normalization', () => {
  it('decodes UTF-8 bytes exposed as latin1 and preserves genuine latin1 names', () => {
    const mojibake = Buffer.from('R23-同名材料.pdf', 'utf8').toString('latin1');

    expect(normalizeMultipartOriginalFileName(mojibake)).toBe('R23-同名材料.pdf');
    expect(normalizeMultipartOriginalFileName('café.pdf')).toBe('café.pdf');
    expect(normalizeMultipartOriginalFileName('plain.pdf')).toBe('plain.pdf');
  });
});

describe('upload admission HTTP lifecycle', () => {
  it('does not release after work settles until response finish, then cleans listeners once', () => {
    const request = new EventEmitter() as EventEmitter & { aborted?: boolean };
    const response = new EventEmitter() as EventEmitter & { writableFinished?: boolean };
    const release = vi.fn();

    const lifecycle = bindUploadAdmissionLeaseToHttpLifecycle(request, response, { release });

    lifecycle.markDownstreamWorkSettled();
    expect(release).not.toHaveBeenCalled();
    expect(response.listenerCount('finish')).toBe(1);
    response.emit('finish');
    response.emit('close');
    request.emit('aborted');

    expect(release).toHaveBeenCalledTimes(1);
    expect(response.listenerCount('finish')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
    expect(response.listenerCount('error')).toBe(0);
    expect(request.listenerCount('aborted')).toBe(0);
    expect(request.listenerCount('error')).toBe(0);
  });

  it.each([
    ['response close', 'response', 'close'],
    ['response error', 'response', 'error'],
    ['request aborted', 'request', 'aborted'],
    ['request error', 'request', 'error'],
  ] as const)('waits for downstream work after early %s', (_label, emitterName, event) => {
    const request = new EventEmitter() as EventEmitter & { aborted?: boolean };
    const response = new EventEmitter() as EventEmitter & { writableFinished?: boolean };
    const release = vi.fn();
    const lifecycle = bindUploadAdmissionLeaseToHttpLifecycle(request, response, { release });

    (emitterName === 'request' ? request : response).emit(event);
    expect(release).not.toHaveBeenCalled();
    lifecycle.markDownstreamWorkSettled();
    lifecycle.markDownstreamWorkSettled();

    expect(release).toHaveBeenCalledTimes(1);
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

function postChunkedMultipart(
  targetUrl: string,
  actorId: string,
  fileName: string,
  fileSize: number,
) {
  const target = new URL(targetUrl);
  const boundary = 'r27a-upload-admission-boundary';
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);

  return new Promise<{
    statusCode: number | undefined;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }>((resolve, reject) => {
    let responseStarted = false;
    const request = httpRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: 'POST',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          'x-probe-actor': actorId,
        },
      },
      (response) => {
        responseStarted = true;
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    request.on('error', (error) => {
      if (!responseStarted) reject(error);
    });
    request.write(prefix);
    request.write(Buffer.alloc(fileSize, 0x61));
    request.end(suffix);
  });
}
