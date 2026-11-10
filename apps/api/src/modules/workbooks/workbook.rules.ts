import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export const WORKBOOK_LIMITS = { bytes: 7 * 1024 * 1024, sheets: 32, rows: 10000, columns: 256, cells: 200000, images: 50, revisionsBytes: 256 * 1024 * 1024 } as const;
// One replaceable slot per author/workbook. Autosaves never consume formal history.
export const WORKBOOK_DRAFT_LIMITS = { slotsPerUser: 8, bytesPerUser: 64 * 1024 * 1024, bytesGlobal: 512 * 1024 * 1024 } as const;
export function draftExpectation(input: Record<string, unknown>, allowMissing = false) {
  const revision = integer(input.expectedDraftRevision, allowMissing ? 0 : 1);
  const id = input.expectedDraftId === null && allowMissing ? null : workbookId(input.expectedDraftId);
  if ((id === null) !== (revision === 0)) throw new BadRequestException('新草稿须使用空标识和版本 0；已有草稿须提供标识和版本。');
  return { id, revision };
}
type JsonObject = Record<string, unknown>;
export function object(value: unknown): JsonObject { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('工作簿内容须为对象。'); return value as JsonObject; }
export function exact(value: JsonObject, keys: readonly string[]) { if (Object.keys(value).some(k => !keys.includes(k))) throw new BadRequestException('请求包含不支持的字段。'); }
export function workbookId(value: unknown): string { if (typeof value !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value)) throw new BadRequestException('工作簿标识无效。'); return value; }
export function operationId(value: unknown): string { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new BadRequestException('操作标识无效。'); return value; }
export function integer(value: unknown, min = 1, max = 2147483646): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new BadRequestException('工作簿范围或版本无效。'); return value; }
export function workbookName(value: unknown): string { if (typeof value !== 'string' || !value.trim() || value.length > 200 || [...value].some(c=>c.charCodeAt(0)<32)) throw new BadRequestException('工作簿名须为 1–200 个字符。'); return value.trim(); }
export function digest(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
const FUNCTIONS = new Set('SUM AVERAGE MIN MAX COUNT COUNTA COUNTBLANK COUNTIF COUNTIFS SUMIF SUMIFS IF IFS IFERROR IFNA AND OR NOT ROUND ROUNDUP ROUNDDOWN ABS INT MOD SQRT POWER PRODUCT SUMPRODUCT LEN LEFT RIGHT MID TRIM CONCAT CONCATENATE TEXT VALUE SUBSTITUTE REPLACE UPPER LOWER EXACT FIND SEARCH DATE YEAR MONTH DAY TODAY NOW VLOOKUP HLOOKUP XLOOKUP INDEX MATCH ROW COLUMN ROWS COLUMNS ISBLANK ISNUMBER ISTEXT TRUE FALSE'.split(' '));
export function validateFormula(raw: unknown) {
  if (raw === undefined || raw === null || raw === '') return;
  if (typeof raw !== 'string' || !raw.startsWith('=') || raw.length > 2048 || [...raw].some(c=>c.charCodeAt(0)<32||'[]{}\\|'.includes(c))) throw new BadRequestException('公式含不支持的外部引用、数组或内容。');
  const formula = raw.replace(/"(?:[^"]|"")*"/g, '""').replace(/'(?:[^']|'')*'!|[\p{L}\p{N}_.]+!/gu, 'SHEET!');
  for (const match of formula.matchAll(/([A-Za-z_][A-Za-z\d_.]*)\s*\(/g)) if (!FUNCTIONS.has(match[1]!.toUpperCase())) throw new BadRequestException(`暂不支持函数 ${match[1]}；请保留源文件。`);
  const column=(value:string)=>[...value.toUpperCase()].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
  for(const match of formula.matchAll(/(?:^|[^A-Za-z_])\$?([A-Za-z]+)\$?([1-9]\d*)(?![A-Za-z_\d(])/g))if(column(match[1]!)>WORKBOOK_LIMITS.columns||Number(match[2])>WORKBOOK_LIMITS.rows)throw new BadRequestException('公式引用超过工作簿行列范围。');
  for(const match of formula.matchAll(/(?:^|[^A-Za-z_\d])\$?([A-Za-z]+)\s*:\s*\$?([A-Za-z]+)(?![A-Za-z_\d])/g))if(column(match[1]!)>WORKBOOK_LIMITS.columns||column(match[2]!)>WORKBOOK_LIMITS.columns)throw new BadRequestException('公式引用超过工作簿行列范围。');
  for(const match of formula.matchAll(/(?:^|[^A-Za-z_\d])\$?([1-9]\d*)\s*:\s*\$?([1-9]\d*)(?![A-Za-z_\d])/g))if(Number(match[1])>WORKBOOK_LIMITS.rows||Number(match[2])>WORKBOOK_LIMITS.rows)throw new BadRequestException('公式引用超过工作簿行列范围。');
  if (/(?:https?:|file:|javascript:|data:|\/\/)/i.test(formula)) throw new BadRequestException('公式不能访问外部地址。');
}
const RESOURCE_NAMES = new Set(['SHEET_AuthzIoMockService_PLUGIN', 'SHEET_DRAWING_PLUGIN', 'SHEET_FILTER_PLUGIN', 'SHEET_DEFINED_NAME_PLUGIN', 'SHEET_RANGE_THEME_MODEL_PLUGIN', 'SHEET_WORKSHEET_PROTECTION_PLUGIN', 'SHEET_WORKSHEET_PROTECTION_POINT_PLUGIN', 'SHEET_RANGE_PROTECTION_PLUGIN']);
// Native filter snapshots are data, never executable query expressions. Keep
// every range, cache and criterion bounded by the already validated worksheet.
function validateFilters(raw:unknown,sheets:JsonObject){
  const content=object(raw);
  for(const [sheetId,value] of Object.entries(content)){
    if(!Object.hasOwn(sheets,sheetId))throw new BadRequestException('筛选的工作表不存在。');
    const sheet=object(sheets[sheetId]),filter=object(value);exact(filter,['ref','filterColumns','cachedFilteredOut']);
    const range=object(filter.ref);exact(range,['startRow','endRow','startColumn','endColumn','rangeType']);
    const startRow=integer(range.startRow,0,Number(sheet.rowCount)-1),endRow=integer(range.endRow,startRow,Number(sheet.rowCount)-1);
    const startColumn=integer(range.startColumn,0,Number(sheet.columnCount)-1),endColumn=integer(range.endColumn,startColumn,Number(sheet.columnCount)-1);
    if(range.rangeType!==undefined)integer(range.rangeType,0,3);
    const columns=filter.filterColumns??[];
    if(!Array.isArray(columns)||columns.length>endColumn-startColumn+1)throw new BadRequestException('筛选列数量超限。');
    const ids=new Set<number>();
    const array=(value:unknown,max:number)=>{if(!Array.isArray(value)||value.length>max)throw new BadRequestException('筛选条件数量超限。');return value;};
    const text=(value:unknown)=>{if(typeof value!=='string'||value.length>32767)throw new BadRequestException('筛选文字超限。');};
    const color=(value:unknown)=>{if(typeof value!=='string'||!/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(value))throw new BadRequestException('筛选颜色无效。');};
    for(const rawColumn of columns){
      const column=object(rawColumn);exact(column,['colId','filters','customFilters','colorFilters']);const id=integer(column.colId,startColumn,endColumn);if(ids.has(id))throw new BadRequestException('筛选列重复。');ids.add(id);
      if(['filters','customFilters','colorFilters'].filter(key=>column[key]!==undefined).length>1)throw new BadRequestException('筛选列不能同时使用多种条件。');
      if(column.filters!==undefined){const values=object(column.filters);exact(values,['blank','filters']);if(values.blank!==undefined&&values.blank!==true)throw new BadRequestException('空值筛选无效。');if(values.filters!==undefined)for(const value of array(values.filters,Number(sheet.rowCount)))text(value);}
      if(column.colorFilters!==undefined){const values=object(column.colorFilters);exact(values,['cellFillColors','cellTextColors']);if(values.cellFillColors!==undefined)for(const value of array(values.cellFillColors,256))if(value!==null)color(value);if(values.cellTextColors!==undefined)for(const value of array(values.cellTextColors,256))color(value);}
      if(column.customFilters!==undefined){const values=object(column.customFilters);exact(values,['and','customFilters']);if(values.and!==undefined&&values.and!==1)throw new BadRequestException('筛选组合无效。');const items=array(values.customFilters,2);if(!items.length)throw new BadRequestException('筛选条件为空。');for(const item of items){const term=object(item);exact(term,['val','operator']);if(typeof term.val==='number'){if(!Number.isFinite(term.val))throw new BadRequestException('筛选值无效。');}else text(term.val);if(term.operator!==undefined&&!['equal','notEqual','greaterThan','greaterThanOrEqual','lessThan','lessThanOrEqual'].includes(String(term.operator)))throw new BadRequestException('筛选比较符无效。');}}
    }
    if(filter.cachedFilteredOut!==undefined){const rows=array(filter.cachedFilteredOut,endRow-startRow),unique=new Set<number>();for(const value of rows){const row=integer(value,startRow+1,endRow);if(unique.has(row))throw new BadRequestException('筛选缓存行重复。');unique.add(row);}}
  }
}
export function validateSnapshot(raw: unknown, id: string) {
  const snapshot = object(raw); exact(snapshot, ['id','name','appVersion','locale','styles','sheetOrder','sheets','resources','rev','dateSystem','defaultStyle','custom']);
  if (snapshot.id !== id || snapshot.appVersion !== '1.0.4') throw new BadRequestException('工作簿身份或格式版本不匹配。');
  workbookName(snapshot.name);
  const serialized = JSON.stringify(snapshot), bytes = Buffer.byteLength(serialized);
  if (bytes > WORKBOOK_LIMITS.bytes) throw new BadRequestException('工作簿快照超过 7 MiB，图片请通过上传入口保存。');
  let nodes = 0;
  const inspect = (value: unknown, depth = 0) => {
    if (++nodes > 2000000 || depth > 32) throw new BadRequestException('工作簿嵌套或内容数量超限。');
    if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 1e15)) throw new BadRequestException('工作簿包含超范围数值。');
    if (typeof value === 'string' && value.length > 1024 * 1024) throw new BadRequestException('工作簿单项内容过大。');
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__','constructor','prototype','html','src','url','href','hyperlink','customBlocks','customRanges','embeddedObjects'].includes(key) && child !== null && child !== undefined && !(Array.isArray(child) && child.length === 0)) throw new BadRequestException('工作簿包含未支持的嵌入内容或链接。');
      if (key === 'custom' && child !== null && child !== undefined && Object.keys(object(child)).length) throw new BadRequestException('暂不支持自定义工作簿扩展。');
      if (key === 'backgroundImage' && child !== null && child !== undefined) { const bg=object(child);exact(bg,['source','imageSourceType','scaleX','scaleY']);workbookId(bg.source);if(bg.imageSourceType!=='UUID')throw new BadRequestException('背景图片必须是已扫描的本地资产。');for(const scale of ['scaleX','scaleY'])if(bg[scale]!==undefined&&(typeof bg[scale]!=='number'||!Number.isFinite(bg[scale])||Number(bg[scale])<0.01||Number(bg[scale])>100))throw new BadRequestException('背景图片物理尺寸超限。'); }
      if (key === 'f') validateFormula(child);
      inspect(child, depth + 1);
    }
  };
  inspect(snapshot);
  const order = snapshot.sheetOrder;
  if (!Array.isArray(order) || !order.length || order.length > WORKBOOK_LIMITS.sheets || new Set(order).size !== order.length) throw new BadRequestException('工作表数量须为 1–32，标识不可重复。');
  const sheets = object(snapshot.sheets);
  if (Object.keys(sheets).length !== order.length || order.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || !Object.hasOwn(sheets,id))) throw new BadRequestException('工作表顺序与内容不一致。');
  let cells = 0; let formulas = 0; const names = new Set<string>();
  const imageIds = new Set<string>(),backgroundImageIds=new Set<string>(); let drawingCount = 0;
  for (const sheetId of order as string[]) {
    const sheet = object(sheets[sheetId]);
    if (sheet.id !== sheetId || typeof sheet.name !== 'string' || !sheet.name.trim() || sheet.name.length > 31 || [...sheet.name].some(c=>'[]*?/:\\'.includes(c)) || names.has(sheet.name.toLocaleLowerCase())) throw new BadRequestException('工作表名称无效或重复。');
    names.add(sheet.name.toLocaleLowerCase());
    if(sheet.backgroundImage){const asset=workbookId(object(sheet.backgroundImage).source);imageIds.add(asset);backgroundImageIds.add(asset);drawingCount++;}
    const rows = integer(sheet.rowCount,1,WORKBOOK_LIMITS.rows), columns = integer(sheet.columnCount,1,WORKBOOK_LIMITS.columns);
    const index = (key: string, max: number) => { if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= max) throw new BadRequestException('单元格或样式超出工作表范围。'); };
    for (const [r,row] of Object.entries(object(sheet.cellData ?? {}))) {
      index(r,rows);
      for (const [c,rawCell] of Object.entries(object(row))) {
        index(c,columns); if (++cells > WORKBOOK_LIMITS.cells) throw new BadRequestException('工作簿有内容单元格超过 200000 个。');
        if (rawCell === null) continue;
        const cell = object(rawCell); exact(cell, ['v','t','s','p','f','si','ref','ft','fd','custom']);
        if (cell.f && ++formulas > 10000) throw new BadRequestException('公式数量超过 10000 个。');
        if (cell.v !== undefined && cell.v !== null && !['string','number','boolean'].includes(typeof cell.v)) throw new BadRequestException('单元格值类型无效。');
        if (typeof cell.v === 'string' && cell.v.length > 32767) throw new BadRequestException('单元格文字超过 32767 字符。');
      }
    }
    for (const key of Object.keys(object(sheet.rowData ?? {}))) index(key,rows);
    for (const key of Object.keys(object(sheet.columnData ?? {}))) index(key,columns);
    if (sheet.mergeData !== undefined) {
      if (!Array.isArray(sheet.mergeData) || sheet.mergeData.length > 10000) throw new BadRequestException('合并区域数量超限。');
      for (const rawRange of sheet.mergeData) { const range=object(rawRange); const r=integer(range.startRow,0,rows-1),c=integer(range.startColumn,0,columns-1); integer(range.endRow,r,rows-1);integer(range.endColumn,c,columns-1); }
    }
  }
  if (Object.keys(object(snapshot.styles)).length > 50000) throw new BadRequestException('工作簿样式数量超限。');
  if (snapshot.resources !== undefined) {
    if (!Array.isArray(snapshot.resources) || snapshot.resources.length > 20) throw new BadRequestException('工作簿资源数量超限。');
    const resourceNames=new Set<string>();
    for (const rawResource of snapshot.resources) {
      const resource = object(rawResource);
      if (typeof resource.name !== 'string' || !RESOURCE_NAMES.has(resource.name) || typeof resource.data !== 'string') throw new BadRequestException('包含未支持的工作簿资源。');
      exact(resource,['name','data']);if(resourceNames.has(resource.name))throw new BadRequestException('工作簿资源名称重复。');resourceNames.add(resource.name);
      let content: unknown; try { content = resource.data ? JSON.parse(resource.data) : {}; } catch { throw new BadRequestException('工作簿资源损坏。'); }
      inspect(content);
      if(resource.name==='SHEET_FILTER_PLUGIN'){validateFilters(content,sheets);continue;}
      if (resource.name !== 'SHEET_DRAWING_PLUGIN') {
        // Permissions and named ranges are not application authorization and are
        // not part of the first exchange contract. Preserve empty engine records.
        if (Object.keys(object(content)).length) throw new BadRequestException('暂不支持命名区域或工作表保护，请保留源文件。');
        continue;
      }
      for (const [sheetId,rawSet] of Object.entries(object(content))) {
        if (!Object.hasOwn(sheets,sheetId)) throw new BadRequestException('图片的工作表不存在。');
        const set=object(rawSet),data=object(set.data ?? {});
        if (!Array.isArray(set.order) || set.order.length !== Object.keys(data).length || new Set(set.order).size !== set.order.length) throw new BadRequestException('图片顺序无效。');
        for (const [drawingId,rawDrawing] of Object.entries(data)) {
          const drawing=object(rawDrawing); if (++drawingCount > WORKBOOK_LIMITS.images) throw new BadRequestException('图片实例超过 50 个。');
          const sheet=object(sheets[sheetId]);
          for(const key of ['sheetTransform','axisAlignSheetTransform']) { const transform=object(drawing[key]); for(const edge of ['from','to']) {const marker=object(transform[edge]);integer(marker.row,0,Number(sheet.rowCount));integer(marker.column,0,Number(sheet.columnCount));for(const offset of ['rowOffset','columnOffset'])if(typeof marker[offset]!=='number'||!Number.isFinite(marker[offset])||Math.abs(Number(marker[offset]))>100000)throw new BadRequestException('图片位置超出范围。');} }
          if(drawing.transform){const transform=object(drawing.transform);for(const key of ['width','height'])if(typeof transform[key]!=='number'||Number(transform[key])<=0||Number(transform[key])>100000)throw new BadRequestException('图片尺寸超出范围。');}
          if (!set.order.includes(drawingId) || drawing.drawingId !== drawingId || drawing.unitId !== id || drawing.subUnitId !== sheetId || drawing.drawingType !== 0 || drawing.imageSourceType !== 'UUID') throw new BadRequestException('仅支持已扫描的本地工作簿图片。');
          imageIds.add(workbookId(drawing.source));
          if (imageIds.size > WORKBOOK_LIMITS.images) throw new BadRequestException('每个工作簿最多 50 张图片。');
        }
      }
    }
  }
  return { snapshot, serialized, bytes, hash: digest(snapshot), imageIds: [...imageIds],backgroundImageIds:[...backgroundImageIds] };
}
