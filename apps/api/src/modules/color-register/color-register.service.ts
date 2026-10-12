import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ColorRegisterStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { assertApprovedTeamMember } from '../../common/team-membership';
import { withTeamWrite } from '../../common/team-authorization';
import { appendColorStandard, lockRegisterColor, parseColorTechnicalData, parseRegisterMonth } from '../../common/color-standard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { readSystemColorProduction } from './color-production';
import { commandHash, identity, jsonData, object, pagination, parseNotes, parseSheetChanges, positiveInt, textField } from './color-register.rules';

const REGISTER_SELECT = {
  id: true, name: true, code: true, projectId: true, productionBaseId: true, manufacturer: true, paintType: true,
  registerStatus: true, registerMonth: true, registerNote: true, registerRevision: true,
  productionBase: { select: { id: true, name: true } },
  versions: { orderBy: { versionNo: 'desc' }, take: 1, select: {
    id: true, boardCode: true, sourceReference: true,
    reviewRecords: { where: { reviewType: 'COLOR_CONSISTENCY_REVIEW', result: 'APPROVED', workflowTask: { status: 'APPROVED' } }, take: 1, select: { id: true } },
  } },
} satisfies Prisma.ColorSelect;
type RegisterColor = Prisma.ColorGetPayload<{ select: typeof REGISTER_SELECT }>;
function sourceReference(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, Prisma.JsonValue>;
  return typeof source.fileName === 'string' && typeof source.sheetName === 'string' && Array.isArray(source.rowNumbers)
    ? { fileName: source.fileName, sheetName: source.sheetName, rowNumbers: source.rowNumbers.filter((n): n is number => typeof n === 'number') } : null;
}
function row(color: RegisterColor) {
  const version = color.versions[0];
  const source = sourceReference(version?.sourceReference ?? null);
  return { id: color.id, colorId: color.id, name: color.name, formalCode: color.code, base: color.productionBase,
    manufacturer: color.manufacturer, paintType: color.paintType, boardCode: version?.boardCode ?? null,
    registerMonth: color.registerMonth, registerStatus: color.registerStatus,
    productionApprovalStatus: version?.reviewRecords.length ? 'APPROVED' : color.projectId ? 'NOT_APPROVED' : 'UNKNOWN',
    note: color.registerNote, revision: color.registerRevision, currentStandardVersionId: version?.id ?? null,
    sourceSummary: source ? `${source.fileName} · ${source.sheetName} · 第 ${source.rowNumbers.join('、')} 行` : null };
}
function technical(value: Prisma.JsonValue | null): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

@Injectable()
export class ColorRegisterService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: Record<string, unknown>, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    const { page, pageSize, skip } = pagination(query);
    const search = textField(query.search, '搜索内容', 128)?.trim();
    const baseId = query.baseId ? identity(query.baseId, '生产基地') : undefined;
    const status = textField(query.status, '清单状态', 30);
    const paintType = textField(query.paintType, '漆种', 200);
    if (status && !Object.values(ColorRegisterStatus).includes(status as ColorRegisterStatus)) throw new BadRequestException('清单状态不正确。');
    const where: Prisma.ColorWhereInput = { ...(baseId ? { productionBaseId: baseId } : {}),
      ...(status ? { registerStatus: status as ColorRegisterStatus } : {}),
      ...(paintType ? { paintType } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }, { versions: { some: { boardCode: { contains: search, mode: 'insensitive' } } } }] } : {}) };
    const [colors, total, bases, latestImport, paintTypes, manufacturers] = await Promise.all([
      this.prisma.color.findMany({ where, select: REGISTER_SELECT, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: pageSize, skip }),
      this.prisma.color.count({ where }),
      this.prisma.productionBase.findMany({ select: { id: true, name: true }, orderBy: { code: 'asc' }, take: 200 }),
      this.prisma.colorImportBatch.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true, fileName: true, sha256: true, sheetCount: true, rowCount: true, colorCount: true } }),
      this.prisma.$queryRaw<Array<{ value: string }>>(Prisma.sql`SELECT DISTINCT "paintType" AS value FROM colors WHERE "paintType" IS NOT NULL AND "paintType" <> '' ORDER BY value LIMIT 201`),
      this.prisma.$queryRaw<Array<{ value: string }>>(Prisma.sql`SELECT DISTINCT manufacturer AS value FROM colors WHERE manufacturer IS NOT NULL AND manufacturer <> '' ORDER BY value LIMIT 201`),
    ]);
    const pendingRowCount = latestImport ? await this.prisma.colorImportRow.count({ where: { batchId: latestImport.id, status: 'PENDING_REVIEW' } }) : 0;
    return { items: colors.map(row), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)),
      facets: { bases, statuses: Object.values(ColorRegisterStatus), paintTypes: paintTypes.slice(0, 200).map(item => item.value), manufacturers: manufacturers.slice(0, 200).map(item => item.value), paintTypesHasMore: paintTypes.length > 200, manufacturersHasMore: manufacturers.length > 200 }, importSummary: latestImport ? { ...latestImport, pendingRowCount } : null };
  }

  async detail(id: string, query: Record<string, unknown>, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor); identity(id);
    const { page, pageSize, skip } = pagination(query, 'versions');
    const color = await this.prisma.color.findUnique({ where: { id }, select: { ...REGISTER_SELECT,
      hueStandard: { select: { id: true, name: true } },
      linkedProjects: { select: { id: true, name: true }, take: 50, orderBy: { id: 'asc' } },
    } });
    if (!color) throw new NotFoundException('颜色记录不存在。');
    const [versions, total, provenance, production, systemProduction] = await Promise.all([
      this.prisma.colorVersion.findMany({ where: { colorId: id }, orderBy: { versionNo: 'desc' }, skip, take: pageSize }),
      this.prisma.colorVersion.count({ where: { colorId: id } }),
      this.prisma.colorImportRow.findMany({ where: { colorId: id }, orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }], take: 50, select: { sheetName: true, rowNumber: true, rawCells: true, status: true, batch: { select: { fileName: true } } } }),
      // Each fact already has color/base/month/scope grain; never join versions or measurement angles.
      this.prisma.colorProductionFact.findMany({ where: { colorId: id }, orderBy: [{ month: 'desc' }, { metricScope: 'asc' }], take: 120,
        select: { id: true, month: true, metricScope: true, quantity: true, productionBaseId: true, sourceRowId: true, sourceCell: true } }),
      readSystemColorProduction(this.prisma, id),
    ]);
    return { ...row(color), hueStandard: color.hueStandard, projects: color.linkedProjects,
      pendingReasons: [!color.productionBaseId ? '生产基地尚待核对。' : null,
        color.registerStatus === 'PENDING_REVIEW' ? '来源字段存在待核对项，原始记录已保留。' : null,
        color.projectId === null ? '历史来源没有提供量产批准证据；未创建开发流程。' : null].filter(Boolean),
      versions: versions.map(version => {
        const data = technical(version.technicalData);
        return { id: version.id, versionNo: version.versionNo, boardCode: version.boardCode,
          manufacturer: Object.hasOwn(data, 'manufacturer') ? data.manufacturer : color.manufacturer,
          paintType: Object.hasOwn(data, 'paintType') ? data.paintType : color.paintType,
          effectiveDate: data.measurementDate ?? data.issueDate ?? null, measurementDate: data.measurementDate ?? null, issueDate: data.issueDate ?? null, expiryDate: data.expiryDate ?? null,
          createdAt: version.createdAt.toISOString(), conditions: data.conditions ?? null, originalControlLimits: data.originalControlLimits ?? null,
          measurements: data.measurements ?? [], changeSummary: version.changeSummary, source: sourceReference(version.sourceReference),
          sourceDetails: data.sourceDetails ?? null };
      }), versionsTotal: total, versionsPage: page, versionsTotalPages: Math.max(1, Math.ceil(total / pageSize)),
      sources: versions.map(version => sourceReference(version.sourceReference)).filter(Boolean),
      provenance: provenance.map(value => ({ fileName: value.batch.fileName, sheetName: value.sheetName, rowNumber: value.rowNumber, rawCells: value.rawCells })),
      production: production.map(value => ({ ...value, quantity: value.quantity === null ? null : value.quantity.toString() })),
      productionLimit: 120, systemProduction,
    };
  }

  async sources(query: Record<string, unknown>, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    const { page, pageSize, skip } = pagination(query);
    const batches = await this.prisma.colorImportBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, fileName: true, sha256: true, sheetCount: true, rowCount: true, colorCount: true, metadata: true } });
    const batchId = query.batchId ? identity(query.batchId) : batches[0]?.id;
    if (!batchId) return { batches, items: [], total: 0, page, pageSize, totalPages: 1 };
    const sheetName = textField(query.sheetName, '工作表', 200);
    const status = textField(query.status, '来源状态', 40);
    if (status && !['PENDING_REVIEW', 'MAPPED', 'PRESERVED'].includes(status)) throw new BadRequestException('来源状态不正确。');
    const where = { batchId, ...(sheetName ? { sheetName } : {}), ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([this.prisma.colorImportRow.findMany({ where, orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }], take: pageSize, skip }), this.prisma.colorImportRow.count({ where })]);
    return { batches, items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async saveNotes(raw: unknown, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    const input = parseNotes(raw);
    return withTeamWrite(this.prisma, actor, async tx => {
      return this.command(tx, actor, input.operationId, 'COLOR_REGISTER_NOTES', input.items, async () => {
        for (const item of input.items) {
          const current = await lockRegisterColor(tx, item.id);
          if (current.registerRevision !== item.expectedRevision) throw new ConflictException({ code: 'COLOR_REGISTER_CONFLICT', message: '部分记录已被其他成员修改，请读取最新值后核对。', colorId: current.id });
          await tx.color.update({ where: { id: item.id }, data: { registerNote: item.note, registerRevision: { increment: 1 } } });
          await tx.auditLog.create({ data: { projectId: current.projectId, actorUserId: actor.id, targetType: 'COLOR', targetId: item.id,
            action: 'COLOR_REGISTER_NOTE_SAVED', summary: '保存颜色清单备注', beforeData: { note: current.registerNote, revision: current.registerRevision },
            afterData: { note: item.note, revision: current.registerRevision + 1 } } });
        }
        const items = await tx.color.findMany({ where: { id: { in: input.items.map(item => item.id) } }, select: REGISTER_SELECT, take: 50, orderBy: { id: 'asc' } });
        return { items: items.map(row) };
      });
    });
  }

  async saveSheet(raw: unknown, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    const input = parseSheetChanges(raw);
    return withTeamWrite(this.prisma, actor, tx => this.command(tx, actor, input.operationId, 'COLOR_REGISTER_SHEET', { reason: input.reason, items: input.items }, async () => {
      for (const item of input.items) {
        const current = await lockRegisterColor(tx, item.id);
        const selected = await tx.color.findUniqueOrThrow({ where: { id: item.id }, select: REGISTER_SELECT });
        if (current.registerRevision !== item.expectedRevision) throw new ConflictException({ code: 'COLOR_REGISTER_CONFLICT', message: '记录已被其他成员修改，请核对当前值后重新编辑。', colorId: item.id, current: row(selected) });
        const previous = row(selected);
        const changed = Object.fromEntries(Object.entries(item.changes).filter(([field, value]) => previous[field as keyof typeof previous] !== value));
        if (!Object.keys(changed).length) continue;
        const standardChanged = Object.keys(changed).some(field => field !== 'note');
        if (standardChanged) {
          if (current.registerStatus !== 'LISTED') throw new BadRequestException({ code: 'COLOR_REGISTER_FIELD_ERROR', message: '候选或待核对颜色须通过原项目或标准更正动作维护标准。', colorId: item.id, field: Object.keys(changed).find(field => field !== 'note') });
          if (!input.reason) throw new BadRequestException({ code: 'COLOR_REGISTER_FIELD_ERROR', message: '修改色板标准、制作单位、漆种或入清单月份时，请填写更正原因。', colorId: item.id, field: 'reason' });
          for (const field of ['manufacturer', 'paintType'] as const) {
            const value = item.changes[field];
            if (value === undefined || value === null || value === current[field]) continue;
            if (!await tx.color.findFirst({ where: { [field]: value }, select: { id: true } })) throw new BadRequestException({ code: 'COLOR_REGISTER_FIELD_ERROR', message: `${field === 'manufacturer' ? '制作单位' : '漆种'}须选择已有值；新选项请通过标准更正入口核对。`, colorId: item.id, field });
          }
          const latest = await tx.colorVersion.findFirst({ where: { colorId: item.id }, orderBy: { versionNo: 'desc' } });
          if (!latest) throw new BadRequestException({ code: 'COLOR_REGISTER_FIELD_ERROR', message: '该颜色尚无标准版本，请使用标准更正入口核对。', colorId: item.id, field: 'boardCode' });
          const data = technical(latest.technicalData);
          // Copy the current immutable standard, including original measurements and provenance.
          // Ordinary table edits must never rebuild it from the visible subset of columns.
          const technicalData = jsonData({ ...data,
            manufacturer: Object.hasOwn(item.changes, 'manufacturer') ? item.changes.manufacturer : current.manufacturer,
            paintType: Object.hasOwn(item.changes, 'paintType') ? item.changes.paintType : current.paintType,
            changeSummary: input.reason,
          }) as Prisma.InputJsonObject;
          await appendColorStandard(tx, { colorId: item.id, expectedRevision: current.registerRevision, actorId: actor.id,
            boardCode: Object.hasOwn(item.changes, 'boardCode') ? item.changes.boardCode! : latest.boardCode,
            technicalData,
            ...(Object.hasOwn(item.changes, 'registerMonth') ? { registerMonth: item.changes.registerMonth } : {}),
            ...(latest.sourceReference && typeof latest.sourceReference === 'object' && !Array.isArray(latest.sourceReference) ? { sourceReference: jsonData(latest.sourceReference) as Prisma.InputJsonObject } : {}),
          });
        }
        if (Object.hasOwn(changed, 'note')) await tx.color.update({ where: { id: item.id }, data: { registerNote: item.changes.note ?? null, ...(!standardChanged ? { registerRevision: { increment: 1 } } : {}) } });
        const saved = row(await tx.color.findUniqueOrThrow({ where: { id: item.id }, select: REGISTER_SELECT }));
        await tx.auditLog.create({ data: { projectId: current.projectId, actorUserId: actor.id, targetType: 'COLOR', targetId: item.id,
          action: 'COLOR_REGISTER_SHEET_SAVED', summary: standardChanged ? '保存颜色清单并追加标准版本' : '保存颜色清单备注',
          beforeData: jsonData({ fields: Object.fromEntries(Object.keys(changed).map(field => [field, previous[field as keyof typeof previous]])), revision: current.registerRevision, versionId: previous.currentStandardVersionId }),
          afterData: jsonData({ fields: Object.fromEntries(Object.keys(changed).map(field => [field, saved[field as keyof typeof saved]])), revision: saved.revision, versionId: saved.currentStandardVersionId, reason: input.reason }),
        } });
      }
      const items = await tx.color.findMany({ where: { id: { in: input.items.map(item => item.id) } }, select: REGISTER_SELECT, take: 50, orderBy: { id: 'asc' } });
      return { items: items.map(row) };
    }), { timeout: 30000 });
  }

  async correctStandard(id: string, raw: unknown, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor); identity(id);
    const body = object(raw);
    const input = { colorId: id, expectedRevision: positiveInt(body.expectedRevision, '颜色记录版本'),
      boardCode: textField(body.boardCode, '色板编号', 128), registerMonth: parseRegisterMonth(body.registerMonth),
      technicalData: parseColorTechnicalData(body.technicalData) };
    if (!input.technicalData.changeSummary) throw new BadRequestException('请填写更正原因；历史标准不会被覆盖。');
    return withTeamWrite(this.prisma, actor, tx => this.command(tx, actor, identity(body.operationId, '操作标识'), 'COLOR_STANDARD_CORRECTED', input, async () => {
      const current = await lockRegisterColor(tx, id);
      // A candidate must pass the existing project board node; this correction endpoint cannot bypass it.
      if (current.registerStatus === 'CANDIDATE') throw new BadRequestException('候选颜色请在项目的制板标定节点保存并加入清单。');
      const result = await appendColorStandard(tx, { ...input, actorId: actor.id });
      await tx.auditLog.create({ data: { projectId: result.color.projectId, actorUserId: actor.id, targetType: 'COLOR_VERSION', targetId: result.version.id,
        action: 'COLOR_STANDARD_CORRECTED', summary: '追加颜色标准更正版本，保留历史标准',
        afterData: { colorId: id, versionId: result.version.id, versionNo: result.version.versionNo, reason: input.technicalData.changeSummary } } });
      return { colorId: id, versionId: result.version.id, versionNo: result.version.versionNo, revision: result.color.registerRevision };
    }));
  }

  private async command<T>(tx: Prisma.TransactionClient, actor: AuthenticatedUser, operationId: string, action: string, input: unknown, execute: () => Promise<T>): Promise<T> {
    const key = `color-register:${actor.id}:${operationId}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
    const requestHash = commandHash(input);
    const replay = await tx.adminCommandRequest.findUnique({ where: { idempotencyKey: key } });
    if (replay) {
      if (replay.action !== action || replay.requestHash !== requestHash) throw new ConflictException('同一操作标识的内容已改变，请重新提交。');
      return replay.result as T;
    }
    const result = await execute();
    await tx.adminCommandRequest.create({ data: { actorUserId: actor.id, idempotencyKey: key, action, requestHash, result: jsonData(result) } });
    return result;
  }
}
