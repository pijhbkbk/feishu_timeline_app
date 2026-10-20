import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { LocaleType } from '@univerjs/core';
import { BusinessMappingPanel, MappingPlanTable } from './mapping-panel';
import { prepareBusinessMapping, type BusinessMappingSource } from './business-mapping';
import { prepareMappedBusiness } from './business-apply';
import { PERSON_COLUMNS } from '../person-sheet/person-adapter';
it('initial dialog explains separate saves and never runs a request while rendering', () => {
  const getSource = vi.fn(); const html = renderToStaticMarkup(<BusinessMappingPanel actorId="actor" getSource={getSource} onClose={() => {}} onApplied={() => {}} />);
  expect(html).toContain('工作簿保存与业务应用分别进行'); expect(html).toContain('行号仅标记来源'); expect(html).toContain('正在读取工作簿来源'); expect(getSource).not.toHaveBeenCalled();
});
it('paginates all preview rows while keeping the complete error and change counts visible', async () => {
  const id = '572766eb-ecb3-49c4-9d34-9242236d976a';
  const source: BusinessMappingSource = { workbookId: id, formalRevision: 1, sourceSnapshotHash: 'a'.repeat(64), snapshot: { id, name: '合成预览', appVersion: '1.0.4', locale: LocaleType.ZH_CN, styles: {}, sheetOrder: ['data'], sheets: { data: { id: 'data', name: '合成人员', rowCount: 200, columnCount: 2,
    cellData: Object.fromEntries(Array.from({ length: 101 }, (_, index) => [index + 1, { 0: { v: `合成人员${index}` }, 1: { v: index === 100 ? '不能导入的资格' : null } }])) } } } };
  const mapping = await prepareBusinessMapping(source, { target: { kind: 'person' }, sheetId: 'data', headerRow: 0, range: { startRow: 1, endRow: 104, startColumn: 0, endColumn: 1 }, fields: [{ column: 0, field: 'name' }, { column: 1, field: 'roles' }], clearFields: [] }, PERSON_COLUMNS);
  const preview = prepareMappedBusiness(mapping, { kind: 'person', directory: { items: [], departments: [], hasMore: false } });
  const first = renderToStaticMarkup(<MappingPlanTable preview={preview} page={1} setPage={() => {}} />), last = renderToStaticMarkup(<MappingPlanTable preview={preview} page={2} setPage={() => {}} />);
  expect(first).toContain('新增 100'); expect(first).toContain('错误 1'); expect(first).not.toContain('业务资格是只读信息'); expect(last).toContain('业务资格是只读信息'); expect(last).toContain('共 101 行'); expect(first).toContain('不是 ID'); expect(first).toContain('空白来源行跳过 3');
  expect(first).toContain('映射字段与值'); expect(first).toContain('<dt>姓名</dt><dd>合成人员0</dd>'); expect(last).toContain('不能导入的资格'); expect(first).not.toContain('不能导入的资格');
});
