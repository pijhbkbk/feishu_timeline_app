import { describe, expect, it } from 'vitest';

import {
  formatBusinessCode,
  formatOptionalBusinessCode,
  isSeedBusinessCode,
} from './business-code';

describe('business code display', () => {
  it('replaces seeded English identifiers with a Chinese business label', () => {
    expect(formatBusinessCode('DEMO-ACTIVE-001', '定制色项目')).toBe('定制色项目');
    expect(formatBusinessCode('WF-DEMO-COMPLETE-001', '流程已建立')).toBe('流程已建立');
    expect(formatOptionalBusinessCode('CLR-DEMO-A-001')).toBeNull();
  });

  it('keeps real business identifiers unchanged', () => {
    expect(isSeedBusinessCode('LC-2026-017')).toBe(false);
    expect(formatBusinessCode('LC-2026-017', '定制色项目')).toBe('LC-2026-017');
    expect(formatOptionalBusinessCode('CLR-2026-017')).toBe('CLR-2026-017');
  });
});
