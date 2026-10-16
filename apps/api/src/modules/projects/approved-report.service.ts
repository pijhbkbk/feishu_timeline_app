import { isFutureBusinessDate } from '../../common/business-date';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsISO8601, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { withProjectWrite } from '../../common/team-authorization';
import { assertApprovedTeamMember } from '../../common/team-membership';
import type { AuthenticatedUser } from '../auth/auth.types';
import { WorkflowsService } from '../workflows/workflows.service';
import { Prisma } from '@prisma/client';

export class ApprovedReportDto {
  @Transform(({ obj, key }) => obj[key]) @IsString() @IsNotEmpty() @MaxLength(64) taskId!: string;
  @Transform(({ obj, key }) => obj[key]) @IsISO8601() taskVersion!: string;
  @Transform(({ obj, key }) => obj[key]) @IsString() @IsNotEmpty() @MaxLength(64) reportAttachmentId!: string;
  @Transform(({ obj, key }) => obj[key]) @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) approvedReportDate!: string;
  @Transform(({ obj, key }) => obj[key]) @IsString() @IsNotEmpty() @MaxLength(200) approvalReference!: string;
  @Transform(({ obj, key }) => obj[key]) @IsString() @IsNotEmpty() @MaxLength(500) demandSource!: string;
  @Transform(({ obj, key }) => obj[key]) @IsString() @Matches(/^[A-Za-z0-9._:-]{1,128}$/) idempotencyKey!: string;
}

/** Records already-approved offline facts, without adding an online approval. */
@Injectable()
export class ApprovedReportService {
  constructor(private readonly prisma: PrismaService, private readonly workflows: WorkflowsService) {}

  async register(projectId: string, input: ApprovedReportDto, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    const approvedAt = new Date(`${input.approvedReportDate}T00:00:00.000Z`);
    if (!Number.isFinite(approvedAt.getTime()) || approvedAt.toISOString().slice(0, 10) !== input.approvedReportDate || isFutureBusinessDate(input.approvedReportDate, approvedAt) || !input.approvalReference.trim() || !input.demandSource.trim()) {
      throw new BadRequestException('请填写有效的报告批准日期、批准依据和需求来源。');
    }
    const key = `approved-report:${actor.id}:${input.idempotencyKey}`;
    const hash = createHash('sha256').update(JSON.stringify({ projectId, ...input })).digest('hex');
    return withProjectWrite(this.prisma, actor, { projectId }, async tx => {
      const previous = await tx.r26CommandRequest.findUnique({ where: { idempotencyKey: key } });
      if (previous) {
        if (previous.actorUserId !== actor.id || previous.projectId !== projectId || previous.requestHash !== hash) throw new ConflictException('请求编号已用于其他内容。');
        return { ...(previous.result as Prisma.JsonObject), idempotentReplay: true };
      }
      const task = await tx.workflowTask.findFirst({ where: { id: input.taskId, projectId, nodeCode: 'PROJECT_INITIATION', isActive: true } });
      if (!task || task.updatedAt.toISOString() !== new Date(input.taskVersion).toISOString()) throw new ConflictException('建项进度已变化，请刷新后重试，已填写内容仍保留。');
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
      if (project.approvedReportAttachmentId) throw new ConflictException('本项目已登记获批报告。');
      const reportFile = await tx.attachment.findFirst({ where: { id: input.reportAttachmentId, projectId, entityType: 'WORKFLOW_TASK', entityId: task.id, isDeleted: false, scanStatus: 'CLEAN', materialType: 'approved-development-report' } });
      if (!reportFile) throw new BadRequestException('请先上传本项目的已获批开发报告并等待安全扫描通过。');
      await tx.project.update({ where: { id: projectId }, data: { approvedReportDate: approvedAt, approvalReference: input.approvalReference.trim(), approvedReportAttachmentId: reportFile.id, status: 'IN_PROGRESS', actualStartDate: approvedAt } });
      const facts = { demandSource: input.demandSource.trim(), approvalReference: input.approvalReference.trim(), approvedReportDate: input.approvedReportDate, reportAttachmentId: reportFile.id };
      await tx.auditLog.create({ data: { projectId, actorUserId: actor.id, targetType: 'PROJECT', targetId: projectId, action: 'APPROVED_DEVELOPMENT_REPORT_REGISTERED', nodeCode: 'PROJECT_INITIATION', summary: '登记已获批新颜色开发报告并建立颜色项目', afterData: facts } });
      await this.workflows.transitionTaskWithExecutor(tx, task.id, 'COMPLETE', actor, { comment: '依据已获批开发报告登记市场需求事实', metadata: facts });
      const reportTask = await tx.workflowTask.findFirstOrThrow({ where: { projectId, workflowInstanceId: task.workflowInstanceId, nodeCode: 'DEVELOPMENT_REPORT', isActive: true } });
      const report = await tx.developmentReport.create({ data: { projectId, workflowInstanceId: task.workflowInstanceId, workflowTaskId: reportTask.id, status: 'SUBMITTED', reportTitle: '已获批新颜色开发报告', demandSource: input.demandSource.trim(), targetColorName: project.name, targetMarket: project.marketRegion, targetVehicleModel: project.vehicleModel, developmentReason: input.approvalReference.trim(), remark: `批准日期：${input.approvedReportDate}`, createdById: actor.id, updatedById: actor.id, submittedById: actor.id, submittedAt: new Date() } });
      await tx.auditLog.create({ data: { projectId, actorUserId: actor.id, targetType: 'DEVELOPMENT_REPORT', targetId: report.id, action: 'DEVELOPMENT_REPORT_SUBMITTED', nodeCode: 'DEVELOPMENT_REPORT', summary: '登记报告批准事实', afterData: { ...facts, workflowTaskId: reportTask.id, reportId: report.id } } });
      await this.workflows.transitionTaskWithExecutor(tx, reportTask.id, 'COMPLETE', actor, { comment: '已获批报告及材料已登记', metadata: { ...facts, reportId: report.id } });
      const nextTask = await tx.workflowTask.findFirstOrThrow({ where: { projectId, nodeCode: 'PAINT_DEVELOPMENT', isActive: true }, select: { id: true, updatedAt: true } });
      const result = { projectId, reportId: report.id, taskId: nextTask.id, taskVersion: nextTask.updatedAt.toISOString(), idempotentReplay: false };
      await tx.r26CommandRequest.create({ data: { projectId, actorUserId: actor.id, idempotencyKey: key, action: 'APPROVED_REPORT_REGISTERED', requestHash: hash, result } });
      return result;
    });
  }
}
