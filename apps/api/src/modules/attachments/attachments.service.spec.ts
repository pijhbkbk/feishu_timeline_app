import { AttachmentTargetType, AuditTargetType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { AttachmentsService } from './attachments.service';

const actor: AuthenticatedUser = {
  id: 'user-1',
  username: 'manager',
  name: '项目经理',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['project_manager'],
};

function createAttachmentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'attachment-1',
    projectId: 'project-1',
    entityType: AttachmentTargetType.PROJECT,
    entityId: 'project-1',
    bucket: 'local-dev',
    storageKey: 'project-1/project/project-1/a.txt',
    fileName: 'a.txt',
    originalFileName: 'a.txt',
    fileExtension: '.txt',
    mimeType: 'text/plain',
    fileSize: 128,
    checksum: 'abc',
    fileUrl: '/attachments/attachment-1/content',
    uploadedById: 'user-1',
    uploadedAt: new Date('2026-03-19T10:00:00.000Z'),
    isDeleted: false,
    deletedAt: null,
    deletedById: null,
    uploadedBy: { id: 'user-1', name: '项目经理' },
    deletedBy: null,
    createdAt: new Date('2026-03-19T10:00:00.000Z'),
    updatedAt: new Date('2026-03-19T10:00:00.000Z'),
    ...overrides,
  };
}

function createService() {
  const tx = {
    attachment: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    reviewRecord: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    performanceTest: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    project: {
      findUnique: vi.fn(),
    },
    sample: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    standardBoard: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    developmentReport: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    trialProduction: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (executor: (client: typeof tx) => Promise<unknown>) => executor(tx)),
    project: {
      findUnique: vi.fn(),
    },
    sample: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    standardBoard: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    performanceTest: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    reviewRecord: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    developmentReport: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    trialProduction: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  const configService = {
    get: vi.fn((key: string) => {
      if (key === 'objectStorageBucket') {
        return 'local-dev';
      }

      return undefined;
    }),
  };

  const activityLogsService = {
    createWithExecutor: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
  };

  const objectStorageService = {
    upload: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue(Buffer.from('ok')),
    markDeleted: vi.fn().mockResolvedValue(undefined),
  };

  const service = new AttachmentsService(
    prisma as never,
    configService as never,
    activityLogsService as never,
    objectStorageService as never,
  );

  return {
    service,
    prisma,
    tx,
    activityLogsService,
    objectStorageService,
  };
}

describe('AttachmentsService', () => {
  it('creates attachment metadata successfully', async () => {
    const { service, prisma, tx, activityLogsService, objectStorageService } = createService();
    prisma.project.findUnique.mockResolvedValue({
      id: 'project-1',
      code: 'PRJ-001',
      name: '示例项目',
      currentNodeCode: null,
      plannedEndDate: null,
    });
    tx.attachment.create.mockResolvedValue(createAttachmentRecord({ fileUrl: null }));
    tx.attachment.update.mockResolvedValue(createAttachmentRecord());

    const result = await service.createStoredAttachment({
      projectId: 'project-1',
      targetType: AttachmentTargetType.PROJECT,
      targetId: 'project-1',
      uploadedById: actor.id,
      file: {
        originalname: 'a.txt',
        mimetype: 'text/plain',
        size: 128,
        buffer: Buffer.from('demo'),
      },
    });

    expect(objectStorageService.upload).toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targetType: AuditTargetType.ATTACHMENT,
        action: 'ATTACHMENT_UPLOADED',
      }),
    );
    expect(result.projectId).toBe('project-1');
    expect(result.entityType).toBe('PROJECT');
  });

  it('rejects invalid entity binding', async () => {
    const { service, prisma } = createService();
    prisma.project.findUnique.mockResolvedValue({
      id: 'project-1',
      code: 'PRJ-001',
      name: '示例项目',
      currentNodeCode: null,
      plannedEndDate: null,
    });
    prisma.sample.findFirst.mockResolvedValue(null);

    await expect(
      service.uploadAttachment(
        'project-1',
        { entityType: 'SAMPLE', entityId: 'sample-404' },
        {
          originalname: 'a.txt',
          mimetype: 'text/plain',
          size: 128,
          buffer: Buffer.from('demo'),
        },
        actor,
      ),
    ).rejects.toThrow('样板实体不存在。');
  });

  it('marks attachment as logically deleted', async () => {
    const { service, prisma, tx, objectStorageService } = createService();
    const activeAttachment = createAttachmentRecord();
    prisma.$transaction.mockImplementation(async (executor: (client: typeof tx) => Promise<unknown>) => {
      tx.attachment.findFirst.mockResolvedValue(activeAttachment);
      tx.attachment.update.mockResolvedValue(
        createAttachmentRecord({
          isDeleted: true,
          deletedAt: new Date('2026-03-19T11:00:00.000Z'),
          deletedById: 'user-1',
          deletedBy: { id: 'user-1', name: '项目经理' },
        }),
      );
      tx.project.findUnique.mockResolvedValue({
        id: 'project-1',
        code: 'PRJ-001',
        name: '示例项目',
        currentNodeCode: null,
        plannedEndDate: null,
      });
      return executor(tx);
    });

    const result = await service.deleteAttachment('project-1', 'attachment-1', actor);

    expect(objectStorageService.markDeleted).toHaveBeenCalled();
    expect(result.isDeleted).toBe(true);
  });

  it('queries active target attachments with logical delete filter', async () => {
    const { service, tx } = createService();
    tx.attachment.findMany.mockResolvedValue([]);

    await service.listTargetAttachments(tx as never, AttachmentTargetType.SAMPLE, 'sample-1');

    expect(tx.attachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: AttachmentTargetType.SAMPLE,
          entityId: 'sample-1',
          isDeleted: false,
        }),
      }),
    );
  });
});
