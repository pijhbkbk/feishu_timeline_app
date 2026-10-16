import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { assertApprovedTeamMember } from '../../common/team-membership';
import { assertCurrentTeamActor, lockTeamAuthorization, withTeamWrite } from '../../common/team-authorization';
import type { AuthenticatedUser } from '../auth/auth.types';
import { assertProfileFieldAccess, commandHash, identity, object, only, parsePersonCreate, parsePersonDepartment, parsePersonLink, parsePersonSheet, type PersonChanges } from './persons.rules';

const SELECT = {
  id: true, userId: true, name: true, departmentId: true, position: true,
  originalSource: true, email: true, mobile: true, note: true, isActive: true, revision: true,
  department: { select: { id: true, name: true, isActive: true } },
  user: { select: { id: true, username: true, status: true, isSystemAdmin: true, teamAccessApproved: true, updatedAt: true,
    localCredential: { select: { userId: true } },
    userRoles: { where: { role: { status: 'ACTIVE' } }, take: 16, select: { role: { select: { code: true, name: true } } } },
  } },
} satisfies Prisma.PersonProfileSelect;
type Profile = Prisma.PersonProfileGetPayload<{ select: typeof SELECT }>;
const editable = ['name', 'position', 'email', 'mobile', 'note'] as const;
function row(profile: Profile) {
  const { user, ...fields } = profile;
  return { ...fields, personId: profile.id,
    // Profile availability is independent until explicitly linked. Account
    // availability remains authoritative after linking; never copy it back.
    isActive: user ? user.status === 'ACTIVE' : profile.isActive,
    statusSource: user ? 'ACCOUNT' as const : 'PROFILE' as const,
    editableFields: user ? [...editable] : [...editable, 'departmentId', 'isActive'],
    account: user ? { id: user.id, username: user.username, status: user.status,
      version: user.updatedAt.toISOString(), isSystemAdmin: user.isSystemAdmin,
      teamAccessApproved: user.teamAccessApproved, hasCredential: Boolean(user.localCredential),
      roles: user.userRoles.map(item => item.role), managementPath: '/admin/people' } : null,
  };
}
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function stale(id: string, revision: number) {
  return new ConflictException({ code: 'STALE_PERSON_REVISION', personId: id, currentRevision: revision, message: '人员档案已变化，请保留改动并重新核对。' });
}

@Injectable()
export class PersonsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(raw: Record<string, unknown>, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor); const query = object(raw);
    only(query, ['q', 'after', 'take', 'departmentId', 'active', 'linked']);
    const q = query.q === undefined ? '' : query.q;
    if (typeof q !== 'string' || q.length > 100) throw new BadRequestException('搜索内容不合法。');
    const take = query.take === undefined ? 50 : typeof query.take === 'string' && /^[1-9]\d?$/.test(query.take) ? Number(query.take) : 0;
    if (take < 1 || take > 50) throw new BadRequestException('每页 1–50 条。');
    for (const field of ['active', 'linked']) if (query[field] !== undefined && !['true', 'false'].includes(query[field] as string)) throw new BadRequestException('筛选值不合法。');
    const where: Prisma.PersonProfileWhereInput = {
      ...(q.trim() ? { name: { contains: q.trim(), mode: 'insensitive' } } : {}),
      ...(query.after !== undefined ? { id: { gt: identity(query.after) } } : {}),
      ...(query.departmentId !== undefined ? { departmentId: identity(query.departmentId) } : {}),
      ...(query.linked !== undefined ? { userId: query.linked === 'true' ? { not: null } : null } : {}),
      ...(query.active === undefined ? {} : { OR: query.active === 'true'
        ? [{ userId: null, isActive: true }, { user: { is: { status: 'ACTIVE' } } }]
        : [{ userId: null, isActive: false }, { user: { is: { status: { not: 'ACTIVE' } } } }] }),
    };
    const [items, departments] = await Promise.all([
      this.prisma.personProfile.findMany({ where, select: SELECT, orderBy: { id: 'asc' }, take: take + 1 }),
      this.prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { id: 'asc' }, take: 201 }),
    ]);
    return { items: items.slice(0, take).map(row), nextCursor: items.length > take ? items[take - 1]!.id : null,
      facets: { departments: departments.slice(0, 200), departmentsHasMore: departments.length > 200 } };
  }

  async detail(personId: string, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    const profile = await this.prisma.personProfile.findUnique({ where: { id: identity(personId) }, select: SELECT });
    if (!profile) throw new NotFoundException('人员档案不存在。');
    return row(profile);
  }

  async create(raw: unknown, actor: AuthenticatedUser) {
    const input = parsePersonCreate(raw);
    return withTeamWrite(this.prisma, actor, tx => this.command(tx, actor, 'PERSON_PROFILE_CREATED', input, async () => {
      const items = [];
      const sourceKey = (source: NonNullable<typeof input.items[number]['source']>) => commandHash({ fileHash: source.fileHash, sheetName: source.sheetName, rowNumbers: source.rowNumbers });
      const sourceKeys = [...new Set(input.items.flatMap(item => item.source ? [sourceKey(item.source)] : []))].sort();
      for (const key of sourceKeys) await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('person-import-source'), hashtext(${key}))`);
      for (const item of input.items) {
        const importKey = item.source ? sourceKey(item.source) : null;
        if (importKey) {
          const imported = await tx.personProfile.findUnique({ where: { importKey }, select: { id: true } });
          if (imported) throw new ConflictException({ code: 'PERSON_SOURCE_ALREADY_IMPORTED', personId: imported.id, message: '此来源行已导入，请重新读取后核对现有档案，不能重复创建。' });
        }
        await this.department(tx, item.fields.departmentId);
        const profile = await tx.personProfile.create({ data: { ...item.fields, name: item.fields.name!, importKey, ...(item.source ? { originalSource: item.source } : {}) }, select: SELECT });
        await tx.auditLog.create({ data: { actorUserId: actor.id, targetType: 'PERSON_PROFILE', targetId: profile.id,
          action: 'PERSON_PROFILE_CREATED', afterData: json(item.fields), metadata: json({ operationId: input.operationId, clientId: item.clientId, source: item.source }) } });
        items.push({ clientId: item.clientId, ...row(profile) });
      }
      return { items };
    }), { timeout: 15000 });
  }

  async saveSheet(raw: unknown, actor: AuthenticatedUser) {
    const input = parsePersonSheet(raw);
    return withTeamWrite(this.prisma, actor, tx => this.command(tx, actor, 'PERSON_PROFILE_UPDATED', input, async () => {
      const items = [];
      // Parsed stable-ID order is also the row-lock order for overlapping batches.
      for (const item of input.items) {
        const current = await this.lockProfile(tx, item.id);
        if (current.revision !== item.expectedRevision) throw stale(item.id, current.revision);
        // Admins use the separately audited department command too. This endpoint
        // cannot acquire an exclusive auth fence after taking shared/row locks.
        assertProfileFieldAccess(current.userId, item.changes);
        const changed = Object.entries(item.changes).some(([key, value]) => current[key as keyof PersonChanges] !== value);
        if (changed) {
          if (item.changes.departmentId !== current.departmentId) await this.department(tx, item.changes.departmentId);
          const saved = await tx.personProfile.updateMany({ where: { id: item.id, revision: item.expectedRevision }, data: { ...item.changes, revision: { increment: 1 } } });
          if (saved.count !== 1) throw stale(item.id, current.revision);
          await tx.auditLog.create({ data: { actorUserId: actor.id, targetType: 'PERSON_PROFILE', targetId: item.id,
            action: 'PERSON_PROFILE_UPDATED', beforeData: json(Object.fromEntries(Object.keys(item.changes).map(key => [key, current[key as keyof PersonChanges]]))),
            afterData: json(item.changes), metadata: { operationId: input.operationId, previousRevision: item.expectedRevision } } });
        }
        items.push(row(await tx.personProfile.findUniqueOrThrow({ where: { id: item.id }, select: SELECT })));
      }
      return { items };
    }), { timeout: 15000 });
  }

  /** Controlled metadata change. Current M1 role eligibility does not depend on
   * department; this does not change User roles, admission, status or claim epoch.
   * Future department-dependent eligibility must be added here under this fence. */
  async changeDepartment(personId: string, raw: unknown, actor: AuthenticatedUser) {
    const id = identity(personId); const input = parsePersonDepartment(raw);
    return this.administratorWrite(actor, tx => this.command(tx, actor, 'PERSON_DEPARTMENT_CHANGED', { id, ...input }, async () => {
      const current = await this.lockProfile(tx, id);
      if (current.revision !== input.expectedRevision) throw stale(id, current.revision);
      if (input.departmentId !== current.departmentId) {
        await this.department(tx, input.departmentId);
        await tx.personProfile.update({ where: { id }, data: { departmentId: input.departmentId, revision: { increment: 1 } } });
        await tx.auditLog.create({ data: { actorUserId: actor.id, targetType: 'PERSON_PROFILE', targetId: id,
          action: 'PERSON_DEPARTMENT_CHANGED', beforeData: { departmentId: current.departmentId }, afterData: { departmentId: input.departmentId },
          metadata: { reason: input.reason, operationId: input.operationId, qualificationChanged: false } } });
      }
      return { items: [row(await tx.personProfile.findUniqueOrThrow({ where: { id }, select: SELECT }))] };
    }));
  }

  /** Link exact pre-existing IDs only. Does not create credentials or authorize
   * an account. Existing associations are immutable here, not silently merged. */
  async linkAccount(personId: string, raw: unknown, actor: AuthenticatedUser) {
    const id = identity(personId); const input = parsePersonLink(raw);
    return this.administratorWrite(actor, tx => this.command(tx, actor, 'PERSON_ACCOUNT_LINKED', { id, ...input }, async () => {
      // Global exclusive fence precedes the command and both identity locks.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE`);
      const user = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, status: true, updatedAt: true,
        localCredential: { select: { userId: true } }, personProfile: { select: { id: true } } } });
      const profile = await this.lockProfile(tx, id);
      if (profile.revision !== input.expectedRevision) throw stale(id, profile.revision);
      if (!user || user.updatedAt.toISOString() !== input.expectedUserVersion) throw new ConflictException('账号不存在或版本已变化。');
      if (profile.userId || user.personProfile) throw new ConflictException('人员或账号已经关联；不能自动覆盖或按同名合并。');
      if (!profile.isActive || user.status !== 'ACTIVE' || !user.localCredential) throw new ConflictException('请先分别确认启用的人员档案和本地账号。');
      await tx.personProfile.update({ where: { id }, data: { userId: user.id, revision: { increment: 1 } } });
      await tx.auditLog.create({ data: { actorUserId: actor.id, targetType: 'PERSON_PROFILE', targetId: id, action: 'PERSON_ACCOUNT_LINKED',
        beforeData: { userId: null }, afterData: { userId: user.id }, metadata: { reason: input.reason, operationId: input.operationId, grantsChanged: false } } });
      return { items: [row(await tx.personProfile.findUniqueOrThrow({ where: { id }, select: SELECT }))] };
    }));
  }

  private async department(tx: Prisma.TransactionClient, id: string | null | undefined) {
    if (id && !await tx.department.findFirst({ where: { id, isActive: true }, select: { id: true } })) throw new BadRequestException({ code: 'PERSON_DEPARTMENT_INVALID', field: 'departmentId', message: '请选择现有启用部门。' });
  }
  private async lockProfile(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM person_profiles WHERE id = ${id} FOR UPDATE`);
    const profile = await tx.personProfile.findUnique({ where: { id }, select: SELECT });
    if (!profile) throw new NotFoundException({ personId: id, message: '人员档案不存在。' });
    return profile;
  }
  private async administratorWrite<T>(actor: AuthenticatedUser, execute: (tx: Prisma.TransactionClient) => Promise<T>) {
    if (!actor.isSystemAdmin || actor.authSource !== 'local') throw new ForbiddenException('仅系统管理员可以办理账号关联或受控部门变更。');
    return this.prisma.$transaction(async tx => {
      await lockTeamAuthorization(tx, true);
      await assertCurrentTeamActor(tx, actor);
      return execute(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
  }
  private async command<T extends object>(tx: Prisma.TransactionClient, actor: AuthenticatedUser, action: string, input: { operationId: string } & Record<string, unknown>, execute: () => Promise<T>): Promise<T & { replayed: boolean }> {
    const idempotencyKey = `person-profile:${actor.id}:${input.operationId}`;
    const requestHash = commandHash({ action, input });
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'person-profile-command'}), hashtext(${idempotencyKey}))`);
    const previous = await tx.adminCommandRequest.findUnique({ where: { idempotencyKey } });
    if (previous) {
      if (previous.actorUserId !== actor.id || previous.action !== action || previous.requestHash !== requestHash) throw new ConflictException('操作标识已经用于其他内容。');
      return { ...(previous.result as unknown as T), replayed: true };
    }
    const result = await execute();
    await tx.adminCommandRequest.create({ data: { idempotencyKey, actorUserId: actor.id, action, requestHash, result: json(result) } });
    return { ...result, replayed: false };
  }
}
