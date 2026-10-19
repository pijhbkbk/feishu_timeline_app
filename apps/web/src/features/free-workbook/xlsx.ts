import ExcelJS from 'exceljs';
import { CellValueType, DateSystem, LocaleType, type ICellData, type IStyleData, type IWorkbookData } from '@univerjs/core';
import { getSheetDrawingPlacement, SheetDrawingAnchorType, type ISheetDrawing } from '@univerjs/sheets-drawing';
import { XMLParser } from 'fast-xml-parser';
import { strFromU8, zipSync } from 'fflate';
import { inspectCatalogArchive } from '../color-register/sheet-exchange';
import { readRawEmbeddedImages } from '../business-sheet/xlsx-raw-images';
import { writeEmbeddedImages, type EmbeddedImage, type ImageAnchor, type ImageExportItem } from '../business-sheet/xlsx-images';
import { imageBytes, type SheetImage } from '../business-sheet/image-client';
import { checkFormula, checkWorkbookBounds, WORKBOOK_LIMITS } from './contract';

export interface WorkbookImport {snapshot:IWorkbookData;images:EmbeddedImage[];warnings:string[];fileName:string}
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const BORDER=['','thin','hair','dotted','dashed','dashDot','dashDotDot','double','medium','mediumDashed','mediumDashDot','mediumDashDotDot','slantDashDot','thick'];
const horizontal=['','left','center','right','justify','justify','distributed'];
const vertical=['','top','middle','bottom'];
const indexed=['000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF','000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF','800000','008000','000080','808000','800080','008080','C0C0C0','808080'];
function themes(files:Record<string,Uint8Array>):string[]{
  const file=files['xl/theme/theme1.xml'];if(!file)return ['FFFFFF','000000','EEECE1','1F497D','4F81BD','C0504D','9BBB59','8064A2','4BACC6','F79646','0000FF','800080'];
  const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',removeNSPrefix:true,processEntities:false});
  const scheme=obj(obj(obj(obj(parser.parse(strFromU8(file))).theme).themeElements).clrScheme);
  return ['lt1','dk1','lt2','dk2','accent1','accent2','accent3','accent4','accent5','accent6','hlink','folHlink'].map(key=>{const node=obj(scheme[key]);return String(obj(node.srgbClr).val??obj(node.sysClr).lastClr??'000000');});
}
function color(raw:(Partial<ExcelJS.Color>&{indexed?:number})|undefined,palette:string[]):string|undefined{
  if(!raw)return undefined;let value=raw.argb?.slice(-6)??(raw.theme===undefined?undefined:palette[raw.theme])??(raw.indexed===undefined?undefined:indexed[raw.indexed]);if(!value){if(raw.indexed===64)return '#000000';return undefined;}
  if(!/^[\da-f]{6}$/i.test(value))return undefined;
  const tint=(raw as Partial<ExcelJS.Color>&{tint?:number}).tint??0;if(tint)value=[0,2,4].map(i=>{const component=parseInt(value!.slice(i,i+2),16);return Math.round(tint<0?component*(1+tint):component+(255-component)*tint).toString(16).padStart(2,'0');}).join('');return `#${value}`;
}
function readStyle(style:Partial<ExcelJS.Style>,palette:string[]):IStyleData{
  const font=style.font??{},align=style.alignment??{},result:Record<string,unknown>={};
  if(font.name)result.ff=font.name;if(font.size)result.fs=font.size;if(font.bold!==undefined)result.bl=font.bold?1:0;if(font.italic!==undefined)result.it=font.italic?1:0;
  const fg=color(font.color,palette);if(fg)result.cl={rgb:fg};if(font.underline)result.ul={s:1,t:font.underline==='double'||font.underline==='doubleAccounting'?10:12};if(font.strike)result.st={s:1};if(font.vertAlign)result.va=font.vertAlign==='superscript'?3:font.vertAlign==='subscript'?2:1;
  if(style.fill?.type==='pattern'&&style.fill.pattern==='solid'){const bg=color(style.fill.fgColor,palette);if(bg)result.bg={rgb:bg};}
  if(style.numFmt)result.n={pattern:style.numFmt};if(align.horizontal)result.ht=horizontal.indexOf(align.horizontal);if(align.vertical)result.vt=vertical.indexOf(align.vertical);if(align.wrapText)result.tb=3;if(align.shrinkToFit)result.stf=1;
  if(align.textRotation!==undefined)result.tr=align.textRotation==='vertical'?{v:1}:{a:align.textRotation};
  const bd:Record<string,unknown>={};for(const [side,key] of [['top','t'],['bottom','b'],['left','l'],['right','r']] as const){const border=style.border?.[side];if(border?.style)bd[key]={s:BORDER.indexOf(border.style),cl:{rgb:color(border.color,palette)??'#000000'}};}if(Object.keys(bd).length)result.bd=bd;
  return result as IStyleData;
}
function serialDate(date:Date,date1904:boolean){return date.getTime()/86400000+(date1904?24107:25569);}
function readCell(cell:ExcelJS.Cell,palette:string[],date1904:boolean):ICellData{
  const result:ICellData={s:readStyle(cell.style,palette)},value=cell.value;
  if(value===null||value===undefined)return result;
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean'){result.v=value;result.t=typeof value==='string'?CellValueType.STRING:typeof value==='number'?CellValueType.NUMBER:CellValueType.BOOLEAN;return result;}
  if(value instanceof Date){result.v=serialDate(value,date1904);result.t=CellValueType.NUMBER;return result;}
  if('formula'in value||'sharedFormula'in value){const formula=`=${cell.formula}`;checkFormula(formula);result.f=formula;const cached=cell.result;if(typeof cached==='string'||typeof cached==='number'||typeof cached==='boolean')result.v=cached;else if(cached&&typeof cached==='object'&&'error'in cached)result.v=String(cached.error);return result;}
  if('richText'in value){let text='';const runs=value.richText.map(run=>{const st=text.length;text+=run.text;return {st,ed:text.length,ts:readStyle({font:run.font??{}},palette)};});result.v=text;result.t=CellValueType.STRING;result.p={id:crypto.randomUUID(),body:{dataStream:`${text}\r\n`,textRuns:runs,paragraphs:[{startIndex:text.length,paragraphId:crypto.randomUUID()}]},documentStyle:{}};return result;}
  if('error'in value){result.v=value.error;result.t=CellValueType.STRING;return result;}
  throw new Error('工作簿包含超链接或不支持的单元格内容；源文件未修改。');
}
function coordinates(address:string){const m=/^([A-Z]+)([1-9]\d*)$/.exec(address);if(!m)throw new Error('工作表坐标无效。');const column=[...m[1]!].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1,row=Number(m[2])-1;if(row>=WORKBOOK_LIMITS.rows||column>=WORKBOOK_LIMITS.columns)throw new Error('工作表超过 10000 行、256 列。');return {row,column};}
// Run before ExcelJS, whose sparse-column model otherwise allocates up to col.max.
function preflightXml(files:Record<string,Uint8Array>){
  const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',removeNSPrefix:true,processEntities:false,parseTagValue:false,parseAttributeValue:false});
  const array=(value:unknown):unknown[]=>value===undefined?[]:Array.isArray(value)?value:[value];
  const bounded=(value:unknown,min:number,max:number)=>{if(typeof value!=='string'||!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)throw new Error('XLSX 行列或样式索引超限。');return Number(value);};
  let styles=1,cells=0;
  if(files['xl/styles.xml']){const root=obj(obj(parser.parse(strFromU8(files['xl/styles.xml']))).styleSheet);for(const [list,child] of [['cellXfs','xf'],['cellStyleXfs','xf'],['fonts','font'],['fills','fill'],['borders','border'],['numFmts','numFmt']] as const){const entries=array(obj(root[list])[child]);if(entries.length>50000)throw new Error('XLSX 样式数量超限。');if(list==='cellXfs')styles=Math.max(1,entries.length);for(const entry of entries)for(const key of ['fontId','fillId','borderId','xfId','numFmtId'])if(obj(entry)[key]!==undefined)bounded(obj(entry)[key],0,65535);}}
  for(const [path,bytes] of Object.entries(files)){if(!/^xl\/worksheets\/[^/]+\.xml$/.test(path))continue;const root=obj(obj(parser.parse(strFromU8(bytes))).worksheet);
    for(const value of array(obj(root.cols).col)){const col=obj(value),min=bounded(col.min,1,WORKBOOK_LIMITS.columns);bounded(col.max,min,WORKBOOK_LIMITS.columns);if(col.style!==undefined)bounded(col.style,0,styles-1);}
    for(const value of array(obj(root.sheetData).row)){const row=obj(value);bounded(row.r,1,WORKBOOK_LIMITS.rows);if(row.s!==undefined)bounded(row.s,0,styles-1);for(const value of array(row.c)){if(++cells>WORKBOOK_LIMITS.cells)throw new Error('XLSX 单元格超过 200000 个。');const cell=obj(value);if(typeof cell.r!=='string')throw new Error('XLSX 单元格缺少坐标。');coordinates(cell.r);if(cell.s!==undefined)bounded(cell.s,0,styles-1);if(cell.f!==undefined){const kind=obj(cell.f).t;if(kind!==undefined&&kind!=='normal'&&kind!=='shared')throw new Error('暂不支持数组、数据表或未知公式类型；源文件未修改。');const formula=typeof cell.f==='string'?cell.f:obj(cell.f)['#text'];if(typeof formula==='string'&&formula)checkFormula(`=${formula}`);const ref=obj(cell.f).ref;if(ref!==undefined){if(typeof ref!=='string')throw new Error('公式范围无效。');for(const address of ref.split(':'))coordinates(address);}}}}
  }
}
export async function readFreeWorkbook(bytes:Uint8Array,fileName:string,id:string):Promise<WorkbookImport>{
  const files=inspectCatalogArchive(bytes),warnings=new Set<string>();preflightXml(files);let sheetCount=0;
  for(const [path,content] of Object.entries(files)){
    if(/vbaProject|activeX|externalLinks|embeddings/i.test(path))throw new Error('不支持宏、嵌入对象或外部工作簿连接；源文件未修改。');
    if(/xl\/(?:charts|pivot|tables|comments|threadedComments|slicer)/i.test(path))warnings.add('图表、数据透视表、表格筛选、批注和切片器不进入编辑副本；请保留原文件。');
    if(!/\.xml$|\.rels$/i.test(path))continue;const xml=strFromU8(content);
    if(path==='xl/styles.xml'&&(/<(?:[\w.-]+:)?gradientFill\b|patternType=["'](?!solid["']|none["']|gray125["'])|<(?:[\w.-]+:)?(?:outline|shadow|condense|extend)\b|<alignment\b[^>]*\bindent=/.test(xml)))warnings.add('渐变或图案填充、特殊字体效果与缩进不进入编辑副本；请保留原文件。');
    if(/TargetMode\s*=\s*["']External["']/i.test(xml))throw new Error('文件包含外部链接；请在源文件中移除或另存无外链副本。');
    if(/^xl\/worksheets\/[^/]+\.xml$/.test(path)){
      if(++sheetCount>WORKBOOK_LIMITS.sheets)throw new Error('最多 32 张工作表。');
      if(/<(?:[\w.-]+:)?(?:conditionalFormatting|dataValidations|autoFilter|sheetProtection|extLst)\b/.test(xml))warnings.add('条件格式、数据验证、自动筛选或保护不进入编辑副本；原文件保持不变。');
      for(const m of xml.matchAll(/<(?:[\w.-]+:)?(?:c|dimension|mergeCell)\b[^>]*\b(?:r|ref)\s*=\s*["']([^"']+)["']/g))for(const address of m[1]!.split(':'))coordinates(address);
      for(const m of xml.matchAll(/<(?:[\w.-]+:)?row\b[^>]*\br\s*=\s*["'](\d+)["']/g))if(Number(m[1])>WORKBOOK_LIMITS.rows)throw new Error('工作表行号超限。');
    }
  }
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(zipSync(files,{level:0}) as never);if(!workbook.worksheets.length)throw new Error('工作簿没有可读取的工作表。');
  if(workbook.definedNames.model.length)throw new Error('暂不支持命名区域；请在源文件副本中将命名引用改成明确坐标后导入。原文件未修改。');
  const palette=themes(files),date1904=Boolean(workbook.properties.date1904),snapshot:IWorkbookData={id,name:fileName.replace(/\.xlsx$/i,'').slice(0,200)||'导入工作簿',appVersion:'1.0.4',locale:LocaleType.ZH_CN,dateSystem:date1904?DateSystem.Date1904:DateSystem.Date1900,styles:{},sheetOrder:[],sheets:{}};
  for(const source of workbook.worksheets){
    const sheetId=String(source.id),cellData:Record<number,Record<number,ICellData>>={},rowData:Record<number,Record<string,unknown>>={},columnData:Record<number,Record<string,unknown>>={};
    // findRow/findCell inspect existing sparse objects without creating gaps.
    // model.cells also retains styled null cells, unlike eachCell(includeEmpty:false).
    for(let r=1;r<=source.rowCount;r++){
      const row=source.findRow(r);if(!row)continue;if(r>WORKBOOK_LIMITS.rows)throw new Error('行号超限。');
      const rowStyle=readStyle((row as unknown as {style:Partial<ExcelJS.Style>}).style??{},palette);
      if(row.height||row.hidden||Object.keys(rowStyle).length)rowData[r-1]={...(row.height?{h:row.height*4/3}:{}),...(row.hidden?{hd:1}:{}),...(Object.keys(rowStyle).length?{s:rowStyle}:{})};
      for(const model of row.model?.cells??[]){const c=coordinates(String(model.address)).column+1,cell=row.findCell(c);if(!cell)continue;
        if((cell.value===null||cell.value===undefined)&&!Object.keys(cell.style).length)continue;if(cell.type===ExcelJS.ValueType.Merge)continue;
        cellData[r-1]??={};cellData[r-1]![c-1]=readCell(cell,palette,date1904);
      }
    }
    for(let c=1;c<=Math.max(source.columnCount,source.columns.length);c++){const col=source.getColumn(c);columnData[c-1]={...(col.width?{w:Math.round(col.width*7+5)}:{}),...(col.hidden?{hd:1}:{}),s:readStyle(col.style,palette)};}
    const mergeData=(source.model.merges??[]).map(range=>{const [start,end]=range.split(':').map(coordinates);return {startRow:start!.row,startColumn:start!.column,endRow:end!.row,endColumn:end!.column};});
    const view=(source.views??[]).find(v=>v.state==='frozen') as Partial<ExcelJS.WorksheetViewFrozen>|undefined;
    snapshot.sheetOrder.push(sheetId);snapshot.sheets[sheetId]={id:sheetId,name:source.name,hidden:source.state==='veryHidden'?2:source.state==='hidden'?1:0,rowCount:Math.min(WORKBOOK_LIMITS.rows,Math.max(200,source.rowCount+30)),columnCount:Math.min(WORKBOOK_LIMITS.columns,Math.max(26,source.columnCount+4)),defaultRowHeight:(source.properties.defaultRowHeight??15)*4/3,defaultColumnWidth:(source.properties.defaultColWidth??8.43)*7+5,cellData,rowData,columnData,mergeData,...(view?{freeze:{xSplit:view.xSplit??0,ySplit:view.ySplit??0,startRow:view.ySplit??0,startColumn:view.xSplit??0}}:{})};
  }
  const inventory=readRawEmbeddedImages(files,workbook,{archiveInspected:true,rowTargets:()=>new Map()});
  const unsupported=inventory.issues.filter(issue=>!/IMAGE_COUNT_MISMATCH/.test(issue.code));
  if(unsupported.length||inventory.inventory.unrepresentedPictureCount)throw new Error(`图片存在不支持内容：${unsupported[0]?.message??'部分图片无法识别'}；未创建编辑副本。`);
  if(inventory.images.length>WORKBOOK_LIMITS.images)throw new Error('每个工作簿最多 50 张图片。');
  for(const image of inventory.images)if(!image.anchor||image.status==='error'||image.issues.some(issue=>/UNSUPPORTED|INVALID|ANCHOR_UNRESOLVED/.test(issue.code)))throw new Error('图片锚点或外观不能完整转换；请保留源文件并先转换图片。');
  checkWorkbookBounds(snapshot);return {snapshot,images:inventory.images,warnings:[...warnings],fileName};
}
function excelColor(value:unknown):Partial<ExcelJS.Color>|undefined{const rgb=obj(value).rgb;if(typeof rgb!=='string')return undefined;const normalized=rgb.replace(/^#/,'');return /^[\da-f]{6}$/i.test(normalized)?{argb:`FF${normalized.toUpperCase()}`}:undefined;}
function styleData(value:unknown,snapshot:IWorkbookData):IStyleData{return (typeof value==='string'?snapshot.styles[value]:value) as IStyleData??{};}
function writeStyle(raw:IStyleData):Partial<ExcelJS.Style>{
  const s=raw as Record<string,unknown>,style:Partial<ExcelJS.Style>={},font:Partial<ExcelJS.Font>={};
  if(typeof s.ff==='string')font.name=s.ff;if(typeof s.fs==='number')font.size=s.fs;if(s.bl!==undefined)font.bold=s.bl===1;if(s.it!==undefined)font.italic=s.it===1;
  const fg=excelColor(s.cl);if(fg)font.color=fg;if(obj(s.ul).s)font.underline=obj(s.ul).t===10?'double':true;if(obj(s.st).s)font.strike=true;if(s.va===2)font.vertAlign='subscript';if(s.va===3)font.vertAlign='superscript';style.font=font;
  const bg=excelColor(s.bg);if(bg)style.fill={type:'pattern',pattern:'solid',fgColor:bg};
  const alignment:Partial<ExcelJS.Alignment>={};if(typeof s.ht==='number'&&horizontal[s.ht])alignment.horizontal=horizontal[s.ht] as ExcelJS.Alignment['horizontal'];if(typeof s.vt==='number'&&vertical[s.vt])alignment.vertical=vertical[s.vt] as ExcelJS.Alignment['vertical'];if(s.tb===3)alignment.wrapText=true;if(s.stf===1)alignment.shrinkToFit=true;
  const rotation=obj(s.tr);if(rotation.v)alignment.textRotation='vertical';else if(typeof rotation.a==='number')alignment.textRotation=rotation.a;style.alignment=alignment;
  const border:Partial<ExcelJS.Borders>={};for(const [key,side] of [['t','top'],['b','bottom'],['l','left'],['r','right']] as const){const b=obj(obj(s.bd)[key]),name=BORDER[Number(b.s)];if(name)border[side]={style:name as ExcelJS.BorderStyle,...(excelColor(b.cl)?{color:excelColor(b.cl)!}:{})};}style.border=border;
  const pattern=obj(s.n).pattern;if(typeof pattern==='string')style.numFmt=pattern;return style;
}
export async function writeFreeWorkbook(snapshot:IWorkbookData,assets:readonly SheetImage[]):Promise<Uint8Array>{
  checkWorkbookBounds(snapshot);const workbook=new ExcelJS.Workbook();workbook.creator='轻卡定制色';workbook.properties.date1904=snapshot.dateSystem===DateSystem.Date1904;workbook.calcProperties.fullCalcOnLoad=true;
  const sheets=new Map<string,number>();
  for(const id of snapshot.sheetOrder){const source=snapshot.sheets[id]!,sheet=workbook.addWorksheet(source.name??'工作表');sheets.set(id,sheet.id);sheet.state=source.hidden===2?'veryHidden':source.hidden?'hidden':'visible';sheet.properties.defaultRowHeight=(source.defaultRowHeight??20)*3/4;sheet.properties.defaultColWidth=((source.defaultColumnWidth??64)-5)/7;
    for(const [r,row] of Object.entries(source.rowData??{})){const target=sheet.getRow(Number(r)+1);if(row.h!==undefined)target.height=row.h*3/4;else if(row.hd===1||row.s)target.height=(source.defaultRowHeight??20)*3/4;target.hidden=row.hd===1;if(row.s)Object.assign(target,writeStyle(styleData(row.s,snapshot)));}
    for(const [c,col] of Object.entries(source.columnData??{})){const target=sheet.getColumn(Number(c)+1);if(col.w!==undefined)target.width=(col.w-5)/7;target.hidden=col.hd===1;if(col.s)target.style=writeStyle(styleData(col.s,snapshot));}
    for(const [r,row] of Object.entries((source.cellData??{}) as Record<string,Record<string,ICellData>>))for(const [c,cell] of Object.entries(row)){if(!cell)continue;const target=sheet.getCell(Number(r)+1,Number(c)+1);target.style=writeStyle(styleData(cell.s,snapshot));
      if(cell.f){checkFormula(cell.f);target.value={formula:cell.f.slice(1),...(cell.v===null||cell.v===undefined?{}:{result:cell.v})} as ExcelJS.CellFormulaValue;}
      else if(cell.p?.body){const body=cell.p.body,text=body.dataStream.replace(/\r\n$/,'');const runs=body.textRuns??[];if(runs.length){let start=0;const rich:ExcelJS.RichText[]=[];for(const run of runs){if(run.st>start)rich.push({text:text.slice(start,run.st)});if(run.st<text.length)rich.push({text:text.slice(run.st,Math.min(run.ed,text.length)),font:writeStyle(run.ts??{}).font??{}});start=Math.max(start,run.ed);}if(start<text.length)rich.push({text:text.slice(start)});target.value={richText:rich};}else target.value=text;}
      else target.value=cell.v??null;
    }
    for(const range of source.mergeData??[])sheet.mergeCells(range.startRow+1,range.startColumn+1,range.endRow+1,range.endColumn+1);
    if(source.freeze&&(source.freeze.xSplit||source.freeze.ySplit))sheet.views=[{state:'frozen',xSplit:source.freeze.xSplit,ySplit:source.freeze.ySplit}];
  }
  const images:ImageExportItem[]=[];const cached=new Map<string,Awaited<ReturnType<typeof imageBytes>>>();
  const resource=snapshot.resources?.find(item=>item.name==='SHEET_DRAWING_PLUGIN');
  if(resource?.data){const content=JSON.parse(resource.data) as Record<string,{data:Record<string,ISheetDrawing>;order:string[]}>;
    for(const [sheetId,set] of Object.entries(content))for(const drawingId of set.order){const drawing=set.data[drawingId]!;if(!('source'in drawing)||drawing.imageSourceType!=='UUID')throw new Error('图片资源不是可导出的本地资产。');const asset=assets.find(a=>a.id===drawing.source);if(!asset)throw new Error('图片原件不在当前授权工作簿中。');let binary=cached.get(asset.id);if(!binary){binary=await imageBytes(asset);cached.set(asset.id,binary);}if(binary.mime!=='image/png'&&binary.mime!=='image/jpeg')throw new Error('图片原件格式无效。');
      const p=getSheetDrawingPlacement(drawing);let anchor:ImageAnchor;if(p.kind===SheetDrawingAnchorType.Both)anchor={kind:'twoCell',from:p.from,to:p.to};else if(p.kind===SheetDrawingAnchorType.Position)anchor={kind:'oneCell',from:p.from,width:p.width,height:p.height};else anchor={kind:'absolute',from:{row:0,column:0,rowOffset:p.top,columnOffset:p.left},width:p.width,height:p.height};images.push({assetKey:asset.id,bytes:binary.bytes,mime:binary.mime,sheetId:sheets.get(sheetId)!,anchor});
    }
  }
  writeEmbeddedImages(workbook,images);const bytes=new Uint8Array(await workbook.xlsx.writeBuffer());inspectCatalogArchive(bytes);return bytes;
}
