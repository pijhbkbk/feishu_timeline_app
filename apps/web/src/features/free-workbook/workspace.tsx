'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { MappingSource } from './mapping-panel';
import { useSearchParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../components/auth-provider';
import { ApiRequestError, isApprovedTeamUser } from '../../lib/auth-client';
import { useProjectUnsavedChanges } from '../m1/use-unsaved';
import { defaultImageLayout, listSheetImages, uploadSheetImage } from '../business-sheet/image-client';
import { downloadWorkbook } from '../business-sheet/record-exchange';
import { blankWorkbook } from './contract';
import { WorkbookCanvas } from './canvas';
import type { WorkbookEditingDraft } from './editing-draft';
import type { WorkbookRuntime } from './runtime';
import { ServerDraftSession, type ServerDraftRead } from './server-draft-session';
import { readServerDraft, executeServerDraftRequest } from './server-draft-client';
import { WorkbookSaveSession } from './save-session';
import { WorkbookIntentSession } from './workbook-intent-session';
import { readWorkbookIntent, removeWorkbookIntent, type StoredWorkbookIntent, type WorkbookIntent } from './workbook-intent-store';
import { validateLocalDraft, claimLocalDraft, readLocalDrafts, writeLocalDraft, removeLocalDraft, type WorkbookLocalDraft } from './draft-store';
import { listRevisions, listWorkbooks, readWorkbook, saveWorkbook, type SavedWorkbook, type WorkbookMeta, type WorkbookRevision } from './client';
import type { WorkbookImport } from './xlsx';
import './workbook.css';
const BusinessMappingPanel=dynamic(()=>import('./mapping-panel').then(module=>module.BusinessMappingPanel),{ssr:false,loading:()=> <div role="status">正在打开业务映射…</div>});
const message=(cause:unknown)=>cause instanceof Error?cause.message:'操作失败，内容仍保留。';
export function FreeWorkbookWorkspace(){
  const {user}=useAuth(),canEdit=isApprovedTeamUser(user);const runtime=useRef<WorkbookRuntime|null>(null),session=useRef<WorkbookSaveSession|null>(null),sequence=useRef(0),confirmed=useRef(0);
  const [items,setItems]=useState<WorkbookMeta[]>([]),[after,setAfter]=useState<string|null>(null),[active,setActive]=useState<SavedWorkbook|null>(null),[epoch,setEpoch]=useState(0),[ready,setReady]=useState(false);
  const [structureBusy,setStructureBusy]=useState(false);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(0),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[title,setTitle]=useState('新工作簿');
  const [candidate,setCandidate]=useState<WorkbookImport|null>(null),[history,setHistory]=useState<WorkbookRevision[]|null>(null),[before,setBefore]=useState<number|null>(null),[selectedRevision,setSelectedRevision]=useState('');
  const [restoreConfirmation,setRestoreConfirmation]=useState<{ownerId:string;workbookId:string;expected:number;target:number;sequence:number}|null>(null);
  const pendingImport=useRef<{data:WorkbookImport;index:number;operations:string[];assets:Map<string,string>;intentId:string}|null>(null),candidateSource=useRef<{workbookId:string;bytes:Uint8Array}|null>(null);
  const intentRecord=useRef<StoredWorkbookIntent|null>(null),intentOwner=useRef<string|null>(null);
  const [storedIntent,setStoredIntent]=useState<StoredWorkbookIntent|null>(null),[intentReady,setIntentReady]=useState(false),[intentError,setIntentError]=useState(''),[intentRetry,setIntentRetry]=useState(0);
  const picker=useRef<HTMLInputElement>(null),imagePicker=useRef<HTMLInputElement>(null);const busyRef=useRef(false),mounted=useRef(true),readController=useRef<AbortController|null>(null),activeId=useRef<string|null>(null);
  const requestedId=useSearchParams().get('workbook');
  const navigationRead=useRef<{requested:string|null;controller:AbortController}|null>(null),handledLoadEpoch=useRef(0);
  const cloudLoadVersion=useRef(0),cloud=useRef<ServerDraftSession|null>(null),cloudSending=useRef(false);
  const [cloudReady,setCloudReady]=useState(false),[cloudBusy,setCloudBusy]=useState(false),[cloudStatus,setCloudStatus]=useState(''),[cloudRecovery,setCloudRecovery]=useState<ServerDraftRead|null>(null);
  const [mappingOpen,setMappingOpen]=useState(false),[mappingStatus,setMappingStatus]=useState('');
  const activeMeta=useRef(active);activeMeta.current=active;
  const [recoveryFailed,setRecoveryFailed]=useState(false),[imageFailures,setImageFailures]=useState(0);
  const [editingDraft,setEditingDraft]=useState<WorkbookEditingDraft|null>(null);
  const [loadEpoch,setLoadEpoch]=useState(0);
  const [draftTick,setDraftTick]=useState(0),[draftStatus,setDraftStatus]=useState(''),[draftReady,setDraftReady]=useState(true),[recoverable,setRecoverable]=useState<WorkbookLocalDraft[]>([]);
  const draftWriteVersion=useRef(0),draftGeneration=useRef(0),editorId=useRef(''),localDraft=useRef<WorkbookLocalDraft|null>(null),loadedOwner=useRef<string|null|undefined>(undefined);
  const ownerId=canEdit?user.id:null;
  const currentOwner=useRef(ownerId);currentOwner.current=ownerId;
  useEffect(()=>{let cancelled=false;intentOwner.current=null;intentRecord.current=null;setStoredIntent(null);setIntentReady(false);setIntentError('');if(!ownerId){setIntentReady(true);return;}void readWorkbookIntent(ownerId).then(record=>{if(!cancelled&&currentOwner.current===ownerId){intentOwner.current=ownerId;intentRecord.current=record;setStoredIntent(record);setIntentReady(true);}}).catch(cause=>{if(!cancelled)setIntentError(message(cause));});return()=>{cancelled=true;};},[ownerId,intentRetry]);
  function captureScope(){const owner=ownerId,generation=draftGeneration.current,coordinator=session.current,id=activeId.current;return()=>mounted.current&&currentOwner.current===owner&&draftGeneration.current===generation&&session.current===coordinator&&activeId.current===id;}
  async function persistDraft(snapshot:SavedWorkbook['snapshot'],capturedSequence:number,edit:WorkbookEditingDraft|null=null){
    if(!ownerId||currentOwner.current!==ownerId||!active||activeId.current!==active.id||!session.current||capturedSequence<1)throw new Error('当前账号或工作簿已切换，原内容未发送。');
    const isCurrent=captureScope(),coordinator=session.current;
    const draft:WorkbookLocalDraft={schema:1,ownerId,workbookId:active.id,editorId:editorId.current,baseRevision:coordinator.revision,sequence:capturedSequence,savedAt:Date.now(),writeVersion:++draftWriteVersion.current,snapshot,edit,server:cloud.current?.checkpoint()??null,pending:coordinator.checkpoint()};
    if(!await writeLocalDraft(draft))throw new Error('较新的本机草稿已保留，请重新保存当前内容。');
    if(isCurrent()){localDraft.current=draft;setDraftStatus(edit?'本机草稿已保存 · 未确认输入仅保留在本机':'本机草稿已保存 · 尚未保存为正式版本');}
    return draft;
  }
  useEffect(()=>{
    if(!dirty||!ready||!draftReady||uploading||pendingImport.current||recoverable.length||!ownerId)return;
    let stopped=false;const generation=draftGeneration.current,isCurrent=captureScope();
    const timer=setTimeout(()=>{void (async()=>{try{const capturedSequence=sequence.current,draft=await runtime.current?.draftSnapshot();if(stopped||generation!==draftGeneration.current)return;if(!draft){setDraftTick(n=>n+1);return;}await persistDraft(draft.snapshot,capturedSequence,draft.edit);if(!stopped&&isCurrent()&&!draft.edit&&!busyRef.current&&!session.current?.uncertain)await autoSaveCloud(draft.snapshot,capturedSequence,isCurrent);}catch(cause){if(!stopped)setDraftStatus(message(cause));}})();},800);
    return()=>{stopped=true;clearTimeout(timer);};
  },[draftTick,dirty,ready,draftReady,busy,uploading,recoverable.length,ownerId,cloudReady]);
  useEffect(()=>{mounted.current=true;readController.current=new AbortController();return()=>{mounted.current=false;readController.current?.abort();navigationRead.current?.controller.abort();navigationRead.current=null;};},[]);
  useProjectUnsavedChanges(dirty||busy||uploading>0||Boolean(candidate)||Boolean(storedIntent&&storedIntent.intent.phase!=='confirmed'));
  async function refreshList(more=false){const isCurrent=captureScope();const result=await listWorkbooks(more?after??undefined:undefined,readController.current?.signal);if(!isCurrent())return;setItems(previous=>{const selected=previous.find(item=>item.id===activeId.current);const retained=more?previous:selected?[selected]:[];return [...new Map([...retained,...result.items].map(item=>[item.id,item] as const)).values()];});setAfter(result.nextCursor);}
  function mount(value:SavedWorkbook,isDirty=false,recovered?:WorkbookLocalDraft,recoveredCloud?:ServerDraftSession){
    if(!mounted.current||currentOwner.current!==ownerId)return;
    setMappingOpen(false);setMappingStatus('');
    const {id,name,revision,snapshotHash,updatedAt}=value;activeId.current=id;setLoading(false);setError('');
    setItems(previous=>previous.some(item=>item.id===id)?previous:[{id,name,revision,snapshotHash,updatedAt},...previous]);
    const url=new URL(window.location.href);url.searchParams.set('workbook',id);historyReplace(url);setReady(false);setActive(value);
    session.current=new WorkbookSaveSession(recovered?.baseRevision??value.revision,recovered?.pending??null);
    sequence.current=recovered?.sequence??(isDirty?1:0);confirmed.current=0;setDirty(isDirty||Boolean(recovered));setEpoch(n=>n+1);setHistory(null);setRestoreConfirmation(null);setRecoveryFailed(false);setImageFailures(0);setEditingDraft(recovered?.edit??null);
    setStatus(recovered?`已恢复本机草稿 · 基于版本 ${recovered.baseRevision}`:isDirty?'待保存':`已读取版本 ${value.revision}`);
    const generation=++draftGeneration.current;editorId.current=recovered?.editorId??crypto.randomUUID();localDraft.current=recovered??null;draftWriteVersion.current=recovered?.writeVersion??0;setRecoverable([]);cloud.current=recoveredCloud??(ownerId?new ServerDraftSession({workbookId:id,authorUserId:ownerId,baseWorkbookRevision:recovered?.baseRevision??value.revision}):null);setCloudRecovery(null);setCloudStatus('');cloudLoadVersion.current++;setCloudReady(Boolean(recovered||isDirty)&&!cloud.current?.conflicted);if(recovered)setCloudStatus(cloud.current?.conflicted?'服务器草稿冲突，本机内容保留，请重新读取':cloud.current?.uncertain?'服务器草稿结果待确认，本机内容保留':'已恢复本机内容，服务器草稿自动保存已启用');setDraftStatus(recovered?'本机草稿已恢复 · 尚未提交服务器':'');
    if(!ownerId||isDirty||recovered){setDraftReady(true);return;}
    setDraftReady(false);void loadCloud(id,generation,value.revision);
    void readLocalDrafts(ownerId,id).then(values=>{if(mounted.current&&generation===draftGeneration.current)setRecoverable(values);}).catch(cause=>{if(mounted.current&&generation===draftGeneration.current)setDraftStatus(message(cause));}).finally(()=>{if(mounted.current&&generation===draftGeneration.current)setDraftReady(true);});
  }
  async function recoverDraft(draft:WorkbookLocalDraft){
    await run(async()=>{if(!active||draft.ownerId!==ownerId||draft.workbookId!==active.id)return;
      const isCurrent=captureScope(),restoredCloud=draft.server?await ServerDraftSession.recover(draft.server,{workbookId:draft.workbookId,authorUserId:draft.ownerId}):undefined;if(!isCurrent())return;const copy=await claimLocalDraft(draft);if(!isCurrent())return;
      const serverRevision=active.revision;mount({...active,snapshot:copy.snapshot},true,copy,restoredCloud);
      if(serverRevision!==draft.baseRevision)setError(`服务器当前为版本 ${serverRevision}，草稿基于版本 ${draft.baseRevision}。恢复未覆盖服务器；请先核实原请求，或导出草稿后重新读取。`);
    });
  }
  function downloadDraft(draft:WorkbookLocalDraft){if(draft.ownerId!==currentOwner.current)return;try{validateLocalDraft(draft,ownerId!,draft.workbookId);const url=URL.createObjectURL(new Blob([JSON.stringify(draft)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`workbook-${draft.workbookId}-recovery.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(cause){setError(message(cause));}}
  async function discardDraft(draft:WorkbookLocalDraft){if(!window.confirm('永久放弃这份本机草稿？服务器版本不会改变。'))return;await run(async()=>{const isCurrent=captureScope();await removeLocalDraft(draft);if(isCurrent())setRecoverable(values=>values.filter(value=>value.editorId!==draft.editorId));});}

  useEffect(()=>{
    // Next keeps this component mounted for query/back navigation. Read the live
    // URL as well, because a replaceState update can precede its React render.
    const requested=new URLSearchParams(window.location.search).get('workbook');
    const identityChanged=loadedOwner.current!==ownerId;loadedOwner.current=ownerId;
    const forced=identityChanged||handledLoadEpoch.current!==loadEpoch;handledLoadEpoch.current=loadEpoch;
    if(!forced&&((activeId.current!==null&&requested===activeId.current)||navigationRead.current?.requested===requested))return;
    if(!identityChanged&&!canLeave()){replaceWorkbookUrl(activeId.current);return;}
    navigationRead.current?.controller.abort();
    const controller=new AbortController();navigationRead.current={requested,controller};
    const current=()=>mounted.current&&!controller.signal.aborted&&navigationRead.current?.controller===controller&&new URLSearchParams(window.location.search).get('workbook')===requested;
    // Discard only after canLeave succeeds. No editable A canvas may remain
    // underneath a B URL while B is loading or after B is denied/not found.
    activeId.current=null;runtime.current=null;session.current=null;
    if(identityChanged){pendingImport.current=null;candidateSource.current=null;setUploading(0);}
    setMappingOpen(false);setMappingStatus('');setActive(null);setReady(false);setDirty(false);setCandidate(null);setHistory(null);setRestoreConfirmation(null);setStatus('');setLoading(true);setError('');draftGeneration.current++;cloud.current=null;setCloudReady(false);setCloudRecovery(null);setCloudStatus('');localDraft.current=null;setRecoverable([]);setDraftStatus('');
    void (async()=>{
      try{
        if(requested==='')throw new Error('工作簿标识无效，请检查链接。');
        const result=await listWorkbooks(undefined,controller.signal);if(!current())return;
        setItems(result.items);setAfter(result.nextCursor);
        const selected=requested??result.items[0]?.id;
        if(selected){const value=await readWorkbook(selected,controller.signal);if(current())mount(value);}
      }catch(cause){if(current())setError(message(cause));}
      finally{if(navigationRead.current?.controller===controller){navigationRead.current=null;if(mounted.current&&!controller.signal.aborted)setLoading(false);}}
    })();
  },[requestedId,loadEpoch,ownerId]);
  function changed(){if(currentOwner.current!==ownerId||!active||activeId.current!==active.id)return;sequence.current++;setDirty(sequence.current!==confirmed.current);setStatus(session.current?.uncertain?'保存结果待确认；新修改仍保留':'待保存');setDraftStatus('正在保留本机草稿');setDraftTick(n=>n+1);}
  async function loadCloud(id:string,generation:number,revision:number){
    if(!ownerId||cloudSending.current)return;const owner=ownerId,loadVersion=++cloudLoadVersion.current;setCloudReady(false);
    try{const result=await readServerDraft(id,readController.current?.signal);if(!mounted.current||generation!==draftGeneration.current||currentOwner.current!==owner||loadVersion!==cloudLoadVersion.current)return;
      if(result.draft){setCloudRecovery(result);setCloudReady(false);setCloudStatus('发现未提交的服务器草稿，请选择恢复或保留');}
      else{cloud.current=new ServerDraftSession({workbookId:id,authorUserId:owner,baseWorkbookRevision:revision});setCloudReady(true);setCloudStatus('服务器草稿自动保存已启用');}
    }catch(cause){if(mounted.current&&generation===draftGeneration.current&&currentOwner.current===owner&&loadVersion===cloudLoadVersion.current){setCloudReady(false);setCloudStatus(`服务器草稿读取失败：${message(cause)}`);}}
  }
  async function performCloud(isCurrent:()=>boolean,unsentOperationId?:string){
    const coordinator=cloud.current,request=coordinator?.existing();if(!coordinator||!request||!isCurrent())return;
    // The local envelope includes the exact request even when it is older than
    // the latest editing snapshot. Network writes never precede durability.
    try{await captureLatestDraft(isCurrent);}catch(cause){if(unsentOperationId)coordinator.abandonUnsent(unsentOperationId);throw cause;}if(!isCurrent()||cloud.current!==coordinator)return;
    try{const ack=await executeServerDraftRequest(request);if(!isCurrent()||cloud.current!==coordinator)return;
      const result=coordinator.confirm(ack);setCloudStatus(result.status==='conflict'?'服务器草稿已发生变化，本机内容保留，请重新读取后选择':request.kind==='save'?`服务器草稿已保存 · 基于正式版本 ${ack.receipt.baseWorkbookRevision}`:'已清理本次正式保存对应的服务器草稿');
      if(result.status==='conflict')setCloudReady(false);
    }catch(cause){if(!isCurrent()||cloud.current!==coordinator)return;coordinator.reject(cause instanceof ApiRequestError?cause.status:undefined);setCloudStatus(coordinator.uncertain?'服务器草稿结果待确认，本机内容已保留':`服务器草稿未保存：${message(cause)}`);if(coordinator.conflicted)setCloudReady(false);}
    if(isCurrent())await captureLatestDraft(isCurrent).catch(cause=>{if(isCurrent())setDraftStatus(`本机草稿检查点更新失败：${message(cause)}，请保持页面打开并重试。`);});
  }
  async function autoSaveCloud(snapshot:SavedWorkbook['snapshot'],capturedSequence:number,isCurrent:()=>boolean){
    const coordinator=cloud.current;if(!isCurrent()||!cloudReady||!coordinator||coordinator.uncertain||coordinator.conflicted||cloudSending.current||coordinator.checkpoint().acknowledgedSequence===capturedSequence)return;
    cloudSending.current=true;setCloudBusy(true);
    try{const request=await coordinator.requestSave(snapshot,capturedSequence,session.current!.revision);if(isCurrent()&&cloud.current===coordinator)await performCloud(isCurrent,request.body.operationId);}
    catch(cause){if(isCurrent())setCloudStatus(`服务器草稿未发送：${message(cause)}`);}
    finally{cloudSending.current=false;if(mounted.current){setCloudBusy(false);if(isCurrent()&&sequence.current!==capturedSequence)setDraftTick(n=>n+1);}}
  }
  async function retryCloud(){if(cloudSending.current)return;const isCurrent=captureScope();cloudSending.current=true;setCloudBusy(true);try{await performCloud(isCurrent);}finally{cloudSending.current=false;if(mounted.current)setCloudBusy(false);}}
  async function discardPublishedCloud(isCurrent:()=>boolean){
    const coordinator=cloud.current;if(!isCurrent()||!coordinator?.state.draftId||coordinator.uncertain||coordinator.conflicted)return;
    const request=coordinator.requestDiscard(sequence.current);try{await performCloud(isCurrent,request.body.operationId);}catch(cause){if(isCurrent())setCloudStatus(`正式版本已保存，草稿清理尚未发送：${message(cause)}`);}
  }
  async function recoverCloud(){await run(async()=>{
    const draft=cloudRecovery?.draft;if(!draft||!active||!ownerId)return;
    if(uploading||pendingImport.current||session.current?.uncertain||cloud.current?.uncertain||Boolean(intentRecord.current&&intentRecord.current.intent.phase!=='confirmed'))throw new Error('请先完成图片操作并核实原保存请求，再恢复服务器草稿。');
    if((dirty||localDraft.current)&&!window.confirm('当前本机最新内容将先保留；打开服务器草稿？'))return;
    const isCurrent=captureScope();if(sequence.current>0){const captured=await captureLatestDraft(isCurrent,true);if(!isCurrent())return;if(!captured||captured.sequence!==sequence.current)throw new Error('保留期间又有新输入，请完成输入后重试恢复。');}
    const beforeRestore=sequence.current,coordinator=new ServerDraftSession({workbookId:active.id,authorUserId:ownerId,baseWorkbookRevision:draft.baseWorkbookRevision,draft:cloudMeta(draft),acknowledgedSequence:1});coordinator.capture(draft.snapshot,1);
    const local:WorkbookLocalDraft={schema:1,ownerId,workbookId:active.id,editorId:crypto.randomUUID(),baseRevision:draft.baseWorkbookRevision,sequence:1,savedAt:Date.now(),writeVersion:1,snapshot:draft.snapshot,edit:null,pending:null,server:coordinator.checkpoint()};await writeLocalDraft(local);if(!isCurrent())return;if(sequence.current!==beforeRestore)throw new Error('保留期间又有新输入，请完成输入后重试恢复。');mount({...active,snapshot:draft.snapshot},true,local,coordinator);
    if(active.revision!==draft.baseWorkbookRevision)setError('服务器草稿基于旧正式版本，本机内容保留；正式保存仍需处理版本冲突。');
  });}
  function cloudMeta(draft:NonNullable<ServerDraftRead['draft']>){return {id:draft.id,draftRevision:draft.draftRevision,baseWorkbookRevision:draft.baseWorkbookRevision,snapshotHash:draft.snapshotHash,snapshotBytes:draft.snapshotBytes,updatedAt:draft.updatedAt};}
  function adoptCloudForLocal(){const draft=cloudRecovery?.draft;if(!draft||!active||!ownerId||!localDraft.current)return;cloud.current=new ServerDraftSession({workbookId:active.id,authorUserId:ownerId,baseWorkbookRevision:session.current!.revision,draft:cloudMeta(draft)});setCloudRecovery(null);setCloudReady(true);setCloudStatus('已选择以当前本机内容更新服务器草稿');setDraftTick(n=>n+1);}
  async function run(action:()=>Promise<void>,structural=false){if(busyRef.current)return;const isCurrent=captureScope();busyRef.current=true;setBusy(true);if(structural)setStructureBusy(true);setError('');try{await action();}catch(cause){if(isCurrent())setError(message(cause));}finally{busyRef.current=false;if(mounted.current){setBusy(false);if(structural)setStructureBusy(false);}}}
  function canLeave(){if(busyRef.current||uploading>0){setError('当前操作尚未结束，请等待完成后再切换工作簿。');return false;}if(pendingImport.current){setError('图片导入尚未完成，请继续导入或重新打开原文件。');return false;}if(session.current?.uncertain||Boolean(intentRecord.current&&intentRecord.current.intent.phase!=='confirmed')){setError('上次操作结果尚未确认，请先重试核实原请求。');return false;}return !(dirty||candidate)||window.confirm(localDraft.current?.sequence===sequence.current?'保留本机草稿并打开另一工作簿？':'当前最新内容尚未保存到本机草稿，继续打开另一工作簿会丢失这些内容。是否继续？');}
  function open(id:string){replaceWorkbookUrl(id);setLoadEpoch(value=>value+1);}
  function replaceWorkbookUrl(id:string|null){const url=new URL(window.location.href);if(id===null)url.searchParams.delete('workbook');else url.searchParams.set('workbook',id);historyReplace(url);}
  function historyReplace(url:URL){window.history.replaceState(window.history.state,'',url);}
  async function mappingSource():Promise<MappingSource>{
    if(!active||!ownerId||!runtime.current||!ready||busyRef.current||uploading||pendingImport.current||Boolean(intentRecord.current&&intentRecord.current.intent.phase!=='confirmed')||session.current?.uncertain)throw new Error('请先完成工作簿加载、图片导入并核实原保存请求。');
    const isCurrent=captureScope(),meta=activeMeta.current!,snapshot=await runtime.current.snapshot();
    if(!isCurrent()||activeMeta.current!==meta||session.current?.revision!==meta.revision)throw new Error('账号、工作簿或正式版本已变化，请重新打开映射。');
    return {workbookId:meta.id,formalRevision:meta.revision,sourceSnapshotHash:meta.snapshotHash,snapshot};
  }
  function intentPorts(assertConfirmation?:()=>void){
    const owner=ownerId,isCurrent=captureScope();
    const assertActive=()=>{if(!owner||currentOwner.current!==owner||intentOwner.current!==owner||!isCurrent())throw new Error('原账号或工作簿已切换，原请求日志保留，请回到原账号核实。');assertConfirmation?.();};
    return {assertActive,onStored:(record:StoredWorkbookIntent)=>{if(currentOwner.current===owner&&intentOwner.current===owner){intentRecord.current=record;setStoredIntent(record);}}};
  }
  async function retainCurrentDraft(){if(active&&runtime.current&&sequence.current>0){const isCurrent=captureScope(),captured=await captureLatestDraft(isCurrent,true);if(!isCurrent())throw new Error('当前页面已切换，原草稿保留。');if(!captured||captured.sequence!==sequence.current)throw new Error('保留草稿期间又有输入，请完成输入后重试，原操作未继续。');}}
  async function resumeIntent(record= intentRecord.current,assertConfirmation?:()=>void){
    if(!record||!ownerId||intentOwner.current!==ownerId)throw new Error('请先读取当前账号的操作记录。');
    const ports=intentPorts(assertConfirmation),coordinator=new WorkbookIntentSession(ownerId,record,ports);ports.assertActive();
    if(record.intent.phase==='confirmed'&&record.intent.resolution==='rejected')throw new Error('原操作已明确拒绝；保留的原文件和本机草稿未删除，可结束此记录后重试新操作。');
    await retainCurrentDraft();ports.assertActive();
    await coordinator.execute();ports.assertActive();const current=coordinator.record,intent=current.intent;
    if(intent.data.kind==='import'){
      const data=intent.data;if(!data.created)throw new Error('原创建回执尚未确认。');
      if(intent.phase==='confirmed'){ports.assertActive();const value=await readWorkbook(data.createSnapshot.id,readController.current?.signal);ports.assertActive();mount(value);setStatus('导入内容已保留为本机草稿，请选择恢复；尚未自动保存正式版本。');return;}
      const {readFreeWorkbook}=await import('./xlsx');ports.assertActive();
      const parsed=await readFreeWorkbook(data.sourceBytes,data.sourceFileName,data.createSnapshot.id);ports.assertActive();
      if(parsed.images.length!==data.imageOperations.length)throw new Error('原文件图片数量与持久记录不一致，未重建导入内容。');
      pendingImport.current={data:parsed,index:0,operations:[...data.imageOperations],assets:new Map(data.assets),intentId:intent.intentId};candidateSource.current=null;setCandidate(null);
      mount({...data.created,snapshot:parsed.snapshot},true);setStatus('原导入已恢复；将按原图片身份重建并保留本机草稿');
    }else{
      const id=intent.data.kind==='create'?intent.data.snapshot.id:intent.data.id;
      ports.assertActive();const value=await readWorkbook(id,readController.current?.signal);ports.assertActive();
      mount(value);setStatus(intent.data.kind==='restore'?'原历史恢复已确认，已读取服务器版本':'原创建已确认，已读取工作簿');
    }
    await refreshList();
  }
  async function create(){if(!canLeave())return;await run(async()=>{
    if(!ownerId||!intentReady||intentOwner.current!==ownerId||intentRecord.current)throw new Error('请先读取并结束原操作记录。');
    const ports=intentPorts();await retainCurrentDraft();ports.assertActive();
    const intent:WorkbookIntent={version:1,intentId:crypto.randomUUID(),phase:'prepared',resolution:null,data:{kind:'create',snapshot:blankWorkbook(crypto.randomUUID(),title.trim()||'新工作簿'),operationId:crypto.randomUUID()}};
    const coordinator=await WorkbookIntentSession.prepare(ownerId,intent,ports);await resumeIntent(coordinator.record);
  },true);}
  async function endIntent(cancelPrepared=false){await run(async()=>{const record=intentRecord.current;if(!record||!ownerId)return;const ports=intentPorts();ports.assertActive();await removeWorkbookIntent(ownerId,record.intent.intentId,record.revision,cancelPrepared?{cancelPrepared:true}:{});ports.assertActive();intentRecord.current=null;setStoredIntent(null);setStatus(cancelPrepared?'尚未发送的操作已取消；原文件与草稿保留':'原操作记录已结束；原文件与草稿保留');});}
  async function save(){await run(async()=>{
    if(!active||!runtime.current||!session.current||uploading||pendingImport.current||cloudSending.current)throw new Error('请等待图片和工作簿加载完成。');
    if(cloud.current?.conflicted)throw new Error('服务器草稿存在冲突，请先读取并选择需要保留的内容。');
    if(cloud.current?.uncertain)throw new Error('请先核实服务器草稿的原请求，当前内容已保留。');
    const coordinator=session.current,pending=coordinator.existing(),isCurrent=captureScope();
    const current=await runtime.current.snapshot(),capturedSequence=sequence.current||1;
    if(!isCurrent())return;
    if(!sequence.current)sequence.current=capturedSequence;
    const payload=pending??coordinator.request(current,capturedSequence);setStatus('正在保存');
    // Persist the immutable request before sending it. A lost response can then
    // be retried after a browser restart with the exact operation ID and body.
    try{await persistDraft(current,capturedSequence);}catch(cause){if(!pending)coordinator.abandonUnsent(payload.operationId);if(isCurrent()){setDirty(true);setStatus(pending?'原保存结果待确认，未发起重试':'保存请求尚未发送');}throw cause;}if(!isCurrent())return;
    let ack:WorkbookMeta;
    try{ack=await saveWorkbook(active.id,payload);if(!isCurrent())return;confirmed.current=coordinator.confirm(ack.revision);}
    catch(cause){if(!isCurrent())return;coordinator.reject(cause instanceof ApiRequestError?cause.status:undefined);setDirty(true);setStatus(coordinator.uncertain?'保存结果未知，请重试核实原请求':'未保存');await captureLatestDraft(isCurrent).catch(error=>{if(isCurrent())setDraftStatus(message(error));});throw cause;}
    const newerKnown=active.revision>ack.revision;
    setActive(value=>value?{...value,...ack,revision:Math.max(value.revision,ack.revision)}:value);
    const changedSince=sequence.current!==confirmed.current;setDirty(changedSince||newerKnown);
    setStatus(newerKnown?`原请求已确认保存为版本 ${ack.revision}；服务器已有版本 ${active.revision}，请重新读取`:changedSince?`版本 ${ack.revision} 已保存，仍有新修改`:`已保存 · 版本 ${ack.revision}`);
    await captureLatestDraft(isCurrent).catch(cause=>{if(isCurrent())setDraftStatus(message(cause));});
    await discardPublishedCloud(isCurrent);
    if(!isCurrent())return;
    if(sequence.current===confirmed.current&&!newerKnown&&!cloud.current?.uncertain&&!cloud.current?.conflicted&&localDraft.current?.sequence===confirmed.current&&localDraft.current.baseRevision===ack.revision){
      const savedDraft=localDraft.current;
      try{await removeLocalDraft(savedDraft);if(isCurrent()&&localDraft.current===savedDraft){localDraft.current=null;setDraftStatus('');}}catch(cause){if(isCurrent())setDraftStatus(message(cause));}
    }else{setDraftTick(n=>n+1);await captureLatestDraft(isCurrent).catch(cause=>{if(isCurrent())setDraftStatus(message(cause));});}
    if(isCurrent())await refreshList().catch(cause=>{if(isCurrent())setError(`工作簿已保存，列表刷新失败：${message(cause)}`);});
  });}

  async function captureLatestDraft(isCurrent:()=>boolean,requireCurrent=false){if(!isCurrent())return;const value=await runtime.current?.draftSnapshot();if(!isCurrent())return;if(value)return persistDraft(value.snapshot,sequence.current,value.edit);const stable=localDraft.current;if(stable&&!requireCurrent)return persistDraft(stable.snapshot,stable.sequence,stable.edit??null);throw new Error('当前输入尚不能持久化，请完成中文选词后重试，当前内容保留。');}

  async function importFile(file:File){if(!canLeave())return;await run(async()=>{
    if(!intentReady||intentOwner.current!==ownerId||intentRecord.current)throw new Error('请先读取并结束原操作记录。');
    const isCurrent=captureScope();if(file.size>5*1024*1024)throw new Error('XLSX 文件不能超过 5 MiB。');const bytes=new Uint8Array(await file.arrayBuffer());if(!isCurrent())return;
    const {readFreeWorkbook}=await import('./xlsx');const preview=await readFreeWorkbook(bytes,file.name,crypto.randomUUID());if(isCurrent()){candidateSource.current={workbookId:preview.snapshot.id,bytes};setCandidate(preview);}
  });}
  async function acceptImport(){const data=candidate,source=candidateSource.current;if(!data||!source)return;await run(async()=>{
    if(!ownerId||!intentReady||intentOwner.current!==ownerId||intentRecord.current||source.workbookId!==data.snapshot.id)throw new Error('请先核实原操作记录和文件。');
    const ports=intentPorts();await retainCurrentDraft();ports.assertActive();
    const intent:WorkbookIntent={version:1,intentId:crypto.randomUUID(),phase:'prepared',resolution:null,data:{kind:'import',createSnapshot:blankWorkbook(data.snapshot.id,data.snapshot.name),operationId:crypto.randomUUID(),sourceFileName:data.fileName,sourceBytes:source.bytes,imageOperations:data.images.map(()=>crypto.randomUUID()),created:null,imageIndex:0,assets:[]}};
    const coordinator=await WorkbookIntentSession.prepare(ownerId,intent,ports);await resumeIntent(coordinator.record);
  },true);}
  async function importImages(){await run(async()=>{
    const pending=pendingImport.current,record=intentRecord.current,instance=runtime.current;if(!pending||!instance||!active||!ownerId||!record||record.intent.intentId!==pending.intentId)throw new Error('请先恢复原导入记录。');
    const ports=intentPorts(),coordinator=new WorkbookIntentSession(ownerId,record,ports);ports.assertActive();
    for(;pending.index<pending.data.images.length;pending.index++){
      ports.assertActive();const image=pending.data.images[pending.index]!;let assetId=pending.assets.get(String(image.sourceMediaId));
      if(!assetId){
        const file=new File([new Uint8Array(image.bytes)],`图片-${pending.index+1}.${image.mime==='image/png'?'png':'jpg'}`,{type:image.mime});
        ports.assertActive();const asset=await uploadSheetImage(file,'SHEET_WORKBOOK',active.id,defaultImageLayout(),pending.operations[pending.index]!,()=>{});ports.assertActive();
        if(asset.targetType!=='SHEET_WORKBOOK'||asset.recordId!==active.id||asset.isDeleted)throw new Error('图片回执与原工作簿不一致，保留原请求待核实。');
        await coordinator.rememberAsset(String(image.sourceMediaId),asset.id);ports.assertActive();assetId=asset.id;pending.assets.set(String(image.sourceMediaId),assetId);
      }
      ports.assertActive();if(image.background)await instance.setBackgroundAsset(image.sheetId,assetId,image.background);else await instance.insertAsset(image.sheetId,assetId,image.anchor!,pending.operations[pending.index]!);ports.assertActive();
      await coordinator.advanceImage(pending.index);ports.assertActive();
    }
    const snapshot=await instance.snapshot();ports.assertActive();if(sequence.current<1)sequence.current=1;
    await persistDraft(snapshot,sequence.current);ports.assertActive();await coordinator.finishImport({workbookId:active.id,imageCount:pending.data.images.length});ports.assertActive();
    pendingImport.current=null;setDirty(true);setDraftTick(n=>n+1);setStatus('完整导入已保留为本机草稿；请显式保存为正式版本');
  });}
  async function exportFile(){await run(async()=>{const isCurrent=captureScope();if(!active||!runtime.current||pendingImport.current||uploading)throw new Error('请先完成图片导入。');const snapshot=await runtime.current.snapshot(),assets=await listSheetImages('SHEET_WORKBOOK',[active.id]);const {writeFreeWorkbook}=await import('./xlsx');const {workbookExportWarnings}=await import('./filter-exchange');const warnings=workbookExportWarnings(snapshot);if(!isCurrent())return;if(warnings.length&&!window.confirm(`${warnings.join('\n')}\n继续导出副本？`))return;const bytes=await writeFreeWorkbook(snapshot,assets,{allowFilterCriteriaConversion:warnings.length>0});if(!isCurrent())return;downloadWorkbook(bytes,`${snapshot.name}.xlsx`);setStatus('已导出当前内容；服务器保存状态未改变');});}
  async function showHistory(more=false){if(!active)return;await run(async()=>{const isCurrent=captureScope();const result=await listRevisions(active.id,more?before??undefined:undefined,readController.current?.signal);if(!isCurrent())return;setHistory(previous=>more?[...previous??[],...result.items]:result.items);setBefore(result.nextBefore);});}
  function requestRestore(){if(!active||!ownerId||!selectedRevision||!canLeave())return;setRestoreConfirmation({ownerId,workbookId:active.id,expected:active.revision,target:Number(selectedRevision),sequence:sequence.current});}
  async function restore(){const confirmation=restoreConfirmation;if(!confirmation)return;setRestoreConfirmation(null);
    if(!active||ownerId!==confirmation.ownerId||currentOwner.current!==confirmation.ownerId||active.id!==confirmation.workbookId||activeId.current!==confirmation.workbookId||active.revision!==confirmation.expected||sequence.current!==confirmation.sequence||Number(selectedRevision)!==confirmation.target){setError('账号、工作簿或内容已变化，请重新核对历史版本后确认恢复。');return;}
    if(!canLeave())return;const assertConfirmation=()=>{if(currentOwner.current!==confirmation.ownerId||activeMeta.current?.id!==confirmation.workbookId||activeMeta.current.revision!==confirmation.expected||sequence.current!==confirmation.sequence)throw new Error('确认恢复后又有内容或版本变化，原内容和操作日志保留，请重新核对。');};await run(async()=>{
    if(!ownerId||!intentReady||intentOwner.current!==ownerId||intentRecord.current)throw new Error('请先读取并结束原操作记录。');
    const ports=intentPorts(assertConfirmation);ports.assertActive();await retainCurrentDraft();ports.assertActive();
    const intent:WorkbookIntent={version:1,intentId:crypto.randomUUID(),phase:'prepared',resolution:null,data:{kind:'restore',id:confirmation.workbookId,revision:confirmation.target,expected:confirmation.expected,operationId:crypto.randomUUID()}};
    const coordinator=await WorkbookIntentSession.prepare(ownerId,intent,ports);await resumeIntent(coordinator.record,assertConfirmation);
  },true);}
  return <section className="fw-workspace"><div inert={mappingOpen}>
    <header className="fw-heading"><div><h1>颜色工作簿</h1><span className="fw-kind">自由编辑</span></div><Link href={active?`/admin/color-database?view=records&workbook=${encodeURIComponent(active.id)}`:'/admin/color-database?view=records'} className="fw-link">业务颜色记录</Link></header>
    <div className="fw-toolbar">
      <label>工作簿<select aria-label="选择工作簿" value={active?.id??''} disabled={loading||busy||uploading>0} onChange={event=>void open(event.target.value)}><option value="" disabled>选择工作簿</option>{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{after&&<button disabled={busy} onClick={()=>void run(()=>refreshList(true))}>更多</button>}
      <input aria-label="新工作簿名" value={title} maxLength={200} onChange={event=>setTitle(event.target.value)}/><button disabled={!canEdit||busy||loading||!intentReady||!!storedIntent} onClick={()=>void create()}>新建</button>
      <button disabled={!canEdit||busy||loading||uploading>0||!intentReady||!!storedIntent} onClick={()=>picker.current?.click()}>导入 XLSX</button>
      <button disabled={!ready||busy||uploading>0||Boolean(pendingImport.current)||!canEdit} onClick={()=>imagePicker.current?.click()}>图片</button>
      <button disabled={!ready||busy||uploading>0||Boolean(pendingImport.current)||!canEdit} onClick={()=>setMappingOpen(true)}>应用到业务</button>
      <button className="fw-primary" disabled={!ready||busy||cloudBusy||uploading>0||Boolean(pendingImport.current)||!canEdit} onClick={()=>void save()}>{session.current?.uncertain?'核实并保存':'保存'}</button>
      <button disabled={!ready||busy||uploading>0} onClick={()=>void exportFile()}>导出 XLSX</button><button disabled={!active||busy} onClick={()=>void showHistory()}>版本恢复</button>
      <button disabled={!active||busy||uploading>0} onClick={()=>active&&void open(active.id)}>重新读取</button>
      <input ref={picker} type="file" accept=".xlsx" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void importFile(file);}}/>
      <input ref={imagePicker} type="file" accept="image/png,image/jpeg" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void run(async()=>{await runtime.current?.insertImage(file);});}}/>
    </div>
    <div className="fw-status" role="status">{loading?'正在读取工作簿':busy?'处理中':uploading?'图片正在扫描':status||'请选择或新建工作簿'}{dirty&&!busy&&<strong> · 有未保存内容</strong>}{draftStatus&&<span className="fw-draft-status"> · {draftStatus}</span>}</div>
    {mappingStatus&&<div className="fw-status" role="status">{mappingStatus}</div>}
    {ownerId&&!intentReady&&<div role="status">正在读取此账号的持久操作记录…</div>}
    {intentError&&<div className="fw-error" role="alert">{intentError}<button disabled={busy} onClick={()=>setIntentRetry(n=>n+1)}>重试读取操作记录</button></div>}
    {storedIntent&&intentOwner.current===ownerId&&<div className="fw-dialog" role="region" aria-label="工作簿操作恢复"><h2>工作簿操作记录</h2><p>{storedIntent.intent.data.kind==='restore'?'历史恢复':storedIntent.intent.data.kind==='import'?'XLSX 导入':'新建工作簿'} · {storedIntent.intent.phase==='prepared'?'已保留，尚未发送':storedIntent.intent.phase==='awaiting-receipt'?'原请求结果或导入进度待核实':storedIntent.intent.resolution==='rejected'?'原请求明确被拒绝':'原操作已确认'}。刷新后仍使用同一操作 ID 和原内容，不自动重试。</p><p>操作 ID：{storedIntent.intent.data.operationId}</p>{storedIntent.intent.data.kind==='import'&&<p>原文件：{storedIntent.intent.data.sourceFileName} · 已确认图片位置 {storedIntent.intent.data.imageIndex} / {storedIntent.intent.data.imageOperations.length}。原 XLSX 保留，导入完成只形成未提交草稿。</p>}
      {storedIntent.intent.phase!=='confirmed'?<button disabled={busy||!!pendingImport.current} onClick={()=>void run(()=>resumeIntent(),true)}>{storedIntent.intent.phase==='prepared'?'明确继续原操作':'核实并恢复原请求'}</button>:storedIntent.intent.resolution==='succeeded'?<button disabled={busy} onClick={()=>void run(()=>resumeIntent(),true)}>{storedIntent.intent.data.kind==='import'?'打开已保留的导入草稿':'重新读取已确认结果'}</button>:null}
      {storedIntent.intent.data.kind==='import'&&<button disabled={busy} onClick={()=>{if(storedIntent.intent.data.kind==='import')downloadWorkbook(storedIntent.intent.data.sourceBytes,storedIntent.intent.data.sourceFileName);}}>下载保留的原 XLSX</button>}
      {storedIntent.intent.phase==='prepared'&&<button disabled={busy} onClick={()=>void endIntent(true)}>取消尚未发送的操作</button>}{storedIntent.intent.phase==='confirmed'&&<button disabled={busy} onClick={()=>void endIntent()}>结束此记录，允许新的操作</button>}
    </div>}
    {active&&canEdit&&<div className="fw-status" role="status">{cloudBusy?'正在保存服务器草稿':cloudStatus||'正在检查服务器草稿'}{cloud.current?.uncertain&&<button disabled={busy||cloudBusy} onClick={()=>void run(()=>retryCloud())}>核实服务器草稿</button>}{!cloudReady&&!cloudBusy&&<button disabled={busy} onClick={()=>void loadCloud(active.id,draftGeneration.current,active.revision)}>读取服务器草稿</button>}</div>}
    {cloudRecovery?.draft&&<div className="fw-dialog" role="dialog" aria-label="服务器草稿"><h2>服务器上有未提交草稿</h2><p>草稿基于正式版本 {cloudRecovery.draft.baseWorkbookRevision}，保存于 {new Date(cloudRecovery.draft.updatedAt).toLocaleString()}。恢复不会自动覆盖正式版本；未确认的单元格输入只在原浏览器保留。</p><button disabled={busy||cloudBusy} onClick={()=>void recoverCloud()}>恢复服务器草稿</button>{localDraft.current&&<button disabled={busy||cloudBusy} onClick={()=>adoptCloudForLocal()}>用当前本机内容更新这份草稿</button>}<button disabled={busy||cloudBusy} onClick={()=>{setCloudRecovery(null);setCloudReady(false);setCloudStatus('服务器原草稿保留，自动保存暂未启用');}}>保留原草稿，继续查看</button></div>}
    {imageFailures>0&&<div className="fw-error" role="alert">{imageFailures} 张图片读取失败，位置和资源引用仍保留。<button disabled={busy||uploading>0||!ready} onClick={()=>void run(async()=>{const isCurrent=captureScope(),remaining=await runtime.current!.retryImages();if(isCurrent())setStatus(remaining?'仍有图片无法读取，可稍后再次重试':'图片已重新读取；保存状态未改变');})}>重试失败图片</button></div>}
    {error&&<div className="fw-error" role="alert">{error}{!active&&<button disabled={loading||busy} onClick={()=>setLoadEpoch(value=>value+1)}>重试读取工作簿</button>}</div>}
    {candidate&&<div className="fw-dialog" role="dialog" aria-label="导入工作簿"><h2>{candidate.fileName}</h2><p>{candidate.snapshot.sheetOrder.length} 张工作表 · {candidate.images.length} 张图片</p><p>导入为新的工作簿副本。原文件保持不变，保存后写入服务器。</p>{candidate.warnings.map(w=><p key={w} className="fw-error">{w}</p>)}<button disabled={busy} className="fw-primary" onClick={()=>void acceptImport()}>确认导入副本</button><button disabled={busy||!!storedIntent} onClick={()=>{candidateSource.current=null;setCandidate(null);}}>取消</button></div>}
    {history&&<div className="fw-dialog" role="dialog" aria-label="工作簿版本"><h2>版本恢复</h2><select aria-label="历史版本" disabled={busy||!!restoreConfirmation} value={selectedRevision} onChange={event=>setSelectedRevision(event.target.value)}><option value="">选择历史版本</option>{history.map(item=><option key={item.revision} value={item.revision}>版本 {item.revision} · {new Date(item.createdAt).toLocaleString()}</option>)}</select><button disabled={!canEdit||busy||!selectedRevision||!intentReady||!!storedIntent||!!restoreConfirmation} onClick={requestRestore}>恢复为新版本</button>{restoreConfirmation&&<section aria-label="确认历史恢复"><p>将历史版本 {restoreConfirmation.target} 恢复为新版本。当前服务器版本 {restoreConfirmation.expected} 和旧历史继续保留；恢复不会覆盖历史记录。</p><button disabled={!canEdit||busy||!intentReady||!!storedIntent} onClick={()=>void restore()}>确认恢复历史版本</button><button disabled={busy} onClick={()=>setRestoreConfirmation(null)}>取消本次恢复</button></section>}{before&&<button disabled={busy||!!restoreConfirmation} onClick={()=>void showHistory(true)}>更早版本</button>}<button disabled={busy} onClick={()=>{setRestoreConfirmation(null);setHistory(null);}}>关闭</button></div>}
    {pendingImport.current&&ready&&<div className="fw-import-progress"><span>重建图片 {pendingImport.current.index} / {pendingImport.current.data.images.length} · 原件与操作 ID 已保留</span><button disabled={busy} onClick={()=>void importImages()}>继续导入并保留完整草稿</button></div>}
    {recoverable.length>0&&<div className="fw-dialog" role="dialog" aria-label="恢复本机草稿"><h2>发现未提交的本机草稿</h2><p>服务器版本 {active?.revision} 已读取。恢复只打开草稿，不会覆盖服务器；结果未知的保存将沿用原请求核实。</p>{recoverable.map(draft=><div key={draft.editorId}><span>{new Date(draft.savedAt).toLocaleString()} · 基于版本 {draft.baseRevision}{draft.pending?' · 保存结果待确认':''}{draft.edit?' · 包含尚未确认的单元格输入':''}</span><button disabled={busy} onClick={()=>void recoverDraft(draft)}>恢复这份草稿</button><button disabled={busy} onClick={()=>downloadDraft(draft)}>下载草稿恢复副本</button><button disabled={busy} onClick={()=>void discardDraft(draft)}>放弃这份草稿</button></div>)}<button disabled={busy} onClick={()=>setRecoverable([])}>暂不恢复，查看服务器版本</button></div>}
    {recoveryFailed&&localDraft.current&&<div className="fw-dialog" role="alert"><p>未确认输入尚未完整恢复，编辑已暂停。原稿仍在本机，可重试或下载含文字、格式及原请求的完整恢复副本。</p><button disabled={busy} onClick={()=>{if(active&&localDraft.current)mount(active,true,localDraft.current);}}>重新尝试恢复输入</button><button disabled={busy} onClick={()=>localDraft.current&&downloadDraft(localDraft.current)}>下载草稿恢复副本</button></div>}
    {active&&!draftReady&&<div role="status">正在检查本机草稿</div>}
    {active&&draftReady&&!recoverable.length?<div inert={recoveryFailed||structureBusy||Boolean(pendingImport.current)}><WorkbookCanvas key={`${active.id}:${epoch}`} snapshot={active.snapshot} editingDraft={editingDraft} runtime={runtime} onChanged={changed} onRecoveryError={message=>{setRecoveryFailed(true);setReady(false);setError(message);}} onError={setError} onUploading={setUploading} onImageFailures={setImageFailures} onReady={()=>{if(activeId.current===active.id)setReady(true);}}/></div>:!active&&!loading&&!error&&<div className="fw-empty"><h2>开始编辑颜色工作簿</h2><p>新建工作簿，或导入 XLSX 副本。</p></div>}
    <details className="fw-capabilities"><summary>支持范围与保存规则</summary><p>支持多工作表、增删行列、复制粘贴、撤销重做、文字与数字、字体/颜色/对齐/边框、合并、行高列宽、基础公式、排序/筛选、冻结及 PNG/JPEG 图片与工作表平铺背景。保存整个工作簿，冲突时保留本地输入；图片移除后原始资产保留用于恢复。</p><p>最多 32 张工作表、每表 10000 行/256 列、200000 个有内容单元格、50 张图片。导入/导出 XLSX 上限 5 MiB，完整快照上限 7 MiB。宏、外链、复杂绘图和未支持公式拒绝导入；筛选范围可保留，筛选条件、条件格式、验证、图表、批注等不支持对象须明确确认转换。Office 与系统输入法的实际兼容性以验收记录为准。</p><p>工作簿排版与行号不会自动修改业务颜色记录。点击“应用到业务”可选择工作表、表头、区域与字段，先预览再明确应用。已有记录须映射稳定 ID 和版本；人员、检验与产量新增沿正式命令创建，不把行号当身份。新增业务颜色通过项目建项，项目继续读取结构化颜色资料。</p></details>
  </div>{mappingOpen&&active&&ownerId&&<BusinessMappingPanel key={`${ownerId}:${active.id}`} actorId={ownerId} getSource={mappingSource} onClose={()=>setMappingOpen(false)} onApplied={receipts=>{setMappingStatus(`业务应用已确认 ${receipts.length} 条记录；工作簿保存状态独立`);}}/>}</section>;
}
