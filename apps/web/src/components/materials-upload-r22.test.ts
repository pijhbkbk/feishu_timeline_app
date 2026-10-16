import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./materials-upload-r22.tsx', import.meta.url),
  'utf8',
);

describe('MaterialsUploadR22 API contract', () => {
  it('uses the R26 domain material client with optimistic concurrency metadata', () => {
    expect(source).toContain('uploadTaskMaterial');
    expect(source).not.toContain('uploadProjectAttachment');
    expect(source).toMatch(/taskVersion:\s*detail\.taskVersion/);
    expect(source).toMatch(/replacesAttachmentId:\s*replacingId/);
  });
});
