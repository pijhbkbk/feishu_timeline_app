'use client';
import { CommandType, ImageSourceType, ImageUploadStatusType, LifecycleStages, LocaleType, type IWorkbookData } from '@univerjs/core';
import { createUniver, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import CoreZhCN from '@univerjs/preset-sheets-core/locales/zh-CN';
import DrawingZhCN from '@univerjs/preset-sheets-drawing/locales/zh-CN';
import { ImageIoService } from '@univerjs/preset-sheets-drawing';
import { SheetDrawingAnchorType } from '@univerjs/sheets-drawing';
import '@univerjs/sheets-drawing/facade';
import { setNonce } from 'get-nonce';
import { createRecordDrawingPreset } from '../business-sheet/drawing-preset';
import { sheetThumbnails } from '../business-sheet/thumbnail-client';
import { uploadSheetImage, defaultImageLayout } from '../business-sheet/image-client';
import type { ThumbnailLease } from '../business-sheet/thumbnail-cache';
import type { ImageAnchor } from '../business-sheet/xlsx-images';
import { checkFormula, checkWorkbookBounds, WORKBOOK_LIMITS } from './contract';
import '@univerjs/preset-sheets-core/lib/index.css';
import '@univerjs/preset-sheets-drawing/lib/index.css';

export interface WorkbookRuntime {ready:Promise<void>;snapshot():Promise<IWorkbookData>;insertImage(file:File):Promise<void>;insertAsset(sheetId:string,assetId:string,anchor:ImageAnchor):Promise<void>;dispose():void}
class WorkbookImageIo extends ImageIoService {
  private leases=new Map<string,ThumbnailLease>();private pending=0;private operations=new Map<string,string>();
  constructor(private id:string,private changed:(pending:number)=>void){super();}
  override async saveImage(file:File){this.changed(++this.pending);try{const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');const key=`${file.name}:${file.type}:${hash}`;let operationId=this.operations.get(key);if(!operationId){operationId=crypto.randomUUID();this.operations.set(key,operationId);}const asset=await uploadSheetImage(file,'SHEET_WORKBOOK',this.id,defaultImageLayout(),operationId,()=>{});return {imageId:asset.id,source:asset.id,imageSourceType:ImageSourceType.UUID,base64Cache:'',status:ImageUploadStatusType.SUCCUSS};}finally{this.changed(--this.pending);}}
  override getImage(id:string){if(!/^[a-f\d-]{36}$/i.test(id))return Promise.reject(new Error('图片资源标识无效。'));let lease=this.leases.get(id);if(!lease){lease=sheetThumbnails.acquire(id);this.leases.set(id,lease);}return lease.get();}
  dispose(){for(const lease of this.leases.values())lease.release();this.leases.clear();}
}
export function createFreeWorkbook(options:{container:HTMLElement;snapshot:IWorkbookData;onChanged():void;onError(message:string):void;onUploading(count:number):void}):WorkbookRuntime{
  setNonce(document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce??'');
  const io=new WorkbookImageIo(options.snapshot.id,options.onUploading);
  const hidden=['sheet.command.insert-cell-image','sheet.command.set-worksheet-background-image','sheet.command.add-range-protection-from-toolbar','sheet.command.add-range-protection-from-context-menu','sheet.command.add-range-protection-from-sheet-bar','sheet.command.view-sheet-permission-from-context-menu','sheet.command.view-sheet-permission-from-sheet-bar','sidebar.operation.defined-name'];
  const {univer,univerAPI}=createUniver({locale:LocaleType.ZH_CN,locales:{[LocaleType.ZH_CN]:mergeLocales(CoreZhCN,DrawingZhCN)},presets:[UniverSheetsCorePreset({container:options.container,header:true,toolbar:true,ribbonType:'simple',formulaBar:true,footer:{sheetBar:true,statisticBar:true,menus:true,zoomSlider:true},menu:Object.fromEntries(hidden.map(id=>[id,{hidden:true}]))}),createRecordDrawingPreset(io)]});
  let resolveReady!:()=>void;const ready=new Promise<void>(resolve=>{resolveReady=resolve;});let disposed=false;
  const subscriptions=[univerAPI.addEvent(univerAPI.Event.LifeCycleChanged,event=>{if(event.stage>=LifecycleStages.Rendered)resolveReady();})];
  const workbook=univerAPI.createWorkbook(options.snapshot);if(univerAPI.getCurrentLifecycleStage()>=LifecycleStages.Rendered)resolveReady();
  subscriptions.push(univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute,event=>{
    try {
      if(/(?:hyperlink|defined-name|protection|background-image|insert-cell-image|range-theme)/.test(event.id))throw new Error('此功能不在工作簿支持范围内。');
      const params=(event.params??{}) as Record<string,unknown>;
      if(event.type===CommandType.MUTATION&&/insert-(row|col)|set-row-count|set-column-count/.test(event.id)){
        const sheet=workbook.getActiveSheet();const range=params.range as {startRow?:number;endRow?:number;startColumn?:number;endColumn?:number}|undefined;
        const rows=Number(range?.endRow??range?.startRow??0)-Number(range?.startRow??0)+1,columns=Number(range?.endColumn??range?.startColumn??0)-Number(range?.startColumn??0)+1;
        if(event.id.includes('row')&&sheet.getMaxRows()+rows>WORKBOOK_LIMITS.rows||event.id.includes('col')&&sheet.getMaxColumns()+columns>WORKBOOK_LIMITS.columns)throw new Error('每张工作表最多 10000 行、256 列。');
      }
      if(/insert-sheet|copy-worksheet/.test(event.id)&&workbook.getSheets().length>=WORKBOOK_LIMITS.sheets)throw new Error('最多 32 张工作表。');
      if(event.id==='sheet.mutation.set-range-values'){
        const values=params.cellValue;if(values&&typeof values==='object')for(const row of Object.values(values))if(row&&typeof row==='object')for(const raw of Object.values(row)){const cell=raw as {f?:unknown}|null;if(typeof cell?.f==='string'&&cell.f)checkFormula(cell.f);}
      }
    }catch(cause){event.cancel=true;options.onError(cause instanceof Error?cause.message:'此操作不受支持。');}
  }));
  subscriptions.push(univerAPI.addEvent(univerAPI.Event.BeforeOverGridImageInsert,event=>{if(event.insertImageParams.some(image=>image.imageSourceType!==ImageSourceType.UUID||!/^[a-f\d-]{36}$/i.test(image.source))){event.cancel=true;options.onError('图片必须通过本系统上传并扫描。');}}));
  subscriptions.push(univerAPI.addEvent(univerAPI.Event.BeforeOverGridImageChange,event=>{if(event.images.some(({changeParam})=>changeParam.source!==undefined&&!/^[a-f\d-]{36}$/i.test(changeParam.source)||changeParam.imageSourceType!==undefined&&changeParam.imageSourceType!==ImageSourceType.UUID)){event.cancel=true;options.onError('不能改为外部图片地址。');}}));
  subscriptions.push(univerAPI.addEvent(univerAPI.Event.CommandExecuted,event=>{if(!disposed&&event.type===CommandType.MUTATION)options.onChanged();}));
  const insertAsset=async(sheetId:string,assetId:string,anchor:ImageAnchor)=>{
    await ready;const sheet=workbook.getSheetBySheetId(sheetId);if(!sheet)throw new Error('图片工作表不存在。');await io.getImage(assetId);
    const builder=sheet.newOverGridImage().setSource(assetId,ImageSourceType.UUID);
    if(anchor.to&&anchor.kind==='twoCell')builder.setPlacement({kind:SheetDrawingAnchorType.Both,from:anchor.from,to:anchor.to});
    else if(anchor.to){
      const x=(col:number)=>{let n=0;for(let i=0;i<col;i++)n+=sheet.getColumnWidth(i);return n;},y=(row:number)=>{let n=0;for(let i=0;i<row;i++)n+=sheet.getRowHeight(i);return n;};
      const left=x(anchor.from.column)+anchor.from.columnOffset,top=y(anchor.from.row)+anchor.from.rowOffset,width=x(anchor.to.column)+anchor.to.columnOffset-left,height=y(anchor.to.row)+anchor.to.rowOffset-top;
      builder.setPlacement(anchor.kind==='absolute'?{kind:SheetDrawingAnchorType.None,left,top,width,height}:{kind:SheetDrawingAnchorType.Position,from:anchor.from,width,height});
    }else if(anchor.kind==='absolute')builder.setPlacement({kind:SheetDrawingAnchorType.None,left:anchor.from.columnOffset,top:anchor.from.rowOffset,width:anchor.width!,height:anchor.height!});
    else builder.setPlacement({kind:SheetDrawingAnchorType.Position,from:anchor.from,width:anchor.width!,height:anchor.height!});
    if(!sheet.insertImages([await builder.buildAsync()]))throw new Error('图片插入失败，已上传资源仍保留。');
  };
  return {ready,snapshot:async()=>{await ready;if(workbook.isCellEditing())await workbook.endEditingAsync(true);await univerAPI.getFormula().onCalculationResultApplied(10000);const data=workbook.save();checkWorkbookBounds(data);return data;},insertAsset,
    insertImage:async file=>{const image=await io.saveImage(file);const sheet=workbook.getActiveSheet(),cell=sheet.getActiveCell();await insertAsset(sheet.getSheetId(),image.source,{kind:'oneCell',from:{row:cell?.getRow()??0,column:cell?.getColumn()??0,rowOffset:4,columnOffset:4},width:160,height:100});},
    dispose:()=>{disposed=true;resolveReady();subscriptions.forEach(s=>s.dispose());io.dispose();univer.dispose();}};
}
