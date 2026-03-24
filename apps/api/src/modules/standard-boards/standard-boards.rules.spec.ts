import { describe, expect, it } from 'vitest';
import {
  ColorBoardDetailUpdateStatus,
  StandardBoardStatus,
  WorkflowAction,
  WorkflowNodeCode,
} from '@prisma/client';

import { getWorkflowNextTaskTemplates } from '../workflows/workflow-node.constants';
import {
  getBoardDetailUpdateCompletionIssue,
  getStandardBoardCompletionIssue,
  getStandardBoardStageIssue,
  getStandardBoardStatusTransitionTarget,
} from './standard-boards.rules';

describe('standard boards rules', () => {
  it('blocks standard board stage before procurement is completed', () => {
    expect(
      getStandardBoardStageIssue({
        procurementCompleted: false,
        hasActiveTask: false,
      }),
    ).toBe('采购节点尚未完成，不能进入标准板制作、下发。');
  });

  it('prevents completing standard board task without issued boards', () => {
    expect(
      getStandardBoardCompletionIssue([
        { status: StandardBoardStatus.DRAFT },
        { status: StandardBoardStatus.CREATED },
      ]),
    ).toBe('没有已下发的标准板时不能完成标准板节点。');
  });

  it('spawns color board detail update after standard board task complete', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      WorkflowAction.COMPLETE,
    );

    expect(templates).toHaveLength(1);
    expect(templates[0]?.nodeCode).toBe(WorkflowNodeCode.BOARD_DETAIL_UPDATE);
  });

  it('prevents completing color board detail update without records', () => {
    expect(getBoardDetailUpdateCompletionIssue([])).toBe(
      '没有明细更新记录时不能完成色板明细更新节点。',
    );

    expect(
      getBoardDetailUpdateCompletionIssue([
        { updateStatus: ColorBoardDetailUpdateStatus.UPDATED },
      ]),
    ).toBeNull();
  });

  it('rejects illegal standard board lifecycle transitions', () => {
    expect(
      getStandardBoardStatusTransitionTarget(
        StandardBoardStatus.DRAFT,
        'ISSUE',
      ),
    ).toBeNull();
    expect(
      getStandardBoardStatusTransitionTarget(
        StandardBoardStatus.CREATED,
        'ISSUE',
      ),
    ).toBe(StandardBoardStatus.ISSUED);
  });
});
