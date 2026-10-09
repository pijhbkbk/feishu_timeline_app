import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectColorLinkService, parseColorLinkInput } from './project-color-link.service';

const actor = { id: 'member-a', username: 'member-a', name: 'A', email: null, departmentId: null, departmentName: null, authSource: 'local', isSystemAdmin: false, teamAccessApproved: true, authVersion: 1, roleCodes: [], permissionCodes: [] } as AuthenticatedUser;
const input = { existingColorId: 'color-a', productionBaseId: 'base-a', expectedColorRevision: 2, expectedProjectUpdatedAt: '2026-10-01T00:00:00.000Z', idempotencyKey: 'link-a' };
function harness() {
  const project = { id: 'project-a', primaryColorId: null as string | null, updatedAt: new Date(input.expectedProjectUpdatedAt) };
  const color = { id: 'color-a', productionBaseId: 'base-a', registerRevision: 2, projectId: null };
  const commands = new Map<string, Record<string, unknown>>();
  const tx = {
    $executeRaw: vi.fn(), $queryRaw: vi.fn(),
    user: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE', authVersion: 1, isSystemAdmin: false, teamAccessApproved: true, userRoles: [] }) },
    project: { findUnique: vi.fn().mockImplementation(async () => ({ ...project })), update: vi.fn().mockImplementation(async ({ data }) => Object.assign(project, data)) },
    color: { findUnique: vi.fn().mockImplementation(async () => ({ ...color })), findFirst: vi.fn().mockResolvedValue(null) },
    standardBoard: { findFirst: vi.fn().mockResolvedValue(null) }, reviewRecord: { findFirst: vi.fn().mockResolvedValue(null) }, productionPlan: { findFirst: vi.fn().mockResolvedValue(null) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-a' }) },
    r26CommandRequest: { findUnique: vi.fn().mockImplementation(async ({ where }) => commands.get(where.idempotencyKey) ?? null),
      create: vi.fn().mockImplementation(async ({ data }) => { commands.set(data.idempotencyKey, data); return data; }) },
  };
  const prisma = { ...tx, $transaction: vi.fn().mockImplementation(async (operation) => operation(tx)) };
  return { tx, project, color, service: new ProjectColorLinkService(prisma as never) };
}

describe('explicit existing-project color association', () => {
  it('links exact color/base without changing authors, project name, legacy ownership or color data', async () => {
    const { service, tx } = harness();
    expect(await service.link('project-a', input, actor)).toMatchObject({ colorId: 'color-a', productionBaseId: 'base-a', idempotentReplay: false });
    const data = tx.project.update.mock.calls[0]![0].data;
    expect(Object.keys(data).sort()).toEqual(['primaryColorId', 'updatedAt']);
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'PROJECT_COLOR_LINKED', actorUserId: actor.id, beforeData: { primaryColorId: null } }) }));
    expect(tx.color).not.toHaveProperty('update');
  });
  it('replays the original command once, even though project version has advanced', async () => {
    const { service, tx } = harness();
    const first = await service.link('project-a', input, actor);
    expect(await service.link('project-a', input, actor)).toMatchObject({ ...first, idempotentReplay: true });
    expect(tx.project.update).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it('rejects reuse of a command for a different base or project', async () => {
    const { service } = harness();
    await service.link('project-a', input, actor);
    await expect(service.link('project-a', { ...input, productionBaseId: 'base-b' }, actor)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.link('project-b', input, actor)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects unapproved accounts and freshly revoked access before mutation', async () => {
    const { service, tx } = harness();
    await expect(service.link('project-a', input, { ...actor, teamAccessApproved: false })).rejects.toBeInstanceOf(ForbiddenException);
    tx.user.findUnique.mockResolvedValueOnce({ status: 'ACTIVE', authVersion: 1, isSystemAdmin: false, teamAccessApproved: false, userRoles: [] });
    await expect(service.link('project-a', input, actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.project.update).not.toHaveBeenCalled();
  });
  it('rejects a color from another base', async () => {
    const { service, tx } = harness();
    await expect(service.link('project-a', { ...input, productionBaseId: 'base-b' }, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.project.update).not.toHaveBeenCalled();
  });
  it('rejects stale project or color revisions without mutation', async () => {
    const { service, tx } = harness();
    await expect(service.link('project-a', { ...input, expectedColorRevision: 1 }, actor)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.link('project-a', { ...input, expectedProjectUpdatedAt: '2026-09-30T00:00:00.000Z' }, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.project.update).not.toHaveBeenCalled();
  });
  it('never switches an existing link even if the target shares a name', async () => {
    const { service, project, tx } = harness(); project.primaryColorId = 'color-other';
    await expect(service.link('project-a', input, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.project.update).not.toHaveBeenCalled();
  });
  it.each(['standardBoard', 'reviewRecord', 'productionPlan', 'color'] as const)('retains %s history without reinterpreting unknown identities', async key => {
    const { service, tx } = harness(); tx[key].findFirst.mockResolvedValueOnce({ id: 'historic' });
    await expect(service.link('project-a', input, actor)).rejects.toThrow('历史');
    expect(tx.project.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('rejects malformed or unexpected caller controlled fields', () => {
    for (const extra of [{ expectedColorRevision: 0 }, { expectedColorRevision: 1.5 }, { expectedProjectUpdatedAt: '2026-10-01' }, { productionBaseId: 'base;other' }, { idempotencyKey: '' }, { colorName: '同名' }, { createdById: 'other' }]) expect(() => parseColorLinkInput({ ...input, ...extra })).toThrow(BadRequestException);
  });
});
