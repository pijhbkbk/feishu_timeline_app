import { describe, expect, it } from 'vitest';
import {
  ProductionPlanStatus,
  WorkflowAction,
  WorkflowNodeCode,
} from '@prisma/client';

import { getWorkflowNextTaskTemplates } from '../workflows/workflow-node.constants';
import {
  getMassProductionCompletionIssue,
  getMassProductionStageIssue,
} from './mass-productions.rules';

describe('mass productions rules', () => {
  it('blocks mass production before schedule plan is completed', () => {
    expect(
      getMassProductionStageIssue({
        schedulePlanCompleted: false,
        hasActiveTask: false,
      }),
    ).toBe('排产计划尚未完成，不能进入批量生产。');
  });

  it('prevents completing task without completed production record', () => {
    expect(
      getMassProductionCompletionIssue([
        { status: ProductionPlanStatus.IN_PROGRESS },
      ]),
    ).toBe('没有已完成的批量生产记录，不能完成批量生产节点。');
  });

  it('spawns visual review after mass production task complete', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.MASS_PRODUCTION,
      WorkflowAction.COMPLETE,
    );

    expect(templates).toHaveLength(1);
    expect(templates[0]?.nodeCode).toBe(
      WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
    );
  });
});
