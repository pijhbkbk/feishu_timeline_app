'use client';
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { IWorkbookData } from '@univerjs/core';
import { prepareDisplayFonts } from '../business-sheet/display-fonts';
import type { WorkbookEditingDraft } from './editing-draft';
import type { WorkbookRuntime } from './runtime';
export function WorkbookCanvas(props:{snapshot:IWorkbookData;editingDraft?:WorkbookEditingDraft|null;runtime:MutableRefObject<WorkbookRuntime|null>;onRecoveryError?(message:string):void;onReady():void;onChanged():void;onError(message:string):void;onUploading(count:number):void}){
  const host=useRef<HTMLDivElement>(null),current=useRef(props);current.current=props;const runtime=props.runtime;
  useEffect(()=>{let stopped=false,instance:WorkbookRuntime|null=null;void import('./runtime').then(async({createFreeWorkbook})=>{await prepareDisplayFonts();if(stopped||!host.current)return;instance=createFreeWorkbook({container:host.current,snapshot:current.current.snapshot,onChanged:()=>current.current.onChanged(),onError:message=>current.current.onError(message),onUploading:count=>current.current.onUploading(count)});runtime.current=instance;await instance.ready;if(!stopped&&current.current.editingDraft){try{await instance.restoreEdit(current.current.editingDraft);}catch(error){if(!stopped)current.current.onRecoveryError?.(error instanceof Error?error.message:'未确认输入恢复失败，原草稿保留。');return;}}if(!stopped)current.current.onReady();}).catch(error=>{if(!stopped)current.current.onError(error instanceof Error?error.message:'工作簿无法加载。');});return()=>{stopped=true;instance?.dispose();if(runtime.current===instance)runtime.current=null;};},[runtime]);
  return <div className="fw-canvas" ref={host} aria-label="自由工作簿编辑器" data-testid="free-workbook"/>;
}
