import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy } from './middleware';

describe('content security policy', () => {
  it('uses per-request nonces and excludes development sources in production', () => {
    const policy = buildContentSecurityPolicy('production-nonce', false);

    expect(policy).toContain("script-src 'self' 'nonce-production-nonce' 'strict-dynamic'");
    expect(policy).toContain("style-src-elem 'self' 'nonce-production-nonce'");
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain('upgrade-insecure-requests');
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain('localhost');
    expect(policy).not.toContain('ws://');
  });

  it('permits only the local development runtime additions outside production', () => {
    const policy = buildContentSecurityPolicy('development-nonce', true);

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("style-src-elem 'self' 'unsafe-inline'");
    expect(policy).not.toContain("style-src-elem 'self' 'nonce-development-nonce'");
    expect(policy).toContain('http://localhost:3001');
    expect(policy).toContain('ws://localhost:3000');
    expect(policy).not.toContain('upgrade-insecure-requests');
  });
});
