-- CreateEnum
CREATE TYPE "TestGenerationMode" AS ENUM ('PROCESS_ALPHA', 'PROCESS_BETA', 'MANUAL_RECOVERY');

-- CreateEnum
CREATE TYPE "TestGenerationRunStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "TestGenerationRun" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mode" "TestGenerationMode" NOT NULL,
    "model" TEXT NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "sourceSummary" JSONB NOT NULL,
    "rawResponse" JSONB,
    "parsedResponse" JSONB,
    "status" "TestGenerationRunStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestGenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCaseDraft" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "inferredContext" JSONB NOT NULL,
    "generatedCases" JSONB NOT NULL,
    "coverageSummary" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reviewStatus" "DraftReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerNotes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCaseDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCaseDraftVersion" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "TestCaseDraftVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TestGenerationRun_mode_status_createdAt_idx" ON "TestGenerationRun"("mode", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TestGenerationRun_createdAt_idx" ON "TestGenerationRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TestCaseDraft_runId_key" ON "TestCaseDraft"("runId");

-- CreateIndex
CREATE INDEX "TestCaseDraft_reviewStatus_createdAt_idx" ON "TestCaseDraft"("reviewStatus", "createdAt");

-- CreateIndex
CREATE INDEX "TestCaseDraft_createdAt_idx" ON "TestCaseDraft"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TestCaseDraftVersion_draftId_version_key" ON "TestCaseDraftVersion"("draftId", "version");

-- CreateIndex
CREATE INDEX "TestCaseDraftVersion_createdAt_idx" ON "TestCaseDraftVersion"("createdAt");

-- AddForeignKey
ALTER TABLE "TestCaseDraft" ADD CONSTRAINT "TestCaseDraft_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TestGenerationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseDraftVersion" ADD CONSTRAINT "TestCaseDraftVersion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "TestCaseDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
