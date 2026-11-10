import type { IWorkbookData, IRange } from '@univerjs/core';
/** ExcelJS preserves the filter range, but not native filter criteria. Any
 * deliberate conversion must be visible before producing the export file. */
export function workbookFilters(snapshot:IWorkbookData):Record<string,{ref:IRange;hasCriteria:boolean}>{
  const resources=snapshot.resources?.filter(item=>item.name==='SHEET_FILTER_PLUGIN')??[];
  if(resources.length>1)throw new Error('工作簿筛选资源重复。');
  const content:unknown=JSON.parse(resources[0]?.data||'{}');
  if(!content||typeof content!=='object'||Array.isArray(content))throw new Error('工作簿筛选资源无效。');
  const result:Record<string,{ref:IRange;hasCriteria:boolean}>={};
  for(const [id,value] of Object.entries(content)){
    if(!Object.hasOwn(snapshot.sheets,id)||!value||typeof value!=='object'||Array.isArray(value))throw new Error('筛选工作表不存在。');
    const filter=value as {ref?:IRange;filterColumns?:unknown[]},ref=filter.ref,sheet=snapshot.sheets[id]!;
    if(!ref||![ref.startRow,ref.endRow,ref.startColumn,ref.endColumn].every(Number.isSafeInteger)||ref.startRow<0||ref.startColumn<0||ref.endRow<ref.startRow||ref.endColumn<ref.startColumn||ref.endRow>=sheet.rowCount!||ref.endColumn>=sheet.columnCount!)throw new Error('筛选区域超出工作表。');
    if(filter.filterColumns!==undefined&&!Array.isArray(filter.filterColumns))throw new Error('筛选条件无效。');
    result[id]={ref,hasCriteria:Boolean(filter.filterColumns?.length)};
  }
  return result;
}
export function workbookExportWarnings(snapshot:IWorkbookData):string[]{
  return Object.values(workbookFilters(snapshot)).some(item=>item.hasCriteria)?['此 XLSX 副本保留筛选区域和全部行数据，但不保留当前筛选条件；服务器工作簿中的筛选不变。']:[];
}
