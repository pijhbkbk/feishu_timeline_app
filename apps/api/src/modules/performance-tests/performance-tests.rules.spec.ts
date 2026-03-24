import { describe, expect, it } from 'vitest';
import {
  PerformanceTestResult,
  PerformanceTestStatus,
  WorkflowAction,
  WorkflowTaskStatus,
} from '@prisma/client';

import { getWorkflowTerminalStatus } from '../workflows/workflow-node.constants';
import {
  getPerformanceTestCompletionIssue,
  getPerformanceTestStageIssue,
  getPerformanceTestSubmitIssue,
} from './performance-tests.rules';

describe('performance tests rules', () => {
  it('blocks performance tests before procurement is completed', () => {
    expect(
      getPerformanceTestStageIssue({
        procurementCompleted: false,
        hasActiveTask: false,
      }),
    ).toBe('采购节点尚未完成，不能进入性能试验。');
  });

  it('prevents completing the task when no submitted conclusion exists', () => {
    expect(
      getPerformanceTestCompletionIssue([
        {
          status: PerformanceTestStatus.DRAFT,
          conclusion: '附着力合格',
        },
      ]),
    ).toBe('没有有效试验结论时不能完成性能试验节点。');
  });

  it('treats workflow complete as a completed task state', () => {
    expect(getWorkflowTerminalStatus(WorkflowAction.COMPLETE)).toBe(
      WorkflowTaskStatus.COMPLETED,
    );
  });

  it('requires report attachment before submit', () => {
    expect(
      getPerformanceTestSubmitIssue({
        standardValue: '>= 90',
        actualValue: '92',
        result: PerformanceTestResult.PASS,
        conclusion: '满足要求',
        testedById: 'user-1',
        testedAt: new Date('2026-03-18T10:00:00.000Z'),
        reportAttachmentId: null,
        sampleId: 'sample-1',
        relatedObjectName: null,
      }),
    ).toBe('请先上传试验报告附件。');
  });
});
