import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { SamplesService } from './samples.service';

describe('SamplesService project-scoped attachment access', () => {
  it('rejects an allowed-role non-member before sample lookup or attachment scanning/storage', async () => {
    const prisma = {
      sample: { findFirst: vi.fn() },
    };
    const attachments = {
      createStoredAttachment: vi.fn(),
    };
    const projectAccess = {
      assertProjectAccessWithDefaultClient: vi
        .fn()
        .mockRejectedValue(new ForbiddenException('当前用户无权访问该项目。')),
    };
    const service = new SamplesService(
      prisma as never,
      { createWithExecutor: vi.fn() } as never,
      attachments as never,
      {} as never,
      projectAccess as never,
    );

    await expect(
      service.uploadSampleImage(
        'project-out-of-scope',
        'sample-out-of-scope',
        {
          originalname: 'sample.png',
          mimetype: 'image/png',
          size: 8,
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
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
    expect(prisma.sample.findFirst).not.toHaveBeenCalled();
    expect(attachments.createStoredAttachment).not.toHaveBeenCalled();
  });

  it('keeps an in-scope member upload path working after the scope check', async () => {
    const prisma = {
      sample: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'sample-1',
          projectId: 'project-1',
          sampleNo: 'S-001',
          versionNo: 1,
          isCurrent: true,
          status: 'DRAFT',
          confirmedAt: null,
        }),
      },
      workflowTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'sample-task-1',
          projectId: 'project-1',
          nodeCode: 'SAMPLE_COLOR_CONFIRMATION',
          isActive: true,
        }),
      },
    };
    const attachments = {
      createStoredAttachment: vi.fn().mockResolvedValue({ id: 'attachment-1' }),
    };
    const projectAccess = {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
    };
    const service = new SamplesService(
      prisma as never,
      { createWithExecutor: vi.fn() } as never,
      attachments as never,
      {} as never,
      projectAccess as never,
    );
    const actor = {
      id: 'quality-member',
      roleCodes: ['quality_engineer'],
      permissionCodes: ['project.read', 'workflow.transition', 'attachment.manage'],
      isSystemAdmin: false,
    } as never;
    const file = {
      originalname: 'sample.png',
      mimetype: 'image/png',
      size: 8,
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    };

    await expect(service.uploadSampleImage('project-1', 'sample-1', file, actor)).resolves.toEqual({
      sampleId: 'sample-1',
      attachment: { id: 'attachment-1' },
    });
    expect(attachments.createStoredAttachment).toHaveBeenCalledOnce();
    expect(attachments.createStoredAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        finalizeDomainAttachment: expect.any(Function),
      }),
    );
  });
});
