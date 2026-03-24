import { describe, expect, it } from 'vitest';
import {
  ReviewResult,
  WorkflowAction,
  WorkflowNodeCode,
} from '@prisma/client';

import { getWorkflowNextTaskTemplates } from '../workflows/workflow-node.constants';
import {
  getCabinReviewApproveIssue,
  getCabinReviewRejectIssue,
  getCabinReviewStageIssue,
  getConsistencyReviewStageIssue,
  getVisualDeltaReviewStageIssue,
} from './reviews.rules';

describe('reviews rules', () => {
  it('blocks cabin review before trial production is completed', () => {
    expect(
      getCabinReviewStageIssue({
        trialProductionCompleted: false,
        hasActiveTask: false,
      }),
    ).toBe('样车试制尚未完成，不能进入驾驶室评审。');
  });

  it('activates development fee and consistency review after approve', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.CAB_REVIEW,
      WorkflowAction.APPROVE,
    );

    expect(templates).toHaveLength(2);
    expect(templates[0]?.nodeCode).toBe(WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW);
    expect(templates[1]?.nodeCode).toBe(WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE);
  });

  it('returns to trial production after reject', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.CAB_REVIEW,
      WorkflowAction.REJECT,
    );

    expect(templates).toHaveLength(1);
    expect(templates[0]?.nodeCode).toBe(WorkflowNodeCode.TRIAL_PRODUCTION);
  });

  it('blocks consistency review before cabin review is approved', () => {
    expect(
      getConsistencyReviewStageIssue({
        cabinReviewCompleted: false,
        hasActiveTask: false,
      }),
    ).toBe('样车驾驶室评审尚未通过，不能进入颜色一致性评审。');
  });

  it('activates mass production plan after consistency review approve', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
      WorkflowAction.APPROVE,
    );

    expect(templates).toHaveLength(1);
    expect(templates[0]?.nodeCode).toBe(WorkflowNodeCode.MASS_PRODUCTION_PLAN);
  });

  it('returns to paint development after consistency review reject', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
      WorkflowAction.REJECT,
    );

    expect(templates).toHaveLength(1);
    expect(templates[0]?.nodeCode).toBe(WorkflowNodeCode.PAINT_DEVELOPMENT);
  });

  it('rejects approve when result or submit state is invalid', () => {
    expect(
      getCabinReviewApproveIssue({
        reviewConclusion: ReviewResult.REJECTED,
        submittedAt: new Date(),
        conditionNote: null,
      }),
    ).toBe('当前评审结论不允许执行通过操作。');
  });

  it('rejects reject when reason is missing', () => {
    expect(
      getCabinReviewRejectIssue({
        reviewConclusion: ReviewResult.REJECTED,
        submittedAt: new Date(),
        rejectReason: null,
      }),
    ).toBe('驳回时必须填写原因。');
  });

  it('blocks visual delta review before mass production is completed', () => {
    expect(
      getVisualDeltaReviewStageIssue({
        massProductionCompleted: false,
        hasActiveTask: false,
      }),
    ).toBe('批量生产尚未完成，不能进入目视色差评审。');
  });

  it('activates project closed after visual delta review approve', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
      WorkflowAction.APPROVE,
    );

    expect(templates).toHaveLength(1);
    expect(templates[0]?.nodeCode).toBe(WorkflowNodeCode.PROJECT_CLOSED);
  });

  it('returns to mass production after visual delta review reject', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
      WorkflowAction.REJECT,
    );

    expect(templates).toHaveLength(1);
    expect(templates[0]?.nodeCode).toBe(WorkflowNodeCode.MASS_PRODUCTION);
  });
});
