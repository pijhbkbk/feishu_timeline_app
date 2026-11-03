import type { IWorkbookData } from '@univerjs/core';
export interface SavePayload {operationId:string;expectedRevision:number;snapshot:IWorkbookData}
export interface PendingWorkbookSave {payload:SavePayload;sequence:number}
export class WorkbookSaveSession {
  revision:number;private pending:PendingWorkbookSave|null=null;
  constructor(revision:number,pending:PendingWorkbookSave|null=null){this.revision=revision;if(pending){if(pending.payload.expectedRevision!==revision)throw new Error('草稿保存请求与原版本不一致。');this.pending=structuredClone(pending);}}
  get uncertain(){return this.pending!==null;}
  get pendingSequence(){return this.pending?.sequence??null;}
  request(snapshot:IWorkbookData,sequence:number):SavePayload {if(!this.pending)this.pending={payload:{snapshot:structuredClone(snapshot),expectedRevision:this.revision,operationId:crypto.randomUUID()},sequence};return this.pending.payload;}
  abandonUnsent(operationId:string){if(this.pending?.payload.operationId===operationId)this.pending=null;}
  existing(){return this.pending?.payload??null;}
  checkpoint(){return this.pending?structuredClone(this.pending):null;}
  confirm(revision:number){if(!this.pending||revision!==this.pending.payload.expectedRevision+1)throw new Error('保存回执版本不匹配，请核实原请求。');const sequence=this.pending.sequence;this.pending=null;this.revision=revision;return sequence;}
  reject(status:number|undefined){if(status===400||status===409||status===422)this.pending=null;}
}
