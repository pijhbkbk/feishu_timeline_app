import { describe, expect, it } from 'vitest';

import { getAttachmentFileValidationIssue } from '../../src/modules/attachments/attachments.rules';
import { resolveAppConfig } from '../../src/common/app-config';

describe('R19 API input and upload security', () => {
  it('rejects executable and browser-rendered upload types even when content type is spoofed', () => {
    const dangerousFiles = [
      { originalName: 'evil.php', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') },
      { originalName: 'evil.html', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') },
      { originalName: 'evil.svg', mimeType: 'image/png', buffer: Buffer.from('<svg onload=alert(1)>') },
      { originalName: 'evil.js', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') },
      { originalName: 'evil.exe', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') },
    ];

    for (const file of dangerousFiles) {
      expect(
        getAttachmentFileValidationIssue({
          ...file,
          fileSize: file.buffer.length,
        }),
      ).not.toBeNull();
    }
  });

  it('rejects traversal names and magic-byte mismatches', () => {
    expect(
      getAttachmentFileValidationIssue({
        originalName: '..%2F..%2Fevil.pdf',
        mimeType: 'application/pdf',
        fileSize: 16,
        buffer: Buffer.from('%PDF-1.4\n'),
      }),
    ).toBe('附件文件名不能包含路径或上级目录标记。');

    expect(
      getAttachmentFileValidationIssue({
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 32,
        buffer: Buffer.from('"><img src=x onerror=alert(1)>'),
      }),
    ).toBe('文件内容与允许的文件类型不匹配。');
  });

  it('uses a fixed frontend origin instead of wildcard CORS configuration', () => {
    expect(
      resolveAppConfig({
        NODE_ENV: 'staging',
        FRONTEND_URL: 'https://staging.timeline.example.com',
      } as NodeJS.ProcessEnv).frontendUrl,
    ).toBe('https://staging.timeline.example.com');
  });
});
