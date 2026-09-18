export const NATIVE_PASSWORD_MIN_LENGTH = 8;
export const NATIVE_PASSWORD_HELP = '8–128 个字符，可使用空格和较长口令。';

// HTML minLength counts UTF-16 units; the API counts Unicode code points.
// Keep submission checks consistent without trimming or changing a password.
export function assertNewPasswordLength(value: string) {
  const length = Array.from(value).length;
  if (length < NATIVE_PASSWORD_MIN_LENGTH || length > 128 || new TextEncoder().encode(value).length > 512) {
    throw new Error('密码须为 8–128 个字符，且不超过 512 字节。');
  }
}
