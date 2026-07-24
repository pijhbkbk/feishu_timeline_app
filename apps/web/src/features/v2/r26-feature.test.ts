import { describe, expect, it } from 'vitest';

import { isR26V2PrototypeEnabled } from './r26-feature';

describe('R26 V2 prototype feature gate', () => {
  it('is disabled unless the explicit local prototype flag is true', () => {
    expect(isR26V2PrototypeEnabled(undefined)).toBe(false);
    expect(isR26V2PrototypeEnabled('false')).toBe(false);
    expect(isR26V2PrototypeEnabled('true')).toBe(true);
    expect(isR26V2PrototypeEnabled('v2')).toBe(true);
  });
});
