import 'reflect-metadata';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {PrismaClient} from '@prisma/client';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import sharp from 'sharp';
import type {PrismaService} from '../../infra/prisma/prisma.service';
import {BusinessClock} from '../../common/business-clock';
import {TEAM_BUSINESS_PERMISSIONS} from '../../common/team-membership';
import {ActivityLogsService} from '../activity-logs/activity-logs.service';
import type {AuthenticatedUser} from '../auth/auth.types';
import {ProjectAccessService} from '../auth/project-access.service';
import {AttachmentsService} from '../attachments/attachments.service';
import {AttachmentStorageQuotaService} from '../attachments/attachment-storage-quota.service';
import {ReviewsService} from '../reviews/reviews.service';
import type {WorkflowsService} from '../workflows/workflows.service';
import {SheetImagesService} from './sheet-images.service';

const connection=process.env.SHEET_IMAGES_TEST_DATABASE_URL;
if(connection){const url=new URL(connection);if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='55438'||!/^\/sheet_images_[a-z0-9_]+$/.test(url.pathname))throw new Error('Only explicit disposable loopback:55438/sheet_images_* PostgreSQL is allowed.');}
function gate(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return{promise,resolve};}
class FixedBusinessClock extends BusinessClock {override now(){return new Date('2026-09-30T12:00:00.000Z');}}
// Real Prisma + ACL service + original attachment/quota/scan lifecycle + real
// ReviewsService.submitVisualDeltaReview. Only transport and scanner are synthetic.
// This test does NOT simulate a new per-project membership policy: admitted team
// members can currently access every existing project by application contract.
describe.skipIf(!connection).sequential('inspection photos and original monthly review transaction',()=>{
 let db:PrismaClient,actor:AuthenticatedUser,denied:AuthenticatedUser;
 let images:SheetImagesService,attachments:AttachmentsService,reviews:ReviewsService;
 const run=randomUUID(),binaries=new Map<string,Buffer>();let scanGate:{entered:ReturnType<typeof gate>;release:ReturnType<typeof gate>}|null=null;
 let file:{originalname:string;mimetype:string;size:number;buffer:Buffer};
 const layout={fieldKey:'photos',mode:'CELL',offsetX:0,offsetY:0,width:120,height:80};
 const prisma=()=>db as unknown as PrismaService;
 beforeAll(async()=>{
  db=new PrismaClient({datasources:{db:{url:connection!}}});await db.$connect();
  const makeActor=async(approved:boolean):Promise<AuthenticatedUser>=>{const user=await db.user.create({data:{username:`inspection-photo-${approved}-${run}`,name:approved?'合成检验普通员工':'合成待准入成员',teamAccessApproved:approved}});return{id:user.id,username:user.username,name:user.name,email:null,departmentId:null,departmentName:null,authSource:'local',authVersion:user.authVersion,isSystemAdmin:false,teamAccessApproved:approved,roleCodes:[],permissionCodes:approved?[...TEAM_BUSINESS_PERMISSIONS]:[]};};
  actor=await makeActor(true);denied=await makeActor(false);
  const access=new ProjectAccessService(prisma()),audit=new ActivityLogsService(prisma(),access);
  const storage={
   assertWriteCapacity:async()=>undefined,readAvailableBytes:async()=>100_000_000_000n,
   upload:async({storageKey,buffer}:{storageKey:string;buffer:Buffer})=>{binaries.set(storageKey,buffer);},
   promote:async({sourceStorageKey,destinationStorageKey}:{sourceStorageKey:string;destinationStorageKey:string})=>{binaries.set(destinationStorageKey,binaries.get(sourceStorageKey)!);binaries.delete(sourceStorageKey);},
   purge:async({storageKey}:{storageKey:string})=>{binaries.delete(storageKey);},
   inspect:async({storageKey}:{storageKey:string})=>({exists:binaries.has(storageKey),size:binaries.get(storageKey)?.length??null}),
   openDownload:async({storageKey}:{storageKey:string})=>{const buffer=binaries.get(storageKey);if(!buffer)throw new Error('Synthetic object missing');return{stream:Readable.from(buffer),contentLength:buffer.length};},
  };
  const config={get:(key:string)=>key==='objectStorageBucket'?'synthetic-inspection-images':undefined};
  const quota=new AttachmentStorageQuotaService(prisma(),config as never,storage as never,audit);
  const scanner={scan:async()=>{const current=scanGate;if(current){current.entered.resolve();await current.release.promise;}return{verdict:'CLEAN',engine:'synthetic',engineVersion:'1',signatureVersion:'1',resultSummary:'CLEAN',scannedAt:new Date()};}};
  attachments=new AttachmentsService(prisma(),config as never,audit,storage as never,quota,access,scanner as never);images=new SheetImagesService(prisma(),attachments,access);
  const workflow=new Proxy({} as WorkflowsService,{get(){throw new Error('Submission must not complete or advance a workflow task');}});
  reviews=new ReviewsService(prisma(),audit,attachments,workflow,access,new FixedBusinessClock());
  const buffer=await sharp({create:{width:16,height:16,channels:3,background:'#af7812'}}).png().toBuffer();file={originalname:'synthetic-inspection.png',mimetype:'image/png',size:buffer.length,buffer};
 },30000);
 afterAll(async()=>{scanGate?.release.resolve();if(db)await db.$disconnect();});
 async function fixture(label:string){
  const base=await db.productionBase.create({data:{code:`img-${label}-${run}`,name:`合成图片基地-${label}`}});
  const color=await db.color.create({data:{name:`合成图片颜色-${label}`,productionBaseId:base.id}});
  const version=await db.colorVersion.create({data:{colorId:color.id,versionNo:1,boardCode:`img-${label}`}});
  const project=await db.project.create({data:{code:`img-${label}-${run}`,name:`合成第17步-${label}`,primaryColorId:color.id,status:'IN_PROGRESS',currentNodeCode:'VISUAL_COLOR_DIFFERENCE_REVIEW',ownerUserId:actor.id}});
  const instance=await db.workflowInstance.create({data:{projectId:project.id,instanceNo:`img-${label}-${run}`,status:'RUNNING',currentNodeCode:'VISUAL_COLOR_DIFFERENCE_REVIEW'}});
  await db.workflowTask.create({data:{projectId:project.id,workflowInstanceId:instance.id,taskNo:`img-mass-${label}-${run}`,nodeCode:'MASS_PRODUCTION',nodeName:'合成已达到量产前置',isActive:false,status:'COMPLETED'}});
  const task=await db.workflowTask.create({data:{projectId:project.id,workflowInstanceId:instance.id,taskNo:`img-review-${label}-${run}`,nodeCode:'VISUAL_COLOR_DIFFERENCE_REVIEW',nodeName:'合成目视色差评审',isActive:true,status:'IN_PROGRESS'}});
  const plan=await db.recurringPlan.create({data:{projectId:project.id,sourceWorkflowTaskId:task.id,sourceNodeCode:'VISUAL_COLOR_DIFFERENCE_REVIEW',planCode:`img-plan-${label}-${run}`,frequency:'MONTHLY',totalCount:12,generatedCount:12,startDate:new Date('2026-01-01Z'),endDate:new Date('2026-12-31Z'),status:'ACTIVE'}});
  let september='';for(let i=0;i<12;i++){const month=await db.recurringTask.create({data:{recurringPlanId:plan.id,projectId:project.id,taskCode:`img-${label}-${i}-${run}`,periodIndex:i+1,periodLabel:`第${i+1}月`,plannedDate:new Date(Date.UTC(2026,i,1)),status:'PENDING'}});if(i===8)september=month.id;}
  const review=await db.reviewRecord.create({data:{projectId:project.id,workflowTaskId:task.id,standardVersionId:version.id,reviewType:'VISUAL_COLOR_DIFFERENCE_REVIEW',reviewerId:actor.id,reviewedAt:new Date('2026-09-15Z'),reviewPeriod:'2026-09',result:'APPROVED',comment:'合成有效草稿，未提交'}});
  const activity=await db.inspectionActivity.create({data:{activityDate:new Date('2026-09-15Z'),productionBaseId:base.id,createdById:actor.id,projectId:project.id,reviewRecordId:review.id,recurringTaskId:september}});
  const object=await db.inspectionObject.create({data:{objectKind:'VEHICLE',objectCode:`img-${label}-${run}`}});
  const occurrence=await db.inspectionOccurrence.create({data:{activityId:activity.id,objectId:object.id,colorId:color.id,overallConclusion:'PENDING'}});
  await db.inspectionMeasurement.create({data:{occurrenceId:occurrence.id,pointLabel:'左门',groupLabel:'初测',standardVersionId:version.id}});
  return{project,task,plan,review,activity,occurrence,september};
 }
 it('submits through the real review service while a photo is scanning, then refuses CLEAN binding and purges its reserved bytes',async()=>{
  const value=await fixture('submit-wins'),operationId=randomUUID();scanGate={entered:gate(),release:gate()};const current=scanGate;
  // Attach a rejection handler immediately; no unhandled rejection while waiting.
  const outcome=images.upload({operationId,targetType:'SHEET_INSPECTION',recordId:value.occurrence.id,layout},file,actor).then(result=>({ok:true as const,result}),error=>({ok:false as const,error}));
  try{
   await current.entered.promise;
   expect(await db.attachment.count({where:{entityId:value.occurrence.id,scanStatus:'PENDING_SCAN'}})).toBe(1);
   await reviews.submitVisualDeltaReview(value.project.id,value.review.id,actor);
   expect((await db.reviewRecord.findUniqueOrThrow({where:{id:value.review.id}})).submittedAt).not.toBeNull();
   expect(await db.recurringTask.findUniqueOrThrow({where:{id:value.september}})).toMatchObject({status:'PENDING',completedAt:null});
  }finally{current.release.resolve();scanGate=null;}
  const result=await outcome;expect(result.ok).toBe(false);if('error' in result)expect(result.error).toMatchObject({status:409});
  expect(await db.sheetImage.count({where:{recordId:value.occurrence.id}})).toBe(0);
  expect(await db.attachment.count({where:{entityId:value.occurrence.id,scanStatus:'CLEAN'}})).toBe(0);
  const reserved=await db.attachmentStorageReservation.findMany({where:{targetId:value.occurrence.id}});expect(reserved).toHaveLength(1);expect(reserved[0]).toMatchObject({state:'PURGED',purgedAt:expect.any(Date)});
  expect(binaries.has(reserved[0]!.cleanStorageKey)).toBe(false);expect(binaries.has(reserved[0]!.quarantineStorageKey)).toBe(false);
  expect(await db.auditLog.count({where:{targetId:value.review.id,action:'VISUAL_DELTA_REVIEW_SUBMITTED'}})).toBe(1);
  expect(await db.auditLog.count({where:{action:'SHEET_IMAGE_ADDED',targetId:reserved[0]!.attachmentId!}})).toBe(0);
 },30000);
 it('retains earlier CLEAN evidence after submission, locks layout/delete, and denies non-admitted actors list/thumbnail/original',async()=>{
  const value=await fixture('image-wins');const saved=await images.upload({operationId:randomUUID(),targetType:'SHEET_INSPECTION',recordId:value.occurrence.id,layout},file,actor);
  await reviews.submitVisualDeltaReview(value.project.id,value.review.id,actor);
  expect(await images.list({targetType:'SHEET_INSPECTION',recordIds:value.occurrence.id},actor)).toMatchObject({items:[{id:saved.image.id}]});
  expect((await sharp(await images.thumbnail(saved.image.id,actor)).metadata()).format).toBe('webp');
  const original=await attachments.getAttachmentContent(saved.image.attachmentId,actor);const chunks:Buffer[]=[];for await(const chunk of original.stream)chunks.push(Buffer.from(chunk));expect(Buffer.concat(chunks)).toEqual(file.buffer);
  for(const attempt of [()=>images.list({targetType:'SHEET_INSPECTION',recordIds:value.occurrence.id},denied),()=>images.thumbnail(saved.image.id,denied),()=>attachments.getAttachmentContent(saved.image.attachmentId,denied)])await expect(attempt()).rejects.toMatchObject({status:403});
  await expect(images.mutate(saved.image.id,{operationId:randomUUID(),expectedRevision:1,layout:{...layout,offsetX:40}},actor)).rejects.toMatchObject({status:409});
  await expect(images.mutate(saved.image.id,{operationId:randomUUID(),expectedRevision:1},actor,true)).rejects.toMatchObject({status:409});
  expect(await db.sheetImage.findUniqueOrThrow({where:{id:saved.image.id}})).toMatchObject({isDeleted:false,revision:1,recordId:value.occurrence.id});
  expect(await db.attachment.findUniqueOrThrow({where:{id:saved.image.attachmentId}})).toMatchObject({isDeleted:false,scanStatus:'CLEAN'});
  expect(await db.recurringTask.findUniqueOrThrow({where:{id:value.september}})).toMatchObject({status:'PENDING',completedAt:null});
 },30000);
});
