import { describe, expect, it } from 'vitest';

import { hasRecoverableProgressDraft } from './r26-progress-draft';

const emptyDraft = {
  progressStatus: 'IN_PROGRESS' as const,
  completedWork: '',
  nextPlan: '',
  blockerDescription: '',
  assistanceUserIds: [],
  assistanceDepartmentIds: [],
  expectedResolvedAt: '',
};

describe('R26 Gate 3B local progress recovery', () => {
  it('does not prompt for a completely empty default draft', () => {
    expect(hasRecoverableProgressDraft(emptyDraft)).toBe(false);
  });

  it('keeps meaningful text, blocker choices, and assistance selections', () => {
    expect(
      hasRecoverableProgressDraft({
        ...emptyDraft,
        completedWork: '已完成一次现场核对',
      }),
    ).toBe(true);
    expect(
      hasRecoverableProgressDraft({
        ...emptyDraft,
        progressStatus: 'BLOCKED',
      }),
    ).toBe(true);
    expect(
      hasRecoverableProgressDraft({
        ...emptyDraft,
        assistanceDepartmentIds: ['department-1'],
      }),
    ).toBe(true);
  });
});
