import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types';
import { WorkbooksService } from './workbooks.service';
import { validateSnapshot, WORKBOOK_DRAFT_LIMITS } from './workbook.rules';

const connection=process.env.WORKBOOK_DRAFT_TEST_DATABASE_URL;
if(connection){const url=new URL(connection);if(url.hostname!=='127.0.0.1'||url.port!=='55460'||!/^\/free_workbook_drafts_[a-z0-9_]+$/.test(url.pathname))throw new Error('Only isolated loopback:55460/free_workbook_drafts_* PostgreSQL allowed.');}
const snapshot=(id:string,name='合成草稿')=>({id,name,appVersion:'1.0.4',locale:'zhCN',styles:{bold:{bl:1}},sheetOrder:['s'],sheets:{s:{id:'s',name:'表一',rowCount:1000,columnCount:26,cellData:{0:{0:{v:'未提交中文',s:'bold'},1:{f:'=SUM(A2:A3)',v:3}}},mergeData:[{startRow:0,endRow:0,startColumn:3,endColumn:4}]}}});
const initial=(id:string,data:unknown=snapshot(id))=>({operationId:randomUUID(),expectedDraftId:null,expectedDraftRevision:0,baseWorkbookRevision:1,snapshot:data});
const expectation=(draft:{id:string;draftRevision:number})=>({expectedDraftId:draft.id,expectedDraftRevision:draft.draftRevision});

// Every run creates new synthetic identities. No other instance or real data is read.
describe.runIf(Boolean(connection)).sequential('replaceable workbook drafts on real PostgreSQL',()=>{
  const db=new PrismaClient({datasources:{db:{url:connection??'postgresql://unused:unused@127.0.0.1:55460/free_workbook_drafts_not_running'}}});
  let service:WorkbooksService,actor:AuthenticatedUser,peer:AuthenticatedUser;
  async function user(approved=true):Promise<AuthenticatedUser>{const row=await db.user.create({data:{username:`draft-${randomUUID()}`,name:'合成草稿成员',teamAccessApproved:approved}});return {id:row.id,username:row.username,name:row.name,email:null,departmentId:null,departmentName:null,isSystemAdmin:false,teamAccessApproved:approved,authSource:'local',roleCodes:[],permissionCodes:[],authVersion:row.authVersion};}
  async function create(owner=actor){const id=randomUUID(),data=snapshot(id);await service.create({id,name:data.name,snapshot:data,operationId:randomUUID()},owner);return {id,data};}
  async function fresh(){const owner=await user();const book=await create(owner);return {...book,owner};}
  beforeAll(async()=>{await db.$connect();service=new WorkbooksService(db as never);actor=await user();peer=await user();});
  afterAll(async()=>{await db.$disconnect();});

  it('overwrites a single draft without changing the formal snapshot, revision or history',async()=>{
    const {id,data,owner}=await fresh();let ack=await service.saveDraft(id,initial(id),owner);
    for(let n=0;n<6;n++)ack=await service.saveDraft(id,{...initial(id,{...data,name:`未提交 ${n}`}),...expectation(ack.currentDraft!)},owner);
    expect(ack.currentDraft).toMatchObject({draftRevision:7,baseWorkbookRevision:1});expect(ack.superseded).toBe(false);
    expect(await db.freeWorkbookDraft.count({where:{workbookId:id}})).toBe(1);
    expect(await db.freeWorkbookRevision.count({where:{workbookId:id}})).toBe(1);
    expect(await service.get(id,owner)).toMatchObject({revision:1,snapshot:data});
    expect((await service.getDraft(id,owner)).draft?.snapshot).toMatchObject({name:'未提交 5'});
    const requests=await db.adminCommandRequest.findMany({where:{actorUserId:owner.id,action:'WORKBOOK_DRAFT_SAVED'},select:{result:true}});
    expect(requests).toHaveLength(7);for(const request of requests){expect(JSON.stringify(request.result)).not.toContain('未提交');expect(JSON.stringify(request.result).length).toBeLessThan(1000);}
  });
  it('allows exactly one same-author CAS writer while a different author owns a separate slot',async()=>{
    const {id,owner}=await fresh(),start=await service.saveDraft(id,initial(id),owner);
    const result=await Promise.allSettled(['甲','乙'].map(name=>service.saveDraft(id,{...initial(id,snapshot(id,name)),...expectation(start.currentDraft!)},owner)));
    expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(result.filter(r=>r.status==='rejected')).toHaveLength(1);
    expect((await service.getDraft(id,peer)).draft).toBeNull();
    const theirs=await service.saveDraft(id,initial(id,snapshot(id,'同事的草稿')),peer);
    expect(theirs.currentDraft?.id).not.toBe(start.currentDraft?.id);
    await expect(service.discardDraft(id,{operationId:randomUUID(),...expectation(start.currentDraft!)},peer)).rejects.toMatchObject({status:409});
    expect(await db.freeWorkbookDraft.count({where:{workbookId:id}})).toBe(2);
  });
  it('replays exact lost requests once, refuses changed reuse and reports superseded receipts',async()=>{
    const {id,owner}=await fresh(),input=initial(id);
    const results=await Promise.all([service.saveDraft(id,input,owner),service.saveDraft(id,input,owner)]);
    expect(results[0].receipt).toEqual(results[1].receipt);expect(results[1].superseded).toBe(false);
    const newer=await service.saveDraft(id,{...initial(id,snapshot(id,'更新')), ...expectation(results[0].currentDraft!)},owner);
    const old=await service.saveDraft(id,input,owner);expect(old.receipt.draftRevision).toBe(1);expect(old.currentDraft?.draftRevision).toBe(2);expect(old.superseded).toBe(true);
    await expect(service.saveDraft(id,{...input,snapshot:snapshot(id,'changed')},owner)).rejects.toMatchObject({status:409});
    expect((await service.getDraft(id,owner)).draft?.id).toBe(newer.currentDraft?.id);
  });
  it('uses a new slot identity after discard and prevents ABA; old replay never recreates it',async()=>{
    const {id,owner}=await fresh(),firstInput=initial(id),first=await service.saveDraft(id,firstInput,owner);
    const discard={operationId:randomUUID(),...expectation(first.currentDraft!)};await service.discardDraft(id,discard,owner);
    const second=await service.saveDraft(id,initial(id),owner);expect(second.currentDraft?.id).not.toBe(first.currentDraft?.id);
    await expect(service.saveDraft(id,{...initial(id),...expectation(first.currentDraft!)},owner)).rejects.toMatchObject({status:409});
    const oldDelete=await service.discardDraft(id,discard,owner);expect(oldDelete.superseded).toBe(true);expect(oldDelete.currentDraft?.id).toBe(second.currentDraft?.id);
    const oldSave=await service.saveDraft(id,firstInput,owner);expect(oldSave.superseded).toBe(true);expect(oldSave.currentDraft?.id).toBe(second.currentDraft?.id);
  });
  it('keeps stale-base drafts recoverable but refuses publication over another formal writer',async()=>{
    const {id,data,owner}=await fresh();const start=await service.saveDraft(id,initial(id),owner);
    await service.save(id,{operationId:randomUUID(),expectedRevision:1,snapshot:{...data,name:'他人的正式修改'}},peer);
    const stale=await service.saveDraft(id,{...initial(id,snapshot(id,'仍可保留的草稿')),...expectation(start.currentDraft!)},owner);
    expect(stale.baseStale).toBe(true);expect((await service.getDraft(id,owner)).baseStale).toBe(true);
    for(const expectedWorkbookRevision of [1,2])await expect(service.publishDraft(id,{operationId:randomUUID(),...expectation(stale.currentDraft!),expectedWorkbookRevision},owner)).rejects.toMatchObject({status:409});
    expect((await service.getDraft(id,owner)).draft?.snapshot).toMatchObject({name:'仍可保留的草稿'});expect((await service.get(id,owner)).revision).toBe(2);
    await expect(service.saveDraft(id,{...initial(id),...expectation(stale.currentDraft!),baseWorkbookRevision:999},owner)).rejects.toMatchObject({status:400});
  });
  it('publishes once atomically and an old publish receipt cannot consume a newer draft',async()=>{
    const {id,owner}=await fresh(),saved=await service.saveDraft(id,initial(id,snapshot(id,'显式保存')),owner);
    const input={operationId:randomUUID(),...expectation(saved.currentDraft!),expectedWorkbookRevision:1};
    const result=await Promise.all([service.publishDraft(id,input,owner),service.publishDraft(id,input,owner)]);
    expect(result[0].receipt.workbook?.revision).toBe(2);expect(JSON.parse(JSON.stringify(result[1].receipt))).toEqual(JSON.parse(JSON.stringify(result[0].receipt)));
    expect(result[0].currentDraft).toBeNull();expect(result[0].superseded).toBe(false);
    expect((await service.get(id,owner)).snapshot).toMatchObject({name:'显式保存'});expect(await db.freeWorkbookRevision.count({where:{workbookId:id}})).toBe(2);
    expect(await db.auditLog.count({where:{targetId:id,action:'WORKBOOK_SAVED'}})).toBe(1);
    expect(await db.auditLog.count({where:{targetId:id,action:'WORKBOOK_DRAFT_PUBLISHED'}})).toBe(1);
    const next=await service.saveDraft(id,{...initial(id),baseWorkbookRevision:2},owner);
    const replay=await service.publishDraft(id,input,owner);expect(replay.superseded).toBe(true);expect(replay.currentDraft?.id).toBe(next.currentDraft?.id);
    expect(await db.freeWorkbookRevision.count({where:{workbookId:id}})).toBe(2);
  });
  it('requires current admission on read, save, discard and publish including replay',async()=>{
    const {id,owner}=await fresh(),input=initial(id),saved=await service.saveDraft(id,input,owner);
    await db.user.update({where:{id:owner.id},data:{teamAccessApproved:false,authVersion:{increment:1}}});
    await expect(service.getDraft(id,owner)).rejects.toMatchObject({status:403});
    await expect(service.saveDraft(id,input,owner)).rejects.toMatchObject({status:403});
    await expect(service.discardDraft(id,{operationId:randomUUID(),...expectation(saved.currentDraft!)},owner)).rejects.toMatchObject({status:403});
    await expect(service.publishDraft(id,{operationId:randomUUID(),...expectation(saved.currentDraft!),expectedWorkbookRevision:1},owner)).rejects.toMatchObject({status:403});
    expect(await db.freeWorkbookDraft.count({where:{workbookId:id}})).toBe(1);
  });
  it('rechecks image ownership/CLEAN at both autosave and publish and retains a rejected draft',async()=>{
    const {id,data,owner}=await fresh(),other=await create(owner),imageId=randomUUID();
    const picture={...data,sheets:{s:{...data.sheets.s,backgroundImage:{source:imageId,imageSourceType:'UUID'}}}};
    const attachment=await db.attachment.create({data:{entityType:'SHEET_WORKBOOK',entityId:other.id,bucket:'synthetic',storageKey:`synthetic/${randomUUID()}.png`,fileName:'synthetic.png',mimeType:'image/png',fileSize:10,scanStatus:'CLEAN',uploadedById:owner.id}});
    await db.sheetImage.create({data:{id:imageId,attachmentId:attachment.id,targetType:'SHEET_WORKBOOK',recordId:other.id,fieldKey:'photos',width:100,height:100,pixelWidth:1,pixelHeight:1,actorUserId:owner.id,operationId:randomUUID(),uploadHash:'c'.repeat(64)}});
    await expect(service.saveDraft(id,initial(id,picture),owner)).rejects.toMatchObject({status:400});
    await db.sheetImage.update({where:{id:imageId},data:{recordId:id}});await db.attachment.update({where:{id:attachment.id},data:{entityId:id,scanStatus:'PENDING_SCAN'}});
    await expect(service.saveDraft(id,initial(id,picture),owner)).rejects.toMatchObject({status:400});
    await db.attachment.update({where:{id:attachment.id},data:{scanStatus:'CLEAN'}});
    const saved=await service.saveDraft(id,initial(id,picture),owner),input={operationId:randomUUID(),...expectation(saved.currentDraft!),expectedWorkbookRevision:1};
    await db.attachment.update({where:{id:attachment.id},data:{scanStatus:'PENDING_SCAN'}});
    await expect(service.publishDraft(id,input,owner)).rejects.toMatchObject({status:400});expect((await service.getDraft(id,owner)).draft?.snapshot).toEqual(picture);
    await db.attachment.update({where:{id:attachment.id},data:{scanStatus:'CLEAN'}});
    expect((await service.publishDraft(id,input,owner)).receipt.workbook?.revision).toBe(2);
  });
  it('rolls back draft, publication, history and command receipt when audit fails',async()=>{
    const {id,owner}=await fresh(),saved=await service.saveDraft(id,initial(id),owner);
    const failing=new Proxy(db,{get(target,key){if(key==='$transaction')return (fn:(tx:unknown)=>Promise<unknown>,options:never)=>target.$transaction(tx=>fn(new Proxy(tx,{get(transaction,prop){if(prop==='auditLog')return {create:async()=>{throw new Error('SYNTHETIC_DRAFT_AUDIT_FAILURE');}};const value=Reflect.get(transaction,prop);return typeof value==='function'?value.bind(transaction):value;}})),options);const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
    const failService=new WorkbooksService(failing as never);
    const operations=[()=>failService.saveDraft(id,{...initial(id),...expectation(saved.currentDraft!)},owner),()=>failService.discardDraft(id,{operationId:randomUUID(),...expectation(saved.currentDraft!)},owner),()=>failService.publishDraft(id,{operationId:randomUUID(),...expectation(saved.currentDraft!),expectedWorkbookRevision:1},owner)];
    const before=await db.adminCommandRequest.count({where:{actorUserId:owner.id}});
    for(const operation of operations){await expect(operation()).rejects.toThrow('SYNTHETIC_DRAFT_AUDIT_FAILURE');expect((await service.getDraft(id,owner)).draft?.draftRevision).toBe(1);expect((await service.get(id,owner)).revision).toBe(1);expect(await db.freeWorkbookRevision.count({where:{workbookId:id}})).toBe(1);}
    expect(await db.adminCommandRequest.count({where:{actorUserId:owner.id}})).toBe(before);
  });
  it('enforces slot quota under two different-workbook writers, permits overwrite, and explicit discard frees space',async()=>{
    const owner=await user(),books=[];for(let n=0;n<9;n++)books.push(await create(owner));
    for(const book of books.slice(0,7))await service.saveDraft(book.id,initial(book.id),owner);
    const raced=await Promise.allSettled(books.slice(7).map(book=>service.saveDraft(book.id,initial(book.id),owner)));
    expect(raced.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(raced.filter(r=>r.status==='rejected')).toHaveLength(1);
    expect(await db.freeWorkbookDraft.count({where:{authorUserId:owner.id}})).toBe(8);
    const first=await service.getDraft(books[0]!.id,owner);expect((await service.saveDraft(books[0]!.id,{...initial(books[0]!.id),...expectation(first.draft!)},owner)).currentDraft?.draftRevision).toBe(2);
    const current=await service.getDraft(books[0]!.id,owner);await service.discardDraft(books[0]!.id,{operationId:randomUUID(),...expectation(current.draft!)},owner);
    const missing=await db.freeWorkbook.findFirstOrThrow({where:{id:{in:books.map(b=>b.id)},drafts:{none:{authorUserId:owner.id}}},select:{id:true}});
    expect((await service.saveDraft(missing.id,initial(missing.id),owner)).currentDraft?.draftRevision).toBe(1);
  });
  it('retains the slot when formal history capacity rejects publication',async()=>{
    const {id,data,owner}=await fresh(),saved=await service.saveDraft(id,initial(id),owner);
    // Existing history budget is metadata-based. This fixture models an already-full history without allocating 256 MiB in the test process.
    await db.freeWorkbookRevision.createMany({data:Array.from({length:37},(_,n)=>({workbookId:id,revision:n+2,snapshot:data,snapshotBytes:7*1024*1024,snapshotHash:'a'.repeat(64),actorUserId:owner.id}))});
    await expect(service.publishDraft(id,{operationId:randomUUID(),...expectation(saved.currentDraft!),expectedWorkbookRevision:1},owner)).rejects.toThrow('256 MiB');
    expect((await service.getDraft(id,owner)).draft?.id).toBe(saved.currentDraft?.id);expect((await service.get(id,owner)).revision).toBe(1);
  });
  it('serializes global byte quota and accounts for overwrite deltas without evicting other authors',async()=>{
    const {id,data,owner}=await fresh(),peerOwner=await user();
    const existing=(await db.freeWorkbookDraft.aggregate({_sum:{snapshotBytes:true}}))._sum.snapshotBytes??0;
    const fillBytes=WORKBOOK_DRAFT_LIMITS.bytesGlobal-existing-1024;
    const fixtureAuthors:AuthenticatedUser[]=[];
    function sized(bytes:number){
      const cellData:Record<string,Record<string,{v:string}>>={};
      const result={...data,sheets:{s:{...data.sheets.s,cellData}}};
      let remaining=bytes-Buffer.byteLength(JSON.stringify(result)),row=0;
      while(remaining>0){const overhead=Buffer.byteLength(JSON.stringify({[row]:{0:{v:''}}}))-2+(row?1:0);const length=Math.min(32700,remaining-overhead);if(length<0)throw new Error('Synthetic snapshot size cannot be represented');cellData[String(row)]={0:{v:'x'.repeat(length)}};remaining-=overhead+length;row++;}
      const checked=validateSnapshot(result,id);expect(checked.bytes).toBe(bytes);return checked;
    }
    // Real valid snapshots fill the storage budget. PostgreSQL receives the repeated large JSON once,
    // avoiding hundreds of MiB of JS fixture arrays while exercising the actual aggregate and quota lock.
    const chunk=7*1024*1024,full=Math.floor(fillBytes/chunk),remainder=fillBytes%chunk;
    for(let n=0;n<full+(remainder?1:0);n++)fixtureAuthors.push(await user());
    const bulk=sized(chunk);
    await db.$executeRaw(Prisma.sql`INSERT INTO free_workbook_drafts (id,"workbookId","authorUserId","draftRevision","baseWorkbookRevision",snapshot,"snapshotBytes","snapshotHash","createdAt","updatedAt")
      SELECT gen_random_uuid(),${id}::uuid,u,1,1,${JSON.stringify(bulk.snapshot)}::jsonb,${bulk.bytes},${bulk.hash},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM unnest(ARRAY[${Prisma.join(fixtureAuthors.slice(0,full).map(u=>u.id))}]::text[]) AS u`);
    if(remainder){const last=sized(remainder);await db.freeWorkbookDraft.create({data:{workbookId:id,authorUserId:fixtureAuthors.at(-1)!.id,baseWorkbookRevision:1,snapshot:last.snapshot as Prisma.InputJsonObject,snapshotBytes:last.bytes,snapshotHash:last.hash}});}
    try{
      const value={...data,name:'有界配额',sheets:{s:{...data.sheets.s,cellData:{0:{0:{v:'x'.repeat(400)}}}}}};
      const bytes=validateSnapshot(value,id).bytes;expect(bytes).toBeGreaterThan(512);expect(bytes).toBeLessThan(1024);
      const results=await Promise.allSettled([service.saveDraft(id,initial(id,value),owner),service.saveDraft(id,initial(id,value),peerOwner)]);
      expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
      const winning=results[0]!.status==='fulfilled'?owner:peerOwner,current=await service.getDraft(id,winning);
      expect((await service.saveDraft(id,{...initial(id,data),...expectation(current.draft!)},winning)).currentDraft?.snapshotBytes).toBeLessThan(bytes);
      expect(await db.freeWorkbookDraft.count({where:{authorUserId:{in:fixtureAuthors.map(u=>u.id)}}})).toBe(fixtureAuthors.length);
    }finally{
      // Explicit, audited discard of only this test's quota fixtures retains receipts/audits and makes repeat runs safe.
      for(const fixture of fixtureAuthors){const draft=await db.freeWorkbookDraft.findUniqueOrThrow({where:{workbookId_authorUserId:{workbookId:id,authorUserId:fixture.id}},select:{id:true,draftRevision:true}});await service.discardDraft(id,{operationId:randomUUID(),...expectation(draft)},fixture);}
    }
  },60000);
  it('database constraints reject invalid versions/size/hash/base while preserving the existing slot',async()=>{
    const {id,owner}=await fresh(),saved=await service.saveDraft(id,initial(id),owner),draftId=saved.currentDraft!.id;
    const invalid=[['draftRevision',0,'23514'],['baseWorkbookRevision',0,'23514'],['snapshotBytes',0,'23514'],['snapshotBytes',7340033,'23514'],['snapshotHash','bad','23514'],['baseWorkbookRevision',999,'23503']] as const;
    for(const [column,value,sqlstate] of invalid){
      // Column identifiers come only from the fixed matrix above; values stay bound.
      await expect(db.$executeRaw(Prisma.sql`UPDATE free_workbook_drafts SET ${Prisma.raw('"'+column+'"')}=${value} WHERE id=${draftId}::uuid`)).rejects.toMatchObject({code:'P2010',meta:{code:sqlstate}});
      expect((await service.getDraft(id,owner)).draft?.draftRevision).toBe(1);
    }
    expect((await service.getDraft(id,owner)).draft?.draftRevision).toBe(1);
  });
});
