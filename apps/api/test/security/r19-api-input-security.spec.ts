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
      { originalName: 'evil.jsp', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') },
      { originalName: 'evil.sh', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') },
      { originalName: 'evil.exe', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') },
      { originalName: 'evil.js.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') },
      { originalName: 'archive.zip', mimeType: 'application/zip', buffer: Buffer.from('PK\u0003\u0004') },
      { originalName: '\"><img src=x onerror=alert(1)>.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') },
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
        NODE_ENV: 'production',
        DEPLOYMENT_ENV: 'staging',
        FRONTEND_URL: 'https://staging.timeline.example.com',
        DATABASE_URL:
          'postgresql://app_user:test-only-strong-db-password@postgres:5432/feishu_timeline',
        REDIS_URL: 'redis://:test-only-strong-redis-password@redis:6379',
        MALWARE_SCANNER_PROVIDER: 'clamav',
        CLAMAV_HOST: 'clamav-scanner.internal',
        ATTACHMENT_STORAGE_GLOBAL_MAX_BYTES: '5368709120',
        ATTACHMENT_STORAGE_PROJECT_MAX_BYTES: '1073741824',
        ATTACHMENT_STORAGE_ACTOR_MAX_BYTES: '536870912',
        ATTACHMENT_STORAGE_GLOBAL_MAX_OBJECTS: '5000',
        ATTACHMENT_STORAGE_PROJECT_MAX_OBJECTS: '1000',
        ATTACHMENT_STORAGE_ACTOR_MAX_OBJECTS: '500',
        ATTACHMENT_STORAGE_MIN_FREE_BYTES: '1073741824',
        ATTACHMENT_STORAGE_RESERVATION_TTL_MS: '7200000',
        ATTACHMENT_STORAGE_ACTOR_WINDOW_MS: '2592000000',
        ATTACHMENT_STORAGE_RECONCILE_INTERVAL_MS: '300000',
        ATTACHMENT_STORAGE_RECONCILE_BATCH_SIZE: '100',
        ATTACHMENT_STORAGE_RECONCILIATION_LEASE_MS: '300000',
        ATTACHMENT_STORAGE_RECONCILIATION_RETRY_MS: '300000',
        ATTACHMENT_STORAGE_PURGED_METADATA_RETENTION_MS: '7776000000',
      } as NodeJS.ProcessEnv).frontendUrl,
    ).toBe('https://staging.timeline.example.com');
  });
});
