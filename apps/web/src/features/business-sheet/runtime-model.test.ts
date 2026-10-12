import { describe, expect, it } from 'vitest';
import { BusinessSheetModel, allowedSheetMutation, forbiddenSheetCommand } from './runtime-model';

const columns = [{ key: 'name', label: '颜色名称', width: 160 }, { key: 'note', label: '备注', width: 220 }];
const rows = [
  { id: 'color-b', values: ['重名颜色', '乙'], editable: [false, true] },
  { id: 'color-a', values: ['重名颜色', null], editable: [false, true] },
];
describe('business sheet identity and mutation boundary', () => {
  it('uses stable identity after an externally sorted row rebuild', () => {
    const before = new BusinessSheetModel(rows, columns); const after = new BusinessSheetModel([...rows].reverse(), columns);
    expect(before.identity(1, 1)).toEqual({ id: 'color-b', field: 'note' });
    expect(after.position('color-b', 'note')).toEqual({ row: 2, col: 1 });
    expect(after.validate({ 2: { 1: { v: '按身份保存' } } }).changes).toEqual([{ id: 'color-b', field: 'note', value: '按身份保存' }]);
  });
  it('rejects a mixed writable/readonly paste atomically without changing the model', () => {
    const model = new BusinessSheetModel(rows, columns);
    const result = model.validate({ 1: { 1: { v: '合法' } }, 2: { 0: { v: '越权修改名称' } } });
    expect(result.error).toContain('只读'); expect(result.changes).toEqual([]); expect(model.value(1, 1)).toBe('乙');
  });
  it.each([
    { 0: { 0: { v: '假表头' } } }, { 3: { 1: { v: '超范围' } } }, { 1: { 2: { v: '新列' } } },
    { 1: { 1: { f: '=1+1', v: '2' } } }, { 1: { 1: { v: '  =SUM(A1)' } } },
    { 1: { 1: { si: 'formula-id' } } }, { 1: { 1: { p: { body: { dataStream: '=1+1\r\n' } } } } },
    { 1: { 1: { p: null } } }, { 1: { 1: { v: 'x', arbitraryEmbeddedObject: true } } },
    { 1: { 1: { p: { body: { dataStream: 'link\r\n', customRanges: [{ url: 'https://example.invalid' }] } } } } },
    null,
  ])('denies unsafe value mutations from all entry paths: %j', patch => {
    const model = new BusinessSheetModel(rows, columns); expect(model.validate(patch).error).toBeTruthy(); expect(model.value(1, 1)).toBe('乙');
  });
  it('permits formatting without emitting business writes, and text preserves zero/multiline', () => {
    const model = new BusinessSheetModel(rows, columns);
    expect(model.validate({ 1: { 0: { s: { bl: 1 } } } })).toEqual({ changes: [], error: null });
    const result = model.validate({ 1: { 1: { v: 0 } }, 2: { 1: { p: { body: { dataStream: '甲\n乙\r\n' } } } } });
    expect(result.error).toBeNull(); model.apply(result.changes);
    expect(model.value(1, 1)).toBe('0'); expect(model.value(2, 1)).toBe('甲\n乙');
    expect(model.validate({ 1: { 1: null } }).changes[0]?.value).toBeNull();
    expect(model.validate({ 1: { 1: { v:null, p:null, f:null, si:null, custom:null } } }).changes[0]?.value).toBeNull();
    expect(model.validate({ 1: { 1: { v:'值', custom:{ recordId:'forged' } } } }).error).toBeTruthy();
  });
  it('rejects structural mutations and commands including sort/move/insert/merge', () => {
    for (const action of ['insert-row', 'move-range', 'reorder-range', 'set-worksheet-row-count', 'add-worksheet-merge']) expect(allowedSheetMutation(`sheet.mutation.${action}`)).toBe(false);
    for (const action of ['sort-range', 'insert-row', 'move-range', 'add-worksheet-merge']) expect(forbiddenSheetCommand(`sheet.command.${action}`)).toBe(true);
    expect(allowedSheetMutation('sheet.mutation.set-range-values')).toBe(true);
    expect(allowedSheetMutation('sheet.mutation.set-worksheet-col-width')).toBe(true);
  });
  it('rejects ambiguous row/field identity instead of writing to a matching name', () => {
    expect(() => new BusinessSheetModel([rows[0]!, rows[0]!], columns)).toThrow('身份');
    expect(() => new BusinessSheetModel(rows, [columns[0]!, columns[0]!])).toThrow('唯一');
  });
});
