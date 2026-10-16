import { describe, expect, it } from 'vitest';
import { CommandType } from '@univerjs/core';
import {
  DeltaColumnWidthCommand, DeltaRowHeightCommand, SetColWidthCommand, SetRowHeightCommand,
  SetFrozenCommand, CancelFrozenCommand, InsertRowCommand, RemoveRowCommand, MoveRangeCommand,
  AddWorksheetMergeCommand, SetWorksheetColWidthMutation, SetWorksheetRowHeightMutation,
  SetWorksheetRowIsAutoHeightMutation, SetWorksheetRowAutoHeightMutation, SetFrozenMutation,
  InsertRowMutation, MoveRangeMutation,
} from '@univerjs/sheets';
import { blockedSheetCommand } from './runtime-command-policy';
import { allowedSheetMutation, BusinessSheetModel } from './runtime-model';

// Use command objects from the locked engine: dragging uses delta commands,
// while the existing dimension dialogs use absolute setters.
describe('installed Univer layout commands at the business sheet gate', () => {
  it.each([DeltaColumnWidthCommand, DeltaRowHeightCommand, SetColWidthCommand, SetRowHeightCommand,
    SetFrozenCommand, CancelFrozenCommand])('permits the actual engine command $id', command => {
    expect(command.type).toBe(CommandType.COMMAND);
    expect(blockedSheetCommand(command.id, command.type === CommandType.COMMAND)).toBe(false);
  });
  it('permits only their layout mutations without changing business identity or opening readonly cells', () => {
    for (const mutation of [SetWorksheetColWidthMutation, SetWorksheetRowHeightMutation,
      SetWorksheetRowIsAutoHeightMutation, SetWorksheetRowAutoHeightMutation, SetFrozenMutation]) {
      expect(allowedSheetMutation(mutation.id)).toBe(true);
    }
    const model = new BusinessSheetModel([
      { id: 'stable-person', values: ['同名人员', '000123'], editable: [false, true] },
    ], [{ key: 'name', label: '姓名', width: 150 }, { key: 'phone', label: '电话', width: 160 }]);
    expect(model.identity(1, 0)).toEqual({ id: 'stable-person', field: 'name' });
    expect(model.validate({ 1: { 0: { v: '不允许改名' } } }).error).toContain('只读');
    expect(model.value(1, 0)).toBe('同名人员');
    expect(model.validate({ 1: { 1: { f: '=1+1', v: '2' } } }).error).toBeTruthy();
  });
  it.each([InsertRowCommand, RemoveRowCommand, MoveRangeCommand, AddWorksheetMergeCommand])('keeps structural command $id denied', command => {
    expect(blockedSheetCommand(command.id, command.type === CommandType.COMMAND)).toBe(true);
  });
  it('keeps unknown commands and structural mutations denied', () => {
    expect(blockedSheetCommand('sheet.command.new-unreviewed-operation', true)).toBe(true);
    expect(blockedSheetCommand('sheet.operation.rename-sheet', false)).toBe(true);
    expect(allowedSheetMutation(InsertRowMutation.id)).toBe(false);
    expect(allowedSheetMutation(MoveRangeMutation.id)).toBe(false);
  });
});
