import { describe, expect, it } from 'vitest';
import { WorkflowAction, WorkflowNodeCode, WorkflowTaskStatus } from '@prisma/client';

import {
  getAllowedWorkflowActions,
  getCurrentNodeName,
  getWorkflowNextTaskTemplates,
  getWorkflowTerminalStatus,
  isPrimaryWorkflowNode,
} from './workflow-node.constants';

describe('workflow node configuration', () => {
  it('creates color numbering in parallel after sample color confirmation approval', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
      WorkflowAction.APPROVE,
    );

    expect(templates.map((template) => template.nodeCode)).toEqual([
      WorkflowNodeCode.PAINT_PROCUREMENT,
      WorkflowNodeCode.COLOR_NUMBERING,
    ]);
    expect(templates[1]?.isPrimary).toBe(false);
  });

  it('returns cab review reject to trial production', () => {
    const templates = getWorkflowNextTaskTemplates(
      WorkflowNodeCode.CAB_REVIEW,
      WorkflowAction.REJECT,
    );

    expect(templates).toHaveLength(1);
    expect(templates[0]?.nodeCode).toBe(WorkflowNodeCode.TRIAL_PRODUCTION);
  });

  it('guards node actions and labels', () => {
    expect(getAllowedWorkflowActions(WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW)).toContain(
      WorkflowAction.APPROVE,
    );
    expect(getCurrentNodeName(WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE)).toBe('颜色开发收费');
    expect(isPrimaryWorkflowNode(WorkflowNodeCode.PERFORMANCE_TEST)).toBe(false);
    expect(getWorkflowTerminalStatus(WorkflowAction.APPROVE)).toBe(WorkflowTaskStatus.APPROVED);
  });
});
