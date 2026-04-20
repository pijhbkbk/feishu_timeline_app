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
});
