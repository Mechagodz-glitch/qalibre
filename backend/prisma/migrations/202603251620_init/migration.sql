-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DatasetItemType" AS ENUM ('COMPONENT_CATALOGUE', 'RULE_PACK', 'FEATURE_TYPE', 'TEST_TAXONOMY', 'SCENARIO_TEMPLATE', 'PRIORITY_MAPPING', 'SEVERITY_MAPPING', 'SYNONYM_ALIAS');

-- CreateEnum
CREATE TYPE "DatasetStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RefinementMode" AS ENUM ('NORMALIZE', 'EXPAND', 'DEDUPLICATE', 'CLASSIFY', 'STRENGTHEN', 'GENERATE_STARTER_DATASET');

-- CreateEnum
CREATE TYPE "RefinementRunStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DraftReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('MANUAL_CREATE', 'MANUAL_UPDATE', 'AI_APPROVED', 'AI_REJECTED', 'ARCHIVED', 'RESTORED', 'CLONED', 'SEEDED');

-- CreateTable
CREATE TABLE "DatasetItem" (
    "id" TEXT NOT NULL,
    "itemType" "DatasetItemType" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "DatasetStatus" NOT NULL DEFAULT 'DRAFT',
    "archivedFromStatus" "DatasetStatus",
    "version" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatasetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefinementRun" (
    "id" TEXT NOT NULL,
    "itemType" "DatasetItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "mode" "RefinementMode" NOT NULL,
    "model" TEXT NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "rawResponse" JSONB,
    "parsedResponse" JSONB,
    "status" "RefinementRunStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefinementRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefinementDraft" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "itemType" "DatasetItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "originalData" JSONB NOT NULL,
    "refinedData" JSONB NOT NULL,
    "diffSummary" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reviewStatus" "DraftReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefinementDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalHistory" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemType" "DatasetItemType" NOT NULL,
    "versionBefore" INTEGER NOT NULL,
    "versionAfter" INTEGER NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "actor" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetVersion" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemType" "DatasetItemType" NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "DatasetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DatasetItem_itemType_status_title_idx" ON "DatasetItem"("itemType", "status", "title");

-- CreateIndex
CREATE INDEX "DatasetItem_title_idx" ON "DatasetItem"("title");

-- CreateIndex
CREATE INDEX "DatasetItem_updatedAt_idx" ON "DatasetItem"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetItem_itemType_slug_key" ON "DatasetItem"("itemType", "slug");

-- CreateIndex
CREATE INDEX "RefinementRun_itemType_status_createdAt_idx" ON "RefinementRun"("itemType", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RefinementRun_itemId_createdAt_idx" ON "RefinementRun"("itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefinementDraft_runId_key" ON "RefinementDraft"("runId");

-- CreateIndex
CREATE INDEX "RefinementDraft_itemType_reviewStatus_createdAt_idx" ON "RefinementDraft"("itemType", "reviewStatus", "createdAt");

-- CreateIndex
CREATE INDEX "RefinementDraft_itemId_createdAt_idx" ON "RefinementDraft"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalHistory_itemType_createdAt_idx" ON "ApprovalHistory"("itemType", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalHistory_itemId_createdAt_idx" ON "ApprovalHistory"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "DatasetVersion_itemType_createdAt_idx" ON "DatasetVersion"("itemType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetVersion_itemId_version_key" ON "DatasetVersion"("itemId", "version");

-- AddForeignKey
ALTER TABLE "RefinementRun" ADD CONSTRAINT "RefinementRun_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DatasetItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementDraft" ADD CONSTRAINT "RefinementDraft_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RefinementRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementDraft" ADD CONSTRAINT "RefinementDraft_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DatasetItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalHistory" ADD CONSTRAINT "ApprovalHistory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DatasetItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DatasetItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

