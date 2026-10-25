import { afterEach, describe, expect, it, vi } from 'vitest';

import { localDateTimeToIso } from './local-datetime';

afterEach(() => vi.unstubAllEnvs());

describe('datetime-local transport', () => {
  it.each([
    ['Asia/Shanghai', '2026-10-25T13:37:00.000Z'],
    ['UTC', '2026-10-25T21:37:00.000Z'],
    ['America/New_York', '2026-10-26T01:37:00.000Z'],
  ])('preserves the entered clock time in %s across a UTC server', (zone, expected) => {
    vi.stubEnv('TZ', zone);
    const result = localDateTimeToIso('2026-10-25T21:37');
    expect(result).toBe(expected);
    vi.stubEnv('TZ', 'UTC');
    expect(new Date(result).toISOString()).toBe(expected);
    vi.stubEnv('TZ', zone);
    const readback = new Date(result);
    expect([readback.getFullYear(), readback.getMonth() + 1, readback.getDate(), readback.getHours(), readback.getMinutes()])
      .toEqual([2026, 10, 25, 21, 37]);
  });

  it('keeps seconds, fractional seconds and empty optional inputs', () => {
    vi.stubEnv('TZ', 'Asia/Shanghai');
    expect(localDateTimeToIso('2026-10-25T00:01:02.3')).toBe('2026-10-24T16:01:02.300Z');
    expect(localDateTimeToIso('')).toBe('');
  });

  it.each(['2026-02-30T21:37', '2026-10-25T24:00', '2026-10-25', 'invalid', '2026-10-25T21:37Z'])(
    'does not silently normalize invalid or non-local control value %s', value => {
      expect(() => localDateTimeToIso(value)).toThrow('日期时间');
    });

  it('rejects a nonexistent local time during the DST jump', () => {
    vi.stubEnv('TZ', 'America/New_York');
    expect(() => localDateTimeToIso('2026-03-08T02:30')).toThrow('日期时间不存在');
  });
});
