'use client';
import React, { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { IWorkbookData } from '@univerjs/core';
import { prepareDisplayFonts } from '../business-sheet/display-fonts';
import type { WorkbookEditingDraft } from './editing-draft';
import type { WorkbookRuntime } from './runtime';
export function WorkbookCanvas(props:{snapshot:IWorkbookData;editingDraft?:WorkbookEditingDraft|null;runtime:MutableRefObject<WorkbookRuntime|null>;onRecoveryError?(message:string):void;onReady():void;onChanged():void;onError(message:string):void;onUploading(count:number):void;onImageFailures(count:number):void}){
  const host=useRef<HTMLDivElement>(null),current=useRef(props);current.current=props;const runtime=props.runtime;
  const [attempt,setAttempt]=useState(0),[boot,setBoot]=useState<{status:'loading'|'ready'|'error'|'recovery-failed';message?:string}>({status:'loading'});
  const retrying=useRef(false);
  useEffect(()=>{
    let stopped=false,instance:WorkbookRuntime|null=null;
    retrying.current=false;setBoot({status:'loading'});
    void import('./runtime').then(async({createFreeWorkbook})=>{
      if(stopped)return;
      await prepareDisplayFonts();if(stopped||!host.current)return;
      instance=createFreeWorkbook({
        container:host.current,snapshot:current.current.snapshot,
        onChanged:()=>{if(!stopped)current.current.onChanged();},
        onError:message=>{if(!stopped)current.current.onError(message);},
        onUploading:count=>{if(!stopped)current.current.onUploading(count);},
        onImageFailures:count=>{if(!stopped)current.current.onImageFailures(count);},
      });
      runtime.current=instance;await instance.ready;
      if(stopped)return;
      if(current.current.editingDraft){
        try{await instance.restoreEdit(current.current.editingDraft);}
        catch(error){
          if(!stopped){setBoot({status:'recovery-failed'});current.current.onRecoveryError?.(error instanceof Error?error.message:'未确认输入恢复失败，原草稿保留。');}
          return;
        }
      }
      if(!stopped){setBoot({status:'ready'});current.current.onReady();}
    }).catch(error=>{
      if(stopped)return;
      stopped=true;
      // Only a failed startup is retried. No workbook, draft or image request is
      // replayed, and the parent still owns the original snapshot/recovery data.
      instance?.dispose();if(runtime.current===instance)runtime.current=null;instance=null;
      setBoot({status:'error',message:error instanceof Error?error.message:'工作簿编辑器无法加载。'});
    });
    return()=>{stopped=true;instance?.dispose();if(runtime.current===instance)runtime.current=null;};
  },[runtime,attempt]);
  function retry(){
    if(boot.status!=='error'||retrying.current||runtime.current)return;
    retrying.current=true;setBoot({status:'loading'});setAttempt(value=>value+1);
  }
  return <>
    {boot.status==='loading'&&<p className="fw-status" role="status">正在加载工作簿编辑器…</p>}
    {boot.status==='error'&&<div className="fw-error" role="alert"><p>编辑器未能加载，工作簿和恢复记录仍保留。</p><p>{boot.message}</p><button type="button" className="fw-primary" onClick={retry}>重试加载编辑器</button></div>}
    <div className="fw-canvas" ref={host} aria-label="自由工作簿编辑器" aria-busy={boot.status==='loading'} data-testid="free-workbook"/>
  </>;
}
