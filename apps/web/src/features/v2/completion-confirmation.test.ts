import { describe, expect, it } from 'vitest';

import { getCompletionConfirmationState } from './completion-confirmation';

describe('completion confirmation affordance', () => {
  it('keeps the action clickable so missing fields produce guidance', () => {
    expect(
      getCompletionConfirmationState({
        pending: false,
        canComplete: true,
        completionReason: '',
        acknowledgedConsequences: false,
      }),
    ).toMatchObject({
      submitDisabled: false,
      missingField: 'reason',
    });

    expect(
      getCompletionConfirmationState({
        pending: false,
        canComplete: true,
        completionReason: '已完成市场需求确认',
        acknowledgedConsequences: false,
      }),
    ).toMatchObject({
      submitDisabled: false,
      missingField: 'acknowledgement',
    });
  });

  it('only disables submission while pending or blocked by the server preview', () => {
    expect(
      getCompletionConfirmationState({
        pending: true,
        canComplete: true,
        completionReason: '已完成',
        acknowledgedConsequences: true,
      }).submitDisabled,
    ).toBe(true);
    expect(
      getCompletionConfirmationState({
        pending: false,
        canComplete: false,
        completionReason: '已完成',
        acknowledgedConsequences: true,
      }).submitDisabled,
    ).toBe(true);
  });
});
