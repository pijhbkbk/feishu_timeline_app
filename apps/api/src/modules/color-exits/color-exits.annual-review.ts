import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { lockRegisterColor } from '../../common/color-standard';
import { ANNUAL_REVIEW_ACTION, ANNUAL_REVIEW_POLICY } from '../color-register/color-annual-review.rules';
import { readColorAnnualSnapshot } from '../color-register/color-annual-review.service';
import { isDeepStrictEqual } from 'node:util';

/** Existing completed exit records are never passed here or rewritten. Once a
 * first-review fact exists, new exit writes must use that verified 13-month basis.
 * This adds no approval step and does not itself change the color lifecycle.
 */
export async function assertAnnualReviewExitBasis(tx: Prisma.TransactionClient, colorId: string | null, input: {
  annualOutput: number | null; statisticYear: number | null; finalDecision: string | null;
}) {
  if (!colorId) return null;
  const color = await lockRegisterColor(tx, colorId);
  const review = await tx.auditLog.findFirst({ where: { targetType: 'COLOR', targetId: colorId, action: ANNUAL_REVIEW_ACTION }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, afterData: true } });
  if (!review) return null; // No inferred retrospective review for legacy records.
  const saved = review.afterData;
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || saved.policy !== ANNUAL_REVIEW_POLICY) throw new ConflictException('年度复核依据格式不完整，请重新核对颜色详情。');
  const current = await readColorAnnualSnapshot(tx, color);
  // JSONB normalizes object key order; compare structured facts, not serialization order.
  const stable = (value: Record<string, unknown>) => ({ window: value.window, baseId: value.baseId, months: value.months, quantity: value.quantity, decision: value.decision });
  if (!current.canRecord || !isDeepStrictEqual(stable(current), stable(saved))) throw new ConflictException('年度复核后月份或产量事实已变化，请在颜色详情重新复核并保存。');
  if (current.quantity === null || String(input.annualOutput) !== current.quantity || input.statisticYear !== Number(current.window!.reviewMonth.slice(0, 4))) throw new BadRequestException('退出评审须使用已保存的首次13个月复核累计量及复核年份，不能另填旧年度或产量覆盖该事实。');
  if (current.decision === 'RETAIN' && input.finalDecision !== null && input.finalDecision !== 'RETAIN') throw new BadRequestException('该首次年度复核累计达到20台，须继续保留。');
  return { auditId: review.id, policy: ANNUAL_REVIEW_POLICY, fromMonth: current.window!.fromMonth, toMonth: current.window!.toMonth,
    reviewMonth: current.window!.reviewMonth, monthCount: 13, quantity: current.quantity, decision: current.decision };
}
