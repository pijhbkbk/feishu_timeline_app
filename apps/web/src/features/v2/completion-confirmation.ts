export type CompletionConfirmationInput = {
  pending: boolean;
  canComplete: boolean;
  completionReason: string;
  acknowledgedConsequences: boolean;
};

export type CompletionConfirmationState = {
  submitDisabled: boolean;
  missingField: 'reason' | 'acknowledgement' | null;
  hint: string;
};

export function getPrimaryCompletionTask<T extends { isPrimary: boolean }>(
  tasks: readonly T[],
): T | null {
  return tasks.find((task) => task.isPrimary) ?? tasks[0] ?? null;
}

export function getCompletionConfirmationState(
  input: CompletionConfirmationInput,
): CompletionConfirmationState {
  if (input.pending) {
    return {
      submitDisabled: true,
      missingField: null,
      hint: '正在提交，请勿重复点击。',
    };
  }

  if (!input.canComplete) {
    return {
      submitDisabled: true,
      missingField: null,
      hint: '请先处理上方未通过的完成条件。',
    };
  }

  if (!input.completionReason.trim()) {
    return {
      submitDisabled: false,
      missingField: 'reason',
      hint: '点击推进后，将引导填写完成说明。',
    };
  }

  if (!input.acknowledgedConsequences) {
    return {
      submitDisabled: false,
      missingField: 'acknowledgement',
      hint: '点击推进后，将引导确认推进影响。',
    };
  }

  return {
    submitDisabled: false,
    missingField: null,
    hint: '完成说明和推进影响已确认，可以提交。',
  };
}
