import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleType, type ICellData } from '@univerjs/core';
import { ApiRequestError, apiRequest } from '../../lib/auth-client';
import type { PersonRecord } from '../person-sheet/person-adapter';
import type { RegisterRow } from '../color-register/client';
import type { Snapshot } from '../inspections/client';
import { prepareBusinessMapping, type BusinessMappingDefinition, type BusinessMappingSource, type BusinessMappingTarget } from './business-mapping';
import { mappingColumns, type MappingContext } from './mapping-context';
import { BusinessApplySession, BusinessApplyFailure, retryBusinessApplyCheckpoint, assertPreparedBusinessSource, prepareMappedBusiness, sendBusinessApplyRequest, type BusinessApplyRequest } from './business-apply';
import { validateBusinessApplyCheckpoint, BUSINESS_JOURNAL_LIMITS, type BusinessApplyCheckpoint } from './business-apply-journal';
vi.mock('../../lib/auth-client', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/auth-client')>(), apiRequest: vi.fn() }));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const person = (): PersonRecord => ({ id: 'person-old', revision: 2, name: '同名人员', departmentId: null, department: null, position: null, mobile: null, email: null, note: '原备注', isActive: true, editableFields: ['name', 'departmentId', 'position', 'mobile', 'email', 'note', 'isActive'], account: null, originalSource: null });
function people(items = [person()]): MappingContext { return { kind: 'person', directory: { items, departments: [{ id: 'department', name: '合成部门' }], hasMore: false } }; }
const color = (): RegisterRow => ({ id: 'color', revision: 4, name: '合成松柏绿', colorId: null, formalCode: 'TEST', base: { id: 'base', name: '合成基地' }, manufacturer: '合成厂家', paintType: '合成漆', boardCode: '001', registerMonth: '2026-10', registerStatus: 'LISTED', productionApprovalStatus: 'PENDING', note: '原备注', currentStandardVersionId: null, sourceSummary: null });
function catalog(): MappingContext { return { kind: 'color', catalog: { items: [color()], page: 1, pageSize: 50, total: 1, totalPages: 1, facets: { bases: [{ id: 'base', name: '合成基地' }], statuses: ['LISTED'] } } }; }
function inspections(): Extract<MappingContext, { kind: 'inspection' }> {
  const object = { id: 'vehicle', objectCode: '合成车', objectKind: 'VEHICLE' as const, vin: null, vehicleModel: null, vehicleClass: null, revision: 1, sampleId: null };
  const snapshot: Snapshot = { activity: { id: 'activity', revision: 7, activityDate: '2026-10-20', productionBaseId: 'base', productionBase: { id: 'base', name: '合成基地' }, batchLabel: null, note: null, projectId: 'project', recurringTaskId: null, reviewRecordId: null, reviewRecord: null },
    occurrences: [{ id: 'occ', revision: 2, activityId: 'activity', objectId: 'vehicle', colorId: 'color', overallConclusion: 'PENDING', visualConclusion: null, handlingOpinion: null, note: null, originalSource: null, object, color: { id: 'color', name: '合成松柏绿', code: 'TEST', productionBaseId: 'base' }, _count: { measurements: 1, defects: 0 } }],
    measurements: [{ id: 'measure', revision: 3, occurrenceId: 'occ', pointLabel: '左门', groupLabel: '第1组', standardVersionId: null, instrumentLabel: null, methodLabel: null, originalCriteria: null, conclusion: 'PENDING' }], readings: [], defects: [] };
  return { kind: 'inspection', snapshot, bindings: { objects: [object, { ...object, id: 'vehicle-new', objectCode: '合成新车' }], colors: [{ id: 'color', name: '合成松柏绿', formalCode: 'TEST', boardCode: '001' }], standards: [], objectId: 'vehicle-new', colorId: 'color', occurrenceId: 'occ', measurementId: 'measure', standardVersionId: '' } };
}
function inspectionTarget(layer: 'occurrence' | 'measurement' | 'reading' | 'defect'): BusinessMappingTarget { return { kind: 'inspection', activityId: 'activity', layer, objectId: 'vehicle-new', colorId: 'color', occurrenceId: 'occ', measurementId: 'measure', standardVersionId: null }; }
async function setup(target: BusinessMappingTarget, values: Array<Record<string, string | number | null>>, context: MappingContext, reason = '', clearFields: string[] = []) {
  const keys = [...new Set(values.flatMap(row => Object.keys(row)))]; const cells: Record<number, Record<number, ICellData>> = { 0: Object.fromEntries(keys.map((key, index) => [index, { v: key }])) };
  values.forEach((row, index) => { cells[index + 1] = Object.fromEntries(keys.map((key, column) => [column, { v: row[key] ?? null }])); });
  const id = '572766eb-ecb3-49c4-9d34-9242236d976a';
  const source: BusinessMappingSource = { workbookId: id, formalRevision: 3, sourceSnapshotHash: 'a'.repeat(64), snapshot: { id, name: '合成映射', appVersion: '1.0.4', locale: LocaleType.ZH_CN, styles: {}, sheetOrder: ['data'], sheets: { data: { id: 'data', name: '业务值', rowCount: 3000, columnCount: 100, cellData: cells } } } };
  const definition: BusinessMappingDefinition = { target, sheetId: 'data', headerRow: 0, range: { startRow: 1, endRow: values.length, startColumn: 0, endColumn: keys.length - 1 }, fields: keys.map((field, column) => ({ field, column })), clearFields };
  const mapping = await prepareBusinessMapping(source, definition, mappingColumns(target));
  return { source, definition, mapping, preview: prepareMappedBusiness(mapping, context, reason) };
}
function ack(request: BusinessApplyRequest) {
  return { items: request.plans.map(plan => ({ id: plan.input.id ?? `created_${plan.input.row}`, clientId: plan.status === 'create' ? plan.input.clientId : undefined, revision: plan.status === 'create' ? 1 : plan.input.revision! + 1 })) };
}
beforeEach(() => { vi.clearAllMocks(); });
describe('four real domain mappings', () => {
  it('never promotes provenance or same-name people to update identity; creates independent profiles', async () => {
    const context = people(); const input = await setup({ kind: 'person' }, [{ name: '同名人员', departmentName: '合成部门' }], context);
    if (context.kind === 'person') context.directory.items[0]!.originalSource = { ...input.mapping.rows[0]!.input.source, fileHash: input.mapping.binding.fullJSONHash };
    const preview = prepareMappedBusiness(input.mapping, context); expect(preview.plans[0]).toMatchObject({ status: 'create', data: { name: '同名人员', departmentId: 'department' } });
    const session = new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} }), send = vi.fn(async (request: BusinessApplyRequest) => ack(request));
    await session.applyNext(input.source, context, send); expect(send.mock.calls[0]![0]).toMatchObject({ path: '/persons', method: 'POST' });
    expect(JSON.parse(send.mock.calls[0]![0].bodyJSON).items[0]).not.toHaveProperty('id'); expect(session.receipts[0]?.id).toBe('created_2');
  });
  it('keeps unknown IDs, readonly qualifications, numeric board codes and unbound photos as errors', async () => {
    for (const row of [{ __id: 'outside', __revision: 1, name: '甲' }, { name: '甲', roles: '管理员' }, { name: '甲', photos: 'photo-id' }]) {
      const { preview } = await setup({ kind: 'person' }, [row], people()); expect(preview.plans[0]?.status).toBe('error'); expect(() => new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} })).toThrow();
    }
    const { preview } = await setup({ kind: 'color' }, [{ __id: 'color', __revision: 4, boardCode: 123 }], catalog(), '真实更正'); expect(preview.plans[0]?.message).toContain('必须是文本');
  });
  it('requires color stable ID and standard-change reason, then emits the unchanged catalog CAS command', async () => {
    const missing = await setup({ kind: 'color' }, [{ name: '合成松柏绿', note: '新备注' }], catalog()); expect(missing.preview.plans[0]?.message).toContain('正式新建颜色项目');
    const noReason = await setup({ kind: 'color' }, [{ __id: 'color', __revision: 4, boardCode: '0002' }], catalog()); expect(noReason.preview.plans[0]?.status).toBe('error');
    const { source, preview } = await setup({ kind: 'color' }, [{ __id: 'color', __revision: 4, boardCode: '0002' }], catalog(), '来源编号更正');
    const session = new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} }), send = vi.fn(async (request: BusinessApplyRequest) => ack(request)); await session.applyNext(source, catalog(), send);
    expect(JSON.parse(send.mock.calls[0]![0].bodyJSON)).toMatchObject({ reason: '来源编号更正', items: [{ id: 'color', expectedRevision: 4, changes: { boardCode: '0002' } }] }); expect(send.mock.calls[0]![0].path).toBe('/color-register/sheet');
  });
  it('keeps blank unchanged versus explicit clearing', async () => {
    const row = { __id: 'person-old', __revision: 2, note: null };
    expect((await setup({ kind: 'person' }, [row], people())).preview.plans[0]?.status).toBe('unchanged');
    expect((await setup({ kind: 'person' }, [row], people(), '', ['note'])).preview.plans[0]).toMatchObject({ status: 'update', data: { note: null } });
  });
  it('requires explicit production grain and scope, preserves zero, and rejects duplicate month totals before batching', async () => {
    const target: BusinessMappingTarget = { kind: 'production', baseId: 'base', colorId: 'color' };
    const context: MappingContext = { kind: 'production', production: { facts: new Map(), colors: [color()], chosenBaseId: 'base', chosenColorId: 'color' } };
    const valid = { month: '2026-10', quantity: 0, rowKind: 'MONTH_TOTAL' };
    const { preview, source } = await setup(target, [valid], context); expect(preview.plans[0]).toMatchObject({ status: 'create', data: { quantity: 0, colorId: 'color', baseId: 'base' } });
    const send = vi.fn(async (request: BusinessApplyRequest) => ack(request)); await new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} }).applyNext(source, context, send); expect(send.mock.calls[0]![0].path).toBe('/production-facts/batch');
    for (const rows of [[{ month: '2026-10', quantity: 20 }], [{ ...valid, colorId: 'other' }], [valid, valid]]) expect((await setup(target, rows, context)).preview.plans.every(plan => plan.status === 'error')).toBe(true);
  });
  it('uses all four existing inspection layers and preserves activity/child revisions', async () => {
    const context = inspections();
    const cases = [{ layer: 'occurrence' as const, row: { visualConclusion: '合成目视记录' } }, { layer: 'measurement' as const, row: { pointLabel: '右门', groupLabel: '第2组' } }, { layer: 'reading' as const, row: { angleLabel: '15°', lValue: 0 } }, { layer: 'defect' as const, row: { description: '合成漆面颗粒' } }];
    for (const { layer, row } of cases) {
      const { source, preview } = await setup(inspectionTarget(layer), [row], context); expect(preview.plans[0]?.status).toBe('create');
      const send = vi.fn(async (request: BusinessApplyRequest) => ({ ...ack(request), activityId: 'activity', revision: 8, items: ack(request).items.map(item => ({ ...item, entity: layer })) }));
      await new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} }).applyNext(source, context, send); expect(JSON.parse(send.mock.calls[0]![0].bodyJSON).expectedRevision).toBe(7);
      expect(send.mock.calls[0]![0].path).toBe('/inspections/activities/activity/batch');
    }
  });
  it('does not silently drop people/VIN or unknown defect links, and submitted review rejects mapping', async () => {
    const context = inspections();
    for (const row of [{ people: '新参与人' }, { vin: '猜测VIN' }]) expect((await setup(inspectionTarget('occurrence'), [row], context)).preview.plans[0]?.status).toBe('error');
    expect((await setup(inspectionTarget('defect'), [{ description: '合成缺陷', measurementId: 'outside' }], context)).preview.plans[0]?.status).toBe('error');
    context.snapshot.activity.reviewRecord = { id: 'review', submittedAt: '2026-10-20', result: 'PASS' };
    expect((await setup(inspectionTarget('occurrence'), [{ __id: 'occ', __revision: 2, note: '更改' }], context)).preview.plans[0]?.status).toBe('error');
  });
});
describe('durable business command recovery contract', () => {
  it('persists prepared and awaiting receipt before network, then stores receipts atomically', async () => {
    const context = people(), { preview, source } = await setup({ kind: 'person' }, [{ name: '合成人员' }], context), phases: string[] = [];
    const session = new BusinessApplySession(preview, { actorId: 'actor', persist: async value => { phases.push(value.phase); expect(validateBusinessApplyCheckpoint(value, 'actor', source.workbookId)).toEqual(value); } });
    await session.applyNext(source, context, async request => { expect(phases).toEqual(['prepared', 'awaiting-receipt']); return ack(request); });
    expect(phases).toEqual(['prepared', 'awaiting-receipt', 'confirmed']); expect(session.receipts).toHaveLength(1);
  });
  it('does not send if either pre-send journal write fails and preserves the exact not-sent request', async () => {
    for (const failedPhase of ['prepared', 'awaiting-receipt']) {
      const context = people(), { preview, source } = await setup({ kind: 'person' }, [{ name: '合成人员' }], context), send = vi.fn();
      const session = new BusinessApplySession(preview, { actorId: 'actor', persist: async value => { if (value.phase === failedPhase) throw new Error('quota'); } });
      await expect(session.applyNext(source, context, send)).rejects.toThrow('尚未发送'); expect(send).not.toHaveBeenCalled(); expect(session.uncertain).toBe(false); expect(session.pending).not.toBeNull();
    }
  });
  it('captures source again after asynchronous journal writes and cancels new dispatch if it changed', async () => {
    const context = people(), { preview, source } = await setup({ kind: 'person' }, [{ name: '合成人员' }], context), phases: string[] = [], send = vi.fn();
    const session = new BusinessApplySession(preview, { actorId: 'actor', persist: async value => { phases.push(value.phase); if (value.phase === 'awaiting-receipt') source.snapshot.name = '日志写入期间被修改'; } });
    await expect(session.applyNext(source, context, send, async () => source)).rejects.toThrow('尚未发送');
    expect(send).not.toHaveBeenCalled(); expect(phases).toEqual(['prepared', 'awaiting-receipt', 'prepared']); expect(session.uncertain).toBe(false);
  });
  it('recovers an exact serialized pending command after refresh without a source/preview or new operation ID', async () => {
    const context = people(), { preview, source } = await setup({ kind: 'person' }, [{ name: '合成人员' }], context); let saved: BusinessApplyCheckpoint | undefined;
    const persist = async (value: BusinessApplyCheckpoint) => { saved = clone(value); };
    const session = new BusinessApplySession(preview, { actorId: 'actor', persist });
    await expect(session.applyNext(source, context, vi.fn().mockRejectedValue(new Error('response lost')))).rejects.toThrow('结果未知');
    expect(saved?.phase).toBe('awaiting-receipt'); const original = clone(saved!); source.snapshot.name = '刷新后已改来源';
    const send = vi.fn(async (request: BusinessApplyRequest) => ack(request)); const recovered = await retryBusinessApplyCheckpoint(original, { actorId: 'actor', persist }, send);
    expect(send.mock.calls[0]![0].bodyJSON).toBe(original.request!.bodyJSON); expect(send.mock.calls[0]![0].operationId).toBe(original.request!.operationId); expect(recovered.phase).toBe('confirmed'); expect(recovered.request).toBeNull(); expect(saved?.receipts[0]?.id).toBe('created_2');
  });
  it('checks persisted prepared source hashes and rechecks after asynchronous hashing', async () => {
    const context = people(), { preview, source } = await setup({ kind: 'person' }, [{ name: '合成人员' }], context); let prepared!: BusinessApplyCheckpoint;
    const session = new BusinessApplySession(preview, { actorId: 'actor', persist: async value => { if (value.phase === 'prepared') { prepared = clone(value); throw new Error('stop before dispatch'); } } });
    await expect(session.applyNext(source, context, vi.fn())).rejects.toThrow('尚未发送');
    await expect(assertPreparedBusinessSource(prepared, async () => source)).resolves.toBeUndefined();
    const changed = clone(source); changed.snapshot.name = '改名';
    await expect(assertPreparedBusinessSource(prepared, async () => changed)).rejects.toThrow('来源已变化');
    let reads = 0; await expect(assertPreparedBusinessSource(prepared, async () => ++reads === 1 ? source : changed)).rejects.toThrow('来源已变化');
  });
  it('retains pending when acknowledgement persistence fails and confirms only after identical replay', async () => {
    const context = people(), { preview, source } = await setup({ kind: 'person' }, [{ name: '合成人员' }], context); let fail = true;
    const session = new BusinessApplySession(preview, { actorId: 'actor', persist: async value => { if (fail && value.phase === 'confirmed') throw new Error('quota'); } });
    const send = vi.fn(async (request: BusinessApplyRequest) => ack(request)); await expect(session.applyNext(source, context, send)).rejects.toThrow('结果未知'); expect(session.receipts).toHaveLength(0);
    fail = false; await session.retryPending(send); expect(send.mock.calls[0]![0].bodyJSON).toBe(send.mock.calls[1]![0].bodyJSON); expect(session.receipts).toHaveLength(1);
  });
  it('does not read/replay another actor or changed endpoint/body and bounds local journal size', async () => {
    const context = people(), { preview, source } = await setup({ kind: 'person' }, [{ name: '合成人员' }], context); let saved!: BusinessApplyCheckpoint;
    const persist = async (value: BusinessApplyCheckpoint) => { saved = clone(value); };
    await expect(new BusinessApplySession(preview, { actorId: 'actor', persist }).applyNext(source, context, vi.fn().mockRejectedValue(new Error('lost')))).rejects.toThrow(); const send = vi.fn();
    await expect(retryBusinessApplyCheckpoint(saved, { actorId: 'other', persist }, send)).rejects.toThrow('无效');
    const endpoint = clone(saved); endpoint.request!.path = '/admin/users'; await expect(retryBusinessApplyCheckpoint(endpoint, { actorId: 'actor', persist }, send)).rejects.toThrow('无效');
    const body = clone(saved); body.request!.bodyJSON = body.request!.bodyJSON.replace('合成人员', '偷偷替换'); await expect(retryBusinessApplyCheckpoint(body, { actorId: 'actor', persist }, send)).rejects.toThrow('不一致');
    const oversized = { ...saved, extra: 'x'.repeat(BUSINESS_JOURNAL_LIMITS.bytesPerSlot) }; expect(() => validateBusinessApplyCheckpoint(oversized, 'actor', source.workbookId)).toThrow('上限'); expect(send).not.toHaveBeenCalled();
  });
  it('records definitive first rejection separately and does not downgrade ambiguous replay rejection', async () => {
    const context = people(), { preview, source } = await setup({ kind: 'person' }, [{ name: '合成人员' }], context); let saved!: BusinessApplyCheckpoint;
    const persist = async (value: BusinessApplyCheckpoint) => { saved = clone(value); };
    const session = new BusinessApplySession(preview, { actorId: 'actor', persist });
    await expect(session.applyNext(source, context, vi.fn().mockRejectedValue(new ApiRequestError('conflict', 409)))).rejects.toThrow('重新预览'); expect(saved.phase).toBe('rejected'); expect(saved.request).toBeNull();
    await expect(new BusinessApplySession(preview, { actorId: 'actor', persist }).applyNext(source, context, vi.fn().mockRejectedValue(new Error('lost')))).rejects.toThrow();
    try { await retryBusinessApplyCheckpoint(saved, { actorId: 'actor', persist }, vi.fn().mockRejectedValue(new ApiRequestError('forbidden', 403))); throw new Error('must reject'); } catch (cause) { expect(cause).toBeInstanceOf(BusinessApplyFailure); expect((cause as BusinessApplyFailure).checkpoint.phase).toBe('awaiting-receipt'); }
    expect(saved.phase).toBe('awaiting-receipt');
  });
  it('allows server-canonicalized no-op receipt at the original revision without claiming a new version', async () => {
    const context = people(), { preview, source } = await setup({ kind: 'person' }, [{ __id: 'person-old', __revision: 2, name: ' 同名人员 ' }], context);
    const session = new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} }); await session.applyNext(source, context, async () => ({ items: [{ id: 'person-old', revision: 2 }] })); expect(session.receipts[0]?.revision).toBe(2);
  });
});
describe('immutable commands, ambiguity and partial batches', () => {
  it('rechecks the whole source and current business revision before constructing any request', async () => {
    const context = people(), { preview, source } = await setup({ kind: 'person' }, [{ __id: 'person-old', __revision: 2, note: '更改' }], context), send = vi.fn();
    const edited = clone(source); edited.snapshot.styles.changed = { bl: 1 };
    await expect(new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} }).applyNext(edited, context, send)).rejects.toThrow('重新预览');
    if (context.kind === 'person') context.directory.items[0]!.revision++;
    await expect(new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} }).applyNext(source, context, send)).rejects.toThrow('业务记录或关联范围已变化'); expect(send).not.toHaveBeenCalled();
  });
  it('replays exactly the same operation and frozen body after lost acknowledgement without re-reading source', async () => {
    const context = people(), { preview, source } = await setup({ kind: 'person' }, [{ name: '合成新人员' }], context); const session = new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} });
    const send = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockImplementationOnce(async (request: BusinessApplyRequest) => ack(request));
    await expect(session.applyNext(source, context, send)).rejects.toThrow('结果未知'); const pending = session.pending;
    expect(Object.isFrozen(pending)).toBe(true); expect(() => { pending!.bodyJSON = '{}'; }).toThrow();
    source.snapshot.sheets.data!.cellData![1]![0]!.v = '后来修改';
    await expect(session.applyNext(source, context, send)).rejects.toThrow('先确认原请求'); await session.retryPending(send);
    expect(send.mock.calls[1]![0]).toEqual(pending); expect(session.uncertain).toBe(false); expect(session.receipts).toHaveLength(1);
  });
  it('retains uncertain operation after revoked authorization or conflict, but first definite rejection permits re-preview', async () => {
    const context = people(), { preview, source } = await setup({ kind: 'person' }, [{ name: '合成新人员' }], context);
    const uncertain = new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} }); await expect(uncertain.applyNext(source, context, vi.fn().mockRejectedValue(new Error('timeout')))).rejects.toThrow(); const original = uncertain.pending;
    for (const status of [403, 409]) { await expect(uncertain.retryPending(vi.fn().mockRejectedValue(new ApiRequestError('拒绝', status)))).rejects.toThrow('结果未知'); expect(uncertain.pending).toEqual(original); }
    const rejected = new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} }); await expect(rejected.applyNext(source, context, vi.fn().mockRejectedValue(new ApiRequestError('冲突', 409)))).rejects.toThrow('重新预览'); expect(rejected.pending).toBeNull(); expect(rejected.failed).toBe(true);
  });
  it.each(['count', 'id', 'revision', 'duplicate'])('does not mark malformed %s acknowledgements as success', async kind => {
    const context = people(), { preview, source } = await setup({ kind: 'person' }, [{ name: '甲' }, { name: '乙' }], context), session = new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} });
    const send = vi.fn(async (request: BusinessApplyRequest) => { const result = ack(request); if (kind === 'count') result.items.pop(); if (kind === 'id') result.items[0]!.clientId = 'foreign'; if (kind === 'revision') result.items[0]!.revision = 2; if (kind === 'duplicate') result.items[1]!.id = result.items[0]!.id; return result; });
    await expect(session.applyNext(source, context, send)).rejects.toThrow('结果未知'); expect(session.receipts).toHaveLength(0); expect(session.pending).not.toBeNull();
  });
  it('uses bounded separate person create/update batches and retains confirmed receipts across later source conflict', async () => {
    const context = people(), rows = Array.from({ length: 51 }, (_, index) => ({ name: `合成人员${index}` })) as Array<Record<string, string | number>>; rows.push({ __id: 'person-old', __revision: 2, note: '更改' });
    const { preview, source } = await setup({ kind: 'person' }, rows, context), session = new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} }), send = vi.fn(async (request: BusinessApplyRequest) => ack(request));
    await session.applyNext(source, context, send); expect(session.receipts).toHaveLength(50); expect(session.remaining).toBe(2); expect(send.mock.calls[0]![0].plans).toHaveLength(50);
    await session.applyNext(source, context, send); expect(send.mock.calls[1]![0].plans).toHaveLength(1); expect(session.remaining).toBe(1);
    const changed = clone(source); changed.formalRevision++;
    await expect(session.applyNext(changed, context, send)).rejects.toThrow('重新预览'); expect(session.receipts).toHaveLength(51);
    await session.applyNext(source, context, send); expect(send.mock.calls[2]![0].path).toBe('/persons/sheet'); expect(session.remaining).toBe(0);
    expect(new Set(send.mock.calls.map(call => call[0].operationId)).size).toBe(3);
  });
  it('rejects concurrent clicks and accepts inspection next revision only from its own acknowledgement', async () => {
    const context = inspections(), { preview, source } = await setup(inspectionTarget('defect'), Array.from({ length: 51 }, () => ({ description: '合成缺陷' })), context), session = new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} });
    let resolve!: (value: unknown) => void; const first = session.applyNext(source, context, request => new Promise(done => { resolve = value => done(value ?? { ...ack(request), activityId: 'activity', revision: 8, items: ack(request).items.map(item => ({ ...item, entity: 'defect' })) }); }));
    await expect(session.applyNext(source, context, vi.fn())).rejects.toThrow('先确认'); resolve(null); await first;
    await expect(session.applyNext(source, context, vi.fn())).rejects.toThrow('活动版本已变化'); context.snapshot.activity.revision = 9;
    await expect(session.applyNext(source, context, vi.fn())).rejects.toThrow('活动版本已变化'); context.snapshot.activity.revision = 8;
    await session.applyNext(source, context, async request => ({ ...ack(request), activityId: 'activity', revision: 9, items: ack(request).items.map(item => ({ ...item, entity: 'defect' })) })); expect(session.receipts).toHaveLength(51);
  });
  it('transport preserves exact endpoint, method, body and idempotency header with a timeout', async () => {
    const context = people(), { preview, source } = await setup({ kind: 'person' }, [{ name: '合成甲' }], context); const session = new BusinessApplySession(preview, { actorId: 'actor', persist: async () => {} });
    await expect(session.applyNext(source, context, vi.fn().mockRejectedValue(new Error('network')))).rejects.toThrow();
    vi.mocked(apiRequest).mockResolvedValue(ack(session.pending!)); await session.retryPending(sendBusinessApplyRequest);
    const [path, options] = vi.mocked(apiRequest).mock.calls[0]!; expect(path).toBe('/persons'); expect(options?.method).toBe('POST'); expect(options?.headers).toEqual({ 'Idempotency-Key': session.receipts[0]!.operationId }); expect(options?.body).toMatchObject({ operationId: session.receipts[0]!.operationId }); expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
});
