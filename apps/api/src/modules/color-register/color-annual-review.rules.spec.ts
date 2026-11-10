import { describe, expect, it } from 'vitest';
import { annualReviewDecision, businessMonth, firstAnnualReviewWindow } from './color-annual-review.rules';
import { getColorExitRetentionIssue, getColorExitSystemSuggestion } from '../color-exits/color-exits.rules';

describe('confirmed first annual review policy', () => {
  it('includes September 2026 and September 2027 as 13 months, reviews in October 2027', () => {
    const result = firstAnnualReviewWindow('2026-09')!;
    expect(result).toMatchObject({ fromMonth: '2026-09', toMonth: '2027-09', reviewMonth: '2027-10', monthCount: 13 });
    expect(result.months).toHaveLength(13);
    expect(result.months[11]).toBe('2027-08');
    expect(result.months[12]).toBe('2027-09');
    expect(new Set(result.months).size).toBe(13);
  });
  it.each([['2024-02', '2025-02', '2025-03'], ['2026-12', '2027-12', '2028-01'], ['2026-01', '2027-01', '2027-02']])('uses calendar months across leap/year boundaries: %s', (start, end, review) => {
    expect(firstAnnualReviewWindow(start)).toMatchObject({ fromMonth: start, toMonth: end, reviewMonth: review, monthCount: 13 });
  });
  it.each(['2026-13', '2026-00', '0000-01', '202609', '2026-09-01', '9999-12'])('rejects invalid or overflowing month %s', value => expect(() => firstAnnualReviewWindow(value)).toThrow());
  it('does not invent a registration month and uses Shanghai month boundaries', () => {
    expect(firstAnnualReviewWindow(null)).toBeNull();
    expect(businessMonth(new Date('2027-09-30T15:59:59Z'))).toBe('2027-09');
    expect(businessMonth(new Date('2027-09-30T16:00:00Z'))).toBe('2027-10');
  });
  it.each([[19, 'EXIT_REVIEW_REQUIRED', 'EXIT'], [20, 'RETAIN', 'RETAIN'], [21, 'RETAIN', 'RETAIN']] as const)('treats %i precisely and never performs exit', (value, review, suggestion) => {
    expect(annualReviewDecision(String(value))).toBe(review);
    expect(getColorExitSystemSuggestion({ annualOutput: value, threshold: 20 })).toBe(suggestion);
  });
  it('leaves unknown totals undecided and preserves other configured threshold semantics', () => {
    expect(annualReviewDecision(null)).toBeNull();
    expect(annualReviewDecision('999999999999999999')).toBe('RETAIN');
    expect(getColorExitSystemSuggestion({ annualOutput: 100, threshold: 100 })).toBe('EXIT');
    expect(getColorExitRetentionIssue({ annualOutput: 20, exitThreshold: 100, finalDecision: 'EXIT' })).toBeNull();
    expect(getColorExitRetentionIssue({ annualOutput: 19, exitThreshold: 20, finalDecision: 'EXIT' })).toBeNull();
    expect(getColorExitRetentionIssue({ annualOutput: 20, exitThreshold: 20, finalDecision: 'EXIT' })).toContain('继续保留');
    expect(getColorExitRetentionIssue({ annualOutput: 20, exitThreshold: 20, finalDecision: 'RETAIN' })).toBeNull();
  });
});
