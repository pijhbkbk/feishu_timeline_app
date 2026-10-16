import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { lockRegisterColor } from '../../common/color-standard';
import { assertApprovedTeamMember } from '../../common/team-membership';
import { withProjectWrite } from '../../common/team-authorization';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';

const PROJECT_SELECT = { id: true, primaryColorId: true, updatedAt: true } as const;
const INPUT_FIELDS = new Set(['existingColorId', 'productionBaseId', 'expectedColorRevision', 'expectedProjectUpdatedAt', 'idempotencyKey']);
function id(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new BadRequestException(`${label}不正确。`);
  return value;
}
export function parseColorLinkInput(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('关联请求格式不正确。');
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).some(key => !INPUT_FIELDS.has(key))) throw new BadRequestException('关联请求包含不支持的字段。');
  if (typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.idempotencyKey)) throw new BadRequestException('保存请求编号不正确。');
  const date = input.expectedProjectUpdatedAt;
  if (typeof date !== 'string' || date.length > 30 || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date) throw new BadRequestException('请刷新后核对项目版本。');
  if (!Number.isSafeInteger(input.expectedColorRevision) || Number(input.expectedColorRevision) < 1 || Number(input.expectedColorRevision) > 2_147_483_647) throw new BadRequestException('请重新选择颜色记录。');
  return { existingColorId: id(input.existingColorId, '颜色记录'), productionBaseId: id(input.productionBaseId, '生产基地'),
    expectedColorRevision: input.expectedColorRevision as number, expectedProjectUpdatedAt: date, idempotencyKey: input.idempotencyKey };
}

@Injectable()
export class ProjectColorLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async context(projectId: string, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    id(projectId, '项目');
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: PROJECT_SELECT });
    if (!project) throw new NotFoundException('项目不存在。');
    return { projectId: project.id, primaryColorId: project.primaryColorId, expectedProjectUpdatedAt: project.updatedAt.toISOString() };
  }

  async link(projectId: string, raw: unknown, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    id(projectId, '项目');
    const input = parseColorLinkInput(raw);
    const key = `project-color-link:${actor.id}:${input.idempotencyKey}`;
    const hash = createHash('sha256').update(JSON.stringify({ projectId, ...input })).digest('hex');
    return withProjectWrite(this.prisma, actor, { projectId }, async tx => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'project-color-link-command'}), hashtext(${key}))`);
      const previous = await tx.r26CommandRequest.findUnique({ where: { idempotencyKey: key } });
      if (previous) {
        if (previous.actorUserId !== actor.id || previous.projectId !== projectId || previous.requestHash !== hash) throw new ConflictException('请求编号已用于其他内容。');
        return { ...(previous.result as Prisma.JsonObject), idempotentReplay: true };
      }
      await tx.$queryRaw(Prisma.sql`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`);
      const project = await tx.project.findUnique({ where: { id: projectId }, select: PROJECT_SELECT });
      if (!project) throw new NotFoundException('项目不存在。');
      if (project.primaryColorId) throw new ConflictException('项目已关联颜色，不能覆盖或换绑。');
      if (project.updatedAt.toISOString() !== input.expectedProjectUpdatedAt) throw new ConflictException('项目已更新，请刷新后重新核对。');
      const color = await lockRegisterColor(tx, input.existingColorId);
      if (color.productionBaseId !== input.productionBaseId) throw new BadRequestException('颜色与生产基地不匹配，请重新核对。');
      if (color.registerRevision !== input.expectedColorRevision) throw new ConflictException('颜色资料已更新，请重新选择并核对。');
      // Prior records with unknown standard identity must never be reinterpreted by a new project link.
      const [board, review, production, conflictingColor] = await Promise.all([
        tx.standardBoard.findFirst({ where: { projectId }, select: { id: true } }),
        tx.reviewRecord.findFirst({ where: { projectId }, select: { id: true } }),
        tx.productionPlan.findFirst({ where: { projectId }, select: { id: true } }),
        tx.color.findFirst({ where: { projectId, id: { not: color.id }, OR: [{ code: { not: null } }, { versions: { some: {} } }, { numberingTaskId: { not: null } }] }, select: { id: true } }),
      ]);
      if (board || review || production || conflictingColor) throw new ConflictException('项目已有制板、评审、生产或其他颜色历史，需要逐条核对历史身份后再关联；原记录未修改。');
      const updated = await tx.project.update({ where: { id: projectId }, data: { primaryColorId: color.id,
        updatedAt: new Date(Math.max(Date.now(), project.updatedAt.getTime() + 1)) }, select: PROJECT_SELECT });
      const result = { projectId, colorId: color.id, productionBaseId: color.productionBaseId!, projectUpdatedAt: updated.updatedAt.toISOString(), idempotentReplay: false };
      await tx.auditLog.create({ data: { projectId, actorUserId: actor.id, targetType: 'PROJECT', targetId: projectId,
        action: 'PROJECT_COLOR_LINKED', summary: '核对颜色与生产基地后建立项目关联',
        beforeData: { primaryColorId: null }, afterData: { primaryColorId: color.id, productionBaseId: color.productionBaseId, registerRevision: color.registerRevision },
      } });
      await tx.r26CommandRequest.create({ data: { projectId, actorUserId: actor.id, idempotencyKey: key, action: 'PROJECT_COLOR_LINKED', requestHash: hash, result } });
      return result;
    });
  }
}
