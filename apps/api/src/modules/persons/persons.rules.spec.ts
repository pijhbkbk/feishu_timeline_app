import { describe, expect, it } from 'vitest';
import { assertProfileFieldAccess, commandHash, parsePersonCreate, parsePersonLink, parsePersonSheet } from './persons.rules';

const sheet = (changes: unknown) => ({ operationId: 'save-1', items: [{ id: 'person-a', expectedRevision: 1, changes }] });
describe('person profile command boundary', () => {
  it('normalizes stable IDs and field order before hashing, preserving duplicate display names', () => {
    const left = parsePersonSheet({ operationId: 'save-1', items: [
      { id: 'person-b', expectedRevision: 2, changes: { mobile: '0001234567890123456789', name: '同名人员' } },
      { id: 'person-a', expectedRevision: 1, changes: { name: '同名人员' } },
    ] });
    const right = parsePersonSheet({ operationId: 'save-1', items: [
      { id: 'person-a', expectedRevision: 1, changes: { name: '同名人员' } },
      { id: 'person-b', expectedRevision: 2, changes: { name: '同名人员', mobile: '0001234567890123456789' } },
    ] });
    expect(commandHash(left)).toBe(commandHash(right));
    expect(left.items[1]!.changes.mobile).toBe('0001234567890123456789');
  });
  it.each(['userId', 'username', 'password', 'passwordHash', 'roleCodes', 'teamAccessApproved', 'isSystemAdmin', 'status', 'revision'])('rejects controlled field %s', field => {
    expect(() => parsePersonSheet(sheet({ [field]: 'illegal' }))).toThrow();
    expect(() => parsePersonCreate({ operationId: 'create-1', items: [{ clientId: 'row-1', fields: { name: '同名人员', [field]: 'illegal' } }] })).toThrow();
  });
  it('rejects duplicate IDs and unbounded batches atomically before service calls', () => {
    const item = sheet({ name: '甲' }).items[0];
    expect(() => parsePersonSheet({ operationId: 'x', items: [item, item] })).toThrow('重复');
    expect(() => parsePersonSheet({ operationId: 'x', items: Array.from({ length: 51 }, (_, i) => ({ ...item, id: `person-${i}` })) })).toThrow('1–50');
  });
  it.each([0, -1, 1.1, '1', null, 2147483647])('rejects invalid expected revision %j', expectedRevision => {
    expect(() => parsePersonSheet({ operationId: 'x', items: [{ id: 'p', expectedRevision, changes: { name: '甲' } }] })).toThrow();
  });
  it.each([undefined, {}, [], 123, '=SUM(A1:A2)', '  =NOW()'])('rejects malformed/formula text %j', name => {
    expect(() => parsePersonSheet(sheet({ name }))).toThrow();
  });
  it('distinguishes clear from omitted and refuses null identity', () => {
    expect(parsePersonSheet(sheet({ mobile: null })).items[0]!.changes).toEqual({ mobile: null });
    expect(() => parsePersonSheet(sheet({ name: null }))).toThrow();
    expect(() => parsePersonSheet(sheet({ mobile: undefined }))).toThrow();
  });
  it('permits unlinked department metadata without allowing a linked account authorization bypass', () => {
    expect(() => assertProfileFieldAccess(null, { departmentId: 'dept-a', isActive: true })).not.toThrow();
    expect(() => assertProfileFieldAccess('user-a', { name: '改名', position: '工作岗位' })).not.toThrow();
    expect(() => assertProfileFieldAccess('user-a', { departmentId: 'dept-b' })).toThrow('管理员');
    expect(() => assertProfileFieldAccess('user-a', { isActive: false }, true)).toThrow('权限管理');
  });
  it('requires exact account identity/version/reason and cannot match by name', () => {
    const valid = { operationId: 'link-1', expectedRevision: 2, userId: 'account-a', expectedUserVersion: '2026-10-13T00:00:00.000Z', reason: '明确核对内部账号 ID' };
    expect(parsePersonLink(valid).userId).toBe('account-a');
    expect(() => parsePersonLink({ ...valid, name: '同名人员' })).toThrow();
    expect(() => parsePersonLink({ ...valid, reason: ' ' })).toThrow();
  });
});
