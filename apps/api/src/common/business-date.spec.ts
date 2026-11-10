import { afterEach, describe, expect, it, vi } from 'vitest';
import { businessCalendarDate, businessCalendarDayEnd, businessDateKey, businessDayDifference,
  businessDayRange, businessMonthCalendarRange, businessMonthRange, parseBusinessDate } from './business-date';

afterEach(() => vi.unstubAllEnvs());

describe.each(['UTC', 'Asia/Shanghai', 'America/New_York'])('Beijing business calendar with server TZ=%s', zone => {
  it('selects the Beijing year/day and keeps DATE carriers distinct from timestamp boundaries', () => {
    vi.stubEnv('TZ', zone);
    const now = new Date('2026-12-31T16:05:00.000Z');
    expect(businessDateKey(now)).toBe('2027-01-01');
    expect(businessCalendarDate(now).toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(businessDayRange(now)).toEqual({ start: new Date('2026-12-31T16:00:00.000Z'), end: new Date('2027-01-01T16:00:00.000Z') });
    expect(businessMonthCalendarRange(now)).toEqual({ start: new Date('2027-01-01T00:00:00.000Z'), end: new Date('2027-02-01T00:00:00.000Z') });
    expect(businessMonthRange(now)).toEqual({ start: new Date('2026-12-31T16:00:00.000Z'), end: new Date('2027-01-31T16:00:00.000Z') });
    expect(businessCalendarDayEnd(new Date('2028-02-29T00:00:00.000Z')).toISOString()).toBe('2028-02-29T15:59:59.999Z');
    expect(businessDayDifference(now, new Date('2026-12-31T15:59:59.999Z'))).toBe(1);
  });
  it('converts unqualified clock input once and preserves date-only/qualified inputs', () => {
    vi.stubEnv('TZ', zone);
    for (const input of ['2027-01-01T00:05:02.3', '2027-01-01T00:05:02.3+08:00', '2026-12-31T16:05:02.3Z']) {
      const value = parseBusinessDate(input);
      expect(value.toISOString()).toBe('2026-12-31T16:05:02.300Z');
      expect(parseBusinessDate(value.toISOString())).toEqual(value);
    }
    expect(parseBusinessDate('2027-01-01').toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(parseBusinessDate('2026-03-08T02:30').toISOString()).toBe('2026-03-07T18:30:00.000Z');
    for (const input of ['2026-12-31T16:05:02.123456Z', '2027-01-01T00:05:02.123456+08:00']) {
      expect(parseBusinessDate(input).toISOString()).toBe('2026-12-31T16:05:02.123Z');
    }
    expect(parseBusinessDate('2026-12-31 16:05:02Z').toISOString()).toBe('2026-12-31T16:05:02.000Z');
    expect(parseBusinessDate('2027-01-01 00:05:02').toISOString()).toBe('2026-12-31T16:05:02.000Z');
  });
  it('rejects invalid Gregorian input and respects historical Shanghai gaps/overlaps', () => {
    vi.stubEnv('TZ', zone);
    for (const input of ['2026-02-30', '2026-02-30T12:00', '2026-02-30T12:00Z', '2026-02-30T12:00+08:00', '2026-10-25T24:00', 'invalid', '1990-04-15T02:30']) {
      expect(Number.isNaN(parseBusinessDate(input).getTime())).toBe(true);
    }
    expect(parseBusinessDate('1990-07-01T12:00').toISOString()).toBe('1990-07-01T03:00:00.000Z');
    expect(parseBusinessDate('1990-09-16T01:30').toISOString()).toBe('1990-09-15T16:30:00.000Z');
    expect(parseBusinessDate('1990-04-15T02:30Z').toISOString()).toBe('1990-04-15T02:30:00.000Z');
  });
});
