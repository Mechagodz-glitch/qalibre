ALTER TABLE "ProjectQuarterAllocation"
ADD COLUMN "year" INTEGER;

UPDATE "ProjectQuarterAllocation"
SET "year" = 2026
WHERE "year" IS NULL;

ALTER TABLE "ProjectQuarterAllocation"
ALTER COLUMN "year" SET NOT NULL;

DROP INDEX IF EXISTS "ProjectQuarterAllocation_projectId_quarter_testerContributorId_key";

CREATE UNIQUE INDEX "ProjectQuarterAllocation_projectId_year_quarter_testerContributorId_key"
ON "ProjectQuarterAllocation"("projectId", "year", "quarter", "testerContributorId");

CREATE INDEX "ProjectQuarterAllocation_projectId_year_quarter_idx"
ON "ProjectQuarterAllocation"("projectId", "year", "quarter");
