import ExcelJS from 'exceljs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { normalizeSpreadsheetNamespaces } from './xlsx-namespaces';
import { readFreeWorkbook } from './xlsx';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const EXCEL_2013 = 'http://schemas.microsoft.com/office/spreadsheetml/2010/11/main';
const ABS_PATH = 'http://schemas.microsoft.com/office/spreadsheetml/2010/11/ac';
// Anonymous structure only: never include an original workbook's saved path.
const pathMetadata = `<mc:AlternateContent xmlns:mc="${MC}"><mc:Choice Requires="x15" xmlns:x15="${EXCEL_2013}"><x15ac:absPath xmlns:x15ac="${ABS_PATH}" url="/synthetic/location/"/></mc:Choice></mc:AlternateContent>`;
const warning = '工作簿原保存路径元数据不进入编辑副本；原文件保持不变。';
const workbookXml = (metadata: string) => `<workbook xmlns="${MAIN}">${metadata}</workbook>`;
const normalize = (xml: string, part = 'xl/workbook.xml') => strFromU8(normalizeSpreadsheetNamespaces({ [part]: strToU8(xml) })[part]!);

describe('native workbook saved-directory metadata boundary', () => {
  it.each([pathMetadata, pathMetadata.replaceAll('mc:', 'compat:').replace('xmlns:mc=', 'xmlns:compat=')
    .replaceAll('x15ac:', 'path:').replace('xmlns:x15ac=', 'xmlns:path=')
    .replace('Requires="x15"', 'Requires="version"').replace('xmlns:x15=', 'xmlns:version=')
    .replace('/synthetic/location/"/>', '/synthetic/location/"></path:absPath>')])('preserves the bounded qualified metadata with namespace aliases', metadata => {
    const xml = workbookXml(metadata);
    expect(normalize(xml)).toBe(xml);
    const prefixed = `<s:workbook xmlns:s="${MAIN}">${metadata}</s:workbook>`;
    expect(normalize(prefixed)).toBe(`<workbook xmlns="${MAIN}" xmlns:s="${MAIN}">${metadata}</workbook>`);
  });

  it('imports original bytes without changing dates, strings, zero, formulas or the source path', async () => {
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('合成日期');
    sheet.getCell('A1').value = '00017'; sheet.getCell('B1').value = 0;
    sheet.getCell('C1').value = 12; sheet.getCell('C2').value = 8;
    sheet.getCell('D1').value = { formula: 'SUM(C1:C2)', result: 20 };
    sheet.getCell('E1').value = 45912 + 592 / 1440; sheet.getCell('E1').numFmt = 'yyyy/mm/dd hh:mm';
    sheet.getCell('F1').value = ''; sheet.getCell('G1').numFmt = '0.00';
    const files = unzipSync(new Uint8Array(await book.xlsx.writeBuffer()));
    files['xl/workbook.xml'] = strToU8(strFromU8(files['xl/workbook.xml']!).replace('</workbook>', `${pathMetadata}</workbook>`));
    const bytes = zipSync(files), before = new Uint8Array(bytes);
    const parsed = await readFreeWorkbook(bytes, 'synthetic-date.xlsx', crypto.randomUUID());
    expect(bytes).toEqual(before); expect(parsed.warnings).toEqual([warning]);
    const cells = parsed.snapshot.sheets[parsed.snapshot.sheetOrder[0]!]!.cellData!;
    expect(cells[0]?.[0]).toMatchObject({ t: 1, v: '00017' });
    expect(cells[0]?.[1]).toMatchObject({ t: 2, v: 0 });
    expect(cells[0]?.[3]).toMatchObject({ f: '=SUM(C1:C2)', v: 20 });
    expect(cells[0]?.[4]?.v).toBeCloseTo(45912 + 592 / 1440, 8);
    expect(cells[0]?.[4]?.s).toMatchObject({ n: { pattern: 'yyyy/mm/dd hh:mm' } });
    expect(cells[0]?.[5]).toMatchObject({ t: 1, v: '' });
    expect(cells[0]?.[6]?.v).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain('/synthetic/location/');
  });

  const invalidMetadata = [
    pathMetadata.replace(MC, 'urn:foreign-mc'),
    pathMetadata.replace(ABS_PATH, 'urn:foreign-path'),
    pathMetadata.replace(EXCEL_2013, ABS_PATH),
    pathMetadata.replace('Requires="x15"', 'Requires="undefinedAlias"'),
    pathMetadata.replace('Requires="x15"', 'Requires="x15 mc"'),
    pathMetadata.replace('Requires="x15"', ''),
    pathMetadata.replace('Requires="x15"', 'mc:Requires="x15"'),
    pathMetadata.replace('Requires="x15"', 'Requires="x15" mc:ProcessContent="sheets"'),
    pathMetadata.replace('<mc:AlternateContent ', '<mc:AlternateContent mc:Ignorable="x15" '),
    pathMetadata.replace('</mc:Choice>', '<sheets><sheet name="hidden" sheetId="1"/></sheets></mc:Choice>'),
    pathMetadata.replace('</mc:Choice>', '<mc:Choice Requires="x15"/></mc:Choice>'),
    pathMetadata.replace('</mc:AlternateContent>', '<mc:Fallback><cols><col min="1" max="1000000000"/></cols></mc:Fallback></mc:AlternateContent>'),
    pathMetadata.replace('url="/synthetic/location/"/>', 'url="/synthetic/location/"><sheetData/></x15ac:absPath>'),
    pathMetadata.replace('url="/synthetic/location/"/>', 'url="/synthetic/location/">hidden text</x15ac:absPath>'),
    pathMetadata.replace('url="/synthetic/location/"/>', 'url="/synthetic/location/"><![CDATA[hidden]]></x15ac:absPath>'),
    pathMetadata.replace('url="/synthetic/location/"', 'x15ac:url="/synthetic/location/"'),
    pathMetadata.replace('url="/synthetic/location/"', 'url="/synthetic/location/" id="hidden"'),
    pathMetadata.replace('url="/synthetic/location/"', 'url=""'),
    pathMetadata.replace('/synthetic/location/', 'x'.repeat(4097)),
    pathMetadata.replace('<x15ac:absPath ', '<x15ac:absPath xmlns="urn:rebound" '),
    pathMetadata.replace(/<x15ac:absPath[^>]*\/>/, ''),
    pathMetadata.replace('</mc:Choice>', `<x15ac:absPath xmlns:x15ac="${ABS_PATH}" url="synthetic"/></mc:Choice>`),
    pathMetadata.replace(/<mc:Choice[\s\S]*<\/mc:Choice>/, ''),
    `<mc:AlternateContent xmlns:mc="${MC}"/>`,
    `<mc:AlternateContent xmlns:mc="${MC}"><mc:Choice Requires="x15" xmlns:x15="${EXCEL_2013}"/></mc:AlternateContent>`,
    pathMetadata + pathMetadata,
    `<sheets>${pathMetadata}</sheets>`,
    `<extLst><ext uri="synthetic">${pathMetadata}</ext></extLst>`,
  ];

  it.each(invalidMetadata.map((metadata, index) => [index, metadata] as const))('rejects unsupported path metadata case %s before ExcelJS', async (_index, metadata) => {
    const book = new ExcelJS.Workbook(); book.addWorksheet('合成').getCell('A1').value = 1;
    const files = unzipSync(new Uint8Array(await book.xlsx.writeBuffer()));
    files['xl/workbook.xml'] = strToU8(strFromU8(files['xl/workbook.xml']!).replace('</workbook>', `${metadata}</workbook>`));
    const load = vi.spyOn(Object.getPrototypeOf(new ExcelJS.Workbook().xlsx), 'load').mockImplementation(async () => { throw new Error('UNEXPECTED_EXCELJS_LOAD'); });
    try { await expect(readFreeWorkbook(zipSync(files), 'invalid-path.xlsx', crypto.randomUUID())).rejects.toThrow('XLSX XML'); expect(load).not.toHaveBeenCalled(); }
    finally { load.mockRestore(); }
  });

  it('does not admit this metadata in a worksheet or allow actual allocation bounds to be bypassed', async () => {
    expect(() => normalize(`<worksheet xmlns="${MAIN}">${pathMetadata}</worksheet>`, 'xl/worksheets/sheet1.xml')).toThrow('XLSX XML');
    const book = new ExcelJS.Workbook(); book.addWorksheet('合成').getCell('A1').value = 1;
    const files = unzipSync(new Uint8Array(await book.xlsx.writeBuffer()));
    files['xl/workbook.xml'] = strToU8(strFromU8(files['xl/workbook.xml']!).replace('</workbook>', `${pathMetadata}</workbook>`));
    files['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(files['xl/worksheets/sheet1.xml']!).replace('<sheetData>', '<cols><col min="1" max="1000000000"/></cols><sheetData>'));
    const load = vi.spyOn(Object.getPrototypeOf(new ExcelJS.Workbook().xlsx), 'load').mockImplementation(async () => { throw new Error('UNEXPECTED_EXCELJS_LOAD'); });
    try { await expect(readFreeWorkbook(zipSync(files), 'oversized-path.xlsx', crypto.randomUUID())).rejects.toThrow('XLSX 行列或样式索引超限'); expect(load).not.toHaveBeenCalled(); }
    finally { load.mockRestore(); }
  });

  it('still rejects external relationships when valid saved-directory metadata is present', async () => {
    const book = new ExcelJS.Workbook(); book.addWorksheet('合成').getCell('A1').value = { text: '外链', hyperlink: 'https://example.invalid/' };
    const files = unzipSync(new Uint8Array(await book.xlsx.writeBuffer()));
    files['xl/workbook.xml'] = strToU8(strFromU8(files['xl/workbook.xml']!).replace('</workbook>', `${pathMetadata}</workbook>`));
    const load = vi.spyOn(Object.getPrototypeOf(new ExcelJS.Workbook().xlsx), 'load').mockImplementation(async () => { throw new Error('UNEXPECTED_EXCELJS_LOAD'); });
    try { await expect(readFreeWorkbook(zipSync(files), 'external-path.xlsx', crypto.randomUUID())).rejects.toThrow('文件包含外部链接'); expect(load).not.toHaveBeenCalled(); }
    finally { load.mockRestore(); }
  });
});
