import { expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { strFromU8 } from 'fflate';
import { exchangeRows, exportRecordWorkbook, readExchangeFile, suggestMapping } from '../business-sheet/record-exchange';
import { productionRow, PRODUCTION_COLUMNS, prepareProductionImport, type ProductionFact } from './production-adapter';
it('exports model identities, revisions and selected-count quantities without adding the retained total', async () => {
  const total: ProductionFact = { id: 'total-id', revision: 2, baseId: 'base', baseName: '合成基地', colorId: 'color', colorName: '合成色', colorCode: '', month: '2026-10',
    quantity: '100', unit: '台', metricScope: 'MONTHLY_ACTUAL_TOTAL_V1', metricScopeLabel: '月度总量', rowKind: 'MONTH_TOTAL', editable: true, originalSource: null,
    countingStatus: '保留对账，不计入统计', includedInOperationalTotal: false, effectiveQuantity: null };
  const model: ProductionFact = { ...total, id: 'model-id', revision: 3, vehicleModel: '车型甲', rowKind: 'MODEL_DETAIL', quantity: '26',
    metricScope: 'MONTHLY_MODEL_DETAIL_V1', metricScopeLabel: '车型明细', countingStatus: '计入月度统计', includedInOperationalTotal: true, effectiveQuantity: '26' };
  const bytes = await exportRecordWorkbook('月度产量', 'production', PRODUCTION_COLUMNS, [productionRow(total), productionRow(model)], []);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  const sheet = workbook.worksheets[0]!;
  expect(sheet.getColumn(1).hidden).toBe(true); expect(sheet.getColumn(2).hidden).toBe(true);
  expect(sheet.getCell(2, 1).value).toBe('total-id'); expect(sheet.getCell(3, 1).value).toBe('model-id'); expect(sheet.getCell(3, 2).value).toBe(3);
  const cell = (row: number, key: string) => sheet.getCell(row, 3 + PRODUCTION_COLUMNS.findIndex(column => column.key === key)).value;
  expect(cell(2, 'quantity')).toBe(100); expect(cell(2, 'effectiveQuantity')).toBeNull();
  expect(cell(3, 'quantity')).toBe(26); expect(cell(3, 'effectiveQuantity')).toBe(26); expect(cell(3, 'vehicleModel')).toBe('车型甲');
  const imported = await readExchangeFile(new File([new Uint8Array(bytes)], 'production.xlsx'));
  const inputs = exchangeRows(imported, sheet.id, 1, suggestMapping(sheet, 1, PRODUCTION_COLUMNS));
  expect(inputs.map(input => [input.id, input.revision, input.values.quantity])).toEqual([['total-id', 2, '100'], ['model-id', 3, '26']]);
  const context = { facts: new Map([['total-id', total], ['model-id', model]]), colors: [], chosenColorId: '', chosenBaseId: '' };
  expect(inputs.map(input => prepareProductionImport(input, [], context).status)).toEqual(['unchanged', 'unchanged']);
});

it('keeps exported quantities usable by numeric spreadsheet operations, with unknown distinct from zero', async () => {
  const quantities = ['9', '12', '5', '0', null, '1000000000'];
  const rows = quantities.map((quantity, index) => ({ id: `000${index}`, revision: index + 1, editable: [], values: {
    quantity, effectiveQuantity: quantity, month: '2026-09', colorCode: '00017', vehicleModel: '=SUM(A1:A9)',
  } }));
  const bytes = await exportRecordWorkbook('月度产量', 'production', PRODUCTION_COLUMNS, rows, []);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as never);
  const sheet = workbook.worksheets[0]!;
  const values = (key: string) => rows.map((_, i) => sheet.getCell(i + 2, 3 + PRODUCTION_COLUMNS.findIndex(column => column.key === key)).value);
  expect(values('quantity')).toEqual([9, 12, 5, 0, null, 1000000000]);
  expect(values('effectiveQuantity')).toEqual([9, 12, 5, 0, null, 1000000000]);
  expect(sheet.getCell('I2').type).toBe(ExcelJS.ValueType.Number);
  expect(sheet.getCell('I2').numFmt).toBe('0');
  // Excel ignores text operands in a SUM range: verify the written operand types,
  // without mistaking this parser check for an actual Office recalculation.
  expect(values('effectiveQuantity').slice(0, 3).filter(value => typeof value === 'number').reduce((a, b) => a + b, 0)).toBe(26);
  expect(values('colorCode')).toEqual(quantities.map(() => '00017'));
  expect(values('vehicleModel')).toEqual(quantities.map(() => '=SUM(A1:A9)'));
  expect(sheet.getCell('G2').type).toBe(ExcelJS.ValueType.String);
  expect(sheet.getCell('A2').value).toBe('0000'); expect(sheet.getCell('B2').value).toBe(1);
  expect(sheet.getCell('C2').value).toBe('2026-09');
  const file = await readExchangeFile(new File([new Uint8Array(bytes)], 'production.xlsx'));
  const xml = strFromU8(file.archive['xl/worksheets/sheet1.xml']!);
  expect(xml).toMatch(/<c\b[^>]*\br="I2"[^>]*><v>9<\/v><\/c>/);
  expect(xml).not.toMatch(/<c\b[^>]*\br="(?:I|N)[2-7]"[^>]*\bt="s"/);
  expect(xml).not.toMatch(/<f(?:\s|>)/);
});

it.each(['=1+1', '1e3', 'NaN', 'Infinity', '9台', '-1', '1.5', '9007199254740992'])('rejects an invalid numeric export value %s instead of silently coercing it', async quantity => {
  await expect(exportRecordWorkbook('月度产量', 'production', PRODUCTION_COLUMNS,
    [{ id: 'fact', revision: 1, editable: [], values: { quantity } }], [])).rejects.toThrow('实际台数');
});
