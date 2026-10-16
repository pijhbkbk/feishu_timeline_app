import { forbiddenSheetCommand } from './runtime-model';

const commandNames = [
  'set-range-values', 'clear-selection-content', 'clear-selection-format', 'clear-selection-all',
  'set-style', 'set-border', 'set-border-position', 'set-border-color', 'set-border-style', 'set-background-color',
  'set-font-family', 'set-font-size', 'set-bold', 'set-italic', 'set-underline', 'set-overline', 'set-stroke',
  'set-text-color', 'set-text-wrap', 'set-horizontal-text-align', 'set-vertical-text-align',
  'set-range-bold', 'set-range-italic', 'set-range-underline', 'set-range-stroke',
  'set-range-fontsize', 'set-range-font-increase', 'set-range-font-decrease', 'set-range-font-family',
  'set-range-text-color', 'reset-range-text-color', 'set-worksheet-col-width', 'set-col-auto-width', 'delta-column-width',
  'set-row-height', 'set-row-is-auto-height', 'delta-row-height', 'set-frozen', 'cancel-frozen', 'set-selection-frozen',
  'set-row-frozen', 'set-col-frozen', 'set-first-row-frozen', 'set-first-column-frozen',
  'set-zoom-ratio', 'set-zoom-ratio-from-toolbar', 'change-zoom-ratio',
  'select-range', 'select-all', 'move-selection', 'move-selection-enter-tab', 'expand-selection',
  'scroll-to-cell', 'scroll-view', 'scroll-view-reset', 'set-scroll-relative',
  'copy-down', 'copy-right', 'auto-fill', 'refill', 'paste-by-short-key', 'paste-value', 'paste-format', 'paste-col-width', 'paste-besides-border', 'optional-paste',
  'set-worksheet-activate', 'toggle-gridlines', 'set-gridlines-color',
];
const sheetCommands = new Set(commandNames.map(id => `sheet.command.${id}`));

/** Shared with the real runtime so installed UI commands are covered by the same deny gate. */
export function blockedSheetCommand(id: string, isCommand: boolean): boolean {
  return forbiddenSheetCommand(id) || (isCommand && id.startsWith('sheet.command.') && !sheetCommands.has(id));
}
