'use client';
import Link from 'next/link';
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
import { validateLocalDraft, claimLocalDraft, readLocalDrafts, writeLocalDraft, removeLocalDraft, type WorkbookLocalDraft } from './draft-store';
import { createWorkbook, listRevisions, listWorkbooks, readWorkbook, restoreWorkbook, saveWorkbook, type SavedWorkbook, type WorkbookMeta, type WorkbookRevision } from './client';
import type { WorkbookImport } from './xlsx';
import './workbook.css';
const message=(cause:unknown)=>cause instanceof Error?cause.message:'操作失败，内容仍保留。';
export function FreeWorkbookWorkspace(){
  const {user}=useAuth(),canEdit=isApprovedTeamUser(user);const runtime=useRef<WorkbookRuntime|null>(null),session=useRef<WorkbookSaveSession|null>(null),sequence=useRef(0),confirmed=useRef(0);
  const [items,setItems]=useState<WorkbookMeta[]>([]),[after,setAfter]=useState<string|null>(null),[active,setActive]=useState<SavedWorkbook|null>(null),[epoch,setEpoch]=useState(0),[ready,setReady]=useState(false);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(0),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[title,setTitle]=useState('新工作簿');
  const [candidate,setCandidate]=useState<WorkbookImport|null>(null),[history,setHistory]=useState<WorkbookRevision[]|null>(null),[before,setBefore]=useState<number|null>(null),[selectedRevision,setSelectedRevision]=useState('');
  const pendingImport=useRef<{data:WorkbookImport;index:number;operations:string[];assets:Map<string,string>}|null>(null),createPending=useRef<{snapshot:SavedWorkbook['snapshot'];operationId:string}|null>(null),restorePending=useRef<{id:string;revision:number;expected:number;operationId:string}|null>(null);
  const picker=useRef<HTMLInputElement>(null),imagePicker=useRef<HTMLInputElement>(null);const busyRef=useRef(false),mounted=useRef(true),readController=useRef<AbortController|null>(null),activeId=useRef<string|null>(null);
  const requestedId=useSearchParams().get('workbook');
  const navigationRead=useRef<{requested:string|null;controller:AbortController}|null>(null),handledLoadEpoch=useRef(0);
  const cloudLoadVersion=useRef(0),cloud=useRef<ServerDraftSession|null>(null),cloudSending=useRef(false);
  const [cloudReady,setCloudReady]=useState(false),[cloudBusy,setCloudBusy]=useState(false),[cloudStatus,setCloudStatus]=useState(''),[cloudRecovery,setCloudRecovery]=useState<ServerDraftRead|null>(null);
  const [recoveryFailed,setRecoveryFailed]=useState(false);
  const [editingDraft,setEditingDraft]=useState<WorkbookEditingDraft|null>(null);
  const [loadEpoch,setLoadEpoch]=useState(0);
  const [draftTick,setDraftTick]=useState(0),[draftStatus,setDraftStatus]=useState(''),[draftReady,setDraftReady]=useState(true),[recoverable,setRecoverable]=useState<WorkbookLocalDraft[]>([]);
  const draftWriteVersion=useRef(0),draftGeneration=useRef(0),editorId=useRef(''),localDraft=useRef<WorkbookLocalDraft|null>(null),loadedOwner=useRef<string|null|undefined>(undefined);
  const ownerId=canEdit?user.id:null;
  const currentOwner=useRef(ownerId);currentOwner.current=ownerId;
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
  useProjectUnsavedChanges(dirty||busy||uploading>0||Boolean(candidate));
  async function refreshList(more=false){const isCurrent=captureScope();const result=await listWorkbooks(more?after??undefined:undefined,readController.current?.signal);if(!isCurrent())return;setItems(previous=>{const selected=previous.find(item=>item.id===activeId.current);const retained=more?previous:selected?[selected]:[];return [...new Map([...retained,...result.items].map(item=>[item.id,item] as const)).values()];});setAfter(result.nextCursor);}
  function mount(value:SavedWorkbook,isDirty=false,recovered?:WorkbookLocalDraft,recoveredCloud?:ServerDraftSession){
    if(!mounted.current||currentOwner.current!==ownerId)return;
    const {id,name,revision,snapshotHash,updatedAt}=value;activeId.current=id;setLoading(false);setError('');
    setItems(previous=>previous.some(item=>item.id===id)?previous:[{id,name,revision,snapshotHash,updatedAt},...previous]);
    const url=new URL(window.location.href);url.searchParams.set('workbook',id);historyReplace(url);setReady(false);setActive(value);
    session.current=new WorkbookSaveSession(recovered?.baseRevision??value.revision,recovered?.pending??null);
    sequence.current=recovered?.sequence??(isDirty?1:0);confirmed.current=0;setDirty(isDirty||Boolean(recovered));setEpoch(n=>n+1);setHistory(null);setRecoveryFailed(false);setEditingDraft(recovered?.edit??null);
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
    if(identityChanged){pendingImport.current=null;createPending.current=null;restorePending.current=null;setUploading(0);}
    setActive(null);setReady(false);setDirty(false);setCandidate(null);setHistory(null);setStatus('');setLoading(true);setError('');draftGeneration.current++;cloud.current=null;setCloudReady(false);setCloudRecovery(null);setCloudStatus('');localDraft.current=null;setRecoverable([]);setDraftStatus('');
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
    if(uploading||pendingImport.current||session.current?.uncertain||cloud.current?.uncertain||createPending.current||restorePending.current)throw new Error('请先完成图片操作并核实原保存请求，再恢复服务器草稿。');
    if((dirty||localDraft.current)&&!window.confirm('当前本机最新内容将先保留；打开服务器草稿？'))return;
    const isCurrent=captureScope();if(sequence.current>0){const captured=await captureLatestDraft(isCurrent,true);if(!isCurrent())return;if(!captured||captured.sequence!==sequence.current)throw new Error('保留期间又有新输入，请完成输入后重试恢复。');}
    const beforeRestore=sequence.current,coordinator=new ServerDraftSession({workbookId:active.id,authorUserId:ownerId,baseWorkbookRevision:draft.baseWorkbookRevision,draft:cloudMeta(draft),acknowledgedSequence:1});coordinator.capture(draft.snapshot,1);
    const local:WorkbookLocalDraft={schema:1,ownerId,workbookId:active.id,editorId:crypto.randomUUID(),baseRevision:draft.baseWorkbookRevision,sequence:1,savedAt:Date.now(),writeVersion:1,snapshot:draft.snapshot,edit:null,pending:null,server:coordinator.checkpoint()};await writeLocalDraft(local);if(!isCurrent())return;if(sequence.current!==beforeRestore)throw new Error('保留期间又有新输入，请完成输入后重试恢复。');mount({...active,snapshot:draft.snapshot},true,local,coordinator);
    if(active.revision!==draft.baseWorkbookRevision)setError('服务器草稿基于旧正式版本，本机内容保留；正式保存仍需处理版本冲突。');
  });}
  function cloudMeta(draft:NonNullable<ServerDraftRead['draft']>){return {id:draft.id,draftRevision:draft.draftRevision,baseWorkbookRevision:draft.baseWorkbookRevision,snapshotHash:draft.snapshotHash,snapshotBytes:draft.snapshotBytes,updatedAt:draft.updatedAt};}
  function adoptCloudForLocal(){const draft=cloudRecovery?.draft;if(!draft||!active||!ownerId||!localDraft.current)return;cloud.current=new ServerDraftSession({workbookId:active.id,authorUserId:ownerId,baseWorkbookRevision:session.current!.revision,draft:cloudMeta(draft)});setCloudRecovery(null);setCloudReady(true);setCloudStatus('已选择以当前本机内容更新服务器草稿');setDraftTick(n=>n+1);}
  async function run(action:()=>Promise<void>){if(busyRef.current)return;const isCurrent=captureScope();busyRef.current=true;setBusy(true);setError('');try{await action();}catch(cause){if(isCurrent())setError(message(cause));}finally{busyRef.current=false;if(mounted.current)setBusy(false);}}
  function canLeave(){if(busyRef.current||uploading>0){setError('当前操作尚未结束，请等待完成后再切换工作簿。');return false;}if(session.current?.uncertain||createPending.current||restorePending.current){setError('上次操作结果尚未确认，请先重试核实原请求。');return false;}if(pendingImport.current){setError('图片导入尚未完成，请继续导入或重新打开原文件。');return false;}return !(dirty||candidate)||window.confirm(localDraft.current?.sequence===sequence.current?'保留本机草稿并打开另一工作簿？':'当前最新内容尚未保存到本机草稿，继续打开另一工作簿会丢失这些内容。是否继续？');}
  function open(id:string){replaceWorkbookUrl(id);setLoadEpoch(value=>value+1);}
  function replaceWorkbookUrl(id:string|null){const url=new URL(window.location.href);if(id===null)url.searchParams.delete('workbook');else url.searchParams.set('workbook',id);historyReplace(url);}
  function historyReplace(url:URL){window.history.replaceState(window.history.state,'',url);}
  async function create(){if(!createPending.current&&!canLeave())return;await run(async()=>{const isCurrent=captureScope();const request=createPending.current??{snapshot:blankWorkbook(crypto.randomUUID(),title.trim()||'新工作簿'),operationId:crypto.randomUUID()};createPending.current=request;try{const result=await createWorkbook(request.snapshot,request.operationId);if(!isCurrent())return;createPending.current=null;mount({...result,snapshot:request.snapshot});await refreshList();}catch(cause){if(!isCurrent())return;if(cause instanceof ApiRequestError&&[400,409,422].includes(cause.status))createPending.current=null;setDirty(true);throw cause;}});}
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

  async function importFile(file:File){if(!canLeave())return;await run(async()=>{const isCurrent=captureScope();if(file.size>5*1024*1024)throw new Error('XLSX 文件不能超过 5 MiB。');const {readFreeWorkbook}=await import('./xlsx');const preview=await readFreeWorkbook(new Uint8Array(await file.arrayBuffer()),file.name,crypto.randomUUID());if(isCurrent())setCandidate(preview);});}
  async function acceptImport(){const data=candidate;if(!data)return;await run(async()=>{const isCurrent=captureScope();const blank=blankWorkbook(data.snapshot.id,data.snapshot.name);const request=createPending.current??{snapshot:blank,operationId:crypto.randomUUID()};createPending.current=request;const result=await createWorkbook(request.snapshot,request.operationId);if(!isCurrent())return;createPending.current=null;pendingImport.current={data,index:0,operations:data.images.map(()=>crypto.randomUUID()),assets:new Map()};setCandidate(null);mount({...result,snapshot:data.snapshot},true);await refreshList();setStatus(data.images.length?'工作表已读入，图片待导入':'导入副本待保存');if(!data.images.length)pendingImport.current=null;});}
  async function importImages(){await run(async()=>{const isCurrent=captureScope();const pending=pendingImport.current;if(!pending||!runtime.current||!active)return;for(;pending.index<pending.data.images.length;pending.index++){const image=pending.data.images[pending.index]!;let assetId=pending.assets.get(String(image.sourceMediaId));if(!assetId){const file=new File([new Uint8Array(image.bytes)],`图片-${pending.index+1}.${image.mime==='image/png'?'png':'jpg'}`,{type:image.mime});const asset=await uploadSheetImage(file,'SHEET_WORKBOOK',active.id,defaultImageLayout(),pending.operations[pending.index]!,()=>{});if(!isCurrent())return;assetId=asset.id;pending.assets.set(String(image.sourceMediaId),assetId);}if(image.background)await runtime.current.setBackgroundAsset(image.sheetId,assetId,image.background);else await runtime.current.insertAsset(image.sheetId,assetId,image.anchor!);if(!isCurrent())return;}pendingImport.current=null;changed();setStatus('导入副本待保存');});}
  async function exportFile(){await run(async()=>{const isCurrent=captureScope();if(!active||!runtime.current||pendingImport.current||uploading)throw new Error('请先完成图片导入。');const snapshot=await runtime.current.snapshot(),assets=await listSheetImages('SHEET_WORKBOOK',[active.id]);const {writeFreeWorkbook}=await import('./xlsx');const bytes=await writeFreeWorkbook(snapshot,assets);if(!isCurrent())return;downloadWorkbook(bytes,`${snapshot.name}.xlsx`);setStatus('已导出当前内容；服务器保存状态未改变');});}
  async function showHistory(more=false){if(!active)return;await run(async()=>{const isCurrent=captureScope();const result=await listRevisions(active.id,more?before??undefined:undefined,readController.current?.signal);if(!isCurrent())return;setHistory(previous=>more?[...previous??[],...result.items]:result.items);setBefore(result.nextBefore);});}
  async function restore(){if(!active||!selectedRevision&&!restorePending.current)return;if(!restorePending.current&&!canLeave())return;if(!restorePending.current&&!window.confirm('将此历史版本恢复为新版本？当前服务器版本保留在历史中。'))return;await run(async()=>{const isCurrent=captureScope();const pending=restorePending.current??{id:active.id,revision:Number(selectedRevision),expected:active.revision,operationId:crypto.randomUUID()};restorePending.current=pending;try{await restoreWorkbook(pending.id,pending.expected,pending.revision,pending.operationId);if(!isCurrent())return;const restored=await readWorkbook(pending.id,readController.current?.signal);if(!isCurrent())return;restorePending.current=null;mount(restored);await refreshList();setStatus('历史版本已恢复为新版本');}catch(cause){if(!isCurrent())return;if(cause instanceof ApiRequestError&&[400,409,422].includes(cause.status))restorePending.current=null;setDirty(true);throw cause;}});}
  return <section className="fw-workspace">
    <header className="fw-heading"><div><h1>颜色工作簿</h1><span className="fw-kind">自由编辑</span></div><Link href="/admin/color-database?view=records" className="fw-link">业务颜色记录</Link></header>
    <div className="fw-toolbar">
      <label>工作簿<select aria-label="选择工作簿" value={active?.id??''} disabled={loading||busy||uploading>0} onChange={event=>void open(event.target.value)}><option value="" disabled>选择工作簿</option>{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{after&&<button disabled={busy} onClick={()=>void run(()=>refreshList(true))}>更多</button>}
      <input aria-label="新工作簿名" value={title} maxLength={200} onChange={event=>setTitle(event.target.value)}/><button disabled={!canEdit||busy||loading} onClick={()=>void create()}>{createPending.current?'重试创建':'新建'}</button>
      <button disabled={!canEdit||busy||loading||uploading>0} onClick={()=>picker.current?.click()}>导入 XLSX</button>
      <button disabled={!ready||busy||uploading>0||!canEdit} onClick={()=>imagePicker.current?.click()}>图片</button>
      <button className="fw-primary" disabled={!ready||busy||cloudBusy||uploading>0||Boolean(pendingImport.current)||!canEdit} onClick={()=>void save()}>{session.current?.uncertain?'核实并保存':'保存'}</button>
      <button disabled={!ready||busy||uploading>0} onClick={()=>void exportFile()}>导出 XLSX</button><button disabled={!active||busy} onClick={()=>void showHistory()}>版本恢复</button>
      <button disabled={!active||busy||uploading>0} onClick={()=>active&&void open(active.id)}>重新读取</button>
      <input ref={picker} type="file" accept=".xlsx" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void importFile(file);}}/>
      <input ref={imagePicker} type="file" accept="image/png,image/jpeg" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void run(async()=>{await runtime.current?.insertImage(file);});}}/>
    </div>
    <div className="fw-status" role="status">{loading?'正在读取工作簿':busy?'处理中':uploading?'图片正在扫描':status||'请选择或新建工作簿'}{dirty&&!busy&&<strong> · 有未保存内容</strong>}{draftStatus&&<span className="fw-draft-status"> · {draftStatus}</span>}</div>
    {active&&canEdit&&<div className="fw-status" role="status">{cloudBusy?'正在保存服务器草稿':cloudStatus||'正在检查服务器草稿'}{cloud.current?.uncertain&&<button disabled={busy||cloudBusy} onClick={()=>void run(()=>retryCloud())}>核实服务器草稿</button>}{!cloudReady&&!cloudBusy&&<button disabled={busy} onClick={()=>void loadCloud(active.id,draftGeneration.current,active.revision)}>读取服务器草稿</button>}</div>}
    {cloudRecovery?.draft&&<div className="fw-dialog" role="dialog" aria-label="服务器草稿"><h2>服务器上有未提交草稿</h2><p>草稿基于正式版本 {cloudRecovery.draft.baseWorkbookRevision}，保存于 {new Date(cloudRecovery.draft.updatedAt).toLocaleString()}。恢复不会自动覆盖正式版本；未确认的单元格输入只在原浏览器保留。</p><button disabled={busy||cloudBusy} onClick={()=>void recoverCloud()}>恢复服务器草稿</button>{localDraft.current&&<button disabled={busy||cloudBusy} onClick={()=>adoptCloudForLocal()}>用当前本机内容更新这份草稿</button>}<button disabled={busy||cloudBusy} onClick={()=>{setCloudRecovery(null);setCloudReady(false);setCloudStatus('服务器原草稿保留，自动保存暂未启用');}}>保留原草稿，继续查看</button></div>}
    {error&&<div className="fw-error" role="alert">{error}{!active&&<button disabled={loading||busy} onClick={()=>setLoadEpoch(value=>value+1)}>重试读取工作簿</button>}</div>}
    {candidate&&<div className="fw-dialog" role="dialog" aria-label="导入工作簿"><h2>{candidate.fileName}</h2><p>{candidate.snapshot.sheetOrder.length} 张工作表 · {candidate.images.length} 张图片</p><p>导入为新的工作簿副本。原文件保持不变，保存后写入服务器。</p>{candidate.warnings.map(w=><p key={w} className="fw-error">{w}</p>)}<button disabled={busy} className="fw-primary" onClick={()=>void acceptImport()}>确认导入副本</button><button disabled={busy||Boolean(createPending.current)} onClick={()=>setCandidate(null)}>取消</button></div>}
    {history&&<div className="fw-dialog" role="dialog" aria-label="工作簿版本"><h2>版本恢复</h2><select aria-label="历史版本" value={selectedRevision} onChange={event=>setSelectedRevision(event.target.value)}><option value="">选择历史版本</option>{history.map(item=><option key={item.revision} value={item.revision}>版本 {item.revision} · {new Date(item.createdAt).toLocaleString()}</option>)}</select><button disabled={!canEdit||busy||!selectedRevision} onClick={()=>void restore()}>{restorePending.current?'核实恢复结果':'恢复为新版本'}</button>{before&&<button onClick={()=>void showHistory(true)}>更早版本</button>}<button disabled={busy||Boolean(restorePending.current)} onClick={()=>setHistory(null)}>关闭</button></div>}
    {pendingImport.current&&ready&&<div className="fw-import-progress"><span>图片 {pendingImport.current.index} / {pendingImport.current.data.images.length}</span><button disabled={busy} onClick={()=>void importImages()}>继续导入图片</button><button disabled={busy} onClick={()=>{if(active&&window.confirm('放弃本次未保存的导入内容？原 XLSX 文件不受影响。'))void run(async()=>{const value=await readWorkbook(active.id,readController.current?.signal);pendingImport.current=null;mount(value);});}}>取消导入</button></div>}
    {recoverable.length>0&&<div className="fw-dialog" role="dialog" aria-label="恢复本机草稿"><h2>发现未提交的本机草稿</h2><p>服务器版本 {active?.revision} 已读取。恢复只打开草稿，不会覆盖服务器；结果未知的保存将沿用原请求核实。</p>{recoverable.map(draft=><div key={draft.editorId}><span>{new Date(draft.savedAt).toLocaleString()} · 基于版本 {draft.baseRevision}{draft.pending?' · 保存结果待确认':''}{draft.edit?' · 包含尚未确认的单元格输入':''}</span><button disabled={busy} onClick={()=>void recoverDraft(draft)}>恢复这份草稿</button><button disabled={busy} onClick={()=>downloadDraft(draft)}>下载草稿恢复副本</button><button disabled={busy} onClick={()=>void discardDraft(draft)}>放弃这份草稿</button></div>)}<button disabled={busy} onClick={()=>setRecoverable([])}>暂不恢复，查看服务器版本</button></div>}
    {recoveryFailed&&localDraft.current&&<div className="fw-dialog" role="alert"><p>未确认输入尚未完整恢复，编辑已暂停。原稿仍在本机，可重试或下载含文字、格式及原请求的完整恢复副本。</p><button disabled={busy} onClick={()=>{if(active&&localDraft.current)mount(active,true,localDraft.current);}}>重新尝试恢复输入</button><button disabled={busy} onClick={()=>localDraft.current&&downloadDraft(localDraft.current)}>下载草稿恢复副本</button></div>}
    {active&&!draftReady&&<div role="status">正在检查本机草稿</div>}
    {active&&draftReady&&!recoverable.length?<div inert={recoveryFailed}><WorkbookCanvas key={`${active.id}:${epoch}`} snapshot={active.snapshot} editingDraft={editingDraft} runtime={runtime} onChanged={changed} onRecoveryError={message=>{setRecoveryFailed(true);setReady(false);setError(message);}} onError={setError} onUploading={setUploading} onReady={()=>{if(activeId.current===active.id)setReady(true);}}/></div>:!active&&!loading&&!error&&<div className="fw-empty"><h2>开始编辑颜色工作簿</h2><p>新建工作簿，或导入 XLSX 副本。</p></div>}
    <details className="fw-capabilities"><summary>支持范围与保存规则</summary><p>支持多工作表、增删行列、复制粘贴、撤销重做、文字与数字、字体/颜色/对齐/边框、合并、行高列宽、基础公式及 PNG/JPEG 图片与工作表平铺背景。保存整个工作簿，冲突时保留本地输入；图片移除后原始资产保留用于恢复。</p><p>最多 32 张工作表、每表 10000 行/256 列、200000 个有内容单元格、50 张图片。导入/导出 XLSX 上限 5 MiB，完整快照上限 7 MiB。宏、外链、复杂绘图和未支持公式拒绝导入；筛选、条件格式、验证、图表、批注等须明确确认转换。Office 与系统输入法的实际兼容性以验收记录为准。</p><p>工作簿排版与行号不会自动修改业务颜色记录。业务记录页可预览字段映射；只有带系统记录 ID 和版本的模板可确认更新。新增业务颜色通过项目建项，项目继续读取结构化颜色资料。</p></details>
  </section>;
}
