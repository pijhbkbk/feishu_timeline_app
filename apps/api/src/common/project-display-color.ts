import { ConflictException } from '@nestjs/common';
import { AttachmentScanStatus, type Prisma } from '@prisma/client';

/** Small, shared projection; legacy collections always use take: 1. */
export const PROJECT_DISPLAY_COLOR_SELECT = {
  id: true,
  name: true,
  code: true,
  isPrimary: true,
  status: true,
  productionBaseId: true,
  productionBase: { select: { id: true, name: true } },
  numberingTaskId: true,
  numberedById: true,
  numberedAt: true,
  numberingAttachmentId: true,
  numberingAttachment: { select: { scanStatus: true, isDeleted: true } },
} as const satisfies Prisma.ColorSelect;

type ProjectColorIdentity<T> = {
  primaryColorId?: string | null;
  primaryColor?: T | null;
  colors?: readonly T[] | undefined;
};

/** Explicit links are authoritative. Never substitute an origin-project color. */
export function resolveProjectDisplayColor<T extends { id: string }>(
  project: ProjectColorIdentity<T> | null | undefined,
): T | null {
  if (!project) return null;
  if (project.primaryColorId) {
    return project.primaryColor?.id === project.primaryColorId ? project.primaryColor : null;
  }
  return project.colors?.[0] ?? null;
}

export function projectColorSearchWhere(keyword: string): Prisma.ProjectWhereInput {
  const match: Prisma.ColorWhereInput = {
    OR: [
      { name: { contains: keyword, mode: 'insensitive' } },
      {
        code: { contains: keyword, mode: 'insensitive' },
        numberingTaskId: { not: null },
        numberedById: { not: null },
        numberedAt: { not: null },
        numberingAttachmentId: { not: null },
        numberingAttachment: { is: { isDeleted: false, scanStatus: AttachmentScanStatus.CLEAN } },
      },
    ],
  };
  return {
    OR: [
      { primaryColor: { is: match } },
      { primaryColorId: null, colors: { some: match } },
    ],
  };
}

/** Generic project edits may rename the project, but never a shared register identity. */
export function assertLinkedProjectColorNameUnchanged<T extends { id: string; name: string }>(
  project: ProjectColorIdentity<T>,
  requestedName: string | null | undefined,
) {
  if (!project.primaryColorId || requestedName === undefined) return;
  const color = resolveProjectDisplayColor(project);
  if (!color || requestedName?.trim() !== color.name) {
    throw new ConflictException('项目已关联颜色清单；项目名称可独立修改，颜色名称请在清单中核对，不能在项目通用信息中改写。');
  }
}
