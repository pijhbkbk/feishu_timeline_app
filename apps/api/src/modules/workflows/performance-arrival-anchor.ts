import { ConflictException } from '@nestjs/common';
import { Prisma, type WorkflowTask } from '@prisma/client';
import { addUtcMonthsClamped } from './workflow-date.utils';

export const PERFORMANCE_ARRIVAL_RULE = 'FIRST_VALID_ARRIVAL_PLUS_6_CALENDAR_MONTHS_V1';
const MAX_ROUND_PROCUREMENTS = 100;
export type PerformanceArrivalAnchor = {
  rule: typeof PERFORMANCE_ARRIVAL_RULE;
  procurementTaskId: string;
  procurementId: string;
  creationAuditId: string;
  arrivalAuditId: string;
  arrivalDate: string;
  dueAt: string;
};

function object(value: Prisma.JsonValue | undefined): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function performanceDueAt(arrivalDate: Date) {
  // Match the Asia/Shanghai business day used by reminders. Keep the existing
  // UTC calendar helper for month clamping, without changing older task dates.
  const businessDate = new Date(arrivalDate.getTime() + 8 * 60 * 60 * 1000);
  const targetDay = addUtcMonthsClamped(businessDate, 6).toISOString().slice(0, 10);
  return new Date(`${targetDay}T23:59:59.999+08:00`);
}

export function readPerformanceArrivalAnchor(payload: Prisma.JsonValue | undefined): PerformanceArrivalAnchor | null {
  const raw = object(payload).performanceArrivalAnchor;
  if (raw === undefined) return null;
  const anchor = object(raw);
  const keys = ['procurementTaskId', 'procurementId', 'creationAuditId', 'arrivalAuditId', 'arrivalDate', 'dueAt'] as const;
  if (anchor.rule !== PERFORMANCE_ARRIVAL_RULE || keys.some(key => typeof anchor[key] !== 'string' || !anchor[key] || (anchor[key] as string).length > 128)) {
    throw new ConflictException('性能试验到货起算依据格式异常，请核对后重试。');
  }
  const arrivalDate = new Date(anchor.arrivalDate as string);
  if (!Number.isFinite(arrivalDate.getTime()) || arrivalDate.toISOString() !== anchor.arrivalDate || performanceDueAt(arrivalDate).toISOString() !== anchor.dueAt) {
    throw new ConflictException('性能试验到货起算依据日期不一致，请核对后重试。');
  }
  return {
    rule: PERFORMANCE_ARRIVAL_RULE, procurementTaskId: anchor.procurementTaskId as string,
    procurementId: anchor.procurementId as string, creationAuditId: anchor.creationAuditId as string,
    arrivalAuditId: anchor.arrivalAuditId as string, arrivalDate: anchor.arrivalDate as string, dueAt: anchor.dueAt as string,
  };
}

/** Deadline refresh needs seven small fields, never the full legacy task JSON. */
export async function loadPerformanceArrivalAnchor(db: Pick<Prisma.TransactionClient, '$queryRaw'>, taskId: string) {
  const keys = ['rule', 'procurementTaskId', 'procurementId', 'creationAuditId', 'arrivalAuditId', 'arrivalDate', 'dueAt'];
  const fields = keys.map(key => Prisma.sql`${key}, CASE
    WHEN jsonb_typeof("payload"->'performanceArrivalAnchor'->${key}) = 'string'
    THEN LEFT("payload"->'performanceArrivalAnchor'->>${key}, 129) ELSE NULL END`);
  const rows = await db.$queryRaw<Array<{ anchorType: string | null; anchor: Prisma.JsonObject }>>(Prisma.sql`
    SELECT jsonb_typeof("payload"->'performanceArrivalAnchor') AS "anchorType",
      jsonb_build_object(${Prisma.join(fields)}) AS anchor
    FROM workflow_tasks WHERE id = ${taskId} AND "nodeCode" = 'PERFORMANCE_TEST' LIMIT 1`);
  const row = rows[0];
  if (!row || row.anchorType === null) return null;
  return readPerformanceArrivalAnchor({ performanceArrivalAnchor: row.anchorType === 'object' ? row.anchor : null });
}

/** Caller holds the project and active procurement task locks. No historical
 * task, procurement or audit row is rewritten. Existing anchors never reset.
 */
export async function ensurePerformanceArrivalAnchor(
  tx: Prisma.TransactionClient,
  task: Pick<WorkflowTask, 'id' | 'projectId' | 'nodeCode' | 'isActive' | 'status' | 'payload' | 'updatedAt'>,
  actorUserId: string,
) {
  if (task.nodeCode !== 'PAINT_PROCUREMENT' || !task.isActive || !['PENDING', 'READY', 'IN_PROGRESS', 'RETURNED'].includes(task.status)) {
    throw new ConflictException('只能为当前活动采购任务记录性能试验到货起算依据。');
  }
  const existing = readPerformanceArrivalAnchor(task.payload);
  if (existing) {
    if (existing.procurementTaskId !== task.id) throw new ConflictException('性能试验到货起算依据不属于当前采购轮次。');
    return existing;
  }

  // Project only the fixed evidence fields: a legacy audit may contain unrelated
  // large JSON. All SQL fragments are fixed and values remain parameterized.
  const creations = await tx.$queryRaw<Array<{ id: string; targetId: string; recordId: string | null; createdAt: Date }>>(Prisma.sql`
    SELECT "id", "targetId", LEFT("afterData"->>'id', 129) AS "recordId", "createdAt"
    FROM "audit_logs" WHERE "projectId" = ${task.projectId}
      AND "targetType" = 'PAINT_PROCUREMENT'::"AuditTargetType"
      AND "action" = 'PAINT_PROCUREMENT_CREATED'
      AND "metadata"->>'workflowTaskId' = ${task.id}
    ORDER BY "id" ASC LIMIT ${MAX_ROUND_PROCUREMENTS + 1}
  `);
  if (creations.length > MAX_ROUND_PROCUREMENTS) throw new ConflictException('本轮采购起算依据超过核对上限。');
  const createdById = new Map(creations.map(row => [row.targetId, row]));
  if (createdById.size !== creations.length) throw new ConflictException('本轮采购创建依据重复，请核对后重试。');
  const records = creations.length ? await tx.paintProcurement.findMany({
    where: { projectId: task.projectId, id: { in: [...createdById.keys()] }, status: 'ARRIVED', arrivalDate: { not: null } },
    select: { id: true, arrivalDate: true }, orderBy: { id: 'asc' }, take: MAX_ROUND_PROCUREMENTS + 1,
  }) : [];
  const recordsById = new Map(records.map(row => [row.id, row]));
  const arrivals = records.length ? await tx.$queryRaw<Array<{
    id: string; targetId: string; recordId: string | null; beforeStatus: string | null;
    afterStatus: string | null; arrivalDate: string | null; createdAt: Date;
  }>>(Prisma.sql`
    SELECT "id", "targetId", LEFT("afterData"->>'id', 129) AS "recordId",
      LEFT("beforeData"->>'status', 32) AS "beforeStatus", LEFT("afterData"->>'status', 32) AS "afterStatus",
      LEFT("afterData"->>'arrivalDate', 64) AS "arrivalDate", "createdAt"
    FROM "audit_logs" WHERE "projectId" = ${task.projectId}
      AND "targetType" = 'PAINT_PROCUREMENT'::"AuditTargetType"
      AND "action" = 'PAINT_PROCUREMENT_ARRIVED' AND "targetId" IN (${Prisma.join([...recordsById.keys()])})
    ORDER BY "createdAt" ASC, "id" ASC LIMIT ${MAX_ROUND_PROCUREMENTS + 1}
  `) : [];
  if (records.length > MAX_ROUND_PROCUREMENTS || arrivals.length > MAX_ROUND_PROCUREMENTS) throw new ConflictException('本轮采购到货依据超过核对上限。');
  // Arrival event order freezes the first valid confirmed arrival. A later
  // delivery (including a backdated entry) must not move that frozen deadline.
  const validArrivals = arrivals.filter(row => {
    const record = recordsById.get(row.targetId);
    const creation = createdById.get(row.targetId);
    return record?.arrivalDate && creation?.recordId === record.id && row.createdAt >= creation.createdAt &&
      row.beforeStatus === 'ORDERED' && row.afterStatus === 'ARRIVED' &&
      row.recordId === record.id && row.arrivalDate === record.arrivalDate.toISOString();
  });
  const first = validArrivals[0];
  if (!first) throw new ConflictException('缺少当前采购轮次明确的创建与实际到货依据，请核对后再完成采购。');
  if (validArrivals.some(row => row.targetId !== first.targetId && row.createdAt.getTime() === first.createdAt.getTime())) {
    throw new ConflictException('本轮最早到货审计顺序不明确，请核对后再记录起算依据。');
  }
  const record = recordsById.get(first.targetId)!;
  const anchor: PerformanceArrivalAnchor = {
    rule: PERFORMANCE_ARRIVAL_RULE, procurementTaskId: task.id, procurementId: first.targetId,
    creationAuditId: createdById.get(first.targetId)!.id, arrivalAuditId: first.id,
    arrivalDate: record.arrivalDate!.toISOString(), dueAt: performanceDueAt(record.arrivalDate!).toISOString(),
  };
  const changed = await tx.workflowTask.updateMany({
    where: { id: task.id, projectId: task.projectId, isActive: true, status: task.status, updatedAt: task.updatedAt },
    data: { payload: { ...object(task.payload), performanceArrivalAnchor: anchor } },
  });
  if (changed.count !== 1) throw new ConflictException('采购任务已变化，请刷新后重新核对到货起算依据。');
  await tx.auditLog.create({ data: {
    projectId: task.projectId, actorUserId, targetType: 'WORKFLOW_TASK', targetId: task.id,
    nodeCode: 'PAINT_PROCUREMENT', action: 'PERFORMANCE_ARRIVAL_ANCHOR_RECORDED',
    summary: '记录本轮首次有效到货及六个日历月性能反馈期限。',
    afterData: anchor, metadata: { evidenceKind: 'CURRENT_ROUND_ARRIVAL_AUDIT_CHAIN' },
  } });
  return anchor;
}
