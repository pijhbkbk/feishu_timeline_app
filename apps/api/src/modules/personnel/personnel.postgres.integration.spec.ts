import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UsersService } from '../users/users.service';
import { NATIVE_ADMIN_LOCK } from '../auth/native-auth.rules';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BUSINESS_ROLES, NODE_BUSINESS_ROLES } from './personnel.constants';
import { PersonnelChangeDto } from './personnel.dto';
import { PersonnelService } from './personnel.service';

const url = process.env.R28_TEST_DATABASE_URL;
const run = randomUUID().slice(0, 8);

describe.skipIf(!url).sequential('R28 personnel real PostgreSQL', () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const service = new PersonnelService(db as never);
  const users = new UsersService(db as never);
  let admin: AuthenticatedUser;
  let memberId: string;
  const version = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
  const input = async (id: string, codes: string[]) => ({ expectedVersion: await version(id), requestId: randomUUID(), reason: '合成人员角色验证', roleCodes: codes });
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55449' || !/^\/r28_[a-z_]+$/.test(parsed.pathname)) throw new Error('R28 requires its isolated loopback test database.');
    for (const role of [...BUSINESS_ROLES, { code: 'admin', name: '系统管理员' }, { code: 'auditor', name: '审计人员' }]) {
      await db.role.upsert({ where: { code: role.code }, update: {}, create: { code: role.code, name: role.name } });
    }
    const owner = await db.user.create({ data: { username: `r28-admin-${run}`, name: '合成管理员', isSystemAdmin: true } });
    admin = (await users.getAuthenticatedUser(owner.id, 'local'))!;
    memberId = (await db.user.create({ data: { username: `r28-member-${run}`, name: '合成人员', onboardingCompleted: false } })).id;
  });
  afterAll(async () => { await db.$disconnect(); });

  it('covers every fixed node once and exposes exactly seven business roles', () => {
    expect(Object.keys(NODE_BUSINESS_ROLES)).toHaveLength(18);
    expect(BUSINESS_ROLES).toHaveLength(7);
    expect(new Set(Object.values(NODE_BUSINESS_ROLES)).size).toBe(7);
  });
  it('rejects an unassigned user and an ordinary admin-role holder', async () => {
    const member = (await users.getAuthenticatedUser(memberId, 'local'))!;
    await expect(service.list(member, {})).rejects.toThrow();
    await expect(service.change(member, memberId, await input(memberId, ['reviewer']))).rejects.toThrow();
    await expect(service.list({ ...member, roleCodes: ['admin'], permissionCodes: ['system.manage'] }, {})).rejects.toThrow();
    expect(await db.userRole.count({ where: { userId: memberId } })).toBe(0);
  });
  it('rejects privilege and identity injection at the real DTO boundary', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
    const valid = await input(memberId, ['purchaser']);
    for (const body of [{ ...valid, roleCodes: null }, { ...valid, status: null }, { ...valid, isSystemAdmin: true }, { ...valid, username: 'other' }, { ...valid, roleCodes: ['admin'] }, { ...valid, roleCodes: ['viewer'] }, { ...valid, roleCodes: Array(8).fill('reviewer') }, { ...valid, roleCodes: ['reviewer', 'reviewer'] }]) {
      await expect(pipe.transform(body, { type: 'body', metatype: PersonnelChangeDto })).rejects.toThrow();
    }
    await expect(pipe.transform(valid, { type: 'body', metatype: PersonnelChangeDto })).resolves.toMatchObject(valid);
  });
  it('one save grants roles with no duplicate person, preserves non-business roles and audit authors', async () => {
    const auditor = await db.role.findUniqueOrThrow({ where: { code: 'auditor' } });
    await db.userRole.create({ data: { userId: memberId, roleId: auditor.id } });
    const historical = await db.auditLog.create({ data: { actorUserId: memberId, targetType: 'USER', targetId: memberId, action: 'R28_SYNTHETIC_HISTORY' } });
    const original = await db.user.findUniqueOrThrow({ where: { id: memberId } });
    const result = await service.change(admin, memberId, await input(memberId, ['purchaser', 'reviewer']));
    expect(result).toMatchObject({ userId: memberId, changed: true });
    const member = (await users.getAuthenticatedUser(memberId, 'local'))!;
    expect(member.roleCodes.sort()).toEqual(['auditor', 'purchaser', 'reviewer']);
    expect(member.authVersion).toBe(original.authVersion + 1);
    expect(await db.user.count({ where: { username: original.username } })).toBe(1);
    expect((await db.auditLog.findUniqueOrThrow({ where: { id: historical.id } })).actorUserId).toBe(memberId);
  });
  it('serializes concurrent replay into one mutation and one audit', async () => {
    const body = await input(memberId, ['purchaser']);
    const before = await db.auditLog.count({ where: { targetId: memberId, action: 'PERSONNEL_CHANGED' } });
    const results = await Promise.all([service.change(admin, memberId, body), service.change(admin, memberId, body)]);
    expect(results.filter(result => result.replayed)).toHaveLength(1);
    expect(await db.auditLog.count({ where: { targetId: memberId, action: 'PERSONNEL_CHANGED' } })).toBe(before + 1);
    await expect(service.change(admin, memberId, { ...body, roleCodes: ['reviewer'] })).rejects.toThrow();
  });
  it('rejects stale writes and disabled roles without removing existing grants', async () => {
    const body = await input(memberId, ['reviewer']);
    await db.user.update({ where: { id: memberId }, data: { updatedAt: new Date(Date.now() + 1000) } });
    await expect(service.change(admin, memberId, body)).rejects.toThrow();
    await db.role.update({ where: { code: 'production_operator' }, data: { status: 'INACTIVE' } });
    try { await expect(service.change(admin, memberId, await input(memberId, ['production_operator']))).rejects.toThrow(); }
    finally { await db.role.update({ where: { code: 'production_operator' }, data: { status: 'ACTIVE' } }); }
    expect((await users.getAuthenticatedUser(memberId, 'local'))?.roleCodes).toContain('purchaser');
  });
  it('removes only business roles and prevents self-disable', async () => {
    await service.change(admin, memberId, await input(memberId, []));
    expect((await users.getAuthenticatedUser(memberId, 'local'))?.roleCodes).toEqual(['auditor']);
    expect((await service.list(admin, { filter: 'unassigned', q: `r28-member-${run}` })).items.map(item => item.id)).toContain(memberId);
    await expect(service.change(admin, admin.id, { expectedVersion: await version(admin.id), requestId: randomUUID(), status: 'INACTIVE', reason: '合成自停用负向' })).rejects.toThrow();
  });
  it('returns bounded search results without credentials or historical identity merging', async () => {
    await db.user.createMany({ data: Array.from({ length: 34 }, (_, index) => ({ username: `r28-page-${run}-${index}`, name: `合成分页${run}` })) });
    const page = await service.list(admin, { q: `合成分页${run}` });
    expect(page.items).toHaveLength(30); expect(page.nextCursor).toBeTruthy();
    const next = await service.list(admin, { q: `合成分页${run}`, after: page.nextCursor! });
    expect(next.items).toHaveLength(4); expect(next.nextCursor).toBeNull();
    expect(new Set([...page.items, ...next.items].map(item => item.id)).size).toBe(34);
    expect(JSON.stringify(page)).not.toMatch(/passwordHash|resetToken|feishuOpenId|authVersion/);
    expect((await service.list(admin, { q: `not-found-${run}` })).items).toEqual([]);
  });
  it('rechecks a previously authenticated administrator after a serialized revocation', async () => {
    const body = await input(memberId, ['reviewer']);
    let release!: () => void;
    let acquired!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { acquired = resolve; });
    const revoke = db.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${NATIVE_ADMIN_LOCK}))`);
      acquired(); await gate;
      await tx.user.update({ where: { id: admin.id }, data: { isSystemAdmin: false, authVersion: { increment: 1 } } });
    });
    await ready;
    const pending = service.change(admin, memberId, body);
    const rejected = expect(pending).rejects.toThrow('管理员授权已变化');
    release(); await revoke; await rejected;
    expect(await db.adminCommandRequest.count({ where: { idempotencyKey: `personnel:${admin.id}:${body.requestId}` } })).toBe(0);
    expect((await users.getAuthenticatedUser(memberId, 'local'))?.roleCodes).toEqual(['auditor']);
  });
});
