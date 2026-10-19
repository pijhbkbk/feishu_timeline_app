import { describe, expect, it } from 'vitest';
import { defaultActivityDate, inspectionWeek, shanghaiToday, shiftDate } from './week-range';
describe('Shanghai Monday–Sunday inspection dates', () => {
  it('uses Shanghai date across the UTC midnight boundary', () => {
    expect(shanghaiToday(new Date('2026-10-18T15:59:59Z'))).toBe('2026-10-18');
    expect(shanghaiToday(new Date('2026-10-18T16:00:00Z'))).toBe('2026-10-19');
  });
  it('includes Monday and Sunday in the same natural week', () => {
    for (const day of ['2026-10-19', '2026-10-21', '2026-10-25']) expect(inspectionWeek(day)).toEqual({fromDate: '2026-10-19', toDate: '2026-10-25'});
    expect(inspectionWeek('2026-10-18')).toEqual({fromDate: '2026-10-12', toDate: '2026-10-18'});
  });
  it('keeps exact days across month, year and leap-year boundaries', () => {
    expect(inspectionWeek('2027-01-01')).toEqual({fromDate: '2026-12-28', toDate: '2027-01-03'});
    expect(inspectionWeek('2024-02-29')).toEqual({fromDate: '2024-02-26', toDate: '2024-03-03'});
    expect(shiftDate('2026-10-19', -7)).toBe('2026-10-12');
    expect(shiftDate('2026-10-19', 7)).toBe('2026-10-26');
  });
  it('starts a new historical-week activity inside the chosen week', () => {
    const range = inspectionWeek('2026-10-19');
    expect(defaultActivityDate(range, '2026-10-22')).toBe('2026-10-22');
    expect(defaultActivityDate(range, '2026-11-01')).toBe('2026-10-19');
    expect(defaultActivityDate(undefined, '2026-11-01')).toBe('2026-11-01');
  });
  it.each(['', '2026-02-29', '2026-13-01', '2026-10-19T00:00:00Z'])('rejects invalid date-only input %s', date => {
    expect(() => inspectionWeek(date)).toThrow();
  });
});
