import type { IDocumentData, IWorkbookData } from '@univerjs/core';

/** A not-yet-confirmed cell editor is separate from the committed sheet model.
 * In particular, partial formulas and leading zeroes must not be parsed here. */
export interface WorkbookEditingDraft {
  sheetId:string; row:number; column:number;
  document:IDocumentData;
}
export function validateEditingDraft(edit:WorkbookEditingDraft,snapshot:IWorkbookData){
  const sheet=snapshot.sheets[edit.sheetId];
  if(!sheet||!Number.isSafeInteger(edit.row)||!Number.isSafeInteger(edit.column)||edit.row<0||edit.column<0||edit.row>=sheet.rowCount!||edit.column>=sheet.columnCount!)throw new Error('未确认输入的位置已失效，原草稿保留。');
  const doc=edit.document,body=doc?.body;
  if(!doc||!doc.documentStyle||!body||typeof body.dataStream!=='string'||body.dataStream.length>20002||!body.dataStream.endsWith('\r\n'))throw new Error('未确认输入的文档无效，原草稿保留。');
  // The cell editor has no independent resources, tables, or external objects.
  const emptySources=['drawings','drawingsOrder','headers','footers','tableSource'] as const;
  if(Object.keys(doc).some(key=>!['id','rev','locale','title','body','documentStyle','disabled',...emptySources].includes(key))||emptySources.some(key=>Object.keys(doc[key]??{}).length>0)||Object.keys(body).some(key=>!['dataStream','textRuns','paragraphs','sectionBreaks','customBlocks','customRanges','customDecorations','tables'].includes(key))||body.customBlocks?.length||body.customRanges?.length||body.customDecorations?.length||body.tables?.length)throw new Error('未确认输入包含不支持的内容，原草稿保留。');
  if(new TextEncoder().encode(JSON.stringify(edit)).length>256*1024)throw new Error('未确认单元格输入超过 256 KiB，请确认输入后保存。');
  for(const run of body.textRuns??[])if(!Number.isSafeInteger(run.st)||!Number.isSafeInteger(run.ed)||run.st<0||run.ed<run.st||run.ed>body.dataStream.length)throw new Error('未确认输入的格式范围无效。');
}
