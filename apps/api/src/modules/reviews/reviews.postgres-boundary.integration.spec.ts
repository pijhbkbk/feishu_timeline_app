import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  PrismaClient,
  ReviewResult,
  ReviewType,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ReviewsService } from './reviews.service';

const INDEX_NAME = 'review_records_projectId_reviewType_id_idx';
const migrationPath = resolve(
  process.cwd(),
  'prisma/migrations/20260814120000_add_review_records_project_type_id_index/migration.sql',
);
const schemaPath = resolve(process.cwd(), 'prisma/schema.prisma');
const servicePath = resolve(
  process.cwd(),
  'src/modules/reviews/reviews.service.ts',
);
const databaseUrl = process.env.REVIEWS_POSTGRES_TEST_DATABASE_URL;

describe('Reviews PostgreSQL boundary static contracts', () => {
  it('declares exactly the approved Prisma index and one-statement migration', async () => {
    const [schema, migration] = await Promise.all([
      readFile(schemaPath, 'utf8'),
      readFile(migrationPath, 'utf8'),
    ]);

    expect(schema).toContain(
      '@@index([projectId, reviewType, id], map: "review_records_projectId_reviewType_id_idx")',
    );
    const statements = migration
      .split(';')
      .map((statement) => statement.replace(/--.*$/gm, '').trim())
      .filter(Boolean);
    expect(statements).toEqual([
      'CREATE INDEX "review_records_projectId_reviewType_id_idx" ON "review_records"("projectId", "reviewType", "id")',
    ]);
  });

  it('keeps bounded IDs, two-stage TEXT checks, and RepeatableRead visible in the service SQL shape', async () => {
    const service = await readFile(servicePath, 'utf8');

    expect(service).toContain('ORDER BY review_record."id" ASC');
    expect(service).toContain('Prisma.join(reviewIds)');
    expect(service).toContain('OCTET_LENGTH');
    expect(service).toContain('CHAR_LENGTH');
    expect(service).toContain('TransactionIsolationLevel.RepeatableRead');
    expect(service).toContain('REVIEW_ORPHAN_REVIEWER');
  });
});

type ReviewFixtureOptions = {
  count?: number;
  comment?: string | null;
  conditionNote?: string | null;
  rejectReason?: string | null;
  reviewerName?: string;
};

type BoundaryReviewType =
  | typeof ReviewType.CAB_REVIEW
  | typeof ReviewType.COLOR_CONSISTENCY_REVIEW
  | typeof ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW;

const reviewNodeByType: Record<BoundaryReviewType, WorkflowNodeCode> = {
  [ReviewType.CAB_REVIEW]: WorkflowNodeCode.CAB_REVIEW,
  [ReviewType.COLOR_CONSISTENCY_REVIEW]:
    WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
  [ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW]:
    WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
} as const;

const upstreamNodeByType: Record<BoundaryReviewType, WorkflowNodeCode> = {
  [ReviewType.CAB_REVIEW]: WorkflowNodeCode.TRIAL_PRODUCTION,
  [ReviewType.COLOR_CONSISTENCY_REVIEW]: WorkflowNodeCode.CAB_REVIEW,
  [ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW]:
    WorkflowNodeCode.MASS_PRODUCTION,
} as const;

if (databaseUrl) {
  describe.sequential('Reviews PostgreSQL boundary integration', () => {
    let prisma: PrismaClient;
    let secondConnection: PrismaClient;
    let fixtureSequence = 0;
    const fixtureRunId = randomUUID().slice(0, 8);

    const actor = {
      id: 'r27d-integration-actor',
      roleCodes: ['project_manager'],
      permissionCodes: ['project.read', 'review.execute'],
      isSystemAdmin: false,
    } as never;

    function createService(attachmentCreate = vi.fn()) {
      return new ReviewsService(
        prisma as never,
        { createWithExecutor: vi.fn().mockResolvedValue(undefined) } as never,
        {
          createStoredAttachment: attachmentCreate,
          toAttachmentSummary: vi.fn((attachment: { id: string }) => ({
            id: attachment.id,
          })),
        } as never,
        {} as never,
        {
          assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({}),
        } as never,
      );
    }

    async function createFixture(
      reviewType: BoundaryReviewType,
      options: ReviewFixtureOptions = {},
    ) {
      fixtureSequence += 1;
      const suffix = `${fixtureRunId}-${String(fixtureSequence).padStart(3, '0')}`;
      const projectId = `r27d-project-${suffix}`;
      const reviewerId = `r27d-reviewer-${suffix}`;
      const workflowInstanceId = `r27d-instance-${suffix}`;
      const activeTaskId = `r27d-task-${suffix}`;
      const upstreamTaskId = `r27d-upstream-${suffix}`;

      await prisma.user.create({
        data: {
          id: reviewerId,
          username: `r27d-reviewer-${suffix}`,
          name: options.reviewerName ?? '边界评审人',
        },
      });
      await prisma.project.create({
        data: {
          id: projectId,
          code: `R27D-${suffix}`,
          name: `R27D PostgreSQL ${suffix}`,
        },
      });
      await prisma.workflowInstance.create({
        data: {
          id: workflowInstanceId,
          projectId,
          instanceNo: `R27D-WF-${suffix}`,
        },
      });
      await prisma.workflowTask.createMany({
        data: [
          {
            id: activeTaskId,
            workflowInstanceId,
            projectId,
            taskNo: `R27D-ACTIVE-${suffix}`,
            nodeCode: reviewNodeByType[reviewType],
            nodeName: 'R27D active review',
            status: WorkflowTaskStatus.IN_PROGRESS,
            isActive: true,
          },
          {
            id: upstreamTaskId,
            workflowInstanceId,
            projectId,
            taskNo: `R27D-UPSTREAM-${suffix}`,
            nodeCode: upstreamNodeByType[reviewType],
            nodeName: 'R27D completed upstream',
            status: WorkflowTaskStatus.COMPLETED,
            isActive: false,
          },
        ],
      });

      const count = options.count ?? 1;
      const reviewIds = Array.from(
        { length: count },
        (_, index) => `r27d-review-${suffix}-${String(index).padStart(3, '0')}`,
      );
      if (reviewIds.length > 0) {
        await prisma.reviewRecord.createMany({
          data: reviewIds.map((id, index) => ({
            id,
            projectId,
            workflowTaskId: activeTaskId,
            reviewerId,
            reviewType,
            reviewPeriod: `R27D-${suffix}-${String(index).padStart(3, '0')}`,
            result: ReviewResult.APPROVED,
            comment: options.comment ?? '评审通过',
            conditionNote: options.conditionNote ?? null,
            rejectReason: options.rejectReason ?? null,
            reviewedAt: new Date('2026-08-14T00:00:00.000Z'),
          })),
        });
      }

      return {
        activeTaskId,
        projectId,
        reviewerId,
        reviewIds,
        reviewType,
      };
    }

    function callWorkspace(
      service: ReviewsService,
      reviewType: BoundaryReviewType,
      projectId: string,
    ) {
      if (reviewType === ReviewType.CAB_REVIEW) {
        return service.getCabinReviewWorkspace(projectId, actor);
      }
      if (reviewType === ReviewType.COLOR_CONSISTENCY_REVIEW) {
        return service.getConsistencyReviewWorkspace(projectId, actor);
      }
      return service.getVisualDeltaReviewWorkspace(projectId, actor);
    }

    async function rejectionOf(promise: Promise<unknown>) {
      try {
        await promise;
        return null;
      } catch (error: unknown) {
        return error;
      }
    }

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: databaseUrl } },
      });
      secondConnection = new PrismaClient({
        datasources: { db: { url: databaseUrl } },
      });
      await Promise.all([prisma.$connect(), secondConnection.$connect()]);
    });

    afterAll(async () => {
      await Promise.all([prisma.$disconnect(), secondConnection.$disconnect()]);
    });

    it('has the applied index with the exact approved column order', async () => {
      const rows = await prisma.$queryRaw<
        Array<{ indexdef: string; migrationFinished: boolean }>
      >(Prisma.sql`
        SELECT
          pg_get_indexdef(index_class.oid) AS "indexdef",
          EXISTS (
            SELECT 1
            FROM "_prisma_migrations" AS migration
            WHERE migration."migration_name" = ${'20260814120000_add_review_records_project_type_id_index'}
              AND migration."finished_at" IS NOT NULL
              AND migration."rolled_back_at" IS NULL
          ) AS "migrationFinished"
        FROM pg_class AS index_class
        INNER JOIN pg_namespace AS namespace
          ON namespace.oid = index_class.relnamespace
        WHERE namespace.nspname = 'public'
          AND index_class.relname = ${INDEX_NAME}
      `);

      expect(rows).toHaveLength(1);
      expect(rows[0]!.migrationFinished).toBe(true);
      expect(rows[0]!.indexdef).toMatch(
        /\("projectId", "reviewType", id\)$/,
      );
    });

    it.each([
      ReviewType.CAB_REVIEW,
      ReviewType.COLOR_CONSISTENCY_REVIEW,
      ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
    ])('round-trips exact persisted boundaries for %s without truncation', async (reviewType) => {
      const fixture = await createFixture(reviewType, {
        comment: 'c'.repeat(4_000),
        conditionNote: 'n'.repeat(1_900),
        rejectReason: 'r'.repeat(2_000),
        reviewerName: '评'.repeat(200),
      });

      const workspace = await callWorkspace(
        createService(),
        reviewType,
        fixture.projectId,
      );

      expect(workspace.items[0]).toMatchObject({
        comment: 'c'.repeat(4_000),
        conditionNote: 'n'.repeat(1_900),
        rejectReason: 'r'.repeat(2_000),
        reviewerName: '评'.repeat(200),
      });
    });

    it.each([
      ['comment', { comment: 'c'.repeat(4_001) }],
      ['conditionNote', { conditionNote: 'n'.repeat(1_901) }],
      ['rejectReason', { rejectReason: 'r'.repeat(2_001) }],
      ['reviewerName', { reviewerName: '评'.repeat(201) }],
    ] as const)('rejects an over-limit persisted %s without echoing it', async (_field, overrides) => {
      const fixture = await createFixture(ReviewType.CAB_REVIEW, overrides);
      const error = await rejectionOf(
        callWorkspace(
          createService(),
          ReviewType.CAB_REVIEW,
          fixture.projectId,
        ),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'REVIEW_PERSISTED_SOURCE_OUT_OF_BOUNDS',
      });
      expect(JSON.stringify((error as ConflictException).getResponse())).not.toContain(
        'c'.repeat(128),
      );
    });

    it('rejects a genuine large TOAST-backed legacy comment through the byte fast path', async () => {
      const fixture = await createFixture(ReviewType.CAB_REVIEW);
      await prisma.$executeRaw(
        Prisma.sql`ALTER TABLE "review_records" ALTER COLUMN "comment" SET STORAGE EXTERNAL`,
      );
      const before = await prisma.$queryRaw<Array<{ bytes: bigint }>>(Prisma.sql`
        SELECT pg_relation_size(table_class.reltoastrelid)::bigint AS "bytes"
        FROM pg_class AS table_class
        WHERE table_class.oid = 'review_records'::regclass
      `);
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "review_records"
        SET "comment" = (
          SELECT string_agg(md5(series_value::text), '')
          FROM generate_series(1, 20000) AS series_value
        )
        WHERE "id" = ${fixture.reviewIds[0]!}
      `);
      const after = await prisma.$queryRaw<
        Array<{ bytes: bigint; length: number }>
      >(Prisma.sql`
        SELECT
          pg_relation_size(table_class.reltoastrelid)::bigint AS "bytes",
          OCTET_LENGTH(review_record."comment")::integer AS "length"
        FROM pg_class AS table_class
        CROSS JOIN "review_records" AS review_record
        WHERE table_class.oid = 'review_records'::regclass
          AND review_record."id" = ${fixture.reviewIds[0]!}
      `);

      expect(after[0]!.bytes).toBeGreaterThan(before[0]!.bytes);
      expect(after[0]!.length).toBeGreaterThan(500_000);
      await expect(
        callWorkspace(
          createService(),
          ReviewType.CAB_REVIEW,
          fixture.projectId,
        ),
      ).rejects.toMatchObject({
        response: { code: 'REVIEW_PERSISTED_SOURCE_OUT_OF_BOUNDS' },
      });
    });

    it('allows the 100th row and fail-closes the 101st before materialization', async () => {
      const bounded = await createFixture(ReviewType.CAB_REVIEW, { count: 100 });
      await expect(
        callWorkspace(createService(), ReviewType.CAB_REVIEW, bounded.projectId),
      ).resolves.toMatchObject({ items: expect.arrayContaining([]) });

      const overflow = await createFixture(
        ReviewType.COLOR_CONSISTENCY_REVIEW,
        { count: 101 },
      );
      await expect(
        callWorkspace(
          createService(),
          ReviewType.COLOR_CONSISTENCY_REVIEW,
          overflow.projectId,
        ),
      ).rejects.toMatchObject({
        response: { code: 'REVIEW_RECORD_LIMIT_EXCEEDED' },
      });
    });

    it('preserves ReviewRecord history with SetNull and rejects orphan workspace/upload before storage', async () => {
      const fixture = await createFixture(ReviewType.CAB_REVIEW);
      await prisma.user.delete({ where: { id: fixture.reviewerId } });
      const persisted = await prisma.reviewRecord.findUniqueOrThrow({
        where: { id: fixture.reviewIds[0]! },
        select: { id: true, reviewerId: true },
      });
      expect(persisted).toEqual({
        id: fixture.reviewIds[0],
        reviewerId: null,
      });

      const createStoredAttachment = vi.fn();
      const service = createService(createStoredAttachment);
      await expect(
        service.getCabinReviewWorkspace(fixture.projectId, actor),
      ).rejects.toMatchObject({
        response: { code: 'REVIEW_ORPHAN_REVIEWER' },
      });
      await expect(
        service.uploadCabinReviewAttachment(
          fixture.projectId,
          fixture.reviewIds[0]!,
          {
            originalname: 'review.pdf',
            mimetype: 'application/pdf',
            size: 8,
            buffer: Buffer.from('%PDF-1'),
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: { code: 'REVIEW_ORPHAN_REVIEWER' },
      });
      expect(createStoredAttachment).not.toHaveBeenCalled();
    });

    it('holds the bounded ID view stable across two connections under RepeatableRead', async () => {
      const fixture = await createFixture(ReviewType.CAB_REVIEW, { count: 100 });
      const service = createService() as never as Record<string, any>;
      let releaseSnapshot!: () => void;
      let snapshotStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        snapshotStarted = resolve;
      });
      const release = new Promise<void>((resolve) => {
        releaseSnapshot = resolve;
      });

      const snapshot = service.withReviewSnapshot(
        prisma,
        async (tx: Prisma.TransactionClient) => {
          const before = await tx.reviewRecord.findMany({
            where: {
              projectId: fixture.projectId,
              reviewType: ReviewType.CAB_REVIEW,
            },
            select: { id: true },
            orderBy: { id: 'asc' },
            take: 101,
          });
          snapshotStarted();
          await release;
          const after = await tx.reviewRecord.findMany({
            where: {
              projectId: fixture.projectId,
              reviewType: ReviewType.CAB_REVIEW,
            },
            select: { id: true },
            orderBy: { id: 'asc' },
            take: 101,
          });
          return { after, before };
        },
      );

      await started;
      await secondConnection.reviewRecord.create({
        data: {
          id: `${fixture.reviewIds[0]}-concurrent`,
          projectId: fixture.projectId,
          workflowTaskId: fixture.activeTaskId,
          reviewerId: fixture.reviewerId,
          reviewType: ReviewType.CAB_REVIEW,
          reviewPeriod: 'R27D-CONCURRENT',
          comment: 'concurrent',
        },
      });
      releaseSnapshot();
      const result = await snapshot;
      expect(result.before).toHaveLength(100);
      expect(result.after).toEqual(result.before);
      expect(
        await secondConnection.reviewRecord.count({
          where: {
            projectId: fixture.projectId,
            reviewType: ReviewType.CAB_REVIEW,
          },
        }),
      ).toBe(101);
    });

    it('proves representative bounded selection is eligible for the approved index', async () => {
      const fixture = await createFixture(ReviewType.CAB_REVIEW, { count: 100 });
      const plan = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`ANALYZE "review_records"`);
        await tx.$executeRaw(Prisma.sql`SET LOCAL enable_seqscan = off`);
        await tx.$executeRaw(Prisma.sql`SET LOCAL enable_sort = off`);
        return tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
          EXPLAIN (FORMAT JSON)
          SELECT review_record."id"
          FROM "review_records" AS review_record
          WHERE review_record."projectId" = ${fixture.projectId}
            AND review_record."reviewType" = ${ReviewType.CAB_REVIEW}::"ReviewType"
          ORDER BY review_record."id" ASC
          LIMIT ${101}
        `);
      });

      expect(JSON.stringify(plan)).toContain(INDEX_NAME);
    });
  });
}
