import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { withTeamWrite } from '../../common/team-authorization';
import { assertApprovedTeamMember } from '../../common/team-membership';
import { jsonData, object, textField } from './color-register.rules';

type SourceRow = { sheet: string; row: number; cells: unknown; classification: unknown; colorId: string | null; status: string; kind: string; normalization: unknown };
function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new BadRequestException(`${label}超过范围或格式不正确。`);
  return value;
}
function nullableText(value: unknown, limit = 200) { return typeof value === 'string' && value.length <= limit && !value.includes('\0') ? value : null; }
function numeric(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function rowKey(sheet: string, row: number) { return `${sheet}\0${row}`; }

/** Local operator CLI only. Source bytes are scanned/stored before this authenticated, atomic domain command. */
export async function importColorWorkbook(prisma: PrismaService, actor: AuthenticatedUser, input: {
  manifest: unknown; sha256: string; fileName: string; byteSize: number; objectKey: string; scanEvidence: Prisma.InputJsonValue;
}) {
  assertApprovedTeamMember(actor);
  if (!/^[a-f0-9]{64}$/.test(input.sha256) || input.byteSize < 1 || input.byteSize > 10 * 1024 * 1024) throw new BadRequestException('来源文件身份或大小不正确。');
  textField(input.fileName, '来源文件名', 255, true);
  if (Buffer.byteLength(JSON.stringify(input.manifest)) > 48 * 1024 * 1024) throw new BadRequestException('解析数据超过 48 MiB。');
  const manifest = object(input.manifest, '解析结果');
  if (manifest.schemaVersion !== 'source-analysis-candidate-v2') throw new BadRequestException('不支持的来源解析合同版本。');
  const workbook = object(manifest.rawWorkbook, '工作簿');
  if (manifest.sourceSha256 !== input.sha256 || workbook.sourceSha256 !== input.sha256 || workbook.sourceAfterSha256 !== input.sha256 || workbook.sourceBytes !== input.byteSize) throw new BadRequestException('工作簿与解析结果摘要不一致。');
  const sheets = array(workbook.sheets, '工作表', 64).map(value => object(value, '工作表'));
  const ledger = array(manifest.rowPreservationLedger, '来源行账本', 10000).map(value => object(value));
  const candidates = array(manifest.baseColorCandidates, '颜色记录', 2000).map(value => object(value));
  const productions = array(manifest.productionCandidates, '产量记录', 3000).map(value => object(value));
  const classifications = new Map(ledger.map(value => [rowKey(String(value.sheet), Number(value.row)), value.classifications]));
  const rows = new Map<string, SourceRow>();
  const sheetNames = new Set<string>();
  for (const sheet of sheets) {
    const name = textField(sheet.name, '工作表名', 200, true)!;
    if (sheetNames.has(name)) throw new BadRequestException('工作表来源重复。');
    sheetNames.add(name);
    for (const value of array(sheet.rows, '工作表行', 5000)) {
      const source = object(value); const n = Number(source.row);
      if (!Number.isInteger(n) || n < 1 || n > 5000) throw new BadRequestException('来源行号不正确。');
      const cells = array(source.cells, '单元格', 128);
      const key = rowKey(name, n);
      if (rows.has(key)) throw new BadRequestException('来源行重复。');
      const classification = classifications.get(key);
      if (!classification) throw new BadRequestException('来源行缺少保全账本。');
      const kinds = array(classification, '行分类', 20).map(value => nullableText(object(value).kind, 100)).filter(Boolean);
      const preserved = kinds.every(kind => kind === 'BLANK_ROW_PRESERVED');
      rows.set(key, { sheet: name, row: n, cells, classification, colorId: null, status: preserved ? 'PRESERVED' : 'PENDING_REVIEW', kind: kinds.join(',').slice(0, 100), normalization: null });
    }
  }
  if (rows.size !== ledger.length || rows.size > 10000) throw new BadRequestException('来源保全行数不一致。');

  return withTeamWrite(prisma, actor, async tx => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'color-workbook-import'}), hashtext(${input.sha256}))`);
    const replay = await tx.colorImportBatch.findUnique({ where: { sha256: input.sha256 } });
    if (replay) return { batchId: replay.id, colorCount: replay.colorCount, rowCount: replay.rowCount, sheetCount: replay.sheetCount, idempotentReplay: true };
    const batch = await tx.colorImportBatch.create({ data: { sha256: input.sha256, fileName: input.fileName, byteSize: input.byteSize,
      objectKey: input.objectKey, parserVersion: nullableText(manifest.schemaVersion, 100) ?? 'source-analysis-v1', importedById: actor.id,
      sheetCount: sheets.length, rowCount: rows.size, colorCount: 0,
      metadata: jsonData({ scan: input.scanEvidence, epoch: workbook.epoch, sheetNames: [...sheetNames],
        sheets: sheets.map(sheet => Object.fromEntries(Object.entries(sheet).filter(([key]) => key !== 'rows'))), rules: manifest.rules, sectionMappings: manifest.sectionMappings,
        originalSourceRetained: true, sourceDatesAreNotRegisterMonths: true }) } });
    const identities = new Map<string, { id: string; baseId: string; name: string; baseCode: string }>();
    for (const candidate of candidates) {
      const source = object(candidate.source);
      const sheetName = textField(source.sheet, '来源工作表', 200, true)!;
      const rowNumbers = array(source.rows, '颜色来源行', 64).map(Number);
      const records = rowNumbers.map(n => rows.get(rowKey(sheetName, n)));
      if (!rowNumbers.length || records.some(value => !value || value.colorId)) throw new BadRequestException('颜色来源行不存在或交叉占用。');
      const candidateId = textField(candidate.id, '解析记录 ID', 128, true)!;
      if (identities.has(candidateId)) throw new BadRequestException('解析记录身份重复。');
      const name = nullableText(candidate.colorName);
      const baseCode = nullableText(candidate.baseCode, 64);
      const baseName = nullableText(candidate.productionBase);
      if (!name || !baseCode || !baseName) {
        for (const sourceRow of records) if (sourceRow) sourceRow.normalization = candidate;
        continue;
      }
      const base = await tx.productionBase.upsert({ where: { code: baseCode }, create: { code: baseCode, name: baseName }, update: {} });
      if (base.name !== baseName) throw new ConflictException('基地代码与已有名称不一致，请核对映射配置。');
      const sharedWhite = name === '新汉玉白' && candidate.hueMappingReason === 'EXPLICIT_MAPPING_RULE' && candidate.hueCandidateId === 'hue-shared-xinhanyubai' && ['XINGANG', 'QINGZHOU', 'SUINING'].includes(baseCode);
      const hue = sharedWhite ? await tx.hueStandard.upsert({ where: { id: 'hue-explicit-xinhanyubai' },
        create: { id: 'hue-explicit-xinhanyubai', name: '新汉玉白', basis: '用户明确指定各基地共用色相，基地标准及历史分别保留。' }, update: {} })
        : await tx.hueStandard.create({ data: { name, basis: '按来源颜色与基地独立建立，未依据同名判定共用色相。' } });
      const measurements = array(candidate.measurements, '测量角度', 64).map(value => object(value));
      const issues = Array.isArray(candidate.issues) ? candidate.issues : [];
      const color = await tx.color.create({ data: { name, projectId: null, code: null, productionBaseId: base.id, hueStandardId: hue.id,
        manufacturer: nullableText(candidate.manufacturer), paintType: nullableText(candidate.paintType), registerNote: nullableText(candidate.remark, 4000),
        registerStatus: issues.length ? 'PENDING_REVIEW' : 'LISTED', status: 'DRAFT', registerMonth: null } });
      const condition = object(candidate.measurementCondition ?? {});
      const limits = measurements.map(value => ({ angle: value.angleRaw ?? null, limits: value.controlLimits ?? null }));
      await tx.colorVersion.create({ data: { colorId: color.id, versionNo: 1, status: 'DRAFT', boardCode: nullableText(candidate.colorCode, 128),
        createdById: null, confirmedAt: null, publishedAt: null,
        sourceReference: { batchId: batch.id, fileName: input.fileName, sheetName, rowNumbers },
        technicalData: jsonData({ measurements: measurements.map(value => ({ angle: value.angleRaw ?? null,
          l: value.l ?? null, a: value.a ?? null, b: value.b ?? null, originalControlLimits: JSON.stringify(value.controlLimits ?? null) })),
          conditions: condition.raw ?? null, originalControlLimits: JSON.stringify(limits), measurementDate: null,
          issueDate: object(candidate.issueDate ?? {}).raw ?? null, expiryDate: object(candidate.expiryDate ?? {}).raw ?? null,
          manufacturer: candidate.manufacturer ?? null, paintType: candidate.paintType ?? null, sourceDetails: candidate }) } });
      identities.set(candidateId, { id: color.id, baseId: base.id, name, baseCode });
      for (const sourceRow of records) if (sourceRow) { sourceRow.colorId = color.id; sourceRow.status = issues.length ? 'PENDING_REVIEW' : 'MAPPED'; sourceRow.normalization = candidate; }
    }
    const productionByRow = new Map<string, Record<string, unknown>>();
    for (const production of productions) {
      const source = object(production.source); const numbers = array(source.rows, '产量来源行', 10).map(Number);
      for (const n of numbers) {
        const key = rowKey(String(source.sheet), n); const sourceRow = rows.get(key);
        if (!sourceRow || productionByRow.has(key)) throw new BadRequestException('产量来源不正确或重复。');
        sourceRow.normalization = production; productionByRow.set(key, production);
      }
    }
    // Keep all source rows including headers, footnotes and blank rows. No source binary enters PostgreSQL.
    const savedRows = new Map<string, string>();
    for (const sourceRow of rows.values()) {
      const saved = await tx.colorImportRow.create({ data: { batchId: batch.id, sheetName: sourceRow.sheet, rowNumber: sourceRow.row,
        kind: sourceRow.kind, status: sourceRow.status, rawCells: jsonData(sourceRow.cells), colorId: sourceRow.colorId,
        normalization: jsonData({ classification: sourceRow.classification, candidate: sourceRow.normalization }) }, select: { id: true } });
      savedRows.set(rowKey(sourceRow.sheet, sourceRow.row), saved.id);
    }
    let mappedProductionRows = 0;
    const usedGrains = new Set<string>();
    for (const [key, production] of productionByRow) {
      const matching = array(production.exactLiteralNameBaseCandidates, '产量颜色候选', 100);
      if (matching.length !== 1 || typeof matching[0] !== 'string') continue;
      const color = identities.get(matching[0]);
      if (!color || color.name !== production.colorNameRaw || color.baseCode !== production.baseCodeCandidate) continue;
      const year = numeric(production.year); const scope = nullableText(production.sectionLabelRaw, 200);
      if (!year || !Number.isInteger(year) || year < 1900 || year > 9999 || !scope) continue;
      const months = array(production.months, '产量月份', 12).map(value => object(value));
      const facts = months.map(value => {
        const month = numeric(value.monthPosition);
        const header = nullableText(object(value.sourceHeader).effectiveValue);
        const explicitMonth = header ? /^\s*(\d{1,2})月\s*$/.exec(header) : null;
        return { value, month: month && Number.isInteger(month) && month >= 1 && month <= 12 && Number(explicitMonth?.[1]) === month ? `${year}-${String(month).padStart(2, '0')}` : null };
      });
      if (facts.some(fact => !fact.month || usedGrains.has(`${color.id}:${fact.month}:${scope}`)) || new Set(facts.map(fact => fact.month)).size !== facts.length) continue;
      for (const fact of facts) {
        const quantity = numeric(fact.value.effectiveValue);
        // A formula, text or missing cell remains unknown in normalized quantity; exact source/cached values remain available.
        await tx.colorProductionFact.create({ data: { colorId: color.id, productionBaseId: color.baseId, month: fact.month!, metricScope: scope,
          quantity, sourceRowId: savedRows.get(key)!, sourceCell: nullableText(fact.value.cell, 32) } });
        usedGrains.add(`${color.id}:${fact.month}:${scope}`);
      }
      await tx.colorImportRow.update({ where: { id: savedRows.get(key)! }, data: { colorId: color.id, status: 'MAPPED' } });
      mappedProductionRows += 1;
    }
    await tx.colorImportBatch.update({ where: { id: batch.id }, data: { colorCount: identities.size } });
    await tx.auditLog.create({ data: { actorUserId: actor.id, targetType: 'COLOR', targetId: batch.id, action: 'COLOR_WORKBOOK_IMPORTED',
      summary: '按来源导入颜色清单，保留全部工作表和原始行；未创建历史开发流程',
      afterData: { sha256: input.sha256, sheetCount: sheets.length, rowCount: rows.size, colorCount: identities.size, mappedProductionRows } } });
    return { batchId: batch.id, colorCount: identities.size, rowCount: rows.size, sheetCount: sheets.length, mappedProductionRows, idempotentReplay: false };
  }, { timeout: 120000, maxWait: 10000 });
}
