import { parseBusinessFactSource } from '../../common/business-fact-source';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export type PersonChanges = Partial<{
  name: string; departmentId: string | null; position: string | null;
  email: string | null; mobile: string | null; note: string | null; isActive: boolean;
}>;
const fields = ['name', 'departmentId', 'position', 'email', 'mobile', 'note', 'isActive'] as const;
export function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('输入须为对象。');
  return raw as Record<string, unknown>;
}
export function only(raw: Record<string, unknown>, allowed: readonly string[]) {
  const field = Object.keys(raw).find(key => !allowed.includes(key));
  if (field) throw new BadRequestException({ code: 'PERSON_FIELD_READ_ONLY', field, message: '包含只读或不支持的字段。' });
}
export function identity(raw: unknown) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(raw)) throw new BadRequestException('稳定标识格式不正确。');
  return raw;
}
export function revision(raw: unknown) {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 1 || raw >= 2147483647) throw new BadRequestException('记录版本不正确。');
  return raw;
}
function text(raw: unknown, max: number, required = false): string | null {
  if (raw === null && !required) return null;
  if (typeof raw !== 'string' || raw.length > max || raw.includes('\0') || /^\s*=/.test(raw) || (required && !raw.trim())) throw new BadRequestException('文本格式、长度或公式内容不合法。');
  return raw.trim() || null;
}
export function changes(raw: unknown, create = false): PersonChanges {
  const input = object(raw); only(input, fields);
  if (!Object.keys(input).length) throw new BadRequestException('没有需要保存的字段。');
  const result: PersonChanges = {};
  // Canonical order makes semantically identical payloads use the same request hash.
  for (const field of fields) {
    if (!Object.hasOwn(input, field)) continue;
    if (field === 'isActive') {
      if (typeof input[field] !== 'boolean') throw new BadRequestException('档案启用状态须为布尔值。');
      result.isActive = input[field];
    } else if (field === 'departmentId') result.departmentId = input[field] === null ? null : identity(input[field]);
    else if (field === 'name') result.name = text(input[field], 100, true)!;
    else result[field] = text(input[field], field === 'note' ? 2000 : field === 'mobile' ? 32 : field === 'email' ? 160 : 100);
  }
  if (create && !result.name) throw new BadRequestException('新增档案须填写姓名。');
  return result;
}
export function assertProfileFieldAccess(userId: string | null, input: PersonChanges, admin = false) {
  if (userId && Object.hasOwn(input, 'isActive')) throw new ForbiddenException('已关联账号的停用请使用人员权限管理入口。');
  if (userId && Object.hasOwn(input, 'departmentId') && !admin) throw new ForbiddenException('已关联账号的部门调整须由管理员办理。');
}
export function parsePersonSheet(raw: unknown) {
  const body = object(raw); only(body, ['operationId', 'items']);
  const operationId = identity(body.operationId);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) throw new BadRequestException('一次保存 1–50 条档案。');
  const items = body.items.map(rawItem => {
    const item = object(rawItem); only(item, ['id', 'expectedRevision', 'changes']);
    return { id: identity(item.id), expectedRevision: revision(item.expectedRevision), changes: changes(item.changes) };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(items.map(item => item.id)).size !== items.length) throw new BadRequestException('重复的人员 ID。');
  if (Buffer.byteLength(JSON.stringify(items)) > 256 * 1024) throw new BadRequestException('保存内容过大。');
  return { operationId, items };
}
export function parsePersonCreate(raw: unknown) {
  const body = object(raw); only(body, ['operationId', 'items']);
  const operationId = identity(body.operationId);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) throw new BadRequestException('一次新增 1–50 条档案。');
  const items = body.items.map(rawItem => {
    const item = object(rawItem); only(item, ['clientId', 'fields', 'source']);
    return { clientId: identity(item.clientId), fields: changes(item.fields, true), source: parseBusinessFactSource(item.source) };
  }).sort((a, b) => a.clientId.localeCompare(b.clientId));
  if (new Set(items.map(item => item.clientId)).size !== items.length) throw new BadRequestException('重复的新增行标识。');
  if (Buffer.byteLength(JSON.stringify(items)) > 256 * 1024) throw new BadRequestException('导入内容过大。');
  return { operationId, items };
}
export function parsePersonLink(raw: unknown) {
  const body = object(raw); only(body, ['operationId', 'expectedRevision', 'userId', 'expectedUserVersion', 'reason']);
  const expectedUserVersion = text(body.expectedUserVersion, 32, true)!;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expectedUserVersion) || !Number.isFinite(Date.parse(expectedUserVersion))) throw new BadRequestException('账号版本不正确。');
  return { operationId: identity(body.operationId), expectedRevision: revision(body.expectedRevision), userId: identity(body.userId), expectedUserVersion, reason: text(body.reason, 500, true)! };
}
export function parsePersonDepartment(raw: unknown) {
  const body = object(raw); only(body, ['operationId', 'expectedRevision', 'departmentId', 'reason']);
  return { operationId: identity(body.operationId), expectedRevision: revision(body.expectedRevision), departmentId: body.departmentId === null ? null : identity(body.departmentId), reason: text(body.reason, 500, true)! };
}
export function commandHash(raw: unknown) { return createHash('sha256').update(JSON.stringify(raw)).digest('hex'); }
