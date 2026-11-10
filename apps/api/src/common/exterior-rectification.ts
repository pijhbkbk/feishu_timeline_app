import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export type ExteriorRectification = { status: 'PENDING'; sourceTaskId: string } | {
  status: 'COMPLETED'; sourceTaskId: string; supplierName: string; completedOn: string; summary: string;
  recordedAt: string; recordedById: string; progressUpdateId: string; operationId: string; requestHash: string;
};
export interface ExteriorRectificationCommand {
  taskId: string; expectedTaskVersion: string; operationId: string; supplierName: string; completedOn: string; summary: string;
}
const ID = /^[A-Za-z0-9_-]{1,128}$/;
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown, max: number): value is string { return typeof value === 'string' && !!value.trim() && value.length <= max && !value.includes('\0'); }
function date(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
function timestamp(value: unknown): value is string { return typeof value === 'string' && value.length === 24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
/** A new consistency round retains the original technical facts. This state only gates its re-review. */
export function readExteriorRectification(task: { payload?: Prisma.JsonValue | null }): ExteriorRectification | null {
  const payload = object(task.payload) ? task.payload : {};
  const value = payload.exteriorRectification;
  if (value === undefined) {
    if (payload.fromNodeCode === 'COLOR_CONSISTENCY_REVIEW' && ['REJECT', 'RETURN'].includes(String(payload.triggerAction))) throw new ConflictException('外饰整改状态缺失，请核对本轮任务。');
    return null;
  }
  const invalid = () => new ConflictException('外饰整改记录无效，请核对本轮任务。');
  if (!object(value) || typeof value.sourceTaskId !== 'string' || !ID.test(value.sourceTaskId)) throw invalid();
  if (value.status === 'PENDING' && Object.keys(value).length === 2) return value as ExteriorRectification;
  if (value.status !== 'COMPLETED' || Object.keys(value).length !== 10 || !text(value.supplierName, 200) || /[\r\n]/.test(value.supplierName) || !date(value.completedOn) || !text(value.summary, 4000) || !timestamp(value.recordedAt) || !['recordedById', 'progressUpdateId', 'operationId'].every(key => typeof value[key] === 'string' && ID.test(value[key])) || typeof value.requestHash !== 'string' || !/^[a-f\d]{64}$/.test(value.requestHash)) throw invalid();
  return value as ExteriorRectification;
}
export function parseExteriorRectificationCommand(raw: unknown): ExteriorRectificationCommand {
  const keys = ['taskId', 'expectedTaskVersion', 'operationId', 'supplierName', 'completedOn', 'summary'];
  if (!object(raw) || Object.keys(raw).length !== keys.length || Object.keys(raw).some(key => !keys.includes(key)) || typeof raw.taskId !== 'string' || !ID.test(raw.taskId) || typeof raw.operationId !== 'string' || !ID.test(raw.operationId) || !timestamp(raw.expectedTaskVersion) || !text(raw.supplierName, 200) || /[\r\n]/.test(raw.supplierName) || !date(raw.completedOn) || !text(raw.summary, 4000)) throw new BadRequestException('请填写明确外饰件厂家、实际整改完成日期、整改说明及当前任务版本。');
  return { taskId: raw.taskId, expectedTaskVersion: raw.expectedTaskVersion, operationId: raw.operationId, supplierName: raw.supplierName.trim(), completedOn: raw.completedOn, summary: raw.summary.trim() };
}
export function requireExteriorRectificationComplete(task: { payload?: Prisma.JsonValue | null }) {
  if (readExteriorRectification(task)?.status === 'PENDING') throw new BadRequestException('请先登记外饰件厂家整改完成，再进行本轮整车复审。');
}
