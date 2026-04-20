-- CreateEnum
CREATE TYPE "ManualExecutionSuiteSourceType" AS ENUM ('APPROVED_SUITE', 'UPLOADED_DOCUMENT');

-- AlterTable
ALTER TABLE "ManualExecutionRunSuite" ADD COLUMN     "sourceFileName" TEXT,
ADD COLUMN     "sourceType" "ManualExecutionSuiteSourceType" NOT NULL DEFAULT 'APPROVED_SUITE',
ALTER COLUMN "sourceDraftId" DROP NOT NULL,
ALTER COLUMN "sourceRunId" DROP NOT NULL,
ALTER COLUMN "sourceDraftVersion" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ManualExecutionRunSuite_sourceType_createdAt_idx" ON "ManualExecutionRunSuite"("sourceType", "createdAt");
