import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttachmentTargetType, Prisma } from '@prisma/client';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { assertApprovedTeamMember } from '../../common/team-membership';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { ProjectAccessService } from '../auth/project-access.service';
import { lockProjectWrite } from '../../common/team-authorization';
import { lockInspectionActivity } from '../inspections/inspection-review-link';

export const SHEET_TARGETS = ['SHEET_COLOR', 'SHEET_PERSON', 'SHEET_INSPECTION', 'SHEET_PRODUCTION'] as const;
export type SheetTarget = typeof SHEET_TARGETS[number];
export function isSheetTarget(value: AttachmentTargetType | string): value is SheetTarget {
  return (SHEET_TARGETS as readonly string[]).includes(value);
}
/** This policy deliberately does not confer a workflow action. The current
 * single-department domain grants admitted members these record reads/writes. */
export async function authorizeSheetAttachmentTarget(db: Prisma.TransactionClient | PrismaService, type: AttachmentTargetType, id: string, actor: AuthenticatedUser, access: ProjectAccessService, write = false) {
  assertApprovedTeamMember(actor);
  if (!isSheetTarget(type) || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new BadRequestException('表格附件归属不合法。');
  const record = type === 'SHEET_COLOR' ? await db.color.findUnique({ where: { id }, select: { id: true } })
    : type === 'SHEET_PERSON' ? await db.personProfile.findUnique({ where: { id }, select: { id: true } })
      : type === 'SHEET_PRODUCTION' ? await db.colorProductionFact.findUnique({ where: { id }, select: { id: true } })
        : await db.inspectionOccurrence.findUnique({ where: { id }, select: { id: true, activityId: true } });
  if (!record) throw new NotFoundException('图片所属的业务记录不存在。');
  if (type === 'SHEET_INSPECTION' && 'activityId' in record && typeof record.activityId === 'string') {
    const before = await db.inspectionActivity.findUniqueOrThrow({ where: { id: record.activityId }, select: { projectId: true } });
    if (before.projectId) {
      await access.assertProjectAccess(db, before.projectId, actor, write ? 'attachment.manage' : 'project.read');
      if (write) await lockProjectWrite(db as Prisma.TransactionClient, before.projectId);
    }
    if (write) {
      const activity = await lockInspectionActivity(db as Prisma.TransactionClient, record.activityId);
      if (activity.projectId !== before.projectId) throw new ConflictException('检验活动关联已变化，请刷新后重试。');
    }
  }
  return record;
}

/** The shared team authorization fence is acquired before this entity lock.
 * Serializes image count limits, scan finalization and layout/delete commands.
 * Does not replace domain lifecycle locks for an eventual record deletion. */
export async function lockSheetAttachmentTarget(tx: Prisma.TransactionClient, type: AttachmentTargetType, id: string) {
  if (!isSheetTarget(type)) throw new ConflictException('只能操作表格附件。');
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'sheet-image-target'}), hashtext(${`${type}:${id}`}))`);
}
