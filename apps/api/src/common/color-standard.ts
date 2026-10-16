import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const TECHNICAL_FIELDS = new Set(['measurements', 'conditions', 'originalControlLimits', 'measurementDate', 'issueDate', 'expiryDate', 'manufacturer', 'paintType', 'changeSummary']);
const MEASUREMENT_FIELDS = new Set(['angle', 'l', 'a', 'b', 'originalControlLimits']);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(`${label}格式不正确。`);
  return value as Record<string, unknown>;
}

function originalText(value: unknown, label: string, limit = 1000): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > limit || value.includes('\0')) throw new BadRequestException(`${label}须为不超过 ${limit} 字的原始文本或空值。`);
  return value;
}

function measurementScalar(value: unknown, label: string): number | string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return originalText(value, label, 80);
}

/** Preserve original values, dates and empty semantics; never infer zero, limits or ownership from prose. */
export function parseColorTechnicalData(raw: unknown): Prisma.InputJsonObject {
  const input = record(raw, '测量数据');
  if (Object.keys(input).some(key => !TECHNICAL_FIELDS.has(key))) throw new BadRequestException('测量数据包含不支持的字段。');
  if (!Array.isArray(input.measurements) || input.measurements.length > 32) throw new BadRequestException('测量角度须为最多 32 行的列表，可为空。');
  const measurements = input.measurements.map((value, index) => {
    const row = record(value, `第 ${index + 1} 行测量`);
    if (Object.keys(row).some(key => !MEASUREMENT_FIELDS.has(key))) throw new BadRequestException('测量行包含不支持的字段。');
    return {
      angle: measurementScalar(row.angle, '测量角度'),
      l: measurementScalar(row.l, 'L'), a: measurementScalar(row.a, 'a'), b: measurementScalar(row.b, 'b'),
      originalControlLimits: originalText(row.originalControlLimits, '角度原控制限'),
    };
  });
  const result = { measurements, conditions: originalText(input.conditions, '测量条件'),
    originalControlLimits: originalText(input.originalControlLimits, '原控制限', 4000),
    measurementDate: originalText(input.measurementDate, '测量日期', 100),
    issueDate: originalText(input.issueDate, '发出日期', 100), expiryDate: originalText(input.expiryDate, '失效日期', 100),
    manufacturer: originalText(input.manufacturer, '制作单位', 200), paintType: originalText(input.paintType, '漆种', 200),
    changeSummary: originalText(input.changeSummary, '更正说明', 1000) };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 16 * 1024) throw new BadRequestException('测量数据超过 16 KiB。');
  return result;
}

export function parseRegisterMonth(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value.startsWith('0000')) throw new BadRequestException('入清单月份须为 YYYY-MM 或空值。');
  return value;
}

export async function lockRegisterColor(tx: Prisma.TransactionClient, colorId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM colors WHERE id = ${colorId} FOR UPDATE`);
  const color = await tx.color.findUnique({ where: { id: colorId } });
  if (!color) throw new NotFoundException('颜色记录不存在。');
  return color;
}

/** Call only inside an authenticated write transaction. Append immutable standards; caller adds its domain/audit records. */
export async function appendColorStandard(tx: Prisma.TransactionClient, input: {
  colorId: string; expectedRevision: number; actorId: string; boardCode: string | null;
  technicalData: Prisma.InputJsonObject; registerMonth?: string | null | undefined;
  sourceReference?: Prisma.InputJsonObject;
}) {
  const color = await lockRegisterColor(tx, input.colorId);
  if (color.registerRevision !== input.expectedRevision) throw new ConflictException({ code: 'COLOR_REGISTER_CONFLICT', message: '颜色标准已更新，请刷新后核对。' });
  if (!color.productionBaseId) throw new BadRequestException('请先明确颜色的生产基地，再加入颜色清单。');
  const maximum = await tx.colorVersion.aggregate({ where: { colorId: color.id }, _max: { versionNo: true } });
  const nextVersion = (maximum._max.versionNo ?? 0) + 1;
  if (nextVersion > 2_147_483_647) throw new ConflictException('颜色标准版本数量超出上限。');
  const publishedAt = new Date();
  const version = await tx.colorVersion.create({ data: { colorId: color.id, versionNo: nextVersion,
    boardCode: input.boardCode, technicalData: input.technicalData,
    status: 'DRAFT', createdById: input.actorId, publishedAt,
    changeSummary: typeof input.technicalData.changeSummary === 'string' ? input.technicalData.changeSummary : null,
    ...(input.sourceReference ? { sourceReference: input.sourceReference } : {}),
  } });
  const updatedColor = await tx.color.update({ where: { id: color.id }, data: {
    registerStatus: 'LISTED', registerRevision: { increment: 1 }, registeredAt: color.registeredAt ?? publishedAt,
    manufacturer: typeof input.technicalData.manufacturer === 'string' ? input.technicalData.manufacturer : null,
    paintType: typeof input.technicalData.paintType === 'string' ? input.technicalData.paintType : null,
    ...(input.registerMonth !== undefined ? { registerMonth: input.registerMonth } : {}),
  } });
  return { color: updatedColor, previousColor: color, version };
}
