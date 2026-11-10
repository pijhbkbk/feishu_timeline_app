import { apiRequest } from '../../lib/auth-client';
import { readCatalog } from '../color-register/sheet-client';
import { SHEET_COLUMNS } from '../color-register/sheet-model';
import { readPersons, personRow, PERSON_COLUMNS } from '../person-sheet/person-adapter';
import { readProductionFacts, PRODUCTION_IMPORT_COLUMNS, type ProductionImportContext } from '../production-sheet/production-adapter';
import { allRows, readSnapshot, type InspectionObject, type Snapshot } from '../inspections/client';
import { exchangeColumns, type ImportBindings, type ImportStandard } from '../inspections/exchange';
import type { BusinessMappingTarget } from './business-mapping';

export type MappingContext =
  | { kind: 'color'; catalog: Awaited<ReturnType<typeof readCatalog>> }
  | { kind: 'person'; directory: Awaited<ReturnType<typeof readPersons>> }
  | { kind: 'production'; production: ProductionImportContext }
  | { kind: 'inspection'; snapshot: Snapshot; bindings: ImportBindings };

export function mappingColumns(target: BusinessMappingTarget) {
  return target.kind === 'inspection' ? exchangeColumns(target.layer) : target.kind === 'production' ? PRODUCTION_IMPORT_COLUMNS : target.kind === 'color' ? SHEET_COLUMNS : PERSON_COLUMNS;
}
export { personRow };

/** Every read goes through existing authenticated, bounded business endpoints. No workbook data
 * grants access. A truncated dictionary is not treated as evidence that an ID does not exist. */
export async function loadMappingContext(target: BusinessMappingTarget, signal: AbortSignal): Promise<MappingContext> {
  if (target.kind === 'person') {
    const directory = await readPersons(signal);
    if (directory.hasMore) throw new Error('人员库超过本次 2000 条读取上限，请在人员库直接维护；不会把未读取记录当成新增。');
    return { kind: 'person', directory };
  }
  if (target.kind === 'color' || target.kind === 'production') {
    const catalog = await readCatalog(signal);
    if (catalog.totalPages > 40 || catalog.items.length !== catalog.total) throw new Error('颜色清单超过读取上限或读取期间变化，请到对应业务页维护。');
    if (target.kind === 'color') return { kind: 'color', catalog };
    if (target.kind !== 'production') throw new Error('未知业务范围。');
    if (!target.baseId || !target.colorId || !catalog.items.some(row => row.id === target.colorId && row.base?.id === target.baseId)) throw new Error('请选择当前可访问的准确基地与颜色。');
    const facts = await readProductionFacts({ baseId: target.baseId, colorId: target.colorId, fromMonth: '', toMonth: '' }, signal);
    if (facts.hasMore || facts.items.length !== facts.total) throw new Error('所选产量范围超过读取上限或已经变化，请到产量页缩小范围。');
    return { kind: 'production', production: { facts: new Map(facts.items.map(row => [row.id, row])), colors: catalog.items.filter(row => row.id === target.colorId), chosenBaseId: target.baseId, chosenColorId: target.colorId } };
  }
  if (target.kind !== 'inspection') throw new Error('未知业务范围。');
  if (!target.activityId) throw new Error('请选择真实检验活动。');
  const snapshot = await readSnapshot(target.activityId, signal);
  const bindings: ImportBindings = { objects: [], colors: [], standards: [], objectId: target.objectId ?? '', colorId: target.colorId ?? '', occurrenceId: target.occurrenceId ?? '', measurementId: target.measurementId ?? '', standardVersionId: target.standardVersionId ?? '' };
  if (target.layer === 'occurrence') {
    [bindings.objects, bindings.colors] = await Promise.all([
      allRows<InspectionObject>('/inspections/objects', signal, 2000),
      allRows<ImportBindings['colors'][number]>(`/color-register?baseId=${encodeURIComponent(snapshot.activity.productionBaseId)}`, signal, 2000),
    ]);
  }
  if (target.layer === 'measurement') {
    // Explicit one-color standard dictionary. Other colors need another preview; no name guessing.
    const colorId = snapshot.occurrences.find(row => row.id === target.occurrenceId)?.colorId;
    if (colorId) {
      const standards: ImportStandard[] = []; let total = 1;
      for (let page = 1; page <= total; page++) {
        const data = await apiRequest<{ versions: Array<{ id: string; boardCode: string | null; versionNo: number }>; versionsTotal: number; versionsTotalPages: number }>(`/color-register/${encodeURIComponent(colorId)}?versionsPage=${page}&versionsPageSize=50`, { signal });
        if (!Number.isSafeInteger(data.versionsTotalPages) || data.versionsTotalPages < 1 || data.versionsTotalPages > 40 || data.versionsTotal > 2000) throw new Error('标准版本超过读取上限，请在检验业务页明确关联。');
        if (page > 1 && total !== data.versionsTotalPages) throw new Error('标准版本在读取期间变化，请重新预览。');
        total = data.versionsTotalPages; standards.push(...data.versions.map(row => ({ ...row, colorId })));
        if (page === total && (standards.length !== data.versionsTotal || new Set(standards.map(row => row.id)).size !== standards.length)) throw new Error('标准版本在读取期间变化，请重新预览。');
      }
      bindings.standards = standards;
    }
  }
  return { kind: 'inspection', snapshot, bindings };
}
