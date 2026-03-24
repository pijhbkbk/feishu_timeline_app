import { WorkflowAction, WorkflowNodeCode } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { getWorkflowNextTaskTemplates } from './workflow-node.constants';

describe('workflow acceptance flow', () => {
  it('covers the MVP mainline flow', () => {
    const assertions: Array<{
      nodeCode: WorkflowNodeCode;
      action: WorkflowAction;
      next: WorkflowNodeCode[];
    }> = [
      {
        nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
        action: WorkflowAction.COMPLETE,
        next: [WorkflowNodeCode.DEVELOPMENT_REPORT],
      },
      {
        nodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT,
        action: WorkflowAction.SUBMIT,
        next: [WorkflowNodeCode.PAINT_DEVELOPMENT],
      },
      {
        nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
        action: WorkflowAction.COMPLETE,
        next: [WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION],
      },
      {
        nodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
        action: WorkflowAction.COMPLETE,
        next: [WorkflowNodeCode.TRIAL_PRODUCTION],
      },
      {
        nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
        action: WorkflowAction.APPROVE,
        next: [WorkflowNodeCode.MASS_PRODUCTION_PLAN],
      },
      {
        nodeCode: WorkflowNodeCode.MASS_PRODUCTION_PLAN,
        action: WorkflowAction.COMPLETE,
        next: [WorkflowNodeCode.MASS_PRODUCTION],
      },
      {
        nodeCode: WorkflowNodeCode.MASS_PRODUCTION,
        action: WorkflowAction.COMPLETE,
        next: [WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW],
      },
      {
        nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        action: WorkflowAction.APPROVE,
        next: [WorkflowNodeCode.PROJECT_CLOSED],
      },
    ];

    for (const assertion of assertions) {
      expect(
        getWorkflowNextTaskTemplates(assertion.nodeCode, assertion.action).map(
          (item) => item.nodeCode,
        ),
      ).toEqual(assertion.next);
    }
  });

  it('covers parallel branches for sample confirm, procurement and cabin review', () => {
    expect(
      getWorkflowNextTaskTemplates(
        WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
        WorkflowAction.APPROVE,
      ).map((item) => item.nodeCode),
    ).toEqual([
      WorkflowNodeCode.PAINT_PROCUREMENT,
      WorkflowNodeCode.COLOR_NUMBERING,
    ]);

    expect(
      getWorkflowNextTaskTemplates(
        WorkflowNodeCode.PAINT_PROCUREMENT,
        WorkflowAction.COMPLETE,
      ).map((item) => item.nodeCode),
    ).toEqual([
      WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
      WorkflowNodeCode.PERFORMANCE_TEST,
      WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
    ]);

    expect(
      getWorkflowNextTaskTemplates(
        WorkflowNodeCode.CAB_REVIEW,
        WorkflowAction.APPROVE,
      ).map((item) => item.nodeCode),
    ).toEqual([
      WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
      WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE,
    ]);
  });

  it('covers required return branches', () => {
    expect(
      getWorkflowNextTaskTemplates(
        WorkflowNodeCode.CAB_REVIEW,
        WorkflowAction.REJECT,
      ).map((item) => item.nodeCode),
    ).toEqual([WorkflowNodeCode.TRIAL_PRODUCTION]);

    expect(
      getWorkflowNextTaskTemplates(
        WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
        WorkflowAction.REJECT,
      ).map((item) => item.nodeCode),
    ).toEqual([WorkflowNodeCode.PAINT_DEVELOPMENT]);

    expect(
      getWorkflowNextTaskTemplates(
        WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        WorkflowAction.REJECT,
      ).map((item) => item.nodeCode),
    ).toEqual([WorkflowNodeCode.MASS_PRODUCTION]);
  });
});
