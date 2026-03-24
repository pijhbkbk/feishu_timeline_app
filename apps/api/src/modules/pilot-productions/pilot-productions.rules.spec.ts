import { describe, expect, it } from 'vitest';
import {
  ProductionPlanStatus,
  TrialProductionResult,
  TrialProductionStatus,
  WorkflowAction,
  WorkflowNodeCode,
} from '@prisma/client';

import { getWorkflowNextTaskTemplates } from '../workflows/workflow-node.constants';
import {
  getFirstProductionPlanCompletionIssue,
  getFirstProductionPlanStageIssue,
  getTrialProductionCompletionIssue,
  getTrialProductionStatusAfterComplete,
} from './pilot-productions.rules';

describe('pilot productions rules', () => {
  it('blocks first production plan before procurement is completed', () => {
    expect(
      getFirstProductionPlanStageIssue({
        procurementCompleted: false,
        hasActiveTask: false,
      }),
    ).toBe('采购节点尚未完成，不能进入首台生产计划。');
  });

  it('prevents completing first production plan task without confirmed plan', () => {
    expect(
      getFirstProductionPlanCompletionIssue([
        { status: ProductionPlanStatus.DRAFT },
      ]),
    ).toBe('首台计划未确认时不能完成首台节点。');
  });

  it('prevents completing trial production task without effective trial record', () => {
    expect(getTrialProductionCompletionIssue([])).toBe(
      '至少需要一条有效试制记录后才能完成试制节点。',
    );
    expect(
      getTrialProductionCompletionIssue([
        {
          status: TrialProductionStatus.IN_PROGRESS,
          result: TrialProductionResult.PASS,
        },
      ]),
    ).toBe('没有有效试制记录时不能完成试制节点。');
  });

  it('spawns cab review after trial production task complete', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.TRIAL_PRODUCTION,
      WorkflowAction.COMPLETE,
    );

    expect(templates).toHaveLength(1);
    expect(templates[0]?.nodeCode).toBe(WorkflowNodeCode.CAB_REVIEW);
  });

  it('maps trial production result to terminal status', () => {
    expect(getTrialProductionStatusAfterComplete(TrialProductionResult.PASS)).toBe(
      TrialProductionStatus.PASSED,
    );
    expect(getTrialProductionStatusAfterComplete(TrialProductionResult.FAIL)).toBe(
      TrialProductionStatus.FAILED,
    );
  });
});
