import { ProjectStatus, UserStatus, WorkflowNodeCode } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminService } from './admin.service';

describe('AdminService simplified overview and color database', () => {
  const prisma = {
    project: { count: vi.fn() },
    user: { count: vi.fn() },
    department: { count: vi.fn() },
    color: { count: vi.fn(), findMany: vi.fn() },
    attachment: { count: vi.fn(), findMany: vi.fn() },
    workflowTask: { findMany: vi.fn() },
  };
  let service: AdminService;

  beforeEach(() => {
    vi.clearAllMocks();
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
    prisma.color.findMany.mockResolvedValue([{
      id: 'color-1', projectId: project.id, code: 'JAC-BL-028', name: '深海蓝', description: null,
      status: 'ACTIVE', isPrimary: true, exitFlag: false, exitDate: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-07-28T00:00:00.000Z'),
      project,
      versions: [{ id: 'color-version-1', versionNo: 1, technicalData: { displayHex: '#194f7a', colorType: '金属漆' } }],
      paintProcurements: [{ supplier: { supplierName: '供应商A' } }],
    }]);
    prisma.attachment.findMany.mockResolvedValue([
      attachment('attachment-v2', 2, 'attachment-v1'),
      attachment('attachment-v1', 1, null),
    ]);
    prisma.workflowTask.findMany.mockResolvedValue([{
      id: 'task-12', nodeCode: WorkflowNodeCode.CAB_REVIEW, stepCode: '12', nodeName: '样车驾驶室评审',
    }]);

    const list = await service.getColorDatabase({});
    const detail = await service.getColorArchive('color-1');

    expect(list.items[0]).toEqual(expect.objectContaining({
      name: '深海蓝', displayColor: '#194f7a', materialCount: 2, coveredSteps: 1,
    }));
    const validationStage = detail.stages.find((stage) => stage.key === 'VALIDATION');
    expect(validationStage?.materials).toHaveLength(2);
    expect(validationStage?.materials.map((item) => item.versionStatus)).toEqual(['CURRENT', 'HISTORICAL']);
    expect(validationStage?.materials[0]).toEqual(expect.objectContaining({
      projectCode: 'R26-001', stepNumber: 12, uploader: expect.objectContaining({ departmentName: '质量验证部' }),
    }));
  });

  it('limits ordinary readers to projects they own, join or access through their department', async () => {
    prisma.color.findMany.mockResolvedValue([]);

    await service.getColorDatabase({}, {
      id: 'viewer-1',
      departmentId: 'department-1',
      isSystemAdmin: false,
      roleCodes: ['viewer'],
    } as never);

    expect(prisma.color.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        project: {
          is: {
            OR: [
              { ownerUserId: 'viewer-1' },
              { members: { some: { userId: 'viewer-1' } } },
              { owningDepartmentId: 'department-1' },
            ],
          },
        },
      },
    }));
  });

  function attachment(id: string, versionNo: number, replacesAttachmentId: string | null) {
    return {
      id,
      projectId: 'project-1',
      entityType: 'WORKFLOW_TASK',
      entityId: 'task-12',
      originalFileName: `评审报告-V${versionNo}.pdf`,
      fileName: `评审报告-V${versionNo}.pdf`,
      mimeType: 'application/pdf',
      fileSize: 1024,
      materialType: 'REVIEW_REPORT',
      versionNo,
      replacesAttachmentId,
      uploadedAt: new Date(`2026-07-${20 + versionNo}T08:00:00.000Z`),
      uploadedBy: { id: 'user-1', name: '田强', department: { name: '质量验证部' } },
    };
  }
});
