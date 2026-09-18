import { describe, expect, it } from 'vitest';
import { NativePasswordService } from './native-password.service';
import { normalizeLoginName, validateNativePassword } from './native-auth.rules';
import { ValidationPipe } from '@nestjs/common';
import { NativeLoginDto, NativePasswordChangeDto, NativeRecoveryDto, NativeRegisterDto } from './dto/native-auth.dto';
import { AdminUserConfigurationPreviewDto } from '../admin/dto/admin-control-center.dto';

describe('native credential validation and actual Argon2', () => {
  it('normalizes usernames without accepting ambiguous or oversized names', () => {
    expect(normalizeLoginName(' Example.User_01 ')).toBe('example.user_01');
    expect(normalizeLoginName('001234')).toBe('001234');
    expect(normalizeLoginName('001234')).not.toBe(normalizeLoginName('1234'));
    for (const value of ['ab', '测试用户', 'аdministrator', '-admin', 'a'.repeat(65), 'a/b', null]) expect(() => normalizeLoginName(value)).toThrow();
  });
  it('accepts eight non-weak code points without a character-class requirement and rejects seven', () => {
    for (const value of ['riveroak', '桦林映着晴空湖水', '🌳🌿🌾🌻🌺🌼🌷🌹', 'Long existing native password 2026!']) {
      expect(validateNativePassword(value)).toBe(value);
    }
    for (const value of ['riveroa', '桦林映着晴空湖', '🌳🌿🌾🌻🌺🌼🌷', 'password', '12345678', 'qwertyuiop', 'password123']) {
      expect(() => validateNativePassword(value)).toThrow();
    }
  });
  it('enforces eight characters for new-password DTOs while login remains compatible and identifiers stay strings', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
    for (const metatype of [NativePasswordChangeDto, NativeRecoveryDto]) {
      const input = metatype === NativePasswordChangeDto ? { currentPassword: 'legacy' } : { token: 'a'.repeat(43) };
      await expect(pipe.transform({ ...input, newPassword: 'riveroak' }, { type: 'body', metatype })).resolves.toBeDefined();
      await expect(pipe.transform({ ...input, newPassword: 'riveroa' }, { type: 'body', metatype })).rejects.toThrow();
    }
    await expect(pipe.transform({ username: '001234', password: 'legacy' }, { type: 'body', metatype: NativeLoginDto })).resolves.toMatchObject({ username: '001234' });
    await expect(pipe.transform({ username: 1234, password: 'riveroak', name: '测试' }, { type: 'body', metatype: NativeRegisterDto })).rejects.toThrow();
  });
  it('preserves raw employee-number types at the production pipe in authentication and account configuration', async () => {
    // Vitest's transform does not emit tsc's design:type metadata. Reproduce it
    // so this regression exercises the implicit conversion used by main.ts.
    for (const dto of [NativeLoginDto, AdminUserConfigurationPreviewDto]) {
      Reflect.defineMetadata('design:type', String, dto.prototype, 'username');
    }
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
    for (const [metatype, fields] of [
      [NativeLoginDto, { password: 'legacy' }],
      [NativeRegisterDto, { password: 'riveroak', name: '测试' }],
      [AdminUserConfigurationPreviewDto, { name: '测试', status: 'ACTIVE', isSystemAdmin: false, roleIds: [], reason: '合成工号类型验证' }],
    ] as const) {
      for (const username of ['001234', '1234', 'Legacy.User_01']) {
        await expect(pipe.transform({ ...fields, username }, { type: 'body', metatype })).resolves.toMatchObject({ username });
      }
      for (const username of [1234, true, null, ['001234'], { value: '001234' }]) {
        await expect(pipe.transform({ ...fields, username }, { type: 'body', metatype })).rejects.toThrow();
      }
    }
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
