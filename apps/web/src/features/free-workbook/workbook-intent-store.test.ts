import { describe, expect, it } from 'vitest';
import { blankWorkbook } from './contract';
import { validateWorkbookIntent, validateWorkbookIntentTransition, WORKBOOK_INTENT_LIMITS, type WorkbookIntent } from './workbook-intent-store';
const book = '572766eb-ecb3-49c4-9d34-9242236d976a', intentId = '753766eb-ecb3-49c4-9d34-9242236d976a';
const copy = <T,>(value: T): T => structuredClone(value);
function create(): WorkbookIntent { return { version: 1, intentId, phase: 'prepared', resolution: null, data: { kind: 'create', operationId: 'original-create', snapshot: blankWorkbook(book, '合成工作簿') } }; }
function importing(): WorkbookIntent { return { version: 1, intentId, phase: 'prepared', resolution: null, data: { kind: 'import', operationId: 'original-create', createSnapshot: blankWorkbook(book, '合成导入'), sourceFileName: '合成.xlsx', sourceBytes: new Uint8Array([80, 75, 3, 4]), imageOperations: ['image-one', 'image-two'], created: null, imageIndex: 0, assets: [] } }; }
function awaiting(value: WorkbookIntent): WorkbookIntent { return { ...copy(value), phase: 'awaiting-receipt', resolution: null }; }
function importCreated(): WorkbookIntent { const value = awaiting(importing()); if (value.data.kind === 'import') value.data.created = { id: book, name: '合成导入', revision: 1, snapshotHash: 'a'.repeat(64), updatedAt: '2026-10-20T08:00:00.000Z' }; return value; }
function transition(before: WorkbookIntent | null, after: WorkbookIntent) { validateWorkbookIntentTransition(before && validateWorkbookIntent(before), validateWorkbookIntent(after)); }
describe('bounded, detached workbook intent records', () => {
  it('preserves all three exact original request shapes and clones snapshot/binary values', () => {
    const original = importing(), safe = validateWorkbookIntent(original); expect(safe).toEqual(original);
    if (safe.data.kind !== 'import' || original.data.kind !== 'import') throw Error('fixture');
    original.data.sourceBytes[0] = 0; original.data.createSnapshot.name = '后来修改'; original.data.imageOperations[0] = 'new';
    expect(safe.data.sourceBytes[0]).toBe(80); expect(safe.data.createSnapshot.name).toBe('合成导入'); expect(safe.data.imageOperations[0]).toBe('image-one');
    expect(validateWorkbookIntent(create()).data.kind).toBe('create');
    const restore: WorkbookIntent = { version: 1, intentId, phase: 'prepared', resolution: null, data: { kind: 'restore', id: book, revision: 2, expected: 5, operationId: 'restore-original' } };
    expect(validateWorkbookIntent(restore)).toEqual(restore);
  });
  it.each(['owner', 'extra', 'phase', 'resolution', 'kind', 'op', 'snapshot'] as const)('rejects malformed %s without silently changing the request', kind => {
    const value = create() as unknown as Record<string, unknown>, data = value.data as Record<string, unknown>;
    if (kind === 'owner') value.intentId = '../outside'; else if (kind === 'extra') value.extra = true; else if (kind === 'phase') value.phase = 'failed'; else if (kind === 'resolution') value.resolution = 'succeeded'; else if (kind === 'kind') data.kind = 'execute'; else if (kind === 'op') data.operationId = 'space invalid'; else data.snapshot = { id: book };
    expect(() => validateWorkbookIntent(value)).toThrow();
  });
  it('bounds source bytes without JSON expansion and rejects oversized snapshot/image lists', () => {
    const value = importing(); if (value.data.kind !== 'import') throw Error('fixture');
    value.data.sourceBytes = new Uint8Array(WORKBOOK_INTENT_LIMITS.sourceBytes); expect(validateWorkbookIntent(value).data.kind).toBe('import');
    value.data.sourceBytes = new Uint8Array(WORKBOOK_INTENT_LIMITS.sourceBytes + 1); expect(() => validateWorkbookIntent(value)).toThrow();
    value.data.sourceBytes = new Uint8Array([1]); value.data.imageOperations = Array.from({ length: 51 }, (_, i) => `image-${i}`); expect(() => validateWorkbookIntent(value)).toThrow();
    const large = create(); if (large.data.kind !== 'create') throw Error('fixture');
    large.data.snapshot.styles = { oversized: { ff: 'x'.repeat(WORKBOOK_INTENT_LIMITS.snapshotBytes) } }; expect(() => validateWorkbookIntent(large)).toThrow();
  });
  it.each(['duplicate-op', 'duplicate-source', 'foreign-meta', 'early-progress', 'early-success'] as const)('refuses inconsistent import %s', kind => {
    const value = kind === 'duplicate-source' ? importCreated() : importing(); if (value.data.kind !== 'import') throw Error('fixture');
    if (kind === 'duplicate-op') value.data.imageOperations[1] = value.data.imageOperations[0]!;
    if (kind === 'duplicate-source') value.data.assets = [['media-one', book], ['media-one', book]];
    if (kind === 'foreign-meta') value.data.created = { id: intentId, name: '合成导入', revision: 1, snapshotHash: 'a'.repeat(64), updatedAt: '2026-10-20' };
    if (kind === 'early-progress') value.data.imageIndex = 1;
    if (kind === 'early-success') Object.assign(value, { phase: 'confirmed', resolution: 'succeeded' });
    expect(() => validateWorkbookIntent(value)).toThrow();
  });
});
describe('immutable request identities and monotonic import progress', () => {
  it('requires an unsent initial entry and forbids unknown regression', () => {
    const original = create(), sent = awaiting(original); transition(null, original); transition(original, sent);
    expect(() => transition(null, sent)).toThrow('未发送'); expect(() => transition(sent, original)).toThrow('未知请求');
    expect(() => transition(original, { ...original, phase: 'confirmed', resolution: 'succeeded' })).toThrow();
  });
  it.each(['intent', 'operation', 'snapshot', 'binary', 'filename', 'image-operation'] as const)('never rewrites original %s while reusing a slot', kind => {
    const before = awaiting(importing()), after = copy(before); if (after.data.kind !== 'import') throw Error('fixture');
    if (kind === 'intent') after.intentId = book; else if (kind === 'operation') after.data.operationId = 'new'; else if (kind === 'snapshot') after.data.createSnapshot.name = 'new'; else if (kind === 'binary') after.data.sourceBytes[1] = 0; else if (kind === 'filename') after.data.sourceFileName = 'new.xlsx'; else after.data.imageOperations[0] = 'new';
    expect(() => transition(before, after)).toThrow();
  });
  it('atomically records create/image receipts, allows shared media reuse, and keeps final results immutable', () => {
    const first = awaiting(importing()), created = importCreated(); if (first.data.kind !== 'import' || created.data.kind !== 'import') throw Error('fixture');
    created.data.createSnapshot = copy(first.data.createSnapshot); transition(first, created);
    const uploaded = copy(created); if (uploaded.data.kind !== 'import') throw Error('fixture'); uploaded.data.assets.push(['xl/media/image1.png', book]); transition(created, uploaded);
    const inserted = copy(uploaded); if (inserted.data.kind !== 'import') throw Error('fixture'); inserted.data.imageIndex = 1; transition(uploaded, inserted);
    const complete = copy(inserted); if (complete.data.kind !== 'import') throw Error('fixture'); complete.data.imageIndex = 2;
    const confirmed: WorkbookIntent = { ...complete, phase: 'confirmed', resolution: 'succeeded' }; transition(inserted, confirmed);
    transition(confirmed, copy(confirmed)); expect(() => transition(confirmed, { ...confirmed, resolution: 'rejected' })).toThrow();
  });
  it.each(['skip', 'rollback', 'asset-replace', 'meta-replace'] as const)('rejects import progress %s', kind => {
    const before = importCreated(); if (before.data.kind !== 'import') throw Error('fixture'); before.data.assets = [['source-one', book]]; before.data.imageIndex = kind === 'rollback' ? 1 : 0;
    const after = copy(before); if (after.data.kind !== 'import') throw Error('fixture');
    if (kind === 'skip') after.data.imageIndex = 2; else if (kind === 'rollback') after.data.imageIndex = 0; else if (kind === 'asset-replace') after.data.assets[0]![1] = intentId; else after.data.created!.revision = 2;
    expect(() => transition(before, after)).toThrow();
  });
  it('can settle a definitive rejection with partial image progress without calling it success', () => {
    const partial = importCreated(); if (partial.data.kind !== 'import') throw Error('fixture'); partial.data.imageIndex = 1; partial.data.assets = [['source-one', book]];
    const rejected: WorkbookIntent = { ...copy(partial), phase: 'confirmed', resolution: 'rejected' }; transition(partial, rejected); expect(validateWorkbookIntent(rejected).resolution).toBe('rejected');
    expect(() => validateWorkbookIntent({ ...partial, phase: 'confirmed', resolution: 'succeeded' })).toThrow();
  });
});
