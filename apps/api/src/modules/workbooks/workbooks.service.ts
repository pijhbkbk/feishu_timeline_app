import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { assertApprovedTeamMember } from '../../common/team-membership';
import { withTeamWrite } from '../../common/team-authorization';
import type { AuthenticatedUser } from '../auth/auth.types';
import { lockSheetAttachmentTarget } from '../attachments/sheet-attachment-policy';
import { digest, exact, integer, object, operationId, validateSnapshot, workbookId, workbookName, WORKBOOK_LIMITS } from './workbook.rules';
const META={id:true,name:true,revision:true,snapshotHash:true,updatedAt:true} satisfies Prisma.FreeWorkbookSelect;
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
        const row=await tx.freeWorkbook.create({data:{id,name,revision:1,snapshot:json(checked.snapshot),snapshotBytes:checked.bytes,snapshotHash:checked.hash,createdById:actor.id,updatedById:actor.id},select:META});
        await tx.freeWorkbookRevision.create({data:{workbookId:id,revision:1,snapshot:json(checked.snapshot),snapshotBytes:checked.bytes,snapshotHash:checked.hash,actorUserId:actor.id}});
        await this.audit(tx,actor,id,'WORKBOOK_CREATED',0,1,checked.hash,op);return row;
      });
    });
  }
  async save(idInput:string,raw:unknown,actor:AuthenticatedUser){
    const id=workbookId(idInput),input=object(raw);exact(input,['operationId','expectedRevision','snapshot']);const op=operationId(input.operationId),revision=integer(input.expectedRevision),checked=validateSnapshot(input.snapshot,id);
    return withTeamWrite(this.prisma,actor,async tx=>{
      await this.lock(tx,id);
      return this.command(tx,actor,op,'WORKBOOK_SAVED',{id,...input},()=>this.write(tx,actor,id,revision,checked,op));
    },{timeout:30000});
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
  private async lock(tx:Prisma.TransactionClient,id:string){await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'free-workbook'}),hashtext(${id}))`);await lockSheetAttachmentTarget(tx,'SHEET_WORKBOOK',id);}
  private async write(tx:Prisma.TransactionClient,actor:AuthenticatedUser,id:string,expected:number,checked:ReturnType<typeof validateSnapshot>,op:string,restoredFrom?:number){
    const current=await tx.freeWorkbook.findUnique({where:{id},select:{revision:true}});if(!current)throw new NotFoundException('工作簿不存在。');if(current.revision!==expected)throw new ConflictException('工作簿已有新版本；本地内容仍保留，请导出备份后重新读取。');
    if(checked.imageIds.length){
      const assets=await tx.sheetImage.findMany({where:{id:{in:checked.imageIds},targetType:'SHEET_WORKBOOK',recordId:id,isDeleted:false,attachment:{entityType:'SHEET_WORKBOOK',entityId:id,isDeleted:false,scanStatus:'CLEAN'}},select:{id:true},take:WORKBOOK_LIMITS.images});
      if(assets.length!==checked.imageIds.length)throw new BadRequestException('图片未完成扫描、已失效或不属于当前工作簿。');
    }
    const total=await tx.freeWorkbookRevision.aggregate({where:{workbookId:id},_sum:{snapshotBytes:true}});
    if((total._sum.snapshotBytes??0)+checked.bytes>WORKBOOK_LIMITS.revisionsBytes)throw new BadRequestException('工作簿历史达到 256 MiB 容量上限；内容未覆盖，请导出备份并新建工作簿。');
    const updated=await tx.freeWorkbook.updateMany({where:{id,revision:expected},data:{name:workbookName(checked.snapshot.name),snapshot:json(checked.snapshot),snapshotBytes:checked.bytes,snapshotHash:checked.hash,revision:{increment:1},updatedById:actor.id}});if(updated.count!==1)throw new ConflictException('工作簿版本冲突，未覆盖服务器内容。');
    await tx.freeWorkbookRevision.create({data:{workbookId:id,revision:expected+1,snapshot:json(checked.snapshot),snapshotBytes:checked.bytes,snapshotHash:checked.hash,actorUserId:actor.id,...(restoredFrom===undefined?{}:{restoredFrom})}});
    await this.audit(tx,actor,id,restoredFrom===undefined?'WORKBOOK_SAVED':'WORKBOOK_RESTORED',expected,expected+1,checked.hash,op,restoredFrom);
    return tx.freeWorkbook.findUniqueOrThrow({where:{id},select:META});
  }
  private async audit(tx:Prisma.TransactionClient,actor:AuthenticatedUser,id:string,action:string,before:number,after:number,hash:string,op:string,restoredFrom?:number){await tx.auditLog.create({data:{actorUserId:actor.id,targetType:'FREE_WORKBOOK',targetId:id,action,beforeData:{revision:before},afterData:{revision:after,sha256:hash},metadata:{operationId:op,...(restoredFrom===undefined?{}:{restoredFrom})}}});}
  private async command<T>(tx:Prisma.TransactionClient,actor:AuthenticatedUser,op:string,action:string,input:unknown,run:()=>Promise<T>):Promise<T>{
    const key=`free-workbook:${actor.id}:${op}`,hash=digest({action,input});await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
    const previous=await tx.adminCommandRequest.findUnique({where:{idempotencyKey:key}});if(previous){if(previous.actorUserId!==actor.id||previous.action!==action||previous.requestHash!==hash)throw new ConflictException('操作标识已用于不同内容。');return previous.result as T;}
    const result=await run();await tx.adminCommandRequest.create({data:{actorUserId:actor.id,idempotencyKey:key,action,requestHash:hash,result:json(result)}});return result;
  }
}
