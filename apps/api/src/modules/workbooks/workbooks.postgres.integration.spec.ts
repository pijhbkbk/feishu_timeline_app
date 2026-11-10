import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types';
import { WorkbooksService } from './workbooks.service';
import { validateSnapshot } from './workbook.rules';
import { insertWorkbookDraftSnapshot, insertWorkbookRevisionSnapshot, insertWorkbookSnapshot, updateWorkbookDraftSnapshot, updateWorkbookSnapshot } from './workbook-snapshot-storage';
const connection=process.env.WORKBOOK_TEST_DATABASE_URL??process.env.WORKBOOK_DRAFT_TEST_DATABASE_URL;
if(connection){const url=new URL(connection);const allowed=url.port==='55438'&&/^\/free_workbook_[a-z0-9_]+$/.test(url.pathname)||url.port==='55460'&&/^\/free_workbook_drafts_[a-z0-9_]+$/.test(url.pathname);if(url.hostname!=='127.0.0.1'||!allowed)throw new Error('Only explicit isolated workbook PostgreSQL targets allowed.');}
const snapshot=(id:string,name='合成工作簿')=>({id,name,appVersion:'1.0.4',locale:'zhCN',styles:{bold:{bl:1,fs:16}},sheetOrder:['s1','s2'],sheets:{s1:{id:'s1',name:'清单',rowCount:100,columnCount:26,cellData:{0:{0:{v:'原始中文',s:'bold'},1:{v:2}},1:{1:{f:'=SUM(B1:B1)',v:2}}},mergeData:[{startRow:0,endRow:0,startColumn:3,endColumn:4}],rowData:{0:{h:32}},columnData:{0:{w:180}}},s2:{id:'s2',name:'资料',rowCount:100,columnCount:26,cellData:{}}}});
describe.runIf(Boolean(connection)).sequential('free workbook real PostgreSQL CAS and history',()=>{
 const db=new PrismaClient({datasources:{db:{url:connection??'postgresql://synthetic:synthetic@127.0.0.1:55438/free_workbook_not_running'}}});let service:WorkbooksService,actor:AuthenticatedUser,peer:AuthenticatedUser,outsider:AuthenticatedUser;
 async function user(approved:boolean):Promise<AuthenticatedUser>{const row=await db.user.create({data:{username:`wb-${randomUUID()}`,name:'合成工作簿成员',teamAccessApproved:approved}});return {id:row.id,username:row.username,name:row.name,email:null,departmentId:null,departmentName:null,isSystemAdmin:false,teamAccessApproved:approved,authSource:'local',roleCodes:[],permissionCodes:[],authVersion:row.authVersion};}
 async function create(){const id=randomUUID(),data=snapshot(id);await service.create({id,name:data.name,snapshot:data,operationId:randomUUID()},actor);return {id,data};}
 beforeAll(async()=>{await db.$connect();service=new WorkbooksService(db as never);actor=await user(true);peer=await user(true);outsider=await user(false);});afterAll(async()=>{await db.$disconnect();});
 it.each(['UTC', 'Asia/Shanghai'])('preserves UTC timestamps and snapshots in a %s database session', async (timezone) => {
  const id = randomUUID();
  const data = snapshot(id);
  data.sheets.s1.cellData[0][1].v = JSON.parse('121.12173461914062') as number;
  const initial = validateSnapshot(data, id);
  const edited = validateSnapshot({ ...data, name: 'UTC时间更新' }, id);
  const expectUtcWindow = (value: Date, before: number, after: number) => {
   expect(value).toBeInstanceOf(Date);
   expect(value.getTime()).toBeGreaterThanOrEqual(before);
   expect(value.getTime()).toBeLessThanOrEqual(after);
  };
  const expected = await db.$transaction(async tx => {
   const session = await tx.$queryRaw<Array<{ set_config: string }>>(Prisma.sql`SELECT set_config('TimeZone', ${timezone}, true)`);
   expect(session).toEqual([{ set_config: timezone }]);
   let before = Date.now();
   const created = await insertWorkbookSnapshot(tx, id, data.name, actor.id, initial);
   const currentBefore = await tx.freeWorkbook.findUniqueOrThrow({ where: { id } });
   expectUtcWindow(currentBefore.createdAt, before, Date.now());
   expectUtcWindow(created.updatedAt, before, Date.now());
   expect(currentBefore.updatedAt).toEqual(created.updatedAt);
   expect(currentBefore.createdAt).toEqual(currentBefore.updatedAt);

   before = Date.now();
   await insertWorkbookRevisionSnapshot(tx, id, 1, actor.id, initial);
   const firstHistory = await tx.freeWorkbookRevision.findUniqueOrThrow({ where: { workbookId_revision: { workbookId: id, revision: 1 } } });
   expectUtcWindow(firstHistory.createdAt, before, Date.now());

   before = Date.now();
   const draft = await insertWorkbookDraftSnapshot(tx, id, actor.id, 1, initial);
   const draftBefore = await tx.freeWorkbookDraft.findUniqueOrThrow({ where: { id: draft.id } });
   expectUtcWindow(draftBefore.createdAt, before, Date.now());
   expectUtcWindow(draft.updatedAt, before, Date.now());
   expect(draftBefore.updatedAt).toEqual(draft.updatedAt);
   expect(draftBefore.createdAt).toEqual(draftBefore.updatedAt);

   before = Date.now();
   expect(await updateWorkbookSnapshot(tx, id, 1, 'UTC时间更新', actor.id, edited)).toBe(1);
   const currentAfter = await tx.freeWorkbook.findUniqueOrThrow({ where: { id } });
   expectUtcWindow(currentAfter.updatedAt, before, Date.now());
   expect(currentAfter.createdAt).toEqual(currentBefore.createdAt);
   expect(currentAfter.updatedAt.getTime()).toBeGreaterThanOrEqual(currentBefore.updatedAt.getTime());

   before = Date.now();
   await insertWorkbookRevisionSnapshot(tx, id, 2, actor.id, edited);
   const secondHistory = await tx.freeWorkbookRevision.findUniqueOrThrow({ where: { workbookId_revision: { workbookId: id, revision: 2 } } });
   expectUtcWindow(secondHistory.createdAt, before, Date.now());

   before = Date.now();
   expect(await updateWorkbookDraftSnapshot(tx, draft.id, actor.id, 1, 2, edited)).toBe(1);
   const draftAfter = await tx.freeWorkbookDraft.findUniqueOrThrow({ where: { id: draft.id } });
   expectUtcWindow(draftAfter.updatedAt, before, Date.now());
   expect(draftAfter.createdAt).toEqual(draftBefore.createdAt);
   expect(draftAfter.updatedAt.getTime()).toBeGreaterThanOrEqual(draftBefore.updatedAt.getTime());
   expect(await updateWorkbookSnapshot(tx, id, 1, data.name, actor.id, initial)).toBe(0);
   expect(await updateWorkbookDraftSnapshot(tx, draft.id, actor.id, 1, 1, initial)).toBe(0);
   expect(await tx.freeWorkbook.findUniqueOrThrow({ where: { id } })).toEqual(currentAfter);
   expect(await tx.freeWorkbookDraft.findUniqueOrThrow({ where: { id: draft.id } })).toEqual(draftAfter);
   expect(await tx.freeWorkbookRevision.findUniqueOrThrow({ where: { workbookId_revision: { workbookId: id, revision: 1 } } })).toEqual(firstHistory);
   for (const row of [currentAfter, draftAfter, secondHistory]) {
    expect(row.snapshot).toEqual(edited.snapshot);
    expect(row.snapshotHash).toBe(edited.hash);
    expect(row.snapshotBytes).toBe(edited.bytes);
   }
   return { currentAfter, draftAfter, secondHistory };
  });
  expect(await db.freeWorkbook.findUniqueOrThrow({ where: { id } })).toEqual(expected.currentAfter);
  expect(await db.freeWorkbookDraft.findUniqueOrThrow({ where: { id: expected.draftAfter.id } })).toEqual(expected.draftAfter);
  expect(await db.freeWorkbookRevision.findUniqueOrThrow({ where: { workbookId_revision: { workbookId: id, revision: 2 } } })).toEqual(expected.secondHistory);
 });
 it('preserves submitted numeric values through current, history and restore storage',async()=>{
  const id=randomUUID(),base=snapshot(id),width=JSON.parse('121.12173461914062') as number;
  const data={...base,sheets:{...base.sheets,s1:{...base.sheets.s1,cellData:{
   0:{0:{v:'精度回归',p:{body:{dataStream:'精度回归\r\n'},documentStyle:{pageSize:{width}}}},1:{v:width}},
   1:{0:{v:1.0000000000000002},1:{v:0.30000000000000004}},
  }}}};
  const checked=validateSnapshot(data,id);
  const created=await service.create({id,name:data.name,snapshot:data,operationId:randomUUID()},actor);
  expect(created.snapshotHash).toBe(checked.hash);
  expect((await service.get(id,actor)).snapshot).toEqual(data);
  const rows=await db.$queryRaw<Array<{width:string;value:string;bytes:number;hash:string}>>(Prisma.sql`
   SELECT snapshot #>> '{sheets,s1,cellData,0,0,p,documentStyle,pageSize,width}' AS width,
    snapshot #>> '{sheets,s1,cellData,0,1,v}' AS value,"snapshotBytes" AS bytes,"snapshotHash" AS hash
   FROM free_workbooks WHERE id=${id}::uuid
   UNION ALL
   SELECT snapshot #>> '{sheets,s1,cellData,0,0,p,documentStyle,pageSize,width}',
    snapshot #>> '{sheets,s1,cellData,0,1,v}',"snapshotBytes","snapshotHash"
   FROM free_workbook_revisions WHERE "workbookId"=${id}::uuid AND revision=1`);
  expect(rows).toHaveLength(2);
  for(const row of rows)expect(row).toEqual({width:String(width),value:String(width),bytes:checked.bytes,hash:checked.hash});
  const edited={...data,name:'精度修改'};
  expect((await service.save(id,{expectedRevision:1,operationId:randomUUID(),snapshot:edited},actor)).revision).toBe(2);
  expect((await service.get(id,actor)).snapshot).toEqual(edited);
  expect((await db.freeWorkbookRevision.findUniqueOrThrow({where:{workbookId_revision:{workbookId:id,revision:2}}})).snapshot).toEqual(edited);
  expect((await service.restore(id,{expectedRevision:2,revision:1,operationId:randomUUID()},actor)).revision).toBe(3);
  expect((await service.get(id,actor)).snapshot).toEqual(data);
  expect((await db.freeWorkbookRevision.findUniqueOrThrow({where:{workbookId_revision:{workbookId:id,revision:1}}})).snapshot).toEqual(data);
 });
 it('replays concurrent exact create once, rejects changed reuse, and does not touch colors',async()=>{const before=await db.color.count(),id=randomUUID(),data=snapshot(id),input={id,name:data.name,snapshot:data,operationId:randomUUID()};const results=await Promise.all([service.create(input,actor),service.create(input,actor)]);expect(results.map(r=>r.id)).toEqual([id,id]);expect(await db.freeWorkbookRevision.count({where:{workbookId:id}})).toBe(1);await expect(service.create({...input,snapshot:{...data,name:'changed'},name:'changed'},actor)).rejects.toMatchObject({status:409});expect(await db.color.count()).toBe(before);});
 it('allows exactly one of two writers and returns the exact winning snapshot',async()=>{const {id,data}=await create();const a={...data,name:'成员A'},b={...data,name:'成员B'};const results=await Promise.allSettled([service.save(id,{expectedRevision:1,operationId:randomUUID(),snapshot:a},actor),service.save(id,{expectedRevision:1,operationId:randomUUID(),snapshot:b},peer)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);const row=await service.get(id,actor);expect(row.revision).toBe(2);expect([a,b]).toContainEqual(row.snapshot);expect(await db.freeWorkbookRevision.count({where:{workbookId:id}})).toBe(2);});
 it('replays an acknowledged-or-lost save without writing again and restores a full old version',async()=>{const {id,data}=await create();const edit={...data,name:'修改后的工作簿'},input={expectedRevision:1,operationId:randomUUID(),snapshot:edit};const first=await service.save(id,input,actor);const replay=await service.save(id,input,actor);expect(first.revision).toBe(replay.revision);expect(await db.freeWorkbookRevision.count({where:{workbookId:id}})).toBe(2);const restore={expectedRevision:2,revision:1,operationId:randomUUID()};expect((await service.restore(id,restore,peer)).revision).toBe(3);expect((await service.restore(id,restore,peer)).revision).toBe(3);expect((await service.get(id,actor)).snapshot).toEqual(data);expect(await db.freeWorkbookRevision.count({where:{workbookId:id}})).toBe(3);expect((await service.revisions(id,{},actor)).items[0]).toMatchObject({revision:3,restoredFrom:1});});
 it('denies unapproved reads and writes and serializes current admission revocation',async()=>{const {id,data}=await create();await expect(service.get(id,outsider)).rejects.toMatchObject({status:403});await expect(service.save(id,{expectedRevision:1,operationId:randomUUID(),snapshot:data},outsider)).rejects.toMatchObject({status:403});const revoked=await user(true);await db.user.update({where:{id:revoked.id},data:{teamAccessApproved:false,authVersion:{increment:1}}});await expect(service.save(id,{expectedRevision:1,operationId:randomUUID(),snapshot:data},revoked)).rejects.toMatchObject({status:403});expect((await service.get(id,actor)).revision).toBe(1);});
 it('rejects image references belonging to another workbook or not CLEAN',async()=>{const {id,data}=await create(),other=await create(),imageId=randomUUID();const drawing={drawingId:'draw1',drawingType:0,source:imageId,imageSourceType:'UUID',unitId:id,subUnitId:'s1',sheetTransform:{from:{row:0,column:0,rowOffset:0,columnOffset:0},to:{row:1,column:1,rowOffset:0,columnOffset:0}},axisAlignSheetTransform:{from:{row:0,column:0,rowOffset:0,columnOffset:0},to:{row:1,column:1,rowOffset:0,columnOffset:0}}};const withImage={...data,resources:[{name:'SHEET_DRAWING_PLUGIN',data:JSON.stringify({s1:{data:{draw1:drawing},order:['draw1']}})}]};const attachment=await db.attachment.create({data:{entityType:'SHEET_WORKBOOK',entityId:other.id,bucket:'synthetic',storageKey:`synthetic/${randomUUID()}.png`,fileName:'synthetic.png',mimeType:'image/png',fileSize:10,scanStatus:'CLEAN',uploadedById:actor.id}});await db.sheetImage.create({data:{id:imageId,attachmentId:attachment.id,targetType:'SHEET_WORKBOOK',recordId:other.id,fieldKey:'photos',width:100,height:100,pixelWidth:1,pixelHeight:1,actorUserId:actor.id,operationId:randomUUID(),uploadHash:'a'.repeat(64)}});await expect(service.save(id,{expectedRevision:1,operationId:randomUUID(),snapshot:withImage},actor)).rejects.toMatchObject({status:400});await db.sheetImage.update({where:{id:imageId},data:{recordId:id}});await db.attachment.update({where:{id:attachment.id},data:{entityId:id,scanStatus:'PENDING_SCAN'}});await expect(service.save(id,{expectedRevision:1,operationId:randomUUID(),snapshot:withImage},actor)).rejects.toMatchObject({status:400});await db.attachment.update({where:{id:attachment.id},data:{scanStatus:'CLEAN'}});expect((await service.save(id,{expectedRevision:1,operationId:randomUUID(),snapshot:withImage},actor)).revision).toBe(2);expect((await service.get(id,actor)).snapshot).toEqual(withImage);});
 it('rolls back snapshot, revision and history if audit fails',async()=>{const {id,data}=await create();const failing=new Proxy(db,{get(target,key){if(key==='$transaction')return (fn:(tx:unknown)=>Promise<unknown>,options:never)=>target.$transaction(tx=>fn(new Proxy(tx,{get(transaction,prop){if(prop==='auditLog')return {create:async()=>{throw new Error('SYNTHETIC_AUDIT_FAILURE');}};const value=Reflect.get(transaction,prop);return typeof value==='function'?value.bind(transaction):value;}})),options);const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});await expect(new WorkbooksService(failing as never).save(id,{expectedRevision:1,operationId:randomUUID(),snapshot:{...data,name:'must roll back'}},actor)).rejects.toThrow('SYNTHETIC_AUDIT_FAILURE');expect((await service.get(id,actor)).snapshot).toEqual(data);expect(await db.freeWorkbookRevision.count({where:{workbookId:id}})).toBe(1);});
 it('binds native backgrounds to CLEAN workbook assets and restores their exact snapshot',async()=>{const {id,data}=await create(),other=await create(),imageId=randomUUID();const withBackground={...data,sheets:{...data.sheets,s1:{...data.sheets.s1,backgroundImage:{source:imageId,imageSourceType:'UUID',scaleX:0.32,scaleY:0.32}}}};const attachment=await db.attachment.create({data:{entityType:'SHEET_WORKBOOK',entityId:other.id,bucket:'synthetic',storageKey:`synthetic/${randomUUID()}.png`,fileName:'synthetic-background.png',mimeType:'image/png',fileSize:10,scanStatus:'CLEAN',uploadedById:actor.id}});await db.sheetImage.create({data:{id:imageId,attachmentId:attachment.id,targetType:'SHEET_WORKBOOK',recordId:other.id,fieldKey:'photos',width:100,height:100,pixelWidth:1,pixelHeight:1,actorUserId:actor.id,operationId:randomUUID(),uploadHash:'b'.repeat(64)}});await expect(service.save(id,{expectedRevision:1,operationId:randomUUID(),snapshot:withBackground},actor)).rejects.toMatchObject({status:400});await db.sheetImage.update({where:{id:imageId},data:{recordId:id}});await db.attachment.update({where:{id:attachment.id},data:{entityId:id,scanStatus:'PENDING_SCAN'}});await expect(service.save(id,{expectedRevision:1,operationId:randomUUID(),snapshot:withBackground},actor)).rejects.toMatchObject({status:400});await db.attachment.update({where:{id:attachment.id},data:{scanStatus:'CLEAN'}});expect((await service.save(id,{expectedRevision:1,operationId:randomUUID(),snapshot:withBackground},actor)).revision).toBe(2);expect((await service.get(id,actor)).snapshot).toEqual(withBackground);await service.save(id,{expectedRevision:2,operationId:randomUUID(),snapshot:data},actor);await db.attachment.update({where:{id:attachment.id},data:{scanStatus:'PENDING_SCAN'}});await expect(service.restore(id,{expectedRevision:3,revision:2,operationId:randomUUID()},actor)).rejects.toMatchObject({status:400});await db.attachment.update({where:{id:attachment.id},data:{scanStatus:'CLEAN'}});expect((await service.restore(id,{expectedRevision:3,revision:2,operationId:randomUUID()},actor)).revision).toBe(4);expect((await service.get(id,actor)).snapshot).toEqual(withBackground);});

 it('bounds unique background decode pixels while counting a shared original only once',async()=>{const {id,data}=await create(),imageIds=[];for(let n=0;n<2;n++){const attachment=await db.attachment.create({data:{entityType:'SHEET_WORKBOOK',entityId:id,bucket:'synthetic',storageKey:`synthetic/${randomUUID()}.png`,fileName:'synthetic-budget.png',mimeType:'image/png',fileSize:100,scanStatus:'CLEAN',uploadedById:actor.id}});const image=await db.sheetImage.create({data:{attachmentId:attachment.id,targetType:'SHEET_WORKBOOK',recordId:id,fieldKey:'photos',width:100,height:100,pixelWidth:5000,pixelHeight:5000,actorUserId:actor.id,operationId:randomUUID(),uploadHash:'c'.repeat(64)}});imageIds.push(image.id);}const bg=(source:string)=>({source,imageSourceType:'UUID'}),tooLarge={...data,sheets:{s1:{...data.sheets.s1,backgroundImage:bg(imageIds[0]!)},s2:{...data.sheets.s2,backgroundImage:bg(imageIds[1]!)}}};await expect(service.save(id,{expectedRevision:1,operationId:randomUUID(),snapshot:tooLarge},actor)).rejects.toThrow('40 MP');tooLarge.sheets.s2.backgroundImage=bg(imageIds[0]!);expect((await service.save(id,{expectedRevision:1,operationId:randomUUID(),snapshot:tooLarge},actor)).revision).toBe(2);});

});
