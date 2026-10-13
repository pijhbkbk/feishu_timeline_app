import { BadRequestException } from '@nestjs/common';
import { isSheetTarget } from '../attachments/sheet-attachment-policy';

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MAX_PIXELS = 40_000_000;
export const IMAGE_MAX_PER_RECORD = 50;
export type ImageLayout = { fieldKey: string; mode: 'CELL' | 'FLOATING'; offsetX: number; offsetY: number; width: number; height: number };
export function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('输入须为对象。');
  return raw as Record<string, unknown>;
}
export function fields(raw: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(raw).some(key => !allowed.includes(key))) throw new BadRequestException('包含不支持或只读的图片字段。');
}
export function identifier(raw: unknown) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(raw)) throw new BadRequestException('业务标识格式不正确。');
  return raw;
}
export function imageIdentifier(raw: unknown) {
  const id = identifier(raw);
  if (!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(id)) throw new BadRequestException('图片 ID 不正确。');
  return id;
}
export function target(raw: unknown) {
  if (typeof raw !== 'string' || !isSheetTarget(raw)) throw new BadRequestException('图片归属类型不正确。');
  return raw;
}
function integer(raw: unknown, min: number, max: number) {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < min || raw > max) throw new BadRequestException('图片尺寸、位置或版本超出范围。');
  return raw;
}
export function layout(raw: unknown): ImageLayout {
  const data = record(raw); fields(data, ['fieldKey', 'mode', 'offsetX', 'offsetY', 'width', 'height']);
  if (data.fieldKey !== 'photos') throw new BadRequestException('图片必须绑定当前业务表的 photos 字段。');
  if (data.mode !== 'CELL' && data.mode !== 'FLOATING') throw new BadRequestException('图片显示方式不正确。');
  return { fieldKey: data.fieldKey, mode: data.mode, offsetX: integer(data.offsetX, -4096, 4096), offsetY: integer(data.offsetY, -4096, 4096), width: integer(data.width, 16, 4096), height: integer(data.height, 16, 4096) };
}
export function parseUpload(raw: unknown) {
  const body = record(raw); fields(body, ['operationId', 'targetType', 'recordId', 'layout']);
  let rawLayout = body.layout;
  if (typeof rawLayout === 'string') {
    if (rawLayout.length > 1024) throw new BadRequestException('图片布局过大。');
    try { rawLayout = JSON.parse(rawLayout); } catch { throw new BadRequestException('图片布局格式不正确。'); }
  }
  return { operationId: identifier(body.operationId), targetType: target(body.targetType), recordId: identifier(body.recordId), layout: layout(rawLayout) };
}
export function parseLayout(raw: unknown, deletion = false) {
  const body = record(raw); fields(body, deletion ? ['operationId', 'expectedRevision'] : ['operationId', 'expectedRevision', 'layout']);
  return { operationId: identifier(body.operationId), expectedRevision: integer(body.expectedRevision, 1, 2147483646), ...(deletion ? {} : { layout: layout(body.layout) }) };
}
