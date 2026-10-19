import { LocaleType, type ICellData, type IWorkbookData } from '@univerjs/core';
export const WORKBOOK_LIMITS={rows:10000,columns:256,sheets:32,cells:200000,images:50,bytes:7*1024*1024} as const;
const FUNCTIONS=new Set('SUM AVERAGE MIN MAX COUNT COUNTA COUNTBLANK COUNTIF COUNTIFS SUMIF SUMIFS IF IFS IFERROR IFNA AND OR NOT ROUND ROUNDUP ROUNDDOWN ABS INT MOD SQRT POWER PRODUCT SUMPRODUCT LEN LEFT RIGHT MID TRIM CONCAT CONCATENATE TEXT VALUE SUBSTITUTE REPLACE UPPER LOWER EXACT FIND SEARCH DATE YEAR MONTH DAY TODAY NOW VLOOKUP HLOOKUP XLOOKUP INDEX MATCH ROW COLUMN ROWS COLUMNS ISBLANK ISNUMBER ISTEXT TRUE FALSE'.split(' '));
export function checkFormula(raw:string){
  if(!raw.startsWith('=')||raw.length>2048||[...raw].some(c=>c.charCodeAt(0)<32||'[]{}\\|'.includes(c)))throw new Error('公式含不支持的外部引用、数组或内容。');
  const formula=raw.replace(/"(?:[^"]|"")*"/g,'""').replace(/'(?:[^']|'')*'!|[\p{L}\p{N}_.]+!/gu,'SHEET!');
  for(const match of formula.matchAll(/([A-Za-z_][A-Za-z\d_.]*)\s*\(/g))if(!FUNCTIONS.has(match[1]!.toUpperCase()))throw new Error(`暂不支持函数 ${match[1]}，请保留源文件。`);
  const column=(value:string)=>[...value.toUpperCase()].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
  for(const match of formula.matchAll(/(?:^|[^A-Za-z_])\$?([A-Za-z]+)\$?([1-9]\d*)(?![A-Za-z_\d(])/g))if(column(match[1]!)>WORKBOOK_LIMITS.columns||Number(match[2])>WORKBOOK_LIMITS.rows)throw new Error('公式引用超过工作簿行列范围。');
  for(const match of formula.matchAll(/(?:^|[^A-Za-z_\d])\$?([A-Za-z]+)\s*:\s*\$?([A-Za-z]+)(?![A-Za-z_\d])/g))if(column(match[1]!)>WORKBOOK_LIMITS.columns||column(match[2]!)>WORKBOOK_LIMITS.columns)throw new Error('公式引用超过工作簿行列范围。');
  for(const match of formula.matchAll(/(?:^|[^A-Za-z_\d])\$?([1-9]\d*)\s*:\s*\$?([1-9]\d*)(?![A-Za-z_\d])/g))if(Number(match[1])>WORKBOOK_LIMITS.rows||Number(match[2])>WORKBOOK_LIMITS.rows)throw new Error('公式引用超过工作簿行列范围。');
  if(/(?:https?:|file:|javascript:|data:|\/\/)/i.test(formula))throw new Error('公式不能访问外部地址。');
}
export function blankWorkbook(id:string,name='新工作簿'):IWorkbookData{
  const sheetId=crypto.randomUUID();return {id,name,appVersion:'1.0.4',locale:LocaleType.ZH_CN,styles:{},sheetOrder:[sheetId],sheets:{[sheetId]:{id:sheetId,name:'工作表1',rowCount:1000,columnCount:26,cellData:{},defaultRowHeight:24,defaultColumnWidth:100}}};
}
export function checkWorkbookBounds(snapshot:IWorkbookData){
  if(!snapshot.sheetOrder.length||snapshot.sheetOrder.length>WORKBOOK_LIMITS.sheets)throw new Error('工作表数量须为 1–32。');
  let count=0;
  for(const id of snapshot.sheetOrder){const sheet=snapshot.sheets[id];if(!sheet||!sheet.rowCount||sheet.rowCount>WORKBOOK_LIMITS.rows||!sheet.columnCount||sheet.columnCount>WORKBOOK_LIMITS.columns)throw new Error('每张工作表最多 10000 行、256 列。');
    for(const row of Object.values((sheet.cellData??{}) as Record<string,Record<string,ICellData>>)){for(const cell of Object.values(row)){if(++count>WORKBOOK_LIMITS.cells)throw new Error('工作簿有内容单元格超过 200000 个。');if(cell?.f)checkFormula(cell.f);}}
  }
  if(new TextEncoder().encode(JSON.stringify(snapshot)).length>WORKBOOK_LIMITS.bytes)throw new Error('工作簿快照超过 7 MiB。');
}
