import { CommandType } from '@univerjs/core';
import { describe, expect, it } from 'vitest';
import { changesWorkbook } from './change-tracking';
const mutation = (id: string, params = {}, options = {}) => ({ id, type: CommandType.MUTATION, params, options });
describe('workbook dirty tracking', () => {
  it('ignores the observed engine load and formula recovery events', () => {
    expect(changesWorkbook(mutation('doc.mutation.rich-text-editing', {unitId: '__INTERNAL_EDITOR__DOCS_NORMAL', trigger: 'doc.command-replace-snapshot'}))).toBe(false);
    for (const id of ['set-trigger-formula-calculation-start', 'set-formula-calculation-start', 'set-formula-calculation-notification', 'set-formula-calculation-result', 'set-formula-data', 'set-array-formula-data']) {
      expect(changesWorkbook(mutation(`formula.mutation.${id}`, {}, {onlyLocal: true}))).toBe(false);
    }
    expect(changesWorkbook(mutation('sheet.mutation.set-range-values', {}, {onlyLocal: true, fromFormula: true, applyFormulaCalculationResult: true}))).toBe(false);
  });
  it('retains typing, IME and formatting before the editor commits to a cell', () => {
    for (const trigger of ['doc.command.insert-text', 'doc.command.ime-input', 'doc.command.set-inline-format']) {
      expect(changesWorkbook(mutation('doc.mutation.rich-text-editing', {unitId: '__INTERNAL_EDITOR__DOCS_NORMAL', trigger}))).toBe(true);
    }
  });
  it('retains real values, formula edits, structure, styles, images, and undo/redo mutations', () => {
    for (const id of ['sheet.mutation.set-range-values', 'sheet.mutation.insert-row', 'sheet.mutation.insert-col', 'sheet.mutation.insert-sheet', 'sheet.mutation.set-style', 'drawing.mutation.apply-drawing', 'sheet.mutation.set-worksheet-background-image']) {
      expect(changesWorkbook(mutation(id))).toBe(true);
      expect(changesWorkbook(mutation(id, {}, {onlyLocal: true}))).toBe(true);
    }
  });
  it('does not swallow unknown events or a normal document replacement', () => {
    expect(changesWorkbook(mutation('formula.mutation.future-feature', {}, {onlyLocal: true}))).toBe(true);
    expect(changesWorkbook(mutation('doc.mutation.rich-text-editing', {unitId: 'ordinary-doc', trigger: 'doc.command-replace-snapshot'}))).toBe(true);
    expect(changesWorkbook(mutation('formula.mutation.set-formula-data'))).toBe(true);
    expect(changesWorkbook({...mutation('selection.operation'), type: CommandType.OPERATION})).toBe(false);
  });
});
