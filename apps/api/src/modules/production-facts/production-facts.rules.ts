import { parseBusinessFactSource, type BusinessFactSource } from '../../common/business-fact-source';
import { BadRequestException } from '@nestjs/common';
import { parseRegisterMonth } from '../../common/color-standard';
import { identity, object, positiveInt } from '../color-register/color-register.rules';

/** Historical scopes remain reconciliation-only; model names never imply an alias or a project link. */
export const MONTHLY_ACTUAL_SCOPE = 'MONTHLY_ACTUAL_TOTAL_V1';
export const MONTHLY_MODEL_SCOPE = 'MONTHLY_MODEL_DETAIL_V1';
export const MAX_MODELS_PER_MONTH = 100;
export const MONTHLY_ACTUAL_SCOPE_LABEL = '月度实际总量（全车型，不分产线和班次）';
export const MONTHLY_MODEL_SCOPE_LABEL = '月度车型明细（同色、基地、月份内替换维护）';
export type ProductionCreate = { kind: 'create'; clientId: string; colorId: string; baseId: string; month: string; quantity: number | null; rowKind: 'MONTH_TOTAL' | 'MODEL_DETAIL'; vehicleModel: string; source: BusinessFactSource | null };
export type ProductionUpdate = { kind: 'update'; id: string; expectedRevision: number; quantity: number | null };
export type ProductionMutation = ProductionCreate | ProductionUpdate;
export function onlyFields(input: Record<string, unknown>, fields: string[]) {
  const field = Object.keys(input).find(key => !fields.includes(key));
  if (field) throw new BadRequestException({ code: 'PRODUCTION_FIELD_ERROR', field, message: '包含只读或不支持的字段。' });
}
export function actualQuantity(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) {
    throw new BadRequestException({ code: 'PRODUCTION_FIELD_ERROR', field: 'quantity', message: '实际产量须为 0–10 亿整数台；未知请明确留空。' });
  }
  return value;
}
export function productionMonth(value: unknown): string {
  const month = parseRegisterMonth(value);
  if (!month) throw new BadRequestException('请选择业务月份。');
  return month;
}
export function grain(item: { colorId: string; baseId: string; month: string }) {
  return `${item.colorId}:${item.baseId}:${item.month}`;
}
export function vehicleModel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100 || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new BadRequestException('车型须为 1–100 字原文，不能含控制字符。');
  return value.trim();
}
export function factGrain(item: { colorId: string; baseId: string; month: string; vehicleModel: string }) {
  return JSON.stringify([item.colorId, item.baseId, item.month, item.vehicleModel]);
}
export function parseBasisRead(raw: Record<string, unknown>) {
  return { colorId: identity(raw.colorId, '颜色'), baseId: identity(raw.baseId, '基地'), month: productionMonth(raw.month) };
}
export function parseBasisWrite(raw: unknown) {
  const body = object(raw);
  onlyFields(body, ['operationId', 'colorId', 'baseId', 'month', 'mode', 'expectedRevision', 'expectedSnapshot']);
  if (body.mode !== 'MONTH_TOTAL' && body.mode !== 'MODEL_DETAILS') throw new BadRequestException('请选择月度总量或车型明细作为唯一统计口径。');
  if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) throw new BadRequestException('口径版本不正确。');
  if (typeof body.expectedSnapshot !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedSnapshot)) throw new BadRequestException('产量快照不正确。');
  return { ...parseBasisRead(body), mode: body.mode as 'MONTH_TOTAL' | 'MODEL_DETAILS', expectedRevision: Number(body.expectedRevision), expectedSnapshot: body.expectedSnapshot, operationId: identity(body.operationId, '操作标识') };
}
export function parseProductionBatch(raw: unknown) {
  const body = object(raw);
  onlyFields(body, ['operationId', 'items']);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) throw new BadRequestException('一次提交 1–50 条产量事实。');
  const items: ProductionMutation[] = body.items.map(rawItem => {
    const item = object(rawItem);
    if (item.kind === 'create') {
      onlyFields(item, ['kind', 'clientId', 'colorId', 'baseId', 'month', 'quantity', 'rowKind', 'vehicleModel', 'source']);
      if (item.rowKind !== 'MONTH_TOTAL' && item.rowKind !== 'MODEL_DETAIL') throw new BadRequestException({ code: 'PRODUCTION_GRAIN_UNSUPPORTED', message: '须明确月度总量或车型明细；来源小计不能混入。' });
      if (item.rowKind === 'MONTH_TOTAL' && item.vehicleModel !== undefined && item.vehicleModel !== '') throw new BadRequestException('全车型总量不能同时指定车型。');
      return { kind: 'create', clientId: identity(item.clientId, '草稿标识'), colorId: identity(item.colorId, '颜色'), baseId: identity(item.baseId, '基地'), month: productionMonth(item.month), quantity: actualQuantity(item.quantity), rowKind: item.rowKind, vehicleModel: item.rowKind === 'MODEL_DETAIL' ? vehicleModel(item.vehicleModel) : '', source: parseBusinessFactSource(item.source) };
    }
    if (item.kind !== 'update') throw new BadRequestException('产量操作类型不正确。');
    onlyFields(item, ['kind', 'id', 'expectedRevision', 'quantity']);
    return { kind: 'update', id: identity(item.id), expectedRevision: positiveInt(item.expectedRevision, '记录版本'), quantity: actualQuantity(item.quantity) };
  });
  const identities = items.map(item => item.kind === 'create' ? `new:${item.clientId}` : `id:${item.id}`);
  const grains = items.flatMap(item => item.kind === 'create' ? [factGrain(item)] : []);
  if (new Set(identities).size !== items.length || new Set(grains).size !== grains.length) throw new BadRequestException({ code: 'PRODUCTION_DUPLICATE_GRAIN', message: '同一批次含重复记录或重复月度业务键。' });
  return { operationId: identity(body.operationId, '操作标识'), items };
}
export function productionFilters(query: Record<string, unknown>, includeModel = true) {
  const baseId = query.baseId ? identity(query.baseId, '基地') : undefined;
  const colorId = query.colorId ? identity(query.colorId, '颜色') : undefined;
  const fromMonth = query.fromMonth ? productionMonth(query.fromMonth) : undefined;
  const toMonth = query.toMonth ? productionMonth(query.toMonth) : undefined;
  if (fromMonth && toMonth && fromMonth > toMonth) throw new BadRequestException('开始月份不能晚于结束月份。');
  const model = query.vehicleModel ? vehicleModel(query.vehicleModel) : undefined;
  return { ...(baseId ? { productionBaseId: baseId } : {}), ...(colorId ? { colorId } : {}), ...(includeModel && model ? { vehicleModel: model } : {}),
    ...(fromMonth || toMonth ? { month: { ...(fromMonth ? { gte: fromMonth } : {}), ...(toMonth ? { lte: toMonth } : {}) } } : {}) };
}
