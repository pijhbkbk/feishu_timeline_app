import { describe, expect, it } from 'vitest';
import { NativePasswordService } from './native-password.service';
import { normalizeLoginName, validateNativePassword } from './native-auth.rules';

describe('native credential validation and actual Argon2', () => {
  it('normalizes usernames without accepting ambiguous or oversized names', () => {
    expect(normalizeLoginName(' Example.User_01 ')).toBe('example.user_01');
    for (const value of ['ab', '测试用户', 'аdministrator', '-admin', 'a'.repeat(65), 'a/b', null]) expect(() => normalizeLoginName(value)).toThrow();
  });
  it('preserves exact Unicode and spaces and rejects short, excessive, common, or control-bearing passwords', () => {
    expect(validateNativePassword('  星空河流森林海洋山峦晨光微风阳光  ')).toBe('  星空河流森林海洋山峦晨光微风阳光  ');
    for (const value of ['short', 'a'.repeat(20), 'password123456789', 'abcdefghijklmno\n', 'abcdefghijklmno'.repeat(10)]) expect(() => validateNativePassword(value)).toThrow();
  });
  it('hashes with independent salts and verifies only the exact bounded phrase', async () => {
    const service = new NativePasswordService();
    const password = '  Exact unicode 密码 phrase 2026!';
    const first = await service.hash(password);
    const second = await service.hash(password);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(await service.verify(first, password)).toBe(true);
    expect(await service.verify(first, password.trim())).toBe(false);
    expect(await service.verify(null, password)).toBe(false);
    expect(await service.verify(first.replace('m=65536', 'm=999999999'), password)).toBe(false);
    expect(await service.verify(first, 'a'.repeat(513))).toBe(false);
  });
});
