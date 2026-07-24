import { WorkflowAction, WorkflowNodeCode } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { getWorkflowNextTaskTemplates } from './workflow-node.constants';

describe('workflow node constants', () => {
  it('creates procurement and numbering in parallel after sample color confirmation approve', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
      WorkflowAction.APPROVE,
    );

    expect(templates).toEqual([
      expect.objectContaining({
        nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
        isPrimary: true,
      }),
      expect.objectContaining({
        nodeCode: WorkflowNodeCode.COLOR_NUMBERING,
        isPrimary: false,
      }),
    ]);
  });

  it('creates mainline and parallel tasks after paint procurement completes', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.PAINT_PROCUREMENT,
      WorkflowAction.COMPLETE,
    );

    expect(templates).toHaveLength(3);
    expect(templates[0]).toEqual(
      expect.objectContaining({
        nodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
        isPrimary: true,
      }),
    );
    expect(templates[1]).toEqual(
      expect.objectContaining({
        nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
        isPrimary: false,
      }),
    );
    expect(templates[2]).toEqual(
      expect.objectContaining({
        nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        isPrimary: false,
      }),
    );
  });

  it('creates board detail update after standard board production completes', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      WorkflowAction.COMPLETE,
    );

    expect(templates).toEqual([
      expect.objectContaining({
        nodeCode: WorkflowNodeCode.BOARD_DETAIL_UPDATE,
        isPrimary: false,
      }),
    ]);
  });

  it.each([
    [
      WorkflowNodeCode.PROJECT_INITIATION,
      WorkflowNodeCode.DEVELOPMENT_REPORT,
    ],
    [
      WorkflowNodeCode.DEVELOPMENT_REPORT,
      WorkflowNodeCode.PAINT_DEVELOPMENT,
    ],
    [
      WorkflowNodeCode.PAINT_DEVELOPMENT,
      WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
    ],
    [
      WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
      WorkflowNodeCode.TRIAL_PRODUCTION,
    ],
    [
      WorkflowNodeCode.TRIAL_PRODUCTION,
      WorkflowNodeCode.CAB_REVIEW,
    ],
  ])(
    'keeps the frozen serial transition %s → %s',
    (current, expectedNext) => {
      expect(
        getWorkflowNextTaskTemplates(
          current,
          WorkflowAction.COMPLETE,
        ),
      ).toEqual([
        expect.objectContaining({
          nodeCode: expectedNext,
        }),
      ]);
    },
  );

  it('keeps step 9 non-blocking and unable to create a new mainline task', () => {
    expect(
      getWorkflowNextTaskTemplates(
        WorkflowNodeCode.PERFORMANCE_TEST,
        WorkflowAction.COMPLETE,
      ),
    ).toEqual([]);
  });

  it('does not expose step 12 specialized transitions as an ordinary completion', () => {
    expect(
      getWorkflowNextTaskTemplates(
        WorkflowNodeCode.CAB_REVIEW,
        WorkflowAction.COMPLETE,
      ),
    ).toEqual([]);
  });
});
