import { AttachmentTargetType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  canPreviewAttachmentMimeType,
  getAttachmentFileValidationIssue,
  parseAttachmentEntityType,
} from './attachments.rules';

describe('attachments rules', () => {
  it('accepts allowed file types and previewable mime types', () => {
    expect(
      getAttachmentFileValidationIssue({
        mimeType: 'image/png',
        fileSize: 2048,
      }),
    ).toBeNull();
    expect(canPreviewAttachmentMimeType('image/png')).toBe(true);
    expect(canPreviewAttachmentMimeType('application/pdf')).toBe(true);
  });

  it('rejects invalid mime types and entity types', () => {
    expect(
      getAttachmentFileValidationIssue({
        mimeType: 'application/zip',
        fileSize: 2048,
      }),
    ).toBe('当前文件类型不在系统允许范围内。');
    expect(parseAttachmentEntityType('UNKNOWN')).toBeNull();
    expect(parseAttachmentEntityType('SAMPLE')).toBe(AttachmentTargetType.SAMPLE);
  });
});
