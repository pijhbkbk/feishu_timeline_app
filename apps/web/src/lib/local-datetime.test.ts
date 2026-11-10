import { afterEach, describe, expect, it, vi } from 'vitest';

import { localDateTimeToIso, toDateTimeLocalValue, toBusinessDateInputValue } from './local-datetime';
import { formatDate, formatDateTime } from './projects-client';

afterEach(() => vi.unstubAllEnvs());

describe('datetime-local transport', () => {
  it.each(['Asia/Shanghai', 'UTC', 'America/New_York'])(
    'uses Beijing time for input and display on a device in %s', zone => {
      vi.stubEnv('TZ', zone);
      for (const [input, expected] of [
        ['2026-10-25T21:37', '2026-10-25T13:37:00.000Z'],
        ['2026-11-01T00:01', '2026-10-31T16:01:00.000Z'],
        ['2027-01-01T00:00', '2026-12-31T16:00:00.000Z'],
        ['2028-02-29T23:59', '2028-02-29T15:59:00.000Z'],
        ['1990-07-01T12:00', '1990-07-01T03:00:00.000Z'],
      ] as const) {
        const result = localDateTimeToIso(input);
        expect(result).toBe(expected);
        expect(toDateTimeLocalValue(result)).toBe(input);
        expect(toBusinessDateInputValue(result)).toBe(input.slice(0, 10));
        expect(localDateTimeToIso(toDateTimeLocalValue(result))).toBe(expected);
        expect(formatDateTime(result)).toBe(input.replaceAll('-', '/').replace('T', ' ') + ':00');
        expect(formatDate(result)).toBe(input.slice(0, 10).replaceAll('-', '/'));
      }
      expect(formatDate('2026-11-01')).toBe('2026/11/01');
      expect(toBusinessDateInputValue('2026-11-01')).toBe('2026-11-01');
      expect(toDateTimeLocalValue('0999-01-01T00:00:00.000Z')).toMatch(/^0999-01-01T/);
      expect(formatDateTime(null)).toBe('未设置');
    });

  it('keeps seconds, fractional seconds and empty optional inputs', () => {
    vi.stubEnv('TZ', 'Asia/Shanghai');
    expect(localDateTimeToIso('2026-10-25T00:01:02.3')).toBe('2026-10-24T16:01:02.300Z');
    expect(localDateTimeToIso('')).toBe('');
    expect(toDateTimeLocalValue(null)).toBe('');
  });

  it.each(['2026-02-30T21:37', '2026-10-25T24:00', '2026-10-25', 'invalid', '2026-10-25T21:37Z'])(
    'does not silently normalize invalid or non-local control value %s', value => {
      expect(() => localDateTimeToIso(value)).toThrow('日期时间');
    });

  it('keeps valid Beijing time during a device DST jump', () => {
    vi.stubEnv('TZ', 'America/New_York');
    expect(localDateTimeToIso('2026-03-08T02:30')).toBe('2026-03-07T18:30:00.000Z');
  });
  it('handles historical Beijing gaps and overlaps using the named zone', () => {
    expect(() => localDateTimeToIso('1990-04-15T02:30')).toThrow('日期时间不存在');
    expect(localDateTimeToIso('1990-09-16T01:30')).toBe('1990-09-15T16:30:00.000Z');
    expect(toDateTimeLocalValue('1990-09-15T16:30:00.000Z')).toBe('1990-09-16T01:30');
  });

});
