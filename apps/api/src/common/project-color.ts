import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lockRegisterColor } from './color-standard';

export type ProjectColorInput = { colorMode: 'NEW' | 'EXISTING'; colorName: string; productionBaseId: string | null; existingColorId: string | null };

export function normalizeProjectColorInput(input: Record<string, unknown>, projectName: string): ProjectColorInput {
  const colorMode = input.colorMode ?? 'NEW';
  if (colorMode !== 'NEW' && colorMode !== 'EXISTING') throw new BadRequestException('颜色建立方式不正确。');
  const colorName = input.colorName === undefined ? projectName : input.colorName;
  if (typeof colorName !== 'string' || !colorName.trim() || colorName.length > 200 || colorName.includes('\0')) throw new BadRequestException('颜色名称须为 1–200 字。');
  const parseId = (value: unknown, label: string) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new BadRequestException(`${label}不正确。`);
    return value;
  };
  const productionBaseId = parseId(input.productionBaseId, '生产基地');
  const existingColorId = parseId(input.existingColorId, '已有颜色');
  if (colorMode === 'EXISTING' && (!existingColorId || !productionBaseId)) throw new BadRequestException('关联已有颜色时必须选择准确的颜色与生产基地。');
  if (colorMode === 'NEW' && existingColorId) throw new BadRequestException('新建颜色不能同时指定已有颜色。');
  return { colorMode, colorName: colorName.trim(), productionBaseId, existingColorId };
}

/** A candidate is an identity only: no numbering, register month, production approval or synthetic historic workflow. */
export async function assignProjectColor(tx: Prisma.TransactionClient, projectId: string, input: ProjectColorInput) {
  if (input.productionBaseId && !await tx.productionBase.findUnique({ where: { id: input.productionBaseId }, select: { id: true } })) throw new BadRequestException('生产基地不存在。');
  let color;
  if (input.colorMode === 'EXISTING') {
    color = await lockRegisterColor(tx, input.existingColorId!);
    if (color.productionBaseId !== input.productionBaseId) throw new BadRequestException('选择的颜色不属于该生产基地，请重新核对。');
  } else {
    const hue = await tx.hueStandard.create({ data: { name: input.colorName, basis: '新项目候选颜色；尚未与其他颜色确认共用色相标准。' } });
    color = await tx.color.create({ data: { projectId, name: input.colorName, isPrimary: true, productionBaseId: input.productionBaseId,
      hueStandardId: hue.id, registerStatus: 'CANDIDATE', status: 'DRAFT', code: null, registerMonth: null } });
  }
  await tx.project.update({ where: { id: projectId }, data: { primaryColorId: color.id } });
  return color;
}
