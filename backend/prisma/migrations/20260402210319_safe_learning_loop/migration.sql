-- CreateEnum
CREATE TYPE "TestCaseFeedbackAction" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TestCaseFeedbackReason" AS ENUM ('MISSING_COVERAGE', 'WRONG_LOGIC', 'WRONG_ASSUMPTION', 'DUPLICATE', 'POOR_WORDING', 'WRONG_PRIORITY_OR_SEVERITY', 'NOT_APPLICABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "KnowledgeScopeLevel" AS ENUM ('PROJECT', 'MODULE', 'PAGE');

-- CreateEnum
CREATE TYPE "KnowledgeSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "KnowledgeSuggestionType" AS ENUM ('TESTCASE_PROMOTION', 'AUTO_STRENGTHENING');

-- CreateEnum
CREATE TYPE "KnowledgeSuggestionTargetType" AS ENUM ('PROJECT_MEMORY', 'COMPONENT_CATALOGUE', 'SCENARIO_TEMPLATE', 'RULE_PACK');

-- AlterEnum
ALTER TYPE "DatasetItemType" ADD VALUE 'PROJECT_MEMORY';

-- AlterTable
ALTER TABLE "DatasetItem" ADD COLUMN     "moduleId" TEXT,
ADD COLUMN     "pageId" TEXT,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "scopeLevel" "KnowledgeScopeLevel";

-- AlterTable
ALTER TABLE "TestCaseDraft" ADD COLUMN     "coverageAnalysis" JSONB;

-- CreateTable
CREATE TABLE "TestCaseFeedback" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "draftVersion" INTEGER NOT NULL,
    "action" "TestCaseFeedbackAction" NOT NULL,
    "reasonCode" "TestCaseFeedbackReason",
    "reasonDetails" TEXT,
    "replacementSummary" TEXT,
    "caseTitle" TEXT NOT NULL,
    "caseSnapshot" JSONB NOT NULL,
    "reviewerNotes" TEXT,
    "usedForLearning" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestCaseFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSuggestion" (
    "id" TEXT NOT NULL,
    "type" "KnowledgeSuggestionType" NOT NULL,
    "targetType" "KnowledgeSuggestionTargetType" NOT NULL,
    "triggerType" TEXT NOT NULL,
    "status" "KnowledgeSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "rationale" TEXT,
    "evidence" JSONB NOT NULL,
    "proposedPayload" JSONB NOT NULL,
    "sourceDraftId" TEXT,
    "sourceRunId" TEXT,
    "sourceCaseId" TEXT,
    "targetDatasetItemId" TEXT,
    "projectId" TEXT,
    "moduleId" TEXT,
    "pageId" TEXT,
    "scopeLevel" "KnowledgeScopeLevel",
    "createdBy" TEXT NOT NULL,
    "reviewerNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "appliedAt" TIMESTAMP(3),
    "appliedBy" TEXT,
    "appliedDatasetItemId" TEXT,
    "appliedRefinementRunId" TEXT,
    "appliedRefinementDraftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TestCaseFeedback_draftId_caseId_createdAt_idx" ON "TestCaseFeedback"("draftId", "caseId", "createdAt");

-- CreateIndex
CREATE INDEX "TestCaseFeedback_runId_createdAt_idx" ON "TestCaseFeedback"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "TestCaseFeedback_reasonCode_createdAt_idx" ON "TestCaseFeedback"("reasonCode", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeSuggestion_status_createdAt_idx" ON "KnowledgeSuggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeSuggestion_targetType_status_createdAt_idx" ON "KnowledgeSuggestion"("targetType", "status", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeSuggestion_fingerprint_status_idx" ON "KnowledgeSuggestion"("fingerprint", "status");

-- CreateIndex
CREATE INDEX "KnowledgeSuggestion_projectId_moduleId_pageId_idx" ON "KnowledgeSuggestion"("projectId", "moduleId", "pageId");

-- CreateIndex
CREATE INDEX "DatasetItem_projectId_moduleId_pageId_idx" ON "DatasetItem"("projectId", "moduleId", "pageId");

-- CreateIndex
CREATE INDEX "DatasetItem_itemType_status_projectId_moduleId_pageId_idx" ON "DatasetItem"("itemType", "status", "projectId", "moduleId", "pageId");

-- AddForeignKey
ALTER TABLE "DatasetItem" ADD CONSTRAINT "DatasetItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetItem" ADD CONSTRAINT "DatasetItem_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "ProjectModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetItem" ADD CONSTRAINT "DatasetItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ProjectPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseFeedback" ADD CONSTRAINT "TestCaseFeedback_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "TestCaseDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseFeedback" ADD CONSTRAINT "TestCaseFeedback_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TestGenerationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSuggestion" ADD CONSTRAINT "KnowledgeSuggestion_sourceDraftId_fkey" FOREIGN KEY ("sourceDraftId") REFERENCES "TestCaseDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSuggestion" ADD CONSTRAINT "KnowledgeSuggestion_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "TestGenerationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSuggestion" ADD CONSTRAINT "KnowledgeSuggestion_targetDatasetItemId_fkey" FOREIGN KEY ("targetDatasetItemId") REFERENCES "DatasetItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSuggestion" ADD CONSTRAINT "KnowledgeSuggestion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSuggestion" ADD CONSTRAINT "KnowledgeSuggestion_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "ProjectModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSuggestion" ADD CONSTRAINT "KnowledgeSuggestion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ProjectPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSuggestion" ADD CONSTRAINT "KnowledgeSuggestion_appliedDatasetItemId_fkey" FOREIGN KEY ("appliedDatasetItemId") REFERENCES "DatasetItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
