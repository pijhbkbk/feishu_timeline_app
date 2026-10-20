'use client';
import { Tools, DOCS_NORMAL_EDITOR_UNIT_ID_KEY, DOCS_FORMULA_BAR_EDITOR_UNIT_ID_KEY, CommandType, ImageSourceType, LifecycleStages, LocaleType, type IWorkbookData, type IDrawingParam } from '@univerjs/core';
import { createUniver, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset, IEditorBridgeService, IEditorService, IRenderManagerService, DocIMEInputManagerService, ReplaceSnapshotCommand, type Spreadsheet } from '@univerjs/preset-sheets-core';
import CoreZhCN from '@univerjs/preset-sheets-core/locales/zh-CN';
import { UniverSheetsFilterPreset } from '@univerjs/preset-sheets-filter';
import FilterZhCN from '@univerjs/preset-sheets-filter/locales/zh-CN';
import { UniverSheetsSortPreset } from '@univerjs/preset-sheets-sort';
import SortZhCN from '@univerjs/preset-sheets-sort/locales/zh-CN';
import DrawingZhCN from '@univerjs/preset-sheets-drawing/locales/zh-CN';
import { IDrawingManagerService } from '@univerjs/preset-sheets-drawing';
import { WorkbookImageIo } from './image-io';
import { createBackgroundRetry } from './background-retry';
import { committedSnapshot } from './committed-snapshot';
import { SheetDrawingAnchorType } from '@univerjs/sheets-drawing';
import '@univerjs/sheets-drawing/facade';
import { setNonce } from 'get-nonce';
import { createRecordDrawingPreset } from '../business-sheet/drawing-preset';
import type { ImageAnchor } from '../business-sheet/xlsx-images';
import { checkFormula, checkWorkbookBounds, WORKBOOK_LIMITS } from './contract';
import { validateEditingDraft, type WorkbookEditingDraft } from './editing-draft';
import { changesWorkbook } from './change-tracking';
import '@univerjs/preset-sheets-core/lib/index.css';
import '@univerjs/preset-sheets-drawing/lib/index.css';
import '@univerjs/preset-sheets-filter/lib/index.css';
import '@univerjs/preset-sheets-sort/lib/index.css';

export interface WorkbookRuntime {ready:Promise<void>;retryImages():Promise<number>;snapshot():Promise<IWorkbookData>;draftSnapshot():Promise<{snapshot:IWorkbookData;edit:WorkbookEditingDraft|null}|null>;restoreEdit(edit:WorkbookEditingDraft):Promise<void>;insertImage(file:File):Promise<void>;insertAsset(sheetId:string,assetId:string,anchor:ImageAnchor):Promise<void>;setBackgroundAsset(sheetId:string,assetId:string,scale:{scaleX:number;scaleY:number}):Promise<void>;dispose():void}
export function createFreeWorkbook(options:{container:HTMLElement;snapshot:IWorkbookData;onChanged():void;onError(message:string):void;onUploading(count:number):void;onImageFailures(count:number):void}):WorkbookRuntime{
  setNonce(document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce??'');
  const io=new WorkbookImageIo(options.snapshot.id,options.onUploading,Object.values(options.snapshot.sheets).flatMap(sheet=>sheet.backgroundImage?[sheet.backgroundImage.source]:[]),options.onImageFailures);
  const hidden=['sheet.command.insert-cell-image','sheet.command.set-worksheet-background-image','sheet.command.add-range-protection-from-toolbar','sheet.command.add-range-protection-from-context-menu','sheet.command.add-range-protection-from-sheet-bar','sheet.command.view-sheet-permission-from-context-menu','sheet.command.view-sheet-permission-from-sheet-bar','sidebar.operation.defined-name'];
  const {univer,univerAPI}=createUniver({locale:LocaleType.ZH_CN,locales:{[LocaleType.ZH_CN]:mergeLocales(CoreZhCN,DrawingZhCN,FilterZhCN,SortZhCN)},presets:[UniverSheetsCorePreset({container:options.container,header:true,toolbar:true,ribbonType:'simple',formulaBar:true,footer:{sheetBar:true,statisticBar:true,menus:true,zoomSlider:true},menu:Object.fromEntries(hidden.map(id=>[id,{hidden:true}]))}),createRecordDrawingPreset(io),UniverSheetsFilterPreset(),UniverSheetsSortPreset()]});
  let resolveReady!:()=>void;const ready=new Promise<void>(resolve=>{resolveReady=resolve;});let disposed=false,composing=false;
  const compositionStart=()=>{composing=true;},compositionEnd=()=>{composing=false;if(!disposed)options.onChanged();};
  options.container.addEventListener('compositionstart',compositionStart,true);options.container.addEventListener('compositionend',compositionEnd,true);
  const subscriptions=[univerAPI.addEvent(univerAPI.Event.LifeCycleChanged,event=>{if(event.stage>=LifecycleStages.Rendered)resolveReady();})];
  // Univer owns a mutable model; persisted request/draft snapshots remain immutable.
  const workbook=univerAPI.createWorkbook(structuredClone(options.snapshot));if(univerAPI.getCurrentLifecycleStage()>=LifecycleStages.Rendered)resolveReady();
  // Univer 1.0.4 adapter. The live document is distinct from the sheet cell
  // until Enter; reading it must never call endEditingAsync or parse the text.
  const injector=univer.__getInjector(),bridge=injector.get(IEditorBridgeService),editors=injector.get(IEditorService),renders=injector.get(IRenderManagerService);
  const editorIds=[DOCS_NORMAL_EDITOR_UNIT_ID_KEY,DOCS_FORMULA_BAR_EDITOR_UNIT_ID_KEY];
  const imeActive=()=>composing||editorIds.some(id=>Boolean(renders.getRenderUnitById(id)?.with(DocIMEInputManagerService).getActiveRange()));
  const readEdit=(snapshot:IWorkbookData):WorkbookEditingDraft|null=>{
    if(!workbook.isCellEditing())return null;
    const location=bridge.getEditLocation(),editor=editors.getEditor(DOCS_NORMAL_EDITOR_UNIT_ID_KEY);
    if(!location||location.unitId!==workbook.getId()||!editor)throw new Error('单元格编辑内容尚不可读取，请保持页面打开。');
    const edit={sheetId:location.sheetId,row:location.row,column:location.column,document:structuredClone(editor.getDocumentData())};validateEditingDraft(edit,snapshot);return edit;
  };
  const restoreEdit=async(edit:WorkbookEditingDraft)=>{
    await ready;validateEditingDraft(edit,options.snapshot);if(disposed)throw new Error('编辑器已关闭。');
    const sheet=workbook.getSheetBySheetId(edit.sheetId)!;workbook.setActiveSheet(sheet);workbook.setActiveRange(sheet.getRange(edit.row,edit.column));
    if(!workbook.startEditing())throw new Error('未确认输入尚未恢复，原草稿保留。');
    const position=bridge.getEditLocation();if(position?.sheetId!==edit.sheetId||position.row!==edit.row||position.column!==edit.column)throw new Error('编辑器位置不符，未恢复输入。');
    for(const id of editorIds){const editor=editors.getEditor(id);if(!editor)throw new Error('输入编辑器未就绪，原草稿保留。');
      const doc={...structuredClone(edit.document),id};
      if(!univerAPI.syncExecuteCommand(ReplaceSnapshotCommand.id,{unitId:id,snapshot:doc,textRanges:null}))throw new Error('未确认输入恢复失败，原草稿保留。');
      if(!Tools.diffValue(editor.getDocumentData().body,doc.body))throw new Error('未确认输入读回不一致，原草稿保留。');
    }
    bridge.changeEditorDirty(true);
    const end=Math.max(0,edit.document.body!.dataStream.length-2);editors.getEditor(DOCS_NORMAL_EDITOR_UNIT_ID_KEY)!.setSelectionRanges([{startOffset:end,endOffset:end}],false);
  };
  subscriptions.push(univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute,event=>{
    try {
      if(/(?:hyperlink|defined-name|protection|insert-cell-image|range-theme)/.test(event.id))throw new Error('此功能不在工作簿支持范围内。');
      const params=(event.params??{}) as Record<string,unknown>;
      if(/background-image/.test(event.id)&&params.backgroundImage){const bg=params.backgroundImage as {source?:string;imageSourceType?:string;scaleX?:number;scaleY?:number};if(bg.imageSourceType!=='UUID'||typeof bg.source!=='string'||!(/^[a-f\d-]{36}$/i.test(bg.source))||[bg.scaleX??1,bg.scaleY??1].some(value=>!Number.isFinite(value)||value<0.01||value>100))throw new Error('背景图片必须通过本系统上传并扫描。');io.markBackground(bg.source);}
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
  subscriptions.push(univerAPI.addEvent(univerAPI.Event.CommandExecuted,event=>{if(!disposed&&changesWorkbook(event))options.onChanged();}));
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
  let resetBackgroundView:(()=>void)|undefined;
  const retryImages=async()=>{
    const result=await io.retryFailures();if(disposed)return result.remaining;
    const render=renders.getRenderUnitById(workbook.getId()),main=render?.mainComponent as Spreadsheet|undefined;
    if(result.backgrounds&&main){
      // The pinned 1.0.4 background extension caches failed decoded images and
      // exposes no eviction method. Recreate only that view extension; the
      // workbook, pending cell edit, selection, and undo stack stay in place.
      resetBackgroundView??=createBackgroundRetry(main.extensions,main,injector,()=>{main.makeForceDirty(true);render?.scene.makeDirty();},()=>disposed);
      resetBackgroundView();
    }
    const recovered=new Set(result.recovered),manager=injector.get(IDrawingManagerService);
    for(const sheet of workbook.getSheets()){const drawings=sheet.getImages().filter(image=>recovered.has(image.toBuilder().getSource())).map(image=>manager.getDrawingByParam({unitId:workbook.getId(),subUnitId:sheet.getSheetId(),drawingId:image.getId()})).filter((drawing):drawing is IDrawingParam=>Boolean(drawing));manager.refreshTransform(drawings);}
    main?.makeForceDirty(true);render?.scene.makeDirty();return result.remaining;
  };
  const setBackgroundAsset=async(sheetId:string,assetId:string,scale:{scaleX:number;scaleY:number})=>{await ready;if(!workbook.getSheetBySheetId(sheetId))throw new Error('背景工作表不存在。');io.markBackground(assetId);await io.getImage(assetId);const ok=univerAPI.syncExecuteCommand('sheet.command.set-worksheet-background-image',{unitId:workbook.getId(),subUnitId:sheetId,backgroundImage:{source:assetId,imageSourceType:ImageSourceType.UUID,...scale}});if(!ok)throw new Error('背景图片设置失败，已上传原件仍保留。');};
  return {ready,retryImages,setBackgroundAsset,restoreEdit,snapshot:async()=>{await ready;const data=await committedSnapshot({isDisposed:()=>disposed,isComposing:imeActive,isEditing:()=>workbook.isCellEditing(),endEditing:()=>workbook.endEditingAsync(true),calculate:()=>univerAPI.getFormula().onCalculationResultApplied(10000),read:()=>workbook.save()});checkWorkbookBounds(data);return data;},draftSnapshot:async()=>{await ready;if(disposed||imeActive())return null;await univerAPI.getFormula().onCalculationResultApplied(10000);if(disposed||imeActive())return null;const snapshot=workbook.save();checkWorkbookBounds(snapshot);return {snapshot,edit:readEdit(snapshot)};},insertAsset,
    insertImage:async file=>{const image=await io.saveImage(file);const sheet=workbook.getActiveSheet(),cell=sheet.getActiveCell();await insertAsset(sheet.getSheetId(),image.source,{kind:'oneCell',from:{row:cell?.getRow()??0,column:cell?.getColumn()??0,rowOffset:4,columnOffset:4},width:160,height:100});},
    dispose:()=>{disposed=true;resolveReady();options.container.removeEventListener('compositionstart',compositionStart,true);options.container.removeEventListener('compositionend',compositionEnd,true);subscriptions.forEach(s=>s.dispose());io.dispose();univer.dispose();}};
}
