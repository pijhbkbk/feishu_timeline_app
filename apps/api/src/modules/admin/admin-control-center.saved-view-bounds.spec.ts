import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { AdminControlCenterService } from './admin-control-center.service';

const actor: AuthenticatedUser = {
  id: 'admin-1',
  username: 'admin',
  name: 'Admin',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['admin'],
  permissionCodes: ['system.manage'],
};

function createHarness() {
  const adminSavedView = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ id: 'view-1', version: 1 }),
  };
  const tx = {
    adminSavedView,
    $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const service = new AdminControlCenterService(
    prisma as never,
    {} as never,
    {} as never,
  );

  return { adminSavedView, prisma, service };
}

describe('AdminControlCenterService saved-view resource bounds', () => {
  it('rejects oversized config before any database call', async () => {
    const { adminSavedView, prisma, service } = createHarness();
    const oversizedConfig = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [
        `filter${index}`,
        'x'.repeat(2_000),
      ]),
    );

    await expect(
      service.saveView(
        {
          pageKey: 'projects',
          name: 'large',
          config: oversizedConfig,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(adminSavedView.findUnique).not.toHaveBeenCalled();
    expect(adminSavedView.upsert).not.toHaveBeenCalled();
  });

  it('rejects prototype-affecting keys before any database call', async () => {
    const { prisma, service } = createHarness();
    const config = JSON.parse(
      '{"__proto__":{"polluted":true}}',
    ) as Record<string, unknown>;

    await expect(
      service.saveView(
        { pageKey: 'projects', name: 'unsafe', config },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('caps the number of persisted views per actor', async () => {
    const { adminSavedView, service } = createHarness();
    adminSavedView.findMany.mockResolvedValue(
      Array.from({ length: 100 }, (_, index) => ({ id: `view-${index}` })),
    );

    await expect(
      service.saveView(
        {
          pageKey: 'projects',
          name: 'one-too-many',
          config: { status: 'ACTIVE' },
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(adminSavedView.findMany).toHaveBeenCalledWith({
      where: { userId: actor.id },
      select: { id: true },
      take: 100,
    });
    expect(adminSavedView.create).not.toHaveBeenCalled();
    expect(adminSavedView.upsert).not.toHaveBeenCalled();
  });

  it('caps the number of persisted views for one page', async () => {
    const { adminSavedView, service } = createHarness();
    adminSavedView.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 99 }, (_, index) => ({ id: `view-${index}` })),
      )
      .mockResolvedValueOnce(
        Array.from({ length: 20 }, (_, index) => ({ id: `page-view-${index}` })),
      );

    await expect(
      service.saveView(
        {
          pageKey: 'projects',
          name: 'page-overflow',
          config: { status: 'ACTIVE' },
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(adminSavedView.findMany).toHaveBeenNthCalledWith(2, {
      where: { userId: actor.id, pageKey: 'projects' },
      select: { id: true },
      take: 20,
    });
    expect(adminSavedView.create).not.toHaveBeenCalled();
  });

  it('uses a version CAS for existing views and returns the claimed row', async () => {
    const { adminSavedView, service } = createHarness();
    const existing = {
      id: 'view-1',
      userId: actor.id,
      pageKey: 'projects',
      name: 'mine',
      config: { status: 'DRAFT' },
      version: 3,
    };
    const updated = { ...existing, config: { status: 'ACTIVE' }, version: 4 };
    adminSavedView.findUnique
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    adminSavedView.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.saveView(
        {
          pageKey: 'projects',
          name: 'mine',
          config: { status: 'ACTIVE' },
          expectedVersion: 3,
        },
        actor,
      ),
    ).resolves.toEqual(updated);

    expect(adminSavedView.updateMany).toHaveBeenCalledWith({
      where: { id: 'view-1', version: 3 },
      data: {
        config: { status: 'ACTIVE' },
        configBytes: 19,
        version: { increment: 1 },
      },
    });
    expect(adminSavedView.findUnique.mock.calls[0]?.[0]).toEqual({
      where: {
        userId_pageKey_name: {
          userId: actor.id,
          pageKey: 'projects',
          name: 'mine',
        },
      },
      select: { id: true, version: true },
    });
    expect(adminSavedView.upsert).not.toHaveBeenCalled();
  });

  it('requires the displayed version before updating an existing view', async () => {
    const { adminSavedView, service } = createHarness();
    adminSavedView.findUnique.mockResolvedValue({
      id: 'view-1',
      userId: actor.id,
      pageKey: 'projects',
      name: 'mine',
      config: { status: 'DRAFT' },
      version: 3,
    });

    await expect(
      service.saveView(
        {
          pageKey: 'projects',
          name: 'mine',
          config: { status: 'ACTIVE' },
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(adminSavedView.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a lost version claim without returning stale data', async () => {
    const { adminSavedView, service } = createHarness();
    adminSavedView.findUnique.mockResolvedValue({
      id: 'view-1',
      userId: actor.id,
      pageKey: 'projects',
      name: 'mine',
      config: { status: 'DRAFT' },
      version: 3,
    });
    adminSavedView.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.saveView(
        {
          pageKey: 'projects',
          name: 'mine',
          config: { status: 'ACTIVE' },
          expectedVersion: 3,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(adminSavedView.findUnique).toHaveBeenCalledTimes(1);
  });

  it('persists trusted config bytes for every newly admitted view', async () => {
    const { adminSavedView, service } = createHarness();
    const created = {
      id: 'view-new',
      userId: actor.id,
      pageKey: 'projects',
      name: 'mine',
      config: { status: 'ACTIVE' },
      version: 1,
    };
    adminSavedView.create.mockResolvedValue(created);

    await expect(
      service.saveView(
        {
          pageKey: 'projects',
          name: 'mine',
          config: { status: 'ACTIVE' },
        },
        actor,
      ),
    ).resolves.toEqual(created);

    expect(adminSavedView.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ configBytes: 19 }),
      }),
    );
  });

  it('quarantines legacy rows before PostgreSQL reads their JSON payload', async () => {
    const { adminSavedView, prisma, service } = createHarness();

    await service.getSavedViews('projects', actor);

    expect(adminSavedView.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const query = prisma.$queryRaw.mock.calls[0]?.[0] as {
      strings: string[];
      values: unknown[];
    };
    const sql = query.strings.join('?');
    expect(sql).toContain('WITH candidate_views AS MATERIALIZED');
    expect(sql).toContain('saved_view."configBytes" IS NOT NULL');
    expect(sql).toContain('LIMIT ?');
    expect(sql).not.toContain('saved_view."config"::text');
    expect(sql).not.toContain('octet_length');
    expect(query.values).toEqual([actor.id, 'projects', 20]);
  });
});
