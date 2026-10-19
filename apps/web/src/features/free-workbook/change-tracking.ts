import { CommandType } from '@univerjs/core';

const derivedFormulaMutations = new Set([
  'formula.mutation.set-trigger-formula-calculation-start',
  'formula.mutation.set-formula-calculation-start',
  'formula.mutation.set-formula-calculation-stop',
  'formula.mutation.set-formula-calculation-notification',
  'formula.mutation.set-formula-calculation-result',
  'formula.mutation.set-formula-data',
  'formula.mutation.set-array-formula-data',
  'formula.mutation.set-image-formula-data',
]);

/** Ignore engine restoration/cache work, never a timer window or all local edits. */
export function changesWorkbook(event: {
  id: string;
  type: CommandType;
  params?: unknown;
  options?: { onlyLocal?: boolean; fromFormula?: boolean };
}): boolean {
  if (event.type !== CommandType.MUTATION) return false;
  const params = event.params && typeof event.params === 'object'
    ? event.params as Record<string, unknown> : {};
  // Selecting/loading a cell replaces the internal editor's document snapshot.
  // Actual typing/IME/formatting has a different trigger and still marks dirty,
  // including text that has not yet been committed to a worksheet cell.
  if (event.id === 'doc.mutation.rich-text-editing'
      && typeof params.unitId === 'string' && params.unitId.startsWith('__INTERNAL_EDITOR__')
      && params.trigger === 'doc.command-replace-snapshot') return false;
  if (event.options?.onlyLocal === true) {
    if (derivedFormulaMutations.has(event.id)) return false;
    if (event.id === 'sheet.mutation.set-range-values' && event.options.fromFormula === true) return false;
  }
  return true;
}
