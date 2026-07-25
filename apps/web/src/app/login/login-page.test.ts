import { describe, expect, it } from 'vitest';

import { isLogoutLanding } from './login-page-state';

describe('login logout landing', () => {
  it('stops automatic OAuth only for an explicit logout return', () => {
    expect(isLogoutLanding('?loggedOut=1')).toBe(true);
    expect(isLogoutLanding('?loggedOut=0')).toBe(false);
    expect(isLogoutLanding('')).toBe(false);
  });
});
