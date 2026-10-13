import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandType, LifecycleStages } from '@univerjs/core';
import { VALUE_MUTATION } from './runtime-model';

// Exercise the actual runtime's public readiness, image/projection waits and
// mutation guard callbacks. Only the Univer/DOM boundary is replaced; real
// plugin scheduling and first-screen editing remain browser acceptance checks.
const engine = vi.hoisted(() => ({
  stage: 0, stageOnCreate: null as number | null,
  callbacks: new Map<string, (event: any) => void>(),
  snapshot: null as null | { id: string },
  renderImages: vi.fn(), disposeImages: vi.fn(), disposeIo: vi.fn(), disposeUniver: vi.fn(),
  execute: vi.fn(), setRowCount: vi.fn(), select: vi.fn(), disposeSelection: vi.fn(),
}));
vi.mock('@univerjs/presets', () => ({
  LocaleType: { ZH_CN: 'zhCN' }, mergeLocales: () => ({}),
  createUniver: () => ({
    univer: { dispose: engine.disposeUniver },
    univerAPI: {
      Event: new Proxy({}, { get: (_target, key) => key }),
      addEvent: (name: string, callback: (event: any) => void) => { engine.callbacks.set(name, callback); return { dispose: () => engine.callbacks.delete(name) }; },
      getCurrentLifecycleStage: () => engine.stage,
      syncExecuteCommand: engine.execute,
      createWorkbook: (snapshot: { id: string }) => {
        engine.snapshot = snapshot;
        if (engine.stageOnCreate !== null) engine.stage = engine.stageOnCreate;
        return {
          getActiveSheet: () => ({ setRowCount: engine.setRowCount, getActiveCell: () => null, getRange: (...args: unknown[]) => args, setActiveRange: engine.select }),
          onSelectionChange: () => ({ dispose: engine.disposeSelection }),
          isCellEditing: () => false,
        };
      },
    },
  }),
}));
vi.mock('@univerjs/preset-sheets-core', () => ({ UniverSheetsCorePreset: () => ({}) }));
vi.mock('@univerjs/preset-sheets-core/locales/zh-CN', () => ({ default: {} }));
vi.mock('@univerjs/preset-sheets-drawing/locales/zh-CN', () => ({ default: {} }));
vi.mock('@univerjs/preset-sheets-core/lib/index.css', () => ({}));
vi.mock('@univerjs/preset-sheets-drawing/lib/index.css', () => ({}));
vi.mock('get-nonce', () => ({ setNonce: vi.fn() }));
vi.mock('./drawing-preset', () => ({ RecordImageIo: class { dispose = engine.disposeIo; }, createRecordDrawingPreset: () => ({}) }));
vi.mock('./runtime-images', () => ({ drawingCommands: new Set(), bindRuntimeImages: () => ({ render: engine.renderImages, dispose: engine.disposeImages }) }));

import { createBusinessSheet, type BusinessSheetRuntime } from './runtime';
const instances: BusinessSheetRuntime[] = [];
const ticks = async () => { for (let index = 0; index < 6; index++) await Promise.resolve(); };
const emit = (stage: LifecycleStages) => { engine.stage = stage; engine.callbacks.get('LifeCycleChanged')?.({ stage }); };
function setup() {
  const onChanges = vi.fn(), onError = vi.fn();
  const runtime = createBusinessSheet({
    container: { addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as HTMLElement,
    columns: [{ key: 'name', label: '名称', width: 150 }, { key: 'note', label: '备注', width: 200 }],
    rows: [{ id: 'record-a', values: ['同名颜色', '旧备注'], editable: [false, true] }],
    onChanges, onError, onSelection: vi.fn(),
  });
  instances.push(runtime); return { runtime, onChanges, onError };
}
beforeEach(() => {
  engine.stage = LifecycleStages.Starting; engine.stageOnCreate = null; engine.callbacks.clear(); engine.snapshot = null;
  vi.clearAllMocks(); engine.renderImages.mockResolvedValue(undefined); engine.execute.mockReturnValue(true);
  vi.stubGlobal('document', { querySelector: () => null });
});
afterEach(async () => { instances.splice(0).forEach(runtime => runtime.dispose()); await ticks(); vi.unstubAllGlobals(); });

describe('business sheet interaction readiness', () => {
  it('keeps work queued before Rendered, then releases images and row projection without waiting for Steady', async () => {
    const { runtime } = setup(); let ready = false; void runtime.ready.then(() => { ready = true; });
    const images = runtime.setImages([]);
    const projection = runtime.replaceRows([{ id: 'record-b', values: ['另一条颜色', '乙备注'], editable: [false, true] }]);
    emit(LifecycleStages.Ready); await ticks();
    expect(ready).toBe(false); expect(engine.renderImages).not.toHaveBeenCalled(); expect(engine.execute).not.toHaveBeenCalled();
    emit(LifecycleStages.Rendered); await ticks();
    expect(ready).toBe(true); expect(engine.stage).toBe(LifecycleStages.Rendered);
    await images; await projection;
    expect(engine.renderImages).toHaveBeenCalledWith([]); expect(engine.setRowCount).toHaveBeenCalled();
    runtime.selectCell('record-a', 'note'); expect(engine.select).not.toHaveBeenCalled();
    runtime.selectCell('record-b', 'note'); expect(engine.select).toHaveBeenCalledWith([1, 1, 1, 1]);
  });
  it.each([LifecycleStages.Rendered, LifecycleStages.Steady])('handles a workbook already at lifecycle %s when created', async stage => {
    engine.stageOnCreate = stage;
    const { runtime } = setup(); let ready = false; void runtime.ready.then(() => { ready = true; });
    await ticks(); expect(ready).toBe(true); expect(engine.stage).toBe(stage);
  });
  it('has readonly, formula and stable-ID mutation guards active as soon as Rendered is released', async () => {
    const { runtime, onChanges, onError } = setup(); emit(LifecycleStages.Rendered); await ticks();
    let ready = false; void runtime.ready.then(() => { ready = true; }); await ticks(); expect(ready).toBe(true);
    const mutation = (cellValue: unknown) => {
      const event = { id: VALUE_MUTATION, type: CommandType.MUTATION, params: { unitId: engine.snapshot!.id, subUnitId: 'business-records', cellValue }, cancel: false };
      engine.callbacks.get('BeforeCommandExecute')!(event);
      if (!event.cancel) engine.callbacks.get('CommandExecuted')!(event);
      return event.cancel;
    };
    expect(mutation({ 1: { 0: { v: '不允许修改名称' } } })).toBe(true);
    expect(mutation({ 1: { 1: { f: '=1+1', v: '2' } } })).toBe(true);
    expect(onChanges).not.toHaveBeenCalled(); expect(onError).toHaveBeenCalledTimes(2);
    expect(mutation({ 1: { 1: { v: '可立即填写中文' } } })).toBe(false);
    expect(onChanges).toHaveBeenCalledExactlyOnceWith([{ id: 'record-a', field: 'note', value: '可立即填写中文' }]);
  });
  it('settles pending readiness on early disposal without rendering queued images or applying queued rows', async () => {
    const { runtime } = setup(); let ready = false; void runtime.ready.then(() => { ready = true; });
    const images = runtime.setImages([]), projection = runtime.replaceRows([{ id: 'late-record', values: ['晚到', null], editable: [false, true] }]);
    runtime.dispose(); runtime.dispose(); await ticks(); await images; await projection;
    expect(ready).toBe(true); expect(engine.renderImages).not.toHaveBeenCalled(); expect(engine.execute).not.toHaveBeenCalled();
    expect(engine.disposeImages).toHaveBeenCalledOnce(); expect(engine.disposeIo).toHaveBeenCalledOnce(); expect(engine.disposeUniver).toHaveBeenCalledOnce(); expect(engine.callbacks.size).toBe(0);
  });
});
