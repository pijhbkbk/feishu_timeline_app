CREATE TYPE "StandardBoardStatus_new" AS ENUM ('DRAFT', 'CREATED', 'ISSUED', 'ARCHIVED');

ALTER TABLE "standard_boards"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "StandardBoardStatus_new"
  USING (
    CASE
      WHEN "status" = 'PRODUCED' THEN 'CREATED'::"StandardBoardStatus_new"
      WHEN "status" IN ('DISTRIBUTING', 'DISTRIBUTED') THEN 'ISSUED'::"StandardBoardStatus_new"
      WHEN "status" = 'ARCHIVED' THEN 'ARCHIVED'::"StandardBoardStatus_new"
      ELSE 'DRAFT'::"StandardBoardStatus_new"
    END
  );

ALTER TABLE "standard_boards"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT',
  ADD COLUMN "basedOnSampleId" TEXT,
  ADD COLUMN "issuedById" TEXT,
  ADD COLUMN "versionNo" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "recipientName" TEXT,
  ADD COLUMN "recipientDept" TEXT;

DROP TYPE "StandardBoardStatus";
ALTER TYPE "StandardBoardStatus_new" RENAME TO "StandardBoardStatus";

DROP INDEX "standard_boards_projectId_boardNo_key";
CREATE UNIQUE INDEX "standard_boards_projectId_boardNo_versionNo_key"
  ON "standard_boards"("projectId", "boardNo", "versionNo");
CREATE INDEX "standard_boards_projectId_boardNo_isCurrent_idx"
  ON "standard_boards"("projectId", "boardNo", "isCurrent");
CREATE INDEX "standard_boards_basedOnSampleId_idx"
  ON "standard_boards"("basedOnSampleId");
CREATE UNIQUE INDEX "standard_boards_project_current_unique"
  ON "standard_boards"("projectId")
  WHERE "isCurrent" = true;

ALTER TABLE "standard_boards"
  ADD CONSTRAINT "standard_boards_basedOnSampleId_fkey"
  FOREIGN KEY ("basedOnSampleId") REFERENCES "samples"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "standard_boards"
  ADD CONSTRAINT "standard_boards_issuedById_fkey"
  FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "board_distribution_records"
  ADD COLUMN "receiverName" TEXT,
  ADD COLUMN "receiverDept" TEXT;

CREATE TYPE "ColorBoardDetailUpdateStatus" AS ENUM ('PENDING', 'UPDATED');

CREATE TABLE "color_board_detail_updates" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "standardBoardId" TEXT NOT NULL,
  "updatedById" TEXT,
  "updateStatus" "ColorBoardDetailUpdateStatus" NOT NULL DEFAULT 'PENDING',
  "detailUpdatedAt" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "color_board_detail_updates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "color_board_detail_updates_projectId_detailUpdatedAt_idx"
  ON "color_board_detail_updates"("projectId", "detailUpdatedAt");
CREATE INDEX "color_board_detail_updates_standardBoardId_detailUpdatedAt_idx"
  ON "color_board_detail_updates"("standardBoardId", "detailUpdatedAt");
CREATE INDEX "color_board_detail_updates_updatedById_detailUpdatedAt_idx"
  ON "color_board_detail_updates"("updatedById", "detailUpdatedAt");

ALTER TABLE "color_board_detail_updates"
  ADD CONSTRAINT "color_board_detail_updates_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "color_board_detail_updates"
  ADD CONSTRAINT "color_board_detail_updates_standardBoardId_fkey"
  FOREIGN KEY ("standardBoardId") REFERENCES "standard_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "color_board_detail_updates"
  ADD CONSTRAINT "color_board_detail_updates_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
