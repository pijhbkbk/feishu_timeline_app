import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BusinessClock } from '../../common/business-clock';
import { assertApprovedTeamMember } from '../../common/team-membership';
import { withProjectWrite, withTeamWrite } from '../../common/team-authorization';
import { requireActiveMonthlyPlan } from '../../common/monthly-review-plan';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { commandHash, identity, jsonData, object, pagination, positiveInt, textField } from '../color-register/color-register.rules';
import { onlyFields } from '../production-facts/production-facts.rules';
import { activityDate, nullableId, parseInspectionBatch, parseParticipants, type RecordRef } from './inspections.rules';
import { assertInspectionReviewLink, lockInspectionActivity } from './inspection-review-link';

@Injectable()
export class InspectionsService {
  constructor(private readonly prisma:PrismaService,private readonly access:ProjectAccessService,private readonly clock:BusinessClock){}

  async list(query:Record<string,unknown>,actor:AuthenticatedUser){
    assertApprovedTeamMember(actor);
    const {page,pageSize,skip}=pagination(query);
    const where={...(query.baseId?{productionBaseId:identity(query.baseId)}:{}),...(query.projectId?{projectId:identity(query.projectId)}:{}),...(query.reviewRecordId?{reviewRecordId:identity(query.reviewRecordId)}:{}),...(query.colorId?{occurrences:{some:{colorId:identity(query.colorId)}}}:{}),...(query.fromDate||query.toDate?{activityDate:{...(query.fromDate?{gte:activityDate(query.fromDate)}:{}),...(query.toDate?{lte:activityDate(query.toDate)}:{})}}:{})};
    const [items,total]=await Promise.all([this.prisma.inspectionActivity.findMany({where,orderBy:[{activityDate:'desc'},{id:'asc'}],take:pageSize,skip,
      include:{productionBase:{select:{id:true,name:true}},reviewRecord:{select:{id:true,submittedAt:true,result:true}},_count:{select:{occurrences:true}}}}),this.prisma.inspectionActivity.count({where})]);
    return {items,total,page,pageSize,totalPages:Math.max(1,Math.ceil(total/pageSize))};
  }
  async detail(id:string,actor:AuthenticatedUser){
    assertApprovedTeamMember(actor);identity(id);
    const activity=await this.prisma.inspectionActivity.findUnique({where:{id},include:{participants:{include:{person:{select:{id:true,name:true,isActive:true,user:{select:{status:true}}}}},take:50},productionBase:{select:{id:true,name:true}},reviewRecord:{select:{id:true,result:true,submittedAt:true}},recurringTask:{select:{id:true,plannedDate:true,periodLabel:true,status:true}},_count:{select:{occurrences:true}}}});
    if(!activity)throw new NotFoundException('检验活动不存在。');
    if(activity.projectId)await this.access.assertProjectAccess(this.prisma,activity.projectId,actor,'project.read');
    return {...activity,participants:activity.participants.map(({person,...participant})=>{const {user,...profile}=person;return {...participant,person:{...profile,isActive:user?user.status==='ACTIVE':profile.isActive}};}),editable:!activity.reviewRecord?.submittedAt};
  }
  async rows(id:string,query:Record<string,unknown>,actor:AuthenticatedUser){
    await this.detail(id,actor);
    const {page,pageSize,skip}=pagination(query);
    const common={take:pageSize,skip,orderBy:{id:'asc' as const}};
    switch(query.layer){
      case 'measurement':{const where={occurrence:{activityId:id}};const [items,total]=await Promise.all([this.prisma.inspectionMeasurement.findMany({where,...common,include:{standardVersion:{select:{id:true,boardCode:true,versionNo:true}},_count:{select:{readings:true}}}}),this.prisma.inspectionMeasurement.count({where})]);return {items,total,page,pageSize};}
      case 'reading':{const where={measurement:{occurrence:{activityId:id}}};const [items,total]=await Promise.all([this.prisma.inspectionReading.findMany({where,...common}),this.prisma.inspectionReading.count({where})]);return {items,total,page,pageSize};}
      case 'defect':{const where={occurrence:{activityId:id}};const [items,total]=await Promise.all([this.prisma.inspectionDefect.findMany({where,...common}),this.prisma.inspectionDefect.count({where})]);return {items,total,page,pageSize};}
      case undefined:case 'occurrence':{const where={activityId:id};const [items,total]=await Promise.all([this.prisma.inspectionOccurrence.findMany({where,...common,include:{object:true,color:{select:{id:true,name:true,code:true,productionBaseId:true}},_count:{select:{measurements:true,defects:true}}}}),this.prisma.inspectionOccurrence.count({where})]);return {items,total,page,pageSize};}
      default:throw new BadRequestException('检验层级不正确。');
    }
  }
  async objects(query:Record<string,unknown>,actor:AuthenticatedUser){
    assertApprovedTeamMember(actor);
    const {page,pageSize,skip}=pagination(query);const search=textField(query.search,'对象查询',128);
    const where=search?{OR:[{objectCode:{contains:search}},{vin:{contains:search}}]}:{};
    const [items,total]=await Promise.all([this.prisma.inspectionObject.findMany({where,orderBy:{id:'asc'},take:pageSize,skip}),this.prisma.inspectionObject.count({where})]);
    return {items,total,page,pageSize};
  }
  async createObject(raw:unknown,actor:AuthenticatedUser){
    assertApprovedTeamMember(actor);const b=object(raw);onlyFields(b,['operationId','objectKind','objectCode','vin','vehicleModel','vehicleClass','sampleId']);
    if(b.objectKind!=='VEHICLE'&&b.objectKind!=='SAMPLE')throw new BadRequestException('请选择车辆或样件。');
    const input={objectKind:b.objectKind as 'VEHICLE'|'SAMPLE',objectCode:textField(b.objectCode,'内部对象编号',128,true)!,vin:textField(b.vin,'VIN',32),vehicleModel:textField(b.vehicleModel,'车型',200),vehicleClass:textField(b.vehicleClass,'车辆分类',100),sampleId:nullableId(b.sampleId)};
    if(input.objectKind==='SAMPLE'&&input.vin)throw new BadRequestException('样件不填写虚构 VIN，请使用内部编号。');
    if(input.objectKind==='VEHICLE'&&input.sampleId)throw new BadRequestException('车辆不能绑定为样件。');
    return withTeamWrite(this.prisma,actor,tx=>this.command(tx,actor,identity(b.operationId),'INSPECTION_OBJECT_CREATE',input,async()=>{
      if(input.sampleId&&!await tx.sample.findUnique({where:{id:input.sampleId},select:{id:true}}))throw new BadRequestException('所选已有样件不存在。');
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('inspection-object'),hashtext(${input.objectCode}))`);
      if(await tx.inspectionObject.findFirst({where:{OR:[{objectCode:input.objectCode},...(input.vin?[{vin:input.vin}]:[]),...(input.sampleId?[{sampleId:input.sampleId}]:[])]},select:{id:true}}))throw new ConflictException('此内部编号、VIN 或已有样件已登记，请选用原对象 ID。');
      const saved=await tx.inspectionObject.create({data:input});await this.audit(tx,actor.id,null,'INSPECTION_OBJECT_CREATED',null,saved);return saved;
    }));
  }
  async createActivity(raw:unknown,actor:AuthenticatedUser){
    assertApprovedTeamMember(actor);const b=object(raw);onlyFields(b,['operationId','date','baseId','batchLabel','note','personIds']);
    const input={activityDate:activityDate(b.date),productionBaseId:identity(b.baseId),batchLabel:textField(b.batchLabel,'批次说明',200),note:textField(b.note,'备注',4000),personIds:parseParticipants(b.personIds)};
    return withTeamWrite(this.prisma,actor,tx=>this.command(tx,actor,identity(b.operationId),'INSPECTION_ACTIVITY_CREATE',input,async()=>{
      if(!await tx.productionBase.findUnique({where:{id:input.productionBaseId},select:{id:true}}))throw new BadRequestException('生产基地不存在。');
      await this.checkPeople(tx,input.personIds);
      const {personIds,...data}=input;
      const saved=await tx.inspectionActivity.create({data:{...data,createdById:actor.id,participants:{create:personIds.map(personId=>({personId}))}}});
      await this.audit(tx,actor.id,null,'INSPECTION_ACTIVITY_CREATED',null,saved);return saved;
    }));
  }
  async updateActivity(id:string,raw:unknown,actor:AuthenticatedUser){
    assertApprovedTeamMember(actor);identity(id);const b=object(raw);onlyFields(b,['operationId','expectedRevision','date','batchLabel','note','personIds']);
    const input={expectedRevision:positiveInt(b.expectedRevision,'活动版本'),activityDate:activityDate(b.date),batchLabel:textField(b.batchLabel,'批次说明',200),note:textField(b.note,'备注',4000),personIds:parseParticipants(b.personIds)};
    return withTeamWrite(this.prisma,actor,tx=>this.command(tx,actor,identity(b.operationId),'INSPECTION_ACTIVITY_UPDATE',{id,...input},async()=>{
      const current=await lockInspectionActivity(tx,id);this.revision(current,input.expectedRevision);
      if(current.reviewRecordId&&current.activityDate.valueOf()!==input.activityDate.valueOf())throw new ConflictException('关联月度评审后的活动日期不可移动。');
      await this.checkPeople(tx,input.personIds);
      const {personIds,expectedRevision:_revision,...data}=input;void _revision;
      const beforeParticipants=await tx.inspectionParticipant.findMany({where:{activityId:id},select:{personId:true},take:50});
      await tx.inspectionParticipant.deleteMany({where:{activityId:id,personId:{notIn:personIds}}});
      await tx.inspectionParticipant.createMany({data:personIds.map(personId=>({activityId:id,personId})),skipDuplicates:true});
      const saved=await tx.inspectionActivity.update({where:{id},data:{...data,revision:{increment:1}}});
      await this.audit(tx,actor.id,current.projectId,'INSPECTION_ACTIVITY_UPDATED',{...current,personIds:beforeParticipants.map(p=>p.personId)},{...saved,personIds});return saved;
    }));
  }
  async saveBatch(id:string,raw:unknown,actor:AuthenticatedUser){
    assertApprovedTeamMember(actor);identity(id);const input=parseInspectionBatch(raw);
    return withTeamWrite(this.prisma,actor,tx=>this.command(tx,actor,input.operationId,'INSPECTION_FACT_BATCH',{id,...input},async()=>{
      const activity=await lockInspectionActivity(tx,id);this.revision(activity,input.expectedRevision);
      const refs=new Map<string,{id:string;entity:string}>();const saved:unknown[]=[];
      const resolve=(ref:RecordRef,entity:string)=>{if('id'in ref)return ref.id;const found=refs.get(ref.clientId);if(!found||found.entity!==entity)throw new BadRequestException('关联草稿不存在或层级不正确。');return found.id;};
      for(const change of input.items){
        let result:{id:string};let previous:unknown=null;
        if(change.entity==='occurrence'){
          if(change.kind==='create'){
            if(await tx.inspectionOccurrence.count({where:{activityId:id}})>=5000)throw new BadRequestException('单次活动已达到 5000 台次上限，请拆分真实活动。');
            const color=await tx.color.findUnique({where:{id:change.colorId},select:{productionBaseId:true}});
            if(!color||color.productionBaseId!==activity.productionBaseId)throw new BadRequestException('颜色不属于活动基地。');
            const targetObject=await tx.inspectionObject.findUnique({where:{id:change.objectId},select:{id:true,sample:{select:{colorId:true}}}});
            if(!targetObject)throw new BadRequestException('检验对象不存在。');
            if(targetObject.sample?.colorId&&targetObject.sample.colorId!==change.colorId)throw new BadRequestException('已有样件颜色与本台次所选颜色不一致。');
            result=await tx.inspectionOccurrence.create({data:{activityId:id,objectId:change.objectId,colorId:change.colorId,...change.values,...(change.source?{originalSource:jsonData(change.source)}:{})}});
          }else{const cur=await tx.inspectionOccurrence.findFirst({where:{id:change.id,activityId:id}});if(!cur)throw new NotFoundException('台次不属于本活动。');this.revision(cur,change.expectedRevision);previous=cur;result=await tx.inspectionOccurrence.update({where:{id:cur.id},data:{...change.values,revision:{increment:1}}});}
        }else if(change.entity==='measurement'){
          const cur=change.kind==='update'?await tx.inspectionMeasurement.findFirst({where:{id:change.id,occurrence:{activityId:id}}}):null;
          if(change.kind==='update'){if(!cur)throw new NotFoundException('测量组不属于本活动。');this.revision(cur,change.expectedRevision);previous=cur;}
          const occurrenceId=change.kind==='create'?resolve(change.occurrence,'occurrence'):cur!.occurrenceId;
          const occurrence=await tx.inspectionOccurrence.findFirst({where:{id:occurrenceId,activityId:id},select:{colorId:true}});if(!occurrence)throw new NotFoundException('测量组对应台次不属于本活动。');
          if(change.values.standardVersionId&&!await tx.colorVersion.findFirst({where:{id:change.values.standardVersionId,colorId:occurrence.colorId},select:{id:true}}))throw new BadRequestException('测量标准不属于该颜色。');
          if(change.kind==='create'&&await tx.inspectionMeasurement.count({where:{occurrenceId}})>=200)throw new BadRequestException('单对象测量组最多 200 组。');
          result=change.kind==='create'?await tx.inspectionMeasurement.create({data:{occurrenceId,...change.values}}):await tx.inspectionMeasurement.update({where:{id:cur!.id},data:{...change.values,revision:{increment:1}}});
        }else if(change.entity==='reading'){
          const cur=change.kind==='update'?await tx.inspectionReading.findFirst({where:{id:change.id,measurement:{occurrence:{activityId:id}}}}):null;
          if(change.kind==='update'){if(!cur)throw new NotFoundException('角度读数不属于本活动。');this.revision(cur,change.expectedRevision);previous=cur;}
          const measurementId=change.kind==='create'?resolve(change.measurement,'measurement'):cur!.measurementId;
          if(!await tx.inspectionMeasurement.findFirst({where:{id:measurementId,occurrence:{activityId:id}},select:{id:true}}))throw new NotFoundException('角度读数对应测量组不属于本活动。');
          if(change.kind==='create'&&await tx.inspectionReading.count({where:{measurementId}})>=100)throw new BadRequestException('单测量组最多 100 条角度读数。');
          result=change.kind==='create'?await tx.inspectionReading.create({data:{measurementId,...change.values}}):await tx.inspectionReading.update({where:{id:cur!.id},data:{...change.values,revision:{increment:1}}});
        }else{
          const cur=change.kind==='update'?await tx.inspectionDefect.findFirst({where:{id:change.id,occurrence:{activityId:id}}}):null;
          if(change.kind==='update'){if(!cur)throw new NotFoundException('缺陷不属于本活动。');this.revision(cur,change.expectedRevision);previous=cur;}
          const occurrenceId=change.kind==='create'?resolve(change.occurrence,'occurrence'):cur!.occurrenceId;
          const measurementId=change.kind==='create'?(change.measurement?resolve(change.measurement,'measurement'):null):cur!.measurementId;
          if(!await tx.inspectionOccurrence.findFirst({where:{id:occurrenceId,activityId:id},select:{id:true}}))throw new NotFoundException('缺陷对应台次不属于本活动。');
          if(measurementId&&!await tx.inspectionMeasurement.findFirst({where:{id:measurementId,occurrenceId},select:{id:true}}))throw new BadRequestException('缺陷测点不属于该对象台次。');
          if(change.kind==='create'&&await tx.inspectionDefect.count({where:{occurrenceId}})>=200)throw new BadRequestException('单对象最多 200 条缺陷。');
          result=change.kind==='create'?await tx.inspectionDefect.create({data:{occurrenceId,measurementId,...change.values}}):await tx.inspectionDefect.update({where:{id:cur!.id},data:{...change.values,revision:{increment:1}}});
        }
        if(change.kind==='create')refs.set(change.clientId,{id:result.id,entity:change.entity});
        saved.push({...result,entity:change.entity,...(change.kind==='create'?{clientId:change.clientId}:{})});
        await this.audit(tx,actor.id,activity.projectId,`INSPECTION_${change.entity.toUpperCase()}_${change.kind==='create'?'CREATED':'UPDATED'}`,previous,result);
      }
      // A linked draft may be edited, but its color/standard evidence may not drift away from the target.
      if(activity.reviewRecordId){const review=await tx.reviewRecord.findUniqueOrThrow({where:{id:activity.reviewRecordId}});await assertInspectionReviewLink(tx,{reviewId:review.id,projectId:review.projectId,reviewedAt:review.reviewedAt,standardVersionId:review.standardVersionId});}
      const current=await tx.inspectionActivity.update({where:{id},data:{revision:{increment:1}}});
      return {activityId:id,revision:current.revision,items:saved};
    }),{timeout:30000});
  }

  async linkReview(id:string,raw:unknown,actor:AuthenticatedUser){
    assertApprovedTeamMember(actor);identity(id);const b=object(raw);onlyFields(b,['operationId','expectedRevision','projectId','recurringTaskId','reviewRecordId']);
    const input={expectedRevision:positiveInt(b.expectedRevision,'活动版本'),projectId:identity(b.projectId),recurringTaskId:identity(b.recurringTaskId),reviewRecordId:identity(b.reviewRecordId)};
    await this.access.assertProjectAccess(this.prisma,input.projectId,actor,'review.execute');
    return withProjectWrite(this.prisma,actor,{projectId:input.projectId},tx=>this.command(tx,actor,identity(b.operationId),'INSPECTION_LINK_REVIEW',{id,...input},async()=>{
      const activity=await lockInspectionActivity(tx,id);this.revision(activity,input.expectedRevision);
      if(activity.reviewRecordId)throw new ConflictException('活动已关联一个明确目标，不能复制到多个任务或替换历史关联。');
      const task=await tx.recurringTask.findUnique({where:{id:input.recurringTaskId}});
      if(!task||task.projectId!==input.projectId)throw new BadRequestException('月度任务不属于目标项目。');
      await requireActiveMonthlyPlan(tx,input.projectId,task.recurringPlanId);
      if(task.plannedDate>this.clock.now()||!['PENDING','IN_PROGRESS','OVERDUE'].includes(task.status))throw new ConflictException('月度任务尚未到期或已结束。');
      const review=await tx.reviewRecord.findUnique({where:{id:input.reviewRecordId},include:{workflowTask:{select:{isActive:true,nodeCode:true,status:true}}}});
      if(!review||review.projectId!==input.projectId||review.reviewType!=='VISUAL_COLOR_DIFFERENCE_REVIEW'||review.reviewerId!==actor.id||review.submittedAt||!review.workflowTask.isActive||review.workflowTask.nodeCode!=='VISUAL_COLOR_DIFFERENCE_REVIEW'||!['PENDING','READY','IN_PROGRESS','RETURNED'].includes(review.workflowTask.status))throw new ConflictException('请选择本人通过原评审入口创建的有效月度评审草稿。');
      const saved=await tx.inspectionActivity.update({where:{id},data:{projectId:input.projectId,recurringTaskId:input.recurringTaskId,reviewRecordId:input.reviewRecordId,revision:{increment:1}}});
      await assertInspectionReviewLink(tx,{reviewId:review.id,projectId:review.projectId,reviewedAt:review.reviewedAt,standardVersionId:review.standardVersionId});
      await this.audit(tx,actor.id,input.projectId,'INSPECTION_REVIEW_LINKED',activity,saved);
      return {activity:saved,reviewUrl:`/projects/${input.projectId}`,saveDoesNotSubmit:true};
    }));
  }

  async statistics(query:Record<string,unknown>,actor:AuthenticatedUser){
    assertApprovedTeamMember(actor);
    const filters:Prisma.Sql[]=[];
    if(query.activityId)filters.push(Prisma.sql`a.id=${identity(query.activityId)}`);
    if(query.colorId)filters.push(Prisma.sql`o."colorId"=${identity(query.colorId)}`);
    if(query.baseId)filters.push(Prisma.sql`a."productionBaseId"=${identity(query.baseId)}`);
    if(query.fromDate)filters.push(Prisma.sql`a."activityDate">=${activityDate(query.fromDate)}`);
    if(query.toDate)filters.push(Prisma.sql`a."activityDate"<=${activityDate(query.toDate)}`);
    const where=filters.length?Prisma.sql`WHERE ${Prisma.join(filters,' AND ')}`:Prisma.empty;
    const [stats]=await this.prisma.$queryRaw<Array<{uniqueVehicles:number;uniqueSamples:number;occurrences:number;measurementGroups:number;angleReadings:number;defects:number;passed:number;failed:number;pending:number}>>(Prisma.sql`
      WITH selected AS (SELECT o.id,o."objectId",o."overallConclusion" FROM inspection_occurrences o JOIN inspection_activities a ON a.id=o."activityId" ${where}),
      measurement_groups AS (SELECT m.id FROM inspection_measurements m WHERE m."occurrenceId" IN (SELECT id FROM selected))
      SELECT (SELECT count(DISTINCT s."objectId")::int FROM selected s JOIN inspection_objects obj ON obj.id=s."objectId" WHERE obj."objectKind"='VEHICLE') AS "uniqueVehicles",
        (SELECT count(DISTINCT s."objectId")::int FROM selected s JOIN inspection_objects obj ON obj.id=s."objectId" WHERE obj."objectKind"='SAMPLE') AS "uniqueSamples",
        count(*)::int AS occurrences, count(*) FILTER(WHERE "overallConclusion"='PASS')::int AS passed,
        count(*) FILTER(WHERE "overallConclusion"='FAIL')::int AS failed,count(*) FILTER(WHERE "overallConclusion"='PENDING')::int AS pending,
        (SELECT count(*)::int FROM measurement_groups) AS "measurementGroups",(SELECT count(*)::int FROM inspection_readings WHERE "measurementId" IN (SELECT id FROM measurement_groups)) AS "angleReadings",
        (SELECT count(*)::int FROM inspection_defects WHERE "occurrenceId" IN(SELECT id FROM selected)) AS defects FROM selected
    `);
    if(!stats)throw new ConflictException('检验统计不可用。');
    const judged=stats.passed+stats.failed;
    return {...stats,judged,passRate:judged?stats.passed/judged:null,passRateBasis:'明确总评合格台次 /（合格台次 + 不合格台次）；待判定不入分母、不入合格分子。车辆去重数单列。'};
  }

  private revision(current:{id:string;revision:number},expected:number){if(current.revision!==expected)throw new ConflictException({code:'INSPECTION_REVISION_CONFLICT',id:current.id,current,message:'事实已改变，请核对最新值后重新提交。'});}
  private async checkPeople(tx:Prisma.TransactionClient,ids:string[]){
    // Linked account availability is authoritative; profile metadata is not copied
    // when the existing administrator command disables or re-enables an account.
    // Keep unlinked profile state stable until this activity write commits. The
    // surrounding shared authorization fence already protects linked User status.
    if(ids.length)await tx.$queryRaw(Prisma.sql`SELECT id FROM person_profiles WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`);
    const found=await tx.personProfile.count({where:{id:{in:ids},OR:[{userId:null,isActive:true},{user:{is:{status:'ACTIVE'}}}]}});
    if(found!==ids.length)throw new BadRequestException('参与人员须选择已启用的真实人员档案；不会自动创建账号或授予资格。');
  }
  private async command<T>(tx:Prisma.TransactionClient,actor:AuthenticatedUser,operationId:string,action:string,input:unknown,execute:()=>Promise<T>):Promise<T>{
    const key=`inspections:${actor.id}:${operationId}`;await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
    const requestHash=commandHash(input);const prior=await tx.adminCommandRequest.findUnique({where:{idempotencyKey:key}});
    if(prior){if(prior.action!==action||prior.requestHash!==requestHash)throw new ConflictException('同一操作标识不能提交不同内容。');return prior.result as T;}
    try{const result=await execute();await tx.adminCommandRequest.create({data:{actorUserId:actor.id,idempotencyKey:key,action,requestHash,result:jsonData(result)}});return result;}
    catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throw new ConflictException('同一对象台次、测量组、角度或评审关联已存在，请使用稳定 ID 修改原记录。');throw error;}
  }
  private audit(tx:Prisma.TransactionClient,actorId:string,projectId:string|null,action:string,before:unknown,after:unknown){return tx.auditLog.create({data:{actorUserId:actorId,projectId,targetType:'SYSTEM',targetId:(after as {id:string}).id,action,summary:'保存检验事实；未触发流程推进',beforeData:jsonData(before??{}),afterData:jsonData(after)}});}
}
