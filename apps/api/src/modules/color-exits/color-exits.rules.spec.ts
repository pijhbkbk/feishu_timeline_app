import { describe, expect, it } from 'vitest';

import {
  getColorExitCompletionIssue,
  getColorExitSystemSuggestion,
  getColorExitStageIssue,
} from './color-exits.rules';

describe('color exits rules', () => {
  it('blocks color exit before visual delta review is approved', () => {
    expect(
      getColorExitStageIssue({
        visualDeltaApproved: false,
        hasActiveTask: false,
      }),
    ).toBe('目视色差评审尚未通过，不能进入颜色退出。');
  });

  it('rejects completion when required fields are missing', () => {
    expect(
      getColorExitCompletionIssue({
        exitDate: null,
        exitReason: null,
        operatorId: null,
        statisticYear: null,
        annualOutput: null,
        finalDecision: null,
        effectiveDate: null,
      }),
    ).toBe('退出日期不能为空。');
  });

  it('requires statistic year, annual output, final decision and effective date before completion', () => {
    expect(
      getColorExitCompletionIssue({
        exitDate: new Date('2027-02-25T00:00:00.000Z'),
        exitReason: '量产评审完成，项目正式收尾。',
        operatorId: 'user-1',
        statisticYear: null,
        annualOutput: 18,
        finalDecision: 'EXIT',
        effectiveDate: new Date('2027-02-25T00:00:00.000Z'),
      }),
    ).toBe('统计年度不能为空。');
  });

  it('computes system suggestion from annual output threshold', () => {
    expect(
      getColorExitSystemSuggestion({
        annualOutput: 18,
        threshold: 20,
      }),
    ).toBe('EXIT');
    expect(
      getColorExitSystemSuggestion({
        annualOutput: 36,
        threshold: 20,
      }),
    ).toBe('RETAIN');
  });
});
