import { randomUUID } from 'node:crypto';
import { Prisma, type FreeWorkbook, type FreeWorkbookDraft } from '@prisma/client';
import type { validateSnapshot } from './workbook.rules';

type SnapshotInput = Pick<ReturnType<typeof validateSnapshot>, 'serialized' | 'bytes' | 'hash'>;
type WorkbookMeta = Pick<FreeWorkbook, 'id' | 'name' | 'revision' | 'snapshotHash' | 'updatedAt'>;
type DraftMeta = Pick<FreeWorkbookDraft, 'id' | 'draftRevision' | 'baseWorkbookRevision' | 'snapshotHash' | 'snapshotBytes' | 'updatedAt'>;

/** Prisma 6's model Json input can round a nested JS number before PostgreSQL
 * receives it. Pass the validated JSON text as a bound string instead. Reads
 * remain ordinary Prisma queries. These helpers require the caller's existing
 * authorized transaction, locks, asset checks, quotas and audit operations. */
function inserted<T>(rows: T[]): T {
  if (rows.length !== 1) throw new Error('Unexpected workbook insert result.');
  return rows[0]!;
}

export async function insertWorkbookSnapshot(tx: Prisma.TransactionClient, id: string, name: string, actorId: string, value: SnapshotInput): Promise<WorkbookMeta> {
  return inserted(await tx.$queryRaw<WorkbookMeta[]>(Prisma.sql`
    INSERT INTO free_workbooks
      (id,name,revision,snapshot,"snapshotBytes","snapshotHash","createdById","updatedById","updatedAt")
    VALUES (${id}::uuid,${name},1,${value.serialized}::jsonb,${value.bytes},${value.hash},${actorId},${actorId},${new Date()})
    RETURNING id,name,revision,"snapshotHash","updatedAt"`));
}

export function updateWorkbookSnapshot(tx: Prisma.TransactionClient, id: string, expected: number, name: string, actorId: string, value: SnapshotInput): Promise<number> {
  return tx.$executeRaw(Prisma.sql`
    UPDATE free_workbooks SET name=${name},snapshot=${value.serialized}::jsonb,
      "snapshotBytes"=${value.bytes},"snapshotHash"=${value.hash},revision=revision+1,
      "updatedById"=${actorId},"updatedAt"=${new Date()}
    WHERE id=${id}::uuid AND revision=${expected}`);
}

export async function insertWorkbookRevisionSnapshot(tx: Prisma.TransactionClient, workbookId: string, revision: number, actorId: string, value: SnapshotInput, restoredFrom?: number): Promise<void> {
  const count=await tx.$executeRaw(Prisma.sql`
    INSERT INTO free_workbook_revisions
      (id,"workbookId",revision,snapshot,"snapshotBytes","snapshotHash","actorUserId","restoredFrom")
    VALUES (${randomUUID()}::uuid,${workbookId}::uuid,${revision},${value.serialized}::jsonb,
      ${value.bytes},${value.hash},${actorId},${restoredFrom ?? null})`);
  if(count !== 1) throw new Error('Unexpected workbook history insert result.');
}

export async function insertWorkbookDraftSnapshot(tx: Prisma.TransactionClient, workbookId: string, authorId: string, baseRevision: number, value: SnapshotInput): Promise<DraftMeta> {
  return inserted(await tx.$queryRaw<DraftMeta[]>(Prisma.sql`
    INSERT INTO free_workbook_drafts
      (id,"workbookId","authorUserId","draftRevision","baseWorkbookRevision",snapshot,"snapshotBytes","snapshotHash","updatedAt")
    VALUES (${randomUUID()}::uuid,${workbookId}::uuid,${authorId},1,${baseRevision},
      ${value.serialized}::jsonb,${value.bytes},${value.hash},${new Date()})
    RETURNING id,"draftRevision","baseWorkbookRevision","snapshotHash","snapshotBytes","updatedAt"`));
}

export function updateWorkbookDraftSnapshot(tx: Prisma.TransactionClient, id: string, authorId: string, expected: number, baseRevision: number, value: SnapshotInput): Promise<number> {
  return tx.$executeRaw(Prisma.sql`
    UPDATE free_workbook_drafts SET "baseWorkbookRevision"=${baseRevision},snapshot=${value.serialized}::jsonb,
      "snapshotBytes"=${value.bytes},"snapshotHash"=${value.hash},"draftRevision"="draftRevision"+1,"updatedAt"=${new Date()}
    WHERE id=${id}::uuid AND "authorUserId"=${authorId} AND "draftRevision"=${expected}`);
}
