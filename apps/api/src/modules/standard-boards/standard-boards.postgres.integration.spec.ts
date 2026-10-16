import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StandardBoardsService } from './standard-boards.service';
const url = process.env.R28_TEST_DATABASE_URL;
describe.skipIf(!url)('standard board bounded text admission on PostgreSQL', () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const service = new StandardBoardsService(db as never, {} as never, {} as never, {} as never);
  let projectId: string, boardId: string;
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55449' || parsed.pathname !== '/r28_recovered') throw new Error('Only the isolated recovered database is allowed.');
    const id = randomUUID();
    projectId = (await db.project.create({ data: { code: `R28-BOARD-${id}`, name: '合成标准板准入验证' } })).id;
    boardId = (await db.standardBoard.create({ data: { projectId, boardCode: `R28-${id}`, versionNo: 1, remark: '合成记录' } })).id;
  });
  afterAll(() => db.$disconnect());
  it.each(['IDENTITY', 'AUDIT'])('loads a valid board through %s admission', async mode => {
    const record = await (service as any).getBoardOrThrow(db, projectId, boardId, mode);
    expect(record.id).toBe(boardId);
  });
  it('rejects oversized stored codes before materializing the complete record', async () => {
    const id = (await db.standardBoard.create({ data: { projectId, boardCode: 'x'.repeat(65), versionNo: 2, isCurrent: false } })).id;
    await expect((service as any).getBoardOrThrow(db, projectId, id, 'AUDIT')).rejects.toMatchObject({ status: 400 });
  });
});
