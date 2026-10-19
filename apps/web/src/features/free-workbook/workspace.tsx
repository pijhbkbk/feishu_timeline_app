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
import type { WorkbookRuntime } from './runtime';
import { WorkbookSaveSession } from './save-session';
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
  const [loadEpoch,setLoadEpoch]=useState(0);
  useEffect(()=>{mounted.current=true;readController.current=new AbortController();return()=>{mounted.current=false;readController.current?.abort();navigationRead.current?.controller.abort();navigationRead.current=null;};},[]);
  useProjectUnsavedChanges(dirty||busy||uploading>0||Boolean(candidate));
  async function refreshList(more=false){const result=await listWorkbooks(more?after??undefined:undefined,readController.current?.signal);if(!mounted.current)return;setItems(previous=>{const selected=previous.find(item=>item.id===activeId.current);const retained=more?previous:selected?[selected]:[];return [...new Map([...retained,...result.items].map(item=>[item.id,item] as const)).values()];});setAfter(result.nextCursor);}
  function mount(value:SavedWorkbook,isDirty=false){if(!mounted.current)return;const {id,name,revision,snapshotHash,updatedAt}=value;activeId.current=id;setLoading(false);setError('');setItems(previous=>previous.some(item=>item.id===id)?previous:[{id,name,revision,snapshotHash,updatedAt},...previous]);const url=new URL(window.location.href);url.searchParams.set('workbook',id);historyReplace(url);setReady(false);setActive(value);session.current=new WorkbookSaveSession(value.revision);sequence.current=isDirty?1:0;confirmed.current=0;setDirty(isDirty);setEpoch(n=>n+1);setHistory(null);setStatus(isDirty?'待保存':`已读取版本 ${value.revision}`);}
  useEffect(()=>{
    // Next keeps this component mounted for query/back navigation. Read the live
    // URL as well, because a replaceState update can precede its React render.
    const requested=new URLSearchParams(window.location.search).get('workbook');
    const forced=handledLoadEpoch.current!==loadEpoch;handledLoadEpoch.current=loadEpoch;
    if(!forced&&((activeId.current!==null&&requested===activeId.current)||navigationRead.current?.requested===requested))return;
    if(!canLeave()){replaceWorkbookUrl(activeId.current);return;}
    navigationRead.current?.controller.abort();
    const controller=new AbortController();navigationRead.current={requested,controller};
    const current=()=>mounted.current&&!controller.signal.aborted&&navigationRead.current?.controller===controller&&new URLSearchParams(window.location.search).get('workbook')===requested;
    // Discard only after canLeave succeeds. No editable A canvas may remain
    // underneath a B URL while B is loading or after B is denied/not found.
    activeId.current=null;runtime.current=null;session.current=null;
    setActive(null);setReady(false);setDirty(false);setCandidate(null);setHistory(null);setStatus('');setLoading(true);setError('');
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
  },[requestedId,loadEpoch]);
  function changed(){if(!active||activeId.current!==active.id)return;sequence.current++;setDirty(sequence.current!==confirmed.current);setStatus(session.current?.uncertain?'保存结果待确认；新修改仍保留':'待保存');}
  async function run(action:()=>Promise<void>){if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');try{await action();}catch(cause){if(mounted.current)setError(message(cause));}finally{busyRef.current=false;if(mounted.current)setBusy(false);}}
  function canLeave(){if(busyRef.current||uploading>0){setError('当前操作尚未结束，请等待完成后再切换工作簿。');return false;}if(session.current?.uncertain||createPending.current||restorePending.current){setError('上次操作结果尚未确认，请先重试核实原请求。');return false;}if(pendingImport.current){setError('图片导入尚未完成，请继续导入或重新打开原文件。');return false;}return !(dirty||candidate)||window.confirm('放弃当前未保存内容并打开另一工作簿？');}
  function open(id:string){replaceWorkbookUrl(id);setLoadEpoch(value=>value+1);}
  function replaceWorkbookUrl(id:string|null){const url=new URL(window.location.href);if(id===null)url.searchParams.delete('workbook');else url.searchParams.set('workbook',id);historyReplace(url);}
  function historyReplace(url:URL){window.history.replaceState(window.history.state,'',url);}
  async function create(){if(!createPending.current&&!canLeave())return;await run(async()=>{const request=createPending.current??{snapshot:blankWorkbook(crypto.randomUUID(),title.trim()||'新工作簿'),operationId:crypto.randomUUID()};createPending.current=request;try{const result=await createWorkbook(request.snapshot,request.operationId);createPending.current=null;mount({...result,snapshot:request.snapshot});await refreshList();}catch(cause){if(cause instanceof ApiRequestError&&[400,409,422].includes(cause.status))createPending.current=null;setDirty(true);throw cause;}});}
  async function save(){await run(async()=>{if(!active||!runtime.current||!session.current||uploading||pendingImport.current)throw new Error('请等待图片和工作簿加载完成。');const coordinator=session.current;const pending=coordinator.existing();const snapshot=pending?.snapshot??await runtime.current.snapshot();const payload=pending??coordinator.request(snapshot,sequence.current);setStatus('正在保存');try{const ack=await saveWorkbook(active.id,payload);confirmed.current=coordinator.confirm(ack.revision);setActive(value=>value?{...value,...ack}:value);const changedSince=sequence.current!==confirmed.current;setDirty(changedSince);setStatus(changedSince?`版本 ${ack.revision} 已保存，仍有新修改`:`已保存 · 版本 ${ack.revision}`);await refreshList();}catch(cause){coordinator.reject(cause instanceof ApiRequestError?cause.status:undefined);setDirty(true);setStatus(coordinator.uncertain?'保存结果未知，请重试核实原请求':'未保存');throw cause;}});}
  async function importFile(file:File){if(!canLeave())return;await run(async()=>{if(file.size>5*1024*1024)throw new Error('XLSX 文件不能超过 5 MiB。');const {readFreeWorkbook}=await import('./xlsx');const preview=await readFreeWorkbook(new Uint8Array(await file.arrayBuffer()),file.name,crypto.randomUUID());setCandidate(preview);});}
  async function acceptImport(){const data=candidate;if(!data)return;await run(async()=>{const blank=blankWorkbook(data.snapshot.id,data.snapshot.name);const request=createPending.current??{snapshot:blank,operationId:crypto.randomUUID()};createPending.current=request;const result=await createWorkbook(request.snapshot,request.operationId);createPending.current=null;pendingImport.current={data,index:0,operations:data.images.map(()=>crypto.randomUUID()),assets:new Map()};setCandidate(null);mount({...result,snapshot:data.snapshot},true);await refreshList();setStatus(data.images.length?'工作表已读入，图片待导入':'导入副本待保存');if(!data.images.length)pendingImport.current=null;});}
  async function importImages(){await run(async()=>{const pending=pendingImport.current;if(!pending||!runtime.current||!active)return;for(;pending.index<pending.data.images.length;pending.index++){const image=pending.data.images[pending.index]!;let assetId=pending.assets.get(String(image.sourceMediaId));if(!assetId){const file=new File([new Uint8Array(image.bytes)],`图片-${pending.index+1}.${image.mime==='image/png'?'png':'jpg'}`,{type:image.mime});const asset=await uploadSheetImage(file,'SHEET_WORKBOOK',active.id,defaultImageLayout(),pending.operations[pending.index]!,()=>{});assetId=asset.id;pending.assets.set(String(image.sourceMediaId),assetId);}if(image.background)await runtime.current.setBackgroundAsset(image.sheetId,assetId,image.background);else await runtime.current.insertAsset(image.sheetId,assetId,image.anchor!);}pendingImport.current=null;changed();setStatus('导入副本待保存');});}
  async function exportFile(){await run(async()=>{if(!active||!runtime.current||pendingImport.current||uploading)throw new Error('请先完成图片导入。');const snapshot=await runtime.current.snapshot(),assets=await listSheetImages('SHEET_WORKBOOK',[active.id]);const {writeFreeWorkbook}=await import('./xlsx');downloadWorkbook(await writeFreeWorkbook(snapshot,assets),`${snapshot.name}.xlsx`);setStatus('已导出当前内容；服务器保存状态未改变');});}
  async function showHistory(more=false){if(!active)return;await run(async()=>{const result=await listRevisions(active.id,more?before??undefined:undefined,readController.current?.signal);if(!mounted.current)return;setHistory(previous=>more?[...previous??[],...result.items]:result.items);setBefore(result.nextBefore);});}
  async function restore(){if(!active||!selectedRevision&&!restorePending.current)return;if(!restorePending.current&&!canLeave())return;if(!restorePending.current&&!window.confirm('将此历史版本恢复为新版本？当前服务器版本保留在历史中。'))return;await run(async()=>{const pending=restorePending.current??{id:active.id,revision:Number(selectedRevision),expected:active.revision,operationId:crypto.randomUUID()};restorePending.current=pending;try{await restoreWorkbook(pending.id,pending.expected,pending.revision,pending.operationId);restorePending.current=null;mount(await readWorkbook(pending.id,readController.current?.signal));await refreshList();setStatus('历史版本已恢复为新版本');}catch(cause){if(cause instanceof ApiRequestError&&[400,409,422].includes(cause.status))restorePending.current=null;setDirty(true);throw cause;}});}
  return <section className="fw-workspace">
    <header className="fw-heading"><div><h1>颜色工作簿</h1><span className="fw-kind">自由编辑</span></div><Link href="/admin/color-database?view=records" className="fw-link">业务颜色记录</Link></header>
    <div className="fw-toolbar">
      <label>工作簿<select aria-label="选择工作簿" value={active?.id??''} disabled={loading||busy||uploading>0} onChange={event=>void open(event.target.value)}><option value="" disabled>选择工作簿</option>{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{after&&<button disabled={busy} onClick={()=>void run(()=>refreshList(true))}>更多</button>}
      <input aria-label="新工作簿名" value={title} maxLength={200} onChange={event=>setTitle(event.target.value)}/><button disabled={!canEdit||busy||loading} onClick={()=>void create()}>{createPending.current?'重试创建':'新建'}</button>
      <button disabled={!canEdit||busy||loading||uploading>0} onClick={()=>picker.current?.click()}>导入 XLSX</button>
      <button disabled={!ready||busy||uploading>0||!canEdit} onClick={()=>imagePicker.current?.click()}>图片</button>
      <button className="fw-primary" disabled={!ready||busy||uploading>0||Boolean(pendingImport.current)||!canEdit} onClick={()=>void save()}>{session.current?.uncertain?'核实并保存':'保存'}</button>
      <button disabled={!ready||busy||uploading>0} onClick={()=>void exportFile()}>导出 XLSX</button><button disabled={!active||busy} onClick={()=>void showHistory()}>版本恢复</button>
      <button disabled={!active||busy||uploading>0} onClick={()=>active&&void open(active.id)}>重新读取</button>
      <input ref={picker} type="file" accept=".xlsx" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void importFile(file);}}/>
      <input ref={imagePicker} type="file" accept="image/png,image/jpeg" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void run(async()=>{await runtime.current?.insertImage(file);});}}/>
    </div>
    <div className="fw-status" role="status">{loading?'正在读取工作簿':busy?'处理中':uploading?'图片正在扫描':status||'请选择或新建工作簿'}{dirty&&!busy&&<strong> · 有未保存内容</strong>}</div>
    {error&&<div className="fw-error" role="alert">{error}{!active&&<button disabled={loading||busy} onClick={()=>setLoadEpoch(value=>value+1)}>重试读取工作簿</button>}</div>}
    {candidate&&<div className="fw-dialog" role="dialog" aria-label="导入工作簿"><h2>{candidate.fileName}</h2><p>{candidate.snapshot.sheetOrder.length} 张工作表 · {candidate.images.length} 张图片</p><p>导入为新的工作簿副本。原文件保持不变，保存后写入服务器。</p>{candidate.warnings.map(w=><p key={w} className="fw-error">{w}</p>)}<button disabled={busy} className="fw-primary" onClick={()=>void acceptImport()}>确认导入副本</button><button disabled={busy||Boolean(createPending.current)} onClick={()=>setCandidate(null)}>取消</button></div>}
    {history&&<div className="fw-dialog" role="dialog" aria-label="工作簿版本"><h2>版本恢复</h2><select aria-label="历史版本" value={selectedRevision} onChange={event=>setSelectedRevision(event.target.value)}><option value="">选择历史版本</option>{history.map(item=><option key={item.revision} value={item.revision}>版本 {item.revision} · {new Date(item.createdAt).toLocaleString()}</option>)}</select><button disabled={!canEdit||busy||!selectedRevision} onClick={()=>void restore()}>{restorePending.current?'核实恢复结果':'恢复为新版本'}</button>{before&&<button onClick={()=>void showHistory(true)}>更早版本</button>}<button disabled={busy||Boolean(restorePending.current)} onClick={()=>setHistory(null)}>关闭</button></div>}
    {pendingImport.current&&ready&&<div className="fw-import-progress"><span>图片 {pendingImport.current.index} / {pendingImport.current.data.images.length}</span><button disabled={busy} onClick={()=>void importImages()}>继续导入图片</button><button disabled={busy} onClick={()=>{if(active&&window.confirm('放弃本次未保存的导入内容？原 XLSX 文件不受影响。'))void run(async()=>{const value=await readWorkbook(active.id,readController.current?.signal);pendingImport.current=null;mount(value);});}}>取消导入</button></div>}
    {active?<WorkbookCanvas key={`${active.id}:${epoch}`} snapshot={active.snapshot} runtime={runtime} onChanged={changed} onError={setError} onUploading={setUploading} onReady={()=>{if(activeId.current===active.id)setReady(true);}}/>:!loading&&!error&&<div className="fw-empty"><h2>开始编辑颜色工作簿</h2><p>新建工作簿，或导入 XLSX 副本。</p></div>}
    <details className="fw-capabilities"><summary>支持范围与保存规则</summary><p>支持多工作表、增删行列、复制粘贴、撤销重做、文字与数字、字体/颜色/对齐/边框、合并、行高列宽、基础公式及 PNG/JPEG 图片与工作表平铺背景。保存整个工作簿，冲突时保留本地输入；图片移除后原始资产保留用于恢复。</p><p>最多 32 张工作表、每表 10000 行/256 列、200000 个有内容单元格、50 张图片。导入/导出 XLSX 上限 5 MiB，完整快照上限 7 MiB。宏、外链、复杂绘图和未支持公式拒绝导入；筛选、条件格式、验证、图表、批注等须明确确认转换。Office 与系统输入法的实际兼容性以验收记录为准。</p><p>工作簿排版与行号不会自动修改业务颜色记录。业务记录页可预览字段映射；只有带系统记录 ID 和版本的模板可确认更新。新增业务颜色通过项目建项，项目继续读取结构化颜色资料。</p></details>
  </section>;
}
