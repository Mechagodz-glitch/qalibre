-- CreateEnum
CREATE TYPE "ManualExecutionRunStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ManualExecutionCaseStatus" AS ENUM ('UNTESTED', 'PASSED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "ManualExecutionRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "moduleId" TEXT,
    "pageId" TEXT,
    "environment" TEXT,
    "buildVersion" TEXT,
    "assignedTester" TEXT,
    "notes" TEXT,
    "status" "ManualExecutionRunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdBy" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualExecutionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualExecutionRunSuite" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceDraftId" TEXT NOT NULL,
    "sourceRunId" TEXT NOT NULL,
    "sourceDraftVersion" INTEGER NOT NULL,
    "suiteTitle" TEXT NOT NULL,
    "suiteSummary" TEXT,
    "suitePath" TEXT,
    "sourceProjectId" TEXT,
    "sourceProjectName" TEXT,
    "sourceModuleId" TEXT,
    "sourceModuleName" TEXT,
    "sourcePageId" TEXT,
    "sourcePageName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "caseCount" INTEGER NOT NULL DEFAULT 0,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualExecutionRunSuite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualExecutionCaseResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "runSuiteId" TEXT NOT NULL,
    "sourceCaseId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "automationCandidate" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceReferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "caseSnapshot" JSONB NOT NULL,
    "status" "ManualExecutionCaseStatus" NOT NULL DEFAULT 'UNTESTED',
    "comment" TEXT,
    "defectLink" TEXT,
    "executedAt" TIMESTAMP(3),
    "executedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualExecutionCaseResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualExecutionRun_projectId_createdAt_idx" ON "ManualExecutionRun"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ManualExecutionRun_status_createdAt_idx" ON "ManualExecutionRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ManualExecutionRun_projectId_status_createdAt_idx" ON "ManualExecutionRun"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ManualExecutionRunSuite_runId_orderIndex_idx" ON "ManualExecutionRunSuite"("runId", "orderIndex");

-- CreateIndex
CREATE INDEX "ManualExecutionRunSuite_sourceDraftId_createdAt_idx" ON "ManualExecutionRunSuite"("sourceDraftId", "createdAt");

-- CreateIndex
CREATE INDEX "ManualExecutionCaseResult_runId_status_orderIndex_idx" ON "ManualExecutionCaseResult"("runId", "status", "orderIndex");

-- CreateIndex
CREATE INDEX "ManualExecutionCaseResult_runSuiteId_orderIndex_idx" ON "ManualExecutionCaseResult"("runSuiteId", "orderIndex");

-- CreateIndex
CREATE INDEX "ManualExecutionCaseResult_feature_status_idx" ON "ManualExecutionCaseResult"("feature", "status");

-- CreateIndex
CREATE INDEX "ManualExecutionCaseResult_severity_status_idx" ON "ManualExecutionCaseResult"("severity", "status");

-- AddForeignKey
ALTER TABLE "ManualExecutionRun" ADD CONSTRAINT "ManualExecutionRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualExecutionRun" ADD CONSTRAINT "ManualExecutionRun_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "ProjectModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualExecutionRun" ADD CONSTRAINT "ManualExecutionRun_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ProjectPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualExecutionRunSuite" ADD CONSTRAINT "ManualExecutionRunSuite_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ManualExecutionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualExecutionCaseResult" ADD CONSTRAINT "ManualExecutionCaseResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ManualExecutionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualExecutionCaseResult" ADD CONSTRAINT "ManualExecutionCaseResult_runSuiteId_fkey" FOREIGN KEY ("runSuiteId") REFERENCES "ManualExecutionRunSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
