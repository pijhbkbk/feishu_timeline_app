import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, type AttachmentTargetType, type WorkflowNodeCode } from '@prisma/client';
import { assertTeamTaskById } from '../../common/team-authorization';
import type { AuthenticatedUser } from '../auth/auth.types';

export async function lockGenericAttachmentMutation(tx: Prisma.TransactionClient, projectId: string) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'generic-attachment'}), hashtext(${projectId}))`);
}

/** All generic binding changes use the same project lock before attachment/domain rows. */
export async function authorizeGenericAttachmentTarget(tx: Prisma.TransactionClient, projectId: string, targetType: AttachmentTargetType,
  targetId: string, actor: AuthenticatedUser, expected?: string): Promise<string> {
  await lockGenericAttachmentMutation(tx, projectId);
  let version: string;
  if (targetType === 'PROJECT') {
    if (targetId !== projectId) throw new ForbiddenException('项目资料目标不匹配。');
    if (!actor.isSystemAdmin && !actor.roleCodes.includes('project_manager')) throw new ForbiddenException('项目公共资料由项目协调或管理员维护。');
    await tx.$queryRaw(Prisma.sql`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`);
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { status: true } });
    if (!project || ['COMPLETED', 'CANCELLED'].includes(project.status)) throw new ConflictException('项目已结束，历史资料只读。');
    version = `PROJECT:${projectId}:${project.status}`;
  } else {
    let nodeCode: WorkflowNodeCode;
    let entity: { updatedAt: Date } | null;
    let taskId: string | undefined;
    if (targetType === 'NEW_COLOR_REPORT') {
      // Development report writes lock the report before its task.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM development_reports WHERE id = ${targetId} AND "projectId" = ${projectId} FOR UPDATE`);
      const report = await tx.developmentReport.findFirst({ where: { id: targetId, projectId }, select: { workflowTaskId: true, status: true, updatedAt: true } });
      if (!report || report.status !== 'DRAFT') throw new ConflictException('报告不存在或已提交，附件不可修改。');
      entity = report; nodeCode = 'DEVELOPMENT_REPORT'; taskId = report.workflowTaskId;
    } else {
      if (targetType !== 'STANDARD_BOARD' && targetType !== 'TRIAL_PRODUCTION') throw new ForbiddenException('请通过对应业务工作单管理附件。');
      nodeCode = targetType === 'STANDARD_BOARD' ? 'STANDARD_BOARD_PRODUCTION' : 'TRIAL_PRODUCTION';
      if (targetType === 'TRIAL_PRODUCTION') {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM trial_productions WHERE id = ${targetId} AND "projectId" = ${projectId} FOR UPDATE`);
        const trial = await tx.trialProduction.findFirst({ where: { id: targetId, projectId }, select: { updatedAt: true, status: true } });
        if (!trial || !['PLANNED', 'IN_PROGRESS'].includes(trial.status)) throw new ConflictException('试制记录已结束，附件不可修改。');
        entity = trial;
      } else {
        entity = null;
      }
      const task = await tx.workflowTask.findFirst({ where: { projectId, nodeCode, isActive: true }, select: { id: true } });
      if (!task) throw new ConflictException('对应工序已结束，历史资料只读。');
      taskId = task.id;
      await assertTeamTaskById(tx, taskId, actor);
      if (targetType === 'STANDARD_BOARD') {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM standard_boards WHERE id = ${targetId} AND "projectId" = ${projectId} FOR UPDATE`);
        const board = await tx.standardBoard.findFirst({ where: { id: targetId, projectId }, select: { updatedAt: true, status: true, isCurrent: true } });
        if (!board?.isCurrent || !['DRAFT', 'CREATED'].includes(board.status)) throw new ConflictException('标准板已发放或归档，附件不可修改。');
        entity = board;
      }
    }
    await assertTeamTaskById(tx, taskId, actor);
    const task = await tx.workflowTask.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true, nodeCode: true, assignmentEpoch: true } });
    if (task.projectId !== projectId || task.nodeCode !== nodeCode) throw new ConflictException('附件对应工序已变化。');
    if (!entity) throw new ConflictException('附件目标不存在。');
    version = `${targetType}:${targetId}:${entity.updatedAt.toISOString()}:${taskId}:${task.assignmentEpoch}`;
  }
  if (expected !== undefined && version !== expected) throw new ConflictException('扫描期间任务或资料已变化，请刷新后重新上传。');
  return version;
}
