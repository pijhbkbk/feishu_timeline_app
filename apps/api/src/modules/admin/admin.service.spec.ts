import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditTargetType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminService, sanitizeAuditValue } from './admin.service';

const row = {
  id: 'audit-1',
  createdAt: new Date('2026-07-18T08:00:00.000Z'),
  actorUserId: 'user-1',
  actorUser: {
    name: '审计管理员',
    userRoles: [{ role: { code: 'admin' } }],
  },
  action: 'REVIEW_REJECTED',
  targetType: AuditTargetType.REVIEW_RECORD,
  targetId: 'review-1',
  projectId: 'project-1',
  project: { name: '星河银项目' },
  nodeCode: 'CAB_REVIEW',
  summary: '评审被退回',
  beforeData: { status: 'PENDING', token: 'before-token' },
  afterData: { status: 'REJECTED', password: 'after-password' },
  metadata: {
    requestId: 'request-1',
    result: 'REJECTED',
    reason: '材料不完整',
    authorization: 'Bearer should-not-leak',
    nested: { appSecret: 'secret-value', cookie: 'cookie-value' },
    ipAddress: '192.168.10.99',
    userAgent: `R25A/${'x'.repeat(300)}`,
  },
};

describe('AdminService audit reads', () => {
  const prisma = {
    auditLog: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };
  let service: AdminService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminService(prisma as never);
  });

  function arrangeList(items = [row], total = items.length) {
    prisma.auditLog.count
      .mockResolvedValueOnce(total)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(1);
    prisma.auditLog.findMany.mockResolvedValueOnce(items);
  }

  it('returns a bounded default administrator list with summary fields only', async () => {
    arrangeList();
    const result = await service.getAuditLogs({});

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'audit-1',
        actorId: 'user-1',
        actorName: '审计管理员',
        actorRole: 'admin',
        entityType: 'REVIEW_RECORD',
        entityId: 'review-1',
        result: 'REJECTED',
        requestId: 'request-1',
      }),
    ]);
    expect(JSON.stringify(result.items)).not.toContain('before-token');
    expect(JSON.stringify(result.items)).not.toContain('after-password');
    expect(JSON.stringify(result.items)).not.toContain('should-not-leak');
  });

  it.each([
    [{ page: 2, pageSize: 25 }, 25, 25],
    [{ page: 3, pageSize: 1 }, 2, 1],
    [{ page: 2, pageSize: 100 }, 100, 100],
  ] as const)('uses database skip/take for page traversal %#', async (query, skip, take) => {
    arrangeList();
    await service.getAuditLogs(query);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip, take }),
    );
  });

  it('uses stable createdAt and id descending order by default', async () => {
    arrangeList();
    await service.getAuditLogs({});
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('uses the same stable key pair for ascending order', async () => {
    arrangeList();
    await service.getAuditLogs({ sort: 'createdAt:asc' });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('applies time, actor, action, entity and project filters in the database query', async () => {
    arrangeList();
    await service.getAuditLogs({
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-18T23:59:59.999Z',
      actorUserId: 'user-1',
      actorName: '管理员',
      action: 'REVIEW_REJECTED',
      entityType: AuditTargetType.REVIEW_RECORD,
      entityId: 'review-1',
      projectId: 'project-1',
    });
    const call = prisma.auditLog.findMany.mock.calls[0]?.[0];
    expect(call.where).toEqual(
      expect.objectContaining({
        actorUserId: 'user-1',
        action: 'REVIEW_REJECTED',
        targetType: AuditTargetType.REVIEW_RECORD,
        targetId: 'review-1',
        projectId: 'project-1',
      }),
    );
    expect(call.where.createdAt).toEqual({
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lte: new Date('2026-07-18T23:59:59.999Z'),
    });
  });

  it('applies result and requestId as parameterized JSON filters', async () => {
    arrangeList();
    await service.getAuditLogs({ result: 'REJECTED', requestId: 'request-1' });
    const where = prisma.auditLog.findMany.mock.calls[0]?.[0].where;
    expect(where.AND).toHaveLength(2);
    expect(JSON.stringify(where)).toContain('requestId');
    expect(JSON.stringify(where)).toContain('REJECTED');
  });

  it('applies keyword through Prisma relation/string filters without raw SQL', async () => {
    arrangeList();
    await service.getAuditLogs({ keyword: "' OR '1'='1" });
    const where = prisma.auditLog.findMany.mock.calls[0]?.[0].where;
    expect(where.AND[0].OR).toHaveLength(6);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('rejects an inverted date range before querying', async () => {
    await expect(
      service.getAuditLogs({
        from: '2026-07-19T00:00:00.000Z',
        to: '2026-07-18T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('calculates page totals and hasNextPage without returning the full data set', async () => {
    arrangeList([row], 23_189);
    const result = await service.getAuditLogs({ page: 1, pageSize: 25 });
    expect(result.totalPages).toBe(928);
    expect(result.hasNextPage).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 }),
    );
  });

  it('uses non-overlapping skip windows for successive pages', async () => {
    arrangeList([row], 2);
    await service.getAuditLogs({ page: 1, pageSize: 1 });
    arrangeList([{ ...row, id: 'audit-2' }], 2);
    await service.getAuditLogs({ page: 2, pageSize: 1 });
    expect(prisma.auditLog.findMany.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ skip: 0, take: 1 }),
    );
    expect(prisma.auditLog.findMany.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ skip: 1, take: 1 }),
    );
  });

  it('returns an independently selected and sanitized detail', async () => {
    prisma.auditLog.findUnique.mockResolvedValueOnce(row);
    const result = await service.getAuditLogDetail('audit-1');
    const serialized = JSON.stringify(result);

    expect(result).toEqual(
      expect.objectContaining({
        id: 'audit-1',
        ipAddress: '192.168.*.*',
        result: 'REJECTED',
        reason: '材料不完整',
      }),
    );
    expect(serialized).not.toContain('before-token');
    expect(serialized).not.toContain('after-password');
    expect(serialized).not.toContain('should-not-leak');
    expect(serialized).not.toContain('secret-value');
    expect(serialized).not.toContain('cookie-value');
    expect(serialized).toContain('[REDACTED]');
    expect(result.userAgent!.length).toBeLessThanOrEqual(257);
  });

  it('returns 404 for an unknown detail id', async () => {
    prisma.auditLog.findUnique.mockResolvedValueOnce(null);
    await expect(service.getAuditLogDetail('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('recursively redacts case-insensitive sensitive keys and bounds deep values', () => {
    const value = sanitizeAuditValue({
      AccessToken: 'one',
      nested: { DATABASE_URL: 'two', session: 'three' },
      array: [{ refresh_token: 'four' }],
      deep: { a: { b: { c: { d: { secret: 'five' } } } } },
    });
    const serialized = JSON.stringify(value);
    expect(serialized).not.toMatch(/one|two|three|four|five/);
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).toContain('[TRUNCATED]');
  });

  it('redacts credential-shaped strings even when the containing key is not sensitive', () => {
    const serialized = JSON.stringify(
      sanitizeAuditValue({ note: 'authorization: Bearer-value redis://user:pass@host/0' }),
    );
    expect(serialized).not.toContain('Bearer-value');
    expect(serialized).not.toContain('user:pass');
  });

  it('keeps a default 25-row response comfortably below the 1 MB contract', async () => {
    arrangeList(Array.from({ length: 25 }, (_, index) => ({ ...row, id: `audit-${index}` })), 23_189);
    const result = await service.getAuditLogs({});
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(1_000_000);
  });
});
