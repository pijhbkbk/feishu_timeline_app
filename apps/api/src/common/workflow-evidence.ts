import { ConflictException } from '@nestjs/common';
import { Prisma, type WorkflowNodeCode } from '@prisma/client';

export function isReworkTask(task: { payload?: Prisma.JsonValue | null }) {
  const value = task.payload;
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (typeof value.supersedesTaskId === 'string' || typeof value.technicalReworkSourceTaskId === 'string'));
}
export function isTechnicalReworkTask(task: { payload?: Prisma.JsonValue | null }) {
  const value = task.payload;
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof value.technicalReworkSourceTaskId === 'string');
}

function evidenceId(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new ConflictException('业务证据标识无效，请核对记录。');
  }
  return value;
}

/** Project-locked callers only need three chain identifiers, never the full legacy JSON. */
export async function readEvidenceTask(db: Prisma.TransactionClient, projectId: string, taskId: string, workflowInstanceId?: string) {
  const rows = await db.$queryRaw<Array<{ id: string; projectId: string; workflowInstanceId: string; nodeCode: WorkflowNodeCode;
    fromTaskId: string | null; supersedesTaskId: string | null; technicalReworkSourceTaskId: string | null; invalidType: boolean }>>(Prisma.sql`
    SELECT "id", "projectId", "workflowInstanceId", "nodeCode",
      LEFT("payload"->>'fromTaskId', 129) AS "fromTaskId",
      LEFT("payload"->>'supersedesTaskId', 129) AS "supersedesTaskId",
      LEFT("payload"->>'technicalReworkSourceTaskId', 129) AS "technicalReworkSourceTaskId",
      (COALESCE(jsonb_typeof("payload"->'fromTaskId') NOT IN ('string', 'null'), false)
       OR COALESCE(jsonb_typeof("payload"->'supersedesTaskId') NOT IN ('string', 'null'), false)
       OR COALESCE(jsonb_typeof("payload"->'technicalReworkSourceTaskId') NOT IN ('string', 'null'), false)) AS "invalidType"
    FROM "workflow_tasks" WHERE "id" = ${taskId} AND "projectId" = ${projectId}
      ${workflowInstanceId ? Prisma.sql`AND "workflowInstanceId" = ${workflowInstanceId}` : Prisma.empty}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;
  if (row.invalidType) throw new ConflictException('工序依据标识类型无效，请核对历史。');
  const payload: Prisma.JsonObject = {};
  for (const key of ['fromTaskId', 'supersedesTaskId', 'technicalReworkSourceTaskId'] as const) {
    if (row[key] !== null && row[key] !== undefined) payload[key] = evidenceId(row[key]);
  }
  return { id: row.id, projectId: row.projectId, workflowInstanceId: row.workflowInstanceId, nodeCode: row.nodeCode, payload };
}

/** Immutable creation audits are written inside the same authorized project transaction. */
export async function taskEvidenceIds(db: Prisma.TransactionClient, projectId: string, taskId: string) {
  const task = await db.workflowTask.findFirst({ where: { id: taskId, projectId }, select: { nodeCode: true } });
  if (!task) throw new ConflictException('本轮证据对应任务不存在。');
  const actions = ['SAMPLE_CREATED', 'SAMPLE_VERSION_CREATED', 'PAINT_PROCUREMENT_CREATED', 'STANDARD_BOARD_CREATED',
    'COLOR_BOARD_DETAIL_UPDATE_CREATED', 'PERFORMANCE_TEST_CREATED', 'FIRST_PRODUCTION_PLAN_CREATED', 'TRIAL_PRODUCTION_CREATED'];
  const rows = await db.$queryRaw<Array<{ evidenceId: string; invalidType: boolean }>>(Prisma.sql`
    SELECT LEFT(COALESCE("metadata"->>'evidenceRecordId', "targetId"), 129) AS "evidenceId",
      COALESCE(jsonb_typeof("metadata"->'evidenceRecordId') NOT IN ('string', 'null'), false) AS "invalidType"
    FROM "audit_logs" WHERE "projectId" = ${projectId} AND "nodeCode" = ${task.nodeCode}::"WorkflowNodeCode"
      AND "action" IN (${Prisma.join(actions)})
      AND "metadata"->'workflowTaskId' = to_jsonb(${taskId}::text)
      AND "metadata"->'evidenceKind' = '"TASK_CREATED_RECORD"'::jsonb
    LIMIT 1001
  `);
  if (rows.length > 1000) throw new ConflictException('本轮业务记录超过读取上限，请核对后继续。');
  return rows.map(row => {
    if (row.invalidType) throw new ConflictException('业务证据标识类型无效，请核对记录。');
    return evidenceId(row.evidenceId);
  });
}

export async function ancestorEvidenceIds(db: Prisma.TransactionClient,
  task: { projectId: string; workflowInstanceId: string; payload: Prisma.JsonValue | null }, nodeCode: WorkflowNodeCode) {
  let payload = task.payload;
  const visited = new Set<string>();
  for (let depth = 0; depth < 64; depth++) {
    const value = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.fromTaskId : null;
    if (value == null) return [];
    const id = evidenceId(value);
    if (visited.has(id)) throw new ConflictException('工序依据存在循环，请核对历史。');
    visited.add(id);
    const previous = await readEvidenceTask(db, task.projectId, id, task.workflowInstanceId);
    if (!previous) return [];
    if (previous.nodeCode === nodeCode) return taskEvidenceIds(db, task.projectId, previous.id);
    payload = previous.payload;
  }
  throw new ConflictException('返工依据链超过读取上限，请核对历史。');
}
