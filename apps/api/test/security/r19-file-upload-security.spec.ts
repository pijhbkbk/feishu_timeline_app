import { describe, expect, it } from 'vitest';

import {
  ATTACHMENT_MAX_FILE_SIZE_BYTES,
  canPreviewAttachmentMimeType,
  getAttachmentFileValidationIssue,
} from '../../src/modules/attachments/attachments.rules';

describe('R19 file upload security', () => {
  it('accepts only the approved business file types with matching signatures', () => {
    expect(
      getAttachmentFileValidationIssue({
        originalName: 'sample.pdf',
        mimeType: 'application/pdf',
        fileSize: 16,
        buffer: Buffer.from('%PDF-1.4\n'),
      }),
    ).toBeNull();
    expect(
      getAttachmentFileValidationIssue({
        originalName: 'sample.png',
        mimeType: 'image/png',
        fileSize: 16,
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      }),
    ).toBeNull();
  });

  it('rejects dangerous extensions, traversal names, spoofed MIME and oversized files', () => {
    expect(
      getAttachmentFileValidationIssue({
        originalName: 'evil.js',
        mimeType: 'application/pdf',
        fileSize: 16,
        buffer: Buffer.from('%PDF-1.4\n'),
      }),
    ).toBe('当前文件扩展名不在系统允许范围内。');
    expect(
      getAttachmentFileValidationIssue({
        originalName: 'C:\\windows\\evil.pdf',
        mimeType: 'application/pdf',
        fileSize: 16,
        buffer: Buffer.from('%PDF-1.4\n'),
      }),
    ).toBe('附件文件名不能包含路径或上级目录标记。');
    expect(
      getAttachmentFileValidationIssue({
        originalName: 'fake.pdf',
        mimeType: 'application/pdf',
        fileSize: 16,
        buffer: Buffer.from('not a pdf'),
      }),
    ).toBe('文件内容与允许的文件类型不匹配。');
    expect(
      getAttachmentFileValidationIssue({
        originalName: 'big.pdf',
        mimeType: 'application/pdf',
        fileSize: ATTACHMENT_MAX_FILE_SIZE_BYTES + 1,
        buffer: Buffer.from('%PDF-1.4\n'),
      }),
    ).toBe('文件大小超出系统限制。');
  });

  it('does not preview unapproved browser-executable image types', () => {
    expect(canPreviewAttachmentMimeType('image/svg+xml')).toBe(false);
    expect(canPreviewAttachmentMimeType('text/html')).toBe(false);
    expect(canPreviewAttachmentMimeType('image/png')).toBe(true);
  });
});
