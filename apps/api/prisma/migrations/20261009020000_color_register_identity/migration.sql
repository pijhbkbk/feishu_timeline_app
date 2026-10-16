-- CreateEnum
CREATE TYPE "ColorRegisterStatus" AS ENUM ('CANDIDATE', 'LISTED', 'PENDING_REVIEW');

-- DropForeignKey
ALTER TABLE "colors" DROP CONSTRAINT "colors_projectId_fkey";

-- DropIndex
DROP INDEX "colors_projectId_name_key";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "primaryColorId" TEXT;

-- AlterTable
ALTER TABLE "colors" ADD COLUMN     "hueStandardId" TEXT,
ADD COLUMN     "manufacturer" VARCHAR(200),
ADD COLUMN     "paintType" VARCHAR(200),
ADD COLUMN     "productionBaseId" TEXT,
ADD COLUMN     "registerMonth" VARCHAR(7),
ADD COLUMN     "registerNote" VARCHAR(4000),
ADD COLUMN     "registerRevision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "registerStatus" "ColorRegisterStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
ADD COLUMN     "registeredAt" TIMESTAMP(3),
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "color_versions" ADD COLUMN     "boardCode" VARCHAR(128),
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "sourceReference" JSONB;

-- AlterTable
ALTER TABLE "review_records" ADD COLUMN     "standardVersionId" TEXT;

-- CreateTable
CREATE TABLE "production_bases" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,

    CONSTRAINT "production_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hue_standards" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "basis" VARCHAR(1000) NOT NULL,

    CONSTRAINT "hue_standards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "color_import_batches" (
    "id" TEXT NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "objectKey" VARCHAR(512) NOT NULL,
    "parserVersion" VARCHAR(100) NOT NULL,
    "importedById" TEXT NOT NULL,
    "sheetCount" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "colorCount" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "color_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "color_import_rows" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sheetName" VARCHAR(200) NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "kind" VARCHAR(100) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "rawCells" JSONB NOT NULL,
    "normalization" JSONB,
    "colorId" TEXT,

    CONSTRAINT "color_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "color_production_facts" (
    "id" TEXT NOT NULL,
    "colorId" TEXT NOT NULL,
    "productionBaseId" TEXT NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "metricScope" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(18,3),
    "sourceRowId" TEXT,
    "sourceCell" VARCHAR(32),
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "color_production_facts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "production_bases_code_key" ON "production_bases"("code");

-- CreateIndex
CREATE UNIQUE INDEX "color_import_batches_sha256_key" ON "color_import_batches"("sha256");

-- CreateIndex
CREATE INDEX "color_import_rows_colorId_idx" ON "color_import_rows"("colorId");

-- CreateIndex
CREATE INDEX "color_import_rows_batchId_status_sheetName_rowNumber_idx" ON "color_import_rows"("batchId", "status", "sheetName", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "color_import_rows_batchId_sheetName_rowNumber_key" ON "color_import_rows"("batchId", "sheetName", "rowNumber");

-- CreateIndex
CREATE INDEX "color_production_facts_productionBaseId_month_metricScope_idx" ON "color_production_facts"("productionBaseId", "month", "metricScope");

-- CreateIndex
CREATE UNIQUE INDEX "color_production_facts_colorId_productionBaseId_month_metri_key" ON "color_production_facts"("colorId", "productionBaseId", "month", "metricScope");

-- CreateIndex
CREATE INDEX "projects_primaryColorId_idx" ON "projects"("primaryColorId");

-- CreateIndex
CREATE INDEX "colors_projectId_name_idx" ON "colors"("projectId", "name");

-- CreateIndex
CREATE INDEX "colors_productionBaseId_registerStatus_id_idx" ON "colors"("productionBaseId", "registerStatus", "id");

-- CreateIndex
CREATE INDEX "colors_hueStandardId_idx" ON "colors"("hueStandardId");

-- CreateIndex
CREATE INDEX "review_records_standardVersionId_idx" ON "review_records"("standardVersionId");

-- AddForeignKey
ALTER TABLE "color_import_batches" ADD CONSTRAINT "color_import_batches_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "color_import_rows" ADD CONSTRAINT "color_import_rows_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "color_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "color_import_rows" ADD CONSTRAINT "color_import_rows_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "colors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "color_production_facts" ADD CONSTRAINT "color_production_facts_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "colors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "color_production_facts" ADD CONSTRAINT "color_production_facts_productionBaseId_fkey" FOREIGN KEY ("productionBaseId") REFERENCES "production_bases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "color_production_facts" ADD CONSTRAINT "color_production_facts_sourceRowId_fkey" FOREIGN KEY ("sourceRowId") REFERENCES "color_import_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_primaryColorId_fkey" FOREIGN KEY ("primaryColorId") REFERENCES "colors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colors" ADD CONSTRAINT "colors_productionBaseId_fkey" FOREIGN KEY ("productionBaseId") REFERENCES "production_bases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colors" ADD CONSTRAINT "colors_hueStandardId_fkey" FOREIGN KEY ("hueStandardId") REFERENCES "hue_standards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colors" ADD CONSTRAINT "colors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_standardVersionId_fkey" FOREIGN KEY ("standardVersionId") REFERENCES "color_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
