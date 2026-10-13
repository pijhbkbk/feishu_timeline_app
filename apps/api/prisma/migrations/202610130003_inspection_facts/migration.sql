-- CreateEnum
CREATE TYPE "InspectionObjectKind" AS ENUM ('VEHICLE', 'SAMPLE');

-- CreateEnum
CREATE TYPE "InspectionConclusion" AS ENUM ('PENDING', 'PASS', 'FAIL');

-- CreateTable
CREATE TABLE "inspection_activities" (
    "id" TEXT NOT NULL,
    "activityDate" DATE NOT NULL,
    "productionBaseId" TEXT NOT NULL,
    "batchLabel" VARCHAR(200),
    "note" VARCHAR(4000),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "projectId" TEXT,
    "recurringTaskId" TEXT,
    "reviewRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_participants" (
    "activityId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "inspection_participants_pkey" PRIMARY KEY ("activityId","personId")
);

-- CreateTable
CREATE TABLE "inspection_objects" (
    "id" TEXT NOT NULL,
    "objectKind" "InspectionObjectKind" NOT NULL,
    "objectCode" VARCHAR(128) NOT NULL,
    "vin" VARCHAR(32),
    "vehicleModel" VARCHAR(200),
    "vehicleClass" VARCHAR(100),
    "sampleId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_occurrences" (
    "originalSource" JSONB,
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "colorId" TEXT NOT NULL,
    "overallConclusion" "InspectionConclusion" NOT NULL DEFAULT 'PENDING',
    "visualConclusion" VARCHAR(2000),
    "handlingOpinion" VARCHAR(2000),
    "note" VARCHAR(4000),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_measurements" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "pointLabel" VARCHAR(200) NOT NULL,
    "groupLabel" VARCHAR(200) NOT NULL,
    "standardVersionId" TEXT,
    "instrumentLabel" VARCHAR(200),
    "methodLabel" VARCHAR(200),
    "originalCriteria" VARCHAR(2000),
    "conclusion" "InspectionConclusion" NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "inspection_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_readings" (
    "id" TEXT NOT NULL,
    "measurementId" TEXT NOT NULL,
    "angleLabel" VARCHAR(100) NOT NULL,
    "lValue" DECIMAL(14,6),
    "aValue" DECIMAL(14,6),
    "bValue" DECIMAL(14,6),
    "deltaE" DECIMAL(14,6),
    "note" VARCHAR(2000),
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "inspection_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_defects" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "measurementId" TEXT,
    "description" VARCHAR(2000) NOT NULL,
    "severityLabel" VARCHAR(100),
    "handlingOpinion" VARCHAR(2000),
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "inspection_defects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inspection_activities_reviewRecordId_key" ON "inspection_activities"("reviewRecordId");

-- CreateIndex
CREATE INDEX "inspection_activities_productionBaseId_activityDate_id_idx" ON "inspection_activities"("productionBaseId", "activityDate", "id");

-- CreateIndex
CREATE INDEX "inspection_activities_projectId_recurringTaskId_idx" ON "inspection_activities"("projectId", "recurringTaskId");

-- CreateIndex
CREATE INDEX "inspection_participants_personId_idx" ON "inspection_participants"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_objects_objectCode_key" ON "inspection_objects"("objectCode");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_objects_vin_key" ON "inspection_objects"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_objects_sampleId_key" ON "inspection_objects"("sampleId");

-- CreateIndex
CREATE INDEX "inspection_objects_objectKind_id_idx" ON "inspection_objects"("objectKind", "id");

-- CreateIndex
CREATE INDEX "inspection_occurrences_colorId_activityId_idx" ON "inspection_occurrences"("colorId", "activityId");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_occurrences_activityId_objectId_key" ON "inspection_occurrences"("activityId", "objectId");

-- CreateIndex
CREATE INDEX "inspection_measurements_standardVersionId_idx" ON "inspection_measurements"("standardVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_measurements_occurrenceId_pointLabel_groupLabel_key" ON "inspection_measurements"("occurrenceId", "pointLabel", "groupLabel");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_readings_measurementId_angleLabel_key" ON "inspection_readings"("measurementId", "angleLabel");

-- CreateIndex
CREATE INDEX "inspection_defects_occurrenceId_idx" ON "inspection_defects"("occurrenceId");

-- CreateIndex
CREATE INDEX "inspection_defects_measurementId_idx" ON "inspection_defects"("measurementId");

-- AddForeignKey
ALTER TABLE "inspection_activities" ADD CONSTRAINT "inspection_activities_productionBaseId_fkey" FOREIGN KEY ("productionBaseId") REFERENCES "production_bases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_activities" ADD CONSTRAINT "inspection_activities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_activities" ADD CONSTRAINT "inspection_activities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_activities" ADD CONSTRAINT "inspection_activities_recurringTaskId_fkey" FOREIGN KEY ("recurringTaskId") REFERENCES "recurring_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_activities" ADD CONSTRAINT "inspection_activities_reviewRecordId_fkey" FOREIGN KEY ("reviewRecordId") REFERENCES "review_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_participants" ADD CONSTRAINT "inspection_participants_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "inspection_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_participants" ADD CONSTRAINT "inspection_participants_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_objects" ADD CONSTRAINT "inspection_objects_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "samples"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_occurrences" ADD CONSTRAINT "inspection_occurrences_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "inspection_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_occurrences" ADD CONSTRAINT "inspection_occurrences_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "inspection_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_occurrences" ADD CONSTRAINT "inspection_occurrences_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "colors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_measurements" ADD CONSTRAINT "inspection_measurements_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "inspection_occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_measurements" ADD CONSTRAINT "inspection_measurements_standardVersionId_fkey" FOREIGN KEY ("standardVersionId") REFERENCES "color_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_readings" ADD CONSTRAINT "inspection_readings_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "inspection_measurements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_defects" ADD CONSTRAINT "inspection_defects_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "inspection_occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_defects" ADD CONSTRAINT "inspection_defects_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "inspection_measurements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
