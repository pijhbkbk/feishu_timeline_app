import { describe, expect, it } from 'vitest';
import {
  ProcurementStatus,
  WorkflowAction,
  WorkflowNodeCode,
} from '@prisma/client';

import { getWorkflowNextTaskTemplates } from '../workflows/workflow-node.constants';
import {
  getPaintProcurementCompletionIssue,
  getPaintProcurementStageIssue,
  getProcurementStatusTransitionTarget,
} from './paint-procurements.rules';

describe('paint procurement rules', () => {
  it('blocks procurement access before sample confirmation approval creates an active task', () => {
    expect(
      getPaintProcurementStageIssue({
        currentNodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
        hasActiveTask: false,
      }),
    ).toBe('当前没有活跃的涂料采购任务，样板颜色确认通过后才能进入采购。');
  });

  it('rejects procurement completion when no arrived record exists', () => {
    expect(
      getPaintProcurementCompletionIssue([
        { status: ProcurementStatus.DRAFT },
        { status: ProcurementStatus.ORDERED },
      ]),
    ).toBe('没有已到货的采购记录，不能完成采购节点。');
  });

  it('activates downstream performance test, standard board and first production plan after procurement complete', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.PAINT_PROCUREMENT,
      WorkflowAction.COMPLETE,
    );

    expect(templates.map((template) => template.nodeCode)).toEqual([
      WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
      WorkflowNodeCode.PERFORMANCE_TEST,
      WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
    ]);
  });

  it('rejects illegal procurement status transitions', () => {
    expect(
      getProcurementStatusTransitionTarget(
        ProcurementStatus.CANCELLED,
        'MARK_ARRIVED',
      ),
    ).toBeNull();
    expect(
      getProcurementStatusTransitionTarget(
        ProcurementStatus.ORDERED,
        'MARK_ARRIVED',
      ),
    ).toBe(ProcurementStatus.ARRIVED);
  });
});
