import type { IWorkbookData } from '@univerjs/core';
export interface SavePayload {operationId:string;expectedRevision:number;snapshot:IWorkbookData}
export class WorkbookSaveSession {
  revision:number;private pending:{payload:SavePayload;sequence:number}|null=null;
  constructor(revision:number){this.revision=revision;}
  get uncertain(){return this.pending!==null;}
  request(snapshot:IWorkbookData,sequence:number):SavePayload {if(!this.pending)this.pending={payload:{snapshot:structuredClone(snapshot),expectedRevision:this.revision,operationId:crypto.randomUUID()},sequence};return this.pending.payload;}
  existing(){return this.pending?.payload??null;}
  confirm(revision:number){if(!this.pending||revision!==this.pending.payload.expectedRevision+1)throw new Error('保存回执版本不匹配，请核实原请求。');const sequence=this.pending.sequence;this.pending=null;this.revision=revision;return sequence;}
  reject(status:number|undefined){if(status===400||status===409||status===422)this.pending=null;}
}
