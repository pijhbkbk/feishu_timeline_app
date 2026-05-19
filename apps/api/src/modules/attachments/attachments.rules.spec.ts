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
        originalName: 'sample.png',
        mimeType: 'image/png',
        fileSize: 2048,
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      }),
    ).toBeNull();
    expect(canPreviewAttachmentMimeType('image/png')).toBe(true);
    expect(canPreviewAttachmentMimeType('application/pdf')).toBe(true);
  });

  it('rejects invalid mime types and entity types', () => {
    expect(
      getAttachmentFileValidationIssue({
        originalName: 'sample.zip',
        mimeType: 'application/zip',
        fileSize: 2048,
        buffer: Buffer.from('PK\x03\x04'),
      }),
    ).toBe('当前文件扩展名不在系统允许范围内。');
    expect(parseAttachmentEntityType('UNKNOWN')).toBeNull();
    expect(parseAttachmentEntityType('SAMPLE')).toBe(AttachmentTargetType.SAMPLE);
  });

  it('rejects path traversal names and content-type spoofing', () => {
    expect(
      getAttachmentFileValidationIssue({
        originalName: '../../evil.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        buffer: Buffer.from('%PDF-1.4\n'),
      }),
    ).toBe('附件文件名不能包含路径或上级目录标记。');

    expect(
      getAttachmentFileValidationIssue({
        originalName: 'evil.jpg',
        mimeType: 'image/jpeg',
        fileSize: 2048,
        buffer: Buffer.from('<script>alert(1)</script>'),
      }),
    ).toBe('文件内容与允许的文件类型不匹配。');
  });
});
