import { describe, expect, it } from 'vitest';
import { assertNewPasswordLength } from './native-password-policy';

describe('new password submission length', () => {
  it.each(['riveroak', '桦林映着晴空湖水', '🌳🌿🌾🌻🌺🌼🌷🌹', 'Long existing native password 2026!', 'x'.repeat(128), '🌳'.repeat(128)])('preserves valid code points: %s', value => {
    expect(() => assertNewPasswordLength(value)).not.toThrow();
  });
  it.each(['riveroa', '桦林映着晴空湖', '🌳🌿🌾🌻🌺🌼🌷', 'x'.repeat(129), '🌳'.repeat(129)])('rejects lengths outside the API bound: %s', value => {
    expect(() => assertNewPasswordLength(value)).toThrow('8–128');
  });
});
