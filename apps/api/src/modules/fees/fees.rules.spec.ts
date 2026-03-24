import { describe, expect, it } from 'vitest';
import {
  DevelopmentFeeStatus,
  WorkflowAction,
  WorkflowNodeCode,
} from '@prisma/client';

import { getWorkflowNextTaskTemplates } from '../workflows/workflow-node.constants';
import {
  getDevelopmentFeeCompletionIssue,
  getDevelopmentFeeStageIssue,
  getDevelopmentFeeStatusTransitionTarget,
} from './fees.rules';

describe('fees rules', () => {
  it('blocks fee stage before cabin review is approved', () => {
    expect(
      getDevelopmentFeeStageIssue({
        cabinReviewApproved: false,
        hasActiveTask: false,
      }),
    ).toBe('样车驾驶室评审尚未通过，不能进入颜色开发收费。');
  });

  it('allows legal fee status transitions and rejects illegal ones', () => {
    expect(
      getDevelopmentFeeStatusTransitionTarget(
        DevelopmentFeeStatus.PENDING,
        'MARK_RECORDED',
      ),
    ).toBe(DevelopmentFeeStatus.RECORDED);
    expect(
      getDevelopmentFeeStatusTransitionTarget(
        DevelopmentFeeStatus.RECORDED,
        'MARK_PAID',
      ),
    ).toBe(DevelopmentFeeStatus.PAID);
    expect(
      getDevelopmentFeeStatusTransitionTarget(
        DevelopmentFeeStatus.PAID,
        'CANCEL',
      ),
    ).toBeNull();
  });

  it('requires at least one paid fee to complete the task', () => {
    expect(
      getDevelopmentFeeCompletionIssue([
        {
          payStatus: DevelopmentFeeStatus.RECORDED,
        },
      ]),
    ).toBe('没有已支付的收费记录，不能完成收费节点。');
  });

  it('keeps fee node off the main workflow branch', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE,
      WorkflowAction.COMPLETE,
    );

    expect(templates).toHaveLength(0);
  });
});
