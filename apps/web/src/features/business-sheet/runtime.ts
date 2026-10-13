'use client';

import { CellValueType, CommandType, LifecycleStages, type ICellData, type IWorkbookData, type IObjectMatrixPrimitiveType } from '@univerjs/core';
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import CoreZhCN from '@univerjs/preset-sheets-core/locales/zh-CN';
import { setNonce } from 'get-nonce';
import { BusinessSheetModel, VALUE_MUTATION, allowedSheetMutation, forbiddenSheetCommand, type BusinessSheetChange, type BusinessSheetColumn, type BusinessSheetRow, type BusinessSheetUpdate } from './runtime-model';
import '@univerjs/preset-sheets-core/lib/index.css';
import '@univerjs/preset-sheets-drawing/lib/index.css';
import DrawingZhCN from '@univerjs/preset-sheets-drawing/locales/zh-CN';
import { RecordImageIo, createRecordDrawingPreset } from './drawing-preset';
import { bindRuntimeImages, drawingCommands, type RuntimeImageActions } from './runtime-images';
import type { SheetImage } from './image-client';

export type { BusinessSheetChange, BusinessSheetColumn, BusinessSheetRow, BusinessSheetUpdate } from './runtime-model';
export interface BusinessSheetOptions {
  container: HTMLElement;
  rows: BusinessSheetRow[];
  columns: BusinessSheetColumn[];
  onChanges: (changes: BusinessSheetChange[]) => void;
  /** Optional domain check includes unchanged editable cells in the same mutation. */
  onBeforeChanges?: (changes: readonly BusinessSheetChange[]) => void;
  onSelection: (id: string, row: number, col: number) => void;
  onError: (message: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  imageActions?: RuntimeImageActions;
}
export interface BusinessSheetRuntime {
  ready: Promise<void>;
  setImages: (images: readonly SheetImage[]) => Promise<void>;
  replaceRows: (rows: BusinessSheetRow[]) => Promise<void>;
  updateValues: (changes: BusinessSheetUpdate[]) => void;
  finishEditing: () => Promise<void>;
  selectCell: (id: string, field: string) => void;
  dispose: () => void;
}

const SHEET_ID = 'business-records';
const commandNames = [
  'set-range-values', 'clear-selection-content', 'clear-selection-format', 'clear-selection-all',
  'set-style', 'set-border', 'set-border-position', 'set-border-color', 'set-border-style', 'set-background-color',
  'set-font-family', 'set-font-size', 'set-bold', 'set-italic', 'set-underline', 'set-overline', 'set-stroke',
  'set-text-color', 'set-text-wrap', 'set-horizontal-text-align', 'set-vertical-text-align',
  'set-range-bold', 'set-range-italic', 'set-range-underline', 'set-range-stroke',
  'set-range-fontsize', 'set-range-font-increase', 'set-range-font-decrease', 'set-range-font-family',
  'set-range-text-color', 'reset-range-text-color', 'set-worksheet-col-width', 'set-col-auto-width',
  'set-row-height', 'set-row-is-auto-height', 'set-frozen', 'cancel-frozen', 'set-selection-frozen',
  'set-row-frozen', 'set-col-frozen', 'set-first-row-frozen', 'set-first-column-frozen',
  'set-zoom-ratio', 'set-zoom-ratio-from-toolbar', 'change-zoom-ratio',
  'select-range', 'select-all', 'move-selection', 'move-selection-enter-tab', 'expand-selection',
  'scroll-to-cell', 'scroll-view', 'scroll-view-reset', 'set-scroll-relative',
  'copy-down', 'copy-right', 'auto-fill', 'refill', 'paste-by-short-key', 'paste-value', 'paste-format', 'paste-col-width', 'paste-besides-border', 'optional-paste',
  'set-worksheet-activate', 'toggle-gridlines', 'set-gridlines-color',
];
const sheetCommands = new Set(commandNames.map(id => `sheet.command.${id}`));
const hiddenCommands = [
  'ui.operation.activate-format-painter', 'ui.operation.continuous-format-painter',
  'sheet.command.set-once-format-painter', 'sheet.command.set-infinite-format-painter', 'sheet.command.apply-format-painter',
  'formula-ui.operation.insert-function', 'formula-ui.operation.more-functions', 'formula.command.insert-function',
  ...['common', 'financial', 'logical', 'text', 'date', 'lookup', 'math', 'statistical', 'engineering', 'information', 'database'].map(category => `formula-ui.operation.insert-function.${category}`),
  'univer.command.undo', 'univer.command.redo', 'sheet.command.insert-sheet', 'sheet.command.remove-sheet',
  'sheet.command.insert-row', 'sheet.command.insert-col', 'sheet.command.remove-row', 'sheet.command.remove-col',
  'sheet.command.insert-row-before', 'sheet.command.insert-row-after', 'sheet.command.insert-col-before', 'sheet.command.insert-col-after',
  'sheet.command.insert-range-move-down-confirm', 'sheet.command.insert-range-move-right-confirm',
  'sheet.command.delete-range-move-left-confirm', 'sheet.command.delete-range-move-up-confirm',
  'sheet.command.remove-row-confirm', 'sheet.command.remove-col-confirm', 'sheet.command.remove-sheet-confirm',
  'sheet.command.hide-row-confirm', 'sheet.command.hide-col-confirm', 'sheet.command.move-range-confirm',
  'sheet.command.add-worksheet-merge', 'sheet.command.set-worksheet-name', 'sheet.operation.rename-sheet',
  'sheet.command.add-range-protection-from-toolbar', 'sheet.command.add-range-protection-from-context-menu',
  'sheet.command.view-sheet-permission-from-context-menu', 'sheet.command.add-range-protection-from-sheet-bar',
  'sheet.command.view-sheet-permission-from-sheet-bar', 'sheet.contextMenu.permission',
  'sheet.command.delete-worksheet-protection-from-sheet-bar', 'sheet.command.change-sheet-protection-from-sheet-bar',
  'sheet.command.set-range-protection-from-context-menu', 'sheet.command.delete-range-protection-from-context-menu',
  'sidebar.operation.defined-name', 'sheet.command.set-text-rotation', 'sheet.command.set-shrink-to-fit',
  'sheet.command.set-range-subscript', 'sheet.command.set-range-superscript', 'sheet.command.set-numfmt',
  'sheet.command.set-range-theme', 'sheet.command.open-range-theme-panel',
];

function textCell(value: string | null, header = false): ICellData {
  return { v: value, t: CellValueType.STRING, f: null, p: null,
    s: { ff: 'PingFang SC', fs: 11, bl: header ? 1 : 0, n: { pattern: '@' }, ...(header ? { bg: { rgb: '#edf3ee' }, cl: { rgb: '#264c3b' } } : {}) } };
}

export function createBusinessSheet(options: BusinessSheetOptions): BusinessSheetRuntime {
  setNonce(document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ?? '');
  const model = new BusinessSheetModel(options.rows, options.columns);
  const workbookId = `business-sheet-${crypto.randomUUID()}`;
  const data: IObjectMatrixPrimitiveType<ICellData> = { 0: {} };
  options.columns.forEach((column, col) => { data[0]![col] = textCell(column.label, true); });
  options.rows.forEach((row, index) => {
    data[index + 1] = {};
    row.values.forEach((value, col) => { data[index + 1]![col] = textCell(value); });
  });
  const snapshot: IWorkbookData = {
    id: workbookId, name: '颜色清单', appVersion: '1.0.4', locale: LocaleType.ZH_CN, styles: {},
    sheetOrder: [SHEET_ID], sheets: { [SHEET_ID]: {
      id: SHEET_ID, name: '颜色清单', rowCount: Math.max(2, model.rows.length + 1), columnCount: model.columns.length,
      defaultRowHeight: 38, defaultColumnWidth: 150, cellData: data,
      columnData: Object.fromEntries(model.columns.map((column, index) => [index, { w: column.width }])),
      freeze: { xSplit: Math.min(2, model.columns.length), ySplit: 1, startRow: 1, startColumn: Math.min(2, model.columns.length) },
    } },
  };
  const preset = UniverSheetsCorePreset({ container: options.container, header: true, toolbar: true, ribbonType: 'simple',
    formulaBar: false,
    footer: { sheetBar: false, statisticBar: false, menus: false, zoomSlider: true },
    menu: Object.fromEntries(hiddenCommands.map(id => [id, { hidden: true }])),
  });
  // The core preset supplies its normal text editor through the formula UI.
  // Keep those editor dependencies; the value boundary rejects formulas before
  // they can enter the workbook or a business save.
  const imageIo = new RecordImageIo(options.onError);
  const { univer, univerAPI } = createUniver({ locale: LocaleType.ZH_CN, locales: { [LocaleType.ZH_CN]: mergeLocales(CoreZhCN, DrawingZhCN) }, presets: [preset, createRecordDrawingPreset(imageIo)] });
  let disposed = false; let silent = 0; let editing: { row: number; col: number } | null = null;
  let resolveReady!: () => void;
  const ready = new Promise<void>(resolve => { resolveReady = resolve; });
  const subscriptions: Array<{ dispose: () => void }> = [];
  try {
    subscriptions.push(univerAPI.addEvent(univerAPI.Event.LifeCycleChanged, event => { if (event.stage >= LifecycleStages.Steady) resolveReady(); }));
    const workbook = univerAPI.createWorkbook(snapshot);
    const worksheet = workbook.getActiveSheet();
    const imageController = bindRuntimeImages(univerAPI, workbook, model, options.container, options.imageActions ?? { add: () => options.onError('请使用记录照片入口。'), change: () => {}, remove: () => {}, requestFiles: () => options.onError('请使用记录照片入口。') }, run => { silent++; try { return run(); } finally { silent--; } }, options.onError, imageIo);
    if (univerAPI.getCurrentLifecycleStage() >= LifecycleStages.Steady) resolveReady();
    const reject = (event: { cancel?: boolean }, message: string) => { event.cancel = true; options.onError(message); };
    // Univer omits undo/redo from BeforeCommandExecute; always route them through
    // record-scoped business history instead of its internal workbook snapshots.
    subscriptions.push(univerAPI.addEvent(univerAPI.Event.BeforeUndo, event => { event.cancel = true; options.onUndo?.(); }));
    subscriptions.push(univerAPI.addEvent(univerAPI.Event.BeforeRedo, event => { event.cancel = true; options.onRedo?.(); }));
    subscriptions.push(univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, event => {
      if (silent || disposed) return;
      if (drawingCommands.has(event.id)) return;
      if (event.id === 'univer.command.undo' || event.id === 'univer.command.redo') {
        event.cancel = true; (event.id.endsWith('undo') ? options.onUndo : options.onRedo)?.(); return;
      }
      if (event.id === VALUE_MUTATION) {
        if (event.params?.unitId !== workbookId || event.params?.subUnitId !== SHEET_ID) return;
        const checked = model.validate(event.params.cellValue, Boolean(options.onBeforeChanges));
        if (checked.error) reject(event, checked.error);
        else if ((event.options?.fromFormula || event.options?.applyFormulaCalculationResult) && checked.changes.length) reject(event, '公式结果不能改写业务单元格。');
        else if (checked.changes.length && options.onBeforeChanges) { try { options.onBeforeChanges(checked.changes); } catch (cause) { reject(event, cause instanceof Error ? cause.message : '本次输入存在关联字段冲突，未应用。'); } }
        return;
      }
      if (event.type === CommandType.MUTATION && /^(?:sheet|sheets)\./.test(event.id) && !allowedSheetMutation(event.id)) {
        reject(event, '业务清单不允许更改结构、局部排序或执行公式。'); return;
      }
      if (event.type === CommandType.OPERATION && /^sheet\.formula-embedding-editor\.__INTERNAL_EDITOR__DOCS_NORMAL\.[\w-]{4}$/.test(event.id)) return;
      if (['ui.operation.activate-format-painter', 'ui.operation.continuous-format-painter'].includes(event.id)) { reject(event, '此格式操作未在业务清单开放。'); return; }
      if (/^(?:formula\.command\.|formula-ui\.operation\.(?:insert-function|more-functions))/.test(event.id)) { reject(event, '业务清单不支持公式，请输入文本。'); return; }
      if (forbiddenSheetCommand(event.id) || (event.type === CommandType.COMMAND && event.id.startsWith('sheet.command.') && !sheetCommands.has(event.id))) {
        reject(event, '请使用清单筛选和排序；此操作不适用于业务记录。');
      }
    }));
    subscriptions.push(univerAPI.addEvent(univerAPI.Event.CommandExecuted, event => {
      if (silent || disposed || event.options?.fromFormula || event.options?.applyFormulaCalculationResult || event.id !== VALUE_MUTATION || event.params?.unitId !== workbookId || event.params?.subUnitId !== SHEET_ID) return;
      const checked = model.validate(event.params.cellValue, Boolean(options.onBeforeChanges));
      if (checked.error || !checked.changes.length) return;
      model.apply(checked.changes); options.onChanges(checked.changes);
    }));
    subscriptions.push(univerAPI.addEvent(univerAPI.Event.BeforeSheetEditStart, event => {
      if (!model.editable(event.row, event.column)) reject(event, event.row === 0 ? '表头不能修改。' : '此字段请在记录详情中查看或办理。');
    }));
    subscriptions.push(univerAPI.addEvent(univerAPI.Event.SheetEditStarted, event => { editing = { row: event.row, col: event.column }; }));
    subscriptions.push(univerAPI.addEvent(univerAPI.Event.SheetEditEnded, () => { editing = null; }));
    const notifySelection = () => {
      const active = worksheet.getActiveCell(); if (!active || disposed) return;
      const row = active.getRow(), col = active.getColumn();
      const identity = model.identity(row, col);
      if (identity) options.onSelection(identity.id, row, col);
    };
    // Subscribe on the workbook's global selection service. The 1.0.4 UI event
    // bridge looks up this service on the renderer, where it is not registered.
    subscriptions.push(workbook.onSelectionChange(notifySelection));
    const keyboard = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      event.preventDefault(); event.stopPropagation();
      if (key === 'y' || event.shiftKey) options.onRedo?.(); else options.onUndo?.();
    };
    options.container.addEventListener('keydown', keyboard, true);
    const dispose = () => {
      if (disposed) return; disposed = true; resolveReady();
      options.container.removeEventListener('keydown', keyboard, true);
      subscriptions.forEach(item => item.dispose()); imageController.dispose(); imageIo.dispose(); univer.dispose();
    };
    return {
      ready,
      setImages: async images => { await ready; if (!disposed) await imageController.render(images); },
      replaceRows: async rows => {
        await ready;
        if (disposed) return;
        if (workbook.isCellEditing()) await workbook.endEditingAsync(true);
        // Validate identities before any display mutation. A view change only
        // replaces the positional projection, never a business value or revision.
        const next = new BusinessSheetModel(rows, options.columns);
        const previous = model.rows.length;
        const values: IObjectMatrixPrimitiveType<ICellData> = {};
        for (let row = 0; row < Math.max(previous, rows.length); row++) {
          values[row + 1] = {};
          options.columns.forEach((_column, col) => { values[row + 1]![col] = textCell(next.rows[row]?.values[col] ?? null); });
        }
        silent += 1;
        try {
          worksheet.setRowCount(Math.max(2, previous + 1, rows.length + 1));
          univerAPI.syncExecuteCommand(VALUE_MUTATION, { unitId: workbookId, subUnitId: SHEET_ID, cellValue: values });
          model.replaceRows(rows);
          worksheet.setRowCount(Math.max(2, rows.length + 1));
        } finally { silent -= 1; }
        await imageController.render();
      },
      updateValues: changes => {
        if (disposed) return;
        const accepted: BusinessSheetChange[] = []; const values: IObjectMatrixPrimitiveType<ICellData> = {};
        for (const change of changes) {
          const position = model.position(change.id, change.field); if (!position) continue;
          if (editing && editing.row === position.row && editing.col === position.col) continue;
          if (change.expectedValue !== undefined && model.value(position.row, position.col) !== change.expectedValue) continue;
          if (model.value(position.row, position.col) === change.value) continue;
          values[position.row] ??= {}; values[position.row]![position.col] = { v: change.value, t: CellValueType.STRING, f: null, p: null };
          accepted.push(change);
        }
        if (!accepted.length) return;
        silent += 1;
        try {
          const result = univerAPI.syncExecuteCommand(VALUE_MUTATION, { unitId: workbookId, subUnitId: SHEET_ID, cellValue: values });
          if (result !== false) model.apply(accepted);
        } finally { silent -= 1; }
      },
      finishEditing: async () => { if (!disposed && workbook.isCellEditing()) await workbook.endEditingAsync(true); },
      selectCell: (id, field) => { const position = model.position(id, field); if (position && !disposed) { worksheet.setActiveRange(worksheet.getRange(position.row, position.col, 1, 1)); notifySelection(); } },
      dispose,
    };
  } catch (error) {
    resolveReady(); subscriptions.forEach(item => item.dispose()); imageIo.dispose(); univer.dispose(); throw error;
  }
}
