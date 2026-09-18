import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { validateHostAdministratorPlan } from './host-administrator-plan';
import { NativeAuthService } from './native-auth.service';

const plan = { maintenanceId: randomUUID(), userId: 'synthetic-id', expectedLoginName: '001234', expectedName: '合成人员', expectedUpdatedAt: '2026-09-18T00:00:00.000Z', expectedAuthVersion: 0, expectedIsSystemAdmin: false, expectedRoleIds: [], reason: '隔离合成管理员授权验证' };
describe('explicit protected-host administrator plan', () => {
  it('keeps exact ID, leading zero strings and plan fields, independent of personal names', () => {
    expect(validateHostAdministratorPlan(plan)).toEqual(plan);
  });
  it.each([
    { userId: '' }, { expectedLoginName: 1234 }, { expectedLoginName: 'ABC123' },
    { expectedName: '' }, { expectedUpdatedAt: 'bad' }, { expectedAuthVersion: -1 },
    { expectedIsSystemAdmin: 'true' }, { expectedRoleIds: ['same', 'same'] },
    { maintenanceId: 'not-a-uuid' }, { reason: '' }, { password: 'unexpected' },
  ])('rejects incomplete, ambiguous or injected plan fields %j', patch => {
    expect(() => validateHostAdministratorPlan({ ...plan, ...patch })).toThrow();
  });
  it('rejects non-root invocation before any database access', async () => {
    const uid = vi.spyOn(process, 'getuid').mockReturnValue(1000);
    try {
      const service = new NativeAuthService({} as never, {} as never, {} as never, {} as never);
      await expect(service.grantAdministratorFromHost(plan)).rejects.toMatchObject({ status: 403 });
    } finally { uid.mockRestore(); }
  });
});
