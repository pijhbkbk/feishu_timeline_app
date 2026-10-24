import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { LocaleType } from '@univerjs/core';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/auth-client';
import { PERSON_COLUMNS } from '../person-sheet/person-adapter';
import { prepareBusinessMapping, type BusinessMappingSource } from './business-mapping';
import { prepareMappedBusiness } from './business-apply';
import { exportMappingEvidence } from './mapping-evidence';

vi.mock('../../lib/auth-client', () => ({ apiRequest: vi.fn() }));
const workbookId = '572766eb-ecb3-49c4-9d34-9242236d976a';
const owner = { actorId: 'synthetic_actor', workbookId };
const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
afterEach(() => vi.restoreAllMocks());
async function prepare(count = 2) {
  const source: BusinessMappingSource = { workbookId, formalRevision: 3, sourceSnapshotHash: 'a'.repeat(64), snapshot: {
    id: workbookId, name: '合成依据', appVersion: '1.0.4', locale: LocaleType.ZH_CN, styles: {}, sheetOrder: ['data'], sheets: {
      data: { id: 'data', name: '合成人员', rowCount: 3000, columnCount: 3, cellData: {
        0: { 0: { v: '姓名' }, 1: { v: '备注' }, 2: { v: '资格' } },
        ...Object.fromEntries(Array.from({ length: count }, (_, index) => [index + 1, { 0: { v: index === 0 ? '00017' : `合成人员${index}` }, 1: { v: index === 0 ? '中文\r\n"原文"\\与零0' : null }, 2: { v: index === count - 1 ? '不可写资格' : null } }])),
      } },
    },
  } };
  const definition = { target: { kind: 'person' as const }, sheetId: 'data', headerRow: 0, range: { startRow: 1, endRow: count + 1, startColumn: 0, endColumn: 2 }, fields: [{ column: 0, field: 'name' }, { column: 1, field: 'note' }, { column: 2, field: 'roles' }], clearFields: [] };
  const original = JSON.stringify(source.snapshot), mappingJSON = JSON.stringify({ definition, columns: PERSON_COLUMNS });
  const mapping = await prepareBusinessMapping(source, definition, PERSON_COLUMNS);
  const preview = prepareMappedBusiness(mapping, { kind: 'person', directory: { items: [], departments: [], hasMore: false } });
  return { source, original, mappingJSON, preview };
}

it('downloads exact captured UTF-8 and verifiable hashes without reading current edits or invoking business commands', async () => {
  const { source, original, mappingJSON, preview } = await prepare();
  const before = JSON.stringify(preview);
  source.snapshot.sheets.data!.cellData![1]![0]!.v = '后续编辑不能冒充旧捕获';
  const files = unzipSync(await exportMappingEvidence(preview, owner, () => true));
  expect(Object.keys(files).sort()).toEqual(['SHA256SUMS', 'binding.json', 'mapping.json', 'source.json']);
  expect(strFromU8(files['source.json']!)).toBe(original);
  expect(strFromU8(files['mapping.json']!)).toBe(mappingJSON);
  const binding = JSON.parse(strFromU8(files['binding.json']!));
  expect(binding.capturedOwner).toEqual(owner);
  expect(binding.preview).toEqual(preview);
  expect(binding.checks.sourceBefore).toBe(digest(files['source.json']!));
  expect(binding.checks.sourceAfter).toBe(binding.checks.sourceBefore);
  expect(binding.checks.mappingBefore).toBe(binding.checks.mappingAfter);
  expect(binding.checks.previewBefore).toBe(binding.checks.previewAfter);
  expect(binding.binding.sourceSnapshotHash).toBe('a'.repeat(64));
  expect(binding.binding.fullJSONHash).not.toBe(binding.binding.sourceSnapshotHash);
  for (const line of strFromU8(files.SHA256SUMS!).trim().split('\n')) {
    const [sha, name] = line.split('  '); expect(digest(files[name!]!)).toBe(sha);
  }
  expect(JSON.stringify(preview)).toBe(before);
  expect(apiRequest).not.toHaveBeenCalled();
});

it('retains every preview row across pagination, including errors and the blank-row count', async () => {
  const { preview } = await prepare(1999);
  const files = unzipSync(await exportMappingEvidence(preview, owner, () => true));
  const data = JSON.parse(strFromU8(files['binding.json']!));
  expect(data.preview.plans).toHaveLength(1999);
  expect(data.preview.plans.at(-1).status).toBe('error');
  expect(data.preview.mapping.counts.skippedBlankRows).toBe(1);
});

it('rejects deserialized previews and a replaced mapping instead of reconstructing missing captures', async () => {
  const { preview } = await prepare();
  await expect(exportMappingEvidence(JSON.parse(JSON.stringify(preview)), owner, () => true)).rejects.toThrow('实际生成');
  const clonedMapping = JSON.parse(JSON.stringify(preview.mapping));
  const prepared = prepareMappedBusiness(clonedMapping, { kind: 'person', directory: { items: [], departments: [], hasMore: false } });
  await expect(exportMappingEvidence(prepared, owner, () => true)).rejects.toThrow('没有保留来源原文');
});

it('cancels when the actor, workbook or preview changes during asynchronous hashing', async () => {
  const { preview } = await prepare();
  for (const label of ['actor', 'workbook', 'preview']) {
    let current = label;
    const pending = exportMappingEvidence(preview, owner, () => current === label);
    current = 'changed';
    await expect(pending).rejects.toThrow('本次导出已取消');
  }
  await expect(exportMappingEvidence(preview, { ...owner, workbookId: 'different' }, () => true)).rejects.toThrow('身份不一致');
});

it('rejects a mismatched capture digest', async () => {
  const { preview } = await prepare();
  vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array(32).buffer);
  await expect(exportMappingEvidence(preview, owner, () => true)).rejects.toThrow('摘要不一致');
});
