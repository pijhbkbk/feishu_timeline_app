import { ConflictException } from '@nestjs/common';
import { Prisma, WorkflowNodeCode } from '@prisma/client';
import { readEvidenceTask, taskEvidenceIds } from '../../common/workflow-evidence';

type ReviewTask = { projectId: string; workflowInstanceId: string; payload: Prisma.JsonValue | null };
const VALID_BOARD_TASK_STATES = new Set(['READY', 'IN_PROGRESS', 'APPROVED', 'COMPLETED']);
const empty = (parallel = false) => ({ boardIds: [] as string[], parallel });

/** The exact procurement task is the development-round anchor, not the numeric
 * taskRound or latest timestamp. A normal 12 <- 11 <- 10 <- 06 chain has 07 as
 * a sibling of 10. Keep direct 07 ancestry for existing technical rework chains.
 * Writes call this inside the existing project/task-locked transaction. */
export async function reviewStandardEvidence(db: Prisma.TransactionClient, task: ReviewTask) {
  let payload = task.payload;
  const visited = new Set<string>();
  for (let depth = 0; depth < 64; depth++) {
    const id = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.fromTaskId : null;
    if (id == null) return empty();
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new ConflictException('工序依据标识无效，请核对历史。');
    if (visited.has(id)) throw new ConflictException('工序依据存在循环，请核对历史。');
    visited.add(id);
    const previous = await readEvidenceTask(db, task.projectId, id, task.workflowInstanceId);
    if (!previous) return empty();
    if (previous.nodeCode === WorkflowNodeCode.STANDARD_BOARD_PRODUCTION) {
      const source = await db.workflowTask.findFirst({ where: { id, projectId: task.projectId, workflowInstanceId: task.workflowInstanceId }, select: { status: true } });
      if (!source || !VALID_BOARD_TASK_STATES.has(source.status)) return empty();
      return { boardIds: await taskEvidenceIds(db, task.projectId, id), parallel: false };
    }
    if (previous.nodeCode === WorkflowNodeCode.PAINT_PROCUREMENT) {
      // Both the immutable transition and its task payload must identify the
      // same source. No fallback to another procurement or an unproven board.
      const sources = await db.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT board_task."id", board_task."status"::text AS "status"
        FROM workflow_tasks board_task
        JOIN workflow_tasks procurement ON procurement."id" = ${id}
          AND procurement."projectId" = ${task.projectId}
          AND procurement."workflowInstanceId" = ${task.workflowInstanceId}
          AND procurement."nodeCode" = 'PAINT_PROCUREMENT' AND procurement."status" = 'COMPLETED'
        WHERE board_task."projectId" = ${task.projectId}
          AND board_task."workflowInstanceId" = ${task.workflowInstanceId}
          AND board_task."nodeCode" = 'STANDARD_BOARD_PRODUCTION'
          AND board_task."payload"->'fromTaskId' = to_jsonb(${id}::text)
          AND COALESCE(board_task."payload"->'technicalReworkSourceTaskId', 'null'::jsonb)
            = COALESCE(procurement."payload"->'technicalReworkSourceTaskId', 'null'::jsonb)
          AND EXISTS (SELECT 1 FROM workflow_transitions transition
            WHERE transition."projectId" = ${task.projectId}
              AND transition."workflowInstanceId" = ${task.workflowInstanceId}
              AND transition."fromTaskId" = ${id} AND transition."toTaskId" = board_task."id"
              AND transition."fromNodeCode" = 'PAINT_PROCUREMENT'
              AND transition."toNodeCode" = 'STANDARD_BOARD_PRODUCTION'
              AND transition."action" IN ('COMPLETE', 'SUBMIT'))
        LIMIT 2
      `);
      if (sources.length > 1) throw new ConflictException('同一采购轮次存在多个制板工序，请核对标准来源。');
      const source = sources[0];
      if (!source || !VALID_BOARD_TASK_STATES.has(source.status)) return empty(true);
      return { boardIds: await taskEvidenceIds(db, task.projectId, source.id), parallel: true };
    }
    payload = previous.payload;
  }
  throw new ConflictException('返工依据链超过读取上限，请核对历史。');
}
