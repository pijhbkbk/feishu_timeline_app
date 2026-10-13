import { describe, expect, it } from 'vitest';
import type { BatchResult, Fact, Measurement, Reading, Snapshot } from './client';
import { acknowledge, buildRows, columns, createReadingNormalizer, measurementDependency, updateItems, validate, type RowMeta } from './model';
import { RecordSheetModel, type RecordSaveBatch } from '../business-sheet/record-sheet-model';
import { BusinessSheetModel } from '../business-sheet/runtime-model';
import { RecordSheetSaveQueue } from '../business-sheet/record-sheet-save-queue';
import type { RecordSheetChange, RecordSheetRow } from '../business-sheet/record-sheet-types';

function fixture(groups = 2, perGroup = 3): Snapshot {
  return {
    activity: { id: 'activity', activityDate: '2026-10-13T00:00:00Z', productionBaseId: 'base', productionBase: { id: 'base', name: '合成测试基地' }, batchLabel: null, note: null, revision: 1, projectId: null, recurringTaskId: null, reviewRecordId: null, reviewRecord: null },
    occurrences: [{ id: 'occurrence', revision: 1, activityId: 'activity', objectId: 'object', colorId: 'color', overallConclusion: 'PENDING', visualConclusion: null, handlingOpinion: null, note: null, originalSource: null, object: { id: 'object', objectCode: '合成测试对象', objectKind: 'VEHICLE', vin: null, vehicleModel: '轻卡', vehicleClass: null, revision: 1, sampleId: null }, color: { id: 'color', name: '测试颜色', code: 'TEST', productionBaseId: 'base' }, _count: { measurements: groups, defects: 0 } }],
    measurements: Array.from({ length: groups }, (_, index): Measurement => ({ id: `group-${index}`, revision: 1, occurrenceId: 'occurrence', pointLabel: `测点${index}`, groupLabel: `组${index}`, instrumentLabel: '原仪器', methodLabel: '原方法', standardVersionId: 'standard', originalCriteria: '保留原依据', conclusion: 'PENDING' })),
    readings: Array.from({ length: groups }, (_, index) => Array.from({ length: perGroup }, (_, angle): Reading => ({ id: `reading-${index}-${angle}`, revision: 1, measurementId: `group-${index}`, angleLabel: `${angle}°`, lValue: null, aValue: null, bValue: null, deltaE: null, note: null }))).flat(), defects: [],
  };
}
function setup(snapshot = fixture()) {
  const rows = buildRows(snapshot, 'reading'), model = new RecordSheetModel(rows, validate), normalize = createReadingNormalizer(snapshot);
  return { snapshot, rows, model, edit: (changes: RecordSheetChange[]) => model.apply(normalize(changes, model.rows)) };
}
/** Pure server-result fixture for model tests only. No request or database write. */
function confirm(s: ReturnType<typeof setup>, batch: RecordSaveBatch) {
  const items = updateItems(buildRows(s.snapshot, 'reading'), batch.items);
  const result: BatchResult = { activityId: 'activity', revision: s.snapshot.activity.revision + 1, items: items.map(item => {
    const originals = item.entity === 'measurement' ? s.snapshot.measurements : s.snapshot.readings;
    const original = originals.find(row => row.id === item.id)!;
    expect(item.expectedRevision).toBe(original.revision);
    return { ...original, ...item.values, revision: original.revision + 1, entity: item.entity } as Fact & { entity: typeof item.entity };
  }) };
  acknowledge(s.snapshot, result);
  const saved = new Set(batch.items.map(item => item.id)), changedGroups = new Set(items.filter(item => item.entity === 'measurement').map(item => item.id));
  const rows = buildRows(s.snapshot, 'reading');
  const submitted = rows.filter(row => saved.has(row.id));
  const relatedRows = rows.filter(row => !saved.has(row.id) && changedGroups.has(row.meta!.measurementId!));
  s.model.confirm(submitted, batch, relatedRows); return { items, submitted, relatedRows };
}
function tenCells(row: RecordSheetRow<RowMeta>, marker: string): RecordSheetChange[] {
  const group = row.meta!.measurementId!;
  const values = [group + marker, group + '-组' + marker, '新仪器' + marker, '新方法' + marker, row.id + '°', '50', '0', '-2', '0', '读数' + marker];
  return columns.reading.slice(0, 10).map((column, index) => ({ id: row.id, field: column.key, value: values[index]! }));
}
describe('compound reading 10-column business view', () => {
  it('supports actual 1000×27 business rows and atomically applies a 100×10 rectangle by stable ID', () => {
    const s = setup(fixture(100, 10));
    expect(s.rows).toHaveLength(1000); expect(columns.reading).toHaveLength(27);
    expect(columns.reading.slice(0, 10).every(column => s.rows[0]!.editable.includes(column.key))).toBe(true);
    const selected = s.rows.slice(0, 100).reverse();
    s.edit(selected.flatMap(row => tenCells(row, '-批1')));
    expect(s.model.dirtyCount).toBe(100); expect(s.model.errors()).toEqual([]);
    for (const row of selected) expect(s.model.value(row.id, 'note')).toBe('读数-批1');
    expect(s.model.value(s.rows[100]!.id, 'note')).toBeNull();
    const first = confirm(s, s.model.beginBatch(50, 'batch-1')!); expect(first.items.filter(item => item.entity === 'reading')).toHaveLength(50);
    expect(first.items.filter(item => item.entity === 'measurement')).toHaveLength(5); expect(s.model.dirtyCount).toBe(50);
    confirm(s, s.model.beginBatch(50, 'batch-2')!); expect(s.model.dirtyCount).toBe(0);
    expect(s.snapshot.readings.filter(row => row.note === '读数-批1')).toHaveLength(100);
    expect(s.snapshot.measurements.every(row => row.standardVersionId === 'standard' && row.originalCriteria === '保留原依据' && row.conclusion === 'PENDING')).toBe(true);
  });
  it('rejects inconsistent duplicate parent values before any cell is changed', () => {
    const s = setup(); const before = s.rows.map(row => s.model.display(row.id));
    expect(() => s.edit([{ id: 'reading-0-0', field: 'note', value: '也不能部分写入' }, { id: 'reading-0-0', field: 'methodLabel', value: '方法甲' }, { id: 'reading-0-1', field: 'methodLabel', value: '方法乙' }])).toThrow(/整次粘贴未应用/);
    expect(s.rows.map(row => s.model.display(row.id))).toEqual(before); expect(s.model.dirtyCount).toBe(0); expect(s.model.undoStack).toHaveLength(0);
  });
  it('includes unchanged editable clipboard cells in preflight so old/new values cannot evade group consistency', () => {
    const s = setup(); const native = new BusinessSheetModel(s.rows.map(row => ({ id: row.id, values: columns.reading.map(column => row.values[column.key] ?? null), editable: columns.reading.map(column => row.editable.includes(column.key)) })), columns.reading);
    const matrix = { 1: { 3: { v: '原方法' } }, 2: { 3: { v: '不同方法' } } };
    expect(native.validate(matrix).changes).toHaveLength(1);
    const complete = native.validate(matrix, true); expect(complete.changes).toHaveLength(2);
    expect(() => createReadingNormalizer(s.snapshot)(complete.changes, s.model.rows)).toThrow(/整次粘贴未应用/);
    expect(native.value(1, 3)).toBe('原方法'); expect(native.value(2, 3)).toBe('原方法'); expect(s.model.dirtyCount).toBe(0);
  });
  it('propagates only the real shared parent across hidden siblings; undo/redo preserves independent readings', () => {
    const s = setup(); s.edit([{ id: 'reading-0-0', field: 'methodLabel', value: '组方法' }, { id: 'reading-0-0', field: 'lValue', value: '0' }]);
    expect(s.model.value('reading-0-2', 'methodLabel')).toBe('组方法'); expect(s.model.value('reading-1-0', 'methodLabel')).toBe('原方法'); expect(s.model.value('reading-0-1', 'lValue')).toBeNull();
    s.model.undo(); expect(s.model.dirtyCount).toBe(0); s.model.redo(); expect(s.model.dirtyCount).toBe(3);
    const result = confirm(s, s.model.beginBatch(1, 'shared-save')!);
    expect(result.items.map(item => item.entity)).toEqual(['measurement', 'reading']); expect(result.relatedRows).toHaveLength(2); expect(s.model.dirtyCount).toBe(0);
    expect(s.model.rows.get('reading-0-1')!.revision).toBe(1); expect(s.model.rows.get('reading-0-1')!.dependencies).toEqual({ 'measurement:group-0': 2 });
    s.model.undo(); expect(s.model.value('reading-0-2', 'methodLabel')).toBe('原方法'); expect(s.model.dirtyCount).toBe(3);
  });
  it('preserves in-flight child and parent edits, then submits both actual revision tokens', () => {
    const s = setup(); s.edit([{ id: 'reading-0-0', field: 'methodLabel', value: '方法1' }, { id: 'reading-0-0', field: 'note', value: '说明1' }]);
    const batch = s.model.beginBatch(1, 'flying')!;
    s.edit([{ id: 'reading-0-1', field: 'methodLabel', value: '方法2' }, { id: 'reading-0-0', field: 'note', value: '说明2' }]);
    confirm(s, batch);
    expect(s.model.value('reading-0-0', 'note')).toBe('说明2'); expect(s.model.value('reading-0-0', 'methodLabel')).toBe('方法2'); expect(s.model.value('reading-0-2', 'methodLabel')).toBe('方法2'); expect(s.model.conflicts()).toEqual([]);
    const next = s.model.beginBatch(50, 'next')!; const items = updateItems(buildRows(s.snapshot, 'reading'), next.items);
    expect(items.find(item => item.entity === 'measurement')).toMatchObject({ id: 'group-0', expectedRevision: 2, values: { methodLabel: '方法2' } });
    expect(items.find(item => item.id === 'reading-0-0')).toMatchObject({ expectedRevision: 2, values: { note: '说明2' } });
    confirm(s, next); expect(s.model.dirtyCount).toBe(0);
  });
  it('detects an external parent-only revision change even when the child revision is unchanged', () => {
    const s = setup(); s.edit([{ id: 'reading-0-0', field: 'methodLabel', value: '本地' }]);
    s.snapshot.measurements[0] = { ...s.snapshot.measurements[0]!, revision: 2, methodLabel: '他人' };
    s.model.latest(buildRows(s.snapshot, 'reading'));
    expect(s.model.conflicts()).toHaveLength(3); expect(() => s.model.beginBatch()).toThrow(/冲突/);
    expect(s.model.patches()[0]!.expectedDependencies).toEqual({ [measurementDependency('group-0')]: 1 });
    for (const row of s.model.conflicts()) s.model.resolve(row.id, true);
    expect(s.model.patches()[0]!.expectedDependencies).toEqual({ [measurementDependency('group-0')]: 2 });
    expect(updateItems(buildRows(s.snapshot, 'reading'), [...s.model.patches()])[0]).toMatchObject({ entity: 'measurement', expectedRevision: 2, values: { methodLabel: '本地' } });
  });
  it('rejects parent disagreement again at request construction and never edits relationship/status/standard fields', () => {
    const s = setup(); const dependencies = { 'measurement:group-0': 1 };
    expect(() => updateItems(s.rows, [{ id: 'reading-0-0', expectedRevision: 1, expectedDependencies: dependencies, changes: { methodLabel: '甲' } }, { id: 'reading-0-1', expectedRevision: 1, expectedDependencies: dependencies, changes: { methodLabel: '乙' } }])).toThrow(/不同父字段/);
    for (const field of ['overallConclusion', 'standardVersionId', 'measurementId', 'colorName']) expect(() => s.edit([{ id: 'reading-0-0', field, value: '越界' }])).toThrow();
    s.snapshot.activity.reviewRecord = { id: 'review', submittedAt: '2026-10-13T00:00:00Z', result: 'DRAFT' };
    const locked = buildRows(s.snapshot, 'reading'); expect(locked.every(row => !row.editable.length)).toBe(true);
    expect(() => createReadingNormalizer(s.snapshot)([{ id: locked[0]!.id, field: 'methodLabel', value: '越权' }], new Map(locked.map(row => [row.id, row])))).toThrow(/只读/);
  });
  it('validates related acknowledgement before changing submitted drafts, and prevents parent rollback on refresh', () => {
    const s = setup(); s.edit([{ id: 'reading-0-0', field: 'methodLabel', value: '本地' }]); const batch = s.model.beginBatch(1)!;
    const incoming = s.rows.map(row => ({ ...row, values: { ...row.values, methodLabel: '本地' }, dependencies: { 'measurement:group-0': 2 } }));
    expect(() => s.model.confirm([incoming[0]!], batch, [{ ...incoming[1]!, revision: 2 }])).toThrow(/关联保存/); expect(s.model.dirtyCount).toBe(3);
    confirm(s, batch); const old = buildRows(s.snapshot, 'reading').map(row => row.meta!.measurementId === 'group-0' ? { ...row, dependencies: { 'measurement:group-0': 1 } } : row);
    expect(() => s.model.latest(old)).toThrow(/版本倒退/);
  });
  it('retains the legacy six-field import contract without requiring parent edits', () => {
    const s = setup(); const items = updateItems(s.rows, [{ id: 'reading-0-0', expectedRevision: 1, changes: { lValue: '0', aValue: null } }]);
    expect(items).toHaveLength(1); expect(items[0]).toMatchObject({ entity: 'reading', values: { lValue: '0', aValue: null } });
  });
  it('uses the common 50-row save queue and confirms related rows without a second saver', async () => {
    const s = setup(); s.edit([{ id: 'reading-0-0', field: 'instrumentLabel', value: '新仪器' }]);
    let calls = 0;
    const queue = new RecordSheetSaveQueue(s.model, { batchSize: 1, onState: () => undefined, save: async items => {
      calls++; const request = updateItems(buildRows(s.snapshot, 'reading'), items); expect(request).toHaveLength(1);
      const group = s.snapshot.measurements[0]!; acknowledge(s.snapshot, { activityId: 'activity', revision: 2, items: [{ ...group, instrumentLabel: '新仪器', revision: 2, entity: 'measurement' }] });
      const rows = buildRows(s.snapshot, 'reading'); return { rows: rows.filter(row => row.id === items[0]!.id), relatedRows: rows.filter(row => row.id !== items[0]!.id && row.meta?.measurementId === group.id) };
    } });
    await queue.flush(); expect(calls).toBe(1); expect(s.model.dirtyCount).toBe(0); expect(queue.state.status).toBe('saved'); queue.dispose();
  });
  it('preserves undo-to-baseline across unsubmitted and hidden siblings while the first parent save is in flight', () => {
    const s = setup();
    s.edit([{ id: 'reading-0-0', field: 'methodLabel', value: '新方法' }]);
    const batch = s.model.beginBatch(1, 'parent-in-flight')!;
    s.model.undo();
    confirm(s, batch);
    for (const id of ['reading-0-0', 'reading-0-1', 'reading-0-2']) {
      expect(s.model.value(id, 'methodLabel')).toBe('原方法');
      expect(s.model.patches().find(patch => patch.id === id)?.changes.methodLabel).toBe('原方法');
    }
    expect(s.model.conflicts()).toEqual([]);
    confirm(s, s.model.beginBatch(1, 'confirm-undo')!);
    expect(s.model.dirtyCount).toBe(0);
    expect(s.snapshot.measurements[0]!.methodLabel).toBe('原方法');
  });

});
