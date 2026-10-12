import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { parseRegisterMonth } from '../../common/color-standard';

export function object(value: unknown, label = '输入'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(`${label}格式不正确。`);
  return value as Record<string, unknown>;
}
export function textField(value: unknown, label: string, max = 200, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new BadRequestException(`${label}不能为空。`);
    return null;
  }
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || (required && !value.trim())) throw new BadRequestException(`${label}格式或长度不正确。`);
  return value;
}
export function identity(value: unknown, label = '记录 ID') {
  const result = textField(value, label, 128, true)!;
  if (!/^[A-Za-z0-9_-]+$/.test(result)) throw new BadRequestException(`${label}格式不正确。`);
  return result;
}
export function positiveInt(value: unknown, label: string, max = 2147483647) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) throw new BadRequestException(`${label}须为正整数。`);
  return value;
}
export function pagination(query: Record<string, unknown>, prefix = '') {
  const get = (key: string, fallback: number, max: number) => {
    const raw = query[key];
    if (raw === undefined || raw === '') return fallback;
    if (typeof raw !== 'string' || !/^[1-9]\d{0,5}$/.test(raw)) throw new BadRequestException('分页参数不正确。');
    return positiveInt(Number(raw), '分页参数', max);
  };
  const page = get(prefix ? `${prefix}Page` : 'page', 1, 2000);
  const pageSize = get(prefix ? `${prefix}PageSize` : 'pageSize', prefix ? 20 : 25, 50);
  if (page * pageSize > 50000) throw new BadRequestException('分页范围过大，请缩小筛选范围。');
  return { page, pageSize, skip: (page - 1) * pageSize };
}
export function jsonData(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
export function commandHash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function parseNotes(raw: unknown) {
  const body = object(raw);
  const operationId = identity(body.operationId, '操作标识');
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) throw new BadRequestException('一次可保存 1–50 条备注。');
  const items = body.items.map(value => {
    const item = object(value);
    return { id: identity(item.id), expectedRevision: positiveInt(item.expectedRevision, '记录版本'), note: textField(item.note, '备注', 4000) };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(items.map(item => item.id)).size !== items.length) throw new BadRequestException('同一记录不能重复提交。');
  if (Buffer.byteLength(JSON.stringify(items)) > 256 * 1024) throw new BadRequestException('备注内容过大。');
  return { operationId, items };
}


const SHEET_FIELDS = new Set(['note', 'boardCode', 'manufacturer', 'paintType', 'registerMonth']);
export type RegisterSheetChanges = Partial<{ note: string | null; boardCode: string | null; manufacturer: string | null; paintType: string | null; registerMonth: string | null }>;
function onlyFields(input: Record<string, unknown>, allowed: ReadonlySet<string>, label: string) {
  const unsupported = Object.keys(input).find(key => !allowed.has(key));
  if (unsupported) throw new BadRequestException({ code: 'COLOR_REGISTER_FIELD_ERROR', message: `${label}包含只读或不支持的字段。`, field: unsupported });
}
export function parseSheetChanges(raw: unknown) {
  const body = object(raw);
  onlyFields(body, new Set(['operationId', 'reason', 'items']), '保存请求');
  const operationId = identity(body.operationId, '操作标识');
  const reason = textField(body.reason, '标准更正原因', 1000)?.trim() || null;
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) throw new BadRequestException('一次可保存 1–50 条颜色记录。');
  const items = body.items.map(value => {
    const item = object(value);
    onlyFields(item, new Set(['id', 'expectedRevision', 'changes']), '记录');
    const id = identity(item.id);
    const expectedRevision = positiveInt(item.expectedRevision, '记录版本');
    const input = object(item.changes, '字段改动');
    try {
      onlyFields(input, SHEET_FIELDS, '字段改动');
      if (!Object.keys(input).length) throw new BadRequestException('请提供需要保存的字段。');
      const changes: RegisterSheetChanges = {};
      for (const field of ['note', 'boardCode', 'manufacturer', 'paintType', 'registerMonth'] as const) {
        if (!Object.hasOwn(input, field)) continue;
        // An omitted field differs from an explicit null; undefined is not a business value.
        if (input[field] === undefined) throw new BadRequestException({ message: '字段值不正确。', field });
        try {
          if (field === 'registerMonth') changes[field] = parseRegisterMonth(input[field]) ?? null;
          else changes[field] = textField(input[field], field === 'note' ? '备注' : field === 'boardCode' ? '色板编号' : field === 'manufacturer' ? '制作单位' : '漆种', field === 'note' ? 4000 : field === 'boardCode' ? 128 : 200);
        } catch (error) {
          if (error instanceof BadRequestException) throw new BadRequestException({ code: 'COLOR_REGISTER_FIELD_ERROR', message: error.message, field });
          throw error;
        }
      }
      return { id, expectedRevision, changes };
    } catch (error) {
      if (error instanceof BadRequestException) {
        const response = error.getResponse();
        throw new BadRequestException({ ...(typeof response === 'object' ? response : { message: response }), colorId: id });
      }
      throw error;
    }
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(items.map(item => item.id)).size !== items.length) throw new BadRequestException('同一记录不能重复提交。');
  if (Buffer.byteLength(JSON.stringify({ items, reason })) > 256 * 1024) throw new BadRequestException('保存内容过大。');
  return { operationId, reason, items };
}
