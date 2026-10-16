import { ProjectStatus, UserStatus, WorkflowNodeCode } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminService } from './admin.service';

describe('AdminService simplified overview and color database', () => {
  const prisma = {
    $queryRaw: vi.fn(),
    project: { count: vi.fn() },
    user: { count: vi.fn() },
    department: { count: vi.fn() },
    color: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    attachment: { count: vi.fn(), findMany: vi.fn() },
    workflowTask: { findMany: vi.fn() },
  };
  let service: AdminService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new AdminService(prisma as never);
  });

  it('returns the six real overview metrics without static module cards', async () => {
    prisma.project.count.mockResolvedValueOnce(22).mockResolvedValueOnce(15).mockResolvedValueOnce(3);
    prisma.user.count.mockResolvedValueOnce(12);
    prisma.department.count.mockResolvedValueOnce(7);
    prisma.color.count.mockResolvedValueOnce(54);
    prisma.attachment.count.mockResolvedValueOnce(328);

    const result = await service.getOverview();

    expect(result.summary).toEqual({
      totalProjects: 22,
      activeProjects: 15,
      riskProjects: 3,
      activeUsers: 12,
      activeDepartments: 7,
      archivedColors: 54,
      totalMaterials: 328,
    });
    expect(result).not.toHaveProperty('modules');
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { status: UserStatus.ACTIVE } });
    expect(prisma.project.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: [ProjectStatus.DRAFT, ProjectStatus.IN_PROGRESS, ProjectStatus.ON_HOLD] } }) }));
  });

  it('automatically groups existing task attachments into lifecycle stages and keeps history', async () => {
    const project = {
      id: 'project-1', code: 'R26-001', name: '深海蓝开发', status: ProjectStatus.IN_PROGRESS,
      vehicleModel: '帅铃', createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-07-28T00:00:00.000Z'),
    };
    const color = {
      id: 'color-1', projectId: project.id, code: 'JAC-BL-028', name: '深海蓝', description: null,
      status: 'ACTIVE', isPrimary: true, exitFlag: false, exitDate: null,
      numberingTaskId: 'task-5', numberedById: 'user-1',
      numberedAt: new Date('2026-01-05T08:00:00.000Z'), numberingAttachmentId: 'number-proof-1',
      numberingTask: { id: 'task-5', nodeCode: WorkflowNodeCode.COLOR_NUMBERING, status: 'COMPLETED' },
      numberingAttachment: { id: 'number-proof-1', entityType: 'WORKFLOW_TASK', entityId: 'task-5', isDeleted: false },
      createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-07-28T00:00:00.000Z'),
      project,
      versions: [{ id: 'color-version-1', versionNo: 1, technicalData: { displayHex: '#194f7a', colorType: '金属漆' } }],
      paintProcurements: [{ supplier: { supplierName: '供应商A' } }],
    };
    mockCatalog(['color-1'], {
      archivedColors: 1n,
      materialCount: 2n,
      incompleteColors: 1n,
      newMaterialsThisMonth: 2n,
      vehicleModels: ['帅铃'],
      colorTypes: ['金属漆'],
      statuses: ['ACTIVE'],
      years: [2026],
    }, [
      materialRow('attachment-v2', 2, 'attachment-v1', false),
      materialRow('attachment-v1', 1, null, true),
    ]);
    prisma.color.findMany.mockResolvedValue([color]);
    prisma.color.findFirst.mockResolvedValue(color);

    const list = await service.getColorDatabase({});
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
    const listStatSql = (prisma.$queryRaw.mock.calls[2]?.[0] as {
      strings?: readonly string[];
    }).strings?.join('') ?? '';
    expect(listStatSql).not.toContain('attachment."fileName"');
    expect(listStatSql).toContain('supplier."name"');
    expect(listStatSql).not.toContain('supplier."supplierName"');
    const detail = await service.getColorArchive('color-1');

    expect(list.items[0]).toEqual(expect.objectContaining({
      name: '深海蓝', code: 'JAC-BL-028', displayColor: '#194f7a', materialCount: 2, coveredSteps: 1,
    }));
    const validationStage = detail.stages.find((stage) => stage.key === 'VALIDATION');
    expect(validationStage?.materials).toHaveLength(2);
    expect(validationStage?.materials.map((item) => item.versionStatus)).toEqual(['CURRENT', 'HISTORICAL']);
    expect(validationStage?.materials[0]).toEqual(expect.objectContaining({
      projectCode: 'R26-001', stepNumber: 12, uploader: expect.objectContaining({ departmentName: '质量验证部' }),
    }));
    expect(prisma.attachment.findMany).not.toHaveBeenCalled();
    expect(prisma.workflowTask.findMany).not.toHaveBeenCalled();
    expect(prisma.color.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([{ id: 'color-1' }]),
      }),
    }));
    const detailStatSql = (prisma.$queryRaw.mock.calls[3]?.[0] as {
      strings?: readonly string[];
    }).strings?.join('') ?? '';
    const detailMaterialSql = (prisma.$queryRaw.mock.calls[4]?.[0] as {
      strings?: readonly string[];
    }).strings?.join('') ?? '';
    expect(listStatSql).toMatch(
      /scoped_colors AS MATERIALIZED[\s\S]*WHERE c\."code" IS NOT NULL[\s\S]*AND c\."id" IN \([\s\S]*\)[\s\S]*archive_color_context/u,
    );
    expect(detailStatSql).toMatch(
      /scoped_colors AS MATERIALIZED[\s\S]*WHERE c\."code" IS NOT NULL[\s\S]*AND c\."id" =[\s\S]*archive_color_context/u,
    );
    expect(detailMaterialSql).toMatch(/AND c\."id" =/u);
    expect(detailMaterialSql).toContain('LIMIT');
  });

  it('does not archive a legacy color without complete step 05 provenance', async () => {
    mockCatalog([]);

    const result = await service.getColorDatabase({});

    expect(result.items).toEqual([]);
    expect(result.summary.archivedColors).toBe(0);
    expect(prisma.color.findMany).not.toHaveBeenCalled();
    const sql = (prisma.$queryRaw.mock.calls[0]?.[0] as { strings?: readonly string[] })
      .strings?.join('') ?? '';
    expect(sql).toContain('c."numberingTaskId" IS NOT NULL');
    expect(sql).toContain('c."numberedById" IS NOT NULL');
    expect(sql).toContain('c."numberingAttachmentId" IS NOT NULL');
  });

  it('grants qualified team read access independently of historical project membership', async () => {
    mockCatalog([]);

    await service.getColorDatabase({}, {
      id: 'viewer-1',
      departmentId: 'department-1',
      isSystemAdmin: false,
      roleCodes: ['viewer'], permissionCodes: ['project.read'], authSource: 'local', teamAccessApproved: true,
    } as never);

    const statements = prisma.$queryRaw.mock.calls.map(([statement]) => statement as {
      strings?: readonly string[];
      values?: readonly unknown[];
    });
    const sql = statements.map((statement) => statement.strings?.join('') ?? '').join('\n');
    const values = statements.flatMap((statement) => [...(statement.values ?? [])]);
    expect(sql).not.toContain('p."ownerUserId" =');
    expect(sql).not.toContain('FROM "project_members" scoped_member');
    expect(sql).not.toContain('p."owningDepartmentId" =');
    expect(values).not.toContain('viewer-1');
    expect(values).not.toContain('department-1');
  });

  it('pages controlled color ids in the database before loading only page archives', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ ids: ['color-page-2'], total: 73n }])
      .mockResolvedValueOnce([{
        archivedColors: 73n,
        materialCount: 328n,
        incompleteColors: 12n,
        newMaterialsThisMonth: 9n,
        vehicleModels: ['帅铃'],
        colorTypes: ['金属漆'],
        statuses: ['ACTIVE'],
        years: [2026],
      }]);
    prisma.color.findMany.mockResolvedValue([]);

    const result = await service.getColorDatabase({ page: 2, pageSize: 12, search: '深海' });

    expect(result.total).toBe(73);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.color.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([{ id: { in: ['color-page-2'] } }]),
      }),
      take: 12,
    }));
    const pageSql = (prisma.$queryRaw.mock.calls[0]?.[0] as { strings?: readonly string[] })
      .strings?.join('') ?? '';
    expect(pageSql).toContain('LIMIT');
    expect(pageSql).toContain('OFFSET');
    expect(pageSql).toMatch(/WITH\s+scoped_colors AS MATERIALIZED/u);
  });

  it('rejects deep pages before any database read', async () => {
    await expect(service.getColorDatabase({ page: 101 })).rejects.toThrow(
      '页码必须为 1～100 之间的整数',
    );

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.color.findMany).not.toHaveBeenCalled();
    expect(prisma.color.findFirst).not.toHaveBeenCalled();
  });

  it('caps exact-archive material rows and exposes that more materials exist', async () => {
    prisma.color.findFirst.mockResolvedValue(controlledColor());
    const materials = Array.from({ length: 501 }, (_, index) => ({
      ...materialRow(`attachment-${index}`, 1, null, false),
      uploadedAt: new Date(1_786_000_000_000 - index),
    }));
    prisma.$queryRaw
      .mockResolvedValueOnce([{
        id: 'color-1',
        materialCount: 501n,
        coveredSteps: 1n,
        archiveUpdatedAt: new Date('2026-07-28T00:00:00.000Z'),
        suppliers: [],
      }])
      .mockResolvedValueOnce(materials);

    const detail = await service.getColorArchive('color-1');
    const returnedMaterials = detail.stages.reduce(
      (count, stage) => count + stage.materials.length,
      detail.unclassifiedMaterials.length,
    );

    expect(returnedMaterials).toBe(500);
    expect(detail.materialCount).toBe(501);
    expect(detail.materialsHasMore).toBe(true);
    const materialQuery = prisma.$queryRaw.mock.calls[1]?.[0] as {
      strings?: readonly string[];
      values?: readonly unknown[];
    };
    expect(materialQuery.strings?.join('')).toContain('LIMIT');
    expect(materialQuery.values).toContain(501);
  });

  it('resolves same-project fallback and direct targets against canonical color context', async () => {
    prisma.color.findFirst.mockResolvedValue({
      ...controlledColor(),
      id: 'color-secondary',
      code: 'JAC-BL-SECONDARY',
      isPrimary: false,
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{
        id: 'color-secondary',
        materialCount: 0n,
        coveredSteps: 0n,
        archiveUpdatedAt: new Date('2026-07-28T00:00:00.000Z'),
        suppliers: [],
      }])
      .mockResolvedValueOnce([]);

    const detail = await service.getColorArchive('color-secondary');

    expect(detail.materialCount).toBe(0);
    const sql = prisma.$queryRaw.mock.calls.map(([statement]) =>
      (statement as { strings?: readonly string[] }).strings?.join('') ?? '',
    ).join('\n');
    const values = prisma.$queryRaw.mock.calls.flatMap(([statement]) => [
      ...((statement as { values?: readonly unknown[] }).values ?? []),
    ]);
    expect(sql).toContain('archive_color_context AS MATERIALIZED');
    expect(sql).toContain('FROM "colors" context_color');
    expect(sql).toContain('selected_project ON selected_project."projectId"');
    expect(sql).toContain('FROM archive_color_context context_color');
    expect(sql).toContain('FROM archive_color_context direct_color');
    expect(sql).toContain('INNER JOIN archive_color_context direct_color');
    expect(sql).not.toContain('FROM scoped_colors direct_color');
    expect(values).toContain('color-secondary');
  });

  function materialRow(
    id: string,
    versionNo: number,
    replacesAttachmentId: string | null,
    hasNewerVersion: boolean,
  ) {
    return {
      colorId: 'color-1',
      id,
      projectId: 'project-1',
      projectCode: 'R26-001',
      projectName: '深海蓝开发',
      stepNumber: 12,
      stepCode: '12',
      nodeName: '样车驾驶室评审',
      originalFileName: `评审报告-V${versionNo}.pdf`,
      fileName: `评审报告-V${versionNo}.pdf`,
      mimeType: 'application/pdf',
      fileSize: 1024,
      materialType: 'REVIEW_REPORT',
      versionNo,
      replacesAttachmentId,
      uploadedAt: new Date(`2026-07-${20 + versionNo}T08:00:00.000Z`),
      uploaderId: 'user-1',
      uploaderName: '田强',
      uploaderDepartmentName: '质量验证部',
      hasNewerVersion,
    };
  }

  function controlledColor() {
    return {
      id: 'color-1',
      projectId: 'project-1',
      code: 'JAC-BL-028',
      name: '深海蓝',
      description: null,
      status: 'ACTIVE',
      isPrimary: true,
      exitFlag: false,
      exitDate: null,
      numberingTaskId: 'task-5',
      numberedById: 'user-1',
      numberedAt: new Date('2026-01-05T08:00:00.000Z'),
      numberingAttachmentId: 'number-proof-1',
      numberingTask: {
        id: 'task-5',
        nodeCode: WorkflowNodeCode.COLOR_NUMBERING,
        status: 'COMPLETED',
      },
      numberingAttachment: {
        id: 'number-proof-1',
        entityType: 'WORKFLOW_TASK',
        entityId: 'task-5',
        isDeleted: false,
      },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-28T00:00:00.000Z'),
      project: {
        id: 'project-1',
        code: 'R26-001',
        name: '深海蓝开发',
        status: ProjectStatus.IN_PROGRESS,
        vehicleModel: '帅铃',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-28T00:00:00.000Z'),
      },
      versions: [{
        id: 'color-version-1',
        versionNo: 1,
        technicalData: { displayHex: '#194f7a', colorType: '金属漆' },
      }],
    };
  }

  function mockCatalog(
    ids: string[],
    summary: {
      archivedColors: bigint;
      materialCount: bigint;
      incompleteColors: bigint;
      newMaterialsThisMonth: bigint;
      vehicleModels: string[];
      colorTypes: string[];
      statuses: string[];
      years: number[];
    } = {
      archivedColors: 0n,
      materialCount: 0n,
      incompleteColors: 0n,
      newMaterialsThisMonth: 0n,
      vehicleModels: [],
      colorTypes: [],
      statuses: [],
      years: [],
    },
    materials: ReturnType<typeof materialRow>[] = [],
  ) {
    const stats = ids.map((id) => ({
      id,
      materialCount: summary.materialCount,
      coveredSteps: materials.length
        ? new Set(materials.map((material) => material.stepNumber).filter(Boolean)).size
        : 0,
      archiveUpdatedAt: new Date('2026-07-28T00:00:00.000Z'),
      suppliers: ['供应商A'],
    }));
    prisma.$queryRaw
      .mockResolvedValueOnce([{ ids, total: BigInt(ids.length) }])
      .mockResolvedValueOnce([summary])
      .mockResolvedValueOnce(stats)
      .mockResolvedValueOnce(stats)
      .mockResolvedValueOnce(materials);
  }
});
