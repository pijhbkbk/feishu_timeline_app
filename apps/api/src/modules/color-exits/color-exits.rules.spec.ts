import { describe, expect, it } from 'vitest';

import {
  getColorExitCompletionIssue,
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
      }),
    ).toBe('退出日期不能为空。');
  });
});
