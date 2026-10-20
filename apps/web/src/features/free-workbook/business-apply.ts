import { apiRequest, ApiRequestError } from '../../lib/auth-client';
import type { ImportPlan } from '../business-sheet/record-import';
import { prepareColorImport } from '../color-register/color-record-import';
import { preparePersonImport } from '../person-sheet/person-import';
import { personRow } from '../person-sheet/person-adapter';
import { finalizeProductionImports, prepareProductionImport } from '../production-sheet/production-adapter';
import { exchangeRows, finalizeInspectionPlans, prepareInspectionImport } from '../inspections/exchange';
import { fields as inspectionFields } from '../inspections/model';
import { assertBusinessMappingCurrent, BUSINESS_MAPPING_LIMITS, type BusinessMappingPreview, type BusinessMappingSource } from './business-mapping';
import { mappingColumns, type MappingContext } from './mapping-context';
import { validateBusinessApplyCheckpoint, type BusinessApplyCheckpoint, type BusinessApplyPersistence } from './business-apply-journal';

export interface BusinessApplyPreview { mapping: BusinessMappingPreview; plans: readonly ImportPlan[]; reason: string; activityRevision: number | null }
export interface BusinessApplyReceipt { sourceRow: number; clientId: string; id: string; revision: number; operationId: string }
export interface BusinessApplyRequest { path: string; method: 'POST' | 'PATCH'; operationId: string; bodyJSON: string; plans: readonly ImportPlan[] }
export type BusinessApplyTransport = (request: BusinessApplyRequest) => Promise<unknown>;
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function errorPlan(input: ImportPlan['input'], message: string): ImportPlan { return { input, status: 'error', message }; }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function active(plan: ImportPlan) { return plan.status === 'create' || plan.status === 'update'; }
const prepared = new WeakSet<BusinessApplyPreview>();

/** The original adapters still decide business values, permissions and stable identity. Explicit
 * mapping adds no template marker and does not transfer pictures, accounts or workflow decisions. */
export function prepareMappedBusiness(mapping: BusinessMappingPreview, context: MappingContext, reason = ''): BusinessApplyPreview {
  const target = mapping.definition.target, clears = mapping.definition.clearFields;
  if (context.kind !== target.kind) throw new Error('业务关联范围与映射目标不一致。');
  if (reason.length > 1000) throw new Error('更正原因最多 1000 字。');
  const headerError = mapping.headers.some(header => header.error);
  const personRows = context.kind === 'person' ? context.directory.items.map(personRow) : [];
  const inspectionRows = context.kind === 'inspection' && target.kind === 'inspection' ? exchangeRows(context.snapshot, target.layer) : [];
  let plans = mapping.rows.map(({ input, cellKinds }): ImportPlan => {
    if (headerError) return errorPlan(input, '表头包含合并、公式或不支持内容，请先核对表头。');
    if (input.errors.length) return errorPlan(input, input.errors.join('；'));
    if (input.values.photos || clears.includes('photos')) return errorPlan(input, '图片须在业务图片入口明确绑定；映射不会移动或清空工作簿图片。');
    if (context.kind === 'color') {
      if (cellKinds.boardCode === 'number') return errorPlan(input, '色板编号必须是文本；不会把数值转换成编号。');
      const { catalog } = context;
      return prepareColorImport(input, clears, { rows: catalog.items, reason, paintTypes: catalog.facets.paintTypes ?? [...new Set(catalog.items.flatMap(row => row.paintType ? [row.paintType] : []))], manufacturers: catalog.facets.manufacturers ?? [...new Set(catalog.items.flatMap(row => row.manufacturer ? [row.manufacturer] : []))] });
    }
    if (context.kind === 'person') return preparePersonImport(input, clears, { rows: personRows, departments: context.directory.departments });
    if (context.kind === 'production') {
      if (target.kind !== 'production' || target.baseId !== context.production.chosenBaseId || target.colorId !== context.production.chosenColorId) return errorPlan(input, '基地与颜色范围已变化。');
      if (input.values.baseId && input.values.baseId !== target.baseId || input.values.colorId && input.values.colorId !== target.colorId) return errorPlan(input, '行内基地 / 颜色 ID 与明确选择的范围不一致，请分开预览。');
      return prepareProductionImport(input, clears, context.production);
    }
    if (target.kind !== 'inspection' || context.snapshot.activity.id !== target.activityId) return errorPlan(input, '检验活动范围已变化。');
    if (context.snapshot.activity.editable === false) return errorPlan(input, '此检验活动当前不可维护。');
    if (target.occurrenceId && !context.snapshot.occurrences.some(row => row.id === target.occurrenceId) || target.measurementId && !context.snapshot.measurements.some(row => row.id === target.measurementId && (!target.occurrenceId || row.occurrenceId === target.occurrenceId))) return errorPlan(input, '默认台次或测量组已变化或彼此不匹配，请明确重选。');
    if (!input.id) {
      // Existing import validates these context columns. All other read-only cells must remain
      // explicit errors, not disappear when building a new child fact (e.g. participants/VIN).
      const common = ['activityDate', 'baseName', 'objectId', 'colorId'];
      const perLayer = target.layer === 'occurrence' ? ['objectCode', 'colorName'] : target.layer === 'measurement' ? ['occurrenceId', 'standardVersionId'] : target.layer === 'reading' ? ['measurementId', 'occurrenceId'] : ['occurrenceId', 'measurementId'];
      const allowed = new Set([...inspectionFields[target.layer], ...common, ...perLayer]);
      const unexpected = Object.entries(input.values).find(([key, value]) => (value !== null && value !== '' || clears.includes(key)) && !allowed.has(key));
      if (unexpected) return errorPlan(input, `新增行字段「${mappingColumns(target).find(column => column.key === unexpected[0])?.label ?? unexpected[0]}」不能由此层写入，请取消映射并在业务页维护。`);
      if (target.layer === 'defect' && input.values.measurementId && !context.snapshot.measurements.some(row => row.id === input.values.measurementId)) return errorPlan(input, '明确提供的测量组不存在于当前活动；不会静默取消关联。');
    }
    return prepareInspectionImport(context.snapshot, target.layer, inspectionRows, context.bindings, input, clears);
  });
  if (target.kind === 'production') plans = finalizeProductionImports(plans);
  if (target.kind === 'inspection') plans = finalizeInspectionPlans(plans);
  const preview = freeze({ mapping, plans, reason: reason.trim(), activityRevision: context.kind === 'inspection' ? context.snapshot.activity.revision : null });
  prepared.add(preview); return preview;
}

function requestFor(target: BusinessApplyPreview['mapping']['definition']['target'], reason: string, plans: readonly ImportPlan[], operationId: string, activityRevision: number | null): BusinessApplyRequest {
  let path: string, method: 'POST' | 'PATCH' = 'PATCH', body: Record<string, unknown>;
  if (target.kind === 'person') {
    const create = plans[0]!.status === 'create'; path = create ? '/persons' : '/persons/sheet'; method = create ? 'POST' : 'PATCH';
    body = { operationId, items: plans.map(plan => create ? { clientId: plan.input.clientId, fields: plan.data, source: plan.input.source } : { id: plan.input.id, expectedRevision: plan.input.revision, changes: plan.data }) };
  } else {
    path = target.kind === 'inspection' ? `/inspections/activities/${encodeURIComponent(target.activityId)}/batch` : target.kind === 'production' ? '/production-facts/batch' : '/color-register/sheet';
    body = { operationId, items: plans.map(plan => plan.data), ...(target.kind === 'color' && reason ? { reason } : {}), ...(target.kind === 'inspection' ? { expectedRevision: activityRevision } : {}) };
  }
  const bodyJSON = JSON.stringify(body);
  if (new TextEncoder().encode(bodyJSON).length > 512 * 1024) throw new Error('该批业务请求超过 512 KiB，请缩小选区。');
  return freeze({ path, method, operationId, bodyJSON, plans: [...plans] });
}
function acknowledge(request: BusinessApplyRequest, value: unknown, activityRevision: number | null, activityId?: string): BusinessApplyReceipt[] {
  if (!object(value) || !Array.isArray(value.items) || value.items.length !== request.plans.length) throw new Error('业务回执条数不完整；请求结果尚未确认。');
  if (activityId && (value.activityId !== activityId || value.revision !== activityRevision! + 1)) throw new Error('检验活动回执身份或版本不匹配；请求结果尚未确认。');
  const remaining = new Set(request.plans); const ids = new Set<string>(); const receipts: BusinessApplyReceipt[] = [];
  for (const item of value.items) {
    if (!object(item) || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(item.id) || ids.has(item.id) || !Number.isSafeInteger(item.revision)) throw new Error('业务回执身份或版本无效；请求结果尚未确认。');
    const plan = [...remaining].find(plan => plan.status === 'create' ? item.clientId === plan.input.clientId : item.id === plan.input.id);
    const allowedRevision = plan && (plan.status === 'create' ? item.revision === 1 : activityId ? item.revision === plan.input.revision! + 1 : item.revision === plan.input.revision || item.revision === plan.input.revision! + 1);
    if (!plan || !allowedRevision || activityId && item.entity !== (plan.data as { entity: string }).entity) throw new Error('业务回执未确认原输入；请求结果尚未确认。');
    remaining.delete(plan); ids.add(item.id); receipts.push({ sourceRow: plan.input.row, clientId: plan.input.clientId, id: item.id, revision: item.revision as number, operationId: request.operationId });
  }
  return receipts;
}
export const sendBusinessApplyRequest: BusinessApplyTransport = request => apiRequest(request.path, { method: request.method, headers: { 'Idempotency-Key': request.operationId }, body: JSON.parse(request.bodyJSON) as unknown, signal: AbortSignal.timeout(30000) });

class InactiveBusinessApplyScopeError extends Error {}
/** This check must be synchronous and adjacent to dispatch: neither journal writes nor
 * source reads may bridge an account/workbook change into a different authenticated request. */
export function scopedBusinessApplyTransport(isActive: () => boolean, transport: BusinessApplyTransport = sendBusinessApplyRequest): BusinessApplyTransport {
  return request => { if (!isActive()) throw new InactiveBusinessApplyScopeError('原账号或工作簿页面已关闭，请回到原账号核实已保存的请求。'); return transport(request); };
}

/** No automatic network activity/retry. Each new batch needs fresh domain reads and a freshly
 * captured workbook. An uncertain request is settled verbatim, even after source changes: never
 * replace it with a new key, body, current revision or another person's draft. */
export class BusinessApplySession {
  private pendingRequest: BusinessApplyRequest | null = null;
  private ambiguous = false;
  private running = false;
  private rejected = false;
  private activityRevision: number | null;
  private completed: BusinessApplyReceipt[] = [];
  constructor(readonly preview: BusinessApplyPreview, private readonly persistence: BusinessApplyPersistence) {
    if (!prepared.has(preview) || preview.plans.some(plan => plan.status === 'error') || preview.mapping.headers.some(header => header.error)) throw new Error('请先处理预览中的所有错误。');
    this.activityRevision = preview.activityRevision;
  }
  get receipts(): readonly BusinessApplyReceipt[] { return this.completed.map(row => ({ ...row })); }
  get pending(): BusinessApplyRequest | null { return this.pendingRequest; }
  get uncertain() { return this.ambiguous; }
  get busy() { return this.running; }
  get failed() { return this.rejected; }
  get remaining() { return this.preview.plans.filter(plan => active(plan) && !this.completed.some(receipt => receipt.clientId === plan.input.clientId)).length; }

  async applyNext(current: BusinessMappingSource, context: MappingContext, transport: BusinessApplyTransport = sendBusinessApplyRequest, recapture?: () => Promise<BusinessMappingSource>): Promise<readonly BusinessApplyReceipt[]> {
    if (this.running || this.pendingRequest || this.rejected) throw new Error('请先确认原请求；不能建立另一个业务请求。');
    if (!this.remaining) return this.receipts;
    if (context.kind === 'inspection' && context.snapshot.activity.revision !== this.activityRevision) throw new Error('检验活动版本已变化，请重新预览；已确认批次保留。');
    const fresh = prepareMappedBusiness(this.preview.mapping, context, this.preview.reason);
    const remaining = this.preview.plans.filter(plan => active(plan) && !this.completed.some(receipt => receipt.clientId === plan.input.clientId));
    for (const old of remaining) {
      const next = fresh.plans.find(plan => plan.input.clientId === old.input.clientId);
      if (!next || old.status !== next.status || JSON.stringify(old.data) !== JSON.stringify(next.data)) throw new Error(`来源第 ${old.input.row} 行的业务记录或关联范围已变化，请重新预览；已确认批次保留。`);
    }
    const plans = (this.preview.mapping.definition.target.kind === 'person' ? remaining.filter(plan => plan.status === remaining[0]!.status) : remaining).slice(0, 50);
    assertBusinessMappingCurrent(this.preview.mapping, current, this.preview.mapping.definition, mappingColumns(this.preview.mapping.definition.target));
    this.pendingRequest = requestFor(this.preview.mapping.definition.target, this.preview.reason, plans, crypto.randomUUID(), this.activityRevision);
    return this.send(transport, recapture ? async () => assertBusinessMappingCurrent(this.preview.mapping, await recapture(), this.preview.mapping.definition, mappingColumns(this.preview.mapping.definition.target)) : undefined);
  }
  async retryPending(transport: BusinessApplyTransport = sendBusinessApplyRequest, recapture?: () => Promise<BusinessMappingSource>) {
    if (this.running || !this.pendingRequest) throw new Error('没有可重试的原请求。');
    return this.send(transport, !this.ambiguous && recapture ? async () => assertBusinessMappingCurrent(this.preview.mapping, await recapture(), this.preview.mapping.definition, mappingColumns(this.preview.mapping.definition.target)) : undefined);
  }
  private async send(transport: BusinessApplyTransport, beforeDispatch?: () => Promise<void>): Promise<readonly BusinessApplyReceipt[]> {
    this.running = true;
    const checkpoint: BusinessApplyCheckpoint = { version: 1, actorId: this.persistence.actorId, workbookId: this.preview.mapping.binding.workbookId,
      binding: { ...this.preview.mapping.binding }, target: this.preview.mapping.definition.target, reason: this.preview.reason, activityRevision: this.activityRevision,
      phase: this.ambiguous ? 'awaiting-receipt' : 'prepared', everAmbiguous: this.ambiguous, request: this.pendingRequest!, receipts: [...this.completed] };
    try {
      const saved = await retryBusinessApplyCheckpoint(checkpoint, this.persistence, transport, beforeDispatch);
      this.completed = saved.receipts; this.activityRevision = saved.activityRevision; this.pendingRequest = null; this.ambiguous = false; return this.receipts;
    } catch (cause) {
      if (cause instanceof BusinessApplyFailure) { this.pendingRequest = cause.checkpoint.request; this.ambiguous = cause.checkpoint.phase === 'awaiting-receipt'; this.rejected = cause.checkpoint.phase === 'rejected'; }
      throw cause;
    } finally { this.running = false; }
  }
}

export class BusinessApplyFailure extends Error {
  constructor(message: string, readonly checkpoint: BusinessApplyCheckpoint) { super(message); this.name = 'BusinessApplyFailure'; }
}
/** A prepared record is known not to have reached network. It still needs an unchanged source.
 * Unknown requests intentionally do not use this guard: their old result must be settled. */
export async function assertPreparedBusinessSource(checkpoint: BusinessApplyCheckpoint, getSource: () => Promise<BusinessMappingSource>): Promise<void> {
  const first = await getSource(), json = JSON.stringify(first.snapshot), bytes = new TextEncoder().encode(json);
  if (bytes.length > BUSINESS_MAPPING_LIMITS.snapshotBytes) throw new Error('未发送请求的来源超过读取上限。');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
  const current = await getSource(), binding = checkpoint.binding;
  if (hash !== binding.fullJSONHash || JSON.stringify(current.snapshot) !== json || current.workbookId !== binding.workbookId || current.formalRevision !== binding.formalRevision || current.sourceSnapshotHash !== binding.sourceSnapshotHash) throw new Error('未发送请求的来源已变化，请取消原请求并重新预览。');
}
/** Recovery settles only the journal's exact command. It never reconstructs a pending command
 * from a fresh workbook or resumes the rest of an old preview. Confirmed rows remain receipts. */
export async function retryBusinessApplyCheckpoint(checkpoint: BusinessApplyCheckpoint, persistence: BusinessApplyPersistence, transport: BusinessApplyTransport = sendBusinessApplyRequest, beforeDispatch?: () => Promise<void>): Promise<BusinessApplyCheckpoint> {
  const safe = validateBusinessApplyCheckpoint(checkpoint, persistence.actorId, checkpoint.workbookId);
  if (!safe.request || !['prepared', 'awaiting-receipt'].includes(safe.phase)) throw new Error('此日志没有待确认的原请求。');
  const request = freeze(safe.request), expected = requestFor(safe.target, safe.reason, request.plans, request.operationId, safe.activityRevision);
  if (expected.path !== request.path || expected.method !== request.method || expected.bodyJSON !== request.bodyJSON) throw new Error('本机请求体与原预览身份不一致，请保留记录并核对。');
  const wasAmbiguous = safe.everAmbiguous || safe.phase === 'awaiting-receipt'; let dispatched = false;
  try {
    if (safe.phase === 'prepared') await persistence.persist(freeze({ ...safe, phase: 'prepared', everAmbiguous: false }));
    await persistence.persist(freeze({ ...safe, phase: 'awaiting-receipt', everAmbiguous: true }));
    if (beforeDispatch) {
      try { await beforeDispatch(); } catch (cause) {
        // CAS back to prepared proves no competing replay has acquired this journal slot.
        // If that CAS fails, keep awaiting-receipt: another tab may already have sent it.
        try { await persistence.persist(freeze({ ...safe, phase: 'prepared', everAmbiguous: false })); } catch { throw new BusinessApplyFailure('发送前来源已变化，且日志被另一页面改变，请先核实原请求。', { ...safe, phase: 'awaiting-receipt', everAmbiguous: true }); }
        throw new BusinessApplyFailure(`${cause instanceof Error ? cause.message : '来源已变化。'} 本次尚未发送，可取消原请求并重新预览。`, { ...safe, phase: 'prepared', everAmbiguous: false });
      }
    }
    dispatched = true;
    const value = await transport(request);
    const rows = acknowledge(request, value, safe.activityRevision, safe.target.kind === 'inspection' ? safe.target.activityId : undefined);
    const confirmed: BusinessApplyCheckpoint = { ...safe, phase: 'confirmed', everAmbiguous: false, request: null, receipts: [...safe.receipts, ...rows], activityRevision: safe.target.kind === 'inspection' ? (value as { revision: number }).revision : null };
    await persistence.persist(freeze(confirmed)); return confirmed;
  } catch (cause) {
    if (cause instanceof BusinessApplyFailure) throw cause;
    if (cause instanceof InactiveBusinessApplyScopeError && !wasAmbiguous) {
      const unsent: BusinessApplyCheckpoint = { ...safe, phase: 'prepared', everAmbiguous: false };
      try { await persistence.persist(freeze(unsent)); } catch { throw new BusinessApplyFailure('原页面已关闭，且日志被另一页面改变；原请求需核实。', { ...safe, phase: 'awaiting-receipt', everAmbiguous: true }); }
      throw new BusinessApplyFailure(`${cause.message} 本次尚未发送。`, unsent);
    }
    const definitive = dispatched && !wasAmbiguous && cause instanceof ApiRequestError && [400, 401, 403, 404, 409, 413, 422, 429].includes(cause.status);
    if (definitive) {
      const rejected: BusinessApplyCheckpoint = { ...safe, phase: 'rejected', everAmbiguous: false, request: null };
      try { await persistence.persist(freeze(rejected)); } catch { throw new BusinessApplyFailure('请求被拒绝，但本机结果未能保存。请保留此窗口并核实原请求。', { ...safe, phase: 'awaiting-receipt', everAmbiguous: true }); }
      throw new BusinessApplyFailure(`${cause.message} 输入与已确认批次已保留，请重新预览。`, rejected);
    }
    const pending: BusinessApplyCheckpoint = { ...safe, phase: dispatched || wasAmbiguous ? 'awaiting-receipt' : 'prepared', everAmbiguous: dispatched || wasAmbiguous };
    throw new BusinessApplyFailure(`${cause instanceof Error ? cause.message : '业务请求失败。'}${pending.everAmbiguous ? ' 结果未知，原请求日志已保留；请重试原请求，不会更换请求键或内容。' : ' 本次尚未发送，须先成功保存本机请求日志。'}`, pending);
  }
}
