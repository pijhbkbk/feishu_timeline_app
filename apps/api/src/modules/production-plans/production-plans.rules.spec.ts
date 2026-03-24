import { describe, expect, it } from 'vitest';
import {
  ProductionPlanStatus,
  WorkflowAction,
  WorkflowNodeCode,
} from '@prisma/client';

import { getWorkflowNextTaskTemplates } from '../workflows/workflow-node.constants';
import {
  getSchedulePlanCompletionIssue,
  getSchedulePlanStageIssue,
} from './production-plans.rules';

describe('production plans rules', () => {
  it('blocks schedule plan before consistency review is approved', () => {
    expect(
      getSchedulePlanStageIssue({
        consistencyReviewApproved: false,
        hasActiveTask: false,
      }),
    ).toBe('颜色一致性评审尚未通过，不能进入排产计划。');
  });

  it('prevents completing schedule plan task without confirmed plan', () => {
    expect(
      getSchedulePlanCompletionIssue([
        { status: ProductionPlanStatus.DRAFT },
      ]),
    ).toBe('没有已确认的排产计划，不能完成排产节点。');
  });

  it('spawns mass production after schedule plan task complete', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.MASS_PRODUCTION_PLAN,
      WorkflowAction.COMPLETE,
    );

    expect(templates).toHaveLength(1);
    expect(templates[0]?.nodeCode).toBe(WorkflowNodeCode.MASS_PRODUCTION);
  });
});
