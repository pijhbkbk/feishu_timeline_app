import { BadRequestException } from '@nestjs/common';
import { parseRegisterMonth } from '../../common/color-standard';

export const ANNUAL_REVIEW_POLICY = 'FIRST_REGISTER_REVIEW_13_MONTHS_V1';
export const ANNUAL_REVIEW_ACTION = 'COLOR_ANNUAL_REVIEW_RECORDED';

/** First review only: registration month and the same month next year both count.
 * No recurrence or historical exit rewrite is inferred from this policy.
 */
export function firstAnnualReviewWindow(registerMonth: string | null) {
  const month = parseRegisterMonth(registerMonth);
  if (!month) return null;
  const [year, number] = month.split('-').map(Number) as [number, number];
  const start = year * 12 + number - 1;
  const label = (value: number) => `${String(Math.floor(value / 12)).padStart(4, '0')}-${String(value % 12 + 1).padStart(2, '0')}`;
  if (Math.floor((start + 13) / 12) > 9999) throw new BadRequestException('入清单月份超出可计算的首次复核范围。');
  const months = Array.from({ length: 13 }, (_, index) => label(start + index));
  return { fromMonth: months[0]!, toMonth: months[12]!, reviewMonth: label(start + 13), monthCount: 13, months };
}

export function businessMonth(now = new Date()) {
  const local = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return `${String(local.getUTCFullYear()).padStart(4, '0')}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function annualReviewDecision(quantity: string | null) {
  if (quantity === null) return null;
  // Quantities are nonnegative integer totals, not IEEE-754 approximations.
  return BigInt(quantity) < 20n ? 'EXIT_REVIEW_REQUIRED' as const : 'RETAIN' as const;
}
