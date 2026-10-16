import { BadRequestException } from '@nestjs/common';

export const NATIVE_JOB_CODES = ['purchaser', 'process_engineer'] as const;
export type NativeJobCode = (typeof NATIVE_JOB_CODES)[number];
export const NATIVE_ADMIN_LOCK = 'feishu-timeline:system-administrator-mutation';
export const NATIVE_BOOTSTRAP_ID = 'native-admin-v1';
// Owner-selected product policy; not the NIST 15-character single-factor minimum.
export const NATIVE_PASSWORD_MIN_LENGTH = 8;

export function normalizeLoginName(value: unknown): string {
  if (typeof value !== 'string' || value.length > 128) {
    throw new BadRequestException('工号必须为 3–64 位字母、数字、点、下划线或连字符。');
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized)) {
    throw new BadRequestException('工号必须为 3–64 位字母、数字、点、下划线或连字符。');
  }
  return normalized;
}

// Local denylist, requiring no external password or identity service.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyui', 'qwertyuiop', 'qwerty123', 'abcdefgh', 'abcd1234', 'iloveyou',
  'welcome1', 'admin123', 'admin1234', 'letmein1', 'changeme',
  'passwordpassword', 'password123456789', '123456789012345',
  '1234567890123456', 'qwertyuiopasdfgh', 'qwertyuiop123456',
  'administrator123', 'adminadminadmin', 'iloveyouiloveyou',
]);

export function validateNativePassword(value: unknown, loginName?: string): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 512) {
    throw new BadRequestException('密码须为 8–128 个字符，且不超过 512 字节。');
  }
  // Exact Unicode code points: no normalization, trimming or silent truncation.
  const points = Array.from(value);
  if (points.length < NATIVE_PASSWORD_MIN_LENGTH || points.length > 128 || points.some(point => point.codePointAt(0)! < 32 || point.codePointAt(0) === 127)) {
    throw new BadRequestException('密码须为 8–128 个字符，可含空格，不可含控制字符。');
  }
  const folded = value.toLowerCase();
  if (COMMON_PASSWORDS.has(folded) || new Set(points).size < 4 || (loginName && folded === loginName)) {
    throw new BadRequestException('请使用更难猜测的密码或较长的口令。');
  }
  return value;
}
