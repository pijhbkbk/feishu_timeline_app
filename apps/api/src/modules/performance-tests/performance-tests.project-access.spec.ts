import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PerformanceTestsService } from './performance-tests.service';

describe('PerformanceTestsService project-scoped attachment access', () => {
  it('rejects an allowed-role non-member before performance lookup or attachment scanning/storage', async () => {
    const prisma = {
      project: { findUnique: vi.fn() },
      performanceTest: { findFirst: vi.fn() },
    };
    const attachments = {
      createStoredAttachment: vi.fn(),
    };
    const projectAccess = {
      assertProjectAccessWithDefaultClient: vi
        .fn()
        .mockRejectedValue(new ForbiddenException('当前用户无权访问该项目。')),
    };
    const service = new PerformanceTestsService(
      prisma as never,
      { createWithExecutor: vi.fn() } as never,
      attachments as never,
      {} as never,
      projectAccess as never,
    );

    await expect(
      service.uploadReport(
        'project-out-of-scope',
        'test-out-of-scope',
        {
          originalname: 'report.pdf',
          mimetype: 'application/pdf',
          size: 8,
          buffer: Buffer.from('%PDF-1.7'),
        },
        {
          id: 'quality-user',
          roleCodes: ['quality_engineer'],
          permissionCodes: ['project.read', 'workflow.transition', 'attachment.manage'],
          isSystemAdmin: false,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(projectAccess.assertProjectAccessWithDefaultClient).toHaveBeenCalledWith(
      'project-out-of-scope',
      expect.objectContaining({ id: 'quality-user' }),
      'attachment.manage',
    );
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
    expect(prisma.performanceTest.findFirst).not.toHaveBeenCalled();
    expect(attachments.createStoredAttachment).not.toHaveBeenCalled();
  });

  it('keeps an in-scope member report upload path working after the scope check', async () => {
    const tx = {
      performanceTest: { update: vi.fn().mockResolvedValue({ id: 'test-1' }) },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => Promise<unknown>) => executor(tx)),
    };
    const activityLogs = { createWithExecutor: vi.fn().mockResolvedValue({ id: 'audit-1' }) };
    const attachments = {
      createStoredAttachment: vi.fn().mockResolvedValue({
        id: 'attachment-1',
        fileName: 'report.pdf',
      }),
    };
    const projectAccess = {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
    };
    const service = new PerformanceTestsService(
      prisma as never,
      activityLogs as never,
      attachments as never,
      {} as never,
      projectAccess as never,
    );
    const internals = service as unknown as {
      getPerformanceContext: () => Promise<unknown>;
      getTestOrThrow: () => Promise<unknown>;
      buildDetail: () => Promise<unknown>;
    };
    vi.spyOn(internals, 'getPerformanceContext').mockResolvedValue({
      procurementCompleted: true,
      activeTask: { id: 'task-1' },
      records: [],
      project: { id: 'project-1' },
    });
    vi.spyOn(internals, 'getTestOrThrow').mockResolvedValue({
      id: 'test-1',
      projectId: 'project-1',
      testCode: 'PT-001',
      status: 'DRAFT',
    });
    vi.spyOn(internals, 'buildDetail').mockResolvedValue({ id: 'test-1' });

    await expect(
      service.uploadReport(
        'project-1',
        'test-1',
        {
          originalname: 'report.pdf',
          mimetype: 'application/pdf',
          size: 8,
          buffer: Buffer.from('%PDF-1.7'),
        },
        {
          id: 'quality-member',
          roleCodes: ['quality_engineer'],
          permissionCodes: ['project.read', 'workflow.transition', 'attachment.manage'],
          isSystemAdmin: false,
        } as never,
      ),
    ).resolves.toEqual({ id: 'test-1' });
    expect(attachments.createStoredAttachment).toHaveBeenCalledOnce();
    expect(tx.performanceTest.update).toHaveBeenCalledWith({
      where: { id: 'test-1' },
      data: { reportAttachmentId: 'attachment-1' },
    });
  });
});
