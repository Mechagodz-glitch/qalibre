-- AlterTable
ALTER TABLE "ManualExecutionRun"
ADD COLUMN "featureId" TEXT;

-- AlterTable
ALTER TABLE "ManualExecutionRunSuite"
ADD COLUMN "sourceFeatureId" TEXT,
ADD COLUMN "sourceFeatureName" TEXT;

-- CreateIndex
CREATE INDEX "ManualExecutionRun_featureId_createdAt_idx" ON "ManualExecutionRun"("featureId", "createdAt");

-- AddForeignKey
ALTER TABLE "ManualExecutionRun" ADD CONSTRAINT "ManualExecutionRun_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "ProjectFeature"("id") ON DELETE SET NULL ON UPDATE CASCADE;
