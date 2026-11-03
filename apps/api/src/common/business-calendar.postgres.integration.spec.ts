import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { businessDateKey, businessDayRange, businessMonthCalendarRange } from './business-date';

const url = process.env.WORKBOOK_TEST_DATABASE_URL;
const rollback = new Error('SYNTHETIC_READONLY_CALENDAR_ROLLBACK');
let prisma: PrismaClient;

describe.skipIf(!url)('Beijing calendar predicates on retained isolated PostgreSQL', () => {
  beforeAll(async () => {
    if (!url) throw new Error('Dedicated calendar database required');
    const target = new URL(url);
    if (target.hostname !== '127.0.0.1' || target.port !== '55460' ||
        target.pathname !== '/free_workbook_drafts_numeric_ada566b322') throw new Error('Dedicated calendar database required');
    prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
    await prisma.$connect();
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  for (const zone of ['UTC', 'Asia/Shanghai', 'America/New_York']) {
    it(`keeps Beijing DATE/month and instant boundaries with PostgreSQL timezone ${zone}`, async () => {
      const now = new Date('2026-12-31T16:05:00.000Z');
      const month = businessMonthCalendarRange(now);
      const day = businessDayRange(now);
      await expect(prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$queryRaw(Prisma.sql`SELECT set_config('TimeZone', ${zone}, true)`);
        const rows = await tx.$queryRaw<Array<{ monthLabels: string[]; activeToday: boolean; beforeToday: boolean; startInstant: Date; endInstant: Date }>>(Prisma.sql`
          SELECT ARRAY(SELECT d::text FROM (VALUES (DATE '2026-12-31'), (DATE '2027-01-01'),
            (DATE '2027-01-31'), (DATE '2027-02-01')) facts(d)
            WHERE d >= ${month.start.toISOString().slice(0, 10)}::date
              AND d < ${month.end.toISOString().slice(0, 10)}::date ORDER BY d) AS "monthLabels",
            DATE '2027-01-01' <= ${businessDateKey(now)}::date AS "activeToday",
            DATE '2027-01-01' <= ${businessDateKey(new Date('2026-12-31T15:59:59.999Z'))}::date AS "beforeToday",
            ${day.start.toISOString()}::timestamptz AT TIME ZONE 'UTC' AS "startInstant",
            ${day.end.toISOString()}::timestamptz AT TIME ZONE 'UTC' AS "endInstant"`);
        expect(rows).toEqual([{ monthLabels: ['2027-01-01', '2027-01-31'], activeToday: true, beforeToday: false,
          startInstant: new Date('2026-12-31T16:00:00.000Z'), endInstant: new Date('2027-01-01T16:00:00.000Z') }]);
        throw rollback;
      })).rejects.toBe(rollback);
    });
  }
});
