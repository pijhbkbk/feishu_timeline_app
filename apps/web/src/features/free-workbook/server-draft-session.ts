import type { IWorkbookData } from '@univerjs/core';

export interface ServerDraftMeta {
  id:string;draftRevision:number;baseWorkbookRevision:number;snapshotHash:string;snapshotBytes:number;updatedAt:string;
}
export interface ServerDraftState {
  draftId:string|null;draftRevision:number;baseWorkbookRevision:number;snapshotHash:string|null;
}
export interface ServerDraftRead {
  workbookRevision:number;draft:(ServerDraftMeta&{snapshot:IWorkbookData})|null;baseStale:boolean;
}
export interface ServerDraftReceipt {
  action:'DRAFT_SAVED'|'DRAFT_DISCARDED'|'DRAFT_PUBLISHED';
  draftId:string;draftRevision:number;baseWorkbookRevision:number;snapshotHash:string;workbookRevision:number;
  workbook?:{id:string;name:string;revision:number;snapshotHash:string;updatedAt:string};
}
export interface ServerDraftAck {
  receipt:ServerDraftReceipt;currentDraft:ServerDraftMeta|null;workbookRevision:number;baseStale:boolean;superseded:boolean;
}
export interface ServerDraftSaveBody {
  operationId:string;expectedDraftId:string|null;expectedDraftRevision:number;baseWorkbookRevision:number;snapshot:IWorkbookData;
}
export interface ServerDraftSlotBody {operationId:string;expectedDraftId:string;expectedDraftRevision:number}
export interface ServerDraftPublishBody extends ServerDraftSlotBody {expectedWorkbookRevision:number}
interface RequestIdentity {workbookId:string;capturedSequence:number;expectedSnapshotHash:string;baseWorkbookRevision:number}
export type ServerDraftRequest = Readonly<RequestIdentity & (
  {kind:'save';body:Readonly<ServerDraftSaveBody>} |
  {kind:'publish';body:Readonly<ServerDraftPublishBody>} |
  {kind:'discard';body:Readonly<ServerDraftSlotBody>}
)>;
export interface RetainedServerDraft {snapshot:IWorkbookData;capturedSequence:number}
export interface ServerDraftCheckpoint {
  version:1;workbookId:string;authorUserId:string;state:ServerDraftState;acknowledgedSequence:number|null;
  pending:ServerDraftRequest|null;retained:RetainedServerDraft|null;conflicted:boolean;
}
export interface ServerDraftSessionOptions {
  workbookId:string;authorUserId:string;baseWorkbookRevision:number;
  draft?:ServerDraftMeta|null;acknowledgedSequence?:number|null;
}
const MAX_SNAPSHOT_BYTES=7*1024*1024;
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const HASH=/^[a-f\d]{64}$/;
const invalid=()=>new Error('服务器草稿数据或回执不匹配；本机内容与原请求保留，请核实后重试。');
function object(raw:unknown):Record<string,unknown>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw invalid();return raw as Record<string,unknown>;}
function exact(raw:Record<string,unknown>,keys:readonly string[]){if(Object.keys(raw).some(key=>!keys.includes(key)))throw invalid();}
function id(raw:unknown):string{if(typeof raw!=='string'||!UUID.test(raw))throw invalid();return raw;}
function hash(raw:unknown):string{if(typeof raw!=='string'||!HASH.test(raw))throw invalid();return raw;}
function integer(raw:unknown,min=1):number{if(typeof raw!=='number'||!Number.isSafeInteger(raw)||raw<min||raw>2147483646)throw invalid();return raw;}
function sequence(raw:unknown):number{if(typeof raw!=='number'||!Number.isSafeInteger(raw)||raw<0)throw invalid();return raw;}
function author(raw:unknown):string{if(typeof raw!=='string'||!raw.trim()||raw.length>128)throw invalid();return raw;}
function timestamp(raw:unknown):string{if(typeof raw!=='string'||raw.length>64||!/^\d{4}-\d\d-\d\dT/.test(raw)||!Number.isFinite(Date.parse(raw)))throw invalid();return raw;}
function boolean(raw:unknown):boolean{if(typeof raw!=='boolean')throw invalid();return raw;}
function freeze<T>(value:T,depth=0):T{if(depth>40)throw invalid();if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child,depth+1);Object.freeze(value);}return value;}
function clone<T>(raw:T,maxBytes=16*1024*1024):T{let text:string;try{text=JSON.stringify(raw);}catch{throw invalid();}if(!text||new TextEncoder().encode(text).length>maxBytes)throw invalid();return JSON.parse(text) as T;}
function snapshot(raw:unknown,workbookId:string):IWorkbookData{
  const value=object(raw);if(value.id!==workbookId||value.appVersion!=='1.0.4'||typeof value.name!=='string'||!value.name.trim()||value.name.length>200||!Array.isArray(value.sheetOrder)||!value.sheetOrder.length||value.sheetOrder.length>32)throw invalid();
  object(value.sheets);object(value.styles);return freeze(clone(value,MAX_SNAPSHOT_BYTES)) as unknown as IWorkbookData;
}
async function snapshotHash(value:IWorkbookData){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');}
function meta(raw:unknown):ServerDraftMeta{
  const value=object(raw);exact(value,['id','draftRevision','baseWorkbookRevision','snapshotHash','snapshotBytes','updatedAt']);
  const bytes=integer(value.snapshotBytes);if(bytes>MAX_SNAPSHOT_BYTES)throw invalid();
  return {id:id(value.id),draftRevision:integer(value.draftRevision),baseWorkbookRevision:integer(value.baseWorkbookRevision),snapshotHash:hash(value.snapshotHash),snapshotBytes:bytes,updatedAt:timestamp(value.updatedAt)};
}
function state(raw:unknown):ServerDraftState{
  const value=object(raw);exact(value,['draftId','draftRevision','baseWorkbookRevision','snapshotHash']);
  const result={draftId:value.draftId===null?null:id(value.draftId),draftRevision:integer(value.draftRevision,0),baseWorkbookRevision:integer(value.baseWorkbookRevision),snapshotHash:value.snapshotHash===null?null:hash(value.snapshotHash)};
  if((result.draftId===null)!==(result.draftRevision===0)||(result.draftId===null)!==(result.snapshotHash===null))throw invalid();return result;
}
function operation(raw:unknown):string{if(typeof raw!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(raw))throw invalid();return raw;}
/** Schema validation is shared by the transport and coordinator. No response is adopted here. */
export function validateServerDraftRead(raw:unknown,workbookId:string):ServerDraftRead{
  id(workbookId);const value=object(raw);exact(value,['workbookRevision','draft','baseStale']);
  const revision=integer(value.workbookRevision);let draft:ServerDraftRead['draft']=null;
  if(value.draft!==null){const content=object(value.draft);const {snapshot:stored,...fields}=content;draft={...meta(fields),snapshot:snapshot(stored,workbookId)};if(draft.baseWorkbookRevision>revision)throw invalid();}
  const stale=boolean(value.baseStale);if(stale!==(!!draft&&draft.baseWorkbookRevision!==revision))throw invalid();
  // JSONB key order can differ from the original input hash. The stored hash is an opaque version identity.
  return freeze({workbookRevision:revision,draft,baseStale:stale});
}
export function validateServerDraftAck(raw:unknown,workbookId:string):ServerDraftAck{
  id(workbookId);const value=object(raw);exact(value,['receipt','currentDraft','workbookRevision','baseStale','superseded']);
  const r=object(value.receipt);exact(r,['action','draftId','draftRevision','baseWorkbookRevision','snapshotHash','workbookRevision','workbook']);
  if(r.action!=='DRAFT_SAVED'&&r.action!=='DRAFT_DISCARDED'&&r.action!=='DRAFT_PUBLISHED')throw invalid();
  const receipt:ServerDraftReceipt={action:r.action,draftId:id(r.draftId),draftRevision:integer(r.draftRevision),baseWorkbookRevision:integer(r.baseWorkbookRevision),snapshotHash:hash(r.snapshotHash),workbookRevision:integer(r.workbookRevision)};
  if(receipt.baseWorkbookRevision>receipt.workbookRevision)throw invalid();
  if(receipt.action==='DRAFT_PUBLISHED'){
    const book=object(r.workbook);exact(book,['id','name','revision','snapshotHash','updatedAt']);
    if(book.id!==workbookId||typeof book.name!=='string'||!book.name.trim()||book.name.length>200||integer(book.revision)!==receipt.workbookRevision)throw invalid();
    // Formal publication revalidates a JSONB snapshot. Its byte hash need not equal the input draft hash.
    receipt.workbook={id:workbookId,name:book.name,revision:receipt.workbookRevision,snapshotHash:hash(book.snapshotHash),updatedAt:timestamp(book.updatedAt)};
  }else if(r.workbook!==undefined)throw invalid();
  const currentDraft=value.currentDraft===null?null:meta(value.currentDraft),revision=integer(value.workbookRevision);
  if(receipt.workbookRevision>revision||currentDraft&&currentDraft.baseWorkbookRevision>revision)throw invalid();
  const baseStale=boolean(value.baseStale),superseded=boolean(value.superseded);
  const matches=receipt.action==='DRAFT_SAVED'?currentDraft?.id===receipt.draftId&&currentDraft.draftRevision===receipt.draftRevision:currentDraft===null;
  if(baseStale!==(!!currentDraft&&currentDraft.baseWorkbookRevision!==revision)||superseded!==(!matches||receipt.workbookRevision!==revision))throw invalid();
  if(receipt.action==='DRAFT_SAVED'&&matches&&(currentDraft?.snapshotHash!==receipt.snapshotHash||currentDraft.baseWorkbookRevision!==receipt.baseWorkbookRevision))throw invalid();
  return freeze({receipt,currentDraft,workbookRevision:revision,baseStale,superseded});
}
export function validateServerDraftRequest(raw:unknown):ServerDraftRequest{
  const value=object(raw);exact(value,['kind','workbookId','capturedSequence','expectedSnapshotHash','baseWorkbookRevision','body']);
  const workbookId=id(value.workbookId),capturedSequence=sequence(value.capturedSequence),expectedSnapshotHash=hash(value.expectedSnapshotHash),baseWorkbookRevision=integer(value.baseWorkbookRevision),body=object(value.body);
  const common={workbookId,capturedSequence,expectedSnapshotHash,baseWorkbookRevision};
  if(value.kind==='save'){
    exact(body,['operationId','expectedDraftId','expectedDraftRevision','baseWorkbookRevision','snapshot']);
    const draftId=body.expectedDraftId===null?null:id(body.expectedDraftId),revision=integer(body.expectedDraftRevision,0);
    if((draftId===null)!==(revision===0)||integer(body.baseWorkbookRevision)!==baseWorkbookRevision)throw invalid();
    return freeze({...common,kind:'save',body:{operationId:operation(body.operationId),expectedDraftId:draftId,expectedDraftRevision:revision,baseWorkbookRevision,snapshot:snapshot(body.snapshot,workbookId)}});
  }
  if(value.kind!=='publish'&&value.kind!=='discard')throw invalid();
  exact(body,value.kind==='publish'?['operationId','expectedDraftId','expectedDraftRevision','expectedWorkbookRevision']:['operationId','expectedDraftId','expectedDraftRevision']);
  const slot={operationId:operation(body.operationId),expectedDraftId:id(body.expectedDraftId),expectedDraftRevision:integer(body.expectedDraftRevision)};
  if(value.kind==='publish'){const expectedWorkbookRevision=integer(body.expectedWorkbookRevision);if(expectedWorkbookRevision!==baseWorkbookRevision)throw invalid();return freeze({...common,kind:'publish',body:{...slot,expectedWorkbookRevision}});}
  return freeze({...common,kind:'discard',body:slot});
}

/** Pure request coordination. The caller persists checkpoint() BEFORE executing the returned request.
 * No timers, fetches, storage writes, automatic publication or automatic retries occur in this class.
 * Construct a new session from an explicitly chosen server state to resolve a CAS/superseded conflict.
 */
export class ServerDraftSession {
  readonly workbookId:string;readonly authorUserId:string;
  private slot:ServerDraftState;private pending:ServerDraftRequest|null=null;
  private retained:RetainedServerDraft|null=null;private acknowledgedSequence:number|null;
  private conflict=false;private generation=0;
  constructor(options:ServerDraftSessionOptions){
    this.workbookId=id(options.workbookId);this.authorUserId=author(options.authorUserId);
    const base=integer(options.baseWorkbookRevision),draft=options.draft?meta(options.draft):null;
    this.slot=freeze(draft?{draftId:draft.id,draftRevision:draft.draftRevision,baseWorkbookRevision:draft.baseWorkbookRevision,snapshotHash:draft.snapshotHash}:{draftId:null,draftRevision:0,baseWorkbookRevision:base,snapshotHash:null});
    this.acknowledgedSequence=options.acknowledgedSequence==null?null:sequence(options.acknowledgedSequence);
    if(!draft&&this.acknowledgedSequence!==null)throw invalid();
  }
  get state():Readonly<ServerDraftState>{return this.slot;}
  get uncertain(){return this.pending!==null;}
  get conflicted(){return this.conflict;}
  existing(){return this.pending;}
  /** Only the caller that knows this operation never reached transport may abandon it. */
  abandonUnsent(operationId:string){if(this.pending?.body.operationId===operationId){this.pending=null;this.generation++;}}
  retainedDraft(){return this.retained;}
  /** Retain newer local input independently of an earlier in-flight request. */
  capture(snapshotInput:IWorkbookData,capturedSequence:number){
    const seq=sequence(capturedSequence);if(this.retained&&seq<this.retained.capturedSequence||this.acknowledgedSequence!==null&&seq<this.acknowledgedSequence)throw invalid();
    const captured=snapshot(snapshotInput,this.workbookId);
    if(this.retained&&seq===this.retained.capturedSequence&&JSON.stringify(captured)!==JSON.stringify(this.retained.snapshot))throw invalid();
    this.retained=freeze({snapshot:captured,capturedSequence:seq});
  }
  async requestSave(snapshotInput:IWorkbookData,capturedSequence:number,baseWorkbookRevision=this.slot.baseWorkbookRevision):Promise<ServerDraftRequest & {kind:'save'}>{
    this.capture(snapshotInput,capturedSequence);
    if(this.pending){if(this.pending.kind!=='save')throw new Error('请先确认原草稿操作结果。');return this.pending;}
    if(this.conflict)throw new Error('草稿存在版本冲突，请明确选择服务器状态后再保存。');
    const body={operationId:crypto.randomUUID(),expectedDraftId:this.slot.draftId,expectedDraftRevision:this.slot.draftRevision,baseWorkbookRevision:integer(baseWorkbookRevision),snapshot:this.retained!.snapshot};
    const generation=this.generation,expectedSnapshotHash=await snapshotHash(body.snapshot);
    // Another caller can establish the pending operation while WebCrypto is running.
    const inFlight=this.existing();if(inFlight){if(inFlight.kind!=='save')throw new Error('请先确认原草稿操作结果。');return inFlight;}
    if(this.generation!==generation||this.conflict)throw new Error('草稿状态已变化，请重新确认当前编辑内容。');
    this.pending=freeze({kind:'save',workbookId:this.workbookId,body,capturedSequence,expectedSnapshotHash,baseWorkbookRevision:body.baseWorkbookRevision});return this.pending;
  }
  requestPublish(expectedWorkbookRevision:number,capturedSequence:number):ServerDraftRequest & {kind:'publish'}{
    if(this.pending){if(this.pending.kind!=='publish')throw new Error('请先确认原草稿操作结果。');return this.pending;}
    this.requireSlot();const seq=sequence(capturedSequence),revision=integer(expectedWorkbookRevision);
    if(this.slot.baseWorkbookRevision!==revision||this.acknowledgedSequence!==seq||this.retained&&this.retained.capturedSequence>seq)throw new Error('请先保存当前编辑为服务器草稿，并明确处理正式版本冲突。');
    this.pending=freeze({kind:'publish',workbookId:this.workbookId,capturedSequence:seq,expectedSnapshotHash:this.slot.snapshotHash!,baseWorkbookRevision:this.slot.baseWorkbookRevision,body:{operationId:crypto.randomUUID(),expectedDraftId:this.slot.draftId!,expectedDraftRevision:this.slot.draftRevision,expectedWorkbookRevision:revision}});return this.pending;
  }
  requestDiscard(capturedSequence:number):ServerDraftRequest & {kind:'discard'}{
    if(this.pending){if(this.pending.kind!=='discard')throw new Error('请先确认原草稿操作结果。');return this.pending;}
    this.requireSlot();
    this.pending=freeze({kind:'discard',workbookId:this.workbookId,capturedSequence:sequence(capturedSequence),expectedSnapshotHash:this.slot.snapshotHash!,baseWorkbookRevision:this.slot.baseWorkbookRevision,body:{operationId:crypto.randomUUID(),expectedDraftId:this.slot.draftId!,expectedDraftRevision:this.slot.draftRevision}});return this.pending;
  }
  private requireSlot(){if(this.conflict||!this.slot.draftId||!this.slot.snapshotHash)throw new Error('请明确选择当前服务器草稿后再操作。');}
  confirm(raw:unknown){
    const pending=this.pending;if(!pending)throw invalid();const ack=validateServerDraftAck(raw,this.workbookId),r=ack.receipt;
    const action={save:'DRAFT_SAVED',publish:'DRAFT_PUBLISHED',discard:'DRAFT_DISCARDED'}[pending.kind];
    if(r.action!==action||r.snapshotHash!==pending.expectedSnapshotHash||r.baseWorkbookRevision!==pending.baseWorkbookRevision||r.draftRevision!==pending.body.expectedDraftRevision+(pending.kind==='save'?1:0)||(pending.body.expectedDraftId!==null&&r.draftId!==pending.body.expectedDraftId))throw invalid();
    if(pending.kind==='publish'&&r.workbookRevision!==pending.body.expectedWorkbookRevision+1)throw invalid();
    if(pending.kind==='save'&&!ack.superseded&&ack.currentDraft?.snapshotBytes!==new TextEncoder().encode(JSON.stringify(pending.body.snapshot)).length)throw invalid();
    this.pending=null;this.generation++;
    if(ack.superseded){this.conflict=true;return {status:'conflict' as const,capturedSequence:pending.capturedSequence,ack};}
    if(pending.kind==='save'){
      this.slot=freeze({draftId:r.draftId,draftRevision:r.draftRevision,baseWorkbookRevision:r.baseWorkbookRevision,snapshotHash:r.snapshotHash});this.acknowledgedSequence=pending.capturedSequence;
    }else{
      this.slot=freeze({draftId:null,draftRevision:0,baseWorkbookRevision:ack.workbookRevision,snapshotHash:null});this.acknowledgedSequence=null;
      if(this.retained&&this.retained.capturedSequence<=pending.capturedSequence)this.retained=null;
    }
    return {status:'confirmed' as const,capturedSequence:pending.capturedSequence,ack};
  }
  reject(status:number|undefined){
    if(!this.pending)return;
    if([400,409,413,415,422].includes(status??0)){this.pending=null;this.generation++;if(status===409)this.conflict=true;}
    // A transport/auth/server failure is not proof that an earlier attempt did not commit.
  }
  checkpoint():ServerDraftCheckpoint{return freeze(clone({version:1,workbookId:this.workbookId,authorUserId:this.authorUserId,state:this.slot,acknowledgedSequence:this.acknowledgedSequence,pending:this.pending,retained:this.retained,conflicted:this.conflict}));}
  static async recover(raw:unknown,expected:{workbookId:string;authorUserId:string}){
    const input=object(clone(raw));exact(input,['version','workbookId','authorUserId','state','acknowledgedSequence','pending','retained','conflicted']);
    if(input.version!==1||input.workbookId!==id(expected.workbookId)||input.authorUserId!==author(expected.authorUserId))throw invalid();
    const saved=state(input.state),session=new ServerDraftSession({workbookId:expected.workbookId,authorUserId:expected.authorUserId,baseWorkbookRevision:saved.baseWorkbookRevision});
    session.slot=freeze(saved);session.acknowledgedSequence=input.acknowledgedSequence===null?null:sequence(input.acknowledgedSequence);session.conflict=boolean(input.conflicted);
    if(!saved.draftId&&session.acknowledgedSequence!==null)throw invalid();
    if(input.retained!==null){const retained=object(input.retained);exact(retained,['snapshot','capturedSequence']);session.capture(snapshot(retained.snapshot,expected.workbookId),sequence(retained.capturedSequence));}
    if(input.pending!==null){
      const pending=validateServerDraftRequest(input.pending);
      if(pending.workbookId!==expected.workbookId||pending.body.expectedDraftId!==saved.draftId||pending.body.expectedDraftRevision!==saved.draftRevision||session.conflict)throw invalid();
      if(pending.kind==='save'){
        if(pending.expectedSnapshotHash!==await snapshotHash(pending.body.snapshot)||!session.retained||session.retained.capturedSequence<pending.capturedSequence)throw invalid();
        if(session.retained.capturedSequence===pending.capturedSequence&&pending.expectedSnapshotHash!==await snapshotHash(session.retained.snapshot))throw invalid();
      }else if(pending.expectedSnapshotHash!==saved.snapshotHash||pending.baseWorkbookRevision!==saved.baseWorkbookRevision||pending.kind==='publish'&&session.acknowledgedSequence!==pending.capturedSequence)throw invalid();
      session.pending=pending;
    }
    return session;
  }
}
