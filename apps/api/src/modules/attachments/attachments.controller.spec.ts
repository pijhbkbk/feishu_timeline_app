import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

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
        fileName: '安全报告.pdf',
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
      "inline; filename*=UTF-8''%E5%AE%89%E5%85%A8%E6%8A%A5%E5%91%8A.pdf",
    );
  });
});
