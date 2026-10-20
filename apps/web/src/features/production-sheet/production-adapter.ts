import { apiRequest } from '../../lib/auth-client';
import type { ImportPlan } from '../business-sheet/record-import';
import type { RecordSheetPatch, RecordSheetRow } from '../business-sheet/record-sheet-types';
export interface ProductionSource { fileName: string; sheetName: string; rowNumbers: number[]; fileHash?: string }
export interface ProductionFact {
  id: string; colorId: string; colorName: string | null; colorCode: string; baseId: string; baseName: string;
  month: string; quantity: string | null; unit: '台'; revision: number; metricScope: string; metricScopeLabel: string; rowKind: 'MONTH_TOTAL' | 'MODEL_DETAIL'; vehicleModel?: string; editable: boolean;
  originalSource: unknown;
  countingStatus?: string; includedInOperationalTotal?: boolean; effectiveQuantity?: string | null;
}
export interface ProductionFilters { baseId: string; colorId: string; fromMonth: string; toMonth: string; vehicleModel?: string }
export interface ProductionList { items: ProductionFact[]; total: number; page: number; pageSize: number; totalPages: number; snapshotHash?: string; scope: string; reconciliationFactCount: number; reconciliationExcluded: boolean; unsupportedDimensions: string[] }
export interface ProductionStatistics {
  scope: string; metricScope: string; unit: '台'; factCount: number; unknownCount: number; knownQuantity: string; quantity: string | null;
  byBase: Array<{ baseId: string; factCount: number; unknownCount: number; knownQuantity: string; quantity: string | null }>;
  byBaseHasMore: boolean; reconciliationExcluded: boolean;
  reconciliationMonthCount?: number; unallocatedMonthCount?: number;
  byVehicleModel?: Array<{ vehicleModel: string; factCount: number; quantity: string | null; knownQuantity: string }>;
  byVehicleModelHasMore?: boolean;
}
export interface ProductionSourceFact extends ProductionFact {
  sourceCell: string | null; includedInOperationalTotal: false;
  source: { sheetName: string; rowNumber: number; batch: { fileName: string } } | null;
}
export interface ProductionSources { items: ProductionSourceFact[]; total: number; page: number; pageSize: number; scope: string }
export const PRODUCTION_COLUMNS = [
  { key: 'month', label: '业务月份', width: 125 }, { key: 'baseName', label: '生产基地', width: 140 },
  { key: 'colorName', label: '颜色名称', width: 155 }, { key: 'colorCode', label: '颜色编号', width: 155 },
  { key: 'vehicleModel', label: '车型原文', width: 160 }, { key: 'rowKind', label: '行类型', width: 145 },
  { key: 'quantity', label: '实际台数', width: 130 }, { key: 'unit', label: '单位', width: 80 },
  { key: 'scope', label: '统计口径', width: 275 }, { key: 'photos', label: '照片', width: 145 },
  { key: 'countingStatus', label: '月度计数状态', width: 220 }, { key: 'effectiveQuantity', label: '计入统计台数', width: 140 },
  { key: 'sourceSummary', label: '导入来源', width: 260 },
];
export const emptyProductionFilters: ProductionFilters = { baseId: '', colorId: '', fromMonth: '', toMonth: '', vehicleModel: '' };
export function productionQuery(filters: ProductionFilters): URLSearchParams {
  if (filters.fromMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.fromMonth) || filters.toMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.toMonth)) throw new Error('月份须使用 YYYY-MM。');
  if (filters.fromMonth && filters.toMonth && filters.fromMonth > filters.toMonth) throw new Error('开始月份不能晚于结束月份。');
  if (filters.vehicleModel && (filters.vehicleModel.length > 100 || [...filters.vehicleModel].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) throw new Error('车型原文最多100字，不能含控制字符。');
  return new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined)));
}
/** Stored legacy provenance is informational JSON, never a record identity. */
export function productionSourceSummary(source: unknown): string | null {
  if (source === null || source === undefined) return null;
  if (typeof source !== 'object' || Array.isArray(source)) return '来源信息待核对';
  const value = source as Record<string, unknown>;
  if (typeof value.fileName !== 'string' || !value.fileName.trim() || value.fileName.length > 255
    || typeof value.sheetName !== 'string' || !value.sheetName.trim() || value.sheetName.length > 200
    || !Array.isArray(value.rowNumbers) || !value.rowNumbers.length || value.rowNumbers.length > 200
    || value.rowNumbers.some(row => !Number.isSafeInteger(row) || row < 1 || row > 1048576)) return '来源信息待核对';
  return `${value.fileName} / ${value.sheetName} / ${value.rowNumbers.join('、')}`;
}
export function productionRow(fact: ProductionFact, canEdit = true): RecordSheetRow<ProductionFact> {
  return { id: fact.id, revision: fact.revision, meta: fact, editable: canEdit && fact.editable ? ['quantity'] : [],
    values: { month: fact.month, baseName: fact.baseName, colorName: fact.colorName, colorCode: fact.colorCode, quantity: fact.quantity, unit: fact.unit,
      vehicleModel: fact.vehicleModel ?? '', rowKind: fact.rowKind,
      countingStatus: fact.countingStatus ?? '重新读取核对口径', effectiveQuantity: fact.effectiveQuantity ?? null,
      scope: fact.metricScopeLabel, photos: null, sourceSummary: productionSourceSummary(fact.originalSource) } };
}
export function parseProductionQuantity(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  if (!/^\d+$/.test(value.trim())) throw new Error('实际总量须为 0–10 亿整数台；留空表示未知，0 表示已确认零产量。');
  const quantity = Number(value.trim());
  if (!Number.isSafeInteger(quantity) || quantity > 1_000_000_000) throw new Error('实际总量须为 0–10 亿整数台。');
  return quantity;
}
export function validateProduction(_row: RecordSheetRow<ProductionFact>, field: string, value: string | null): string | undefined {
  if (field !== 'quantity') return '只有实际总量可以直接更正；颜色、基地和月份保持原记录身份。';
  try { parseProductionQuantity(value); return undefined; } catch (cause) { return cause instanceof Error ? cause.message : '数量无效。'; }
}
export async function readProductionFacts(filters: ProductionFilters, signal: AbortSignal): Promise<ProductionList & { hasMore: boolean }> {
  const query = productionQuery(filters); query.set('pageSize', '50'); query.set('page', '1');
  const first = await apiRequest<ProductionList>(`/production-facts?${query}`, { signal });
  const items = [...first.items], last = Math.min(40, first.totalPages);
  for (let page = 2; page <= last; page += 4) {
    const pages = Array.from({ length: Math.min(4, last - page + 1) }, (_, index) => page + index);
    const batches = await Promise.all(pages.map(number => { const next = new URLSearchParams(query); next.set('page', String(number)); return apiRequest<ProductionList>(`/production-facts?${next}`, { signal }); }));
    for (const batch of batches) { if (batch.total !== first.total || batch.snapshotHash !== first.snapshotHash) throw new Error('读取期间产量事实或统计口径改变，请刷新后再编辑或导出。'); items.push(...batch.items); }
  }
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('读取期间产量记录顺序改变，请刷新。');
  return { ...first, items, hasMore: first.totalPages > last };
}
export function readProductionStatistics(filters: ProductionFilters, signal?: AbortSignal) { return apiRequest<ProductionStatistics>(`/production-facts/statistics?${productionQuery(filters)}`, signal ? { signal } : {}); }
export function readProductionSources(filters: ProductionFilters, page: number, signal: AbortSignal) {
  const query = productionQuery(filters); query.set('page', String(page)); query.set('pageSize', '25'); return apiRequest<ProductionSources>(`/production-facts/sources?${query}`, { signal });
}
export function productionUpdates(patches: readonly RecordSheetPatch[]) {
  return patches.map(patch => {
    if (Object.keys(patch.changes).length !== 1 || !Object.prototype.hasOwnProperty.call(patch.changes, 'quantity')) throw new Error('产量清单只能提交实际总量更正，不能覆盖身份或统计口径。');
    return { kind: 'update' as const, id: patch.id, expectedRevision: patch.expectedRevision, quantity: parseProductionQuantity(patch.changes.quantity ?? null) };
  });
}
export async function saveProductionFacts(patches: RecordSheetPatch[], operationId: string, canEdit = true) {
  const result = await apiRequest<{ items: ProductionFact[]; submittedCount: number }>('/production-facts/batch', { method: 'PATCH', body: { operationId, items: productionUpdates(patches) } });
  return result.items.map(fact => productionRow(fact, canEdit));
}
export async function createProductionFact(input: { clientId: string; colorId: string; baseId: string; month: string; quantity: string | null; rowKind?: 'MONTH_TOTAL' | 'MODEL_DETAIL'; vehicleModel?: string | undefined; source?: ProductionSource }, operationId: string) {
  const result = await apiRequest<{ items: ProductionFact[] }>('/production-facts/batch', { method: 'PATCH', body: { operationId, items: [{ kind: 'create', clientId: input.clientId, colorId: input.colorId, baseId: input.baseId, month: input.month, quantity: parseProductionQuantity(input.quantity), rowKind: input.rowKind ?? 'MONTH_TOTAL', ...(input.vehicleModel ? { vehicleModel: input.vehicleModel } : {}), ...(input.source ? { source: input.source } : {}) }] } });
  if (result.items.length !== 1) throw new Error('新增响应未能确认原记录，请重试同一请求。');
  return result.items[0]!;
}

export type ProductionImportOperation =
  | { kind: 'update'; id: string; expectedRevision: number; quantity: number | null }
  | { kind: 'create'; clientId: string; colorId: string; baseId: string; month: string; quantity: number | null; rowKind: 'MONTH_TOTAL' | 'MODEL_DETAIL'; vehicleModel?: string; source: import('../business-sheet/record-exchange').ImportSource };
export interface ProductionImportContext {
  facts: ReadonlyMap<string, ProductionFact>;
  colors: readonly { id: string; name: string | null; base: { id: string; name: string } | null }[];
  chosenBaseId: string; chosenColorId: string;
}
export const PRODUCTION_IMPORT_COLUMNS = [...PRODUCTION_COLUMNS,
  { key: 'colorId', label: '颜色记录ID', width: 220 }, { key: 'baseId', label: '基地ID', width: 220 },
];
export function prepareProductionImport(input: import('../business-sheet/record-exchange').ExchangeInput, clearFields: readonly string[], context: ProductionImportContext): ImportPlan {
  const fail = (message: string) => ({ input, status: 'error' as const, message });
  if (input.errors.length) return fail(input.errors.join('；'));
  try {
    if (input.id) {
      const fact = context.facts.get(input.id);
      if (!fact || !fact.editable) return fail('记录 ID 不在当前可维护月度总量中；不会改为新增或覆盖来源事实。');
      if (input.revision !== fact.revision) return fail(`版本冲突：服务器版本 ${fact.revision}、实际总量 ${fact.quantity ?? '未知'}。请重新导出或刷新后核对。`);
      const values = { ...productionRow(fact).values, colorId: fact.colorId, baseId: fact.baseId, rowKind: fact.rowKind };
      for (const [field, value] of Object.entries(input.values)) {
        if (field === 'quantity' || (value === null || value === '') && !clearFields.includes(field)) continue;
        if (!(field in values) || value !== values[field as keyof typeof values]) return fail(`「${PRODUCTION_IMPORT_COLUMNS.find(column => column.key === field)?.label ?? field}」是只读信息，不能通过导入更改。`);
      }
      if (!Object.prototype.hasOwnProperty.call(input.values, 'quantity') || (input.values.quantity === null || input.values.quantity === '') && !clearFields.includes('quantity')) return { input, status: 'unchanged', message: '未提供实际总量变更；空白默认忽略。' };
      const quantity = parseProductionQuantity(input.values.quantity ?? null);
      if ((fact.quantity === null ? null : Number(fact.quantity)) === quantity) return { input, status: 'unchanged', message: '实际总量未改变。' };
      const data: ProductionImportOperation = { kind: 'update', id: fact.id, expectedRevision: fact.revision, quantity };
      return { input, status: 'update', message: `更正原记录：${fact.quantity ?? '未知'} → ${quantity ?? '未知'} 台；不会作为增量累加。`, data };
    }
    const modelDetail = input.values.rowKind === 'MODEL_DETAIL';
    const rowKind = modelDetail ? 'MODEL_DETAIL' : 'MONTH_TOTAL';
    if (!modelDetail && !['MONTH_TOTAL', '月度总量'].includes(input.values.rowKind ?? '') && input.values.scope !== '月度实际总量（全车型，不分产线和班次）') return fail('新增行须明确标注 MONTH_TOTAL／月度总量或 MODEL_DETAIL；小计和粒度不明行请排除。');
    const scope = modelDetail ? '月度车型明细（同色、基地、月份内替换维护）' : '月度实际总量（全车型，不分产线和班次）';
    if (input.values.scope && input.values.scope !== scope) return fail('新增行的统计口径不一致，不能自动转换。');
    const vehicleModel = input.values.vehicleModel?.trim() ?? '';
    if (modelDetail && (!vehicleModel || vehicleModel.length > 100 || [...vehicleModel].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) return fail('车型明细须填写1–100字车型原文，不推断或合并别名。');
    if (!modelDetail && vehicleModel) return fail('月度全车型总量不能同时填写车型。');
    if (input.values.unit && input.values.unit !== '台') return fail('产量单位须为台；不会自动换算其他单位。');
    const accepted = new Set(['rowKind', 'vehicleModel', 'scope', 'unit', 'colorId', 'baseId', 'colorName', 'baseName', 'month', 'quantity']);
    for (const [field, value] of Object.entries(input.values)) if (value !== null && value !== '' && !accepted.has(field)) return fail(`新增行「${PRODUCTION_IMPORT_COLUMNS.find(column => column.key === field)?.label ?? field}」不是可写字段，请取消映射；照片通过图片预览确认归属。`);
    const colorId = input.values.colorId || context.chosenColorId, baseId = input.values.baseId || context.chosenBaseId;
    const color = context.colors.find(value => value.id === colorId);
    if (!color || !baseId || color.base?.id !== baseId) return fail('请在页面明确选择基地与颜色，或映射已授权的颜色记录 ID / 基地 ID；不会按名称猜测归属。');
    if (input.values.colorName && input.values.colorName !== color.name || input.values.baseName && input.values.baseName !== color.base.name) return fail('名称与明确选择的颜色 / 基地不一致，请核对；不会自动改绑。');
    const month = input.values.month ?? '';
    productionQuery({ ...emptyProductionFilters, fromMonth: month, toMonth: month }); if (!month) return fail('新增月度总量必须填写业务月份。');
    const existing = [...context.facts.values()].find(fact => fact.colorId === colorId && fact.baseId === baseId && fact.month === month && (fact.vehicleModel ?? '') === vehicleModel);
    if (existing) return fail(`该颜色 ${month} 的月度总量已存在，请使用原记录 ID 和版本进行更正，不能再次累加。`);
    const data: ProductionImportOperation = { kind: 'create', clientId: input.clientId, colorId, baseId, month, quantity: parseProductionQuantity(input.values.quantity ?? null), rowKind, ...(modelDetail ? { vehicleModel } : {}), source: input.source };
    return { input, status: 'create', message: `新增 ${color.base.name} / ${color.name ?? '未命名颜色'} / ${month} / ${vehicleModel || '全车型总量'}：${data.quantity ?? '未知'} 台；混合事实须明确唯一统计口径。`, data };
  } catch (cause) { return fail(cause instanceof Error ? cause.message : '产量字段无效。'); }
}
/** Catch duplicate create grains across the whole preview before 50-row save chunks. */
export function finalizeProductionImports(plans: ImportPlan[]) {
  const counts = new Map<string, number>();
  const key = (plan: typeof plans[number]) => { const data = plan.data as ProductionImportOperation | undefined; return data?.kind === 'create' ? JSON.stringify([data.colorId, data.baseId, data.month, data.vehicleModel ?? '']) : null; };
  plans.forEach(plan => { const grain = key(plan); if (grain) counts.set(grain, (counts.get(grain) ?? 0) + 1); });
  return plans.map(plan => { const grain = key(plan); return grain && counts.get(grain)! > 1 ? { ...plan, status: 'error' as const, message: '同一文件多行声明相同颜色、基地与月份的月度总量，请核对并保留一条；不会自动累加。' } : plan; });
}
export async function applyProductionImports(plans: ImportPlan[], operationId: string) {
  const items = plans.map(plan => {
    const data = plan.data as ProductionImportOperation | undefined;
    if (!data || (plan.status !== 'update' && plan.status !== 'create') || data.kind !== plan.status) throw new Error('导入预览不完整，请重新核对。');
    return data;
  });
  const result = await apiRequest<{ items: Array<ProductionFact & { clientId?: string }> }>('/production-facts/batch', { method: 'PATCH', body: { operationId, items } });
  if (result.items.length !== plans.length) throw new Error('导入响应未完整确认，请核实原请求。');
  return result.items.map(fact => {
    const plan = fact.clientId ? plans.find(plan => plan.input.clientId === fact.clientId) : plans.find(plan => plan.input.id === fact.id);
    if (!plan) throw new Error('导入响应身份不匹配，请核实原请求。');
    return { clientId: plan.input.clientId, id: fact.id };
  });
}
