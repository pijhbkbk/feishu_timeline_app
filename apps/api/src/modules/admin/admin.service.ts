import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditTargetType,
  Prisma,
  ProjectStatus,
  UserStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { WORKFLOW_NODE_META_MAP } from '../workflows/workflow-node.constants';
import type { AdminAuditQueryDto } from './dto/admin-audit-query.dto';
import type { AdminColorDatabaseQueryDto } from './dto/admin-color-database-query.dto';

const SENSITIVE_KEY_PATTERN = /^(?:password|secret|token|authorization|cookie|set-cookie|session|access[-_]?token|refresh[-_]?token|app[-_]?secret|database[-_]?url|redis[-_]?url)$/i;
const IP_KEY_PATTERN = /^(?:ip|ipAddress|clientIp|remoteIp)$/i;
const USER_AGENT_KEY_PATTERN = /^(?:userAgent|user-agent)$/i;
const MAX_DETAIL_DEPTH = 4;
const MAX_OBJECT_KEYS = 30;
const MAX_ARRAY_ITEMS = 20;
const MAX_DETAIL_STRING_LENGTH = 500;

const COLOR_ARCHIVE_STAGES = [
  { key: 'INITIATION', title: '需求与立项', from: 1, to: 2 },
  { key: 'DEVELOPMENT', title: '颜色开发与确认', from: 3, to: 5 },
  { key: 'PROCUREMENT', title: '采购与标准板', from: 6, to: 8 },
  { key: 'VALIDATION', title: '性能、试制与评审', from: 9, to: 12 },
  { key: 'ACCEPTANCE', title: '收费与一致性评审', from: 13, to: 14 },
  { key: 'PRODUCTION', title: '排产与批量生产', from: 15, to: 16 },
  { key: 'LIFECYCLE', title: '月度评审与颜色退出', from: 17, to: 18 },
] as const;

const FALLBACK_ATTACHMENT_STEP: Partial<Record<string, number>> = {
  PROJECT: 1,
  NEW_COLOR_REPORT: 2,
  COLOR_VERSION: 3,
  SAMPLE: 4,
  COLOR: 5,
  STANDARD_BOARD: 7,
  PERFORMANCE_TEST: 9,
  PRODUCTION_PLAN: 10,
  TRIAL_PRODUCTION: 11,
  REVIEW_RECORD: 12,
};

type ArchiveMaterial = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  stepNumber: number | null;
  stepCode: string | null;
  stepName: string;
  archiveCategory: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  materialType: string | null;
  versionNo: number;
  replacesAttachmentId: string | null;
  uploader: { id: string; name: string; departmentName: string | null } | null;
  uploadedAt: string;
  versionStatus: 'CURRENT' | 'HISTORICAL';
  downloadUrl: string;
  previewUrl: string | null;
};

type ColorArchive = {
  id: string;
  key: string;
  name: string;
  code: string | null;
  displayColor: string | null;
  colorType: string | null;
  status: string;
  vehicleModels: string[];
  suppliers: string[];
  projects: Array<{ id: string; code: string; name: string; status: string }>;
  firstProject: { id: string; code: string; name: string };
  materials: ArchiveMaterial[];
  materialCount: number;
  coveredSteps: number;
  completenessPercent: number;
  updatedAt: string;
  createdAt: string;
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [
      totalProjects,
      activeProjects,
      riskProjects,
      activeUsers,
      activeDepartments,
      archivedColors,
      totalMaterials,
    ] = await Promise.all([
      this.prisma.project.count(),
      this.prisma.project.count({
        where: {
          status: {
            in: [ProjectStatus.DRAFT, ProjectStatus.IN_PROGRESS, ProjectStatus.ON_HOLD],
          },
        },
      }),
      this.prisma.project.count({
        where: {
          status: {
            in: [ProjectStatus.DRAFT, ProjectStatus.IN_PROGRESS, ProjectStatus.ON_HOLD],
          },
          OR: [
            { workflowTasks: { some: { isActive: true, overdueDays: { gt: 0 } } } },
            { workflowTasks: { some: { isActive: true, blockers: { some: { status: 'OPEN' } } } } },
            {
              workflowTasks: {
                some: {
                  isActive: true,
                  nodeCode: {
                    in: [
                      WorkflowNodeCode.CAB_REVIEW,
                      WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
                      WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
                    ],
                  },
                  status: {
                    in: [
                      WorkflowTaskStatus.PENDING,
                      WorkflowTaskStatus.READY,
                      WorkflowTaskStatus.IN_PROGRESS,
                    ],
                  },
                  effectiveDueAt: { lt: new Date() },
                },
              },
            },
          ],
        },
      }),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.department.count({ where: { isActive: true } }),
      this.prisma.color.count(),
      this.prisma.attachment.count({
        where: { isDeleted: false, project: { colors: { some: {} } } },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalProjects,
        activeProjects,
        riskProjects,
        activeUsers,
        activeDepartments,
        archivedColors,
        totalMaterials,
      },
    };
  }

  async getColorDatabase(query: AdminColorDatabaseQueryDto, actor?: AuthenticatedUser) {
    const archives = await this.buildColorArchives(actor);
    const search = query.search?.toLocaleLowerCase('zh-CN');
    const filtered = archives.filter((archive) => {
      if (
        search &&
        ![
          archive.name,
          archive.code,
          ...archive.vehicleModels,
          ...archive.projects.flatMap((project) => [project.code, project.name]),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('zh-CN').includes(search))
      ) return false;
      if (query.vehicleModel && !archive.vehicleModels.includes(query.vehicleModel)) return false;
      if (query.colorType && archive.colorType !== query.colorType) return false;
      if (query.status && archive.status !== query.status) return false;
      if (query.completeness === 'COMPLETE' && archive.completenessPercent < 100) return false;
      if (query.completeness === 'INCOMPLETE' && archive.completenessPercent >= 100) return false;
      if (query.year && new Date(archive.updatedAt).getFullYear() !== query.year) return false;
      return true;
    });

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const total = filtered.length;
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    return {
      generatedAt: new Date().toISOString(),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      summary: {
        archivedColors: archives.length,
        materialCount: archives.reduce((sum, item) => sum + item.materialCount, 0),
        incompleteColors: archives.filter((item) => item.completenessPercent < 100).length,
        newMaterialsThisMonth: archives.reduce(
          (sum, item) =>
            sum + item.materials.filter((material) => new Date(material.uploadedAt) >= thisMonth).length,
          0,
        ),
      },
      facets: {
        vehicleModels: uniqueSorted(archives.flatMap((item) => item.vehicleModels)),
        colorTypes: uniqueSorted(archives.map((item) => item.colorType).filter(Boolean) as string[]),
        statuses: uniqueSorted(archives.map((item) => item.status)),
        years: uniqueSorted(
          archives.map((item) => String(new Date(item.updatedAt).getFullYear())),
        ).map(Number),
      },
      items: filtered.slice((page - 1) * pageSize, page * pageSize).map(stripArchiveMaterials),
    };
  }

  async getColorArchive(colorId: string, actor?: AuthenticatedUser) {
    const archive = (await this.buildColorArchives(actor)).find((item) => item.id === colorId);
    if (!archive) throw new NotFoundException('颜色档案不存在。');

    return {
      generatedAt: new Date().toISOString(),
      ...stripArchiveMaterials(archive),
      projects: archive.projects,
      stages: COLOR_ARCHIVE_STAGES.map((stage) => ({
        key: stage.key,
        title: stage.title,
        stepRange: `${stage.from}～${stage.to}`,
        materials: archive.materials.filter(
          (material) =>
            material.stepNumber !== null &&
            material.stepNumber >= stage.from &&
            material.stepNumber <= stage.to,
        ),
      })),
      unclassifiedMaterials: archive.materials.filter((material) => material.stepNumber === null),
    };
  }

  private async buildColorArchives(actor?: AuthenticatedUser): Promise<ColorArchive[]> {
    const isAdministrator = Boolean(
      actor && (actor.isSystemAdmin || actor.roleCodes.includes('admin')),
    );
    const projectScope: Prisma.ProjectWhereInput | undefined =
      actor && !isAdministrator
        ? {
            OR: [
              { ownerUserId: actor.id },
              { members: { some: { userId: actor.id } } },
              ...(actor.departmentId ? [{ owningDepartmentId: actor.departmentId }] : []),
            ],
          }
        : undefined;
    const colors = await this.prisma.color.findMany({
      ...(projectScope ? { where: { project: { is: projectScope } } } : {}),
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            vehicleModel: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        versions: { orderBy: { versionNo: 'desc' }, take: 1 },
        paintProcurements: {
          include: { supplier: { select: { supplierName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    if (!colors.length) return [];

    const projectIds = uniqueSorted(colors.map((color) => color.projectId));
    const attachments = await this.prisma.attachment.findMany({
      where: { projectId: { in: projectIds }, isDeleted: false },
      include: {
        uploadedBy: {
          select: { id: true, name: true, department: { select: { name: true } } },
        },
      },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
    });
    const taskIds = attachments
      .filter((item) => item.entityType === 'WORKFLOW_TASK')
      .map((item) => item.entityId);
    const tasks = taskIds.length
      ? await this.prisma.workflowTask.findMany({
          where: { id: { in: uniqueSorted(taskIds) } },
          select: { id: true, nodeCode: true, stepCode: true, nodeName: true },
        })
      : [];
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const replacedAttachmentIds = new Set(
      attachments
        .map((attachment) => attachment.replacesAttachmentId)
        .filter((attachmentId): attachmentId is string => Boolean(attachmentId)),
    );
    const colorByVersionId = new Map(
      colors.flatMap((color) => color.versions.map((version) => [version.id, color.id] as const)),
    );
    const colorsByProject = new Map<string, typeof colors>();
    for (const color of colors) {
      const group = colorsByProject.get(color.projectId) ?? [];
      group.push(color);
      colorsByProject.set(color.projectId, group);
    }

    const attachmentsByColorId = new Map<string, typeof attachments>();
    for (const attachment of attachments) {
      const projectColors = colorsByProject.get(attachment.projectId) ?? [];
      const directColorId =
        attachment.entityType === 'COLOR'
          ? attachment.entityId
          : attachment.entityType === 'COLOR_VERSION'
            ? colorByVersionId.get(attachment.entityId)
            : null;
      const targetColor =
        projectColors.find((color) => color.id === directColorId) ??
        projectColors.find((color) => color.isPrimary) ??
        projectColors[0];
      if (!targetColor) continue;
      const group = attachmentsByColorId.get(targetColor.id) ?? [];
      group.push(attachment);
      attachmentsByColorId.set(targetColor.id, group);
    }

    const archiveByKey = new Map<string, ColorArchive>();
    for (const color of colors) {
      const key = (color.code ? `code:${color.code}` : `name:${color.name}`).toLocaleLowerCase('zh-CN');
      const technicalData = readRecord(color.versions[0]?.technicalData);
      const displayColor = readColorValue(technicalData);
      const colorType = readOptionalText(technicalData, ['colorType', 'paintType', 'type']);
      const materials = (attachmentsByColorId.get(color.id) ?? []).map((attachment) => {
        const task = attachment.entityType === 'WORKFLOW_TASK' ? taskById.get(attachment.entityId) : null;
        const stepNumber = task
          ? WORKFLOW_NODE_META_MAP[task.nodeCode].sequence / 10
          : FALLBACK_ATTACHMENT_STEP[attachment.entityType] ?? null;
        const stepName = task?.nodeName ?? (stepNumber ? getStepName(stepNumber) : '待分类材料');
        const archiveCategory = getArchiveCategory(stepNumber);
        const hasNewerVersion = replacedAttachmentIds.has(attachment.id);
        return {
          id: attachment.id,
          projectId: color.project.id,
          projectCode: color.project.code,
          projectName: color.project.name,
          stepNumber,
          stepCode: task?.stepCode ?? (stepNumber ? String(stepNumber).padStart(2, '0') : null),
          stepName,
          archiveCategory,
          fileName: attachment.originalFileName ?? attachment.fileName,
          mimeType: attachment.mimeType,
          fileSize: attachment.fileSize,
          materialType: attachment.materialType,
          versionNo: attachment.versionNo,
          replacesAttachmentId: attachment.replacesAttachmentId,
          uploader: attachment.uploadedBy
            ? {
                id: attachment.uploadedBy.id,
                name: attachment.uploadedBy.name,
                departmentName: attachment.uploadedBy.department?.name ?? null,
              }
            : null,
          uploadedAt: attachment.uploadedAt.toISOString(),
          versionStatus: hasNewerVersion ? 'HISTORICAL' as const : 'CURRENT' as const,
          downloadUrl: `/projects/${attachment.projectId}/attachments/${attachment.id}/download`,
          previewUrl: canPreviewMimeType(attachment.mimeType)
            ? `/projects/${attachment.projectId}/attachments/${attachment.id}/download?disposition=inline`
            : null,
        };
      });
      const project = {
        id: color.project.id,
        code: color.project.code,
        name: color.project.name,
        status: color.project.status,
      };
      const suppliers = uniqueSorted(
        color.paintProcurements
          .map((item) => item.supplier?.supplierName)
          .filter(Boolean) as string[],
      );
      const existing = archiveByKey.get(key);
      if (existing) {
        existing.projects = uniqueById([...existing.projects, project]);
        existing.vehicleModels = uniqueSorted([
          ...existing.vehicleModels,
          ...(color.project.vehicleModel ? [color.project.vehicleModel] : []),
        ]);
        existing.suppliers = uniqueSorted([...existing.suppliers, ...suppliers]);
        existing.materials.push(...materials);
        if (color.createdAt.toISOString() < existing.createdAt) {
          existing.createdAt = color.createdAt.toISOString();
          existing.firstProject = { id: project.id, code: project.code, name: project.name };
        }
        existing.updatedAt = latestIso(existing.updatedAt, color.updatedAt.toISOString(), ...materials.map((item) => item.uploadedAt));
        continue;
      }
      archiveByKey.set(key, {
        id: color.id,
        key,
        name: color.name,
        code: color.code,
        displayColor,
        colorType,
        status: color.status,
        vehicleModels: color.project.vehicleModel ? [color.project.vehicleModel] : [],
        suppliers,
        projects: [project],
        firstProject: { id: project.id, code: project.code, name: project.name },
        materials,
        materialCount: 0,
        coveredSteps: 0,
        completenessPercent: 0,
        updatedAt: latestIso(color.updatedAt.toISOString(), ...materials.map((item) => item.uploadedAt)),
        createdAt: color.createdAt.toISOString(),
      });
    }

    return [...archiveByKey.values()]
      .map((archive) => {
        archive.materials.sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
        archive.materialCount = archive.materials.length;
        archive.coveredSteps = new Set(
          archive.materials.map((item) => item.stepNumber).filter((item): item is number => item !== null),
        ).size;
        archive.completenessPercent = Math.round((archive.coveredSteps / 18) * 100);
        return archive;
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getAuditLogs(query: AdminAuditQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sortDirection = query.sort === 'createdAt:asc' ? 'asc' : 'desc';
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (from && to && from > to) {
      throw new BadRequestException('from 不能晚于 to。');
    }

    const where = this.buildAuditWhere(query, from, to);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const failureWhere: Prisma.AuditLogWhereInput = {
      ...where,
      AND: [
        ...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []),
        {
          OR: [
            { action: { contains: 'FAIL', mode: 'insensitive' } },
            { action: { contains: 'REJECT', mode: 'insensitive' } },
            { action: { contains: 'ERROR', mode: 'insensitive' } },
          ],
        },
      ],
    };

    const [total, rows, todayCount, failureCount] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: sortDirection }, { id: sortDirection }],
        select: {
          id: true,
          createdAt: true,
          actorUserId: true,
          actorUser: {
            select: {
              name: true,
              userRoles: {
                select: { role: { select: { code: true } } },
                orderBy: { role: { code: 'asc' } },
              },
            },
          },
          action: true,
          targetType: true,
          targetId: true,
          projectId: true,
          project: { select: { name: true } },
          summary: true,
          metadata: true,
          afterData: true,
        },
      }),
      this.prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
      this.prisma.auditLog.count({ where: failureWhere }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        actorId: row.actorUserId,
        actorName: row.actorUser?.name ?? '系统',
        actorRole:
          row.actorUser?.userRoles.map((item) => item.role.code).join('、') || null,
        action: row.action,
        entityType: row.targetType,
        entityId: row.targetId,
        projectId: row.projectId,
        projectName: row.project?.name ?? null,
        result: this.readAuditString([row.metadata, row.afterData], ['result', 'outcome', 'status']),
        requestId: this.readAuditString([row.metadata], ['requestId', 'traceId', 'correlationId']),
        summary: truncateString(sanitizeString(row.summary ?? row.action), 240),
      })),
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      sort: `createdAt:${sortDirection}`,
      summary: {
        todayCount,
        failureCount,
        filteredCount: total,
      },
    };
  }

  async getAuditLogDetail(auditLogId: string) {
    const row = await this.prisma.auditLog.findUnique({
      where: { id: auditLogId },
      select: {
        id: true,
        createdAt: true,
        actorUserId: true,
        actorUser: {
          select: {
            name: true,
            userRoles: {
              select: { role: { select: { code: true } } },
              orderBy: { role: { code: 'asc' } },
            },
          },
        },
        action: true,
        targetType: true,
        targetId: true,
        projectId: true,
        project: { select: { name: true } },
        nodeCode: true,
        summary: true,
        beforeData: true,
        afterData: true,
        metadata: true,
      },
    });

    if (!row) {
      throw new NotFoundException('审计日志不存在或已被删除。');
    }

    const ipAddress = this.readAuditString([row.metadata], [
      'ip',
      'ipAddress',
      'clientIp',
      'remoteIp',
    ]);
    const userAgent = this.readAuditString([row.metadata], ['userAgent', 'user-agent']);

    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      actorId: row.actorUserId,
      actorName: row.actorUser?.name ?? '系统',
      actorRole: row.actorUser?.userRoles.map((item) => item.role.code).join('、') || null,
      action: row.action,
      entityType: row.targetType,
      entityId: row.targetId,
      projectId: row.projectId,
      projectName: row.project?.name ?? null,
      nodeCode: row.nodeCode,
      result: this.readAuditString([row.metadata, row.afterData], ['result', 'outcome', 'status']),
      requestId: this.readAuditString([row.metadata], ['requestId', 'traceId', 'correlationId']),
      ipAddress: ipAddress ? maskIpAddress(ipAddress) : null,
      userAgent: userAgent ? truncateString(sanitizeString(userAgent), 256) : null,
      summary: truncateString(sanitizeString(row.summary ?? row.action), 500),
      reason: this.readAuditString(
        [row.metadata, row.afterData, row.beforeData],
        ['reason', 'rejectReason', 'comment'],
      ),
      beforeSummary: sanitizeAuditValue(row.beforeData),
      afterSummary: sanitizeAuditValue(row.afterData),
      metadata: sanitizeAuditValue(row.metadata),
    };
  }

  private buildAuditWhere(
    query: AdminAuditQueryDto,
    from: Date | null,
    to: Date | null,
  ): Prisma.AuditLogWhereInput {
    const createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
    const and: Prisma.AuditLogWhereInput[] = [];

    if (query.result) {
      and.push({
        OR: [
          { metadata: { path: ['result'], equals: query.result } },
          { metadata: { path: ['outcome'], equals: query.result } },
          { afterData: { path: ['result'], equals: query.result } },
          { afterData: { path: ['status'], equals: query.result } },
        ],
      });
    }
    if (query.requestId) {
      and.push({
        OR: [
          { metadata: { path: ['requestId'], equals: query.requestId } },
          { metadata: { path: ['traceId'], equals: query.requestId } },
          { metadata: { path: ['correlationId'], equals: query.requestId } },
        ],
      });
    }
    if (query.keyword) {
      and.push({
        OR: [
          { action: { contains: query.keyword, mode: 'insensitive' } },
          { summary: { contains: query.keyword, mode: 'insensitive' } },
          { targetId: { contains: query.keyword, mode: 'insensitive' } },
          { actorUser: { name: { contains: query.keyword, mode: 'insensitive' } } },
          { project: { name: { contains: query.keyword, mode: 'insensitive' } } },
          { project: { code: { contains: query.keyword, mode: 'insensitive' } } },
        ],
      });
    }

    return {
      ...(from || to ? { createdAt } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.actorName
        ? { actorUser: { name: { contains: query.actorName, mode: 'insensitive' } } }
        : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { targetType: query.entityType as AuditTargetType } : {}),
      ...(query.entityId ? { targetId: query.entityId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(and.length ? { AND: and } : {}),
    };
  }

  private readAuditString(values: unknown[], keys: string[]) {
    for (const value of values) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const record = value as Record<string, unknown>;
      for (const key of keys) {
        const candidate = record[key];
        if (typeof candidate === 'string' && candidate.trim()) {
          return truncateString(sanitizeString(candidate.trim()), 256);
        }
        if (typeof candidate === 'number' || typeof candidate === 'boolean') {
          return String(candidate);
        }
      }
    }
    return null;
  }
}

function stripArchiveMaterials(archive: ColorArchive) {
  return Object.fromEntries(
    Object.entries(archive).filter(([field]) => field !== 'materials' && field !== 'key'),
  ) as Omit<ColorArchive, 'materials' | 'key'>;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, 'zh-CN'),
  );
}

function uniqueById<T extends { id: string }>(values: T[]) {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

function latestIso(...values: string[]) {
  return values.reduce((latest, value) => (value > latest ? value : latest), values[0] ?? new Date(0).toISOString());
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readOptionalText(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readColorValue(record: Record<string, unknown> | null) {
  const value = readOptionalText(record, ['displayColor', 'displayHex', 'colorHex', 'hex']);
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function getStepName(stepNumber: number) {
  const entry = Object.values(WORKFLOW_NODE_META_MAP).find(
    (meta) => meta.sequence / 10 === stepNumber,
  );
  return entry?.name ?? `第 ${stepNumber} 步`;
}

function getArchiveCategory(stepNumber: number | null) {
  if (stepNumber === null) return '待分类材料';
  return COLOR_ARCHIVE_STAGES.find(
    (stage) => stepNumber >= stage.from && stepNumber <= stage.to,
  )?.title ?? '待分类材料';
}

function canPreviewMimeType(mimeType: string) {
  return mimeType.startsWith('image/') || mimeType === 'application/pdf' || mimeType.startsWith('text/');
}

export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return truncateString(sanitizeString(value), MAX_DETAIL_STRING_LENGTH);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (depth >= MAX_DETAIL_DEPTH) {
    return '[TRUNCATED]';
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeAuditValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    return Object.fromEntries(
      entries.map(([key, item]) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          return [key, '[REDACTED]'];
        }
        if (IP_KEY_PATTERN.test(key) && typeof item === 'string') {
          return [key, maskIpAddress(item)];
        }
        if (USER_AGENT_KEY_PATTERN.test(key) && typeof item === 'string') {
          return [key, truncateString(sanitizeString(item), 256)];
        }
        return [key, sanitizeAuditValue(item, depth + 1)];
      }),
    );
  }
  return String(value);
}

function sanitizeString(value: string) {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:postgres(?:ql)?|redis):\/\/[^\s]+/gi, '[REDACTED_URL]')
    .replace(
      /\b(?:authorization|cookie|set-cookie|password|token|secret)\s*[:=]\s*[^\s,;]+/gi,
      (match) => {
        const separatorIndex = match.search(/[:=]/);
        return separatorIndex < 0
          ? '[REDACTED]'
          : `${match.slice(0, separatorIndex + 1)} [REDACTED]`;
      },
    );
}

function truncateString(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}

function maskIpAddress(value: string) {
  const ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    return `${ipv4[1]}.${ipv4[2]}.*.*`;
  }
  if (value.includes(':')) {
    const [first = '', second = ''] = value.split(':');
    return `${first}:${second}:*:*`;
  }
  return '[REDACTED_IP]';
}
