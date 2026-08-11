import {
  AttachmentScanStatus,
  AttachmentTargetType,
  AuditTargetType,
} from '@prisma/client';
import { PassThrough } from 'node:stream';
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
  permissionCodes: ['project.read', 'attachment.manage'],
};

const DOMAIN_GOVERNED_ATTACHMENT_TARGETS = [
  [AttachmentTargetType.SAMPLE, 'sample-1'],
  [AttachmentTargetType.WORKFLOW_TASK, 'task-1'],
  [AttachmentTargetType.REVIEW_RECORD, 'review-1'],
  [AttachmentTargetType.PERFORMANCE_TEST, 'performance-test-1'],
] as const;

function createAttachmentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'attachment-1',
    projectId: 'project-1',
    entityType: AttachmentTargetType.PROJECT,
    entityId: 'project-1',
    bucket: 'local-dev',
    storageKey: 'project-1/project/project-1/a.pdf',
    fileName: 'a.pdf',
    originalFileName: 'a.pdf',
    fileExtension: '.pdf',
    mimeType: 'application/pdf',
    fileSize: 128,
    checksum: 'abc',
    fileUrl: '/attachments/attachment-1/content',
    scanStatus: AttachmentScanStatus.CLEAN,
    scannerEngine: 'test-scanner',
    scannerVersion: '1.0.0',
    scannerSignatureVersion: 'test-signatures',
    scanResultSummary: 'CLEAN',
    scannedAt: new Date('2026-03-19T10:00:01.000Z'),
    materialType: null,
    versionNo: 1,
    replacesAttachmentId: null,
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
    workflowTask: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
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
    workflowTask: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
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
    attachment: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
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
    promote: vi.fn().mockResolvedValue(undefined),
    purge: vi.fn().mockResolvedValue(undefined),
    openDownload: vi.fn().mockImplementation(() => ({
      stream: new PassThrough(),
      contentLength: 128,
    })),
    markDeleted: vi.fn().mockResolvedValue(undefined),
  };

  const malwareScanner = {
    scan: vi.fn().mockResolvedValue({
      verdict: 'CLEAN',
      engine: 'test-scanner',
      engineVersion: '1.0.0',
      signatureVersion: 'test-signatures',
      resultSummary: 'CLEAN',
      scannedAt: new Date('2026-03-19T10:00:01.000Z'),
    }),
  };

  const projectAccessService = {
    assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
  };

  const service = new AttachmentsService(
    prisma as never,
    configService as never,
    activityLogsService as never,
    objectStorageService as never,
    projectAccessService as never,
    malwareScanner as never,
  );

  return {
    service,
    prisma,
    tx,
    activityLogsService,
    objectStorageService,
    malwareScanner,
    projectAccessService,
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
    tx.attachment.create.mockResolvedValue(
      createAttachmentRecord({
        fileUrl: null,
        scanStatus: AttachmentScanStatus.PENDING_SCAN,
        scannerEngine: null,
        scannerVersion: null,
        scannerSignatureVersion: null,
        scanResultSummary: null,
        scannedAt: null,
      }),
    );
    tx.attachment.update.mockResolvedValue(createAttachmentRecord());

    const result = await service.createStoredAttachment({
      projectId: 'project-1',
      targetType: AttachmentTargetType.PROJECT,
      targetId: 'project-1',
      uploadedById: actor.id,
      file: {
        originalname: 'a.pdf',
        mimetype: 'application/pdf',
        size: 128,
        buffer: Buffer.from('%PDF-1.4\n'),
      },
    });

    expect(objectStorageService.upload).toHaveBeenCalled();
    expect(objectStorageService.promote).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceStorageKey: expect.stringContaining('quarantine/'),
      }),
    );
    expect(tx.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scanStatus: AttachmentScanStatus.PENDING_SCAN,
          fileUrl: null,
        }),
      }),
    );
    expect(tx.attachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scanStatus: AttachmentScanStatus.CLEAN,
        }),
      }),
    );
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targetType: AuditTargetType.ATTACHMENT,
        action: 'ATTACHMENT_UPLOADED',
      }),
    );
    expect(result.projectId).toBe('project-1');
    expect(result.entityType).toBe('PROJECT');
    expect(result.scanStatus).toBe(AttachmentScanStatus.CLEAN);
  });

  it('keeps rejected files quarantined and never creates a business reference', async () => {
    const { service, prisma, tx, malwareScanner, objectStorageService } = createService();
    prisma.project.findUnique.mockResolvedValue({
      id: 'project-1',
      code: 'PRJ-001',
      name: '示例项目',
      currentNodeCode: null,
      plannedEndDate: null,
    });
    tx.attachment.create.mockResolvedValue(
      createAttachmentRecord({
        fileUrl: null,
        scanStatus: AttachmentScanStatus.PENDING_SCAN,
        scannerEngine: null,
        scannerVersion: null,
        scannerSignatureVersion: null,
        scanResultSummary: null,
        scannedAt: null,
      }),
    );
    tx.attachment.update.mockResolvedValue(
      createAttachmentRecord({
        fileUrl: null,
        scanStatus: AttachmentScanStatus.REJECTED,
        scanResultSummary: 'MALWARE_FOUND:Eicar-Test-Signature',
      }),
    );
    malwareScanner.scan.mockResolvedValue({
      verdict: 'REJECTED',
      engine: 'test-scanner',
      engineVersion: '1.0.0',
      signatureVersion: 'test-signatures',
      resultSummary: 'MALWARE_FOUND:Eicar-Test-Signature',
      scannedAt: new Date('2026-03-19T10:00:01.000Z'),
    });

    await expect(
      service.createStoredAttachment({
        projectId: 'project-1',
        targetType: AttachmentTargetType.PROJECT,
        targetId: 'project-1',
        uploadedById: actor.id,
        file: {
          originalname: 'eicar.pdf',
          mimetype: 'application/pdf',
          size: 128,
          buffer: Buffer.from('%PDF-1.4\nEICAR'),
        },
      }),
    ).rejects.toThrow('附件安全扫描未通过');

    expect(objectStorageService.promote).not.toHaveBeenCalled();
    expect(objectStorageService.purge).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: expect.stringContaining('quarantine/') }),
    );
    expect(tx.reviewRecord.update).not.toHaveBeenCalled();
    expect(tx.performanceTest.update).not.toHaveBeenCalled();
  });

  it('purges rejected quarantine data even when recording the scan failure is unavailable', async () => {
    const { service, prisma, tx, malwareScanner, objectStorageService } = createService();
    const pending = createAttachmentRecord({
      fileUrl: null,
      scanStatus: AttachmentScanStatus.PENDING_SCAN,
      storageKey: 'quarantine/project-1/project/project-1/eicar.pdf',
    });
    prisma.project.findUnique.mockResolvedValue({
      id: 'project-1',
      code: 'PRJ-001',
      name: '示例项目',
      currentNodeCode: null,
      plannedEndDate: null,
    });
    tx.attachment.create.mockResolvedValue(pending);
    malwareScanner.scan.mockResolvedValue({
      verdict: 'REJECTED',
      engine: 'test-scanner',
      engineVersion: '1.0.0',
      signatureVersion: 'test-signatures',
      resultSummary: 'MALWARE_FOUND:Eicar-Test-Signature',
      scannedAt: new Date('2026-03-19T10:00:01.000Z'),
    });
    let transactionCall = 0;
    prisma.$transaction.mockImplementation(
      async (executor: (client: typeof tx) => Promise<unknown>) => {
        transactionCall += 1;
        if (transactionCall === 2) {
          throw new Error('scan failure transaction unavailable');
        }
        return executor(tx);
      },
    );

    await expect(
      service.createStoredAttachment({
        projectId: 'project-1',
        targetType: AttachmentTargetType.PROJECT,
        targetId: 'project-1',
        uploadedById: actor.id,
        file: {
          originalname: 'eicar.pdf',
          mimetype: 'application/pdf',
          size: 128,
          buffer: Buffer.from('%PDF-1.4\nEICAR'),
        },
      }),
    ).rejects.toThrow('附件安全扫描未通过');

    expect(objectStorageService.purge).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: expect.stringContaining('quarantine/') }),
    );
    expect(objectStorageService.promote).not.toHaveBeenCalled();
  });

  it('atomically repoints a direct review reference when replacing its clean attachment', async () => {
    const { service, prisma, tx } = createService();
    const replacement = createAttachmentRecord({
      id: 'attachment-old',
      entityType: AttachmentTargetType.REVIEW_RECORD,
      entityId: 'review-1',
    });
    const pending = createAttachmentRecord({
      id: 'attachment-new',
      entityType: AttachmentTargetType.REVIEW_RECORD,
      entityId: 'review-1',
      storageKey: 'quarantine/project-1/review_record/review-1/new.pdf',
      fileUrl: null,
      scanStatus: AttachmentScanStatus.PENDING_SCAN,
      replacesAttachmentId: 'attachment-old',
      versionNo: 2,
    });
    const clean = createAttachmentRecord({
      ...pending,
      storageKey: 'project-1/review_record/review-1/new.pdf',
      fileUrl: '/attachments/attachment-new/content',
      scanStatus: AttachmentScanStatus.CLEAN,
    });
    prisma.project.findUnique.mockResolvedValue({
      id: 'project-1',
      code: 'PRJ-001',
      name: '示例项目',
      currentNodeCode: null,
      plannedEndDate: null,
    });
    prisma.reviewRecord.findFirst.mockResolvedValue({ id: 'review-1' });
    prisma.attachment.findFirst.mockResolvedValue(replacement);
    tx.attachment.create.mockResolvedValue(pending);
    tx.attachment.update.mockResolvedValue(clean);
    tx.reviewRecord.findUnique
      .mockResolvedValueOnce({ attachmentId: 'attachment-old' })
      .mockResolvedValueOnce({ attachmentId: null });

    await service.createStoredAttachment({
      projectId: 'project-1',
      targetType: AttachmentTargetType.REVIEW_RECORD,
      targetId: 'review-1',
      uploadedById: actor.id,
      replacesAttachmentId: 'attachment-old',
      file: {
        originalname: 'new.pdf',
        mimetype: 'application/pdf',
        size: 128,
        buffer: Buffer.from('%PDF-1.4\n'),
      },
    });

    expect(tx.reviewRecord.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'review-1' },
      data: { attachmentId: null },
    });
    expect(tx.reviewRecord.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'review-1' },
      data: { attachmentId: 'attachment-new' },
    });
  });

  it('fails closed when the malware scanner is unavailable', async () => {
    const { service, prisma, tx, malwareScanner, objectStorageService } = createService();
    prisma.project.findUnique.mockResolvedValue({
      id: 'project-1',
      code: 'PRJ-001',
      name: '示例项目',
      currentNodeCode: null,
      plannedEndDate: null,
    });
    tx.attachment.create.mockResolvedValue(
      createAttachmentRecord({
        fileUrl: null,
        scanStatus: AttachmentScanStatus.PENDING_SCAN,
      }),
    );
    tx.attachment.update.mockResolvedValue(
      createAttachmentRecord({
        fileUrl: null,
        scanStatus: AttachmentScanStatus.SCAN_ERROR,
        scanResultSummary: 'SCANNER_UNAVAILABLE',
      }),
    );
    malwareScanner.scan.mockRejectedValue(new Error('scanner connection refused'));

    await expect(
      service.createStoredAttachment({
        projectId: 'project-1',
        targetType: AttachmentTargetType.PROJECT,
        targetId: 'project-1',
        uploadedById: actor.id,
        file: {
          originalname: 'a.pdf',
          mimetype: 'application/pdf',
          size: 128,
          buffer: Buffer.from('%PDF-1.4\n'),
        },
      }),
    ).rejects.toThrow('附件安全扫描暂不可用');

    expect(objectStorageService.promote).not.toHaveBeenCalled();
    expect(objectStorageService.purge).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: expect.stringContaining('quarantine/') }),
    );
    expect(tx.attachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scanStatus: AttachmentScanStatus.SCAN_ERROR,
          fileUrl: null,
        }),
      }),
    );
  });

  it('fails closed when a scanner adapter returns an unknown verdict', async () => {
    const { service, prisma, tx, malwareScanner, objectStorageService } = createService();
    prisma.project.findUnique.mockResolvedValue({
      id: 'project-1',
      code: 'PRJ-001',
      name: '示例项目',
      currentNodeCode: null,
      plannedEndDate: null,
    });
    tx.attachment.create.mockResolvedValue(
      createAttachmentRecord({
        fileUrl: null,
        scanStatus: AttachmentScanStatus.PENDING_SCAN,
      }),
    );
    tx.attachment.update.mockResolvedValue(
      createAttachmentRecord({
        fileUrl: null,
        scanStatus: AttachmentScanStatus.SCAN_ERROR,
        scanResultSummary: 'SCANNER_INVALID_VERDICT',
      }),
    );
    malwareScanner.scan.mockResolvedValue({
      verdict: 'UNKNOWN',
      engine: 'test-scanner',
      engineVersion: '1.0.0',
      signatureVersion: 'test-signatures',
      resultSummary: 'UNKNOWN',
      scannedAt: new Date('2026-03-19T10:00:01.000Z'),
    });

    await expect(
      service.createStoredAttachment({
        projectId: 'project-1',
        targetType: AttachmentTargetType.PROJECT,
        targetId: 'project-1',
        uploadedById: actor.id,
        file: {
          originalname: 'a.pdf',
          mimetype: 'application/pdf',
          size: 128,
          buffer: Buffer.from('%PDF-1.4\n'),
        },
      }),
    ).rejects.toThrow('附件安全扫描返回异常');

    expect(objectStorageService.promote).not.toHaveBeenCalled();
    expect(objectStorageService.purge).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: expect.stringContaining('quarantine/') }),
    );
    expect(tx.attachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scanStatus: AttachmentScanStatus.SCAN_ERROR,
          scanResultSummary: 'SCANNER_INVALID_VERDICT',
        }),
      }),
    );
  });

  it('purges quarantine when the pending database record cannot be created', async () => {
    const { service, prisma, objectStorageService } = createService();
    prisma.project.findUnique.mockResolvedValue({
      id: 'project-1',
      code: 'PRJ-001',
      name: '示例项目',
      currentNodeCode: null,
      plannedEndDate: null,
    });
    prisma.$transaction.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      service.createStoredAttachment({
        projectId: 'project-1',
        targetType: AttachmentTargetType.PROJECT,
        targetId: 'project-1',
        uploadedById: actor.id,
        file: {
          originalname: 'a.pdf',
          mimetype: 'application/pdf',
          size: 128,
          buffer: Buffer.from('%PDF-1.4\n'),
        },
      }),
    ).rejects.toThrow('database unavailable');

    expect(objectStorageService.purge).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: expect.stringContaining('quarantine/') }),
    );
  });

  it('restores the clean object to quarantine when the CLEAN database transaction fails', async () => {
    const { service, prisma, tx, objectStorageService } = createService();
    const pending = createAttachmentRecord({
      storageKey: 'quarantine/project-1/project/project-1/a.pdf',
      fileUrl: null,
      scanStatus: AttachmentScanStatus.PENDING_SCAN,
    });
    const scanError = createAttachmentRecord({
      ...pending,
      scanStatus: AttachmentScanStatus.SCAN_ERROR,
      scanResultSummary: 'CLEAN_COMMIT_ERROR_QUARANTINE_RESTORED',
    });
    prisma.project.findUnique.mockResolvedValue({
      id: 'project-1',
      code: 'PRJ-001',
      name: '示例项目',
      currentNodeCode: null,
      plannedEndDate: null,
    });
    tx.attachment.create.mockResolvedValue(pending);
    tx.attachment.update.mockResolvedValue(scanError);
    let transactionCall = 0;
    prisma.$transaction.mockImplementation(
      async (executor: (client: typeof tx) => Promise<unknown>) => {
        transactionCall += 1;
        if (transactionCall === 2) {
          throw new Error('clean transaction failed');
        }
        return executor(tx);
      },
    );

    await expect(
      service.createStoredAttachment({
        projectId: 'project-1',
        targetType: AttachmentTargetType.PROJECT,
        targetId: 'project-1',
        uploadedById: actor.id,
        file: {
          originalname: 'a.pdf',
          mimetype: 'application/pdf',
          size: 128,
          buffer: Buffer.from('%PDF-1.4\n'),
        },
      }),
    ).rejects.toThrow('附件安全状态保存失败');

    expect(objectStorageService.promote).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sourceStorageKey: expect.not.stringContaining('quarantine/'),
        destinationStorageKey: expect.stringContaining('quarantine/'),
      }),
    );
    expect(tx.attachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scanStatus: AttachmentScanStatus.SCAN_ERROR,
          scanResultSummary: 'CLEAN_COMMIT_ERROR_QUARANTINE_RESTORED',
        }),
      }),
    );
  });

  it.each([
    AttachmentScanStatus.PENDING_SCAN,
    AttachmentScanStatus.REJECTED,
    AttachmentScanStatus.SCAN_ERROR,
    AttachmentScanStatus.LEGACY_UNSCANNED,
  ])('blocks download when scan status is %s', async (scanStatus) => {
    const { service, prisma, objectStorageService } = createService();
    prisma.attachment.findFirst.mockResolvedValue(
      createAttachmentRecord({ scanStatus, fileUrl: null }),
    );

    await expect(
      service.downloadAttachment('project-1', 'attachment-1', actor),
    ).rejects.toThrow('安全扫描');
    expect(objectStorageService.openDownload).not.toHaveBeenCalled();
  });

  it('checks project access before opening the CLEAN attachment stream', async () => {
    const { service, projectAccessService, objectStorageService } = createService();
    projectAccessService.assertProjectAccessWithDefaultClient.mockRejectedValue(
      new Error('PROJECT_ACCESS_DENIED'),
    );

    await expect(
      service.downloadAttachment('project-1', 'attachment-1', actor),
    ).rejects.toThrow('PROJECT_ACCESS_DENIED');
    expect(objectStorageService.openDownload).not.toHaveBeenCalled();
  });

  it('checks generic-content project access before opening storage', async () => {
    const { service, prisma, projectAccessService, objectStorageService } = createService();
    prisma.attachment.findUnique.mockResolvedValue(createAttachmentRecord());
    projectAccessService.assertProjectAccessWithDefaultClient.mockRejectedValue(
      new Error('PROJECT_ACCESS_DENIED'),
    );

    await expect(
      service.getAttachmentContent('attachment-1', actor),
    ).rejects.toThrow('PROJECT_ACCESS_DENIED');
    expect(objectStorageService.openDownload).not.toHaveBeenCalled();
  });

  it('blocks a non-CLEAN historical material before opening storage', async () => {
    const { service, prisma, objectStorageService } = createService();
    prisma.attachment.findFirst.mockResolvedValue(
      createAttachmentRecord({
        entityType: AttachmentTargetType.WORKFLOW_TASK,
        entityId: 'task-1',
        scanStatus: AttachmentScanStatus.LEGACY_UNSCANNED,
      }),
    );

    await expect(
      service.getTaskMaterialVersionContent(
        'project-1',
        'task-1',
        'attachment-1',
        actor,
      ),
    ).rejects.toThrow('安全扫描');
    expect(objectStorageService.openDownload).not.toHaveBeenCalled();
  });

  it('opens a CLEAN attachment with its database size only after authorization', async () => {
    const { service, prisma, objectStorageService } = createService();
    prisma.attachment.findFirst.mockResolvedValue(
      createAttachmentRecord({ fileSize: 128 }),
    );

    const result = await service.downloadAttachment(
      'project-1',
      'attachment-1',
      actor,
    );

    expect(objectStorageService.openDownload).toHaveBeenCalledWith({
      bucket: 'local-dev',
      storageKey: 'project-1/project/project-1/a.pdf',
      expectedContentLength: 128,
    });
    expect(result.contentLength).toBe(128);
  });

  it('closes the opened stream before surfacing an audit write failure', async () => {
    const { service, prisma, objectStorageService, activityLogsService } = createService();
    const stream = new PassThrough();
    const destroy = vi.spyOn(stream, 'destroy');
    objectStorageService.openDownload.mockResolvedValue({
      stream,
      contentLength: 128,
    });
    prisma.attachment.findFirst.mockResolvedValue(createAttachmentRecord());
    activityLogsService.create.mockRejectedValue(new Error('AUDIT_WRITE_FAILED'));

    await expect(
      service.downloadAttachment('project-1', 'attachment-1', actor),
    ).rejects.toThrow('附件内容暂不可用');
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(stream.closed).toBe(true);
  });

  it('does not surface a sensitive storage path when opening fails', async () => {
    const { service, prisma, objectStorageService } = createService();
    prisma.attachment.findFirst.mockResolvedValue(createAttachmentRecord());
    objectStorageService.openDownload.mockRejectedValue(
      new Error('ENOENT /private/var/object-storage/customer/secret.pdf'),
    );

    await expect(
      service.downloadAttachment('project-1', 'attachment-1', actor),
    ).rejects.toMatchObject({
      message: '附件内容暂不可用。',
    });
  });

  it('refuses to bind an attachment before it is clean', async () => {
    const { service, prisma, tx } = createService();
    prisma.$transaction.mockImplementation(async (executor: (client: typeof tx) => Promise<unknown>) => {
      tx.attachment.findFirst.mockResolvedValue(
        createAttachmentRecord({
          scanStatus: AttachmentScanStatus.LEGACY_UNSCANNED,
          fileUrl: null,
        }),
      );
      return executor(tx);
    });

    await expect(
      service.bindAttachment(
        'project-1',
        'attachment-1',
        { entityType: 'PROJECT', entityId: 'project-1' },
        actor,
      ),
    ).rejects.toThrow('安全扫描');
    expect(tx.attachment.update).not.toHaveBeenCalled();
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
    prisma.standardBoard.findFirst.mockResolvedValue(null);

    await expect(
      service.uploadAttachment(
        'project-1',
        { entityType: 'STANDARD_BOARD', entityId: 'standard-board-404' },
        {
          originalname: 'a.pdf',
          mimetype: 'application/pdf',
          size: 128,
          buffer: Buffer.from('%PDF-1.4\n'),
        },
        actor,
      ),
    ).rejects.toThrow('标准板实体不存在。');
  });

  it.each(DOMAIN_GOVERNED_ATTACHMENT_TARGETS)(
    'rejects generic upload to the domain-governed %s target before storage or database mutation',
    async (entityType, entityId) => {
      const { service, prisma, objectStorageService } = createService();

      await expect(
        service.uploadAttachment(
          'project-1',
          { entityType, entityId },
          {
            originalname: 'evidence.pdf',
            mimetype: 'application/pdf',
            size: 128,
            buffer: Buffer.from('%PDF-1.4\n'),
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'GENERIC_ATTACHMENT_DOMAIN_OPERATION_DISABLED',
        }),
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(objectStorageService.upload).not.toHaveBeenCalled();
    },
  );

  it.each(DOMAIN_GOVERNED_ATTACHMENT_TARGETS)(
    'rejects generic bind to the domain-governed %s target before opening a transaction',
    async (entityType, entityId) => {
      const { service, prisma, tx } = createService();

      await expect(
        service.bindAttachment(
          'project-1',
          'attachment-1',
          { entityType, entityId },
          actor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'GENERIC_ATTACHMENT_DOMAIN_OPERATION_DISABLED',
        }),
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.attachment.update).not.toHaveBeenCalled();
    },
  );

  it.each(DOMAIN_GOVERNED_ATTACHMENT_TARGETS)(
    'rejects generic unbind of an existing domain-governed %s attachment without changing references',
    async (entityType, entityId) => {
      const { service, tx, objectStorageService } = createService();
      tx.attachment.findFirst.mockResolvedValue(
        createAttachmentRecord({ entityType, entityId }),
      );

      await expect(
        service.unbindAttachment('project-1', 'attachment-1', actor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'GENERIC_ATTACHMENT_DOMAIN_OPERATION_DISABLED',
        }),
      });

      expect(tx.attachment.update).not.toHaveBeenCalled();
      expect(tx.reviewRecord.update).not.toHaveBeenCalled();
      expect(tx.performanceTest.update).not.toHaveBeenCalled();
      expect(objectStorageService.markDeleted).not.toHaveBeenCalled();
    },
  );

  it.each(DOMAIN_GOVERNED_ATTACHMENT_TARGETS)(
    'rejects generic delete of an existing domain-governed %s attachment without deleting storage or references',
    async (entityType, entityId) => {
      const { service, tx, objectStorageService } = createService();
      tx.attachment.findFirst.mockResolvedValue(
        createAttachmentRecord({ entityType, entityId }),
      );

      await expect(
        service.deleteAttachment('project-1', 'attachment-1', actor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'GENERIC_ATTACHMENT_DOMAIN_OPERATION_DISABLED',
        }),
      });

      expect(tx.attachment.update).not.toHaveBeenCalled();
      expect(tx.reviewRecord.update).not.toHaveBeenCalled();
      expect(tx.performanceTest.update).not.toHaveBeenCalled();
      expect(objectStorageService.markDeleted).not.toHaveBeenCalled();
    },
  );

  it.each(DOMAIN_GOVERNED_ATTACHMENT_TARGETS)(
    'rejects generic rebind of an existing domain-governed %s attachment without changing references',
    async (entityType, entityId) => {
      const { service, tx } = createService();
      tx.attachment.findFirst.mockResolvedValue(
        createAttachmentRecord({ entityType, entityId }),
      );

      await expect(
        service.bindAttachment(
          'project-1',
          'attachment-1',
          { entityType: AttachmentTargetType.PROJECT, entityId: 'project-1' },
          actor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'GENERIC_ATTACHMENT_DOMAIN_OPERATION_DISABLED',
        }),
      });

      expect(tx.attachment.update).not.toHaveBeenCalled();
      expect(tx.reviewRecord.update).not.toHaveBeenCalled();
      expect(tx.performanceTest.update).not.toHaveBeenCalled();
    },
  );

  it.each(DOMAIN_GOVERNED_ATTACHMENT_TARGETS)(
    'rejects generic replacement of an existing domain-governed %s attachment before storage or database mutation',
    async (entityType, entityId) => {
      const { service, prisma, objectStorageService } = createService();

      await expect(
        service.uploadAttachment(
          'project-1',
          {
            entityType,
            entityId,
            replacesAttachmentId: 'attachment-1',
          },
          {
            originalname: 'replacement.pdf',
            mimetype: 'application/pdf',
            size: 128,
            buffer: Buffer.from('%PDF-1.4\n'),
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'GENERIC_ATTACHMENT_DOMAIN_OPERATION_DISABLED',
        }),
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(objectStorageService.upload).not.toHaveBeenCalled();
      expect(objectStorageService.markDeleted).not.toHaveBeenCalled();
    },
  );

  it.each(DOMAIN_GOVERNED_ATTACHMENT_TARGETS)(
    'rejects a generic PROJECT replacement request when its existing attachment belongs to %s',
    async (entityType, entityId) => {
      const { service, prisma, objectStorageService } = createService();
      prisma.attachment.findFirst.mockResolvedValue(
        createAttachmentRecord({ entityType, entityId }),
      );

      await expect(
        service.uploadAttachment(
          'project-1',
          {
            entityType: AttachmentTargetType.PROJECT,
            entityId: 'project-1',
            replacesAttachmentId: 'attachment-1',
          },
          {
            originalname: 'replacement.pdf',
            mimetype: 'application/pdf',
            size: 128,
            buffer: Buffer.from('%PDF-1.4\n'),
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'GENERIC_ATTACHMENT_DOMAIN_OPERATION_DISABLED',
        }),
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(objectStorageService.upload).not.toHaveBeenCalled();
      expect(objectStorageService.markDeleted).not.toHaveBeenCalled();
    },
  );

  it('keeps generic PROJECT upload and delete behavior available', async () => {
    const { service, prisma, tx, objectStorageService } = createService();
    const projectAttachment = createAttachmentRecord();
    prisma.project.findUnique.mockResolvedValue({
      id: 'project-1',
      code: 'PRJ-001',
      name: '示例项目',
      currentNodeCode: null,
      plannedEndDate: null,
    });
    tx.project.findUnique.mockResolvedValue({
      id: 'project-1',
      code: 'PRJ-001',
      name: '示例项目',
      currentNodeCode: null,
      plannedEndDate: null,
    });
    tx.attachment.create.mockResolvedValue(
      createAttachmentRecord({
        fileUrl: null,
        scanStatus: AttachmentScanStatus.PENDING_SCAN,
      }),
    );
    tx.attachment.update
      .mockResolvedValueOnce(projectAttachment)
      .mockResolvedValueOnce(
        createAttachmentRecord({
          isDeleted: true,
          deletedAt: new Date('2026-03-19T11:00:00.000Z'),
          deletedById: actor.id,
        }),
      );
    tx.attachment.findFirst.mockResolvedValue(projectAttachment);

    const uploaded = await service.uploadAttachment(
      'project-1',
      { entityType: AttachmentTargetType.PROJECT, entityId: 'project-1' },
      {
        originalname: 'project.pdf',
        mimetype: 'application/pdf',
        size: 128,
        buffer: Buffer.from('%PDF-1.4\n'),
      },
      actor,
    );
    const deleted = await service.deleteAttachment(
      'project-1',
      uploaded.id,
      actor,
    );

    expect(uploaded.entityType).toBe(AttachmentTargetType.PROJECT);
    expect(deleted.isDeleted).toBe(true);
    expect(objectStorageService.upload).toHaveBeenCalledTimes(1);
    expect(objectStorageService.markDeleted).toHaveBeenCalledTimes(1);
  });

  it('keeps generic PROJECT bind and unbind behavior available', async () => {
    const { service, tx } = createService();
    const projectAttachment = createAttachmentRecord();
    tx.attachment.findFirst.mockResolvedValue(projectAttachment);
    tx.attachment.update.mockResolvedValue(projectAttachment);
    tx.project.findUnique.mockResolvedValue({
      id: 'project-1',
      code: 'PRJ-001',
      name: '示例项目',
      currentNodeCode: null,
      plannedEndDate: null,
    });

    await expect(
      service.bindAttachment(
        'project-1',
        'attachment-1',
        { entityType: AttachmentTargetType.PROJECT, entityId: 'project-1' },
        actor,
      ),
    ).resolves.toMatchObject({ entityType: AttachmentTargetType.PROJECT });
    await expect(
      service.unbindAttachment('project-1', 'attachment-1', actor),
    ).resolves.toMatchObject({ entityType: AttachmentTargetType.PROJECT });

    expect(tx.attachment.update).toHaveBeenCalledTimes(2);
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
          scanStatus: AttachmentScanStatus.CLEAN,
        }),
      }),
    );
  });
});
