import ExcelJS from 'exceljs';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  CATALOG_COLUMNS, CATALOG_XLSX_LIMITS, exportCatalogTemplate, inspectCatalogArchive,
  previewCatalogImport, readCatalogWorkbook, suggestCatalogMapping,
  type CatalogExchangeRow, type CatalogImportOptions,
} from './sheet-exchange';

const rows: CatalogExchangeRow[] = [
  { id: 'color_fuyang', revision: 4, name: '中通蓝', base: { id: 'base_fy', name: '安徽阜阳' }, note: '按现行标准使用', boardCode: '0001234567890123456789', manufacturer: '现有供应商', paintType: '水性素色漆', formalCode: '000987', registerMonth: '2026-09', registerStatus: 'LISTED', productionApprovalStatus: 'UNKNOWN', sourceSummary: '原件.xlsx / 阜阳 / 27' },
  { id: 'color_suining', revision: 7, name: '中通蓝', base: { id: 'base_sn', name: '四川遂宁' }, note: '另一基地', boardCode: '0000002', manufacturer: '现有供应商', paintType: '水性素色漆', formalCode: null, registerMonth: null, registerStatus: 'LISTED', productionApprovalStatus: 'UNKNOWN', sourceSummary: '原件.xlsx / 遂宁 / 19' },
];
const column = (field: string) => CATALOG_COLUMNS.findIndex(item => item.field === field) + 1;
async function editedTemplate(edit: (workbook: ExcelJS.Workbook) => void) {
  const workbook = new ExcelJS.Workbook();
  const bytes = await exportCatalogTemplate(rows);
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  edit(workbook);
  return readCatalogWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));
}
function preview(workbook: Awaited<ReturnType<typeof readCatalogWorkbook>>, current: CatalogExchangeRow[] = rows, options: Partial<CatalogImportOptions> = {}) {
  return previewCatalogImport(workbook, { sheetId: workbook.sheets[0]!.id, headerRow: 1, ...options }, current);
}

describe('color catalog XLSX exchange', () => {
  it('roundtrips stable identities, Chinese, leading zeros and unchanged records without writes', async () => {
    const bytes = await exportCatalogTemplate(rows);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.getWorksheet('颜色清单')!.getColumn(column('id')).hidden).toBe(true);
    expect(workbook.getWorksheet('颜色清单')!.getColumn(column('revision')).hidden).toBe(true);
    const parsed = await readCatalogWorkbook(bytes);
    const result = preview(parsed);
    expect(result.counts).toEqual({ added: 0, updated: 0, unchanged: 2, errors: 0, conflicts: 0, pending: 0 });
    expect(result.changes).toEqual([]);
    expect(result.canSubmit).toBe(false);
    expect(result.records[0]!.values.boardCode).toBe(rows[0]!.boardCode);
    expect(result.records.map(record => record.id)).toEqual(rows.map(row => row.id));
    expect(result.records.map(record => record.values.baseName)).toEqual(['安徽阜阳', '四川遂宁']);
  });

  it('returns only changed field patches and marks standard updates as requiring an explicit reason', async () => {
    const parsed = await editedTemplate(workbook => {
      const sheet = workbook.getWorksheet('颜色清单')!;
      sheet.getCell(2, column('note')).value = '中文\n第二行';
      sheet.getCell(2, column('boardCode')).value = '00001';
      sheet.getCell(3, column('registerMonth')).value = '2026-10';
    });
    const result = preview(parsed);
    expect(result.canSubmit).toBe(true);
    expect(result.requiresReason).toBe(true);
    expect(result.changes).toEqual([
      { id: rows[0]!.id, expectedRevision: 4, changes: { note: '中文\n第二行', boardCode: '00001' } },
      { id: rows[1]!.id, expectedRevision: 7, changes: { registerMonth: '2026-10' } },
    ]);
    expect(result.records[0]!.diffs[0]).toMatchObject({ field: 'note', before: '按现行标准使用', after: '中文\n第二行' });
    expect(JSON.stringify(result.changes)).not.toContain('reason');
  });

  it('binds edits after row sorting to stable ID instead of the original row position', async () => {
    const parsed = await editedTemplate(workbook => {
      const sheet = workbook.getWorksheet('颜色清单')!;
      const first = sheet.getRow(2).values, second = sheet.getRow(3).values;
      sheet.getRow(2).values = second; sheet.getRow(3).values = first;
      sheet.getCell(2, column('note')).value = '只修改四川遂宁';
    });
    expect(preview(parsed).changes).toEqual([{ id: rows[1]!.id, expectedRevision: 7, changes: { note: '只修改四川遂宁' } }]);
  });

  it('ignores blanks by default, supports explicit clearing and never clears a missing column', async () => {
    const parsed = await editedTemplate(workbook => { workbook.getWorksheet('颜色清单')!.getCell(2, column('note')).value = null; });
    expect(preview(parsed).changes).toEqual([]);
    expect(preview(parsed, rows, { clearBlankFields: ['note'] }).changes).toEqual([{ id: rows[0]!.id, expectedRevision: 4, changes: { note: null } }]);
    const mapping = suggestCatalogMapping(parsed.sheets[0]!, 1);
    delete mapping[column('note') - 1];
    expect(preview(parsed, rows, { mapping, clearBlankFields: ['note'] }).changes).toEqual([]);
  });

  it('rejects every occurrence of a duplicate ID without creating new records', async () => {
    const parsed = await editedTemplate(workbook => { workbook.getWorksheet('颜色清单')!.getCell(3, column('id')).value = rows[0]!.id; });
    const result = preview(parsed);
    expect(result.counts.errors).toBe(2); expect(result.counts.added).toBe(0);
    expect(result.changes).toEqual([]); expect(result.canSubmit).toBe(false);
  });

  it('rejects invalid IDs and records outside the authorized read set without fallback matching by name', async () => {
    const parsed = await editedTemplate(workbook => {
      const sheet = workbook.getWorksheet('颜色清单')!;
      sheet.getCell(2, column('id')).value = '../color';
      sheet.getCell(3, column('id')).value = 'some_other_color';
    });
    const result = preview(parsed);
    expect(result.counts.errors).toBe(2); expect(result.changes).toEqual([]);
    expect(result.records.every(record => record.status === 'error')).toBe(true);
  });

  it('reports changed controlled fields even when Excel protection was bypassed', async () => {
    const parsed = await editedTemplate(workbook => {
      const sheet = workbook.getWorksheet('颜色清单')!;
      for (const field of ['name', 'baseName', 'formalCode', 'registerStatus', 'sourceSummary']) sheet.getCell(2, column(field)).value = '越权改写';
    });
    const result = preview(parsed);
    expect(result.records[0]!.errors.map(issue => issue.field)).toEqual(['name', 'baseName', 'formalCode', 'registerStatus', 'sourceSummary']);
    expect(result.records[1]!.errors).toEqual([]); expect(result.canSubmit).toBe(false);
  });

  it('shows stale version conflicts with this input and the latest server value', async () => {
    const parsed = await editedTemplate(workbook => { workbook.getWorksheet('颜色清单')!.getCell(2, column('note')).value = '本次输入'; });
    const current = rows.map(row => ({ ...row }));
    current[0] = { ...current[0]!, revision: 5, note: '他人已保存' };
    const result = preview(parsed, current);
    expect(result.records[0]!.status).toBe('conflict');
    expect(result.records[0]!.diffs[0]).toMatchObject({ before: '他人已保存', after: '本次输入' });
    expect(result.counts.conflicts).toBe(1); expect(result.changes).toEqual([]);
  });

  it('rejects standard changes outside LISTED while permitting ordinary note changes', async () => {
    const current = rows.map(row => ({ ...row, registerStatus: 'CANDIDATE' }));
    const workbook = new ExcelJS.Workbook();
    const bytes = await exportCatalogTemplate(current);
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet('颜色清单')!;
    sheet.getCell(2, column('boardCode')).value = '候选绕过';
    sheet.getCell(3, column('note')).value = '允许备注';
    const result = preview(await readCatalogWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer())), current);
    expect(result.records[0]!.status).toBe('error');
    expect(result.records[1]!.status).toBe('update');
    expect(result.changes[0]).toMatchObject({ id: rows[1]!.id, changes: { note: '允许备注' } });
    expect(result.canSubmit).toBe(false); // UI must not silently skip the invalid row.
  });

  it('rejects formulas instead of importing cached results', async () => {
    const parsed = await editedTemplate(workbook => { workbook.getWorksheet('颜色清单')!.getCell(2, column('note')).value = { formula: '1+1', result: 2 }; });
    const result = preview(parsed);
    expect(result.records[0]!.status).toBe('error');
    expect(result.records[0]!.errors[0]!.message).toContain('公式');
    expect(result.records[0]!.values.note).toBeUndefined();
    expect(result.changes).toEqual([]);
  });

  it('keeps formula-looking strings literal and refuses numeric code coercion', async () => {
    const literalRows = rows.map(row => ({ ...row, note: '=HYPERLINK("https://example.invalid","文字")' }));
    const literal = await readCatalogWorkbook(await exportCatalogTemplate(literalRows));
    expect(preview(literal, literalRows).counts.unchanged).toBe(2);
    const parsed = await editedTemplate(workbook => { workbook.getWorksheet('颜色清单')!.getCell(2, column('boardCode')).value = 123; });
    const result = preview(parsed);
    expect(result.records[0]!.errors[0]!.message).toContain('文本格式');
    expect(result.canSubmit).toBe(false);
  });

  it('supports sheet/header selection and explicit mapping for ordinary workbooks, always preview-only', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('说明').getCell('A1').value = '先选择数据工作表';
    const sheet = workbook.addWorksheet('普通台账');
    sheet.mergeCells('A1:C1'); sheet.getCell('A1').value = '含说明行和合并标题';
    sheet.addRow(['原备注', '未知列', '颜色']); sheet.addRow(['批量候选', '未映射', '新颜色']);
    const parsed = await readCatalogWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));
    const selected = parsed.sheets.find(item => item.name === '普通台账')!;
    const result = previewCatalogImport(parsed, { sheetId: selected.id, headerRow: 2, mapping: { 0: 'note', 2: 'name' } }, rows);
    expect(selected.mergedRanges).toEqual(['A1:C1']);
    expect(result.counts.pending).toBe(1); expect(result.counts.added).toBe(0);
    expect(result.unmappedColumns).toEqual([{ column: 1, header: '未知列' }]);
    expect(result.records[0]!.values).toEqual({ note: '批量候选', name: '新颜色' });
    expect(result.changes).toEqual([]); expect(result.canSubmit).toBe(false);
  });

  it('does not activate ordinary Excel writes simply because it contains a known ID', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('颜色清单');
    sheet.addRow(['记录ID', '记录版本', '备注']); sheet.addRow([rows[0]!.id, 4, '普通文件中的改动']);
    const result = preview(await readCatalogWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer())));
    expect(result.records[0]!.diffs[0]).toMatchObject({ field: 'note', after: '普通文件中的改动' });
    expect(result.records[0]!.status).toBe('pending'); expect(result.changes).toEqual([]);
  });

  it('retains template rows without IDs as pending and validates dictionaries/months', async () => {
    const parsed = await editedTemplate(workbook => {
      const sheet = workbook.getWorksheet('颜色清单')!;
      sheet.getCell(2, column('id')).value = null;
      sheet.getCell(3, column('registerMonth')).value = '2026-13';
      sheet.getCell(3, column('paintType')).value = '未知漆种';
    });
    const result = preview(parsed, rows, { paintTypes: ['水性素色漆'] });
    expect(result.counts.pending).toBe(1); expect(result.counts.errors).toBe(1);
    expect(result.records[1]!.errors.map(issue => issue.field)).toEqual(['paintType', 'registerMonth']);
    expect(result.changes).toEqual([]);
  });

  it('rejects malicious archives, compressed/expanded size abuse, XML entities and oversized sparse coordinates', async () => {
    expect(() => inspectCatalogArchive(new Uint8Array(CATALOG_XLSX_LIMITS.fileBytes + 1))).toThrow('5 MiB');
    expect(() => inspectCatalogArchive(new Uint8Array(10))).toThrow('完整');
    const files = { '[Content_Types].xml': strToU8('<Types/>'), 'xl/workbook.xml': strToU8('<workbook/>') };
    expect(() => inspectCatalogArchive(zipSync({ ...files, '../evil.xml': strToU8('bad') }))).toThrow('路径');
    expect(() => inspectCatalogArchive(zipSync({ ...files, 'xl/a.xml': strToU8('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///tmp/example">]>') }))).toThrow('实体');
    expect(() => inspectCatalogArchive(zipSync({ ...files, 'xl/large.bin': new Uint8Array(CATALOG_XLSX_LIMITS.expandedBytes + 1) }))).toThrow('20 MiB');
    await expect(readCatalogWorkbook(zipSync({ ...files, 'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1001"><c r="A1001"><v>1</v></c></row></sheetData></worksheet>') }))).rejects.toThrow('1000');
    await expect(readCatalogWorkbook(zipSync({ ...files, 'xl/worksheets/sheet1.xml': strToU8('<worksheet><dimension ref="A1:AG10"/></worksheet>') }))).rejects.toThrow('32 列');
  });

  it('rejects damaged bytes and duplicate mappings before allowing submission', async () => {
    const archive = await exportCatalogTemplate(rows);
    const damaged = archive.slice(); damaged[50] = damaged[50]! ^ 1;
    expect(() => inspectCatalogArchive(damaged)).toThrow();
    const parsed = await editedTemplate(workbook => { workbook.getWorksheet('颜色清单')!.getCell(2, column('note')).value = '改动'; });
    const mapping = suggestCatalogMapping(parsed.sheets[0]!, 1); mapping[30] = 'note';
    const result = preview(parsed, rows, { mapping });
    expect(result.errors[0]!.message).toContain('多列'); expect(result.canSubmit).toBe(false);
  });
});
