import { createHash } from 'node:crypto';
import type { importColorWorkbook } from './color-register-import';

// Entirely synthetic parser-v2 contract. No source workbook bytes or private values.
// The four names explicitly specified by the user exercise identity rules only.
export function syntheticColorWorkbook(run: string, label: string, baseNames: Record<string, string> = {}) {
  const sha256 = createHash('sha256').update(`color-register-synthetic:${run}:${label}`).digest('hex');
  const byteSize = 1234;
  const name = (code: string) => baseNames[code] ?? ({ XINGANG: '合成新港基地', QINGZHOU: '合成青州基地', SHANDONG: '合成山东基地' }[code] ?? code);
  const cell = (address: string, value: unknown, extra: Record<string, unknown> = {}) => ({ address, value, effectiveValue: value, dataType: value === null ? 'n' : typeof value === 'number' ? 'n' : 's', numberFormat: 'General', ...extra });
  const row = (number: number, values: unknown[]) => ({ row: number, cells: values.map((value, column) => cell(`${String.fromCharCode(65 + column)}${number}`, value)) });
  const sheets = [
    { name: '合成标准甲', state: 'visible', maxRow: 8, maxColumn: 7, mergedRanges: ['A3:A4'], rows: [
      row(1, ['合成标题']), row(2, ['颜色', '基地', '角度', 'L', 'a', 'b', '原控制限']),
      row(3, ['新汉玉白', name('XINGANG'), 15, 80.25, null, '', '+0.4/-0.7']),
      row(4, [null, null, 45, 79.5, -0.6, 0, '保留原文≤0.8']),
      row(5, ['尊贵蓝（SD）', name('SHANDONG'), 15, 20.1, 1.1, -4.4]),
      row(6, ['合成同名试色', name('XINGANG'), null, null, null, null]),
      row(7, ['合成待核对颜色', null, '原文不明角度', null, null, null]), row(8, [null, null]),
    ] },
    { name: '合成标准乙', state: 'hidden', maxRow: 5, maxColumn: 6, mergedRanges: [], rows: [
      row(1, ['合成另一工作表表头']), row(2, ['新汉玉白', name('QINGZHOU'), 45, null, 0.2, -0.1]),
      row(3, ['尊贵蓝', name('XINGANG'), 45, 21.2, 1.2, -4.5]),
      row(4, ['合成同名试色', name('QINGZHOU'), null, null, null, null]), row(5, ['合成脚注，不能决定基地归属']),
    ] },
    { name: '合成产量', state: 'visible', maxRow: 7, maxColumn: 6, mergedRanges: [], rows: [
      row(1, ['合成统计口径']), row(2, ['颜色', '基地', '1月', '2月', '3月', '4月']),
      row(3, ['新汉玉白', name('XINGANG'), 12.5, null, 0, '=SUM(C3:E3)']),
      row(4, ['合成无准确颜色身份', '合成未知基地', 9, null, null, null]),
      row(5, ['合成同名试色', '基地未确定', 9, null, null, null]),
      row(6, ['尊贵蓝（SD）', name('SHANDONG'), 7, 8, null, null]), row(7, [null]),
    ] },
  ];
  // Preserve the original formula and cached value separately; a string value is
  // never silently turned into a numeric production quantity.
  sheets[2]!.rows[2]!.cells[5] = cell('F3', '=SUM(C3:E3)', { dataType: 'f', formula: '=SUM(C3:E3)', cachedValue: 12.5 });
  const measurement = (sourceRow: number, angle: unknown, l: unknown, a: unknown, b: unknown) => ({
    sourceRow, angleRaw: angle, l, a, b, controlLimits: { raw: sourceRow === 3 ? '+0.4/-0.7' : '保留原文≤0.8', upper: null, lower: null },
  });
  const candidate = (id: string, colorName: string, baseCode: string | null, sheet: string, rows: number[], measurements: unknown[], extra: Record<string, unknown> = {}) => ({
    id, colorName, baseCode, productionBase: baseCode ? name(baseCode) : null,
    source: { sheet, rows }, colorCode: 'SYNTHETIC-SHARED-BOARD-CODE',
    manufacturer: `合成制作单位-${id}`, paintType: '合成水性漆', remark: '这是原始人读备注，不参与关联',
    measurements, measurementCondition: { raw: '合成 D65 / 10°；不规范原文保留' },
    issueDate: { raw: '2021-04-03', normalized: null }, expiryDate: { raw: null, normalized: null },
    issues: [], ...extra,
  });
  const whiteRule = { hueCandidateId: 'hue-shared-xinhanyubai', hueMappingReason: 'EXPLICIT_MAPPING_RULE' };
  const baseColorCandidates = [
    candidate('white-xingang', '新汉玉白', 'XINGANG', '合成标准甲', [3, 4], [measurement(3, 15, 80.25, null, ''), measurement(4, 45, 79.5, -0.6, 0)], whiteRule),
    candidate('blue-shandong', '尊贵蓝（SD）', 'SHANDONG', '合成标准甲', [5], [measurement(5, 15, 20.1, 1.1, -4.4)], { issues: ['SYNTHETIC_DATE_PENDING_REVIEW'] }),
    candidate('homonym-xingang', '合成同名试色', 'XINGANG', '合成标准甲', [6], []),
    candidate('unmapped', '合成待核对颜色', null, '合成标准甲', [7], [], { issues: ['SYNTHETIC_BASE_UNKNOWN'] }),
    candidate('white-qingzhou', '新汉玉白', 'QINGZHOU', '合成标准乙', [2], [measurement(2, 45, null, 0.2, -0.1)], whiteRule),
    candidate('blue-xingang', '尊贵蓝', 'XINGANG', '合成标准乙', [3], [measurement(3, 45, 21.2, 1.2, -4.5)]),
    candidate('homonym-qingzhou', '合成同名试色', 'QINGZHOU', '合成标准乙', [4], []),
  ];
  const month = (position: number, value: unknown, header = `${position}月`) => ({
    monthPosition: position, effectiveValue: value, cell: `${String.fromCharCode(66 + position)}3`, sourceHeader: { effectiveValue: header },
  });
  const production = (sourceRow: number, colorNameRaw: string, baseCodeCandidate: string, matches: string[], months: unknown[]) => ({
    source: { sheet: '合成产量', rows: [sourceRow] }, colorNameRaw, baseCodeCandidate,
    exactLiteralNameBaseCandidates: matches, year: 2025, sectionLabelRaw: '合成统计口径', months,
  });
  const productionCandidates = [
    production(3, '新汉玉白', 'XINGANG', ['white-xingang'], [month(1, 12.5), month(2, null), month(3, 0), month(4, '=SUM(C3:E3)')]),
    production(4, '合成无准确颜色身份', 'UNKNOWN', [], [month(1, 9)]),
    production(5, '合成同名试色', 'UNKNOWN', ['homonym-xingang', 'homonym-qingzhou'], [month(1, 9)]),
    // The header contradicts monthPosition: retain for review, never guess a month.
    production(6, '尊贵蓝（SD）', 'SHANDONG', ['blue-shandong'], [month(1, 7), month(2, 8, '3月')]),
  ];
  const rowPreservationLedger = sheets.flatMap(sheet => sheet.rows.map(sourceRow => ({
    sheet: sheet.name, row: sourceRow.row,
    classifications: [{ kind: sourceRow.cells.every(value => value.value === null) ? 'BLANK_ROW_PRESERVED' : 'SYNTHETIC_SOURCE_ROW' }],
  })));
  const manifest = {
    schemaVersion: 'source-analysis-candidate-v2', sourceSha256: sha256,
    rawWorkbook: { sourceSha256: sha256, sourceAfterSha256: sha256, sourceBytes: byteSize, epoch: '1899-12-30', sheets },
    rowPreservationLedger, baseColorCandidates, productionCandidates,
    rules: { syntheticFixture: true, explicitlySharedName: '新汉玉白' }, sectionMappings: [],
  };
  const input: Parameters<typeof importColorWorkbook>[2] = {
    manifest, sha256, byteSize, fileName: '合成颜色清单.xlsx', objectKey: `synthetic-service-fixture/${run}/${label}.xlsx`,
    // Only the domain transaction is under test; these are not scanner claims.
    scanEvidence: { status: 'CLEAN', engine: 'SYNTHETIC_SERVICE_FIXTURE_NOT_SCANNER_ACCEPTANCE' },
  };
  return { input, manifest, expected: { rowCount: 20, sheetCount: 3, colorCount: 6, productionCount: 4 } };
}
