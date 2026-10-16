import 'reflect-metadata';

import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { DownloadAdmissionInterceptor } from '../../common/download-admission.interceptor';
import { PERMISSION_METADATA_KEY, ROLE_METADATA_KEY } from '../auth/auth.constants';
import { AttachmentsController } from './attachments.controller';

describe('AttachmentsController RBAC metadata', () => {
  it('protects write endpoints with attachment management roles', () => {
    const prototype = AttachmentsController.prototype;
    const expectedRoles = [
      'admin',
      'project_manager',
      'process_engineer',
      'quality_engineer',
      'purchaser',
      'reviewer',
      'finance',
    ];

    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.uploadAttachment)).toEqual(expectedRoles);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.bindAttachment)).toEqual(expectedRoles);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.unbindAttachment)).toEqual(expectedRoles);
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, prototype.deleteAttachment)).toEqual(expectedRoles);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getWorkspace)).toEqual([
      'project.read',
    ]);
    expect(
      Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.getAttachmentContent),
    ).toEqual(['project.read']);
    expect(
      Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.downloadAttachment),
    ).toEqual(['project.read']);
    expect(Reflect.getMetadata(PERMISSION_METADATA_KEY, prototype.uploadAttachment)).toEqual([
      'attachment.manage',
    ]);
  });

  it('forces downloads into a same-origin sandbox with encoded filenames', () => {
    const controller = new AttachmentsController({} as never);
    const setHeader = vi.fn();

    (controller as any).writeAttachmentResponseHeaders(
      { setHeader },
      {
        contentType: 'application/pdf',
        disposition: 'inline',
        fileName: "安全\r\n报告'()*.pdf",
        contentLength: 20971520,
      },
    );

    expect(setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'same-origin');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      "sandbox; default-src 'none'",
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      "inline; filename*=UTF-8''%E5%AE%89%E5%85%A8%0D%0A%E6%8A%A5%E5%91%8A%27%28%29%2A.pdf",
    );
    expect(setHeader).toHaveBeenCalledWith('Content-Length', '20971520');
    expect(setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(setHeader.mock.calls.flat().join(' ')).not.toContain('\r\n');
  });

  it('guards both attachment download controllers with download admission', () => {
    const prototype = AttachmentsController.prototype;
    for (const handler of [
      prototype.getAttachmentContent,
      prototype.downloadAttachment,
    ]) {
      expect(Reflect.getMetadata(INTERCEPTORS_METADATA, handler)).toContain(
        DownloadAdmissionInterceptor,
      );
    }
  });

  it('closes the source and returns a generic error if response setup fails', async () => {
    const stream = new PassThrough();
    const service = {
      getAttachmentContent: vi.fn().mockResolvedValue({
        stream,
        contentLength: 1,
        contentType: 'application/pdf',
        disposition: 'inline',
        fileName: 'report.pdf',
      }),
    };
    const controller = new AttachmentsController(service as never);
    const response = {
      setHeader: vi.fn(() => {
        throw new Error('/private/var/object-storage/report.pdf');
      }),
    };

    await expect(
      controller.getAttachmentContent(
        'attachment-1',
        undefined,
        {} as never,
        response as never,
      ),
    ).rejects.toMatchObject({ message: '附件内容暂不可用。' });
    expect(stream.closed).toBe(true);
  });
});
