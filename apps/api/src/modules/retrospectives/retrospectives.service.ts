import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AttachmentTargetType,
  AuditTargetType,
  ColorExitSuggestion,
  Prisma,
  ProjectRetrospectiveStatus,
  ProjectStatus,
  RecurringTaskStatus,
  TaskBlockerStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { WORKFLOW_NODE_META_MAP } from '../workflows/workflow-node.constants';
import type { SaveRetrospectiveDto } from './dto/save-retrospective.dto';

const MS_PER_DAY = 86_400_000;
const STAGE_GROUPS = [
  { key: 'requirements', name: '需求与开发', from: 1, to: 5 },
  { key: 'procurement', name: '采购与准备', from: 6, to: 10 },
  { key: 'trial', name: '试制与评审', from: 11, to: 14 },
  { key: 'production', name: '量产准备', from: 15, to: 16 },
  { key: 'tracking', name: '月度跟踪与退出', from: 17, to: 18 },
] as const;

@Injectable()
export class RetrospectivesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccessService: ProjectAccessService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async getRetrospective(projectId: string, actor: AuthenticatedUser) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );

    const [project, tasks, recurringPlan, colorExit, saved, nodeDefinitions, blockers] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          ownerUser: { select: { id: true, name: true } },
          colors: {
            select: { name: true, code: true, isPrimary: true },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
        },
      }),
      this.prisma.workflowTask.findMany({
        where: { projectId },
        include: { assigneeUser: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'asc' }, { taskRound: 'asc' }],
      }),
      this.prisma.recurringPlan.findFirst({
        where: { projectId },
        include: { tasks: { orderBy: { periodIndex: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.colorExit.findFirst({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.projectRetrospective.findUnique({
        where: { projectId },
        include: { completedBy: { select: { id: true, name: true } } },
      }),
      this.prisma.workflowNodeDefinition.findMany({
        where: { isActive: true },
        select: { nodeCode: true, requiredAttachments: true },
      }),
      this.prisma.taskBlocker.findMany({
        where: { projectId },
        include: { helperUser: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!project) {
      throw new NotFoundException('项目不存在或已被删除。');
    }

    const attachmentCounts = tasks.length > 0
      ? await this.prisma.attachment.groupBy({
          by: ['entityId'],
          where: {
            projectId,
            entityType: AttachmentTargetType.WORKFLOW_TASK,
            entityId: { in: tasks.map((task) => task.id) },
            isDeleted: false,
          },
          _count: { _all: true },
        })
      : [];
    const attachmentCountByTask = new Map(
      attachmentCounts.map((item) => [item.entityId, item._count._all]),
    );
    const requiredCountByNode = new Map(
      nodeDefinitions.map((definition) => [
        definition.nodeCode,
        this.parseRequiredCount(definition.requiredAttachments),
      ]),
    );
    const now = new Date();
    const completedMonthly = recurringPlan?.tasks.filter(
      (task) => task.status === RecurringTaskStatus.COMPLETED,
    ).length ?? 0;
    const totalMonthly = recurringPlan?.tasks.length ?? 0;
    const plannedDurationDays = this.daysBetween(project.plannedStartDate, project.plannedEndDate);
    const actualEnd = project.actualEndDate ?? project.closedAt ?? now;
    const actualDurationDays = this.daysBetween(
      project.actualStartDate ?? project.plannedStartDate ?? project.createdAt,
      actualEnd,
    );

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        colorName: project.colors[0]?.name ?? null,
        colorCode: project.colors[0]?.code ?? null,
        status: project.status,
        ownerName: project.ownerUser?.name ?? null,
        currentNodeCode: project.currentNodeCode,
      },
      eligibility: {
        canComplete:
          project.status === ProjectStatus.COMPLETED ||
          project.currentNodeCode === WorkflowNodeCode.PROJECT_CLOSED,
        reason:
          project.status === ProjectStatus.COMPLETED ||
          project.currentNodeCode === WorkflowNodeCode.PROJECT_CLOSED
            ? null
            : '项目进入“项目关闭”节点后才能完成复盘，当前仍可保存草稿。',
      },
      summary: {
        conclusion: saved?.conclusion ?? this.buildSystemConclusion(project.status, colorExit?.finalDecision),
        annualOutput: colorExit?.annualOutput ?? null,
        monthlyCompleted: completedMonthly,
        monthlyTotal: totalMonthly,
        plannedDurationDays,
        actualDurationDays,
        delayDays: Math.max(0, actualDurationDays - plannedDurationDays),
      },
      stages: STAGE_GROUPS.map((group) => this.buildStage(group, tasks, now)),
      bottlenecks: this.buildBottlenecks(
        tasks,
        blockers,
        requiredCountByNode,
        attachmentCountByTask,
        now,
      ),
      form: {
        status: saved?.status ?? ProjectRetrospectiveStatus.DRAFT,
        conclusion: saved?.conclusion ?? '',
        improvementMeasures: this.improvementArray(saved?.improvementMeasures),
        strengths: saved?.strengths ?? '',
        problems: saved?.problems ?? '',
        reusableExperience: saved?.reusableExperience ?? '',
        workflowRuleUpdates: saved?.workflowRuleUpdates ?? '',
        completedByName: saved?.completedBy?.name ?? null,
        completedAt: saved?.completedAt?.toISOString() ?? null,
        updatedAt: saved?.updatedAt.toISOString() ?? null,
      },
    };
  }

  async saveRetrospective(
    projectId: string,
    input: SaveRetrospectiveDto,
    actor: AuthenticatedUser,
  ) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.write',
    );
    const existing = await this.prisma.projectRetrospective.findUnique({ where: { projectId } });
    if (existing?.status === ProjectRetrospectiveStatus.COMPLETED) {
      throw new ConflictException('复盘已经完成，不能覆盖历史结论。');
    }

    await this.prisma.$transaction(async (tx) => {
      const record = await tx.projectRetrospective.upsert({
        where: { projectId },
        create: { projectId, ...this.toPersistenceInput(input) },
        update: this.toPersistenceInput(input),
      });
      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PROJECT,
        targetId: projectId,
        action: 'PROJECT_RETROSPECTIVE_SAVED',
        summary: '项目生命周期复盘草稿已保存。',
        afterData: { retrospectiveId: record.id, status: record.status },
      });
    });

    return this.getRetrospective(projectId, actor);
  }

  async completeRetrospective(
    projectId: string,
    input: SaveRetrospectiveDto,
    actor: AuthenticatedUser,
  ) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.write',
    );
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true, currentNodeCode: true },
    });
    if (!project) {
      throw new NotFoundException('项目不存在或已被删除。');
    }
    if (
      project.status !== ProjectStatus.COMPLETED &&
      project.currentNodeCode !== WorkflowNodeCode.PROJECT_CLOSED
    ) {
      throw new BadRequestException('项目尚未进入关闭节点，不能完成生命周期复盘。');
    }

    const existing = await this.prisma.projectRetrospective.findUnique({ where: { projectId } });
    if (existing?.status === ProjectRetrospectiveStatus.COMPLETED) {
      return this.getRetrospective(projectId, actor);
    }

    await this.prisma.$transaction(async (tx) => {
      const record = await tx.projectRetrospective.upsert({
        where: { projectId },
        create: {
          projectId,
          ...this.toPersistenceInput(input),
          status: ProjectRetrospectiveStatus.COMPLETED,
          completedById: actor.id,
          completedAt: new Date(),
        },
        update: {
          ...this.toPersistenceInput(input),
          status: ProjectRetrospectiveStatus.COMPLETED,
          completedById: actor.id,
          completedAt: new Date(),
        },
      });
      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PROJECT,
        targetId: projectId,
        action: 'PROJECT_RETROSPECTIVE_COMPLETED',
        summary: '项目生命周期复盘已完成并锁定。',
        afterData: { retrospectiveId: record.id, status: record.status },
      });
    });

    return this.getRetrospective(projectId, actor);
  }

  private toPersistenceInput(input: SaveRetrospectiveDto) {
    return {
      conclusion: this.clean(input.conclusion),
      improvementMeasures: input.improvementMeasures.map((item) => ({
        problem: item.problem.trim(),
        rootCause: item.rootCause.trim(),
        measure: item.measure.trim(),
        responsibleDepartment: item.responsibleDepartment.trim(),
        dueDate: item.dueDate ?? null,
        isWorkflowRuleUpdate: item.isWorkflowRuleUpdate,
      })) as Prisma.InputJsonValue,
      strengths: this.clean(input.strengths),
      problems: this.clean(input.problems),
      reusableExperience: this.clean(input.reusableExperience),
      workflowRuleUpdates: this.clean(input.workflowRuleUpdates),
    };
  }

  private buildStage(
    group: (typeof STAGE_GROUPS)[number],
    tasks: Array<{
      nodeCode: WorkflowNodeCode;
      dueAt: Date | null;
      startedAt: Date | null;
      completedAt: Date | null;
      createdAt: Date;
      status: WorkflowTaskStatus;
    }>,
    now: Date,
  ) {
    const scoped = tasks.filter((task) => {
      const sequence = Math.round((WORKFLOW_NODE_META_MAP[task.nodeCode]?.sequence ?? 0) / 10);
      return sequence >= group.from && sequence <= group.to;
    });
    const plannedDays = scoped.reduce(
      (sum, task) => sum + this.daysBetween(task.startedAt ?? task.createdAt, task.dueAt),
      0,
    );
    const actualDays = scoped.reduce(
      (sum, task) => sum + this.daysBetween(task.startedAt ?? task.createdAt, task.completedAt ?? now),
      0,
    );
    return {
      key: group.key,
      name: group.name,
      plannedDays,
      actualDays,
      varianceDays: actualDays - plannedDays,
      completedTasks: scoped.filter((task) =>
        ([WorkflowTaskStatus.APPROVED, WorkflowTaskStatus.COMPLETED] as WorkflowTaskStatus[])
          .includes(task.status),
      ).length,
      totalTasks: scoped.length,
    };
  }

  private buildBottlenecks(
    tasks: Array<{
      id: string;
      nodeCode: WorkflowNodeCode;
      nodeName: string;
      taskRound: number;
      dueAt: Date | null;
      completedAt: Date | null;
      reworkReason: string | null;
    }>,
    blockers: Array<{
      blockerType: string;
      description: string;
      status: TaskBlockerStatus;
      helperUser: { id: string; name: string } | null;
    }>,
    requiredCountByNode: Map<WorkflowNodeCode, number>,
    attachmentCountByTask: Map<string, number>,
    now: Date,
  ) {
    const delay = [...tasks]
      .map((task) => ({
        task,
        days: task.dueAt
          ? Math.max(0, this.daysBetween(task.dueAt, task.completedAt ?? now))
          : 0,
      }))
      .sort((left, right) => right.days - left.days)[0];
    const rework = [...tasks].sort((left, right) => right.taskRound - left.taskRound)[0];
    const missing = [...tasks]
      .map((task) => ({
        task,
        count: Math.max(
          0,
          (requiredCountByNode.get(task.nodeCode) ?? 0) -
            (attachmentCountByTask.get(task.id) ?? 0),
        ),
      }))
      .sort((left, right) => right.count - left.count)[0];
    const blockerFrequency = new Map<string, number>();
    for (const blocker of blockers) {
      blockerFrequency.set(
        blocker.blockerType,
        (blockerFrequency.get(blocker.blockerType) ?? 0) + 1,
      );
    }
    const frequentType = [...blockerFrequency.entries()].sort((a, b) => b[1] - a[1])[0];
    const frequentBlocker = frequentType
      ? blockers.find((blocker) => blocker.blockerType === frequentType[0]) ?? null
      : null;

    return {
      maxDelay: delay && delay.days > 0
        ? { nodeName: delay.task.nodeName, days: delay.days }
        : null,
      maxRework: rework && rework.taskRound > 1
        ? { nodeName: rework.nodeName, rounds: rework.taskRound, reason: rework.reworkReason }
        : null,
      maxMissingMaterial: missing && missing.count > 0
        ? { nodeName: missing.task.nodeName, count: missing.count }
        : null,
      frequentBlocker: frequentBlocker
        ? {
            type: frequentBlocker.blockerType,
            count: frequentType?.[1] ?? 1,
            description: frequentBlocker.description,
            helperName: frequentBlocker.helperUser?.name ?? null,
            open: frequentBlocker.status === TaskBlockerStatus.OPEN,
          }
        : null,
    };
  }

  private parseRequiredCount(value: Prisma.JsonValue | null) {
    if (!Array.isArray(value)) {
      return 0;
    }
    return value.filter((item) => {
      if (typeof item === 'string') {
        return item.trim().length > 0;
      }
      return Boolean(item && typeof item === 'object' && !Array.isArray(item));
    }).length;
  }

  private improvementArray(value: Prisma.JsonValue | null | undefined) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((item) => {
      if (typeof item === 'string') {
        return [{
          problem: '',
          rootCause: '',
          measure: item,
          responsibleDepartment: '',
          dueDate: null,
          isWorkflowRuleUpdate: false,
        }];
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return [];
      }
      const record = item as Record<string, Prisma.JsonValue>;
      return [{
        problem: typeof record.problem === 'string' ? record.problem : '',
        rootCause: typeof record.rootCause === 'string' ? record.rootCause : '',
        measure: typeof record.measure === 'string' ? record.measure : '',
        responsibleDepartment:
          typeof record.responsibleDepartment === 'string' ? record.responsibleDepartment : '',
        dueDate: typeof record.dueDate === 'string' ? record.dueDate : null,
        isWorkflowRuleUpdate: record.isWorkflowRuleUpdate === true,
      }];
    });
  }

  private daysBetween(start: Date | null, end: Date | null) {
    if (!start || !end) {
      return 0;
    }
    return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY));
  }

  private buildSystemConclusion(
    status: ProjectStatus,
    decision: ColorExitSuggestion | null | undefined,
  ) {
    if (decision === ColorExitSuggestion.EXIT) {
      return '项目已形成退出结论，建议将关键经验固化到后续开发流程。';
    }
    if (decision === ColorExitSuggestion.RETAIN) {
      return '项目完成生命周期评估，当前结论为继续保留该颜色。';
    }
    return status === ProjectStatus.COMPLETED
      ? '项目主流程已完成，等待补充复盘结论。'
      : '项目仍在推进中，当前复盘数据会随真实流程持续更新。';
  }

  private clean(value: string | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
