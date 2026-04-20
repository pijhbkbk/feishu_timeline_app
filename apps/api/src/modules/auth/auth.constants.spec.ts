import { describe, expect, it } from 'vitest';

import { ROLE_PERMISSION_CODE_MAP } from './auth.constants';

describe('ROLE_PERMISSION_CODE_MAP', () => {
  it('grants attachment management to the roles exposed by the attachments UI', () => {
    expect(ROLE_PERMISSION_CODE_MAP.project_manager).toContain('attachment.manage');
    expect(ROLE_PERMISSION_CODE_MAP.reviewer).toContain('attachment.manage');
  });
});
