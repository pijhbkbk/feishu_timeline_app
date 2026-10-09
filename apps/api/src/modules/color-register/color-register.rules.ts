import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

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
