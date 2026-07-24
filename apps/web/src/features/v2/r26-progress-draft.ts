import type { R26ProgressStatus } from './real-types';

export type R26LocalProgressDraft = {
  progressStatus: R26ProgressStatus;
  completedWork: string;
  nextPlan: string;
  blockerDescription: string;
  assistanceUserIds: string[];
  assistanceDepartmentIds: string[];
  expectedResolvedAt: string;
};

export function hasRecoverableProgressDraft(
  draft: R26LocalProgressDraft,
) {
  return (
    draft.progressStatus !== 'IN_PROGRESS' ||
    Boolean(draft.completedWork.trim()) ||
    Boolean(draft.nextPlan.trim()) ||
    Boolean(draft.blockerDescription.trim()) ||
    draft.assistanceUserIds.length > 0 ||
    draft.assistanceDepartmentIds.length > 0 ||
    Boolean(draft.expectedResolvedAt)
  );
}
