import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { BusinessClock } from '../../common/business-clock';
import { ProductionFactsService } from '../production-facts/production-facts.service';
import { InspectionsService } from './inspections.service';
import { assertInspectionReviewLink } from './inspection-review-link';

const connection=process.env.LIGHT_TRUCK_FACTS_TEST_DATABASE_URL;
if(connection){const url=new URL(connection);if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='55438'||!/^\/light_truck_facts_test_[a-z0-9_]+$/.test(url.pathname))throw new Error('Use an explicit disposable light_truck_facts_test_* database at loopback:55438.');}
// Real SQL, locks, audit and transactions. No HTTP, scanner or browser claims.
describe.skipIf(!connection).sequential('light truck fact services on isolated PostgreSQL',()=>{
  let db:PrismaClient;let production:ProductionFactsService;let inspection:InspectionsService;let actor:AuthenticatedUser;
  const run=randomUUID();const op=()=>randomUUID();let baseA:string;let baseB:string;let colorA:string;let colorB:string;let colorC:string;
  const client=()=>db as unknown as PrismaService;
  const create=(clientId:string,colorId:string,baseId:string,quantity:number|null,month='2026-09')=>({kind:'create',clientId,colorId,baseId,quantity,month,rowKind:'MONTH_TOTAL'});
  const save=(items:unknown[],operationId=op())=>production.saveBatch({operationId,items},actor);
  function record<T>(value:unknown):T{return value as T;}
  beforeAll(async()=>{
    db=new PrismaClient({datasources:{db:{url:connection!}}});await db.$connect();
    const user=await db.user.create({data:{username:`facts-${run}`,name:'合成事实普通成员',teamAccessApproved:true}});
    actor={id:user.id,username:user.username,name:user.name,email:null,departmentId:null,departmentName:null,isSystemAdmin:false,teamAccessApproved:true,authSource:'local',authVersion:user.authVersion,roleCodes:[],permissionCodes:[]};
    baseA=(await db.productionBase.create({data:{code:`fact-a-${run}`,name:'合成基地甲'}})).id;baseB=(await db.productionBase.create({data:{code:`fact-b-${run}`,name:'合成基地乙'}})).id;
    colorA=(await db.color.create({data:{name:'同名合成色',productionBaseId:baseA}})).id;colorB=(await db.color.create({data:{name:'合成组合二',productionBaseId:baseA}})).id;colorC=(await db.color.create({data:{name:'同名合成色',productionBaseId:baseB}})).id;
    production=new ProductionFactsService(client());inspection=new InspectionsService(client(),new ProjectAccessService(client()),new BusinessClock());
  });
  afterAll(async()=>{if(db)await db.$disconnect();});

  it('records 10+12+5, corrects original 10 to 8, and never adds the replay',async()=>{
    const before=await production.statistics({fromMonth:'2026-09',toMonth:'2026-09'},actor);const operationId=op();const input=[{...create('a',colorA,baseA,10),source:{fileName:'合成来源.xlsx',sheetName:'月产量',rowNumbers:[2],fileHash:'a'.repeat(64)}},create('b',colorB,baseA,12),create('c',colorC,baseB,5)];
    const first=record<{items:Array<{id:string;clientId:string;revision:number}>}>(await save(input,operationId));const id=first.items.find(i=>i.clientId==='a')!.id;
    const initial=await production.statistics({fromMonth:'2026-09',toMonth:'2026-09'},actor);expect(Number(initial.knownQuantity)-Number(before.knownQuantity)).toBe(27);expect((await production.statistics({baseId:baseA},actor)).quantity).toBe('22');
    await save([{kind:'update',id,expectedRevision:1,quantity:8}]);expect((await production.statistics({baseId:baseA},actor)).quantity).toBe('20');
    const corrected=await production.statistics({fromMonth:'2026-09',toMonth:'2026-09'},actor);expect(Number(corrected.knownQuantity)-Number(before.knownQuantity)).toBe(25);expect(corrected.factCount-before.factCount).toBe(3);
    await save(input,operationId);expect(await production.detail(id,actor)).toMatchObject({id,revision:2,quantity:'8',originalSource:{fileName:'合成来源.xlsx',rowNumbers:[2]}});
    expect(await db.auditLog.count({where:{actorUserId:actor.id,action:'COLOR_PRODUCTION_FACT_CREATED'}})).toBe(3);
    await expect(save([{kind:'update',id,expectedRevision:1,quantity:99}])).rejects.toMatchObject({status:409});
  });
  it('keeps an atomic batch and exposes exactly one winner under stale concurrent versions',async()=>{
    const first=record<{items:Array<{id:string}>}>(await save([create('p',colorA,baseA,1,'2026-10'),create('q',colorB,baseA,2,'2026-10')])).items;
    const id=first[0]!.id;const second=first[1]!.id;
    const results=await Promise.allSettled([save([{kind:'update',id,expectedRevision:1,quantity:7}]),save([{kind:'update',id,expectedRevision:1,quantity:8}])]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    await expect(save([{kind:'update',id:second,expectedRevision:1,quantity:44},{kind:'update',id,expectedRevision:1,quantity:99}])).rejects.toMatchObject({status:409});expect(await production.detail(second,actor)).toMatchObject({revision:1,quantity:'2'});
  });
  it('rejects unknown colors, repeated grains and detail imports rather than double-counting 100+40+60',async()=>{
    await save([create('total',colorA,baseA,100,'2026-11')]);
    await db.colorProductionFact.createMany({data:[{colorId:colorA,productionBaseId:baseA,month:'2026-11',metricScope:'来源车型一',quantity:40},{colorId:colorA,productionBaseId:baseA,month:'2026-11',metricScope:'来源车型二',quantity:60}]});
    expect(await production.statistics({baseId:baseA,fromMonth:'2026-11',toMonth:'2026-11'},actor)).toMatchObject({quantity:'100',factCount:1,reconciliationExcluded:true});
    expect(await production.sources({baseId:baseA,fromMonth:'2026-11',toMonth:'2026-11'},actor)).toMatchObject({total:2});
    await expect(save([{...create('detail',colorA,baseA,40,'2026-11'),rowKind:'DETAIL'}])).rejects.toMatchObject({status:400});
    await expect(save([create('duplicate',colorA,baseA,100,'2026-11')])).rejects.toMatchObject({status:409});
    await expect(save([create('bad',colorC,baseA,1)])).rejects.toMatchObject({status:400});
    const source=await db.colorProductionFact.findFirstOrThrow({where:{colorId:colorA,metricScope:'来源车型一'}});await expect(save([{kind:'update',id:source.id,expectedRevision:1,quantity:8}])).rejects.toMatchObject({status:400});
    expect((await db.colorProductionFact.findUniqueOrThrow({where:{id:source.id}})).quantity?.toString()).toBe('40');
  });
  it('keeps confirmed zero and unknown separate',async()=>{
    await save([create('unknown',colorA,baseA,null,'2026-12'),create('zero',colorB,baseA,0,'2026-12')]);expect(await production.statistics({baseId:baseA,fromMonth:'2026-12',toMonth:'2026-12'},actor)).toMatchObject({quantity:null,knownQuantity:'0',unknownCount:1,factCount:2});
  });

  let activityId:string;let objectOne:string;let occurrenceOne:string;let occurrenceTwo:string;let readingOne:string;
  it('persists 2 vehicles × 2 groups × 3 angles with pending whole-vehicle conclusion independent of passed point',async()=>{
    const activity=record<{id:string}>(await inspection.createActivity({operationId:op(),date:'2026-09-15',baseId:baseA,personIds:[],note:null,batchLabel:'合成检验'},actor));activityId=activity.id;
    const objects=[];for(let i=0;i<2;i++)objects.push(record<{id:string}>(await inspection.createObject({operationId:op(),objectKind:'VEHICLE',objectCode:`000${i}-${run}`,vin:null,vehicleModel:'合成轻卡',vehicleClass:'轻卡',sampleId:null},actor)));objectOne=objects[0]!.id;
    const items:unknown[]=[];
    for(let i=0;i<2;i++){
      items.push({entity:'occurrence',kind:'create',clientId:`v${i}`,objectId:objects[i]!.id,colorId:colorA,source:{fileName:'合成检验.xlsx',sheetName:'检验台次',rowNumbers:[i+2],fileHash:'b'.repeat(64)},values:{overallConclusion:i===0?'PASS':'PENDING',visualConclusion:null,handlingOpinion:null,note:null}});
      for(let j=0;j<2;j++){
        items.push({entity:'measurement',kind:'create',clientId:`g${i}${j}`,occurrence:{clientId:`v${i}`},values:{pointLabel:`测点${j}`,groupLabel:'初测',standardVersionId:null,instrumentLabel:null,methodLabel:null,originalCriteria:null,conclusion:'PASS'}});
        for(let k=0;k<3;k++)items.push({entity:'reading',kind:'create',clientId:`r${i}${j}${k}`,measurement:{clientId:`g${i}${j}`},values:{angleLabel:['15°','45°','110°'][k],lValue:'80',aValue:null,bValue:'0',deltaE:null,note:null}});
      }
    }
    const input={operationId:op(),expectedRevision:1,items};const saved=record<{items:Array<{id:string;clientId:string}>}>(await inspection.saveBatch(activityId,input,actor));
    occurrenceOne=saved.items.find(x=>x.clientId==='v0')!.id;occurrenceTwo=saved.items.find(x=>x.clientId==='v1')!.id;readingOne=saved.items.find(x=>x.clientId==='r000')!.id;
    await inspection.saveBatch(activityId,input,actor);expect(await inspection.statistics({activityId},actor)).toMatchObject({uniqueVehicles:2,occurrences:2,measurementGroups:4,angleReadings:12,passed:1,pending:1,judged:1,passRate:1});
    expect(await db.inspectionOccurrence.findUniqueOrThrow({where:{id:occurrenceTwo}})).toMatchObject({overallConclusion:'PENDING'});expect((await db.inspectionReading.findUniqueOrThrow({where:{id:readingOne}})).aValue).toBeNull();
  });
  it('updates a legal overall conclusion, rejects another activity row, and retains batch rollback',async()=>{
    const other=record<{id:string}>(await inspection.createActivity({operationId:op(),date:'2026-09-16',baseId:baseA,personIds:[]},actor));
    await expect(inspection.saveBatch(other.id,{operationId:op(),expectedRevision:1,items:[{entity:'occurrence',kind:'update',id:occurrenceOne,expectedRevision:1,values:{overallConclusion:'FAIL'}}]},actor)).rejects.toMatchObject({status:404});
    await inspection.saveBatch(activityId,{operationId:op(),expectedRevision:2,items:[{entity:'occurrence',kind:'update',id:occurrenceTwo,expectedRevision:1,values:{overallConclusion:'FAIL'}}]},actor);
    expect(await inspection.statistics({activityId},actor)).toMatchObject({passed:1,failed:1,pending:0,judged:2,passRate:0.5});
    await expect(inspection.saveBatch(activityId,{operationId:op(),expectedRevision:3,items:[{entity:'occurrence',kind:'update',id:occurrenceOne,expectedRevision:1,values:{overallConclusion:'FAIL'}},{entity:'occurrence',kind:'update',id:occurrenceTwo,expectedRevision:1,values:{overallConclusion:'PASS'}}]},actor)).rejects.toMatchObject({status:409});
    expect(await db.inspectionOccurrence.findUniqueOrThrow({where:{id:occurrenceOne}})).toMatchObject({overallConclusion:'PASS',revision:1,originalSource:{fileName:'合成检验.xlsx',rowNumbers:[2]}});
    await inspection.saveBatch(other.id,{operationId:op(),expectedRevision:1,items:[{entity:'occurrence',kind:'create',clientId:'v',objectId:objectOne,colorId:colorA,values:{overallConclusion:'PENDING'}}]},actor);
    expect(await inspection.statistics({baseId:baseA},actor)).toMatchObject({uniqueVehicles:2,occurrences:3,measurementGroups:4,angleReadings:12});
  });
  it('links one target without completing it, detects target drift, and locks submitted facts',async()=>{
    const project=await db.project.create({data:{code:`facts-project-${run}`,name:'合成关联项目',primaryColorId:colorA}});
    const instance=await db.workflowInstance.create({data:{projectId:project.id,instanceNo:`facts-instance-${run}`}});
    const workflow=await db.workflowTask.create({data:{projectId:project.id,workflowInstanceId:instance.id,taskNo:`facts-task-${run}`,nodeCode:'VISUAL_COLOR_DIFFERENCE_REVIEW',nodeName:'合成17',status:'IN_PROGRESS'}});
    const plan=await db.recurringPlan.create({data:{projectId:project.id,sourceWorkflowTaskId:workflow.id,sourceNodeCode:'VISUAL_COLOR_DIFFERENCE_REVIEW',planCode:`facts-plan-${run}`,frequency:'MONTHLY',totalCount:12,generatedCount:12,startDate:new Date('2026-01-01Z'),endDate:new Date('2026-12-31Z'),status:'ACTIVE'}});
    const months=[];for(let i=0;i<12;i++)months.push(await db.recurringTask.create({data:{recurringPlanId:plan.id,projectId:project.id,taskCode:`facts-month-${i}-${run}`,periodIndex:i+1,periodLabel:`第${i+1}月`,plannedDate:new Date(Date.UTC(2026,i,1))}}));
    const version=await db.colorVersion.create({data:{colorId:colorA,versionNo:1,boardCode:'合成固定标准'}});
    await db.inspectionMeasurement.updateMany({where:{occurrence:{activityId}},data:{standardVersionId:version.id}});
    const review=await db.reviewRecord.create({data:{projectId:project.id,workflowTaskId:workflow.id,standardVersionId:version.id,reviewType:'VISUAL_COLOR_DIFFERENCE_REVIEW',reviewerId:actor.id,reviewedAt:new Date('2026-09-15Z'),result:'APPROVED',comment:'合成链接校验'}});
    await inspection.linkReview(activityId,{operationId:op(),expectedRevision:3,projectId:project.id,recurringTaskId:months[8]!.id,reviewRecordId:review.id},actor);
    expect(await db.recurringTask.findUniqueOrThrow({where:{id:months[8]!.id}})).toMatchObject({status:'PENDING',completedAt:null});
    await expect(db.$transaction(tx=>assertInspectionReviewLink(tx,{reviewId:review.id,projectId:project.id,reviewedAt:new Date('2026-10-15Z'),standardVersionId:version.id}))).rejects.toMatchObject({status:409});
    // This fixture marks submittedAt directly solely to test the ordinary-edit lock.
    // Full ReviewsService submit/approve/12-month browser evidence is a separate integration gate.
    await db.reviewRecord.update({where:{id:review.id},data:{submittedAt:new Date()}});
    await expect(inspection.saveBatch(activityId,{operationId:op(),expectedRevision:4,items:[{entity:'occurrence',kind:'update',id:occurrenceOne,expectedRevision:1,values:{overallConclusion:'FAIL'}}]},actor)).rejects.toMatchObject({status:409});
  });
  it('rechecks a revoked actor before command replay',async()=>{
    const operationId=op();const items=[create('revocation',colorC,baseB,1,'2027-01')];await save(items,operationId);await db.user.update({where:{id:actor.id},data:{teamAccessApproved:false,authVersion:{increment:1}}});
    await expect(save(items,operationId)).rejects.toMatchObject({status:403});
  });
});
