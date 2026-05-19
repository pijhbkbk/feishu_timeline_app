import {
  DevelopmentFeeStatus,
  ReviewResult,
  WorkflowAction,
  WorkflowNodeCode,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  getColorExitCompletionIssue,
  getColorExitSystemSuggestion,
} from '../../src/modules/color-exits/color-exits.rules';
import {
  getDevelopmentFeeAmountIssue,
  getDevelopmentFeeCompletionIssue,
} from '../../src/modules/fees/fees.rules';
import {
  getCabinReviewRejectIssue,
  getCabinReviewSubmitIssue,
} from '../../src/modules/reviews/reviews.rules';
import { getWorkflowNextTaskTemplates } from '../../src/modules/workflows/workflow-node.constants';

describe('R19 business logic security', () => {
  it('allows only the expected parallel branches after steps 4 and 6', () => {
    expect(
      getWorkflowNextTaskTemplates(
        WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
        WorkflowAction.APPROVE,
      ).map((item) => [item.nodeCode, item.isPrimary ?? true]),
    ).toEqual([
      [WorkflowNodeCode.PAINT_PROCUREMENT, true],
      [WorkflowNodeCode.COLOR_NUMBERING, false],
    ]);

    expect(
      getWorkflowNextTaskTemplates(
        WorkflowNodeCode.PAINT_PROCUREMENT,
        WorkflowAction.COMPLETE,
      ).map((item) => [item.nodeCode, item.isPrimary ?? true]),
    ).toEqual([
      [WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN, true],
      [WorkflowNodeCode.PERFORMANCE_TEST, false],
      [WorkflowNodeCode.STANDARD_BOARD_PRODUCTION, false],
    ]);
  });

  it('keeps step 12 reject gated by submitted state and reject reason', () => {
    expect(
      getCabinReviewSubmitIssue({
        reviewDate: new Date('2026-05-19T00:00:00.000Z'),
        reviewerId: 'reviewer-1',
        reviewConclusion: ReviewResult.REJECTED,
        comment: '评审意见',
        conditionNote: null,
        rejectReason: '',
      }),
    ).toBe('驳回时必须填写原因。');

    expect(
      getCabinReviewRejectIssue({
        reviewConclusion: ReviewResult.REJECTED,
        submittedAt: null,
        rejectReason: '颜色一致性不足',
      }),
    ).toBe('请先提交评审记录。');
  });

  it('keeps step 13 amount fixed at 10000 and requires an effective paid record', () => {
    expect(getDevelopmentFeeAmountIssue(1, 10000)).toBe('颜色开发收费固定金额为 10000。');
    expect(getDevelopmentFeeAmountIssue(999999, 10000)).toBe('颜色开发收费固定金额为 10000。');
    expect(getDevelopmentFeeAmountIssue(-100, 10000)).toBe('颜色开发收费固定金额为 10000。');
    expect(getDevelopmentFeeAmountIssue(10000, 10000)).toBeNull();
    expect(
      getDevelopmentFeeCompletionIssue([
        {
          payStatus: DevelopmentFeeStatus.CANCELLED,
        },
      ]),
    ).toBe('至少需要一条有效收费记录后才能完成收费节点。');
  });

  it('keeps step 18 as a manual final decision instead of system-only automation', () => {
    expect(getColorExitSystemSuggestion({ annualOutput: 18, threshold: 20 })).toBe('EXIT');
    expect(
      getColorExitCompletionIssue({
        exitDate: new Date('2026-05-19T00:00:00.000Z'),
        exitReason: '年产量低于阈值',
        operatorId: 'operator-1',
        statisticYear: 2026,
        annualOutput: 18,
        finalDecision: null,
        effectiveDate: new Date('2026-06-01T00:00:00.000Z'),
      }),
    ).toBe('人工结论不能为空。');
  });
});
