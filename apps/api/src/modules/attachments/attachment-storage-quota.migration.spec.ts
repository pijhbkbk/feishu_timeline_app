import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH = resolve(
  process.cwd(),
  'prisma/migrations/20260811163000_add_attachment_storage_quota/migration.sql',
);

describe('attachment storage quota migration', () => {
  it('retains only CLEAN history and sends every ambiguous binary state through bounded reconciliation', async () => {
    const sql = await readFile(MIGRATION_PATH, 'utf8');

    expect(sql).toMatch(
      /WHEN "scanStatus" = 'CLEAN'::"AttachmentScanStatus"\s+THEN 'RETAINED'::"AttachmentBinaryState"/u,
    );
    expect(sql).toMatch(
      /ELSE 'RECONCILIATION_REQUIRED'::"AttachmentBinaryState"/u,
    );
    expect(sql).toContain('R27A_LEGACY_BINARY_INVENTORY_REQUIRED');
    expect(sql).toContain('R27A_STALE_PENDING_BINARY_PURGE_REQUIRED');
    expect(sql).toContain('R27A_REJECTED_BINARY_PURGE_REQUIRED');
    expect(sql).toContain('R27A_SCAN_ERROR_BINARY_PURGE_REQUIRED');
    expect(sql).toMatch(
      /WHEN "scanStatus" = 'CLEAN'::"AttachmentScanStatus" THEN NULL\s+ELSE CURRENT_TIMESTAMP/u,
    );
  });
});
