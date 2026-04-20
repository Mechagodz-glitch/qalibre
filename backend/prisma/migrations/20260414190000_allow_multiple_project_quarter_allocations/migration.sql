-- Remove the old one-tester-per-quarter uniqueness rule.
DROP INDEX "ProjectQuarterAllocation_projectId_quarter_key";

-- Allow multiple QA testers per project and quarter while keeping duplicates out.
CREATE UNIQUE INDEX "ProjectQuarterAllocation_projectId_quarter_testerContributorId_key"
ON "ProjectQuarterAllocation"("projectId", "quarter", "testerContributorId");
