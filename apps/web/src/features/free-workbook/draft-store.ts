import type { IWorkbookData } from '@univerjs/core';
import { checkWorkbookBounds, WORKBOOK_LIMITS } from './contract';
import type { ServerDraftCheckpoint } from './server-draft-session';
import type { PendingWorkbookSave } from './save-session';
import { validateEditingDraft, type WorkbookEditingDraft } from './editing-draft';

export interface WorkbookLocalDraft {
  schema:1; ownerId:string; workbookId:string; editorId:string;
  baseRevision:number; sequence:number; savedAt:number; writeVersion?:number;
  snapshot:IWorkbookData; pending:PendingWorkbookSave|null; edit?:WorkbookEditingDraft|null; server?:ServerDraftCheckpoint|null;
}
const DATABASE='timeline-workbook-local-drafts-v1',STORE='drafts',QUOTA='quota';
const MAX_TOTAL_BYTES=128*1024*1024,MAX_SCOPE_DRAFTS=20;
const key=(value:Pick<WorkbookLocalDraft,'ownerId'|'workbookId'|'editorId'>)=>JSON.stringify([value.ownerId,value.workbookId,value.editorId]);
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
type StoredDraft=WorkbookLocalDraft&{key:string;bytes:number};

export function validateLocalDraft(raw:WorkbookLocalDraft,ownerId:string,workbookId:string){
  if(!raw||raw.schema!==1||raw.ownerId!==ownerId||raw.workbookId!==workbookId||!ownerId||ownerId.length>128||!uuid.test(workbookId)||!uuid.test(raw.editorId)||!Number.isSafeInteger(raw.baseRevision)||raw.baseRevision<1||!Number.isSafeInteger(raw.sequence)||raw.sequence<1||!Number.isFinite(raw.savedAt)||raw.savedAt<0||raw.snapshot?.id!==workbookId)throw new Error('本机草稿身份或版本无效，未替换工作簿。');
  if(raw.writeVersion!==undefined&&(!Number.isSafeInteger(raw.writeVersion)||raw.writeVersion<0))throw new Error('本机草稿写入顺序无效。');
  checkWorkbookBounds(raw.snapshot);
  if(raw.server&&(raw.server.workbookId!==workbookId||raw.server.authorUserId!==ownerId))throw new Error('服务器草稿请求的身份与本机草稿不一致。');
  if(raw.edit)validateEditingDraft(raw.edit,raw.snapshot);
  if(raw.pending){const {payload,sequence}=raw.pending;if(!payload||payload.expectedRevision!==raw.baseRevision||payload.snapshot?.id!==workbookId||!uuid.test(payload.operationId)||!Number.isSafeInteger(sequence)||sequence<1||sequence>raw.sequence)throw new Error('本机草稿的未确认请求无效。');checkWorkbookBounds(payload.snapshot);}
  const bytes=new TextEncoder().encode(JSON.stringify(raw)).length;
  if(bytes>WORKBOOK_LIMITS.bytes*4+256*1024+16384)throw new Error('本机草稿超过容量上限，内容仍在当前页面，请显式保存或导出。');
  return bytes;
}
async function openDatabase():Promise<IDBDatabase>{
  if(typeof indexedDB==='undefined')throw new Error('当前浏览器无法保存本机草稿，请显式保存并保持页面打开。');
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>{const db=request.result;const store=db.createObjectStore(STORE,{keyPath:'key'});store.createIndex('scope',['ownerId','workbookId']);db.createObjectStore(QUOTA);};
    let blocked=false;
    request.onsuccess=()=>{const db=request.result;if(blocked){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};
    request.onerror=()=>reject(new Error('本机草稿存储无法打开，请显式保存或导出。'));
    request.onblocked=()=>{blocked=true;reject(new Error('本机草稿存储被其他标签页占用，请关闭旧页面后重试。'));};
  });
}
export async function readLocalDrafts(ownerId:string,workbookId:string):Promise<WorkbookLocalDraft[]>{
  const db=await openDatabase();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly');const request=tx.objectStore(STORE).index('scope').getAll(IDBKeyRange.only([ownerId,workbookId]),MAX_SCOPE_DRAFTS+1);
    let values:WorkbookLocalDraft[]=[];
    request.onsuccess=()=>{try{if(request.result.length>MAX_SCOPE_DRAFTS)throw new Error('本机草稿数量异常，请导出当前内容并联系维护人员。');values=request.result.map((stored:StoredDraft)=>{const draft:WorkbookLocalDraft={schema:stored.schema,ownerId:stored.ownerId,workbookId:stored.workbookId,editorId:stored.editorId,baseRevision:stored.baseRevision,sequence:stored.sequence,savedAt:stored.savedAt,writeVersion:stored.writeVersion??0,snapshot:stored.snapshot,pending:stored.pending,edit:stored.edit??null,server:stored.server??null};validateLocalDraft(draft,ownerId,workbookId);return draft;}).sort((a,b)=>b.savedAt-a.savedAt);}catch(error){reject(error);}};
    tx.oncomplete=()=>resolve(values);tx.onerror=()=>reject(new Error('本机草稿读取失败，服务器工作簿未改变。'));tx.onabort=()=>reject(new Error('本机草稿读取已中断。'));
  });}finally{db.close();}
}
/** One slot per editor, so another tab cannot replace this tab's recovery copy.
 * Quota and record updates share a transaction; no old draft is auto-deleted. */
export async function writeLocalDraft(draft:WorkbookLocalDraft){
  const bytes=validateLocalDraft(draft,draft.ownerId,draft.workbookId),db=await openDatabase();
  try{return await new Promise<boolean>((resolve,reject)=>{
    const tx=db.transaction([STORE,QUOTA],'readwrite'),store=tx.objectStore(STORE),quota=tx.objectStore(QUOTA);
    const previous=store.get(key(draft)),total=quota.get('bytes'),count=store.index('scope').count(IDBKeyRange.only([draft.ownerId,draft.workbookId]));
    let failure:Error|undefined,applied=false;
    const update=()=>{
      if([previous,total,count].some(request=>request.readyState!=='done'))return;
      const old=previous.result as StoredDraft|undefined;
      if(old&&(old.baseRevision>draft.baseRevision||old.sequence>draft.sequence||old.sequence===draft.sequence&&((old.writeVersion??0)>(draft.writeVersion??0)||(old.writeVersion??0)===(draft.writeVersion??0)&&old.savedAt>draft.savedAt)))return;
      const nextTotal=Number(total.result??0)-(old?.bytes??0)+bytes;
      if(!old&&count.result>=MAX_SCOPE_DRAFTS||nextTotal>MAX_TOTAL_BYTES){failure=new Error('本机草稿空间已满。已有草稿保留，请先保存、导出或明确放弃旧草稿。');tx.abort();return;}
      store.put({...structuredClone(draft),key:key(draft),bytes});quota.put(nextTotal,'bytes');applied=true;
    };
    previous.onsuccess=update;total.onsuccess=update;count.onsuccess=update;
    tx.oncomplete=()=>resolve(applied);tx.onerror=()=>reject(failure??new Error('本机草稿保存失败，请显式保存或导出。'));tx.onabort=()=>reject(failure??new Error('本机草稿保存已中断。'));
  });}finally{db.close();}
}
/** Move only the exact recovery record the user selected. No temporary second
 * copy, even at quota. A live older tab can create a separate draft afterwards. */
export async function claimLocalDraft(draft:WorkbookLocalDraft):Promise<WorkbookLocalDraft>{
  validateLocalDraft(draft,draft.ownerId,draft.workbookId);
  const claimed={...draft,editorId:crypto.randomUUID(),savedAt:Date.now()},bytes=validateLocalDraft(claimed,draft.ownerId,draft.workbookId),db=await openDatabase();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction([STORE,QUOTA],'readwrite'),store=tx.objectStore(STORE),quota=tx.objectStore(QUOTA),record=store.get(key(draft)),total=quota.get('bytes');
    let failure:Error|undefined;
    const claim=()=>{if(record.readyState!=='done'||total.readyState!=='done')return;
      const old=record.result as StoredDraft|undefined;
      if(!old||old.sequence!==draft.sequence||old.savedAt!==draft.savedAt||(old.writeVersion??0)!==(draft.writeVersion??0)){failure=new Error('这份草稿已在另一页面更新或恢复，请重新读取草稿列表。');tx.abort();return;}
      store.delete(key(draft));store.add({...structuredClone(claimed),key:key(claimed),bytes});quota.put(Math.max(0,Number(total.result??0)-old.bytes)+bytes,'bytes');
    };
    record.onsuccess=claim;total.onsuccess=claim;tx.oncomplete=()=>resolve(claimed);tx.onerror=()=>reject(failure??new Error('草稿恢复失败，原稿仍保留。'));tx.onabort=()=>reject(failure??new Error('草稿恢复已中断，原稿仍保留。'));
  });}finally{db.close();}
}
export async function removeLocalDraft(draft:WorkbookLocalDraft){
  const db=await openDatabase();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction([STORE,QUOTA],'readwrite'),store=tx.objectStore(STORE),quota=tx.objectStore(QUOTA),record=store.get(key(draft)),total=quota.get('bytes');
    const remove=()=>{if(record.readyState!=='done'||total.readyState!=='done')return;const old=record.result as StoredDraft|undefined;if(!old||old.sequence!==draft.sequence||old.savedAt!==draft.savedAt||(old.writeVersion??0)!==(draft.writeVersion??0))return;store.delete(key(draft));quota.put(Math.max(0,Number(total.result??0)-old.bytes),'bytes');};
    record.onsuccess=remove;total.onsuccess=remove;tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('本机草稿未删除，请稍后重试。'));tx.onabort=()=>reject(new Error('本机草稿删除已中断。'));
  });}finally{db.close();}
}
