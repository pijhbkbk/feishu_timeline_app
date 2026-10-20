import { expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { exportRecordWorkbook } from '../business-sheet/record-exchange';
import { productionRow, PRODUCTION_COLUMNS, type ProductionFact } from './production-adapter';
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
  expect(cell(2, 'quantity')).toBe('100'); expect(cell(2, 'effectiveQuantity')).toBeNull();
  expect(cell(3, 'quantity')).toBe('26'); expect(cell(3, 'effectiveQuantity')).toBe('26'); expect(cell(3, 'vehicleModel')).toBe('车型甲');
});
