-- CreateEnum
CREATE TYPE "ProjectQuarter" AS ENUM ('Q1', 'Q2', 'Q3', 'Q4');

-- CreateTable
CREATE TABLE "ProjectQuarterAllocation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "quarter" "ProjectQuarter" NOT NULL,
    "testerContributorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectQuarterAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectQuarterAllocation_projectId_quarter_key" ON "ProjectQuarterAllocation"("projectId", "quarter");

-- CreateIndex
CREATE INDEX "ProjectQuarterAllocation_testerContributorId_idx" ON "ProjectQuarterAllocation"("testerContributorId");

-- AddForeignKey
ALTER TABLE "ProjectQuarterAllocation" ADD CONSTRAINT "ProjectQuarterAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectQuarterAllocation" ADD CONSTRAINT "ProjectQuarterAllocation_testerContributorId_fkey" FOREIGN KEY ("testerContributorId") REFERENCES "Contributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
