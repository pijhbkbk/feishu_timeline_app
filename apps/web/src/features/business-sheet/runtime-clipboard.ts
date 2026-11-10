import { CellValueType, CustomCommandExecutionError, getNumfmtParseValueFilter, isTextFormat, willLoseNumericPrecision, type IDocumentBody } from '@univerjs/core';
import { virtualizeDiscreteRanges, type ISheetClipboardHook } from '@univerjs/preset-sheets-core';
import { type BusinessSheetChange, BusinessSheetModel } from './runtime-model';

// Match the 1.0.4 clipboard's rich-text decision. A plain document may carry a
// different dataStream from v; Univer discards that document and writes v.
// The installed ES/CJS bundle regression checks this projection against its
// actual getSetCellDataMutations/getSetCellValueMutations implementations.
function keepsClipboardDocument(body: IDocumentBody): boolean {
  if (typeof body.dataStream !== 'string') return true; // let model validation reject it
  const length = body.dataStream.replace(/(\r\n)+$/, '').length;
  return (body.textRuns ?? []).filter(run => run.st < length).some(run =>
    Boolean(run.ts && ('va' in run.ts || Object.keys(run.ts).length && run.ed - run.st < length))) ||
    (body.paragraphs ?? []).some(paragraph => Boolean(paragraph.bullet)) || (body.paragraphs?.length ?? 0) >= 2 ||
    Boolean(body.customRanges?.length || body.customBlocks?.length);
}

/** Preflight the whole paste before Univer runs its separate value/formula mutations. */
export function businessClipboardGuard(model: BusinessSheetModel, unitId: string, subUnitId: string,
  onError: (message: string) => void, onBeforeChanges: ((changes: readonly BusinessSheetChange[]) => void) | undefined,
  conversion: { numberFormat(row: number, col: number): string | undefined; parseOptions: Parameters<typeof getNumfmtParseValueFilter>[1] }): ISheetClipboardHook {
  const reject = (message: string): never => { onError(message); throw new CustomCommandExecutionError(message); };
  const check = (matrix: unknown) => {
    const checked = model.validate(matrix, Boolean(onBeforeChanges));
    if (checked.error) reject(checked.error);
    try { if (checked.changes.length) onBeforeChanges?.(checked.changes); }
    catch (cause) { reject(cause instanceof Error ? cause.message : '本次输入存在关联字段冲突，未应用。'); }
  };
  const empty = () => ({ redos: [], undos: [] });
  return {
    id: 'business-records-clipboard-preflight',
    onPasteCells(from, to, data, payload) {
      if (to.unitId !== unitId || to.subUnitId !== subUnitId) return empty();
      const { rows, cols } = to.range;
      if (!rows.length || !cols.length || rows.length * cols.length > 50000 ||
        rows.some(row => !Number.isInteger(row) || row < 0 || row > model.rows.length) ||
        cols.some(col => !Number.isInteger(col) || col < 0 || col >= model.columns.length)) reject('不能在业务记录范围之外输入。');
      // These modes do not write cell values. Structural mutations keep their
      // existing guard; merged source cells must still fail before any styling.
      const styleOnly = ['special-paste-format', 'special-paste-col-width'].includes(payload.pasteType);
      const valuesOnly = payload.pasteType === 'special-paste-value';
      const map = virtualizeDiscreteRanges([to.range]).mapFunc;
      const matrix: Record<number, Record<number, unknown>> = {};
      let count = 0;
      data.forValue((row, col, cell) => {
        if (++count > 50000) reject('一次修改的单元格过多。');
        const position = map(row, col);
        if (!Number.isInteger(position.row) || !Number.isInteger(position.col)) reject('单元格范围无效。');
        if (!valuesOnly && payload.pasteType !== 'special-paste-col-width' && cell && ((cell.rowSpan ?? 1) > 1 || (cell.colSpan ?? 1) > 1)) reject('业务清单不允许合并单元格。');
        if (styleOnly) return;
        // Span/plain are clipboard transport metadata, not workbook cell keys.
        // Explicit paste-values may use a formula's cached scalar; normal paste
        // must inspect the formula metadata before the first value is applied.
        let value: unknown = null;
        if (cell) {
          const content = { ...cell }; delete content.rowSpan; delete content.colSpan; delete content.plain;
          const p = cell.p?.body && keepsClipboardDocument(cell.p.body) ? cell.p : null;
          const projected = { v: cell.v, t: cell.t, p };
          // External clipboard values use the target format in the actual SDK
          // factory. A mixed @/General range can convert equal-looking values
          // differently; domain preflight must see those actual values together.
          if (!from && !p && cell.v && !(typeof cell.s === 'object' && cell.s?.n?.pattern)) {
            if (isTextFormat(conversion.numberFormat(position.row, position.col))) projected.t = CellValueType.STRING;
            else {
              const text = String(cell.v).trim(), parsed = getNumfmtParseValueFilter(text, conversion.parseOptions);
              if (parsed?.v !== undefined && typeof parsed.v === 'number') {
                if (!parsed.z && willLoseNumericPrecision(text)) projected.t = CellValueType.FORCE_STRING;
                else projected.v = parsed.v;
              }
            }
          }
          value = valuesOnly ? projected : { ...content, ...projected };
        }
        (matrix[position.row] ??= {})[position.col] = value;
      });
      if (!styleOnly) check(matrix);
      return empty();
    },
    onPastePlainText(to, text) {
      if (to.unitId === unitId && to.subUnitId === subUnitId) {
        // Univer's plain-text path writes only the top-left cell, even when a
        // larger selection is active. Preserve that target and conversion path.
        check({ [to.range.rows[0]!]: { [to.range.cols[0]!]: { v: text } } });
      }
      return empty();
    },
  };
}
