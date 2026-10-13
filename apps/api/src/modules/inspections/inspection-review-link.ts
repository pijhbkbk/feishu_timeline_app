import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Also use for image writes. Submitting a linked review must acquire this lock before submittedAt changes. */
export async function lockInspectionActivity(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM inspection_activities WHERE id = ${id} FOR UPDATE`);
  const activity=await tx.inspectionActivity.findUnique({where:{id},include:{reviewRecord:{select:{submittedAt:true}}}});
  if(!activity) throw new NotFoundException('检验活动不存在。');
  if(activity.reviewRecord?.submittedAt) throw new ConflictException('检验事实已随评审提交，普通编辑及照片变更已锁定。请保留原记录并沿用原评审更正流程。');
  return activity;
}

/** Call inside the existing ReviewsService project-locked transaction, before update/submit/approve.
 * Existing review/project/monthly eligibility remains the responsibility of ReviewsService.
 * The hook neither infers a review result nor completes or schedules a recurring task.
 */
export async function assertInspectionReviewLink(tx: Prisma.TransactionClient, input: {
  reviewId:string; projectId:string; reviewedAt:Date|null; standardVersionId:string|null;
}) {
  const linked=await tx.inspectionActivity.findUnique({where:{reviewRecordId:input.reviewId},select:{id:true}});
  if(!linked) return;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM inspection_activities WHERE id = ${linked.id} FOR UPDATE`);
  const activity=await tx.inspectionActivity.findUniqueOrThrow({where:{id:linked.id},include:{recurringTask:true}});
  const project=await tx.project.findUniqueOrThrow({where:{id:input.projectId},select:{primaryColorId:true}});
  const day=input.reviewedAt?.toISOString().slice(0,10);
  if(activity.projectId!==input.projectId || !activity.recurringTask || activity.recurringTask.projectId!==input.projectId ||
     !day || day!==activity.activityDate.toISOString().slice(0,10) || day.slice(0,7)!==activity.recurringTask.plannedDate.toISOString().slice(0,7)) {
    throw new ConflictException('关联检验活动的日期、项目或目标月份不一致；不能通过修改评审日期改派已关联事实。');
  }
  if(!project.primaryColorId) throw new BadRequestException('目标项目尚未绑定准确颜色。');
  if(!input.standardVersionId) throw new BadRequestException('目标评审尚未固定标准版本，请保留待关联状态并通过原评审入口核对。');
  const invalid=await tx.inspectionOccurrence.findFirst({where:{activityId:activity.id,OR:[{colorId:{not:project.primaryColorId}},{color:{productionBaseId:{not:activity.productionBaseId}}},{color:{productionBaseId:null}}]},select:{id:true}});
  const count=await tx.inspectionOccurrence.count({where:{activityId:activity.id}});
  if(invalid||count===0) throw new ConflictException('活动须包含目标项目准确颜色和基地的检验对象。');
  const differentStandard=await tx.inspectionMeasurement.findFirst({where:{occurrence:{activityId:activity.id},NOT:{standardVersionId:input.standardVersionId}},select:{id:true}});
  // SQL nullable comparison needs an explicit branch: missing standard must not pass a non-null target.
  const missingStandard=input.standardVersionId ? await tx.inspectionMeasurement.findFirst({where:{occurrence:{activityId:activity.id},standardVersionId:null},select:{id:true}}):null;
  if(differentStandard||missingStandard) throw new ConflictException('检验测量所用标准与评审固定标准不一致，请先核对依据。');
}
