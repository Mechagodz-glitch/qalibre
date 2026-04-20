ALTER TABLE "ProjectQuarterAllocation"
DROP CONSTRAINT "ProjectQuarterAllocation_testerContributorId_fkey";

ALTER TABLE "ProjectQuarterAllocation"
ALTER COLUMN "testerContributorId" DROP NOT NULL;

ALTER TABLE "ProjectQuarterAllocation"
ADD CONSTRAINT "ProjectQuarterAllocation_testerContributorId_fkey"
FOREIGN KEY ("testerContributorId") REFERENCES "Contributor"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
