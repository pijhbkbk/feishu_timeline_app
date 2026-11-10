import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { assertApprovedTeamMember } from '../../common/team-membership';
import { withTeamWrite } from '../../common/team-authorization';
import type { AuthenticatedUser } from '../auth/auth.types';
import { lockSheetAttachmentTarget } from '../attachments/sheet-attachment-policy';
import { digest, draftExpectation, exact, integer, object, operationId, validateSnapshot, workbookId, workbookName, WORKBOOK_DRAFT_LIMITS, WORKBOOK_LIMITS } from './workbook.rules';
import type { WorkbookSaveTiming } from './workbook-save-timing';
import { insertWorkbookDraftSnapshot, insertWorkbookRevisionSnapshot, insertWorkbookSnapshot, updateWorkbookDraftSnapshot, updateWorkbookSnapshot } from './workbook-snapshot-storage';
const META={id:true,name:true,revision:true,snapshotHash:true,updatedAt:true} satisfies Prisma.FreeWorkbookSelect;
const DRAFT_META = { id:true,draftRevision:true,baseWorkbookRevision:true,snapshotHash:true,snapshotBytes:true,updatedAt:true } satisfies Prisma.FreeWorkbookDraftSelect;
type DraftReceipt = {
  action:'DRAFT_SAVED'|'DRAFT_DISCARDED'|'DRAFT_PUBLISHED';
  draftId:string;draftRevision:number;baseWorkbookRevision:number;snapshotHash:string;workbookRevision:number;
  workbook?: {id:string;name:string;revision:number;snapshotHash:string;updatedAt:Date|string};
};
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
@Injectable()
export class WorkbooksService {
  constructor(private readonly prisma:PrismaService){}
  async list(raw:Record<string,unknown>,actor:AuthenticatedUser){
    assertApprovedTeamMember(actor);exact(raw,['after']);const after=raw.after===undefined?undefined:workbookId(raw.after);
    const rows=await this.prisma.freeWorkbook.findMany({where:after?{id:{gt:after}}:{},select:META,orderBy:{id:'asc'},take:51});
    return {items:rows.slice(0,50),nextCursor:rows.length>50?rows[49]!.id:null};
  }
  async get(idInput:string,actor:AuthenticatedUser){assertApprovedTeamMember(actor);const id=workbookId(idInput);const row=await this.prisma.freeWorkbook.findUnique({where:{id},select:{...META,snapshot:true}});if(!row)throw new NotFoundException('工作簿不存在。');return row;}
  async revisions(idInput:string,raw:Record<string,unknown>,actor:AuthenticatedUser){
    assertApprovedTeamMember(actor);const id=workbookId(idInput);exact(raw,['before']);const before=raw.before===undefined?undefined:integer(Number(raw.before));
    if(!await this.prisma.freeWorkbook.findUnique({where:{id},select:{id:true}}))throw new NotFoundException('工作簿不存在。');
    const rows=await this.prisma.freeWorkbookRevision.findMany({where:{workbookId:id,...(before?{revision:{lt:before}}:{})},select:{revision:true,snapshotHash:true,createdAt:true,restoredFrom:true},orderBy:{revision:'desc'},take:51});
    return {items:rows.slice(0,50),nextBefore:rows.length>50?rows[49]!.revision:null};
  }
  async create(raw:unknown,actor:AuthenticatedUser){
    const input=object(raw);exact(input,['id','name','operationId','snapshot']);const id=workbookId(input.id),op=operationId(input.operationId),name=workbookName(input.name);
    const checked=validateSnapshot(input.snapshot,id);if(checked.snapshot.name!==name)throw new BadRequestException('工作簿名与快照不一致。');
    // Images are uploaded after this durable identity exists, then attached by save.
    if(checked.imageIds.length)throw new BadRequestException('新工作簿须先创建，再上传图片并保存。');
    return withTeamWrite(this.prisma,actor,async tx=>{
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'free-workbook-create'}))`);
      return this.command(tx,actor,op,'WORKBOOK_CREATED',input,async()=>{
        if(await tx.freeWorkbook.count()>=200)throw new BadRequestException('工作簿数量达到 200 个上限，请联系维护人员。');
        if(await tx.freeWorkbook.findUnique({where:{id},select:{id:true}}))throw new ConflictException('工作簿标识已存在。');
        const row=await insertWorkbookSnapshot(tx,id,name,actor.id,checked);
        await insertWorkbookRevisionSnapshot(tx,id,1,actor.id,checked);
        await this.audit(tx,actor,id,'WORKBOOK_CREATED',0,1,checked.hash,op);return row;
      });
    });
  }
  async save(idInput:string,raw:unknown,actor:AuthenticatedUser,timing?:WorkbookSaveTiming){
    timing?.mark('serviceEnter');
    const id=workbookId(idInput),input=object(raw);exact(input,['operationId','expectedRevision','snapshot']);const op=operationId(input.operationId),revision=integer(input.expectedRevision),checked=validateSnapshot(input.snapshot,id);
    timing?.mark('validated');timing?.mark('transactionStart');
    try {
      const result=await withTeamWrite(this.prisma,actor,async tx=>{
        timing?.mark('transactionEnter');
        await this.lock(tx,id);timing?.mark('locksAcquired');
        const saved=await this.command(tx,actor,op,'WORKBOOK_SAVED',{id,...input},async()=>{
          timing?.mark('writeStart');
          try{return await this.write(tx,actor,id,revision,checked,op);}finally{timing?.mark('writeEnd');}
        });
        timing?.mark('commandEnd');return saved;
      },{timeout:30000});
      timing?.mark('transactionEnd');return result;
    } finally { timing?.mark('serviceEnd'); }
  }
  async restore(idInput:string,raw:unknown,actor:AuthenticatedUser){
    const id=workbookId(idInput),input=object(raw);exact(input,['operationId','expectedRevision','revision']);const op=operationId(input.operationId),expected=integer(input.expectedRevision),revision=integer(input.revision);
    return withTeamWrite(this.prisma,actor,async tx=>{
      await this.lock(tx,id);
      return this.command(tx,actor,op,'WORKBOOK_RESTORED',{id,...input},async()=>{
        const previous=await tx.freeWorkbookRevision.findUnique({where:{workbookId_revision:{workbookId:id,revision}},select:{snapshot:true}});if(!previous)throw new NotFoundException('历史版本不存在。');
        return this.write(tx,actor,id,expected,validateSnapshot(previous.snapshot,id),op,revision);
      });
    },{timeout:30000});
  }
  /** The author's replaceable slot is separate from the workbook's published history. */
  async getDraft(idInput:string,actor:AuthenticatedUser){
    const id=workbookId(idInput);
    return withTeamWrite(this.prisma,actor,async tx=>{
      await this.lock(tx,id);
      const workbook=await this.currentWorkbook(tx,id);
      const draft=await tx.freeWorkbookDraft.findUnique({where:{workbookId_authorUserId:{workbookId:id,authorUserId:actor.id}},select:{...DRAFT_META,snapshot:true}});
      return {workbookRevision:workbook.revision,draft,baseStale:!!draft&&draft.baseWorkbookRevision!==workbook.revision};
    },{timeout:30000});
  }
  async saveDraft(idInput:string,raw:unknown,actor:AuthenticatedUser){
    const id=workbookId(idInput),input=object(raw);
    exact(input,['operationId','expectedDraftId','expectedDraftRevision','baseWorkbookRevision','snapshot']);
    const op=operationId(input.operationId),expected=draftExpectation(input,true),base=integer(input.baseWorkbookRevision),checked=validateSnapshot(input.snapshot,id);
    return withTeamWrite(this.prisma,actor,async tx=>{
      await this.lockDraft(tx,id);
      const receipt=await this.command<DraftReceipt>(tx,actor,op,'WORKBOOK_DRAFT_SAVED',{id,...input},async()=>{
        const workbook=await this.currentWorkbook(tx,id);
        const previous=await this.ownDraft(tx,id,actor.id);
        this.assertDraft(previous,expected);
        if(!await tx.freeWorkbookRevision.findUnique({where:{workbookId_revision:{workbookId:id,revision:base}},select:{id:true}}))throw new BadRequestException('草稿依据的工作簿版本不存在。');
        await this.validateAssets(tx,id,checked);
        // The global lock makes aggregate quotas and all slot changes atomic, including publish/discard.
        const [own,total]=await Promise.all([
          tx.freeWorkbookDraft.aggregate({where:{authorUserId:actor.id},_count:{_all:true},_sum:{snapshotBytes:true}}),
          tx.freeWorkbookDraft.aggregate({_sum:{snapshotBytes:true}}),
        ]);
        const delta=checked.bytes-(previous?.snapshotBytes??0);
        if(!previous&&own._count._all>=WORKBOOK_DRAFT_LIMITS.slotsPerUser)throw new BadRequestException('个人服务器草稿已达 8 个，请明确保存或丢弃现有草稿。');
        if((own._sum.snapshotBytes??0)+delta>WORKBOOK_DRAFT_LIMITS.bytesPerUser||(total._sum.snapshotBytes??0)+delta>WORKBOOK_DRAFT_LIMITS.bytesGlobal)throw new BadRequestException('服务器草稿容量不足；现有草稿未被覆盖，请保留本机草稿。');
        let draft;
        if(previous){
          const updated=await updateWorkbookDraftSnapshot(tx,previous.id,actor.id,expected.revision,base,checked);
          if(updated!==1)throw new ConflictException('草稿已变化，请读取当前草稿后决定。');
          draft=await tx.freeWorkbookDraft.findUniqueOrThrow({where:{id:previous.id},select:DRAFT_META});
        }else draft=await insertWorkbookDraftSnapshot(tx,id,actor.id,base,checked);
        const result:DraftReceipt={action:'DRAFT_SAVED',draftId:draft.id,draftRevision:draft.draftRevision,baseWorkbookRevision:base,snapshotHash:checked.hash,workbookRevision:workbook.revision};
        await this.auditDraft(tx,actor,id,result,op);return result;
      });
      return this.draftAck(tx,id,actor.id,receipt);
    },{timeout:30000});
  }
  async discardDraft(idInput:string,raw:unknown,actor:AuthenticatedUser){
    const id=workbookId(idInput),input=object(raw);exact(input,['operationId','expectedDraftId','expectedDraftRevision']);
    const op=operationId(input.operationId),expected=draftExpectation(input);
    return withTeamWrite(this.prisma,actor,async tx=>{
      await this.lockDraft(tx,id);
      const receipt=await this.command<DraftReceipt>(tx,actor,op,'WORKBOOK_DRAFT_DISCARDED',{id,...input},async()=>{
        const workbook=await this.currentWorkbook(tx,id),draft=await this.ownDraft(tx,id,actor.id);
        this.assertDraft(draft,expected);if(!draft)throw new ConflictException('草稿不存在或已被处理。');
        await tx.freeWorkbookDraft.delete({where:{id:draft.id}});
        const result:DraftReceipt={action:'DRAFT_DISCARDED',draftId:draft.id,draftRevision:draft.draftRevision,baseWorkbookRevision:draft.baseWorkbookRevision,snapshotHash:draft.snapshotHash,workbookRevision:workbook.revision};
        await this.auditDraft(tx,actor,id,result,op);return result;
      });
      return this.draftAck(tx,id,actor.id,receipt);
    },{timeout:30000});
  }
  async publishDraft(idInput:string,raw:unknown,actor:AuthenticatedUser){
    const id=workbookId(idInput),input=object(raw);exact(input,['operationId','expectedDraftId','expectedDraftRevision','expectedWorkbookRevision']);
    const op=operationId(input.operationId),expected=draftExpectation(input),revision=integer(input.expectedWorkbookRevision);
    return withTeamWrite(this.prisma,actor,async tx=>{
      await this.lockDraft(tx,id);
      const receipt=await this.command<DraftReceipt>(tx,actor,op,'WORKBOOK_DRAFT_PUBLISHED',{id,...input},async()=>{
        const draft=await this.ownDraft(tx,id,actor.id);this.assertDraft(draft,expected);
        if(!draft)throw new ConflictException('草稿不存在或已被处理。');
        if(draft.baseWorkbookRevision!==revision)throw new ConflictException('草稿依据版本与要保存的正式版本不同；草稿保留，请先处理版本冲突。');
        // Full snapshot and CLEAN/ownership checks run again at the explicit publication boundary.
        const stored=await tx.freeWorkbookDraft.findUniqueOrThrow({where:{id:draft.id},select:{snapshot:true}});
        const workbook=await this.write(tx,actor,id,revision,validateSnapshot(stored.snapshot,id),op);
        await tx.freeWorkbookDraft.delete({where:{id:draft.id}});
        const result:DraftReceipt={action:'DRAFT_PUBLISHED',draftId:draft.id,draftRevision:draft.draftRevision,baseWorkbookRevision:draft.baseWorkbookRevision,snapshotHash:draft.snapshotHash,workbookRevision:workbook.revision,workbook};
        await this.auditDraft(tx,actor,id,result,op);return result;
      });
      return this.draftAck(tx,id,actor.id,receipt);
    },{timeout:30000});
  }
  private async lockDraft(tx:Prisma.TransactionClient,id:string){
    // Authorization -> quota -> workbook/asset -> operation. No other writer takes quota after workbook.
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'free-workbook-draft-quota'}))`);
    await this.lock(tx,id);
  }
  private ownDraft(tx:Prisma.TransactionClient,id:string,authorUserId:string){return tx.freeWorkbookDraft.findUnique({where:{workbookId_authorUserId:{workbookId:id,authorUserId}},select:DRAFT_META});}
  private async currentWorkbook(tx:Prisma.TransactionClient,id:string){const row=await tx.freeWorkbook.findUnique({where:{id},select:{revision:true}});if(!row)throw new NotFoundException('工作簿不存在。');return row;}
  private assertDraft(draft:{id:string;draftRevision:number}|null,expected:{id:string|null;revision:number}){
    if((draft?.id??null)!==expected.id||(draft?.draftRevision??0)!==expected.revision)throw new ConflictException('服务器草稿已变化；本机内容保留，请读取当前草稿后决定。');
  }
  private async draftAck(tx:Prisma.TransactionClient,id:string,authorUserId:string,receipt:DraftReceipt){
    const workbook=await this.currentWorkbook(tx,id);
    const currentDraft=await tx.freeWorkbookDraft.findUnique({where:{workbookId_authorUserId:{workbookId:id,authorUserId}},select:DRAFT_META});
    const matches=receipt.action==='DRAFT_SAVED'?currentDraft?.id===receipt.draftId&&currentDraft.draftRevision===receipt.draftRevision:currentDraft===null;
    return {receipt,currentDraft,workbookRevision:workbook.revision,baseStale:!!currentDraft&&currentDraft.baseWorkbookRevision!==workbook.revision,superseded:!matches||receipt.workbookRevision!==workbook.revision};
  }
  private async auditDraft(tx:Prisma.TransactionClient,actor:AuthenticatedUser,id:string,receipt:DraftReceipt,op:string){
    await tx.auditLog.create({data:{actorUserId:actor.id,targetType:'FREE_WORKBOOK',targetId:id,action:`WORKBOOK_${receipt.action}`,afterData:{draftId:receipt.draftId,draftRevision:receipt.draftRevision,baseWorkbookRevision:receipt.baseWorkbookRevision,sha256:receipt.snapshotHash,workbookRevision:receipt.workbookRevision},metadata:{operationId:op}}});
  }
  private async lock(tx:Prisma.TransactionClient,id:string){await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'free-workbook'}),hashtext(${id}))`);await lockSheetAttachmentTarget(tx,'SHEET_WORKBOOK',id);}
  private async write(tx:Prisma.TransactionClient,actor:AuthenticatedUser,id:string,expected:number,checked:ReturnType<typeof validateSnapshot>,op:string,restoredFrom?:number){
    const current=await tx.freeWorkbook.findUnique({where:{id},select:{revision:true}});if(!current)throw new NotFoundException('工作簿不存在。');if(current.revision!==expected)throw new ConflictException('工作簿已有新版本；本地内容仍保留，请导出备份后重新读取。');
    await this.validateAssets(tx,id,checked);
    const total=await tx.freeWorkbookRevision.aggregate({where:{workbookId:id},_sum:{snapshotBytes:true}});
    if((total._sum.snapshotBytes??0)+checked.bytes>WORKBOOK_LIMITS.revisionsBytes)throw new BadRequestException('工作簿历史达到 256 MiB 容量上限；内容未覆盖，请导出备份并新建工作簿。');
    const updated=await updateWorkbookSnapshot(tx,id,expected,workbookName(checked.snapshot.name),actor.id,checked);if(updated!==1)throw new ConflictException('工作簿版本冲突，未覆盖服务器内容。');
    await insertWorkbookRevisionSnapshot(tx,id,expected+1,actor.id,checked,restoredFrom);
    await this.audit(tx,actor,id,restoredFrom===undefined?'WORKBOOK_SAVED':'WORKBOOK_RESTORED',expected,expected+1,checked.hash,op,restoredFrom);
    return tx.freeWorkbook.findUniqueOrThrow({where:{id},select:META});
  }
  private async validateAssets(tx:Prisma.TransactionClient,id:string,checked:ReturnType<typeof validateSnapshot>){
    if(checked.imageIds.length){
      const assets=await tx.sheetImage.findMany({where:{id:{in:checked.imageIds},targetType:'SHEET_WORKBOOK',recordId:id,isDeleted:false,attachment:{entityType:'SHEET_WORKBOOK',entityId:id,isDeleted:false,scanStatus:'CLEAN'}},select:{id:true,pixelWidth:true,pixelHeight:true,attachment:{select:{fileSize:true}}},take:WORKBOOK_LIMITS.images});
      if(assets.length!==checked.imageIds.length)throw new BadRequestException('图片未完成扫描、已失效或不属于当前工作簿。');
      const backgrounds=assets.filter(asset=>checked.backgroundImageIds.includes(asset.id));if(backgrounds.reduce((sum,asset)=>sum+asset.pixelWidth*asset.pixelHeight,0)>40_000_000||backgrounds.reduce((sum,asset)=>sum+asset.attachment.fileSize,0)>20*1024*1024)throw new BadRequestException('背景原件合计超过 20 MiB 或 40 MP。');
    }
  }
  private async audit(tx:Prisma.TransactionClient,actor:AuthenticatedUser,id:string,action:string,before:number,after:number,hash:string,op:string,restoredFrom?:number){await tx.auditLog.create({data:{actorUserId:actor.id,targetType:'FREE_WORKBOOK',targetId:id,action,beforeData:{revision:before},afterData:{revision:after,sha256:hash},metadata:{operationId:op,...(restoredFrom===undefined?{}:{restoredFrom})}}});}
  private async command<T>(tx:Prisma.TransactionClient,actor:AuthenticatedUser,op:string,action:string,input:unknown,run:()=>Promise<T>):Promise<T>{
    const key=`free-workbook:${actor.id}:${op}`,hash=digest({action,input});await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
    const previous=await tx.adminCommandRequest.findUnique({where:{idempotencyKey:key}});if(previous){if(previous.actorUserId!==actor.id||previous.action!==action||previous.requestHash!==hash)throw new ConflictException('操作标识已用于不同内容。');return previous.result as T;}
    const result=await run();await tx.adminCommandRequest.create({data:{actorUserId:actor.id,idempotencyKey:key,action,requestHash:hash,result:json(result)}});return result;
  }
}
