import { teamProjectScope } from '../../common/team-authorization';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AttachmentScanStatus,
  AttachmentTargetType,
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
const MAX_COLOR_DATABASE_PAGE = 100;
const MAX_COLOR_DATABASE_PAGE_SIZE = 48;
const MAX_COLOR_DATABASE_FACET_VALUES = 100;
const MAX_COLOR_ARCHIVE_MATERIALS = 500;
const MAX_COLOR_ARCHIVE_SUPPLIERS = 100;

const CONTROLLED_COLOR_ARCHIVE_WHERE = {
  code: { not: null },
  numberingTaskId: { not: null },
  numberedById: { not: null },
  numberedAt: { not: null },
  numberingAttachmentId: { not: null },
  numberingTask: {
    is: {
      nodeCode: WorkflowNodeCode.COLOR_NUMBERING,
      status: WorkflowTaskStatus.COMPLETED,
    },
  },
  numberingAttachment: {
    is: {
      entityType: AttachmentTargetType.WORKFLOW_TASK,
      isDeleted: false,
      scanStatus: AttachmentScanStatus.CLEAN,
    },
  },
} satisfies Prisma.ColorWhereInput;

const COLOR_ARCHIVE_STAGES = [
  { key: 'INITIATION', title: '需求与立项', from: 1, to: 2 },
  { key: 'DEVELOPMENT', title: '颜色开发与确认', from: 3, to: 5 },
  { key: 'PROCUREMENT', title: '采购与标准板', from: 6, to: 8 },
  { key: 'VALIDATION', title: '性能、试制与评审', from: 9, to: 12 },
  { key: 'ACCEPTANCE', title: '收费与一致性评审', from: 13, to: 14 },
  { key: 'PRODUCTION', title: '排产与批量生产', from: 15, to: 16 },
  { key: 'LIFECYCLE', title: '月度评审与颜色退出', from: 17, to: 18 },
] as const;

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
  materialsHasMore: boolean;
  materialCount: number;
  coveredSteps: number;
  completenessPercent: number;
  updatedAt: string;
  createdAt: string;
};

type ColorArchiveMaterialRow = {
  colorId: string;
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  stepNumber: number | null;
  stepCode: string | null;
  nodeName: string | null;
  fileName: string;
  originalFileName: string | null;
  mimeType: string;
  fileSize: number;
  materialType: string | null;
  versionNo: number;
  replacesAttachmentId: string | null;
  uploaderId: string | null;
  uploaderName: string | null;
  uploaderDepartmentName: string | null;
  uploadedAt: Date;
  hasNewerVersion: boolean;
};

type ColorArchiveStatRow = {
  id: string;
  materialCount: bigint | number;
  coveredSteps: bigint | number;
  archiveUpdatedAt: Date;
  suppliers: string[];
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
      this.prisma.color.count({ where: CONTROLLED_COLOR_ARCHIVE_WHERE }),
      this.prisma.attachment.count({
        where: {
          isDeleted: false,
          scanStatus: AttachmentScanStatus.CLEAN,
          project: {
            colors: { some: CONTROLLED_COLOR_ARCHIVE_WHERE },
          },
        },
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
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    if (!Number.isInteger(page) || page < 1 || page > MAX_COLOR_DATABASE_PAGE) {
      throw new BadRequestException(
        `页码必须为 1～${MAX_COLOR_DATABASE_PAGE} 之间的整数。`,
      );
    }
    if (
      !Number.isInteger(pageSize)
      || pageSize < 1
      || pageSize > MAX_COLOR_DATABASE_PAGE_SIZE
    ) {
      throw new BadRequestException(
        `每页数量必须为 1～${MAX_COLOR_DATABASE_PAGE_SIZE} 之间的整数。`,
      );
    }
    const offset = (page - 1) * pageSize;
    const search = query.search?.toLocaleLowerCase('zh-CN');
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const filters: Prisma.Sql[] = [];
    if (search) {
      filters.push(Prisma.sql`(
        STRPOS(LOWER(catalog."name"), ${search}) > 0
        OR STRPOS(LOWER(COALESCE(catalog."code", '')), ${search}) > 0
        OR STRPOS(LOWER(COALESCE(catalog."vehicleModel", '')), ${search}) > 0
        OR STRPOS(LOWER(catalog."projectCode"), ${search}) > 0
        OR STRPOS(LOWER(catalog."projectName"), ${search}) > 0
      )`);
    }
    if (query.vehicleModel) {
      filters.push(Prisma.sql`catalog."vehicleModel" = ${query.vehicleModel}`);
    }
    if (query.colorType) {
      filters.push(Prisma.sql`catalog."colorType" = ${query.colorType}`);
    }
    if (query.status) {
      filters.push(Prisma.sql`catalog."status"::text = ${query.status}`);
    }
    if (query.completeness === 'COMPLETE') {
      filters.push(Prisma.sql`catalog."coveredSteps" = 18`);
    } else if (query.completeness === 'INCOMPLETE') {
      filters.push(Prisma.sql`catalog."coveredSteps" < 18`);
    }
    if (query.year) {
      filters.push(
        Prisma.sql`EXTRACT(YEAR FROM catalog."archiveUpdatedAt")::integer = ${query.year}`,
      );
    }
    const filterSql = filters.length ? Prisma.join(filters, ' AND ') : Prisma.sql`TRUE`;
    const catalogCtes = this.buildColorCatalogCtes(actor);

    const [pageRows, summaryRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ ids: string[]; total: bigint | number }>>(Prisma.sql`
        WITH ${catalogCtes}, filtered_catalog AS MATERIALIZED (
          SELECT catalog.*
          FROM catalog
          WHERE ${filterSql}
        )
        SELECT
          ARRAY(
            SELECT filtered_catalog."id"
            FROM filtered_catalog
            ORDER BY filtered_catalog."archiveUpdatedAt" DESC, filtered_catalog."id" ASC
            LIMIT ${pageSize}
            OFFSET ${offset}
          ) AS "ids",
          (SELECT COUNT(*) FROM filtered_catalog) AS "total"
      `),
      this.prisma.$queryRaw<Array<{
        archivedColors: bigint | number;
        materialCount: bigint | number;
        incompleteColors: bigint | number;
        newMaterialsThisMonth: bigint | number;
        vehicleModels: string[];
        colorTypes: string[];
        statuses: string[];
        years: number[];
      }>>(Prisma.sql`
        WITH ${catalogCtes}
        SELECT
          (SELECT COUNT(*) FROM catalog) AS "archivedColors",
          (SELECT COALESCE(SUM("materialCount"), 0) FROM catalog) AS "materialCount",
          (SELECT COUNT(*) FROM catalog WHERE "coveredSteps" < 18) AS "incompleteColors",
          (
            SELECT COUNT(*)
            FROM material_rows
            WHERE "uploadedAt" >= ${thisMonth}
          ) AS "newMaterialsThisMonth",
          ARRAY(
            SELECT DISTINCT "vehicleModel"
            FROM catalog
            WHERE "vehicleModel" IS NOT NULL
            ORDER BY "vehicleModel"
            LIMIT ${MAX_COLOR_DATABASE_FACET_VALUES}
          ) AS "vehicleModels",
          ARRAY(
            SELECT DISTINCT "colorType"
            FROM catalog
            WHERE "colorType" IS NOT NULL
            ORDER BY "colorType"
            LIMIT ${MAX_COLOR_DATABASE_FACET_VALUES}
          ) AS "colorTypes",
          ARRAY(
            SELECT DISTINCT "status"::text
            FROM catalog
            ORDER BY "status"::text
            LIMIT ${MAX_COLOR_DATABASE_FACET_VALUES}
          ) AS "statuses",
          ARRAY(
            SELECT DISTINCT EXTRACT(YEAR FROM "archiveUpdatedAt")::integer AS "year"
            FROM catalog
            ORDER BY "year"
            LIMIT ${MAX_COLOR_DATABASE_FACET_VALUES}
          ) AS "years"
      `),
    ]);

    const pageResult = pageRows[0] ?? { ids: [], total: 0 };
    const summary = summaryRows[0] ?? {
      archivedColors: 0,
      materialCount: 0,
      incompleteColors: 0,
      newMaterialsThisMonth: 0,
      vehicleModels: [],
      colorTypes: [],
      statuses: [],
      years: [],
    };
    const pageIds = pageResult.ids.slice(0, pageSize);
    const archives = await this.buildColorArchives(actor, { colorIds: pageIds, take: pageSize });
    const archiveById = new Map(archives.map((archive) => [archive.id, archive]));
    const items = pageIds
      .map((colorId) => archiveById.get(colorId))
      .filter((archive): archive is ColorArchive => Boolean(archive))
      .map(stripArchiveMaterials);
    const total = Number(pageResult.total);

    return {
      generatedAt: new Date().toISOString(),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      summary: {
        archivedColors: Number(summary.archivedColors),
        materialCount: Number(summary.materialCount),
        incompleteColors: Number(summary.incompleteColors),
        newMaterialsThisMonth: Number(summary.newMaterialsThisMonth),
      },
      facets: {
        vehicleModels: uniqueSorted(summary.vehicleModels),
        colorTypes: uniqueSorted(summary.colorTypes),
        statuses: uniqueSorted(summary.statuses),
        years: [...new Set(summary.years)].sort((left, right) => left - right),
      },
      items,
    };
  }

  async getColorArchive(colorId: string, actor?: AuthenticatedUser) {
    const archive = (await this.buildColorArchives(actor, { exactColorId: colorId }))[0];
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

  private buildColorCatalogCtes(
    actor?: AuthenticatedUser,
    selector?: { colorIds: string[] } | { exactColorId: string },
  ): Prisma.Sql {
    if (actor) teamProjectScope(actor);
    const projectScope = Prisma.sql`TRUE`;
    const colorScope = selector
      ? 'exactColorId' in selector
        ? Prisma.sql`AND c."id" = ${selector.exactColorId}`
        : Prisma.sql`AND c."id" IN (${Prisma.join(
            selector.colorIds.slice(0, MAX_COLOR_DATABASE_PAGE_SIZE),
          )})`
      : Prisma.empty;
    const classificationContext = selector
      ? Prisma.sql`
          archive_color_context AS MATERIALIZED (
            SELECT
              context_color."id",
              context_color."projectId",
              context_color."isPrimary",
              context_color."updatedAt"
            FROM "colors" context_color
            INNER JOIN (
              SELECT DISTINCT scoped_color."projectId"
              FROM scoped_colors scoped_color
            ) selected_project ON selected_project."projectId" = context_color."projectId"
            INNER JOIN "workflow_tasks" context_numbering_task
              ON context_numbering_task."id" = context_color."numberingTaskId"
              AND context_numbering_task."nodeCode" = ${WorkflowNodeCode.COLOR_NUMBERING}::"WorkflowNodeCode"
              AND context_numbering_task."status" = ${WorkflowTaskStatus.COMPLETED}::"WorkflowTaskStatus"
            INNER JOIN "attachments" context_numbering_attachment
              ON context_numbering_attachment."id" = context_color."numberingAttachmentId"
              AND context_numbering_attachment."targetType" = ${AttachmentTargetType.WORKFLOW_TASK}::"AttachmentTargetType"
              AND context_numbering_attachment."targetId" = context_numbering_task."id"
              AND context_numbering_attachment."isDeleted" = FALSE
              AND context_numbering_attachment."scanStatus" = ${AttachmentScanStatus.CLEAN}::"AttachmentScanStatus"
            WHERE context_color."code" IS NOT NULL
              AND context_color."numberingTaskId" IS NOT NULL
              AND context_color."numberedById" IS NOT NULL
              AND context_color."numberedAt" IS NOT NULL
              AND context_color."numberingAttachmentId" IS NOT NULL
          )
        `
      : Prisma.sql`
          archive_color_context AS MATERIALIZED (
            SELECT
              scoped_color."id",
              scoped_color."projectId",
              scoped_color."isPrimary",
              scoped_color."updatedAt"
            FROM scoped_colors scoped_color
          )
        `;

    return Prisma.sql`
      scoped_colors AS MATERIALIZED (
        SELECT
          c."id",
          c."projectId",
          c."name",
          c."code",
          c."status",
          c."isPrimary",
          c."createdAt",
          c."updatedAt",
          p."code" AS "projectCode",
          p."name" AS "projectName",
          p."vehicleModel",
          COALESCE(
            NULLIF(BTRIM(latest_version."technicalData" ->> 'colorType'), ''),
            NULLIF(BTRIM(latest_version."technicalData" ->> 'paintType'), ''),
            NULLIF(BTRIM(latest_version."technicalData" ->> 'type'), '')
          ) AS "colorType"
        FROM "colors" c
        INNER JOIN "projects" p ON p."id" = c."projectId"
        INNER JOIN "workflow_tasks" numbering_task
          ON numbering_task."id" = c."numberingTaskId"
          AND numbering_task."nodeCode" = ${WorkflowNodeCode.COLOR_NUMBERING}::"WorkflowNodeCode"
          AND numbering_task."status" = ${WorkflowTaskStatus.COMPLETED}::"WorkflowTaskStatus"
        INNER JOIN "attachments" numbering_attachment
          ON numbering_attachment."id" = c."numberingAttachmentId"
          AND numbering_attachment."targetType" = ${AttachmentTargetType.WORKFLOW_TASK}::"AttachmentTargetType"
          AND numbering_attachment."targetId" = numbering_task."id"
          AND numbering_attachment."isDeleted" = FALSE
          AND numbering_attachment."scanStatus" = ${AttachmentScanStatus.CLEAN}::"AttachmentScanStatus"
        LEFT JOIN LATERAL (
          SELECT cv."technicalData"
          FROM "color_versions" cv
          WHERE cv."colorId" = c."id"
          ORDER BY cv."versionNo" DESC
          LIMIT 1
        ) latest_version ON TRUE
        WHERE c."code" IS NOT NULL
          AND c."numberingTaskId" IS NOT NULL
          AND c."numberedById" IS NOT NULL
          AND c."numberedAt" IS NOT NULL
          AND c."numberingAttachmentId" IS NOT NULL
          AND ${projectScope}
          ${colorScope}
      ), ${classificationContext}, fallback_colors AS MATERIALIZED (
        SELECT DISTINCT ON (context_color."projectId")
          context_color."projectId",
          context_color."id" AS "colorId"
        FROM archive_color_context context_color
        ORDER BY
          context_color."projectId",
          context_color."isPrimary" DESC,
          context_color."updatedAt" DESC,
          context_color."id" ASC
      ), classified_attachments AS MATERIALIZED (
        SELECT
          attachment."id",
          attachment."projectId",
          attachment."uploadedAt",
          COALESCE(
            CASE
              WHEN attachment."targetType" = ${AttachmentTargetType.COLOR}::"AttachmentTargetType"
                AND EXISTS (
                  SELECT 1
                  FROM archive_color_context direct_color
                  WHERE direct_color."projectId" = attachment."projectId"
                    AND direct_color."id" = attachment."targetId"
                )
                THEN attachment."targetId"
              WHEN attachment."targetType" = ${AttachmentTargetType.COLOR_VERSION}::"AttachmentTargetType"
                THEN (
                  SELECT direct_version."colorId"
                  FROM "color_versions" direct_version
                  INNER JOIN archive_color_context direct_color
                    ON direct_color."id" = direct_version."colorId"
                    AND direct_color."projectId" = attachment."projectId"
                  WHERE direct_version."id" = attachment."targetId"
                  LIMIT 1
                )
              ELSE NULL
            END,
            fallback_color."colorId"
          ) AS "colorId",
          CASE
            WHEN attachment."targetType" = ${AttachmentTargetType.WORKFLOW_TASK}::"AttachmentTargetType"
              THEN CASE workflow_task."nodeCode"
                WHEN ${WorkflowNodeCode.PROJECT_INITIATION}::"WorkflowNodeCode" THEN 1
                WHEN ${WorkflowNodeCode.DEVELOPMENT_REPORT}::"WorkflowNodeCode" THEN 2
                WHEN ${WorkflowNodeCode.PAINT_DEVELOPMENT}::"WorkflowNodeCode" THEN 3
                WHEN ${WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION}::"WorkflowNodeCode" THEN 4
                WHEN ${WorkflowNodeCode.COLOR_NUMBERING}::"WorkflowNodeCode" THEN 5
                WHEN ${WorkflowNodeCode.PAINT_PROCUREMENT}::"WorkflowNodeCode" THEN 6
                WHEN ${WorkflowNodeCode.STANDARD_BOARD_PRODUCTION}::"WorkflowNodeCode" THEN 7
                WHEN ${WorkflowNodeCode.BOARD_DETAIL_UPDATE}::"WorkflowNodeCode" THEN 8
                WHEN ${WorkflowNodeCode.PERFORMANCE_TEST}::"WorkflowNodeCode" THEN 9
                WHEN ${WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN}::"WorkflowNodeCode" THEN 10
                WHEN ${WorkflowNodeCode.TRIAL_PRODUCTION}::"WorkflowNodeCode" THEN 11
                WHEN ${WorkflowNodeCode.CAB_REVIEW}::"WorkflowNodeCode" THEN 12
                WHEN ${WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE}::"WorkflowNodeCode" THEN 13
                WHEN ${WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW}::"WorkflowNodeCode" THEN 14
                WHEN ${WorkflowNodeCode.MASS_PRODUCTION_PLAN}::"WorkflowNodeCode" THEN 15
                WHEN ${WorkflowNodeCode.MASS_PRODUCTION}::"WorkflowNodeCode" THEN 16
                WHEN ${WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW}::"WorkflowNodeCode" THEN 17
                WHEN ${WorkflowNodeCode.PROJECT_CLOSED}::"WorkflowNodeCode" THEN 18
                ELSE NULL
              END
            WHEN attachment."targetType" = ${AttachmentTargetType.PROJECT}::"AttachmentTargetType" THEN 1
            WHEN attachment."targetType" = ${AttachmentTargetType.NEW_COLOR_REPORT}::"AttachmentTargetType" THEN 2
            WHEN attachment."targetType" = ${AttachmentTargetType.COLOR_VERSION}::"AttachmentTargetType" THEN 3
            WHEN attachment."targetType" = ${AttachmentTargetType.SAMPLE}::"AttachmentTargetType" THEN 4
            WHEN attachment."targetType" = ${AttachmentTargetType.COLOR}::"AttachmentTargetType" THEN 5
            WHEN attachment."targetType" = ${AttachmentTargetType.STANDARD_BOARD}::"AttachmentTargetType" THEN 7
            WHEN attachment."targetType" = ${AttachmentTargetType.PERFORMANCE_TEST}::"AttachmentTargetType" THEN 9
            WHEN attachment."targetType" = ${AttachmentTargetType.PRODUCTION_PLAN}::"AttachmentTargetType" THEN 10
            WHEN attachment."targetType" = ${AttachmentTargetType.TRIAL_PRODUCTION}::"AttachmentTargetType" THEN 11
            WHEN attachment."targetType" = ${AttachmentTargetType.REVIEW_RECORD}::"AttachmentTargetType" THEN 12
            ELSE NULL
          END AS "stepNumber"
        FROM "attachments" attachment
        INNER JOIN fallback_colors fallback_color
          ON fallback_color."projectId" = attachment."projectId"
        LEFT JOIN "workflow_tasks" workflow_task
          ON attachment."targetType" = ${AttachmentTargetType.WORKFLOW_TASK}::"AttachmentTargetType"
          AND workflow_task."id" = attachment."targetId"
        WHERE attachment."isDeleted" = FALSE
          AND attachment."scanStatus" = ${AttachmentScanStatus.CLEAN}::"AttachmentScanStatus"
      ), material_rows AS MATERIALIZED (
        SELECT
          classified_attachment."id",
          classified_attachment."colorId",
          classified_attachment."uploadedAt",
          classified_attachment."stepNumber"
        FROM classified_attachments classified_attachment
        WHERE classified_attachment."colorId" IS NOT NULL
      ), material_stats AS MATERIALIZED (
        SELECT
          material."colorId",
          COUNT(*) AS "materialCount",
          COUNT(DISTINCT material."stepNumber") AS "coveredSteps",
          MAX(material."uploadedAt") AS "latestMaterialAt"
        FROM material_rows material
        GROUP BY material."colorId"
      ), catalog AS MATERIALIZED (
        SELECT
          scoped_color.*,
          COALESCE(material_stat."materialCount", 0) AS "materialCount",
          COALESCE(material_stat."coveredSteps", 0) AS "coveredSteps",
          GREATEST(
            scoped_color."updatedAt",
            COALESCE(material_stat."latestMaterialAt", scoped_color."updatedAt")
          ) AS "archiveUpdatedAt"
        FROM scoped_colors scoped_color
        LEFT JOIN material_stats material_stat
          ON material_stat."colorId" = scoped_color."id"
      )
    `;
  }

  private async buildColorArchives(
    actor: AuthenticatedUser | undefined,
    selector: { colorIds: string[]; take: number } | { exactColorId: string },
  ): Promise<ColorArchive[]> {
    const projectScope = actor ? teamProjectScope(actor) : undefined;
    if ('colorIds' in selector && selector.colorIds.length === 0) return [];
    const selectorWhere: Prisma.ColorWhereInput = 'exactColorId' in selector
      ? { id: selector.exactColorId }
      : { id: { in: selector.colorIds.slice(0, MAX_COLOR_DATABASE_PAGE_SIZE) } };
    const where: Prisma.ColorWhereInput = {
      AND: [
        CONTROLLED_COLOR_ARCHIVE_WHERE,
        selectorWhere,
        ...(projectScope ? [{ project: { is: projectScope } }] : []),
      ],
    };
    const query = {
      where,
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
        numberingTask: {
          select: {
            id: true,
            nodeCode: true,
            status: true,
          },
        },
        numberingAttachment: {
          select: {
            id: true,
            entityType: true,
            entityId: true,
            isDeleted: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    } satisfies Prisma.ColorFindManyArgs;
    type ArchiveColor = Prisma.ColorGetPayload<typeof query>;
    let colors: ArchiveColor[];
    if ('exactColorId' in selector) {
      const exactColor = await this.prisma.color.findFirst(query);
      colors = exactColor ? [exactColor] : [];
    } else {
      colors = await this.prisma.color.findMany({ ...query, take: selector.take });
    }
    if (!colors.length) return [];
    const selectedColorIds = colors
      .map((color) => color.id)
      .slice(0, MAX_COLOR_DATABASE_PAGE_SIZE);
    const catalogSelector = 'exactColorId' in selector
      ? { exactColorId: selectedColorIds[0]! }
      : { colorIds: selectedColorIds };
    const statRows = await this.prisma.$queryRaw<ColorArchiveStatRow[]>(Prisma.sql`
      WITH ${this.buildColorCatalogCtes(actor, catalogSelector)}
      SELECT
        catalog."id",
        catalog."materialCount",
        catalog."coveredSteps",
        catalog."archiveUpdatedAt",
        ARRAY(
          SELECT DISTINCT supplier."name"
          FROM "paint_procurements" procurement
          INNER JOIN "suppliers" supplier ON supplier."id" = procurement."supplierId"
          WHERE procurement."colorId" = catalog."id"
            AND supplier."name" IS NOT NULL
          ORDER BY supplier."name"
          LIMIT ${MAX_COLOR_ARCHIVE_SUPPLIERS}
        ) AS "suppliers"
      FROM catalog
      ORDER BY catalog."archiveUpdatedAt" DESC, catalog."id" ASC
      LIMIT ${MAX_COLOR_DATABASE_PAGE_SIZE}
    `);
    const statByColorId = new Map(statRows.map((row) => [row.id, row]));
    let materialRows: ColorArchiveMaterialRow[] = [];
    let materialsHasMore = false;
    if ('exactColorId' in selector) {
      const candidateRows = await this.prisma.$queryRaw<ColorArchiveMaterialRow[]>(Prisma.sql`
        WITH ${this.buildColorCatalogCtes(actor, catalogSelector)}
        SELECT
          material."colorId",
          attachment."id",
          attachment."projectId",
          catalog."projectCode",
          catalog."projectName",
          material."stepNumber",
          workflow_task."stepCode",
          workflow_task."nodeName",
          attachment."fileName",
          attachment."originalFileName",
          attachment."contentType" AS "mimeType",
          attachment."fileSize",
          attachment."materialType",
          attachment."versionNo",
          attachment."replacesAttachmentId",
          uploader."id" AS "uploaderId",
          uploader."name" AS "uploaderName",
          uploader_department."name" AS "uploaderDepartmentName",
          attachment."uploadedAt",
          EXISTS (
            SELECT 1
            FROM material_rows replacement_material
            INNER JOIN "attachments" replacement_attachment
              ON replacement_attachment."id" = replacement_material."id"
            WHERE replacement_material."colorId" = material."colorId"
              AND replacement_attachment."replacesAttachmentId" = attachment."id"
          ) AS "hasNewerVersion"
        FROM material_rows material
        INNER JOIN catalog ON catalog."id" = material."colorId"
        INNER JOIN "attachments" attachment ON attachment."id" = material."id"
        LEFT JOIN "workflow_tasks" workflow_task
          ON attachment."targetType" = ${AttachmentTargetType.WORKFLOW_TASK}::"AttachmentTargetType"
          AND workflow_task."id" = attachment."targetId"
        LEFT JOIN "users" uploader ON uploader."id" = attachment."uploadedById"
        LEFT JOIN "departments" uploader_department
          ON uploader_department."id" = uploader."departmentId"
        ORDER BY material."uploadedAt" DESC, material."id" DESC
        LIMIT ${MAX_COLOR_ARCHIVE_MATERIALS + 1}
      `);
      materialsHasMore = candidateRows.length > MAX_COLOR_ARCHIVE_MATERIALS;
      materialRows = candidateRows.slice(0, MAX_COLOR_ARCHIVE_MATERIALS);
    }
    const materialsByColorId = new Map<string, ArchiveMaterial[]>();
    for (const row of materialRows) {
      const stepName = row.nodeName ?? (row.stepNumber ? getStepName(row.stepNumber) : '待分类材料');
      const material: ArchiveMaterial = {
        id: row.id,
        projectId: row.projectId,
        projectCode: row.projectCode,
        projectName: row.projectName,
        stepNumber: row.stepNumber,
        stepCode: row.stepCode ?? (row.stepNumber ? String(row.stepNumber).padStart(2, '0') : null),
        stepName,
        archiveCategory: getArchiveCategory(row.stepNumber),
        fileName: row.originalFileName ?? row.fileName,
        mimeType: row.mimeType,
        fileSize: row.fileSize,
        materialType: row.materialType,
        versionNo: row.versionNo,
        replacesAttachmentId: row.replacesAttachmentId,
        uploader: row.uploaderId && row.uploaderName
          ? {
              id: row.uploaderId,
              name: row.uploaderName,
              departmentName: row.uploaderDepartmentName,
            }
          : null,
        uploadedAt: row.uploadedAt.toISOString(),
        versionStatus: row.hasNewerVersion ? 'HISTORICAL' : 'CURRENT',
        downloadUrl: `/projects/${row.projectId}/attachments/${row.id}/download`,
        previewUrl: canPreviewMimeType(row.mimeType)
          ? `/projects/${row.projectId}/attachments/${row.id}/download?disposition=inline`
          : null,
      };
      const colorMaterials = materialsByColorId.get(row.colorId) ?? [];
      colorMaterials.push(material);
      materialsByColorId.set(row.colorId, colorMaterials);
    }

    const archiveByKey = new Map<string, ColorArchive>();
    for (const color of colors) {
      const controlledCode =
        color.code &&
        color.numberingTaskId &&
        color.numberedById &&
        color.numberedAt &&
        color.numberingAttachmentId &&
        color.numberingTask?.nodeCode ===
          WorkflowNodeCode.COLOR_NUMBERING &&
        color.numberingTask.status === WorkflowTaskStatus.COMPLETED &&
        color.numberingAttachment?.entityType ===
          AttachmentTargetType.WORKFLOW_TASK &&
        color.numberingAttachment.entityId ===
          color.numberingTaskId &&
        !color.numberingAttachment.isDeleted
          ? color.code
          : null;
      // This legacy archive requires an actual development project. Historical imports use the shared register.
      if (!controlledCode || !color.project) continue;
      const key = (
        `code:${controlledCode}`
      ).toLocaleLowerCase('zh-CN');
      const technicalData = readRecord(color.versions[0]?.technicalData);
      const displayColor = readColorValue(technicalData);
      const colorType = readOptionalText(technicalData, ['colorType', 'paintType', 'type']);
      const materials = materialsByColorId.get(color.id) ?? [];
      const stat = statByColorId.get(color.id);
      const project = {
        id: color.project.id,
        code: color.project.code,
        name: color.project.name,
        status: color.project.status,
      };
      const suppliers = stat?.suppliers ?? [];
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
        code: controlledCode,
        displayColor,
        colorType,
        status: color.status,
        vehicleModels: color.project.vehicleModel ? [color.project.vehicleModel] : [],
        suppliers,
        projects: [project],
        firstProject: { id: project.id, code: project.code, name: project.name },
        materials,
        materialsHasMore,
        materialCount: Number(stat?.materialCount ?? materials.length),
        coveredSteps: Number(stat?.coveredSteps ?? 0),
        completenessPercent: Math.round((Number(stat?.coveredSteps ?? 0) / 18) * 100),
        updatedAt: stat?.archiveUpdatedAt.toISOString() ?? color.updatedAt.toISOString(),
        createdAt: color.createdAt.toISOString(),
      });
    }

    return [...archiveByKey.values()]
      .map((archive) => {
        archive.materials.sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
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
