import { describe, expect, it, vi } from 'vitest';
import { NativeAuthService } from './native-auth.service';

describe('native authentication admission budgets', () => {
  it('does not let requests already refused per client consume the shared budget', async () => {
    const counts = new Map<string, number>();
    const store = { incrementWithTtl: vi.fn(async (key: string) => { const count = (counts.get(key) ?? 0) + 1; counts.set(key, count); return count; }) };
    const service = new NativeAuthService({} as never, {} as never, {} as never, store as never);
    const admission = service as unknown as { rateLimit(scope: string, client: string, account: string, clientLimit: number, globalLimit: number, ttl: number): Promise<void> };
    for (let n = 0; n < 5; n++) await admission.rateLimit('register', 'abuser', 'account', 5, 20, 3600);
    for (let n = 0; n < 30; n++) await expect(admission.rateLimit('register', 'abuser', 'account', 5, 20, 3600)).rejects.toMatchObject({ status: 429 });
    expect(counts.get('auth:native:register:global')).toBe(5);
    await expect(admission.rateLimit('register', 'new-client', 'new-account', 5, 20, 3600)).resolves.toBeUndefined();
  });
  it('refuses ordinary recovery signers before consuming any privileged budget', async () => {
    const store = { incrementWithTtl: vi.fn() };
    const service = new NativeAuthService({} as never, {} as never, {} as never, store as never);
    await expect(service.issueRecovery({ id: 'ordinary', isSystemAdmin: false } as never, 'target', 'client')).rejects.toMatchObject({ status: 403 });
    expect(store.incrementWithTtl).not.toHaveBeenCalled();
  });
});
